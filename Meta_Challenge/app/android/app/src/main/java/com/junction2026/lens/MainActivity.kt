package com.junction2026.lens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.Button
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
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
import com.meta.wearable.dat.inputs.types.NavDirection
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.ArrayDeque
import java.util.Date
import java.util.Locale

/** Phone screen. Colours, sizes and card anatomy follow shared/DESIGN.md ("Phone page and Android"). */
class MainActivity : ComponentActivity() {
    private lateinit var bridge: BridgeClient
    private lateinit var controller: GlassesController
    private lateinit var rig: MockRig

    private lateinit var urlField: EditText
    private lateinit var tokenField: EditText
    private lateinit var questionField: EditText
    private lateinit var langSpinner: Spinner
    private lateinit var speechView: TextView
    private lateinit var mockSwitch: Switch
    private lateinit var fixtureSwitch: Switch
    private lateinit var previewBox: FrameLayout
    private lateinit var photoView: android.widget.ImageView
    private lateinit var photoLabel: TextView
    private lateinit var mockSection: LinearLayout
    private lateinit var stateCard: LinearLayout
    private lateinit var stateTitle: TextView
    private lateinit var stateBody: TextView
    private lateinit var stateAction: Button
    private lateinit var stateNote: TextView
    private lateinit var statusLine: TextView
    private lateinit var connectBtn: Button
    private lateinit var mirrorText: TextView
    private lateinit var devHeader: TextView
    private lateinit var devSection: LinearLayout
    /** HTTP status of the last `GET /health`, -1 unreachable, null not checked. */
    private var bridgeHealth: Int? = null
    /** The Mock Device Kit's display preview inside [previewBox], while connected in mock mode. */
    private var preview: View? = null
    private lateinit var regView: TextView
    private lateinit var sessionView: TextView
    private lateinit var displayView: TextView
    private lateinit var batteryView: TextView
    private lateinit var deviceView: TextView
    private lateinit var consentView: TextView
    private lateinit var logView: TextView
    private lateinit var logScroll: ScrollView
    private lateinit var scroller: ScrollView

    /** Phone-only receipt line under the mirror ([Receipt]). */
    private lateinit var receiptLine: TextView
    // "Seen today" ([Journal]).
    private lateinit var seenTitle: TextView
    private lateinit var seenList: LinearLayout
    private lateinit var seenEmpty: TextView
    private lateinit var seenMore: Button
    private lateinit var seenHint: TextView
    private var seenExpanded = false
    private var seenHintJob: kotlinx.coroutines.Job? = null
    /** Thumbnails by asset path, decoded once (null: none). Never written to disk. */
    private val thumbs = HashMap<String, android.graphics.Bitmap?>()
    // "Glasses check" ([GlassesCheck]): a full-screen overlay over the phone screen.
    private lateinit var checkOverlay: View
    private lateinit var checkScroll: ScrollView
    private val checkViews = ArrayList<CheckRowViews>()
    private var checkState: Map<String, CheckResult> = emptyMap()
    private lateinit var reportCard: LinearLayout
    private lateinit var reportBox: TextView
    private var hintJob: kotlinx.coroutines.Job? = null
    private val checkBack = object : androidx.activity.OnBackPressedCallback(false) {
        override fun handleOnBackPressed() = closeCheck()
    }

    private class CheckRowViews(val row: CheckRow, val hint: TextView, val buttons: Map<CheckVerdict, Button>, val note: EditText)

