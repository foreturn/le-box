package dev.lebox.client

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import com.longbridge.nsh.NshHostReply
import com.longbridge.nsh.NshView
import io.nekohasekai.libbox.Libbox
import java.util.concurrent.Executors

class MainActivity : Activity() {

    companion object {
        private const val REQ_VPN_PREPARE = 1001
    }

    private lateinit var nshView: NshView
    private val bgExecutor = Executors.newCachedThreadPool()

    private var pendingConfigJson: String? = null
    private var pendingStartReply: NshHostReply? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        VpnBridgeState.ensureLibboxSetup(this)

        nshView = NshView(this)
        nshView.setErrorListener { message ->
            VpnBridgeState.emitLog("error", "NSH 运行异常: $message")
        }
        registerHostHandlers(nshView)
        setContentView(nshView)
        VpnBridgeState.attachView(nshView)
        nshView.loadAssetBundle("nsh")
    }

    private fun registerHostHandlers(view: NshView) {
        view.handle("vpn.getInfo") { _, reply ->
            bgExecutor.execute {
                val version = runCatching { Libbox.version() }.getOrElse { "unavailable" }
                reply.resolve(
                    mapOf(
                        "available" to true,
                        "engine" to "libbox",
                        "version" to version,
                        "platform" to "android",
                        "running" to (VpnBridgeState.currentState == "running"),
                        "error" to VpnBridgeState.lastError,
                    ),
                )
            }
        }

        view.handle("vpn.checkConfig") { data, reply ->
            val map = data as? Map<*, *>
            val configJson = map?.get("configJson") as? String ?: ""
            bgExecutor.execute {
                try {
                    Libbox.checkConfig(configJson)
                    reply.resolve(
                        mapOf(
                            "ok" to true,
                            "output" to "libbox 配置校验通过",
                        ),
                    )
                } catch (err: Exception) {
                    reply.resolve(
                        mapOf(
                            "ok" to false,
                            "output" to (err.message ?: "libbox 配置校验失败"),
                        ),
                    )
                }
            }
        }

        view.handle("vpn.start") { data, reply ->
            val map = data as? Map<*, *>
            val configJson = map?.get("configJson") as? String ?: ""
            if (configJson.isBlank()) {
                reply.resolve(mapOf("ok" to false, "error" to "配置内容为空"))
                return@handle
            }
            val prepareIntent = VpnService.prepare(this)
            if (prepareIntent != null) {
                pendingConfigJson = configJson
                pendingStartReply = reply
                @Suppress("DEPRECATION")
                startActivityForResult(prepareIntent, REQ_VPN_PREPARE)
            } else {
                startVpnServiceWithConfig(configJson, reply)
            }
        }

        view.handle("vpn.stop") { _, reply ->
            val intent = Intent(this, LeBoxVpnService::class.java).apply {
                action = LeBoxVpnService.ACTION_STOP
            }
            startService(intent)
            reply.resolve(mapOf("ok" to true))
        }

        view.handle("vpn.selectOutbound") { data, reply ->
            val map = data as? Map<*, *>
            val tag = map?.get("tag") as? String ?: ""
            bgExecutor.execute {
                val ok = VpnBridgeState.activeService?.selectOutbound(tag) ?: false
                reply.resolve(mapOf("ok" to ok))
            }
        }

        view.handle("vpn.getStats") { _, reply ->
            reply.resolve(
                mapOf(
                    "stats" to VpnBridgeState.latestStats,
                    "connections" to VpnBridgeState.latestConnections,
                ),
            )
        }

        view.handle("vpn.testDelay") { data, reply ->
            val map = data as? Map<*, *>
            val tag = map?.get("tag") as? String ?: ""
            val timeoutMs = (map?.get("timeoutMs") as? Number)?.toInt() ?: 5000
            bgExecutor.execute {
                try {
                    val svc = VpnBridgeState.activeService
                        ?: throw IllegalStateException("VPN 通道未启动")
                    val delayMs = svc.testOutboundDelay(tag, timeoutMs)
                    reply.resolve(mapOf("ok" to true, "delayMs" to delayMs))
                } catch (err: Exception) {
                    reply.resolve(
                        mapOf(
                            "ok" to false,
                            "error" to (err.message ?: "测速失败"),
                        ),
                    )
                }
            }
        }
    }

    private fun startVpnServiceWithConfig(configJson: String, reply: NshHostReply) {
        VpnBridgeState.addPendingStartReply(reply)
        val intent = Intent(this, LeBoxVpnService::class.java).apply {
            action = LeBoxVpnService.ACTION_START
            putExtra(LeBoxVpnService.EXTRA_CONFIG_JSON, configJson)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_VPN_PREPARE) return
        val reply = pendingStartReply
        val config = pendingConfigJson
        pendingStartReply = null
        pendingConfigJson = null
        if (resultCode == RESULT_OK && config != null && reply != null) {
            startVpnServiceWithConfig(config, reply)
        } else {
            VpnBridgeState.updateState("stopped", null)
            reply?.resolve(mapOf("ok" to false, "error" to "用户取消了 VPN 授权"))
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (!::nshView.isInitialized || !nshView.handleBack()) {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        if (::nshView.isInitialized) {
            VpnBridgeState.detachView(nshView)
            nshView.destroy()
        }
        bgExecutor.shutdown()
        super.onDestroy()
    }
}
