package com.cinetv.app

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import com.cinetv.app.data.Net
import com.google.android.gms.cast.framework.CastContext

class CineApp : Application(), ImageLoaderFactory {
    override fun onCreate() {
        super.onCreate()
        Net.init(this)
        // Inicializa Google Cast (si el dispositivo tiene Play Services).
        runCatching { CastContext.getSharedInstance(this) }
    }

    // Coil con caché propia: los logos se bajan una vez y quedan en memoria y
    // disco (rápido y liviano), con crossfade al aparecer.
    override fun newImageLoader(): ImageLoader =
        ImageLoader.Builder(this)
            .okHttpClient(Net.okHttp)
            .crossfade(true)
            .memoryCache { MemoryCache.Builder(this).maxSizePercent(0.25).build() }
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("image_cache"))
                    .maxSizeBytes(100L * 1024 * 1024) // 100 MB
                    .build()
            }
            .build()
}
