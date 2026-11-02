package com.cinetv.app

import android.content.Context
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionProvider
import com.google.android.gms.cast.framework.media.CastMediaOptions

// Config del Cast: usa el receptor multimedia por defecto de Google (soportado por
// todos los Chromecast), igual que en la web.
class CastOptionsProvider : OptionsProvider {
    override fun getCastOptions(context: Context): CastOptions {
        val media = CastMediaOptions.Builder().build()
        return CastOptions.Builder()
            .setReceiverApplicationId("CC1AD845") // Default Media Receiver
            .setCastMediaOptions(media)
            .build()
    }

    override fun getAdditionalSessionProviders(context: Context): MutableList<SessionProvider>? = null
}
