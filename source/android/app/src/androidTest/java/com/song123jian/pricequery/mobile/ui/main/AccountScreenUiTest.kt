package com.song123jian.pricequery.mobile.ui.main

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.*
import androidx.lifecycle.ViewModelProvider
import com.song123jian.pricequery.mobile.MainActivity
import com.song123jian.pricequery.mobile.MobileScreen
import com.song123jian.pricequery.mobile.MobileViewModel
import com.song123jian.pricequery.mobile.data.MobilePreferences
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class AccountScreenUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun projectAddressIsCollapsedAndExpandableOnTheRealAccountScreen() {
        val activity = rule.activity
        assertNotNull("Uses the existing session and performs no cloud writes", MobilePreferences(activity).loadVault().session)
        val model = ViewModelProvider(activity, MobileViewModel.Factory(activity))[MobileViewModel::class.java]
        rule.waitUntil(40000) { model.state.value.syncMeta != null && !model.state.value.loading }

        rule.onNodeWithContentDescription("打开导航菜单").performClick()
        rule.onNodeWithTag("drawer-account").performScrollTo().performClick()
        rule.waitUntil(5000) { model.state.value.screen == MobileScreen.ACCOUNT }
        val projectUrl = model.state.value.projectUrl
        assertTrue(projectUrl.isNotBlank())
        rule.onNodeWithTag("project-address-panel").assertExists()
        rule.onNodeWithText(projectUrl).assertDoesNotExist()
        rule.onNodeWithTag("project-address-toggle").performClick()
        rule.onNodeWithText(projectUrl).assertExists()
        rule.onNodeWithTag("project-address-toggle").performClick()
        rule.onNodeWithText(projectUrl).assertDoesNotExist()

        rule.runOnUiThread { model.openQuotes() }
    }
}
