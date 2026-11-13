package com.junction2026.lens

import android.content.Context
import android.content.pm.PackageManager
import android.view.View
import androidx.core.content.ContextCompat
import com.meta.wearable.dat.inputs.types.InputSource
import com.meta.wearable.dat.mockdevice.MockDeviceKit
import com.meta.wearable.dat.mockdevice.api.GlassesModel
import com.meta.wearable.dat.mockdevice.api.MockGlasses
import com.meta.wearable.dat.mockdevice.api.camera.CameraFacing

/** Thin wrapper around the SDK's Mock Device Kit (fake Ray-Ban Display, no hardware). */
class MockRig(private val ctx: Context) {
    private val kit = MockDeviceKit.getInstance(ctx)
    private var glasses: MockGlasses? = null
    private var donned = true

    /** Returns an error text or null. Safe to call again after a disconnect. */
    fun start(): String? {
        if (glasses != null) return null
        kit.enable()
        var err: String? = null
        kit.pairGlasses(GlassesModel.META_RAYBAN_DISPLAY).fold(
            onSuccess = { g ->
                g.powerOn(); g.unfold(); g.don(); donned = true
                glasses = g
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
    fun pinch() { glasses?.services?.input?.select(InputSource.NEURAL_BAND) }
    fun toggleDon() {
        val g = glasses ?: return
        if (donned) g.doff() else g.don()
        donned = !donned
    }
    fun batteryLow() { glasses?.setBatteryLevel(10) }

    fun stop() {
        glasses?.let { runCatching { kit.unpairDevice(it) } }
        glasses = null
        if (kit.isEnabled) kit.disable()
    }
}
