package dev.lebox.client

import android.content.Context
import android.net.ConnectivityManager
import android.net.DnsResolver
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.CancellationSignal
import android.os.Process
import android.system.OsConstants
import io.nekohasekai.libbox.BridgeOptions
import io.nekohasekai.libbox.BridgeSession
import io.nekohasekai.libbox.ConnectionOwner
import io.nekohasekai.libbox.ExchangeContext
import io.nekohasekai.libbox.InterfaceUpdateListener
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.LocalDNSTransport
import io.nekohasekai.libbox.NeighborUpdateListener
import io.nekohasekai.libbox.NetworkInterface as LibboxNetworkInterface
import io.nekohasekai.libbox.NetworkInterfaceIterator
import io.nekohasekai.libbox.Notification
import io.nekohasekai.libbox.PlatformInterface
import io.nekohasekai.libbox.PlatformUser
import io.nekohasekai.libbox.ShellSession
import io.nekohasekai.libbox.StringIterator
import io.nekohasekai.libbox.TunOptions
import io.nekohasekai.libbox.WIFIState
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.util.concurrent.Executors

class StringListIterator(private val items: List<String>) : StringIterator {
    private var index = 0
    override fun len(): Int = items.size
    override fun hasNext(): Boolean = index < items.size
    override fun next(): String = if (index < items.size) items[index++] else ""
}

class NetworkInterfaceListIterator(private val items: List<LibboxNetworkInterface>) : NetworkInterfaceIterator {
    private var index = 0
    override fun hasNext(): Boolean = index < items.size
    override fun next(): LibboxNetworkInterface = items[index++]
}

class AndroidLocalDnsTransport(
    private val connectivityManager: ConnectivityManager,
) : LocalDNSTransport {
    private val executor = Executors.newCachedThreadPool()

    override fun raw(): Boolean = false

    override fun lookup(ctx: ExchangeContext?, network: String?, domain: String?) {
        if (ctx == null || domain.isNullOrBlank()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val activeNet: Network? = connectivityManager.activeNetwork
            val qtype = when (network) {
                "ip4" -> DnsResolver.TYPE_A
                "ip6" -> DnsResolver.TYPE_AAAA
                else -> DnsResolver.TYPE_A
            }
            val signal = CancellationSignal()
            ctx.onCancel {
                signal.cancel()
                null
            }
            DnsResolver.getInstance().query(
                activeNet,
                domain,
                qtype,
                DnsResolver.FLAG_EMPTY,
                executor,
                signal,
                object : DnsResolver.Callback<List<InetAddress>> {
                    override fun onAnswer(answer: List<InetAddress>, rcode: Int) {
                        if (rcode != 0) {
                            ctx.errorCode(rcode)
                            return
                        }
                        val joined = answer.mapNotNull { it.hostAddress }.joinToString("\n")
                        ctx.success(joined)
                    }

                    override fun onError(error: DnsResolver.DnsException) {
                        ctx.errnoCode(OsConstants.EIO)
                    }
                },
            )
            return
        }

        try {
            val all = InetAddress.getAllByName(domain)
            val filtered = all.filter { addr ->
                when (network) {
                    "ip4" -> addr is Inet4Address
                    "ip6" -> addr is Inet6Address
                    else -> true
                }
            }
            ctx.success(filtered.mapNotNull { it.hostAddress }.joinToString("\n"))
        } catch (_: Exception) {
            ctx.errnoCode(OsConstants.EAI_FAIL)
        }
    }

    override fun exchange(ctx: ExchangeContext?, message: ByteArray?) {
        throw UnsupportedOperationException("raw DNS exchange is disabled")
    }
}

