package com.junction2026.lens

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.SystemClock
import com.meta.wearable.dat.camera.addCamera
import com.meta.wearable.dat.camera.removeCamera
import com.meta.wearable.dat.camera.types.PhotoData
import com.meta.wearable.dat.camera.types.StreamConfiguration
import com.meta.wearable.dat.camera.types.StreamState
import com.meta.wearable.dat.camera.types.VideoQuality
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.selectors.AutoDeviceSelector
import com.meta.wearable.dat.core.session.DeviceSession
import com.meta.wearable.dat.core.session.DeviceSessionState
import com.meta.wearable.dat.core.types.DatResult
import com.meta.wearable.dat.core.types.DeviceSessionError
import com.meta.wearable.dat.core.types.DonState
import com.meta.wearable.dat.core.types.HingeState
import com.meta.wearable.dat.core.types.LinkState
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionError
import com.meta.wearable.dat.core.types.PermissionStatus
import com.meta.wearable.dat.core.types.RegistrationState
import com.meta.wearable.dat.display.Display
import com.meta.wearable.dat.display.addDisplay
import com.meta.wearable.dat.display.removeDisplay
import com.meta.wearable.dat.display.types.DisplayState
import com.meta.wearable.dat.inputs.addInputs
import com.meta.wearable.dat.inputs.removeInputs
import com.meta.wearable.dat.inputs.types.InputEvent
import com.meta.wearable.dat.inputs.types.InputsConfiguration
import com.meta.wearable.dat.inputs.types.InputsState
import com.meta.wearable.dat.inputs.types.NavDirection
import com.meta.wearable.dat.speech.Speech
import com.meta.wearable.dat.speech.SpeechConfiguration
import com.meta.wearable.dat.speech.addSpeech
import com.meta.wearable.dat.speech.removeSpeech
import com.meta.wearable.dat.speech.types.SpeechState
import com.meta.wearable.dat.speech.types.TranscriptionResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/** Failure of one capture/detect run, with text for the glasses card. */
private open class CaptureFailure(val title: String, val detail: String) : Exception("$title: $detail")

/** Camera permission refused: its own decision card (DESIGN.md "camera denied"). */
private class CameraDenied : CaptureFailure("Camera denied", "Allow camera access in Meta AI")

