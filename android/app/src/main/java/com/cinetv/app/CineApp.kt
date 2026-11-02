package com.cinetv.app

import android.app.Application
import com.cinetv.app.data.Net

class CineApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Net.init(this)
    }
}