class LibboxPlatform(
    private val context: Context,
    private val vpnService: LeBoxVpnService,
) : PlatformInterface {

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val dnsTransport = AndroidLocalDnsTransport(connectivityManager)

    @Volatile
    private var defaultCallback: ConnectivityManager.NetworkCallback? = null

    override fun localDNSTransport(): LocalDNSTransport = dnsTransport

    override fun usePlatformAutoDetectInterfaceControl(): Boolean = true

    override fun autoDetectInterfaceControl(fd: Int) {
        if (!vpnService.protect(fd)) {
            throw IllegalStateException("VpnService.protect($fd) failed")
        }
    }

    override fun openTun(options: TunOptions?): Int {
        val opts = options ?: throw IllegalArgumentException("TunOptions is null")
        return vpnService.establishTun(opts)
    }

    override fun findConnectionOwner(
        ipProtocol: Int,
        sourceAddress: String?,
        sourcePort: Int,
        destinationAddress: String?,
        destinationPort: Int,
    ): ConnectionOwner {
        val owner = ConnectionOwner()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            !sourceAddress.isNullOrBlank() &&
            !destinationAddress.isNullOrBlank()
        ) {
            val uid = connectivityManager.getConnectionOwnerUid(
                ipProtocol,
                InetSocketAddress(sourceAddress, sourcePort),
                InetSocketAddress(destinationAddress, destinationPort),
            )
            if (uid != Process.INVALID_UID) {
                owner.userId = uid
                val packages = context.packageManager.getPackagesForUid(uid)?.toList().orEmpty()
                owner.userName = packages.firstOrNull() ?: ""
                owner.setAndroidPackageNames(StringListIterator(packages))
                return owner
            }
        }
        owner.userId = Process.myUid()
        owner.userName = context.packageName
        owner.setAndroidPackageNames(StringListIterator(listOf(context.packageName)))
        return owner
    }

    override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) {
        if (listener == null) return
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
            .build()

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                notifyInterface(network, listener)
            }

            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                notifyInterface(network, listener, capabilities)
            }

            override fun onLost(network: Network) {
                val active = connectivityManager.activeNetwork
                if (active != null && active != network) {
                    notifyInterface(active, listener)
                }
            }
        }
        defaultCallback = callback
        connectivityManager.registerNetworkCallback(request, callback)
        connectivityManager.activeNetwork?.let { notifyInterface(it, listener) }
    }

    override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) {
        defaultCallback?.let { cb ->
            runCatching { connectivityManager.unregisterNetworkCallback(cb) }
        }
        defaultCallback = null
    }

    private fun notifyInterface(
        network: Network,
        listener: InterfaceUpdateListener,
        capsOverride: NetworkCapabilities? = null,
    ) {
        val linkProps = connectivityManager.getLinkProperties(network) ?: return
        val caps = capsOverride ?: connectivityManager.getNetworkCapabilities(network) ?: return
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)) return
        val ifName = linkProps.interfaceName ?: return
        val ifIndex = runCatching { NetworkInterface.getByName(ifName)?.index ?: 0 }.getOrDefault(0)
        val isExpensive = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        listener.updateDefaultInterface(ifName, ifIndex, isExpensive, false)
    }

    override fun getInterfaces(): NetworkInterfaceIterator {
        val sysIfaces = NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
        val result = ArrayList<LibboxNetworkInterface>()
        for (network in connectivityManager.allNetworks) {
            val linkProps = connectivityManager.getLinkProperties(network) ?: continue
            val caps = connectivityManager.getNetworkCapabilities(network) ?: continue
            val ifName = linkProps.interfaceName ?: continue
            val sysIface = sysIfaces.find { it.name == ifName } ?: continue
            val item = LibboxNetworkInterface().apply {
                name = ifName
                index = sysIface.index
                mtu = runCatching { sysIface.mtu }.getOrDefault(1500)
                addresses = StringListIterator(
                    sysIface.interfaceAddresses.mapNotNull { addr ->
                        val host = addr.address?.hostAddress?.substringBefore("%") ?: return@mapNotNull null
                        "$host/${addr.networkPrefixLength}"
                    },
                )
                dnsServer = StringListIterator(linkProps.dnsServers.mapNotNull { it.hostAddress })
                type = when {
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> Libbox.InterfaceTypeWIFI
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> Libbox.InterfaceTypeCellular
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> Libbox.InterfaceTypeEthernet
                    else -> Libbox.InterfaceTypeOther
                }
                var dumpFlags = 0
                if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                    dumpFlags = OsConstants.IFF_UP or OsConstants.IFF_RUNNING
                }
                if (sysIface.isLoopback) dumpFlags = dumpFlags or OsConstants.IFF_LOOPBACK
                if (sysIface.isPointToPoint) dumpFlags = dumpFlags or OsConstants.IFF_POINTOPOINT
                if (sysIface.supportsMulticast()) dumpFlags = dumpFlags or OsConstants.IFF_MULTICAST
                flags = dumpFlags
                metered = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
            }
            result.add(item)
        }
        return NetworkInterfaceListIterator(result)
    }

    override fun underNetworkExtension(): Boolean = false

    override fun includeAllNetworks(): Boolean = false

    override fun readWIFIState(): WIFIState? = null

    override fun clearDNSCache() {}

    override fun sendNotification(notification: Notification?) {}

    override fun cancelNotification(identifier: String?, typeID: Int) {}

    override fun startNeighborMonitor(listener: NeighborUpdateListener?) {}

    override fun closeNeighborMonitor(listener: NeighborUpdateListener?) {}

    override fun registerMyInterface(name: String?) {}

    override fun usePlatformShell(): Boolean = false

    override fun checkPlatformShell() {
        throw UnsupportedOperationException("Android shell is unsupported")
    }

    override fun openShellSession(
        user: PlatformUser?,
        command: String?,
        environ: StringIterator?,
        term: String?,
        rows: Int,
        cols: Int,
    ): ShellSession {
        throw UnsupportedOperationException("Android shell is unsupported")
    }

    override fun lookupUser(username: String?): PlatformUser {
        throw UnsupportedOperationException("lookupUser is unsupported")
    }

    override fun lookupSFTPServer(): String = ""

    override fun readSystemSSHHostKey(): String = ""

    override fun tailscaleHostname(): String = ""

    override fun usePlatformBridge(): Boolean = false

    override fun createBridge(options: BridgeOptions?): BridgeSession {
        throw UnsupportedOperationException("Platform bridge is unsupported")
    }
}
