package com.junction2026.lens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.types.DatResult
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionError
import com.meta.wearable.dat.core.types.PermissionStatus
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.ArrayDeque
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    private lateinit var bridge: BridgeClient
    private lateinit var controller: GlassesController
    private lateinit var rig: MockRig

    private lateinit var urlField: EditText
    private lateinit var mockSwitch: Switch
    private lateinit var previewBox: FrameLayout
    private lateinit var mockRow: LinearLayout
    private lateinit var regView: TextView
    private lateinit var sessionView: TextView
    private lateinit var displayView: TextView
    private lateinit var batteryView: TextView
    private lateinit var donView: TextView
    private lateinit var logView: TextView
    private lateinit var logScroll: ScrollView

    private val logLines = ArrayDeque<String>()
    private val timeFmt = SimpleDateFormat("HH:mm:ss", Locale.US)
    private var pendingGlassesPermission: CompletableDeferred<DatResult<PermissionStatus, PermissionError>>? = null

    private val runtimePerms = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        r.forEach { (p, ok) -> log("${p.substringAfterLast('.')}: ${if (ok) "granted" else "denied"}") }
    }
    private val glassesPerm = registerForActivityResult(Wearables.RequestPermissionContract()) { result ->
        pendingGlassesPermission?.complete(result)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bridge = BridgeClient(Prefs.bridge(this))
        rig = MockRig(applicationContext)
        controller = GlassesController(
            ctx = applicationContext,
            scope = lifecycleScope,
            bridge = bridge,
            log = ::log,
            requestCameraPermission = {
                val d = CompletableDeferred<DatResult<PermissionStatus, PermissionError>>()
                pendingGlassesPermission = d
                glassesPerm.launch(Permission.CAMERA)
                d.await()
            },
            onUpdateRequired = {
                log("Glasses app update required")
                Wearables.openDATGlassesAppUpdate(this)
            },
        )
        buildUi()
        observe()
        requestRuntimePermissions()
        handleDeepLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    /** Return from the Meta AI registration flow arrives as a physicslens:// intent. */
    private fun handleDeepLink(i: Intent?) {
        if (i?.data?.scheme != "physicslens" || !LensApp.wearablesReady) return
        Wearables.handleIntent(i) { request ->
            request.continueRegistration(this).onFailure { e, _ -> log("Registration continue failed: ${e.description}") }
        }.onFailure { e, _ -> log("Intent not handled: ${e.description}") }
    }

    private fun requestRuntimePermissions() {
        val want = buildList {
            add(Manifest.permission.BLUETOOTH_CONNECT)
            if (mockSwitch.isChecked) add(Manifest.permission.CAMERA)
        }.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (want.isNotEmpty()) runtimePerms.launch(want.toTypedArray())
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
    }

    private fun row(vararg v: View) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        v.forEach { addView(it) }
    }

    private fun status(): TextView = TextView(this).apply { textSize = 14f }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(24), dp(16), dp(16))
        }
        root.addView(TextView(this).apply { text = "Physics Lens"; textSize = 22f; setTypeface(typeface, Typeface.BOLD) })

        urlField = EditText(this).apply {
            setText(Prefs.bridge(context))
            hint = "Bridge URL"
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine()
        }
        root.addView(urlField)

        mockSwitch = Switch(this).apply {
            text = "Mock glasses (no hardware)"
            isChecked = Prefs.mock(context)
            setOnCheckedChangeListener { _, on ->
                Prefs.setMock(context, on)
                updateMockVisibility()
                if (on) requestRuntimePermissions()
                if (!on && !LensApp.wearablesReady) log("Restart the app to use real glasses")
            }
        }
        root.addView(mockSwitch)

        root.addView(row(
            button("Connect") { connect() },
            button("Explain what I see") { controller.trigger() },
            button("Disconnect") { disconnect() },
        ))

        mockRow = row(
            button("Pinch") { rig.pinch() },
            button("Take off / put on") { rig.toggleDon() },
            button("Battery low") { rig.batteryLow() },
        )
        root.addView(mockRow)

        regView = status(); sessionView = status(); displayView = status(); batteryView = status(); donView = status()
        listOf(regView, sessionView, displayView, batteryView, donView).forEach { root.addView(it) }

        previewBox = FrameLayout(this)
        root.addView(previewBox, LinearLayout.LayoutParams(dp(300), dp(300)).apply { topMargin = dp(8) })

        logView = TextView(this).apply { typeface = Typeface.MONOSPACE; textSize = 11f }
        logScroll = ScrollView(this).apply { addView(logView) }
        root.addView(logScroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(220)).apply { topMargin = dp(8) })

        setContentView(ScrollView(this).apply { addView(root) })
        updateMockVisibility()
    }

    private fun updateMockVisibility() {
        val on = mockSwitch.isChecked
        mockRow.visibility = if (on) View.VISIBLE else View.GONE
        previewBox.visibility = if (on) View.VISIBLE else View.GONE
    }

    private fun observe() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { controller.registration.collect { regView.text = "Registration: $it" } }
                launch { controller.sessionStatus.collect { sessionView.text = "Session: $it" } }
                launch { controller.displayStatus.collect { displayView.text = "Display: $it" } }
                launch { controller.battery.collect { batteryView.text = "Battery: $it" } }
                launch { controller.don.collect { donView.text = "Worn: $it" } }
            }
        }
    }

    private fun connect() {
        val url = urlField.text.toString().trim()
        Prefs.setBridge(this, url)
        bridge.baseUrl = url
        val mock = mockSwitch.isChecked
        lifecycleScope.launch {
            if (mock) {
                val err = rig.start()
                if (err != null) { log(err); return@launch }
                if (previewBox.childCount == 0) rig.previewView()?.let { previewBox.addView(it) }
                LensApp.wearablesReady = true
            }
            controller.connect(this@MainActivity, mock)
        }
    }

    private fun disconnect() {
        controller.disconnect()
        if (mockSwitch.isChecked) {
            previewBox.removeAllViews()
            rig.stop()
        }
    }

    private fun log(msg: String) {
        runOnUiThread {
            logLines.addLast("${timeFmt.format(Date())} $msg")
            while (logLines.size > 40) logLines.removeFirst()
            logView.text = logLines.joinToString("\n")
            logScroll.post { logScroll.fullScroll(View.FOCUS_DOWN) }
        }
    }
}