class GlassesController(
    private val ctx: Context,
    private val scope: CoroutineScope,
    private val bridge: BridgeClient,
    private val log: (String) -> Unit,
    /** Shows the Meta AI permission screen for camera or microphone (needs an Activity result launcher). */
    private val requestPermission: suspend (Permission) -> DatResult<PermissionStatus, PermissionError>,
    private val onUpdateRequired: () -> Unit,
    /** The exact JPEG sent to the bridge, for an on-phone thumbnail. Never stored. */
    private val onPhoto: (ByteArray) -> Unit = {},
) {
    private val _registration = MutableStateFlow("-")
    private val _session = MutableStateFlow("not connected")
    private val _display = MutableStateFlow("-")
    private val _battery = MutableStateFlow("-")
    private val _device = MutableStateFlow("Worn: -")
    private val _alert = MutableStateFlow<DeviceAlert?>(null)
    private val _speech = MutableStateFlow("-")
    private val _glasses = MutableStateFlow("-")
    private val _consent = MutableStateFlow(false)
    /** What the glasses display shows, as one line of text (the phone mirrors it; the smoke script reads it). */
    val glassesText: StateFlow<String> = _glasses
    /** The first-run consent card is on the glasses (the phone shows its own card with Agree). */
    val consentPending: StateFlow<Boolean> = _consent
    /** The glasses' speech capability (`Speech.state`), one word for the phone. */
    val speechStatus: StateFlow<String> = _speech
    val registration: StateFlow<String> = _registration
    val sessionStatus: StateFlow<String> = _session
    val displayStatus: StateFlow<String> = _display
    val battery: StateFlow<String> = _battery
    /** Worn, hinge, thermal and link, one line for the phone. */
    val device: StateFlow<String> = _device
    /** The device or error state the phone card shows (highest priority), or null. */
    val alert: StateFlow<DeviceAlert?> = _alert
    /** Last battery level the glasses reported (for the state card text). */
    @Volatile var batteryLevel: Int? = null
        private set

    private var session: DeviceSession? = null
    private var display: Display? = null
    /** The display reached STARTED (content may be sent). False before, and after the session ends. */
    private val displayReady = MutableStateFlow(false)
    private val sendLock = Mutex()
    /** A trigger that came while the display was still starting; runs once it is ready. */
    private var waitJob: Job? = null
    /** Counts sessions, so the log tells which session an input event or capability belongs to. */
    private var sessionNo = 0
    /** First-run consent card on screen. */
    private var consentShown = false
    private var sessionJobs = mutableListOf<Job>()
    /** Collectors of the current Inputs (state, errors, events); replaced when Inputs are added again. */
    private val inputsJobs = mutableListOf<Job>()
    @Volatile private var inputsActive = false
    private var captureJob: Job? = null
    private var reconnectJob: Job? = null
    /** Follows the glasses' state outside any session (a folded pair ends the session but keeps reporting). */
    private var deviceWatchJob: Job? = null
    /** The device watch saw the Bluetooth link go down and not come back yet. */
    private var linkDown = false
    private var attached = false
    private var userStopping = false
    private var lastDon: DonState? = null
    private var lastHinge: HingeState? = null
    private var concepts: Map<String, String> = emptyMap()
    private val busy = AtomicBoolean(false) // one capture at a time, whatever the trigger
    private var connecting = false

    /**
     * Fixture mode (default off): no camera, no network. Each trigger answers with the next v1 fixture
     * from `assets/fixture/` (ball, guitar, low confidence) and stills come from `assets/fixture/media/`.
     */
    @Volatile var useFixture = false

    /** Dev only, not saved: sent as PROTOCOL `forceObjectId` so a keyless bridge answers with that object. */
    @Volatile var forceObjectId: String? = null
    private var fixtureIndex = 0

    // Screen state. Touched only on the main thread (inside [scope]).
    private var current: Detection? = null
    private var explainer: ExplainerState? = null
    /** True while [current] comes from the bundled library (offline), not from a photo. */
    private var currentSaved = false
    /** Offline picker, while it is on screen. */
    private var picker: OfflinePicker? = null
    private var pickerIndex = 0
    private var library: Map<String, OfflineObject>? = null
    /** Answer card of a follow-up question, while it is on screen. */
    private var answerDet: Detection? = null
    private var answerPos: Pair<Int, Int>? = null
    /** Spoken questions (`session.addSpeech()`); listens only while a library result is on screen. */
    private var speech: Speech? = null

    /**
     * Language for the bridge (`lang` on `/detect` and `/ask`, `/objects?lang=`) and the fixed card strings:
     * the phone screen's picker, else the phone language. Change it with [setLanguage].
     */
    @Volatile var lang: String = Cards.lang
        private set
    /** Last non-transient card, re-sent after a notice or when the glasses come back. */
    private var lastContent: CardSpec? = null
    /** Auto-dismissing state card on screen (battery, heat), if any. */
    private var notice: DeviceAlert? = null
    private var noticeJob: Job? = null
    /** Device and error states in force. */
    private val active = LinkedHashSet<DeviceAlert>()
    private val watch = DeviceWatch()
    /** Last explainer action (pinch or card button), to swallow the twin of a pinch that also clicks a button. */
    private var lastNavAt = 0L
    private val media = SceneMedia(scope) { path ->
        if (useFixture) readAsset("fixture$path") else bridge.fetchBytes(path)
    }

    // ---- connect / disconnect ----

    /** The mock feeds the phone camera in sensor orientation (sideways); real glasses frames are already upright. */
    private var rotateLandscape = false

    /** Registers (real mode) and starts a device session. Mock must already be enabled by the caller. */
    suspend fun connect(activity: Activity, mock: Boolean) {
        rotateLandscape = mock
        fixtureIndex = 0 // demo data starts with the ball on every Connect (a predictable demo)
        reconnectJob?.cancel()
        // "Glasses busy" card: Connect takes the glasses back with a new session.
        session?.takeIf { DeviceAlert.TAKEN_OVER in active }?.let {
            log("Taking the glasses back")
            userStopping = true
            stopSession(it)
            teardown("Disconnected", keepAlerts = true)
        }
        if (connecting || session != null) { log("Already connected or connecting"); return }
        connecting = true
        try {
            if (!mock && !LensApp.wearablesReady) {
                log("Wearables not initialised (${LensApp.initError ?: "restart the app after switching mock off"})")
                return
            }
            scope.launch { Wearables.registrationState.collect { _registration.value = it.name } }
                .also { sessionJobs += it }
            scope.launch { Wearables.registrationErrorStream.collect { log("Registration error: ${it.description}") } }
                .also { sessionJobs += it }

            if (!mock && Wearables.registrationState.value != RegistrationState.REGISTERED) {
                log("Opening Meta AI to register...")
                Wearables.startRegistration(activity)
                val ok = withTimeoutOrNull(180_000) {
                    Wearables.registrationState.first { it == RegistrationState.REGISTERED }
                }
                if (ok == null) { log("Registration did not finish"); return }
            }
            watchDevice()
            refreshLibrary()
            if (!startSession(tries = 6)) _session.value = "no session"
        } finally {
            connecting = false
        }
    }

    /** Creates and starts a session. False when no glasses answered in [tries] attempts. */
    private suspend fun startSession(tries: Int): Boolean {
        // Mock devices show up a moment after pairing, so retry a few times.
        var s: DeviceSession? = null
        var lastErr = ""
        for (i in 0 until tries) {
            Wearables.createSession(AutoDeviceSelector(filter = { it.isDisplayCapable() })).fold(
                onSuccess = { s = it },
                onFailure = { e, _ -> lastErr = e.description },
            )
            if (s != null) break
            if (i < tries - 1) delay(1000)
        }
        val sess = s ?: run { log("No session: $lastErr"); return false }
        session = sess
        sessionNo++
        attached = false
        userStopping = false
        sessionJobs += scope.launch { sess.state.collect { onSessionState(sess, it) } }
        sessionJobs += scope.launch {
            sess.errors.collect { e ->
                log("Session error: ${e.description}")
                if (e == DeviceSessionError.DAT_APP_ON_THE_GLASSES_UPDATE_REQUIRED) onUpdateRequired()
                DeviceStates.forSessionError(e.name)?.let { raise(it) }
            }
        }
        sessionJobs += scope.launch { sess.deviceInfo.collect { onDeviceInfo(it) } }
        sess.start()
        return true
    }

    fun disconnect() {
        reconnectJob?.cancel()
        waitJob?.cancel()
        deviceWatchJob?.cancel()
        deviceWatchJob = null
        userStopping = true
        session?.let { stopSession(it) }
        teardown("Disconnected", keepAlerts = false)
        watch.reset()
        linkDown = false
        lastDon = null
        lastHinge = null
    }

    /**
     * `Wearables.devices` / `devicesMetadata` (SDK): the glasses' state with or without a session, so a
     * fold (which ends the session) is still seen, and so is the unfold that lets us reconnect.
     */
    private fun watchDevice() {
        if (deviceWatchJob?.isActive == true) return
        deviceWatchJob = scope.launch {
            Wearables.devices.collectLatest { ids ->
                val flows = ids.mapNotNull { Wearables.devicesMetadata[it] }
                val flow = flows.firstOrNull { it.value.isDisplayCapable() } ?: flows.firstOrNull() ?: return@collectLatest
                flow.collect { onDeviceInfo(it) }
            }
        }
    }

    /** Capabilities first, then the session: removing them from a stopped session does not free them. */
    private fun stopSession(s: DeviceSession) {
        inputsJobs.forEach { it.cancel() }
        runCatching { speech?.stop() }
        runCatching { s.removeSpeech() }
        runCatching { s.removeInputs() }.onSuccess { r -> r.onFailure { e, _ -> log("Inputs #$sessionNo not removed: ${e.description}") } }
        runCatching { s.removeDisplay() }
        runCatching { s.stop() }
    }

    /** [keepAlerts]: the session ended by itself, so the wearer still needs to see why. */
    private fun teardown(status: String, keepAlerts: Boolean) {
        captureJob?.cancel()
        inputsJobs.forEach { it.cancel() }
        inputsJobs.clear()
        inputsActive = false
        noticeJob?.cancel()
        sessionJobs.forEach { it.cancel() }
        sessionJobs.clear()
        session?.let {
            runCatching { speech?.stop() }
            runCatching { it.removeSpeech() }
            runCatching { it.removeInputs() }
            runCatching { it.removeDisplay() }
        }
        session = null
        display = null
        displayReady.value = false
        waitJob?.cancel()
        consentShown = false
        _consent.value = false
        speech = null
        _speech.value = "-"
        answerDet = null
        attached = false
        explainer = null
        current = null
        picker = null
        lastContent = null
        notice = null
        media.clear()
        busy.set(false)
        if (keepAlerts) active.remove(DeviceAlert.CAMERA_DENIED) else active.clear()
        publish()
        _glasses.value = "-"
        _session.value = status
        _display.value = "-"
    }

    // ---- session / device state ----

    private suspend fun onSessionState(sess: DeviceSession, st: DeviceSessionState) {
        log("Session: $st")
        when (st) {
            DeviceSessionState.IDLE, DeviceSessionState.STARTING, DeviceSessionState.STOPPING ->
                _session.value = st.name
            DeviceSessionState.STARTED -> {
                _session.value = "STARTED"
                val wasAway = DeviceAlert.TAKEN_OVER in active || DeviceAlert.DISCONNECTED in active
                lower(DeviceAlert.TAKEN_OVER)
                lower(DeviceAlert.DISCONNECTED)
                if (!attached) { attached = true; scope.launch { attachCapabilities(sess) } }
                else if (wasAway) restore()
            }
            // The SDK pauses a session when another experience takes the glasses over. Taking them off
            // or folding them may pause it too; those have their own cards, so they win.
            DeviceSessionState.PAUSED -> {
                _session.value = "PAUSED"
                if (DeviceAlert.OFF !in active && DeviceAlert.FOLDED !in active) raise(DeviceAlert.TAKEN_OVER)
            }
            DeviceSessionState.STOPPED -> {
                // Terminal. Ours (Disconnect): done. Not ours (Bluetooth drop, fold, glasses ended it):
                // recreate the session (Plan.md section 5), unless another app has the glasses (then the
                // wearer taps Connect when it is done). Folded / taken off: their own card, and the
                // reconnect waits until the glasses are open and worn again.
                val unexpected = !userStopping
                val takenOver = DeviceAlert.TAKEN_OVER in active
                teardown(if (unexpected) "Stopped by the glasses" else "Disconnected", keepAlerts = unexpected)
                if (unexpected && !takenOver) {
                    if (!blockedByDevice()) raise(DeviceAlert.DISCONNECTED)
                    startReconnect()
                }
            }
        }
    }

    /** Folded or taken off: no point starting a session; the device watch says when that ends. */
    private fun blockedByDevice() = DeviceAlert.FOLDED in active || DeviceAlert.OFF in active || linkDown

    /**
     * Plan.md section 5: recreate the session after a Bluetooth drop. One loop at a time (a session that
     * fails to start does not restart the count). Tries only count while the glasses are open and worn.
     */
    private fun startReconnect() {
        if (reconnectJob?.isActive == true) return
        reconnectJob = scope.launch {
            var tries = 0
            while (tries < RECONNECT_TRIES) {
                delay(RECONNECT_EVERY_MS)
                if (session != null) return@launch
                if (blockedByDevice()) continue
                tries++
                log("Reconnecting ($tries/$RECONNECT_TRIES)...")
                if (!startSession(tries = 1)) continue
                val st = withTimeoutOrNull(8_000) {
                    session?.state?.first { it == DeviceSessionState.STARTED || it == DeviceSessionState.STOPPED }
                }
                if (st == DeviceSessionState.STARTED) { log("Reconnected"); return@launch }
            }
            log("Could not reconnect: tap Connect")
        }
    }

    private suspend fun attachCapabilities(sess: DeviceSession) {
        val addDisplayResult = sess.addDisplay()
        val d = addDisplayResult.getOrNull()
        if (d == null) {
            log("Display unavailable: ${addDisplayResult.errorOrNull()?.description}")
        } else {
            display = d
            // Ready for triggers only after the first card is drawn: a card sent in the same moment as that
            // first one failed with "Failed to render display content" on the emulator.
            var firstDrawn = false
            sessionJobs += scope.launch {
                d.state.collect {
                    _display.value = it.name
                    displayReady.value = firstDrawn && it == DisplayState.STARTED
                }
            }
            val ready = withTimeoutOrNull(10_000) { d.state.first { it == DisplayState.STARTED } }
            if (ready == null) log("Display did not start")
            else if (DeviceStates.suppressesDisplay(active)) clearDisplay()
            else if (lastContent != null) restore() else showIdle()
            firstDrawn = true
            displayReady.value = d.state.value == DisplayState.STARTED
        }
        addInputsTo(sess)
        attachSpeech(sess)
    }

    /**
     * Pinch, D-pad, Back and the capture button (`addInputs`). The SDK stops Inputs by itself when the glasses
     * are taken off ("Inputs stopped: glasses doffed", state INACTIVE) and does not restart them when they are
     * put on again, so [restartInputsIfStopped] adds them again then.
     */
    private fun addInputsTo(sess: DeviceSession) {
        val no = sessionNo
        inputsJobs.forEach { it.cancel() }
        inputsJobs.clear()
        sess.addInputs(InputsConfiguration()).fold(
            onSuccess = { inputs ->
                log("Inputs added (session #$no)")
                inputsJobs += scope.launch {
                    inputs.state.collect { inputsActive = it == InputsState.ACTIVE; log("Inputs #$no: ${it.name}") }
                }
                inputsJobs += scope.launch { inputs.errors.collect { e -> if (e != null) log("Inputs #$no error: $e") } }
                // Mock Device Kit 1.0.1 after powerOff/powerOn: this session's Inputs reports ACTIVE but the kit's
                // pinch never reaches it (README "Known issues": a kit defect; Disconnect + Connect fixes it).
                inputsJobs += scope.launch {
                    inputs.events.collect { ev ->
                        log("Input #$no: ${ev.javaClass.simpleName}")
                        when (ev) {
                            is InputEvent.Select -> onSelect()
                            is InputEvent.Capture -> trigger()
                            is InputEvent.Nav -> onNav(ev.direction)
                            is InputEvent.Back -> onBack()
                            is InputEvent.Button, is InputEvent.Drag -> Unit
                        }
                    }
                }
            },
            // Real glasses may refuse inputs; Display buttons and the phone buttons still work.
            onFailure = { e, _ -> log("Inputs unavailable (session #$no): ${e.description}") },
        )
    }

    /** Glasses worn and open again: if the SDK stopped Inputs meanwhile, add them again on the same session. */
    private fun restartInputsIfStopped() {
        val sess = session ?: return
        if (inputsActive || sess.state.value != DeviceSessionState.STARTED) return
        log("Inputs stopped while the glasses were off: adding them again")
        runCatching { sess.removeInputs() }
        addInputsTo(sess)
    }

    /**
     * Spoken follow-up questions: `DeviceSession.addSpeech()` (mwdat-speech 1.0.1). A final transcription goes
     * through the same `/ask` path as the phone's Ask button. Optional: without it the phone field still works.
     */
    private suspend fun attachSpeech(sess: DeviceSession) {
        var status = Wearables.checkPermissionStatus(Permission.MICROPHONE).getOrNull()
        if (status !is PermissionStatus.Granted) status = requestPermission(Permission.MICROPHONE).getOrNull()
        if (status !is PermissionStatus.Granted) { log("Microphone not allowed: spoken questions off"); return }
        sess.addSpeech(SpeechConfiguration()).fold(
            onSuccess = { sp ->
                speech = sp
                sessionJobs += scope.launch { sp.state.collect { _speech.value = it.name } }
                sessionJobs += scope.launch { sp.transcriptions.collect { r -> if (r != null) onHeard(r) } }
                sessionJobs += scope.launch {
                    sp.errors.collect { e -> if (e != null) log("Speech error: ${e.description} ${sp.errorDetails.value}") }
                }
                log("Speech ready (listens while a result is on screen)")
                setListening(AskFlow.target(current) is AskTarget.Object && (explainer != null || answerDet != null))
            },
            onFailure = { e, _ -> log("Speech unavailable: ${e.description}") },
        )
    }

    private fun onHeard(r: TranscriptionResult) {
        if (!r.isFinal || r.text.isBlank()) return
        log("Heard: \"${r.text}\" (${"%.2f".format(r.confidence)})")
        ask(r.text)
    }

    /** Microphone on only while a question makes sense (a library result or an answer is on screen). */
    private fun setListening(want: Boolean) {
        val sp = speech ?: return
        when (sp.state.value) {
            SpeechState.STOPPED -> if (want) sp.start().onFailure { e, _ -> log("Speech did not start: ${e.description}") }
            SpeechState.STARTED, SpeechState.STARTING -> if (!want) sp.stop()
            SpeechState.STOPPING -> Unit
        }
    }

    private fun onDeviceInfo(d: com.meta.wearable.dat.core.types.Device) {
        batteryLevel = d.batteryLevel
        _battery.value = "${d.batteryLevel}%"
        _device.value = "Worn: ${d.donState.name} · Hinge: ${d.hingeState.name} · Heat: ${d.thermalLevel.name} · Link: ${d.linkState.name}"
        val off = d.donState == DonState.DOFFED && lastDon != DonState.DOFFED
        val folded = d.hingeState == HingeState.CLOSED && lastHinge != HingeState.CLOSED
        if ((off || folded) && busy.get()) {
            log("Glasses ${if (off) "taken off" else "folded"}: cancelling capture")
            captureJob?.cancel()
        }
        lastDon = d.donState
        lastHinge = d.hingeState
        val snap = DeviceSnapshot(
            donned = when (d.donState) { DonState.DONNED -> true; DonState.DOFFED -> false; else -> null },
            folded = when (d.hingeState) { HingeState.CLOSED -> true; HingeState.OPEN -> false; else -> null },
            battery = d.batteryLevel,
            thermal = d.thermalLevel.name,
            connected = when (d.linkState) { LinkState.CONNECTED -> true; LinkState.DISCONNECTED -> false; else -> null },
        )
        for (c in watch.update(snap)) when {
            c is DeviceChange.Raise && c.alert == DeviceAlert.DISCONNECTED -> {
                // Seen on the emulator: after the link drops the old session still says STARTED but can
                // no longer draw. End it ourselves; the STOPPED handler recreates it once the link is back.
                linkDown = true
                raise(DeviceAlert.DISCONNECTED)
                session?.let { log("Link lost: ending the session to recreate it"); stopSession(it) }
            }
            // The card stays until the new session has started (STARTED clears it).
            c is DeviceChange.Clear && c.alert == DeviceAlert.DISCONNECTED -> { linkDown = false; log("Link back") }
            c is DeviceChange.Raise -> raise(c.alert)
            c is DeviceChange.Clear -> lower(c.alert)
        }
    }

    // ---- device and error states ----

    private fun publish() { _alert.value = DeviceStates.top(active) }

    private fun raise(a: DeviceAlert) {
        if (!active.add(a)) return
        log("State: $a")
        if (a == DeviceAlert.OFF || a == DeviceAlert.FOLDED) {
            active.remove(DeviceAlert.TAKEN_OVER)
            if (session == null && !linkDown) active.remove(DeviceAlert.DISCONNECTED) // the session ended because of this
        }
        publish()
        scope.launch { applyGlasses(a) }
    }

    private fun lower(a: DeviceAlert) {
        if (!active.remove(a)) return
        log("State cleared: $a")
        if ((a == DeviceAlert.OFF || a == DeviceAlert.FOLDED) && !blockedByDevice()) restartInputsIfStopped()
        val wasSuppressing = DeviceStates.text(a).glasses.let { it == GlassesShow.BLANK || it == GlassesShow.NOTHING }
        publish()
        scope.launch {
            if (notice == a) dismissNotice("state cleared")
            else if (wasSuppressing && !DeviceStates.suppressesDisplay(active)) restore()
        }
    }

    private suspend fun applyGlasses(a: DeviceAlert) {
        val t = DeviceStates.text(a, batteryLevel)
        when (t.glasses) {
            GlassesShow.BLANK -> { noticeJob?.cancel(); notice = null; clearDisplay() }
            GlassesShow.NOTHING -> noticeJob?.cancel()
            GlassesShow.CARD_DECIDE -> show(Cards.error(t.title, t.body, ::trigger, ::done))
            GlassesShow.CARD_AUTO -> {
                noticeJob?.cancel()
                notice = a
                show(Cards.notice(t.title, t.body) { scope.launch { if (navAllowed()) dismissNotice("OK") } }, record = false)
                noticeJob = scope.launch {
                    delay(DeviceStates.AUTO_DISMISS_MS)
                    scope.launch { dismissNotice("after ${DeviceStates.AUTO_DISMISS_MS / 1000} s") } // outside this job, which dismissNotice cancels
                }
            }
        }
    }

    /** Ends the auto-dismissing card: back to what was on screen. [how] goes to the log. */
    private suspend fun dismissNotice(how: String) {
        val a = notice ?: return
        log("$a card dismissed ($how)")
        notice = null
        noticeJob?.cancel()
        lastNavAt = SystemClock.uptimeMillis() // the pinch that dismissed it must not also act
        if (active.remove(a)) publish()
        restore()
    }

    private suspend fun clearDisplay() {
        val d = display ?: return
        if (d.state.value != DisplayState.STARTED) return // the session already ended: nothing on screen
        sendLock.withLock {
            d.clearDisplay().onSuccess { _glasses.value = "(blank)" }.onFailure { e, _ -> log("Clear failed: ${e.description}") }
        }
    }

    /**
     * Mock only, labelled "simulate" on the phone: the Mock Device Kit has no call for "another app took the
     * glasses". This feeds the session state the SDK reports for it (PAUSED, then STARTED when it leaves)
     * into the same handler the real state flow uses.
     */
    val takenOver: Boolean get() = DeviceAlert.TAKEN_OVER in active

    fun simulateTakeOver(takeOver: Boolean) {
        val s = session ?: run { log("Not connected"); return }
        scope.launch {
            // Stands in for the other app drawing over our card (the kit cannot run a second app).
            if (takeOver) clearDisplay()
            onSessionState(s, if (takeOver) DeviceSessionState.PAUSED else DeviceSessionState.STARTED)
        }
    }

    // ---- display helpers ----

    /**
     * [record]: remember it for [restore] (everything but transient notices). True when the card is on the
     * display now. A card sent before the display reached STARTED is kept and shown when it does (sending
     * it early is what gave "Invalid display state for operation").
     */
    private suspend fun show(card: CardSpec, record: Boolean = true): Boolean {
        if (record) {
            lastContent = card
            if (notice != null) {
                active.remove(notice!!); notice = null; noticeJob?.cancel(); publish()
            }
        }
        if (DeviceStates.suppressesDisplay(active)) return false // taken off, folded, no link, not ours
        val d = display ?: return false
        if (d.state.value != DisplayState.STARTED) { log("Display not ready (${d.state.value}): card kept for later"); return false }
        var ok = false
        // One card at a time: two sends in the same moment make one of them fail.
        sendLock.withLock {
            d.sendContent(Cards.render(card))
                .onSuccess { ok = true; _glasses.value = card.summary }
                .onFailure { e, _ -> log("Display error: ${e.description}") }
        }
        return ok
    }

    private suspend fun restore(): Boolean = show(lastContent ?: Cards.idle(), record = false)

    suspend fun showIdle() {
        setListening(false)
        show(Cards.idle())
    }

    // ---- the capture loop ----

    /**
     * Pinch, capture button, display "Again"/"Try again" and the phone button all land here. [TriggerGate]
     * decides: refused with a log line (not connected, glasses off / folded / gone), wait for the display
     * (it has not reached STARTED yet), the first-run consent card, or run.
     */
    fun trigger() {
        val blocking = TriggerGate.blocking(active)
        val d = TriggerGate.decide(
            // While Connect is still creating the session, a trigger waits for the display like any other.
            connected = session != null || connecting,
            displayReady = displayReady.value,
            blocking = blocking,
            busy = busy.get(),
            needsConsent = TriggerGate.needsConsent(Prefs.consent(ctx), useFixture),
        )
        when (d) {
            TriggerDecision.RUN -> Unit
            TriggerDecision.WAIT_DISPLAY -> { waitForDisplayThenTrigger(); return }
            TriggerDecision.CONSENT -> { log(TriggerGate.refusal(d, blocking)); scope.launch { showConsent() }; return }
            else -> { log(TriggerGate.refusal(d, blocking)); return }
        }
        if (!busy.compareAndSet(false, true)) { log(TriggerGate.refusal(TriggerDecision.BUSY, null)); return }
        captureJob = scope.launch {
            try {
                explainer = null
                picker = null
                answerDet = null
                setListening(false)
                lower(DeviceAlert.CAMERA_DENIED)
                runCapture()
            } finally {
                busy.set(false)
            }
        }
    }

    /** One waiting trigger at a time; it runs when the display is ready, or gives up with a clear line. */
    private fun waitForDisplayThenTrigger() {
        if (waitJob?.isActive == true) { log("Still waiting for the glasses display"); return }
        log(TriggerGate.refusal(TriggerDecision.WAIT_DISPLAY, null))
        waitJob = scope.launch {
            val ready = withTimeoutOrNull(DISPLAY_WAIT_MS) { displayReady.first { it } }
            if (ready == null || session == null) log("Glasses display not ready: try again")
            else trigger()
        }
    }

    // ---- first-run consent (DESIGN.md states table, PROTOCOL device state `first_run`) ----

    private suspend fun showConsent() {
        explainer = null
        picker = null
        answerDet = null
        setListening(false)
        consentShown = true
        _consent.value = true
        show(Cards.consent(onAgree = { agreeConsent() }, onNotNow = { if (navAllowed()) consentNotNow() }))
    }

    /** Agree (pinch, the glasses button or the phone card): remembered in prefs, then the photo is taken. */
    fun agreeConsent() {
        if (!consentShown) return
        consentShown = false
        _consent.value = false
        Prefs.setConsent(ctx, true)
        log("Consent given: photos allowed")
        lastNavAt = SystemClock.uptimeMillis() // the pinch that agreed must not also act on the next card
        trigger()
    }

    /** Not now (the button or Back): idle card; the next trigger asks again. */
    private fun consentNotNow() {
        if (!consentShown) return
        consentShown = false
        _consent.value = false
        log("Consent: not now (asked again on the next photo)")
        scope.launch { showIdle() }
    }

    /** Phone dev button: forget the agreement so the next photo asks again. */
    fun resetConsent() {
        Prefs.setConsent(ctx, false)
        log("Consent reset: the next photo asks first")
    }

    private suspend fun runCapture() {
        try {
            show(Cards.looking())
            var receivedAt = 0L
            val det = if (useFixture) {
                delay(400)
                nextFixture()
            } else {
                val tCapture = System.currentTimeMillis()
                val (jpeg, focus) = withTimeout(30_000) { takePhotoJpeg() }
                log("Photo ${jpeg.size / 1024} KB + aim crop ${focus.size / 1024} KB, sending")
                onPhoto(jpeg)
                bridge.detect(jpeg, focus, tCapture, lang, forceObjectId?.ifBlank { null })
                    .also { receivedAt = SystemClock.elapsedRealtime() }
            }
            log("Detected ${det.objectId} '${det.label}' conf=${det.confidence}" +
                (if (det.lowConfidence) " lowConfidence" else "") +
                (if (det.lenses.isNotEmpty() || det.steps.isNotEmpty()) " lenses=${det.lenses.size} steps=${det.steps.size}" else "") +
                (det.lang?.let { " lang=$it" } ?: "") + (if (det.media != null) " media" else "") +
                (det.sketch?.let { " sketch='${it.label}' chapters=${it.chapters.size}" } ?: "") +
                (det.sketchError?.let { " sketchError=$it" } ?: ""))
            if (present(det) && receivedAt > 0) ackRendered(det.reqId, receivedAt)
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            showError("Camera timed out", "The glasses did not deliver a photo")
        } catch (e: CancellationException) {
            withContext(NonCancellable) {
                show(Cards.error("Cancelled", "Capture stopped", ::trigger, ::done))
            }
            throw e
        } catch (e: CameraDenied) {
            log("Camera permission denied")
            raise(DeviceAlert.CAMERA_DENIED)
        } catch (e: CaptureFailure) {
            log("Capture failed: ${e.message}")
            showError(e.title, e.detail)
        } catch (e: BridgeException) {
            log("Bridge failed: ${e.message}")
            when {
                e.offline -> showOfflinePicker()
                e.unauthorized -> showError("Bridge token", Cards.t(Lang.TOKEN))
                else -> showError("Couldn't explain that", e.userMessage)
            }
        } catch (e: Exception) {
            log("Unexpected: $e")
            showError("Something went wrong", e.javaClass.simpleName)
        }
    }

    private suspend fun showError(title: String, detail: String) =
        show(Cards.error(title, detail, ::trigger, ::done))

    private fun done() {
        scope.launch {
            explainer = null
            picker = null
            answerDet = null
            lower(DeviceAlert.CAMERA_DENIED)
            showIdle()
        }
    }

    // ---- offline picker ----

    private suspend fun library(): Map<String, OfflineObject> {
        library?.let { return it }
        return loadLibrary(fetched = null) // offline: the saved copy for this language, else bundled English
    }

    /** Asks the bridge for the library in [lang] (not in demo-data mode), then picks what to use. */
    suspend fun refreshLibrary() {
        val fetched = if (useFixture) null else bridge.objectsText(lang)
        loadLibrary(fetched)
    }

    /**
     * [LibraryChoice]: the bridge's text in this language (saved to an app-private file for a later offline
     * start; library text, not user data), else the saved copy, else the bridge's English, else the bundled
     * English `objects.json`.
     */
    private suspend fun loadLibrary(fetched: String?): Map<String, OfflineObject> {
        val want = lang
        val (pick, lib) = withContext(Dispatchers.IO) {
            val file = LibraryChoice.cacheName(want)?.let { File(File(ctx.filesDir, "library"), it) }
            val cached = file?.takeIf { it.isFile }?.let { runCatching { it.readText() }.getOrNull() }
            val bundled = runCatching { ctx.assets.open(OfflineCards.ASSET_NAME).use { it.readBytes().toString(Charsets.UTF_8) } }
                .getOrDefault("{}")
            val pick = LibraryChoice.choose(want, fetched, cached, bundled)
            if (pick.save && file != null) runCatching {
                file.parentFile?.mkdirs()
                val tmp = File(file.parentFile, file.name + ".tmp")
                tmp.writeText(pick.text)
                if (!tmp.renameTo(file)) { file.delete(); tmp.renameTo(file) }
            }.onFailure { log("Could not save the library: $it") }
            pick to runCatching { OfflineCards.parse(pick.text) }.getOrDefault(emptyMap())
        }
        if (want != lang) return lib // the language changed meanwhile; that refresh wins
        library = lib
        concepts = conceptsOf(pick.text)
        log("Library: ${pick.source.name.lowercase()}, ${pick.lang}, ${lib.size} objects" + if (pick.save) ", saved" else "")
        return lib
    }

    /** objectId -> `concept` line of the library text (optional, for the old single result card). */
    private fun conceptsOf(text: String): Map<String, String> = runCatching {
        val arr = org.json.JSONObject(text).getJSONArray("objects")
        buildMap {
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val c = o.optString("concept")
                if (c.isNotBlank()) put(o.getString("id"), c)
            }
        }
    }.getOrDefault(emptyMap())

    /**
     * The phone's language picker (or the phone language). Fixed card strings follow at once; the library is
     * fetched again in that language. An idle card is redrawn; a result on screen keeps its language.
     */
    fun setLanguage(tag: String) {
        if (tag == lang) return
        lang = tag
        Cards.lang = tag
        log("Language: $tag")
        scope.launch {
            library = null
            if (session != null) refreshLibrary()
            val idle = current == null && explainer == null && picker == null && answerDet == null && !busy.get()
            if (idle && session != null && display != null) showIdle()
        }
    }

    /** Offline card: pick a saved library object with left/right, open with pinch. */
    private suspend fun showOfflinePicker() {
        val lib = library()
        if (lib.isEmpty()) { showError("Offline", "Can't reach the bridge. Try again later."); return }
        val p = OfflinePicker(lib.keys.toList(), pickerIndex.coerceIn(0, lib.size - 1))
        picker = p
        pickerIndex = p.index
        explainer = null
        answerDet = null
        current = null
        val o = lib.getValue(p.current)
        show(Cards.offlinePicker(
            p, o.label, o.tagline,
            onOpen = { scope.launch { pickerOpen() } },
            onRetry = { if (navAllowed()) trigger() },
        ))
    }

    private suspend fun pickerOpen() {
        val p = picker ?: return
        if (!navAllowed()) return
        val o = library()[p.current] ?: return
        picker = null
        log("Offline: opening saved card ${o.id}")
        present(OfflineConvert.toDetection(OfflineCards.toDetect(o)), saved = true)
    }

    // ---- result and explainer ----

    /**
     * Picks the result screen. An old bridge (no v1 fields) lands on exactly the cards it always did.
     * True when the result card is on the display now (for the `/rendered` ack).
     */
    private suspend fun present(det: Detection, saved: Boolean = false): Boolean {
        media.clear()
        current = det
        currentSaved = saved
        explainer = null
        answerDet = null
        return when (val v = DetectionParser.verdict(det)) {
            is Verdict.NotSure -> { setListening(false); show(Cards.notSure(v.guess, ::trigger, ::done)) }
            is Verdict.Unrecognised -> { setListening(false); show(Cards.result(Cards.t(Lang.NOT_SURE), null, v.answer, ::trigger, ::done)) }
            is Verdict.Plain -> { setListening(true); show(Cards.result(det.label, concepts[det.objectId], det.answer, ::trigger, ::done)) }
            is Verdict.Explainer -> showExplainer(ExplainerState(v.tracks))
            is Verdict.Sketched -> showExplainer(ExplainerState(v.tracks))
        }
    }

    /**
     * PROTOCOL "Phone-only latency": tell the bridge the card for [reqId] is on the display, with the time
     * from receiving the HTTP response to the card being shown. Fire-and-forget: never blocks or fails the UI.
     */
    private fun ackRendered(reqId: String?, receivedAt: Long) {
        if (reqId == null) return
        val renderMs = SystemClock.elapsedRealtime() - receivedAt
        scope.launch {
            val code = runCatching { bridge.rendered(reqId, renderMs) }.getOrDefault(-1)
            log("Rendered ack ${renderMs} ms: " + when (code) {
                200 -> "logged by the bridge"
                404 -> "bridge does not know it (404)"
                -1 -> "not sent"
                else -> "HTTP $code"
            })
        }
    }

    private fun stillPaths(det: Detection, track: Track): List<String?> {
        val base = det.media?.base ?: return emptyList()
        return DetectionParser.stills(det, track.lensId).map { DetectionParser.stillPath(base, it) }
    }

    /** Shows [s] at once (with the still if cached), then swaps the still in when it arrives. */
    private suspend fun showExplainer(s: ExplainerState): Boolean {
        val det = current ?: return false
        explainer = s
        answerDet = null
        setListening(AskFlow.target(det) is AskTarget.Object)
        val paths = stillPaths(det, s.track)
        media.prefetch(paths.filterNotNull())
        val path = if (s.isOverview) null else paths.getOrNull(s.step)
        val cached = path?.let { cardStill(it, s) }
        val shown = show(explainerCard(det, s, cached))
        if (path != null && cached == null && !media.hasFailed(path)) {
            scope.launch {
                val bmp = runCatching { media.get(path) }.getOrNull()
                // Only if the wearer is still on this card; a failed still keeps the text card.
                if (bmp != null && explainer === s && current === det) show(explainerCard(det, s, cardStill(path, s)))
                else if (bmp == null) log("Still unavailable: $path")
            }
        }
        return shown
    }

    /** The still sized for this step card: the longer the caption, the lower the picture ([StillFrame]). */
    private fun cardStill(path: String, s: ExplainerState): Bitmap? {
        val caption = "${Cards.t(Lang.STEP)} ${s.counter}. ${s.track.steps[s.step]}"
        val metaLines = (if (s.tracks.size > 1) 1 else 0) + (if (currentSaved) 1 else 0)
        return media.forCard(path, caption.length, metaLines)
    }

    private fun explainerCard(det: Detection, s: ExplainerState, still: Bitmap?): CardSpec {
        val sk = det.sketch?.takeIf { det.objectId == "unknown" }
        return Cards.explainer(
            s = s,
            // A sketch: its own label and one-line answer (the model's photo answer is not about the sketch).
            label = sk?.label ?: det.label,
            summary = if (sk != null) sk.answer else det.summary ?: concepts[det.objectId],
            answer = if (sk != null) null else det.answer,
            still = still,
            onPrimary = { scope.launch { explainerPrimary() } },
            onSecondary = { scope.launch { explainerSecondary() } },
            saved = currentSaved,
            sketch = sk != null,
        )
    }

    // ---- follow-up question (PROTOCOL POST /ask) ----

    /**
     * A question about the object on screen, typed on the phone or spoken on the glasses. "Looking..." then
     * the answer card; its primary action opens the lens and step the bridge's `lensHint` points at.
     */
    fun ask(raw: String) {
        val q = BridgeRequests.cleanQuestion(raw) ?: run { log("Empty question"); return }
        val blocking = TriggerGate.blocking(active)
        when (TriggerGate.decide(session != null, displayReady.value, blocking, busy.get(), needsConsent = false)) {
            TriggerDecision.RUN -> Unit
            TriggerDecision.NOT_CONNECTED -> { log("Not connected: tap Connect first"); return }
            TriggerDecision.BLOCKED -> { log(TriggerGate.refusal(TriggerDecision.BLOCKED, blocking).replace("No photo", "No question")); return }
            TriggerDecision.WAIT_DISPLAY -> { log("Glasses display is starting: ask again in a moment"); return }
            else -> Unit
        }
        if (!busy.compareAndSet(false, true)) { log("Busy: ignoring question"); return }
        captureJob = scope.launch {
            try {
                runAsk(q)
            } finally {
                busy.set(false)
            }
        }
    }

    private suspend fun runAsk(q: String) {
        val base = current
        when (val target = AskFlow.target(base)) {
            AskTarget.NoResult -> show(Cards.decide(
                "No object yet", "Explain something first, then ask.",
                Cards.t(Lang.AGAIN), ::trigger, Cards.t(Lang.DONE), ::done,
            ))
            AskTarget.Unknown -> show(Cards.decide(
                "Can't ask yet", "Questions work for library objects only.",
                Cards.t(Lang.AGAIN), ::trigger, Cards.t(Lang.DONE), ::done,
            ))
            is AskTarget.Object -> {
                val det = base ?: return
                log("Asking about ${target.id}: \"$q\"")
                setListening(false)
                explainer = null
                picker = null
                answerDet = null
                show(Cards.looking())
                // Demo data and saved cards have no bridge behind them: the phone answers from the same text.
                if (useFixture || currentSaved) { showAnswer(det, AskFlow.localAnswer(det, q), q, local = true); return }
                try {
                    val ans = bridge.ask(q, target.id, lang)
                    val receivedAt = SystemClock.elapsedRealtime()
                    if (showAnswer(det, ans, q, local = false)) ackRendered(ans.reqId, receivedAt)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: BridgeException) {
                    log("Ask failed: ${e.message} (HTTP ${e.status}${if (e.code.isNotEmpty()) ", ${e.code}" else ""})")
                    when {
                        // No /ask on this bridge (404), or no bridge: PROTOCOL's word-overlap rule on the phone.
                        AskFlow.answerOnPhone(e.status, e.code, e.offline) -> showAnswer(det, AskFlow.localAnswer(det, q), q, local = true)
                        e.unauthorized -> askError(q, "Bridge token", Cards.t(Lang.TOKEN))
                        e.code == "bad_request" -> askError(q, "Can't ask that", "Ask about the object on screen.")
                        e.code == "detect_timeout" -> askError(q, "Took too long", "Ask again in a moment.")
                        else -> askError(q, "Couldn't answer", e.userMessage)
                    }
                }
            }
        }
    }

    /** Error card for a question: Try again asks the same question again. */
    private suspend fun askError(q: String, title: String, detail: String) = show(Cards.decide(
        title, detail, Cards.t(Lang.TRY_AGAIN), { if (navAllowed()) ask(q) },
        Cards.t(Lang.DONE), ::done,
    ))

    /** True when the answer card is on the display now. */
    private suspend fun showAnswer(base: Detection, ans: Detection, q: String, local: Boolean): Boolean {
        // The answer is a normal show for the object; keep the old lenses and media if it came without them.
        val det = if (DetectionParser.tracks(ans).isEmpty()) {
            base.copy(question = ans.question ?: q, answer = ans.answer, lensHint = ans.lensHint)
        } else {
            ans.copy(media = ans.media ?: base.media, question = ans.question ?: q)
        }
        if (det.media != base.media) media.clear()
        current = det
        explainer = null
        val tracks = DetectionParser.tracks(det)
        val pos = AskFlow.position(tracks, det.lensHint)
        answerDet = det
        answerPos = pos
        val text = AskFlow.answerText(det.label, det.question ?: q, AskFlow.answerLine(det))
        log("Answer${if (local) " (phone, saved cards)" else " (bridge)"}: ${text.answer}" +
            (det.lensHint?.let { " -> ${it.id} step ${it.step}" } ?: " (no lens hint)"))
        val shown = show(Cards.answer(
            text,
            openLabel = pos?.let { (l, s) -> AskFlow.openLabel(tracks[l], s) },
            onPrimary = { scope.launch { answerPrimary() } },
            onDone = { if (navAllowed()) done() },
            local = local,
        ))
        setListening(true)
        return shown
    }

    /** Pinch on the answer card: the hinted lens and step, else step 1. */
    private suspend fun answerPrimary() {
        val det = answerDet ?: return
        if (!navAllowed()) return
        answerDet = null
        val tracks = DetectionParser.tracks(det)
        if (tracks.isEmpty()) { showIdle(); return }
        val pos = answerPos
        showExplainer(if (pos != null) ExplainerState(tracks, pos.first, pos.second) else ExplainerState(tracks).next())
    }

    /** True once per pinch: a pinch may arrive both as a Select event and as a click on the focused button. */
    private fun navAllowed(): Boolean {
        val now = SystemClock.uptimeMillis()
        if (now - lastNavAt < NAV_DEBOUNCE_MS) return false
        lastNavAt = now
        return true
    }

    /** Pinch (`InputEvent.Select`). Public so the phone's mock buttons can drive it too. */
    fun onSelect() {
        scope.launch {
            when {
                consentShown -> if (navAllowed()) agreeConsent()
                notice != null -> if (navAllowed()) dismissNotice("pinch")
                answerDet != null -> answerPrimary()
                picker != null -> pickerOpen()
                explainer != null -> explainerPrimary()
                // Twin of a button click that just closed a card: ignore it.
                SystemClock.uptimeMillis() - lastNavAt >= NAV_DEBOUNCE_MS -> trigger()
            }
        }
    }

    /** Pinch and the primary button: the obvious next thing. */
    private suspend fun explainerPrimary() {
        val s = explainer ?: return
        if (!navAllowed()) return
        when (val m = s.pinch()) {
            is ExplainerState.Move.Show -> showExplainer(m.state)
            ExplainerState.Move.Again -> { explainer = null; trigger() }
        }
    }

    /** Overview: Again. Step cards: Done. */
    private suspend fun explainerSecondary() {
        val s = explainer ?: return
        if (!navAllowed()) return
        explainer = null
        if (s.isOverview) trigger() else showIdle()
    }

    /**
     * D-pad (`InputEvent.Nav`). Explainer: left/right changes lens (starts at its step 1), down/up steps
     * forward/back. Offline picker: left/right changes the object. Public for the phone's D-pad buttons.
     */
    fun onNav(dir: NavDirection) {
        scope.launch {
            if (notice != null || answerDet != null || consentShown) return@launch
            picker?.let { p ->
                val n = when (dir) {
                    NavDirection.LEFT -> p.move(-1)
                    NavDirection.RIGHT -> p.move(+1)
                    else -> return@launch
                }
                pickerIndex = n.index
                showOfflinePicker()
                return@launch
            }
            val s = explainer ?: return@launch
            val n = when (dir) {
                NavDirection.LEFT -> s.switchLens(-1)
                NavDirection.RIGHT -> s.switchLens(+1)
                NavDirection.UP -> s.prev()
                NavDirection.DOWN -> s.next()
            }
            if (n !== s) showExplainer(n)
        }
    }

    /**
     * Back (`InputEvent.Back`): one step back, then the overview, then idle (a saved card goes back to the
     * offline picker). Any other card is dismissed to idle (DESIGN.md: dismiss with Back). Public for the phone.
     */
    fun onBack() {
        scope.launch {
            if (consentShown) { consentNotNow(); return@launch }
            if (notice != null) { dismissNotice("Back"); return@launch }
            if (picker != null) { picker = null; showIdle(); return@launch }
            answerDet?.let { a ->
                // Back from an answer: the object's overview.
                answerDet = null
                val tracks = DetectionParser.tracks(a)
                if (tracks.isEmpty()) showIdle() else showExplainer(ExplainerState(tracks))
                return@launch
            }
            val s = explainer
            if (s == null) {
                if (busy.get()) return@launch // "Looking..." leaves by itself
                if (lastContent != null) { current = null; lower(DeviceAlert.CAMERA_DENIED); showIdle() }
                return@launch
            }
            val b = s.back()
            when {
                b != null -> showExplainer(b)
                currentSaved -> { explainer = null; current = null; showOfflinePicker() }
                else -> { explainer = null; showIdle() }
            }
        }
    }

    // ---- fixture mode ----

    private suspend fun readAsset(name: String): ByteArray? = withContext(Dispatchers.IO) {
        runCatching { ctx.assets.open(name).use { it.readBytes() } }.getOrNull()
    }

    private suspend fun nextFixture(): Detection {
        val name = FIXTURES[fixtureIndex++ % FIXTURES.size]
        val bytes = readAsset("fixture/detect_$name.json") ?: throw CaptureFailure("Fixture missing", name)
        return DetectionParser.parse(String(bytes, Charsets.UTF_8))
    }

    private suspend fun takePhotoJpeg(): Pair<ByteArray, ByteArray> {
        val sess = session ?: throw CaptureFailure("Session stopped", "Connect again")
        if (sess.state.value != DeviceSessionState.STARTED) throw CaptureFailure("Glasses not ready", sess.state.value.name)

        var status = Wearables.checkPermissionStatus(Permission.CAMERA).getOrNull()
        if (status !is PermissionStatus.Granted) {
            status = requestPermission(Permission.CAMERA).getOrNull()
        }
        if (status !is PermissionStatus.Granted) throw CameraDenied()

        val camera = sess.addCamera(StreamConfiguration(videoQuality = VideoQuality.MEDIUM, frameRate = 15))
            .fold(onSuccess = { it }, onFailure = { e, _ -> throw CaptureFailure("Camera unavailable", e.description) })
        try {
            camera.stream.start().onFailure { e, _ -> throw CaptureFailure("Camera didn't start", e.description) }
            // Fail early on real stream errors (STREAM_ERROR is informational only).
            var streamErr: String? = null
            val watcher = scope.launch {
                camera.stream.errorStream.collect {
                    if (it != com.meta.wearable.dat.camera.types.StreamError.STREAM_ERROR) streamErr = it.description
                }
            }
            try {
                val streaming = withTimeoutOrNull(10_000) {
                    while (camera.stream.state.value != StreamState.STREAMING && streamErr == null) delay(100)
                    streamErr == null
                }
                streamErr?.let { throw CaptureFailure("Camera error", it) }
                if (streaming != true) throw CaptureFailure("Camera didn't start", "Timed out")
                val photo = camera.stream.capturePhoto()
                    .fold(onSuccess = { it }, onFailure = { e, _ -> throw CaptureFailure("Photo failed", e.description) })
                return encode(photo)
            } finally {
                watcher.cancel()
            }
        } finally {
            // Privacy: the camera is only on while a photo is being taken.
            withContext(NonCancellable) {
                runCatching { camera.stop() }
                runCatching { sess.removeCamera() }
            }
        }
    }

    /** Returns the whole photo and its centre (AIM_FRACTION of each side): the wearer aims by looking. */
    private fun encode(photo: PhotoData): Pair<ByteArray, ByteArray> {
        val bmp: Bitmap = when (photo) {
            is PhotoData.Bitmap -> photo.bitmap
            is PhotoData.HEIC -> {
                val buf = photo.data.duplicate()
                val bytes = ByteArray(buf.remaining()).also { buf.get(it) }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    ?: throw CaptureFailure("Photo failed", "Could not decode the image")
            }
        }
        val upright = if (rotateLandscape && bmp.width > bmp.height) {
            val m = android.graphics.Matrix().apply { postRotate(90f) }
            Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        } else bmp
        val scale = 896f / maxOf(upright.width, upright.height)
        val out = if (scale < 1f) {
            Bitmap.createScaledBitmap(upright, (upright.width * scale).toInt(), (upright.height * scale).toInt(), true)
        } else upright
        val fw = (out.width * AIM_FRACTION).toInt()
        val fh = (out.height * AIM_FRACTION).toInt()
        val focus = Bitmap.createBitmap(out, (out.width - fw) / 2, (out.height - fh) / 2, fw, fh)
        fun jpeg(b: Bitmap) = ByteArrayOutputStream().also { b.compress(Bitmap.CompressFormat.JPEG, 80, it) }.toByteArray()
        return jpeg(out) to jpeg(focus)
    }

    companion object {
        /** Share of the photo's width and height that counts as "what the wearer is looking at". */
        const val AIM_FRACTION = 0.5f
        private const val NAV_DEBOUNCE_MS = 350L
        /** How long a trigger waits for the display to reach STARTED before it gives up. */
        private const val DISPLAY_WAIT_MS = 8_000L
        private const val RECONNECT_TRIES = 20
        private const val RECONNECT_EVERY_MS = 3_000L
        /** Fixture order for [useFixture]: `assets/fixture/detect_<name>.json`. */
        private val FIXTURES = listOf("ball", "guitar", "lowconf")
    }
}
