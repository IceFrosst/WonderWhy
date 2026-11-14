package com.junction2026.lens

import android.content.Context
import android.content.pm.PackageManager
import android.view.View
import androidx.core.content.ContextCompat
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import com.meta.wearable.dat.core.types.ThermalLevel
import com.meta.wearable.dat.inputs.types.InputSource
import com.meta.wearable.dat.mockdevice.MockDeviceKit
import com.meta.wearable.dat.mockdevice.api.GlassesModel
import com.meta.wearable.dat.mockdevice.api.MockGlasses
import com.meta.wearable.dat.mockdevice.api.camera.CameraFacing
import com.meta.wearable.dat.mockdevice.api.speech.MockSpeechSource

/**
 * Thin wrapper around the SDK's Mock Device Kit (fake Ray-Ban Display, no hardware). Every toggle here
 * calls a real kit API (checked with javap against mwdat-mockdevice 1.0.1):
 * `don/doff`, `fold/unfold`, `setBatteryLevel`, `setThermalLevel`, `powerOff/powerOn`,
 * `MockDeviceKit.permissions.set/setRequestResult`, `services.speech.simulateTranscription`.
 * "Another app takes over" has no kit API; see
 * [GlassesController.simulateTakeOver].
 */
class MockRig(private val ctx: Context) {
    private val kit = MockDeviceKit.getInstance(ctx)
    private var glasses: MockGlasses? = null

    var donned = true; private set
    var folded = false; private set
    var batteryLow = false; private set
    var hot = false; private set
    var poweredOff = false; private set
    var cameraDenied = false; private set

    val running: Boolean get() = glasses != null

    /** Returns an error text or null. Safe to call again after a disconnect. */
    fun start(): String? {
        if (glasses != null) return null
        kit.enable()
        var err: String? = null
        kit.pairGlasses(GlassesModel.META_RAYBAN_DISPLAY).fold(
            onSuccess = { g ->
                g.powerOn(); g.unfold(); g.don()
                g.setBatteryLevel(100); g.setThermalLevel(ThermalLevel.NONE)
                donned = true; folded = false; batteryLow = false; hot = false; poweredOff = false
                glasses = g
                setCamera(denied = false)
                setMicrophone()
                // Typed (injected) speech: the "Say" button, no real microphone on the emulator.
                runCatching { g.services.speech.setTranscriptionSource(MockSpeechSource.INJECTED) }
                if (ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.CAMERA) ==
                    PackageManager.PERMISSION_GRANTED
                ) {
                    g.services.camera.setCameraFeed(CameraFacing.BACK)
                } // else photos fail with a camera error card until CAMERA is granted
            },
            onFailure = { e, _ -> err = "Mock pairing failed: $e" },
        )
        return err
    }

    fun previewView(): View? = glasses?.services?.display?.createPreviewView(ctx)

    /** Neural Band pinch through the kit's input API (arrives as `InputEvent.Select`). */
    fun pinch() { glasses?.services?.input?.select(InputSource.NEURAL_BAND) }

    fun toggleDon() {
        val g = glasses ?: return
        if (donned) g.doff() else g.don()
        donned = !donned
    }

    fun toggleFold() {
        val g = glasses ?: return
        if (folded) {
            g.unfold()
            if (donned) g.don() // the kit reports a folded pair as taken off too
        } else {
            g.fold()
        }
        folded = !folded
    }

    /** 10% (warns once) or back to 100% (re-arms the warning). */
    fun toggleBattery() {
        val g = glasses ?: return
        batteryLow = !batteryLow
        g.setBatteryLevel(if (batteryLow) 10 else 100)
    }

    fun toggleHeat() {
        val g = glasses ?: return
        hot = !hot
        g.setThermalLevel(if (hot) ThermalLevel.SEVERE else ThermalLevel.NONE)
    }

    /** The kit's stand-in for a Bluetooth drop: the glasses power off, then on again (and unfolded, worn). */
    fun togglePower() {
        val g = glasses ?: return
        if (poweredOff) {
            g.powerOn()
            if (!folded) g.unfold()
            if (donned) g.don()
        } else {
            g.powerOff()
        }
        poweredOff = !poweredOff
    }

    fun toggleCameraPermission() = setCamera(!cameraDenied)

    /**
     * The wearer says [text]: a final transcription through the kit's speech API. The kit drops it when the
     * app is not listening (it only listens while a result is on screen). Returns an error text or null.
     */
    fun say(text: String): String? {
        val speech = glasses?.services?.speech ?: return "Not connected"
        if (!speech.isListening) return "The glasses are not listening: show a result first"
        speech.simulateTranscription(text, true, 0.95f)
        return null
    }

    private fun setMicrophone() {
        runCatching {
            kit.permissions.set(Permission.MICROPHONE, PermissionStatus.Granted)
            kit.permissions.setRequestResult(Permission.MICROPHONE, PermissionStatus.Granted)
        }
    }

    private fun setCamera(denied: Boolean) {
        val st: PermissionStatus = if (denied) PermissionStatus.Denied else PermissionStatus.Granted
        runCatching {
            kit.permissions.set(Permission.CAMERA, st)
            kit.permissions.setRequestResult(Permission.CAMERA, st)
        }
        cameraDenied = denied
    }

    fun stop() {
        glasses?.let { runCatching { kit.unpairDevice(it) } }
        glasses = null
        if (kit.isEnabled) kit.disable()
    }
}
