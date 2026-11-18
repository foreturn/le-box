package dev.lebox.client

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.IpPrefix
import android.net.ProxyInfo
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import io.nekohasekai.libbox.CommandClient
import io.nekohasekai.libbox.CommandClientHandler
import io.nekohasekai.libbox.CommandClientOptions
import io.nekohasekai.libbox.CommandServer
import io.nekohasekai.libbox.CommandServerHandler
import io.nekohasekai.libbox.ConnectionEvents
import io.nekohasekai.libbox.Connections
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.LogIterator
import io.nekohasekai.libbox.OutboundGroupItemIterator
import io.nekohasekai.libbox.OutboundGroupIterator
import io.nekohasekai.libbox.OverrideOptions
import io.nekohasekai.libbox.StatusMessage
import io.nekohasekai.libbox.StringIterator
import io.nekohasekai.libbox.SystemProxyStatus
import io.nekohasekai.libbox.TunOptions
import java.net.InetAddress
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class LeBoxVpnService : VpnService() {

    companion object {
        const val ACTION_START = "dev.lebox.client.ACTION_START"
        const val ACTION_STOP = "dev.lebox.client.ACTION_STOP"
        const val EXTRA_CONFIG_JSON = "configJson"
        private const val CHANNEL_ID = "lebox_vpn"
        private const val NOTIFICATION_ID = 1001
    }

    private val worker = Executors.newSingleThreadExecutor()
    private var commandServer: CommandServer? = null
    private var commandClient: CommandClient? = null
    private var tunPfd: ParcelFileDescriptor? = null
    private val connectionsState: Connections by lazy { Libbox.newConnections() }
    private var lastConnections: List<Map<String, Any?>> = emptyList()

    override fun onCreate() {
        super.onCreate()
        VpnBridgeState.ensureLibboxSetup(this)
        VpnBridgeState.activeService = this
        ensureNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                worker.execute { stopCore(shouldStopSelf = true) }
            }
            ACTION_START -> {
                val configJson = intent.getStringExtra(EXTRA_CONFIG_JSON).orEmpty()
                startForegroundNotification()
                worker.execute { startCore(configJson) }
            }
        }
        return START_NOT_STICKY
    }

    override fun onRevoke() {
        worker.execute { stopCore(shouldStopSelf = true) }
        super.onRevoke()
    }

    override fun onDestroy() {
        worker.execute { stopCore(shouldStopSelf = false) }
        if (VpnBridgeState.activeService === this) {
            VpnBridgeState.activeService = null
        }
        worker.shutdown()
        super.onDestroy()
    }

    fun selectOutbound(tag: String): Boolean {
        val client = commandClient ?: return false
        return runCatching {
            client.selectOutbound("proxy", tag)
            true
        }.getOrDefault(false)
    }

    fun testOutboundDelay(tag: String, timeoutMs: Int): Int {
        val client = commandClient ?: throw IllegalStateException("VPN 核心未运行")
        val latch = CountDownLatch(1)
        var measured = -1
        val cb: (Int) -> Unit = { delay ->
            measured = delay
            latch.countDown()
        }
        VpnBridgeState.registerDelayWaiter(tag, cb)
        try {
            client.urlTest(tag)
            val ok = latch.await(timeoutMs.toLong().coerceIn(1000L, 15000L), TimeUnit.MILLISECONDS)
            if (ok && measured > 0) {
                return measured
            }
            val cached = VpnBridgeState.lastDelay(tag)
            if (cached != null && cached > 0) {
                return cached
            }
            throw IllegalStateException("节点测速超时或不可达")
        } finally {
            VpnBridgeState.unregisterDelayWaiter(tag, cb)
        }
    }

    fun establishTun(options: TunOptions): Int {
        if (prepare(this) != null) {
            throw SecurityException("android: missing VPN permission")
        }
        val builder = Builder()
            .setSession("LeBox")
            .setMtu(options.mtu)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setMetered(false)
        }

        val inet4 = options.inet4Address
        while (inet4.hasNext()) {
            val prefix = inet4.next()
            builder.addAddress(prefix.address(), prefix.prefix())
        }
        val inet6 = options.inet6Address
        while (inet6.hasNext()) {
            val prefix = inet6.next()
            builder.addAddress(prefix.address(), prefix.prefix())
        }

        if (options.autoRoute) {
            val dnsMode = options.dnsMode?.value
            if (dnsMode != Libbox.DNSModeDisabled) {
                val dnsServers = options.dnsServerAddress
                while (dnsServers.hasNext()) {
                    val dns = dnsServers.next()
                    if (dns.isNotBlank()) {
                        builder.addDnsServer(dns)
                    }
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val r4 = options.inet4RouteAddress
                if (r4.hasNext()) {
                    while (r4.hasNext()) {
                        val p = r4.next()
                        builder.addRoute(IpPrefix(InetAddress.getByName(p.address()), p.prefix()))
                    }
                } else if (options.inet4Address.hasNext()) {
                    builder.addRoute("0.0.0.0", 0)
                }

                val r6 = options.inet6RouteAddress
                if (r6.hasNext()) {
                    while (r6.hasNext()) {
                        val p = r6.next()
                        builder.addRoute(IpPrefix(InetAddress.getByName(p.address()), p.prefix()))
                    }
                } else if (options.inet6Address.hasNext()) {
                    builder.addRoute("::", 0)
                }

                val ex4 = options.inet4RouteExcludeAddress
                while (ex4.hasNext()) {
                    val p = ex4.next()
                    builder.excludeRoute(IpPrefix(InetAddress.getByName(p.address()), p.prefix()))
                }
                val ex6 = options.inet6RouteExcludeAddress
                while (ex6.hasNext()) {
                    val p = ex6.next()
                    builder.excludeRoute(IpPrefix(InetAddress.getByName(p.address()), p.prefix()))
                }
            } else {
                val r4 = options.inet4RouteRange
                if (r4.hasNext()) {
                    while (r4.hasNext()) {
                        val p = r4.next()
                        builder.addRoute(p.address(), p.prefix())
                    }
                } else if (options.inet4Address.hasNext()) {
                    builder.addRoute("0.0.0.0", 0)
                }

                val r6 = options.inet6RouteRange
                if (r6.hasNext()) {
                    while (r6.hasNext()) {
                        val p = r6.next()
                        builder.addRoute(p.address(), p.prefix())
                    }
                } else if (options.inet6Address.hasNext()) {
                    builder.addRoute("::", 0)
                }
            }

            val includePackages = options.includePackage
            while (includePackages.hasNext()) {
                val pkg = includePackages.next()
                if (pkg.isNotBlank()) {
                    runCatching { builder.addAllowedApplication(pkg) }
                }
            }
            val excludePackages = options.excludePackage
            while (excludePackages.hasNext()) {
                val pkg = excludePackages.next()
                if (pkg.isNotBlank()) {
                    runCatching { builder.addDisallowedApplication(pkg) }
                }
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && options.isHTTPProxyEnabled) {
            val bypass = ArrayList<String>()
            val iter = options.httpProxyBypassDomain
            while (iter.hasNext()) {
                bypass.add(iter.next())
            }
            builder.setHttpProxy(
                ProxyInfo.buildDirectProxy(
                    options.httpProxyServer,
                    options.httpProxyServerPort,
                    bypass,
                ),
            )
        }

        val pfd = builder.establish() ?: throw IllegalStateException("VpnService.Builder.establish() returned null")
        tunPfd?.let { prev -> runCatching { prev.close() } }
        tunPfd = pfd
        return pfd.fd
    }

    private fun startCore(configJson: String) {
        if (configJson.isBlank()) {
            val msg = "VPN 启动失败: 配置内容为空"
            VpnBridgeState.updateState("error", msg)
            VpnBridgeState.resolvePendingStart(ok = false, error = msg)
            stopSelfCleanly()
            return
        }

        stopCore(shouldStopSelf = false)
        VpnBridgeState.updateState("starting", null)

        try {
            val platform = LibboxPlatform(this, this)
            val serverHandler = object : CommandServerHandler {
                override fun serviceStop() {
                    worker.execute { stopCore(shouldStopSelf = true) }
                }

                override fun serviceReload() {
                    VpnBridgeState.emitLog("info", "sing-box 请求重载服务")
                }

                override fun getSystemProxyStatus(): SystemProxyStatus {
                    return SystemProxyStatus().apply {
                        available = false
                        enabled = false
                    }
                }

                override fun setSystemProxyEnabled(enabled: Boolean) {}

                override fun triggerNativeCrash() {}

                override fun writeDebugMessage(message: String?) {
                    if (!message.isNullOrBlank()) {
                        VpnBridgeState.emitLog("debug", message)
                    }
                }

                override fun connectSSHAgent(): Int = -1
            }

            val server = Libbox.newCommandServer(serverHandler, platform)
            server.start()
            commandServer = server

            val overrideOptions = OverrideOptions().apply {
                autoRedirect = false
            }
            server.startOrReloadService(configJson, overrideOptions)

            startCommandClient()

            val ver = runCatching { Libbox.version() }.getOrDefault("libbox")
            VpnBridgeState.updateState("running", null)
            VpnBridgeState.emitLog("info", "Android libbox 核心已启动 (v$ver)")
            VpnBridgeState.resolvePendingStart(ok = true, version = ver, error = null)
        } catch (err: Exception) {
            val msg = err.message ?: err.javaClass.simpleName
            VpnBridgeState.emitLog("error", "libbox 启动失败: $msg")
            stopCore(shouldStopSelf = false)
            VpnBridgeState.updateState("error", msg)
            VpnBridgeState.resolvePendingStart(ok = false, error = msg)
            stopSelfCleanly()
        }
    }

    private fun startCommandClient() {
        val options = CommandClientOptions().apply {
            addCommand(Libbox.CommandLog)
            addCommand(Libbox.CommandStatus)
            addCommand(Libbox.CommandConnections)
            addCommand(Libbox.CommandOutbounds)
            statusInterval = 1000L
        }
        val clientHandler = object : CommandClientHandler {
            override fun connected() {}

            override fun disconnected(message: String?) {
                if (!message.isNullOrBlank()) {
                    VpnBridgeState.emitLog("warn", "libbox 状态流断开: $message")
                }
            }

            override fun setDefaultLogLevel(level: Int) {}

            override fun clearLogs() {}

            override fun writeLogs(messageList: LogIterator?) {
                val iter = messageList ?: return
                while (iter.hasNext()) {
                    val entry = iter.next() ?: continue
                    val lvl = when (entry.level) {
                        0, 1, 2 -> "error"
                        3 -> "warn"
                        5, 6 -> "debug"
                        else -> "info"
                    }
                    VpnBridgeState.emitLog(lvl, entry.message ?: "")
                }
            }

            override fun writeStatus(message: StatusMessage?) {
                val status = message ?: return
                val statsMap = mapOf(
                    "up" to status.uplinkTotal,
                    "down" to status.downlinkTotal,
                    "connections" to status.connectionsIn + status.connectionsOut,
                    "memoryBytes" to status.memory,
                )
                VpnBridgeState.updateStats(statsMap, lastConnections)
            }

            override fun writeGroups(message: OutboundGroupIterator?) {}

            override fun writeOutbounds(message: OutboundGroupItemIterator?) {
                val iter = message ?: return
                while (iter.hasNext()) {
                    val item = iter.next() ?: continue
                    if (item.urlTestDelay > 0 && !item.tag.isNullOrBlank()) {
                        VpnBridgeState.updateOutboundDelay(item.tag, item.urlTestDelay)
                    }
                }
            }

            override fun initializeClashMode(modeList: StringIterator?, currentMode: String?) {}

            override fun updateClashMode(newMode: String?) {}

            override fun writeConnectionEvents(events: ConnectionEvents?) {
                val ev = events ?: return
                connectionsState.applyEvents(ev)
                connectionsState.filterState(Libbox.ConnectionStateActive)
                connectionsState.sortByTrafficTotal()
                val iter = connectionsState.iterator()
                val list = ArrayList<Map<String, Any?>>()
                var count = 0
                while (iter.hasNext() && count < 60) {
                    val conn = iter.next() ?: continue
                    val chains = ArrayList<String>()
                    val chainIter = conn.chain()
                    while (chainIter.hasNext()) {
                        chains.add(chainIter.next())
                    }
                    list.add(
                        mapOf(
                            "id" to (conn.id ?: ""),
                            "host" to (conn.displayDestination() ?: conn.destination ?: "-"),
                            "network" to (conn.network ?: "tcp"),
                            "rule" to (conn.rule ?: "-"),
                            "chains" to chains,
                            "upload" to conn.uplinkTotal,
                            "download" to conn.downlinkTotal,
                            "start" to conn.createdAt.toString(),
                        ),
                    )
                    count += 1
                }
                lastConnections = list
            }
        }
        val client = Libbox.newCommandClient(clientHandler, options)
        client.connect()
        commandClient = client
    }

    private fun stopCore(shouldStopSelf: Boolean) {
        val wasRunning = commandServer != null || tunPfd != null
        if (wasRunning && VpnBridgeState.currentState == "running") {
            VpnBridgeState.updateState("stopping", null)
        }
        commandClient?.let { client ->
            runCatching { client.disconnect() }
            commandClient = null
        }
        commandServer?.let { server ->
            runCatching { server.closeService() }
            runCatching { server.close() }
            commandServer = null
        }
        tunPfd?.let { pfd ->
            runCatching { pfd.close() }
            tunPfd = null
        }
        if (shouldStopSelf) {
            stopSelfCleanly()
        }
        if (VpnBridgeState.currentState != "error") {
            VpnBridgeState.updateState("stopped", null)
        }
    }

    private fun stopSelfCleanly() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java) ?: return
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.vpn_notification_channel),
                NotificationManager.IMPORTANCE_LOW,
            )
            nm.createNotificationChannel(channel)
        }
    }

    private fun startForegroundNotification() {
        val intent = Intent(this, MainActivity::class.java)
        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val pendingIntent = PendingIntent.getActivity(this, 0, intent, pendingFlags)
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        val notification = builder
            .setContentTitle(getString(R.string.vpn_notification_title))
            .setContentText(getString(R.string.vpn_notification_text))
            .setSmallIcon(android.R.drawable.stat_sys_upload_done)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }
}
