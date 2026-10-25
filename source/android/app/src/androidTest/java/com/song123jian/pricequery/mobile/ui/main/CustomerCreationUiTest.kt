package com.song123jian.pricequery.mobile.ui.main

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import com.song123jian.pricequery.mobile.BusinessController
import com.song123jian.pricequery.mobile.BusinessPage
import com.song123jian.pricequery.mobile.BusinessState
import com.song123jian.pricequery.mobile.MainActivity
import com.song123jian.pricequery.mobile.MobileScreen
import com.song123jian.pricequery.mobile.MobileUiState
import com.song123jian.pricequery.mobile.MobileViewModel
import com.song123jian.pricequery.mobile.data.MobilePreferences
import com.song123jian.pricequery.mobile.data.CustomerProfile
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class CustomerCreationUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun directoryCreatesFirstQuoteAndCancelReturnsToDirectoryWithoutWriting() {
        val model = syncedModel()
        rule.onNodeWithContentDescription("打开导航菜单").performClick()
        rule.onNodeWithTag("drawer-customers").performScrollTo().performClick()
        rule.waitUntil(10000) { model.state.value.screen == MobileScreen.CUSTOMERS }
        rule.onNodeWithText("搜索客户").performTextReplacement("NO-MATCH-UI-ONLY")
        rule.onNodeWithTag("customer-add").assertIsDisplayed().performClick()
        rule.waitUntil(10000) { model.state.value.screen == MobileScreen.EDITOR }
        rule.onNode(hasText("新增客户") and !isSelectable()).assertIsDisplayed()
        assertNull(model.state.value.editingQuote)
        assertEquals("", model.state.value.draft!!.customer)

        rule.onNodeWithTag("quote-save").performScrollTo().performClick()
        rule.onNodeWithText("请输入有效客户名称").assertIsDisplayed()
        rule.onNodeWithText("客户").performScrollTo().performTextReplacement("UI ONLY - DO NOT SAVE")
        rule.onNodeWithTag("quote-save").performScrollTo().performClick()
        rule.onNodeWithText("请输入有效牌号").assertIsDisplayed()
        assertNull(MobilePreferences(rule.activity).loadVault().pendingSave)
        assertFalse(model.state.value.saving)

        rule.onNodeWithContentDescription("返回").performClick()
        rule.waitUntil(10000) { model.state.value.screen == MobileScreen.CUSTOMERS }
        assertEquals("NO-MATCH-UI-ONLY", model.state.value.customerQuery)
        assertNull(model.state.value.draft)
        rule.onNodeWithTag("customer-add").performClick()
        assertEquals("", model.state.value.draft!!.customer)
        rule.onNode(hasText("新增客户") and !isSelectable()).assertIsDisplayed()
        rule.onNodeWithContentDescription("返回").assertIsDisplayed()
        rule.waitForIdle()
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitUntil(10000) { model.state.value.screen == MobileScreen.CUSTOMERS }

        rule.runOnUiThread { model.startNewQuote() }
        rule.onNode(hasText("新增报价") and !isSelectable()).assertIsDisplayed()
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitUntil(10000) { model.state.value.screen == MobileScreen.QUOTES }
        rule.runOnUiThread { model.setCustomerQuery("") }
    }

    @Test
    fun customerProfileActionsOpenPrefilledDraftsAndCancelWithoutSaving() {
        val model = syncedModel()
        val business = model.business
        @Suppress("UNCHECKED_CAST")
        val businessState = BusinessController::class.java.getDeclaredField("mutableState").run {
            isAccessible = true
            get(business) as MutableStateFlow<BusinessState>
        }

        rule.onNodeWithContentDescription("打开导航菜单").performClick()
        rule.onNodeWithTag("drawer-customer-profiles").performScrollTo().performClick()
        rule.waitUntil(30000) {
            business.state.value.page == BusinessPage.CUSTOMER_PROFILES && !business.state.value.busy
        }
        val original = businessState.value
        val profile = CustomerProfile(
            profileId = "550e8400-e29b-41d4-a716-446655440000",
            name = "仅内存验收客户",
            industry = "汽车零部件",
        )

        try {
            rule.runOnUiThread {
                businessState.value = businessState.value.copy(customerProfiles = listOf(profile))
            }
            rule.waitForIdle()
            rule.onNodeWithText(profile.name).performScrollTo()
            rule.onNodeWithText("新增项目").performClick()
            rule.waitUntil(30000) {
                model.state.value.screen == MobileScreen.TOOLS &&
                    business.state.value.page == BusinessPage.PROJECT_PROGRESS &&
                    business.state.value.projectDraft != null && !business.state.value.busy
            }
            assertEquals(profile.name, business.state.value.projectDraft?.customerName)
            assertEquals(profile.industry, business.state.value.projectDraft?.industry)
            rule.onNodeWithText("取消").performClick()
            rule.waitUntil(10000) { business.state.value.projectDraft == null }

            rule.onNodeWithContentDescription("打开导航菜单").performClick()
            rule.onNodeWithTag("drawer-customer-profiles").performScrollTo().performClick()
            rule.waitUntil(30000) {
                business.state.value.page == BusinessPage.CUSTOMER_PROFILES && !business.state.value.busy
            }
            rule.runOnUiThread {
                businessState.value = business.state.value.copy(customerProfiles = listOf(profile))
            }
            rule.waitForIdle()
            rule.onNodeWithText(profile.name).performScrollTo()
            rule.onNodeWithText("新增待办").performClick()
            rule.waitUntil(30000) {
                model.state.value.screen == MobileScreen.TOOLS &&
                    business.state.value.page == BusinessPage.TODOS &&
                    business.state.value.todoDraft != null && !business.state.value.busy
            }
            assertEquals(profile.name, business.state.value.todoDraft?.customerName)
            assertEquals(profile.profileId, business.state.value.todoDraft?.customerId)
            rule.onNodeWithText("取消").performClick()
            rule.waitUntil(10000) { business.state.value.todoDraft == null }
            assertNull(MobilePreferences(rule.activity).loadVault().pendingBusiness)
            assertNull(MobilePreferences(rule.activity).loadVault().pendingSave)
        } finally {
            rule.runOnUiThread {
                businessState.value = original
                model.openQuotes()
            }
        }
    }

    @Test
    fun directoryRequiresSyncAndKeepsLockedStorageReadOnly() {
        val model = syncedModel()
        @Suppress("UNCHECKED_CAST")
        val appState = MobileViewModel::class.java.getDeclaredField("mutableState").run {
            isAccessible = true
            get(model) as MutableStateFlow<MobileUiState>
        }
        val original = appState.value
        try {
            rule.runOnUiThread {
                model.onBackground()
                model.openCustomers()
                appState.value = appState.value.copy(syncMeta = null)
            }
            rule.onNodeWithTag("customer-add").performClick()
            rule.onNodeWithText("请先完成一次云端同步").assertIsDisplayed()
            assertEquals(MobileScreen.CUSTOMERS, model.state.value.screen)
            assertNull(model.state.value.draft)
            rule.runOnUiThread { appState.value = appState.value.copy(syncMeta = original.syncMeta, storageLocked = true) }
            rule.onNodeWithTag("customer-add").assertIsNotEnabled()
            assertNull(MobilePreferences(rule.activity).loadVault().pendingSave)
        } finally {
            rule.runOnUiThread {
                appState.value = original
                model.onForeground()
            }
        }
    }

    private fun syncedModel(): MobileViewModel {
        val vault = MobilePreferences(rule.activity).loadVault()
        assertNotNull("Requires the existing authorized session", vault.session)
        assertNull("Never replaces an unresolved save", vault.pendingSave)
        assertNull("Never replaces an unresolved business request", vault.pendingBusiness)
        val model = ViewModelProvider(rule.activity, MobileViewModel.Factory(rule.activity))[MobileViewModel::class.java]
        rule.waitUntil(40000) { model.state.value.syncMeta != null && !model.state.value.loading }
        return model
    }
}
