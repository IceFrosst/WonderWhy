package com.junction2026.lens

import android.app.Application
import com.meta.wearable.dat.core.Wearables

class LensApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // In mock mode MockDeviceKit.enable() initialises Wearables itself.
        if (!Prefs.mock(this)) {
            Wearables.initialize(this).fold(
                onSuccess = { wearablesReady = true },
                onFailure = { error, _ -> initError = error.description },
            )
        }
    }

    companion object {
        @Volatile var wearablesReady = false
        @Volatile var initError: String? = null
    }
}
