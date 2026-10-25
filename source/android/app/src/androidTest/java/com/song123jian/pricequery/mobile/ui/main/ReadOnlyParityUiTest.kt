package com.song123jian.pricequery.mobile.ui.main

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import com.song123jian.pricequery.mobile.BusinessPage
import com.song123jian.pricequery.mobile.MainActivity
import com.song123jian.pricequery.mobile.MobileScreen
import com.song123jian.pricequery.mobile.MobileUiState
import com.song123jian.pricequery.mobile.MobileViewModel
import com.song123jian.pricequery.mobile.data.MobilePreferences
import com.song123jian.pricequery.mobile.data.QuoteRecord
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ReadOnlyParityUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun priceSortingQuoteCopyAndHistoryDetailsUseInMemoryRecords() {
        val model = syncedModel()
        @Suppress("UNCHECKED_CAST")
        val appState = MobileViewModel::class.java.getDeclaredField("mutableState").run {
            isAccessible = true
            get(model) as MutableStateFlow<MobileUiState>
        }
        val originalState = appState.value
        if (originalState.quotes.isEmpty()) rule.onNodeWithText("暂无报价数据").assertIsDisplayed()
        val rows = listOf("9.90", "100.25", "10.25").mapIndexed { index, price ->
            QuoteRecord(
                id = "memory-ui-$index", customer = "SYNTHETIC UI ONLY", grade = "QA-$index",
                material = "PA66", color = "黑色", price = price, taxType = "含税",
                effectiveDate = "2026-10-01", note = "内存验收，不保存", reason = "",
                sourceType = "手工录入", customerRevision = "0", historyCount = 3, futureCount = 1,
                previousPrice = null, delta = null, scheduled = false, stale = false, ageDays = 0,
                isCurrent = true, createdAt = "2026-10-01 10:00:00",
            )
        }
        assertTrue("Synthetic input must be nonempty without creating cloud data", rows.isNotEmpty())
        val clipboard = rule.activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val previousClip = rule.runOnUiThread { clipboard.primaryClip }

        try {
            // Only the activity's in-memory state is replaced; no cloud API or persistence is used.
            rule.runOnUiThread {
                model.onBackground()
                model.resetFilters()
                appState.value = appState.value.copy(quotes = rows)
            }
            rule.onNodeWithTag("quote-sort-menu").performClick()
            rule.onNodeWithText("价格").performClick()
            rule.onNodeWithContentDescription("升序").assertIsDisplayed()
            assertFirstPrice(rows.minBy { it.price.toBigDecimal() }.price)

            rule.onNodeWithTag("quote-sort-direction").performClick()
            rule.onNodeWithContentDescription("降序").assertIsDisplayed()
            val selected = rows.sortedByDescending { it.price.toBigDecimal() }.first()
            assertFirstPrice(selected.price)
            rule.onAllNodesWithContentDescription("展开报价详情").onFirst().performClick()
            rule.onNodeWithTag("quote-copy-${selected.id}").performScrollTo().performClick()
            assertCopiedRecord(clipboard, selected)

            val historyRows = listOf(
                selected.copy(id = "memory-history-3", effectiveDate = "2026-11-01", price = "110.25", scheduled = true,
                    isCurrent = false, reason = "待生效验收", sourceType = "文件导入", sourceFile = "synthetic.xlsx", sourceSheet = "报价", sourceRow = 3),
                selected.copy(id = "memory-history-2", price = "100.25", previousPrice = "99.90", delta = "0.35"),
                selected.copy(id = "memory-history-1", price = "99.90", isCurrent = false),
            )
            rule.runOnUiThread {
                appState.value = appState.value.copy(screen = MobileScreen.HISTORY, historyQuote = selected,
                    historyItems = historyRows, historyHasMore = false, historyLoading = false)
            }
            assertTrue("In-memory history must contain all three records", model.state.value.historyItems.size == 3)
            rule.onNodeWithTag("quote-history-trend").assertIsDisplayed()
            val history = model.state.value.historyItems.first()
            rule.onAllNodesWithContentDescription("展开报价详情").onFirst().performClick()
            rule.onNodeWithText("详情").performScrollTo().performClick()
            rule.onNodeWithText("历史记录详情").assertIsDisplayed()
            rule.onNode(hasText("复制记录") and hasAnyAncestor(isDialog())).performClick()
            assertCopiedRecord(clipboard, history)
            rule.onNode(hasText("关闭") and hasAnyAncestor(isDialog())).performClick()
            rule.onNodeWithText("历史记录详情").assertDoesNotExist()
            rule.runOnUiThread { appState.value = appState.value.copy(historyItems = listOf(history)) }
            rule.onNodeWithContentDescription("价格历史趋势图，共1条记录").assertIsDisplayed()
            rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
            rule.waitUntil(10000) { model.state.value.screen == MobileScreen.QUOTES }
        } finally {
            rule.runOnUiThread {
                appState.value = originalState
                if (previousClip != null) clipboard.setPrimaryClip(previousClip)
                else if (Build.VERSION.SDK_INT >= 28) clipboard.clearPrimaryClip()
                else clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
                model.onForeground()
            }
        }
    }

    @Test
    fun inventoryRememberOptionAndLoginCancellationKeepCredentialsUnchanged() {
        val model = syncedModel()
        val preferences = MobilePreferences(rule.activity)
        val previous = preferences.loadMesCredentials()
        rule.onNodeWithContentDescription("打开导航菜单").performClick()
        rule.onNodeWithTag("drawer-inventory").performScrollTo().performClick()
        rule.waitUntil(10000) { model.business.state.value.page == BusinessPage.INVENTORY }

        val remember = rule.onNodeWithTag("mes-remember-login")
        if (previous == null) {
            remember.assertIsOff().performClick().assertIsOn()
            remember.performClick().assertIsOff()
        } else {
            remember.assertIsOn()
        }
        rule.onNodeWithText("MES账号").performTextReplacement("synthetic-ui-only")
        rule.onNodeWithText("MES密码").performTextReplacement("synthetic-ui-only-password")
        rule.onNodeWithText("登录MES").performScrollTo().performClick()
        rule.onNodeWithText("MES旧服务使用HTTP").assertIsDisplayed()
        rule.onNodeWithText("勾选记住后，凭据在本机加密保存", substring = true).assertIsDisplayed()
        rule.onNode(hasText("取消") and hasAnyAncestor(isDialog())).performClick()
        rule.onNodeWithText("MES旧服务使用HTTP").assertDoesNotExist()
        assertTrue("MES must never be contacted by this test", !model.business.state.value.inventoryLoggedIn && !model.business.state.value.busy)
        assertTrue("Existing MES credentials must remain unchanged", previous == preferences.loadMesCredentials())
    }

    private fun syncedModel(): MobileViewModel {
        val activity = rule.activity
        assertNotNull("Uses the existing encrypted session; never logs in or writes cloud data", MobilePreferences(activity).loadVault().session)
        val model = ViewModelProvider(activity, MobileViewModel.Factory(activity))[MobileViewModel::class.java]
        rule.waitUntil(30000) { model.state.value.syncMeta != null && !model.state.value.loading }
        return model
    }

    private fun assertFirstPrice(expected: String) {
        rule.onNode(hasScrollToIndexAction()).performScrollToIndex(0)
        val first = rule.onAllNodes(hasText("￥", substring = true)).fetchSemanticsNodes()
            .filter { it.boundsInRoot.height > 0 }.minBy { it.boundsInRoot.top }
        assertTrue("First displayed price must match numeric sorting", first.config[SemanticsProperties.Text].any { it.text == "￥$expected" })
    }

    private fun assertCopiedRecord(clipboard: ClipboardManager, expected: QuoteRecord) {
        val copied = rule.runOnUiThread { JSONObject(clipboard.primaryClip!!.getItemAt(0).text.toString()) }
        val fields = mapOf(
            "id" to expected.id, "customer" to expected.customer, "grade" to expected.grade,
            "material" to expected.material, "color" to expected.color, "price" to expected.price,
            "tax_type" to expected.taxType, "effective_date" to expected.effectiveDate,
            "note" to expected.note, "reason" to expected.reason, "source_type" to expected.sourceType,
            "source_file" to expected.sourceFile, "source_sheet" to expected.sourceSheet, "created_at" to expected.createdAt,
        )
        fields.forEach { (key, value) -> assertTrue("Copied field must match: $key", copied.optString(key) == value) }
        assertTrue(copied.getBoolean("scheduled") == expected.scheduled)
        assertTrue(copied.getBoolean("is_current") == expected.isCurrent)
        assertTrue(copied.getInt("source_row") == expected.sourceRow)
    }
}
