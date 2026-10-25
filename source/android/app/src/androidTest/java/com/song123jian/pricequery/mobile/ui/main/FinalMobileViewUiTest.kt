package com.song123jian.pricequery.mobile.ui.main

import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.ViewModelProvider
import androidx.test.espresso.Espresso
import androidx.test.platform.app.InstrumentationRegistry
import com.song123jian.pricequery.mobile.MainActivity
import com.song123jian.pricequery.mobile.MobileViewModel
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.File

class FinalMobileViewUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun captureFinalCustomerEditorWithoutSaving() {
        val model = ViewModelProvider(rule.activity, MobileViewModel.Factory(rule.activity))[MobileViewModel::class.java]
        rule.waitUntil(40000) { model.state.value.syncMeta != null && !model.state.value.loading }
        rule.onNodeWithContentDescription("打开导航菜单").performClick()
        rule.onNodeWithTag("drawer-customers").performScrollTo().performClick()
        rule.onNodeWithTag("customer-add").performClick()
        fun field(label: String, value: String) = rule.onNodeWithText(label).performScrollTo().performTextReplacement(value)
        field("客户", "新客户示例（未保存）")
        field("牌号", "PA66-GF30")
        field("材料", "PA66")
        field("颜色", "黑色")
        field("价格", "26.5")
        Espresso.closeSoftKeyboard()
        rule.waitUntil(10000) {
            ViewCompat.getRootWindowInsets(rule.activity.window.decorView)
                ?.isVisible(WindowInsetsCompat.Type.ime()) == false
        }
        rule.onNodeWithText("含税").performScrollTo().performClick()
        rule.onNodeWithTag("quote-save").performScrollTo().assertIsDisplayed().assertIsEnabled()
        rule.waitForIdle()
        rule.mainClock.advanceTimeByFrame()
        rule.waitForIdle()
        InstrumentationRegistry.getInstrumentation().waitForIdleSync()
        val rootBounds = rule.onRoot().getUnclippedBoundsInRoot()
        val saveBounds = rule.onNodeWithTag("quote-save").getUnclippedBoundsInRoot()
        println("FINAL_VIEW_BOUNDS root=$rootBounds save=$saveBounds")
        assertTrue("Save button must fit vertically: $saveBounds in $rootBounds",
            saveBounds.top >= rootBounds.top && saveBounds.bottom <= rootBounds.bottom)
        assertTrue("Save button must fit horizontally: $saveBounds in $rootBounds",
            saveBounds.left >= rootBounds.left && saveBounds.right <= rootBounds.right)
        assertNull(model.state.value.pendingSave)
        assertFalse(model.state.value.saving)
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        assertNotNull(bitmap)
        File(rule.activity.filesDir, "final-customer-editor-20261024.png").outputStream().use {
            check(bitmap!!.compress(Bitmap.CompressFormat.PNG, 100, it))
        }
        bitmap!!.recycle()
        rule.onNodeWithContentDescription("返回").performClick()
        rule.onNodeWithTag("customer-add").assertIsDisplayed()
        assertNull(model.state.value.draft)
    }
}
