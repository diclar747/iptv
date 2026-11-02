package com.cinetv.app

import android.app.Application
import com.cinetv.app.data.Net
import com.google.android.gms.cast.framework.CastContext

class CineApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Net.init(this)
        // Inicializa Google Cast (si el dispositivo tiene Play Services).
        runCatching { CastContext.getSharedInstance(this) }
    }
}
