package com.song123jian.pricequery.mobile

import android.content.Context
import android.os.SystemClock
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import com.song123jian.pricequery.mobile.data.MobilePreferences
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

class LifecycleSyncTest {
    @Test
    fun actualAppPausesPollingInBackgroundAndRefreshesOnReturn() {
        val context: Context = ApplicationProvider.getApplicationContext()
        assumeTrue("Requires an already-authorized account; performs read-only cloud calls", MobilePreferences(context).loadVault().session != null)
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            lateinit var model: MobileViewModel
            scenario.onActivity {
                model = ViewModelProvider(it, MobileViewModel.Factory(it))[MobileViewModel::class.java]
            }
            await("Initial cloud snapshot must complete") { model.state.value.syncStatus == "已同步" && model.state.value.lastSync != null }
            val before = model.state.value.lastSync
            scenario.moveToState(Lifecycle.State.CREATED)
            SystemClock.sleep(16_000)
            assertEquals("Background must not continue the 15-second polling loop", before, model.state.value.lastSync)
            scenario.moveToState(Lifecycle.State.RESUMED)
            await("Returning to foreground must refresh the real app") {
                model.state.value.syncStatus == "已同步" && model.state.value.lastSync != before
            }
        }
    }

    private fun await(message: String, condition: () -> Boolean) {
        val end = SystemClock.elapsedRealtime() + 15_000
        while (!condition() && SystemClock.elapsedRealtime() < end) SystemClock.sleep(100)
        assertTrue(message, condition())
    }
}
