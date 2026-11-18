package dev.lebox.client

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.longbridge.nsh.NshHostReply
import com.longbridge.nsh.NshView
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.SetupOptions
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

object VpnBridgeState {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val setupLock = Any()
    @Volatile
    private var libboxInitialized = false

    @Volatile
    private var attachedView: NshView? = null

    @Volatile
    var activeService: LeBoxVpnService? = null

    @Volatile
    var currentState: String = "stopped"
        private set

    @Volatile
    var lastError: String? = null
        private set

    @Volatile
    var latestStats: Map<String, Any?> = mapOf(
        "up" to 0L,
        "down" to 0L,
        "connections" to 0,
        "memoryBytes" to 0L,
    )
        private set

    @Volatile
    var latestConnections: List<Map<String, Any?>> = emptyList()
        private set

    private val pendingStartReplies = CopyOnWriteArrayList<NshHostReply>()
    private val outboundDelays = ConcurrentHashMap<String, Int>()
    private val delayWaiters = ConcurrentHashMap<String, CopyOnWriteArrayList<((Int) -> Unit)>>()

    fun ensureLibboxSetup(context: Context) {
        if (libboxInitialized) return
        synchronized(setupLock) {
            if (libboxInitialized) return
            val appCtx = context.applicationContext
            val baseDir = File(appCtx.filesDir, "sing-box").apply { mkdirs() }
            val workDir = File(appCtx.getExternalFilesDir(null) ?: appCtx.filesDir, "sing-box-work").apply { mkdirs() }
            val tempDir = File(appCtx.cacheDir, "sing-box-tmp").apply { mkdirs() }
            val pkgInfo = appCtx.packageManager.getPackageInfo(appCtx.packageName, 0)
            val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pkgInfo.longVersionCode.toString()
            } else {
                @Suppress("DEPRECATION")
                pkgInfo.versionCode.toString()
            }
            val options = SetupOptions().apply {
                basePath = baseDir.absolutePath
                workingPath = workDir.absolutePath
                tempPath = tempDir.absolutePath
                fixAndroidStack = false
                logMaxLines = 1500
                debug = BuildConfig.DEBUG
                crashReportSource = "LeBox"
                appVersion = versionCode
                appMarketingVersion = pkgInfo.versionName ?: "1.0.0"
                oomKillerEnabled = false
                oomKillerDisabled = true
                oomMemoryLimit = 0L
                powerReportEnabled = false
                platformMetadata = JSONObject().apply {
                    put("os", "Android " + Build.VERSION.RELEASE)
                    put("sdk", Build.VERSION.SDK_INT)
                    put("manufacturer", Build.MANUFACTURER)
                    put("model", Build.MODEL)
                }.toString()
            }
            Libbox.setup(options)
            libboxInitialized = true
        }
    }

    fun attachView(view: NshView) {
        attachedView = view
        sendEvent("vpn.state", mapOf("state" to currentState, "error" to lastError))
    }

    fun detachView(view: NshView) {
        if (attachedView === view) {
            attachedView = null
        }
    }

    fun addPendingStartReply(reply: NshHostReply) {
        pendingStartReplies.add(reply)
    }

    fun resolvePendingStart(ok: Boolean, version: String? = null, error: String? = null) {
        val replies = pendingStartReplies.toList()
        pendingStartReplies.clear()
        val payload = HashMap<String, Any?>().apply {
            put("ok", ok)
            if (version != null) put("version", version)
            if (error != null) put("error", error)
        }
        for (reply in replies) {
            runCatching { reply.resolve(payload) }
        }
    }

    fun updateState(state: String, error: String? = null) {
        currentState = state
        lastError = error
        sendEvent("vpn.state", mapOf("state" to state, "error" to error))
    }

    fun emitLog(level: String, message: String) {
        if (message.isBlank()) return
        val ts = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        sendEvent(
            "vpn.log",
            mapOf(
                "timestamp" to ts,
                "level" to level,
                "message" to message,
            ),
        )
    }

    fun updateStats(stats: Map<String, Any?>, connections: List<Map<String, Any?>>) {
        latestStats = stats
        latestConnections = connections
        sendEvent(
            "vpn.stats",
            mapOf(
                "stats" to stats,
                "connections" to connections,
            ),
        )
    }

    fun updateOutboundDelay(tag: String, delayMs: Int) {
        if (delayMs > 0) {
            outboundDelays[tag] = delayMs
        }
        val waiters = delayWaiters.remove(tag) ?: return
        for (cb in waiters) {
            cb(delayMs)
        }
    }

    fun registerDelayWaiter(tag: String, callback: (Int) -> Unit) {
        delayWaiters.computeIfAbsent(tag) { CopyOnWriteArrayList() }.add(callback)
    }

    fun unregisterDelayWaiter(tag: String, callback: (Int) -> Unit) {
        delayWaiters[tag]?.remove(callback)
    }

    fun lastDelay(tag: String): Int? = outboundDelays[tag]

    private fun sendEvent(name: String, data: Any?) {
        val view = attachedView ?: return
        mainHandler.post {
            if (attachedView === view) {
                runCatching { view.send(name, data) }
            }
        }
    }
}
