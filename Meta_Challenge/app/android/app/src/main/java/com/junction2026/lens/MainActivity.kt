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
    private lateinit var regView: TextView
    private lateinit var sessionView: TextView
    private lateinit var displayView: TextView
    private lateinit var batteryView: TextView
    private lateinit var deviceView: TextView
    private lateinit var glassesView: TextView
    private lateinit var consentView: TextView
    private lateinit var logView: TextView
    private lateinit var logScroll: ScrollView

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

    // ---- building blocks (DESIGN.md: 8 px grid, 48 px touch targets, radius 12) ----

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun rounded(fill: Int, stroke: Int? = null) = GradientDrawable().apply {
        cornerRadius = dp(12).toFloat()
        setColor(fill)
        if (stroke != null) setStroke(dp(1), stroke)
    }

    private fun button(label: String, primary: Boolean = false, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 14f
        minHeight = dp(48)
        minimumHeight = dp(48)
        stateListAnimator = null
        setPadding(dp(8), 0, dp(8), 0)
        setTextColor(if (primary) GROUND else TEXT)
        if (primary) setTypeface(typeface, Typeface.BOLD)
        background = if (primary) rounded(ACCENT) else rounded(CARD, BORDER)
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

    private fun label(text: String, size: Float = 14f, color: Int = MUTED, bold: Boolean = false) = TextView(this).apply {
        this.text = text
        textSize = size
        setTextColor(color)
        setLineSpacing(0f, 1.3f)
        if (bold) setTypeface(typeface, Typeface.BOLD)
    }

    private fun section(title: String) = label(title, 14f, MUTED, bold = true).apply { setPadding(dp(4), dp(16), 0, dp(4)) }

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
        Prefs.setBridge(this, url.trim())
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

    private fun buildUi() {
        window.decorView.setBackgroundColor(GROUND)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(8), dp(16), dp(16))
        }
        root.addView(label("Physics Lens", 20f, TEXT, bold = true).apply { setPadding(dp(4), 0, 0, dp(4)) })

        mockSwitch = switch("Mock glasses (no hardware)", Prefs.mock(this)) { on ->
            Prefs.setMock(this, on)
            updateMockVisibility()
            if (on) requestRuntimePermissions()
            if (!on && !LensApp.wearablesReady) log("Restart the app to use real glasses")
        }
        root.addView(mockSwitch)
        fixtureSwitch = switch("Demo data (no bridge)", Prefs.fixture(this)) { on ->
            Prefs.setFixture(this, on)
            controller.useFixture = on
            log(if (on) "Demo data: ball, guitar, not sure (no camera, no bridge)" else "Demo data off: camera + bridge")
        }
        root.addView(fixtureSwitch)
        root.addView(languageRow())

        root.addView(row(
            button("Connect") { connect() },
            button("Explain what I see", primary = true) { controller.trigger() }.apply {
                (layoutParams as LinearLayout.LayoutParams).weight = 1.6f
            },
            button("Disconnect") { disconnect() },
        ))

        // Follow-up question about the object on screen (PROTOCOL POST /ask), same path as a spoken one.
        questionField = field("", "Ask about it (after a result)", password = false).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_SEND
            setOnEditorActionListener { _, _, _ -> askFromField(); true }
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 3f)
        }
        root.addView(row(questionField, button("Ask") { askFromField() }))

        // The phone's state card (DESIGN.md states table, phone column). Hidden when all is well.
        stateTitle = label("", 20f, HOT, bold = true)
        stateBody = label("", 16f, TEXT)
        stateAction = button("", primary = true) { onStateAction() }.apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(8)
            }
            setPadding(dp(24), 0, dp(24), 0)
        }
        stateCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
            background = rounded(CARD, BORDER)
            addView(stateTitle); addView(stateBody); addView(stateAction)
            visibility = View.GONE
        }
        root.addView(stateCard, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(8)
        })

        // The glasses card as text, near the top in both modes (the smoke script reads it with uiautomator).
        glassesView = label("Glasses show: -", 14f, MUTED).apply { setPadding(dp(4), dp(8), dp(4), 0) }
        root.addView(glassesView)

        // Mock rig: the glasses display preview plus the inputs and device states the kit can drive.
        mockSection = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val side = minOf(resources.displayMetrics.widthPixels - dp(32), dp(320))
        previewBox = FrameLayout(this).apply { setBackgroundColor(0xFF000000.toInt()) }
        mockSection.addView(previewBox, LinearLayout.LayoutParams(side, side).apply {
            topMargin = dp(8); gravity = Gravity.CENTER_HORIZONTAL
        })
        mockSection.addView(section("Glasses input (mock)"))
        mockSection.addView(row(
            button("Pinch", primary = false) { rig.pinch() },
            button("Back") { controller.onBack() },
        ))
        // Mock Device Kit speech: a final transcription, as if the wearer said it (kit API simulateTranscription).
        mockSection.addView(row(button("Say: \"$SAY\"") { rig.say(SAY)?.let { log(it) } ?: log("Said: \"$SAY\"") }))
        mockSection.addView(row(
            button("Left") { controller.onNav(NavDirection.LEFT) },
            button("Up") { controller.onNav(NavDirection.UP) },
            button("Down") { controller.onNav(NavDirection.DOWN) },
            button("Right") { controller.onNav(NavDirection.RIGHT) },
        ))
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
        root.addView(mockSection)

        // Set once, so below the controls used during a demo.
        root.addView(section("Bridge"))
        urlField = field(Prefs.bridge(this), "Bridge URL", password = false)
        root.addView(urlField)
        tokenField = field(Prefs.bridgeToken(this), "Bridge token (blank = none)", password = true)
        root.addView(tokenField)
        watch(urlField) { applyBridgeFields() }
        watch(tokenField) { applyBridgeFields() }
        // Dev only, not saved: PROTOCOL forceObjectId, so a bridge without a model key answers with a library object.
        root.addView(field("", "Force object id (dev test, not saved)", password = false).apply {
            watch(this) { controller.forceObjectId = it.trim().ifEmpty { null } }
        })
        // Dev: forget the first-run consent so the next photo asks again (shown in Status).
        root.addView(row(button("Reset consent") { controller.resetConsent(); showConsentStatus() }))

        root.addView(section("Status"))
        regView = label(""); sessionView = label(""); displayView = label(""); batteryView = label(""); deviceView = label("")
        speechView = label("")
        consentView = label("")
        listOf(regView, sessionView, displayView, speechView, batteryView, deviceView, consentView).forEach { root.addView(it) }

        photoLabel = label("Last photo sent: none yet", 14f).apply { setPadding(0, dp(8), 0, 0) }
        root.addView(photoLabel)
        photoView = android.widget.ImageView(this).apply { adjustViewBounds = true; visibility = View.GONE }
        root.addView(photoView, LinearLayout.LayoutParams(dp(135), dp(240)).apply { topMargin = dp(4) })

        logView = TextView(this).apply { typeface = Typeface.MONOSPACE; textSize = 11f; setTextColor(MUTED) }
        logScroll = ScrollView(this).apply { addView(logView); background = rounded(CARD, BORDER); setPadding(dp(8), dp(8), dp(8), dp(8)) }
        root.addView(logScroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(220)).apply { topMargin = dp(8) })

        val scroller = ScrollView(this).apply { addView(root); setBackgroundColor(GROUND) }
        // Android 15 draws edge to edge: keep the content out from under the status and navigation bars.
        scroller.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(scroller)
        updateMockVisibility()
        relabel()
        showConsentStatus()
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

    private fun showState(a: DeviceAlert?) {
        if (a == null && controller.consentPending.value) {
            // DESIGN.md: first-run consent is a full card with one action on the phone too.
            stateTitle.text = Cards.t(Lang.CONSENT_TITLE)
            stateTitle.setTextColor(TEXT) // a decision, not an error: no "hot" colour
            stateBody.text = Cards.t(Lang.CONSENT_BODY) + " " + Cards.t(Lang.CONSENT_NOTE)
            stateAction.tag = CONSENT_ACTION
            stateAction.text = Cards.t(Lang.AGREE)
            stateAction.visibility = View.VISIBLE
            stateCard.visibility = View.VISIBLE
            return
        }
        if (a == null) { stateCard.visibility = View.GONE; return }
        val t = DeviceStates.text(a, controller.batteryLevel)
        stateTitle.setTextColor(HOT)
        stateTitle.text = t.title
        stateBody.text = t.body
        stateAction.tag = t.action
        stateAction.visibility = if (t.action == null) View.GONE else View.VISIBLE
        stateAction.text = when (t.action) {
            PhoneAction.CONNECT -> "Connect"
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
                launch { controller.sessionStatus.collect { sessionView.text = "Session: $it" } }
                launch { controller.displayStatus.collect { displayView.text = "Display: $it" } }
                launch { controller.speechStatus.collect { speechView.text = "Speech: $it" } }
                launch { controller.battery.collect { batteryView.text = "Battery: $it" } }
                launch { controller.device.collect { deviceView.text = it } }
                launch { controller.alert.collect { showState(it); relabel() } }
                launch { controller.consentPending.collect { showState(controller.alert.value); showConsentStatus() } }
                launch { controller.glassesText.collect { glassesView.text = "Glasses show: $it" } }
            }
        }
    }

    /**
     * "Language" picker: Phone language (default) or one of [Lang.SUPPORTED]. Saved in prefs; changes `lang`
     * on the bridge calls, the library text and the fixed card strings without touching the system locale.
     */
    private fun languageRow(): View {
        val tags = listOf("") + Lang.SUPPORTED
        val phone = Lang.tagFor(Locale.getDefault())
        val names = tags.map { if (it.isEmpty()) "Phone: ${Lang.nativeName(phone)}" else "${Lang.nativeName(it)} ($it)" }
        val adapter = object : ArrayAdapter<String>(this, android.R.layout.simple_spinner_item, names) {
            private fun style(v: View, drop: Boolean) = (v as TextView).apply {
                setTextColor(TEXT); textSize = 16f
                setPadding(dp(12), dp(12), dp(12), dp(12))
                if (drop) setBackgroundColor(CARD)
            }
            override fun getView(position: Int, convertView: View?, parent: ViewGroup) =
                style(super.getView(position, convertView, parent), false).apply { text = "${names[position]}  ▾" }
            override fun getDropDownView(position: Int, convertView: View?, parent: ViewGroup) =
                style(super.getDropDownView(position, convertView, parent), true)
        }
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        langSpinner = Spinner(this, Spinner.MODE_DROPDOWN).apply {
            this.adapter = adapter
            setPopupBackgroundDrawable(rounded(CARD, BORDER))
            background = rounded(CARD, BORDER)
            minimumHeight = dp(48)
            setSelection(tags.indexOf(Prefs.lang(this@MainActivity)).coerceAtLeast(0), false)
            onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) {
                    val choice = tags[pos]
                    if (choice == Prefs.lang(this@MainActivity)) return
                    Prefs.setLang(this@MainActivity, choice)
                    controller.setLanguage(Lang.effective(choice, Locale.getDefault()))
                }
                override fun onNothingSelected(p: AdapterView<*>?) = Unit
            }
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 3f).apply {
                setMargins(dp(4), dp(4), dp(4), dp(4))
            }
        }
        val title = label("Language", 16f, TEXT).apply {
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.2f)
            setPadding(dp(4), 0, 0, 0)
        }
        return row(title, langSpinner).apply { gravity = Gravity.CENTER_VERTICAL }
    }

    private fun askFromField() {
        val q = questionField.text.toString()
        if (q.isBlank()) { log("Type a question first"); return }
        controller.ask(q)
        val imm = getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
        imm.hideSoftInputFromWindow(questionField.windowToken, 0)
    }

    private fun connect() {
        applyBridgeFields()
        val mock = mockSwitch.isChecked
        lifecycleScope.launch {
            if (mock) {
                val err = rig.start()
                if (err != null) { log(err); return@launch }
                if (previewBox.childCount == 0) rig.previewView()?.let { previewBox.addView(it) }
                LensApp.wearablesReady = true
                relabel()
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
        relabel()
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
        /** The mock "Say" button's question (one of the demo questions). */
        const val SAY = "why does it curve?"
        const val CONSENT_ACTION = "consent"
    }
}