    // Mock toggles, relabelled after each tap so the button says what it will do next.
    private lateinit var donBtn: Button
    private lateinit var foldBtn: Button
    private lateinit var batteryBtn: Button
    private lateinit var heatBtn: Button
    private lateinit var powerBtn: Button
    private lateinit var cameraBtn: Button
    private lateinit var takeOverBtn: Button

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
        bridge = BridgeClient(BridgeConfig.from(Prefs.bridge(this), Prefs.bridgeToken(this)), ::log)
        rig = MockRig(applicationContext)
        controller = GlassesController(
            ctx = applicationContext,
            scope = lifecycleScope,
            bridge = bridge,
            log = ::log,
            onPhoto = { jpeg ->
                runOnUiThread {
                    val bmp = android.graphics.BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)
                        .copy(android.graphics.Bitmap.Config.ARGB_8888, true)
                    // Draw the aim box on the thumbnail only; the photo that was sent has no box.
                    val f = GlassesController.AIM_FRACTION
                    val paint = android.graphics.Paint().apply {
                        style = android.graphics.Paint.Style.STROKE; strokeWidth = bmp.width / 90f; color = ACCENT
                    }
                    android.graphics.Canvas(bmp).drawRect(
                        bmp.width * (1 - f) / 2, bmp.height * (1 - f) / 2, bmp.width * (1 + f) / 2, bmp.height * (1 + f) / 2, paint)
                    photoView.setImageBitmap(bmp)
                    photoView.visibility = View.VISIBLE
                    photoLabel.text = "Last photo sent (${jpeg.size / 1024} KB, not saved). Box: what you aim at"
                }
            },
            requestPermission = { perm ->
                val d = CompletableDeferred<DatResult<PermissionStatus, PermissionError>>()
                pendingGlassesPermission = d
                glassesPerm.launch(perm)
                d.await()
            },
            onUpdateRequired = {
                log("Glasses app update required")
                Wearables.openDATGlassesAppUpdate(this)
            },
        )
        controller.useFixture = Prefs.fixture(this)
        buildUi()
        // After buildUi: setLanguage logs, and the log view must exist (a saved language crashed the start).
        controller.setLanguage(Lang.effective(Prefs.lang(this), Locale.getDefault()))
        observe()
        requestRuntimePermissions()
        handleDeepLink(intent)
    }

    /**
     * Leaving the app with Back finishes the activity but not the process: without this the old session
     * stayed, and the next Connect failed with "A session already exists for this device".
     */
    override fun onDestroy() {
        if (isFinishing) {
            controller.disconnect()
            if (rig.running) rig.stop()
        }
        super.onDestroy()
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

    // ---- building blocks (DESIGN.md: 8 px grid, 48 px touch targets, radius 12, weights 400 and 600) ----

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    /** Weight 600 (DESIGN.md: 400 and 600 only; Typeface.BOLD would be 700). */
    private val semibold: Typeface by lazy { Typeface.create(Typeface.DEFAULT, 600, false) }

    private fun rounded(fill: Int, stroke: Int? = null, radius: Int = 12) = GradientDrawable().apply {
        cornerRadius = dp(radius).toFloat()
        setColor(fill)
        if (stroke != null) setStroke(dp(1), stroke)
    }

    /** [primary]: the one cyan action of the screen. Otherwise card fill with a 1 dp border. */
    private fun button(label: String, primary: Boolean = false, stroke: Int = BORDER, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 16f
        minHeight = dp(48)
        minimumHeight = dp(48)
        minWidth = 0
        minimumWidth = 0
        stateListAnimator = null
        setPadding(dp(8), 0, dp(8), 0)
        setTextColor(if (primary) GROUND else TEXT)
        typeface = if (primary) semibold else Typeface.DEFAULT
        background = if (primary) rounded(ACCENT) else rounded(CARD, stroke)
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
            setMargins(dp(4), dp(4), dp(4), dp(4))
        }
    }

    private fun row(vararg v: View) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        isBaselineAligned = false // buttons with 1 and 2 lines stay level
        v.forEach { addView(it) }
    }

    private fun label(text: String, size: Float = 14f, color: Int = MUTED, semi: Boolean = false) = TextView(this).apply {
        this.text = text
        textSize = size
        setTextColor(color)
        setLineSpacing(0f, 1.4f)
        if (semi) typeface = semibold
    }

    private fun section(title: String) = label(title, 14f, MUTED, semi = true).apply { setPadding(dp(4), dp(16), 0, dp(4)) }

    private fun watch(f: EditText, onChange: (String) -> Unit) = f.addTextChangedListener(object : android.text.TextWatcher {
        override fun afterTextChanged(e: android.text.Editable?) = onChange(e?.toString().orEmpty())
        override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
        override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
    })

    /** URL and token apply to the next request as typed (and are saved): no Disconnect + Connect needed. */
    private fun applyBridgeFields() {
        val url = urlField.text.toString()
        val token = tokenField.text.toString()
        bridge.config = BridgeConfig.from(url, token)
        Prefs.setBridge(this, BridgeConfig.stripSecrets(url.trim())) // never a pasted key
        Prefs.setBridgeToken(this, token.trim())
    }

    private fun field(value: String, hintText: String, password: Boolean) = EditText(this).apply {
        setText(value)
        hint = hintText
        textSize = 16f
        setTextColor(TEXT)
        setHintTextColor(MUTED)
        backgroundTintList = ColorStateList.valueOf(BORDER)
        setSingleLine() // before inputType: it resets the transformation and would show the token in clear
        inputType = if (password) InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        else InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
        if (password) transformationMethod = android.text.method.PasswordTransformationMethod.getInstance()
        typeface = Typeface.DEFAULT // password fields default to monospace
    }

    private fun switch(text: String, on: Boolean, onChange: (Boolean) -> Unit) = Switch(this).apply {
        this.text = text
        textSize = 16f
        setTextColor(TEXT)
        isChecked = on
        minHeight = dp(48)
        thumbTintList = ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()), intArrayOf(ACCENT, MUTED))
        trackTintList = ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()), intArrayOf(0x664DF0FF, BORDER))
        setOnCheckedChangeListener { _, v -> onChange(v) }
    }

    private fun matchWidth(top: Int = 0) = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dp(top)
    }

    /**
     * Order (top to bottom): title row (connect toggle, language chip), one status line, the state card when
     * something needs the wearer, the glasses mirror, the remote, "Explain what I see", the question card,
     * then the collapsed Developer section with every dev control.
     */
    private fun buildUi() {
        window.decorView.setBackgroundColor(GROUND)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(8), dp(16), dp(16))
        }

        // Title row.
        connectBtn = button("Connect glasses") { if (sessionOrConnecting()) disconnect() else connect() }.apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                setMargins(dp(4), dp(4), 0, dp(4))
            }
            setPadding(dp(16), 0, dp(16), 0)
        }
        val title = label("Physics Lens", 20f, TEXT, semi = true).apply {
            maxLines = 1
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setPadding(dp(4), 0, 0, 0)
        }
        root.addView(row(title, languageChip(), connectBtn).apply { gravity = Gravity.CENTER_VERTICAL })

        // One status line: "Glasses connected · 100% · Bridge online"; a failing part in hot.
        statusLine = label("", 14f, MUTED).apply { setPadding(dp(4), dp(4), dp(4), 0) }
        root.addView(statusLine)

        // The phone's state card (DESIGN.md states table, phone column). Hidden when all is well.
        stateTitle = label("", 20f, TEXT, semi = true)
        stateBody = label("", 16f, TEXT)
        stateNote = label("", 14f, MUTED).apply { visibility = View.GONE }
        stateAction = button("", stroke = LIGHT_STROKE) { onStateAction() }.apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(16)
            }
            setPadding(dp(24), 0, dp(24), 0)
        }
        stateCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
            background = rounded(CARD, BORDER)
            addView(stateTitle); addView(stateBody); addView(stateNote); addView(stateAction)
            visibility = View.GONE
        }
        root.addView(stateCard, matchWidth(top = 16))

        // The glasses mirror: the mock display preview, or the card as text (real glasses). Its content
        // description carries "Glasses show: ..." for uiautomator (the smoke script reads it).
        val side = minOf(resources.displayMetrics.widthPixels - dp(32), dp(320))
        mirrorText = label("Glasses not connected", 16f, MUTED).apply {
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }
        previewBox = FrameLayout(this).apply {
            background = rounded(0xFF000000.toInt(), BORDER)
            contentDescription = "Glasses show: -"
            addView(mirrorText, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        root.addView(previewBox, LinearLayout.LayoutParams(side, side).apply {
            topMargin = dp(16); gravity = Gravity.CENTER_HORIZONTAL
        })
        // Where the result on screen came from (phone only: the glasses card is at its word cap).
        receiptLine = label("", 14f, MUTED).apply {
            gravity = Gravity.CENTER
            setPadding(dp(4), dp(8), dp(4), 0)
            visibility = View.GONE
        }
        root.addView(receiptLine, matchWidth())

        // Compact remote for the glasses' inputs.
        root.addView(section("Glasses remote"))
        fun small(label: String, onClick: () -> Unit) = button(label, onClick = onClick).apply { setPadding(dp(2), 0, dp(2), 0) }
        root.addView(row(
            small("Pinch") { if (rig.running) rig.pinch() else controller.onSelect() },
            small("Back") { controller.onBack() },
            small("Left") { controller.onNav(NavDirection.LEFT) },
            small("Up") { controller.onNav(NavDirection.UP) },
            small("Down") { controller.onNav(NavDirection.DOWN) },
            small("Right") { controller.onNav(NavDirection.RIGHT) },
        ))

        // The one primary action.
        root.addView(button("Explain what I see", primary = true) { controller.trigger() }.apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)).apply {
                setMargins(dp(4), dp(16), dp(4), dp(4))
            }
        })

        // Follow-up question about the object on screen (PROTOCOL POST /ask), same path as a spoken one.
        questionField = field("", "Ask a follow-up, e.g. why does it curve?", password = false).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_SEND
            setOnEditorActionListener { _, _, _ -> askFromField(); true }
            background = null
            setPadding(dp(8), dp(8), dp(8), dp(8))
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        val askBtn = button("Ask") { askFromField() }.apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            setPadding(dp(16), 0, dp(16), 0)
        }
        root.addView(row(questionField, askBtn).apply {
            gravity = Gravity.CENTER_VERTICAL
            background = rounded(CARD, BORDER)
            setPadding(dp(8), dp(4), dp(8), dp(4))
        }, matchWidth(top = 16))

        root.addView(seenSection())

        root.addView(developerSection())

        scroller = ScrollView(this).apply { addView(root); setBackgroundColor(GROUND) }
        checkOverlay = buildCheckScreen()
        val container = FrameLayout(this).apply {
            setBackgroundColor(GROUND)
            addView(scroller, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            addView(checkOverlay, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        // Android 15 draws edge to edge: keep the content out from under the status and navigation bars.
        container.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(container)
        onBackPressedDispatcher.addCallback(this, checkBack)
        updateMockVisibility()
        relabel()
        showConsentStatus()
        // First launch must be usable: without a bridge URL the section with the field is open.
        setDeveloperOpen(Prefs.bridge(this).isBlank())
        updateStatus()
    }

    /** "Developer" (tap to open): switches, device states, bridge settings, raw status, last photo, log. */
    private fun developerSection(): View {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        devHeader = label("Developer  ▸", 16f, TEXT, semi = true).apply {
            minHeight = dp(48)
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(4), dp(8), dp(4), dp(8))
            setOnClickListener { setDeveloperOpen(devSection.visibility != View.VISIBLE) }
        }
        box.addView(devHeader, matchWidth(top = 16))
        devSection = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; visibility = View.GONE }
        val dev = devSection

        mockSwitch = switch("Mock glasses (no hardware)", Prefs.mock(this)) { on ->
            Prefs.setMock(this, on)
            updateMockVisibility()
            if (on) requestRuntimePermissions()
            if (!on && !LensApp.wearablesReady) log("Restart the app to use real glasses")
        }
        dev.addView(mockSwitch)
        fixtureSwitch = switch("Demo data (no bridge)", Prefs.fixture(this)) { on ->
            Prefs.setFixture(this, on)
            controller.useFixture = on
            log(if (on) "Demo data: ball, guitar, not sure (no camera, no bridge)" else "Demo data off: camera + bridge")
            updateStatus()
        }
        dev.addView(fixtureSwitch)
        // Team tools: the real-glasses checklist (Glasses_Test.md) and emptying "Seen today".
        dev.addView(row(
            button("Glasses check") { openCheck() },
            button("Clear Seen today") { controller.clearJournal() },
        ))

        // Mock Device Kit: device states, the speech stand-in and the simulated takeover.
        mockSection = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        mockSection.addView(section("Device states (mock)"))
        donBtn = button("Take off") { rig.toggleDon(); relabel() }
        foldBtn = button("Fold") { rig.toggleFold(); relabel() }
        batteryBtn = button("Battery low") { rig.toggleBattery(); relabel() }
        heatBtn = button("Overheat") { rig.toggleHeat(); relabel() }
        powerBtn = button("Bluetooth drop") { rig.togglePower(); relabel() }
        cameraBtn = button("Deny camera") { rig.toggleCameraPermission(); relabel() }
        takeOverBtn = button("Simulate: other app takes over") {
            controller.simulateTakeOver(!controller.takenOver)
        }
        mockSection.addView(row(donBtn, foldBtn, batteryBtn))
        mockSection.addView(row(heatBtn, powerBtn, cameraBtn))
        mockSection.addView(row(takeOverBtn))
        // Mock Device Kit speech: a final transcription, as if the wearer said it (kit API simulateTranscription).
        mockSection.addView(row(button("Say: \"$SAY\"") { rig.say(SAY)?.let { log(it) } ?: log("Said: \"$SAY\"") }))
        dev.addView(mockSection)

        dev.addView(section("Bridge"))
        urlField = field(Prefs.bridge(this), "Bridge URL", password = false)
        dev.addView(urlField)
        tokenField = field(Prefs.bridgeToken(this), "Bridge token (blank = none)", password = true)
        dev.addView(tokenField)
        watch(urlField) { applyBridgeFields(); checkBridgeSoon() }
        watch(tokenField) { applyBridgeFields() }
        // Dev only, not saved: PROTOCOL forceObjectId, so a bridge without a model key answers with a library object.
        dev.addView(field("", "Force object id (dev test, not saved)", password = false).apply {
            watch(this) { controller.forceObjectId = it.trim().ifEmpty { null } }
        })
        // Dev: forget the first-run consent so the next photo asks again (shown in Status).
        dev.addView(row(button("Reset consent") { controller.resetConsent(); showConsentStatus() }))

        dev.addView(section("Status"))
        regView = label(""); sessionView = label(""); displayView = label(""); batteryView = label(""); deviceView = label("")
        speechView = label("")
        consentView = label("")
        listOf(regView, sessionView, displayView, speechView, batteryView, deviceView, consentView).forEach { dev.addView(it) }

        photoLabel = label("Last photo sent: none yet", 14f).apply { setPadding(0, dp(8), 0, 0) }
        dev.addView(photoLabel)
        photoView = android.widget.ImageView(this).apply { adjustViewBounds = true; visibility = View.GONE }
        dev.addView(photoView, LinearLayout.LayoutParams(dp(135), dp(240)).apply { topMargin = dp(4) })

        logView = TextView(this).apply { typeface = Typeface.MONOSPACE; textSize = 11f; setTextColor(MUTED) }
        logScroll = ScrollView(this).apply { addView(logView); background = rounded(CARD, BORDER); setPadding(dp(8), dp(8), dp(8), dp(8)) }
        dev.addView(logScroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(220)).apply { topMargin = dp(8) })
        box.addView(dev)
        return box
    }

    private fun setDeveloperOpen(open: Boolean) {
        devSection.visibility = if (open) View.VISIBLE else View.GONE
        devHeader.text = if (open) "Developer  ▾" else "Developer  ▸"
    }

    private fun showConsentStatus() {
        consentView.text = "Consent: " + if (Prefs.consent(this)) "given" else "not yet (asked before the first photo)"
    }

    private fun relabel() {
        donBtn.text = if (rig.donned) "Take off" else "Put on"
        foldBtn.text = if (rig.folded) "Unfold" else "Fold"
        batteryBtn.text = if (rig.batteryLow) "Battery full" else "Battery low"
        heatBtn.text = if (rig.hot) "Cool down" else "Overheat"
        powerBtn.text = if (rig.poweredOff) "Bluetooth back" else "Bluetooth drop"
        cameraBtn.text = if (rig.cameraDenied) "Allow camera" else "Deny camera"
        takeOverBtn.text = if (controller.takenOver) "Simulate: other app leaves" else "Simulate: other app takes over"
    }

    private fun updateMockVisibility() {
        mockSection.visibility = if (mockSwitch.isChecked) View.VISIBLE else View.GONE
    }

    /** The status line and the title button, from the session, alert, battery and the last bridge check. */
    private fun updateStatus() {
        if (!::statusLine.isInitialized) return
        val session = controller.sessionStatus.value
        val parts = PhoneStatus.parts(
            session, controller.alert.value, controller.battery.value,
            fixture = fixtureSwitch.isChecked, urlBlank = urlField.text.isBlank(), health = bridgeHealth,
        )
        val sb = android.text.SpannableStringBuilder()
        parts.forEachIndexed { i, p ->
            if (i > 0) sb.append(" · ")
            val start = sb.length
            sb.append(p.text)
            if (p.bad) sb.setSpan(android.text.style.ForegroundColorSpan(HOT), start, sb.length, 0)
        }
        statusLine.text = sb
        connectBtn.text = if (sessionOrConnecting()) "Disconnect" else "Connect glasses"
    }

    /** `GET /health` now and then (and soon after the URL changes) for the status line; not in demo data mode. */
    private suspend fun checkBridge() {
        bridgeHealth = if (urlField.text.isBlank() || fixtureSwitch.isChecked) null else bridge.health()
        updateStatus()
    }

    private var healthJob: kotlinx.coroutines.Job? = null

    private fun checkBridgeSoon() {
        healthJob?.cancel()
        bridgeHealth = null
        updateStatus()
        healthJob = lifecycleScope.launch { kotlinx.coroutines.delay(600); checkBridge() }
    }

    private fun showState(a: DeviceAlert?) {
        stateNote.visibility = View.GONE
        if (a == null && controller.consentPending.value) {
            // DESIGN.md: first-run consent is a full card with one action on the phone too; the same two
            // short lines as the glasses card (state-card caps).
            stateTitle.text = Cards.t(Lang.CONSENT_TITLE)
            stateTitle.setTextColor(TEXT) // a decision, not an error: no "hot" colour
            stateBody.text = Cards.t(Lang.CONSENT_BODY)
            stateNote.text = Cards.t(Lang.CONSENT_NOTE)
            stateNote.visibility = View.VISIBLE
            stateAction.tag = CONSENT_ACTION
            stateAction.text = Cards.t(Lang.AGREE)
            stateAction.visibility = View.VISIBLE
            stateCard.visibility = View.VISIBLE
            return
        }
        if (a == null) { stateCard.visibility = View.GONE; return }
        val t = DeviceStates.text(a, controller.batteryLevel, Cards.lang)
        stateTitle.setTextColor(if (DeviceStates.isError(a)) HOT else TEXT)
        stateTitle.text = t.title
        stateBody.text = t.body
        stateAction.tag = t.action
        stateAction.visibility = if (t.action == null) View.GONE else View.VISIBLE
        stateAction.text = when (t.action) {
            PhoneAction.CONNECT -> if (Cards.lang.startsWith("fi")) "Yhdistä" else "Connect"
            PhoneAction.TRY_AGAIN -> Cards.t(Lang.TRY_AGAIN)
            null -> ""
        }
        stateCard.visibility = View.VISIBLE
    }

    private fun onStateAction() {
        if (stateAction.tag == CONSENT_ACTION) { controller.agreeConsent(); return }
        when (stateAction.tag as? PhoneAction) {
            PhoneAction.CONNECT -> connect()
            PhoneAction.TRY_AGAIN -> controller.trigger()
            null -> Unit
        }
    }

    private fun observe() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { controller.registration.collect { regView.text = "Registration: $it" } }
                launch { controller.sessionStatus.collect { sessionView.text = "Session: $it"; updateStatus() } }
                launch { controller.displayStatus.collect { displayView.text = "Display: $it" } }
                launch { controller.speechStatus.collect { speechView.text = "Speech: $it" } }
                launch { controller.battery.collect { batteryView.text = "Battery: $it"; updateStatus() } }
                launch { controller.device.collect { deviceView.text = it } }
                launch { controller.alert.collect { showState(it); relabel(); updateStatus() } }
                launch { controller.consentPending.collect { showState(controller.alert.value); showConsentStatus() } }
                launch {
                    controller.glassesText.collect {
                        previewBox.contentDescription = "Glasses show: $it"
                        mirrorText.text = if (it == "-") "Glasses not connected" else it
                    }
                }
                launch { while (true) { checkBridge(); kotlinx.coroutines.delay(10_000) } }
                launch { controller.journal.collect { renderJournal() } }
                launch { controller.receipt.collect { showReceipt(it) } }
            }
        }
    }

    /**
     * Language chip in the title row: Phone language (default) or one of [Lang.SUPPORTED]. Saved in prefs;
     * changes `lang` on the bridge calls, the library text and the fixed card strings without touching the
     * system locale.
     */
    private fun languageChip(): View {
        val tags = listOf("") + Lang.SUPPORTED
        val phone = Lang.tagFor(Locale.getDefault())
        val names = tags.map { if (it.isEmpty()) "Phone: ${Lang.nativeName(phone)}" else "${Lang.nativeName(it)} ($it)" }
        val adapter = object : ArrayAdapter<String>(this, android.R.layout.simple_spinner_item, names) {
            override fun getView(position: Int, convertView: View?, parent: ViewGroup) =
                (super.getView(position, convertView, parent) as TextView).apply {
                    setTextColor(TEXT); textSize = 14f
                    setPadding(0, 0, 0, 0)
                    gravity = Gravity.CENTER
                    text = "${(tags[position].ifEmpty { phone }).uppercase(Locale.ROOT)} ▾"
                    contentDescription = "Language: ${names[position]}"
                }
            override fun getDropDownView(position: Int, convertView: View?, parent: ViewGroup) =
                (super.getDropDownView(position, convertView, parent) as TextView).apply {
                    setTextColor(TEXT); textSize = 16f
                    setPadding(dp(12), dp(12), dp(12), dp(12))
                    setBackgroundColor(CARD)
                }
        }
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        langSpinner = Spinner(this, Spinner.MODE_DROPDOWN).apply {
            this.adapter = adapter
            setPopupBackgroundDrawable(rounded(CARD, BORDER))
            background = rounded(CARD, BORDER, radius = 24)
            minimumHeight = dp(48)
            dropDownWidth = dp(220)
            setPadding(0, 0, 0, 0)
            setSelection(tags.indexOf(Prefs.lang(this@MainActivity)).coerceAtLeast(0), false)
            onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) {
                    val choice = tags[pos]
                    if (choice == Prefs.lang(this@MainActivity)) return
                    Prefs.setLang(this@MainActivity, choice)
                    controller.setLanguage(Lang.effective(choice, Locale.getDefault()))
                    showState(controller.alert.value)
                    renderJournal()
                    showReceipt(controller.receipt.value)
                }
                override fun onNothingSelected(p: AdapterView<*>?) = Unit
            }
            // Fixed small chip: a Spinner otherwise measures itself much wider than "EN ▾".
            layoutParams = LinearLayout.LayoutParams(dp(68), dp(48)).apply { setMargins(dp(4), dp(4), dp(4), dp(4)) }
        }
        return langSpinner
    }

    private fun askFromField() {
        val q = questionField.text.toString()
        if (q.isBlank()) { log("Type a question first"); return }
        controller.ask(q)
        val imm = getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
        imm.hideSoftInputFromWindow(questionField.windowToken, 0)
    }

    /** The Connect started from this screen, while it runs (Disconnect stops it). */
    private var connectUiJob: kotlinx.coroutines.Job? = null

    private fun sessionOrConnecting() =
        PhoneStatus.connected(controller.sessionStatus.value) || connectUiJob?.isActive == true

    private fun connect() {
        applyBridgeFields()
        val mock = mockSwitch.isChecked
        connectUiJob = lifecycleScope.launch {
            if (mock) {
                val err = rig.start()
                if (err != null) { log(err); return@launch }
                if (preview == null) preview = rig.previewView()?.also { previewBox.addView(it) }
                LensApp.wearablesReady = true
                relabel()
            }
            controller.connect(this@MainActivity, mock)
        }.also { j -> j.invokeOnCompletion { runOnUiThread { updateStatus() } } }
        updateStatus()
    }

    private fun disconnect() {
        controller.disconnect()
        if (mockSwitch.isChecked) {
            preview?.let { previewBox.removeView(it) }
            preview = null
            rig.stop()
        }
        relabel()
    }

    // ---- receipt line ----

    private fun showReceipt(f: ReceiptFacts?) {
        if (f == null) { receiptLine.visibility = View.GONE; return }
        receiptLine.text = Receipt.line(f, Cards.lang)
        receiptLine.visibility = View.VISIBLE
    }

    // ---- "Seen today" ----

    /** Title, the last 3 entries (all with "Show all"), the empty line, and the muted hint. */
    private fun seenSection(): View {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        seenTitle = section(Cards.t(Lang.SEEN_TITLE)).apply { setPadding(dp(4), dp(24), 0, dp(4)) }
        box.addView(seenTitle)
        seenList = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        box.addView(seenList, matchWidth())
        seenEmpty = label(Cards.t(Lang.SEEN_EMPTY), 14f, MUTED).apply { setPadding(dp(4), dp(4), dp(4), dp(4)) }
        box.addView(seenEmpty)
        seenHint = label("", 14f, MUTED).apply { setPadding(dp(4), dp(4), dp(4), 0); visibility = View.GONE }
        box.addView(seenHint)
        seenMore = button(Cards.t(Lang.SEEN_ALL)) { seenExpanded = !seenExpanded; renderJournal() }.apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                setMargins(0, dp(8), 0, 0)
            }
            setPadding(dp(16), 0, dp(16), 0)
            visibility = View.GONE
        }
        box.addView(seenMore)
        return box
    }

    private fun renderJournal() {
        if (!::seenList.isInitialized) return
        val all = controller.journal.value
        seenTitle.text = Cards.t(Lang.SEEN_TITLE)
        seenEmpty.text = Cards.t(Lang.SEEN_EMPTY)
        seenEmpty.visibility = if (all.isEmpty()) View.VISIBLE else View.GONE
        if (all.isEmpty()) seenHint.visibility = View.GONE
        seenMore.visibility = if (all.size > SEEN_SHOWN) View.VISIBLE else View.GONE
        seenMore.text = Cards.t(if (seenExpanded) Lang.SEEN_LESS else Lang.SEEN_ALL)
        seenList.removeAllViews()
        for (e in if (seenExpanded) all else all.take(SEEN_SHOWN)) seenList.addView(journalCard(e), matchWidth(top = 8))
    }

    private fun seenTime(ms: Long): String {
        val fi = Cards.lang.startsWith("fi")
        val today = SimpleDateFormat("yyyyMMdd", Locale.US).let { it.format(Date(ms)) == it.format(Date()) }
        val pattern = if (today) "HH:mm" else if (fi) "d.M. HH:mm" else "d MMM HH:mm"
        return SimpleDateFormat(pattern, Locale.US).format(Date(ms))
    }

    /** Compact card: thumbnail left; label, one line, last question and muted time + flag right. */
    private fun journalCard(e: JournalEntry): View {
        val fi = Cards.lang.startsWith("fi")
        val thumb = android.widget.ImageView(this).apply {
            scaleType = android.widget.ImageView.ScaleType.FIT_CENTER
            background = rounded(0xFF000000.toInt(), BORDER, radius = 8)
            setPadding(dp(2), dp(2), dp(2), dp(2))
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            layoutParams = LinearLayout.LayoutParams(dp(56), dp(56)).apply { marginEnd = dp(12) }
        }
        e.still?.let { path -> loadThumb(path) { bmp -> if (bmp != null) thumb.setImageBitmap(bmp) } }
        fun one(t: String, size: Float, color: Int, semi: Boolean = false) = label(t, size, color, semi).apply {
            maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END
            setLineSpacing(0f, 1.2f)
        }
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            addView(one(e.label, 16f, TEXT, semi = true))
            val line = e.line.ifBlank { e.lens }
            if (line.isNotBlank()) addView(one(line, 14f, TEXT))
            e.qa.lastOrNull()?.let { addView(one("${Cards.t(Lang.QUESTION_PREFIX)} ${it.q} ${if (fi) "V:" else "A:"} ${it.a}", 14f, MUTED)) }
            val flag = Cards.t(when (e.flag) {
                JournalFlag.LIBRARY -> Lang.FLAG_LIBRARY
                JournalFlag.SKETCH -> Lang.FLAG_SKETCH
                JournalFlag.SAVED -> Lang.FLAG_SAVED
                JournalFlag.DEMO -> Lang.FLAG_DEMO
            })
            val meta = android.text.SpannableStringBuilder(seenTime(e.timeMs)).append(" · ")
            val start = meta.length
            meta.append(flag)
            // DESIGN.md: a sketch is tagged in the loss colour (and by its word).
            if (e.flag == JournalFlag.SKETCH) meta.setSpan(android.text.style.ForegroundColorSpan(HOT), start, meta.length, 0)
            addView(one("", 14f, MUTED).apply { text = meta })
        }
        return row(thumb, col).apply {
            gravity = Gravity.CENTER_VERTICAL
            minimumHeight = dp(64)
            background = rounded(CARD, BORDER)
            setPadding(dp(8), dp(8), dp(12), dp(8))
            isClickable = true
            isFocusable = true
            setOnClickListener { onSeenTap(e) }
        }
    }

    /** First still of an entry, from the APK's assets; a whole exported frame is cut to its drawing. */
    private fun loadThumb(path: String, onReady: (android.graphics.Bitmap?) -> Unit) {
        if (thumbs.containsKey(path)) { onReady(thumbs[path]); return }
        lifecycleScope.launch {
            val bmp = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                runCatching {
                    val src = assets.open(path).use { android.graphics.BitmapFactory.decodeStream(it) } ?: return@runCatching null
                    val piece = if (StillFrame.isFrame(src.width, src.height)) {
                        val px = IntArray(src.width * src.height)
                        src.getPixels(px, 0, src.width, 0, 0, src.width, src.height)
                        val c = StillFrame.crop(px, src.width, src.height, false)
                        android.graphics.Bitmap.createBitmap(src, c.left, c.top, c.width, c.height)
                    } else src
                    val side = dp(56)
                    val scale = side.toFloat() / maxOf(piece.width, piece.height)
                    if (scale < 1f) android.graphics.Bitmap.createScaledBitmap(piece, maxOf(1, (piece.width * scale).toInt()), maxOf(1, (piece.height * scale).toInt()), true)
                    else piece
                }.getOrNull()
            }
            thumbs[path] = bmp
            onReady(bmp)
        }
    }

    /** Connected: the object again on the glasses from saved data (no photo). Not connected: a muted hint. */
    private fun onSeenTap(e: JournalEntry) {
        val hint = when {
            e.flag == JournalFlag.SKETCH -> Cards.t(Lang.SEEN_NO_REPLAY)
            controller.replay(e.objectId) -> null
            else -> Cards.t(Lang.SEEN_HINT)
        }
        seenHint.text = hint.orEmpty()
        seenHint.visibility = if (hint == null) View.GONE else View.VISIBLE
        // A hint, not a state: it leaves by itself.
        seenHintJob?.cancel()
        if (hint != null) seenHintJob = lifecycleScope.launch { kotlinx.coroutines.delay(5_000); seenHint.visibility = View.GONE }
        if (hint == null) scroller.post { scroller.smoothScrollTo(0, maxOf(0, previewBox.top - dp(8))) }
    }

    // ---- "Glasses check" (team tool, English only) ----

    private fun buildCheckScreen(): View {
        checkState = GlassesCheck.decode(Prefs.glassesCheck(this))
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(8), dp(16), dp(24))
        }
        val title = label("Glasses check", 20f, TEXT, semi = true).apply {
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setPadding(dp(4), 0, 0, 0)
        }
        val close = button("Close") { closeCheck() }.apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            setPadding(dp(16), 0, dp(16), 0)
        }
        col.addView(row(title, close).apply { gravity = Gravity.CENTER_VERTICAL })
        col.addView(label("First real-glasses test, from Glasses_Test.md. \"App saw\" is a hint; you decide.", 14f, MUTED).apply {
            setPadding(dp(4), dp(4), dp(4), dp(8))
        })
        checkViews.clear()
        for (r in GlassesCheck.ROWS) col.addView(checkRowView(r), matchWidth(top = 8))

        val share = button("Share report", primary = true) { shareReport() }.apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)).apply { setMargins(dp(4), dp(16), dp(4), dp(4)) }
        }
        col.addView(share)
        col.addView(row(button("Start over") { startOver() }))
        reportBox = TextView(this).apply {
            textSize = 14f
            setTextColor(TEXT)
            setLineSpacing(0f, 1.4f)
            setTextIsSelectable(true)
        }
        reportCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(CARD, BORDER)
            setPadding(dp(16), dp(16), dp(16), dp(16))
            addView(label("Report (select to copy)", 14f, MUTED, semi = true))
            addView(reportBox)
            visibility = View.GONE
        }
        col.addView(reportCard, matchWidth(top = 16))
        checkScroll = ScrollView(this).apply { addView(col) }
        return FrameLayout(this).apply {
            setBackgroundColor(GROUND)
            isClickable = true // nothing under it takes a touch
            addView(checkScroll)
            visibility = View.GONE
        }
    }

    private fun checkRowView(r: CheckRow): View {
        val num = GlassesCheck.number(r.id)
        val head = label("$num  ${r.todo}", 16f, TEXT)
        val expect = label("See: ${r.expect}", 14f, MUTED)
        val hint = label("", 14f, SOFT).apply { visibility = View.GONE }
        val note = field("", "What went wrong (optional)", password = false).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            filters = arrayOf(android.text.InputFilter.LengthFilter(GlassesCheck.NOTE_MAX))
            contentDescription = "Note $num"
            visibility = View.GONE
        }
        val buttons = CheckVerdict.entries.associateWith { v ->
            button(verdictName(v)) { setVerdict(r.id, v) }.apply { contentDescription = "${verdictName(v)} $num" }
        }
        val views = CheckRowViews(r, hint, buttons, note)
        checkViews += views
        note.setText(checkState[r.id]?.note.orEmpty())
        watch(note) { text ->
            val next = GlassesCheck.setNote(checkState, r.id, text)
            if (next != checkState) { checkState = next; saveCheck() }
        }
        styleRow(views)
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(CARD, BORDER)
            setPadding(dp(12), dp(12), dp(12), dp(8))
            addView(head); addView(expect); addView(hint)
            addView(row(*CheckVerdict.entries.map { buttons.getValue(it) }.toTypedArray()), matchWidth(top = 4))
            addView(note)
        }
    }

    private fun verdictName(v: CheckVerdict) = when (v) {
        CheckVerdict.PASS -> "Pass"
        CheckVerdict.FAIL -> "Fail"
        CheckVerdict.SKIP -> "Skip"
    }

    private fun setVerdict(id: String, v: CheckVerdict) {
        checkState = GlassesCheck.setVerdict(checkState, id, v)
        saveCheck()
        checkViews.firstOrNull { it.row.id == id }?.let { views ->
            // A note stays only on Fail: the field follows the state.
            val n = checkState[id]?.note.orEmpty()
            if (views.note.text.toString() != n) views.note.setText(n)
            styleRow(views)
            if (checkState[id]?.verdict == CheckVerdict.FAIL) views.note.requestFocus()
        }
    }

    /** The chosen verdict reads "● Fail" with a light (Fail: hot) border: never colour alone. */
    private fun styleRow(v: CheckRowViews) {
        val chosen = checkState[v.row.id]?.verdict
        for ((verdict, b) in v.buttons) {
            val on = verdict == chosen
            b.text = (if (on) "● " else "") + verdictName(verdict)
            b.typeface = if (on) semibold else Typeface.DEFAULT
            b.background = rounded(CARD, if (!on) BORDER else if (verdict == CheckVerdict.FAIL) HOT else TEXT)
        }
        v.note.visibility = if (chosen == CheckVerdict.FAIL) View.VISIBLE else View.GONE
    }

    private fun saveCheck() = Prefs.setGlassesCheck(this, GlassesCheck.encode(checkState))

    private fun startOver() {
        checkState = emptyMap()
        saveCheck()
        for (v in checkViews) { v.note.setText(""); styleRow(v) }
        reportCard.visibility = View.GONE
        log("Glasses check: started over")
    }

    private fun openCheck() {
        checkOverlay.visibility = View.VISIBLE
        checkBack.isEnabled = true
        // The phone screen under the overlay is not drawn meanwhile (nor seen by accessibility and uiautomator).
        scroller.visibility = View.INVISIBLE
        checkScroll.scrollTo(0, 0)
        hintJob?.cancel()
        hintJob = lifecycleScope.launch {
            while (true) { refreshHints(); kotlinx.coroutines.delay(1000) }
        }
    }

    private fun closeCheck() {
        hintJob?.cancel()
        checkOverlay.visibility = View.GONE
        checkBack.isEnabled = false
        scroller.visibility = View.VISIBLE
        val imm = getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
        imm.hideSoftInputFromWindow(checkOverlay.windowToken, 0)
    }

    private fun refreshHints() {
        val o = observed()
        for (v in checkViews) {
            val h = GlassesCheck.hint(v.row, o)
            v.hint.text = h.orEmpty()
            v.hint.visibility = if (h == null) View.GONE else View.VISIBLE
        }
    }

    /** What the app saw, from state the controller already keeps (read-only). */
    private fun observed(): CheckObserved {
        val now = android.os.SystemClock.elapsedRealtime()
        return CheckObserved(
            mock = mockSwitch.isChecked,
            registration = controller.registration.value,
            session = controller.sessionStatus.value,
            display = controller.displayStatus.value,
            speech = controller.speechStatus.value,
            battery = controller.batteryLevel,
            device = controller.device.value.takeIf { it != "Worn: -" }.orEmpty(),
            pinchAgoMs = controller.lastPinchAt?.let { now - it },
            lastCard = controller.lastCardTitle,
            lastCardAgoMs = controller.lastCardAt?.let { now - it },
            lastDetectMs = controller.lastDetectMs,
            lastToCardMs = controller.lastToCardMs,
            lastHeard = controller.lastHeard,
            lastPhotoKb = controller.lastPhotoKb,
            cameraDeniedSeen = controller.cameraDeniedSeen,
            offlineSeen = controller.offlineSeen,
            bridgeHealth = if (fixtureSwitch.isChecked) null else bridgeHealth,
            lang = controller.lang,
            consent = Prefs.consent(this),
        )
    }

    private fun shareReport() {
        val version = runCatching {
            val p = packageManager.getPackageInfo(packageName, 0)
            "${p.versionName} (${p.longVersionCode})"
        }.getOrDefault("?")
        val text = GlassesCheck.report(
            CheckReportInfo(
                atMs = System.currentTimeMillis(),
                timeZone = java.util.TimeZone.getDefault(),
                phone = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}",
                android = "${android.os.Build.VERSION.RELEASE} (API ${android.os.Build.VERSION.SDK_INT})",
                appVersion = version,
                mock = mockSwitch.isChecked,
                bridgeUrl = urlField.text.toString(),
            ),
            checkState,
            secrets = listOf(tokenField.text.toString()),
        )
        reportBox.text = text
        reportCard.visibility = View.VISIBLE
        checkScroll.post { checkScroll.smoothScrollTo(0, reportCard.top) }
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Physics Lens glasses check")
            putExtra(Intent.EXTRA_TEXT, text)
        }
        runCatching { startActivity(Intent.createChooser(send, "Share report")) }
            .onFailure { log("Share failed: ${it.message}") }
    }

    private fun log(msg: String) {
        android.util.Log.i("PhysicsLens", msg)
        runOnUiThread {
            if (!::logView.isInitialized) return@runOnUiThread
            logLines.addLast("${timeFmt.format(Date())} $msg")
            while (logLines.size > 40) logLines.removeFirst()
            logView.text = logLines.joinToString("\n")
            logScroll.post { logScroll.fullScroll(View.FOCUS_DOWN) }
        }
    }

    private companion object {
        // DESIGN.md "Phone page and Android".
        const val GROUND = 0xFF0B0D10.toInt()
        const val CARD = 0xFF14181D.toInt()
        const val BORDER = 0xFF2A3038.toInt()
        const val TEXT = 0xFFEEF1F5.toInt()
        const val MUTED = 0xFF9AA3AD.toInt()
        const val ACCENT = 0xFF4DF0FF.toInt()
        const val HOT = 0xFFFF8A4D.toInt()
        /** DESIGN.md "Label" soft: secondary text (the check screen's "App saw" hints). */
        const val SOFT = 0xFFC9D4FF.toInt()
        /** "Seen today" entries shown before "Show all". */
        const val SEEN_SHOWN = 3
        /** Light 1 dp stroke of a secondary action on a card. */
        const val LIGHT_STROKE = 0xFF6B7480.toInt()
        /** The mock "Say" button's question (one of the demo questions). */
        const val SAY = "why does it curve?"
        const val CONSENT_ACTION = "consent"
    }
}
