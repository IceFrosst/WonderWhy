package com.junction2026.lens

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionError
import com.meta.wearable.dat.core.types.PermissionStatus
import com.meta.wearable.dat.core.types.RegistrationState
import com.meta.wearable.dat.display.Display
import com.meta.wearable.dat.display.addDisplay
import com.meta.wearable.dat.display.removeDisplay
import com.meta.wearable.dat.display.types.DisplayState
import com.meta.wearable.dat.display.views.ContentScope
import com.meta.wearable.dat.inputs.addInputs
import com.meta.wearable.dat.inputs.removeInputs
import com.meta.wearable.dat.inputs.types.InputEvent
import com.meta.wearable.dat.inputs.types.InputsConfiguration
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean

/** Failure of one capture/detect run, with text for the glasses card. */
private class CaptureFailure(val title: String, val detail: String) : Exception("$title: $detail")

class GlassesController(
    private val ctx: Context,
    private val scope: CoroutineScope,
    private val bridge: BridgeClient,
    private val log: (String) -> Unit,
    /** Shows the Meta AI camera-permission screen (needs an Activity result launcher). */
    private val requestCameraPermission: suspend () -> DatResult<PermissionStatus, PermissionError>,
    private val onUpdateRequired: () -> Unit,
    /** The exact JPEG sent to the bridge, for an on-phone thumbnail. Never stored. */
    private val onPhoto: (ByteArray) -> Unit = {},
) {
    private val _registration = MutableStateFlow("-")
    private val _session = MutableStateFlow("not connected")
    private val _display = MutableStateFlow("-")
    private val _battery = MutableStateFlow("-")
    private val _don = MutableStateFlow("-")
    val registration: StateFlow<String> = _registration
    val sessionStatus: StateFlow<String> = _session
    val displayStatus: StateFlow<String> = _display
    val battery: StateFlow<String> = _battery
    val don: StateFlow<String> = _don

    private var session: DeviceSession? = null
    private var display: Display? = null
    private var sessionJobs = mutableListOf<Job>()
    private var inputsJob: Job? = null
    private var captureJob: Job? = null
    private var attached = false
    private var batteryWarned = false
    private var lastDon: DonState? = null
    private var concepts: Map<String, String> = emptyMap()
    private val busy = AtomicBoolean(false) // one capture at a time, whatever the trigger
    private var connecting = false

    // ---- connect / disconnect ----

    /** Registers (real mode) and starts a device session. Mock must already be enabled by the caller. */
    /** The mock feeds the phone camera in sensor orientation (sideways); real glasses frames are already upright. */
    private var rotateLandscape = false

    suspend fun connect(activity: Activity, mock: Boolean) {
        rotateLandscape = mock
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
            concepts = bridge.objects()
            log("Bridge objects: ${concepts.size}")
            startSession()
        } finally {
            connecting = false
        }
    }

    private suspend fun startSession() {
        // Mock devices show up a moment after pairing, so retry a few times.
        var s: DeviceSession? = null
        var lastErr = ""
        repeat(6) {
            if (s == null) {
                Wearables.createSession(AutoDeviceSelector(filter = { it.isDisplayCapable() })).fold(
                    onSuccess = { s = it },
                    onFailure = { e, _ -> lastErr = e.description },
                )
                if (s == null) delay(1000)
            }
        }
        val sess = s ?: run { log("No session: $lastErr"); _session.value = "no session"; return }
        session = sess
        attached = false
        sessionJobs += scope.launch { sess.state.collect { onSessionState(sess, it) } }
        sessionJobs += scope.launch {
            sess.errors.collect { e ->
                log("Session error: ${e.description}")
                if (e == DeviceSessionError.DAT_APP_ON_THE_GLASSES_UPDATE_REQUIRED) onUpdateRequired()
            }
        }
        sessionJobs += scope.launch { sess.deviceInfo.collect { onDeviceInfo(it) } }
        sess.start()
    }

    fun disconnect() {
        session?.let { runCatching { it.stop() } }
        teardown("Disconnected")
    }

    private fun teardown(status: String) {
        captureJob?.cancel()
        inputsJob?.cancel()
        sessionJobs.forEach { it.cancel() }
        sessionJobs.clear()
        session?.let {
            runCatching { it.removeInputs() }
            runCatching { it.removeDisplay() }
        }
        session = null
        display = null
        attached = false
        batteryWarned = false
        lastDon = null
        busy.set(false)
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
                if (!attached) { attached = true; scope.launch { attachCapabilities(sess) } }
            }
            DeviceSessionState.PAUSED -> _session.value = "Paused by the glasses"
            DeviceSessionState.STOPPED -> teardown("Disconnected") // terminal: Connect makes a new session
        }
    }

    private suspend fun attachCapabilities(sess: DeviceSession) {
        val addDisplayResult = sess.addDisplay()
        val d = addDisplayResult.getOrNull()
        if (d == null) {
            log("Display unavailable: ${addDisplayResult.errorOrNull()?.description}")
        } else {
            display = d
            sessionJobs += scope.launch { d.state.collect { _display.value = it.name } }
            val ready = withTimeoutOrNull(10_000) { d.state.first { it == DisplayState.STARTED } }
            if (ready == null) log("Display did not start") else showIdle()
        }
        sess.addInputs(InputsConfiguration()).fold(
            onSuccess = { inputs ->
                inputsJob = scope.launch {
                    inputs.events.collect { ev ->
                        when (ev) {
                            is InputEvent.Select -> trigger()
                            is InputEvent.Capture -> trigger()
                            is InputEvent.Nav, is InputEvent.Back, is InputEvent.Button, is InputEvent.Drag -> Unit
                        }
                    }
                }
                sessionJobs += inputsJob!!
            },
            // Real glasses may refuse inputs; Display buttons and the phone button still work.
            onFailure = { e, _ -> log("Inputs unavailable: ${e.description}") },
        )
    }

    private suspend fun onDeviceInfo(d: com.meta.wearable.dat.core.types.Device) {
        _battery.value = "${d.batteryLevel}%"
        _don.value = d.donState.name
        if (d.donState == DonState.DOFFED && lastDon != DonState.DOFFED && busy.get()) {
            log("Glasses taken off: cancelling capture")
            captureJob?.cancel()
        }
        lastDon = d.donState
        if (d.batteryLevel <= 15 && !batteryWarned) {
            batteryWarned = true
            if (!busy.get()) {
                show(Cards.notice("Battery low", "${d.batteryLevel}% left on the glasses") { scope.launch { showIdle() } })
            }
        }
    }

    // ---- display helpers ----

    private suspend fun show(content: ContentScope.() -> Unit) {
        val d = display ?: return
        d.sendContent(content).onFailure { e, _ -> log("Display error: ${e.description}") }
    }

    suspend fun showIdle() = show(Cards.idle())

    // ---- the capture loop ----

    /** Pinch, capture button, display "Again" and the phone button all land here. */
    fun trigger() {
        if (session == null || display == null) { log("Not connected"); return }
        if (!busy.compareAndSet(false, true)) { log("Busy: ignoring trigger"); return }
        captureJob = scope.launch {
            try {
                runCapture()
            } finally {
                busy.set(false)
            }
        }
    }

    private suspend fun runCapture() {
        try {
            show(Cards.looking())
            val tCapture = System.currentTimeMillis()
            val jpeg = withTimeout(30_000) { takePhotoJpeg() }
            log("Photo ${jpeg.size / 1024} KB, sending")
            onPhoto(jpeg)
            val det = bridge.detect(jpeg, tCapture)
            log("Detected ${det.objectId} '${det.label}' conf=${det.confidence}")
            if (det.objectId == "unknown" || det.confidence < 0.5) {
                show(Cards.result("Not sure what this is", null, det.answer, ::trigger, ::done))
            } else {
                show(Cards.result(det.label, concepts[det.objectId], det.answer, ::trigger, ::done))
            }
        } catch (e: CancellationException) {
            withContext(NonCancellable) {
                show(Cards.error("Cancelled", "Capture stopped", ::trigger, ::done))
            }
            throw e
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            showError("Camera timed out", "The glasses did not deliver a photo")
        } catch (e: CaptureFailure) {
            log("Capture failed: ${e.message}")
            showError(e.title, e.detail)
        } catch (e: BridgeException) {
            log("Bridge failed: ${e.message}")
            showError("Couldn't explain that", e.userMessage)
        } catch (e: Exception) {
            log("Unexpected: $e")
            showError("Something went wrong", e.javaClass.simpleName)
        }
    }

    private suspend fun showError(title: String, detail: String) =
        show(Cards.error(title, detail, ::trigger, ::done))

    private fun done() { scope.launch { showIdle() } }

    private suspend fun takePhotoJpeg(): ByteArray {
        val sess = session ?: throw CaptureFailure("Session stopped", "Connect again")
        if (sess.state.value != DeviceSessionState.STARTED) throw CaptureFailure("Glasses not ready", sess.state.value.name)

        var status = Wearables.checkPermissionStatus(Permission.CAMERA).getOrNull()
        if (status !is PermissionStatus.Granted) {
            status = requestCameraPermission().getOrNull()
        }
        if (status !is PermissionStatus.Granted) throw CaptureFailure("Camera denied", "Allow camera access in Meta AI")

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

    private fun encode(photo: PhotoData): ByteArray {
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
        return ByteArrayOutputStream().also { out.compress(Bitmap.CompressFormat.JPEG, 80, it) }.toByteArray()
    }
}
