package com.song123jian.pricequery.mobile.ui.main

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import com.song123jian.pricequery.mobile.BusinessPage
import com.song123jian.pricequery.mobile.MainActivity
import com.song123jian.pricequery.mobile.MobileViewModel
import com.song123jian.pricequery.mobile.data.MobilePreferences
import com.song123jian.pricequery.mobile.data.ImageQuoteSource
import com.song123jian.pricequery.mobile.data.QuoteDraft
import com.song123jian.pricequery.mobile.data.QuoteRecord
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class BusinessParityUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test fun actualBusinessMenusDocumentEditorAndCloudBackup() {
        val activity = rule.activity
        assumeTrue("Requires the user's existing authorized session", MobilePreferences(activity).loadVault().session != null)
        val model = ViewModelProvider(activity, MobileViewModel.Factory(activity))[MobileViewModel::class.java]
        rule.waitUntil(30000) { model.state.value.syncStatus == "已同步" }
        rule.onNodeWithContentDescription("打开导航菜单").performClick()
        rule.onNodeWithTag("drawer-inventory").performClick()
        rule.onNodeWithText("MES账号").assertExists()
        rule.onNodeWithContentDescription("打开导航菜单").performClick()
        rule.onNodeWithTag("drawer-data").performClick()
        rule.onNodeWithText("导入 XLSX / CSV / 文字 PDF").assertExists()
        rule.onNodeWithContentDescription("打开导航菜单").performClick()
        rule.onNodeWithTag("drawer-import").performClick()
        rule.onNodeWithText("选择文件并预览").assertExists()
        rule.onNodeWithContentDescription("打开导航菜单").performClick()
        rule.onNodeWithTag("drawer-documents").performClick()
        rule.onNodeWithText("新建报价单").performClick()
        rule.waitUntil(10000) { model.business.state.value.document != null && !model.business.state.value.busy }
        rule.onNodeWithText("需方单位名称").performTextReplacement("手机单据验收（本机草稿）")
        fun field(label: String, value: String) {
            rule.onNode(hasScrollToIndexAction()).performScrollToNode(hasText(label))
            rule.onNodeWithText(label).performTextReplacement(value)
        }
        field("材料名称", "工程塑料")
        field("材料规格", "PA66-QA")
        field("价格（元/kg）", "12.5")
        rule.onNode(hasScrollToIndexAction()).performScrollToNode(hasText("生成PDF"))
        rule.onNodeWithText("生成PDF").performClick()
        rule.waitUntil(30000) { !model.business.state.value.busy && (model.business.state.value.documentPreview != null || model.business.state.value.error != null) }
        assertNull(model.business.state.value.error)
        assertTrue(model.business.state.value.documentPreview!!.file.length() > 5000)
        rule.onNodeWithText("预览", useUnmergedTree = true).performClick()
        rule.onNodeWithText("PDF预览").assertExists()
        rule.onNodeWithContentDescription("关闭PDF预览").performClick()
        rule.runOnUiThread { model.business.open(BusinessPage.BACKUP) }
        rule.onNodeWithText("导出云端完整SQLite备份").performClick()
        rule.waitUntil(30000) { !model.business.state.value.busy }
        assertNull(model.business.state.value.error)
        assertEquals("application/vnd.sqlite3", model.business.state.value.artifact?.mime)
        assertTrue(model.business.state.value.artifact!!.file.length() > 0)
        rule.runOnUiThread { model.business.open(BusinessPage.RECYCLE) }
        rule.waitUntil(30000) { !model.business.state.value.busy }
        assertNull(model.business.state.value.error)
        rule.runOnUiThread { model.business.open(BusinessPage.INVENTORY) }
        rule.onNodeWithText("MES账号").assertExists()
        rule.onNodeWithText("MES密码").assertExists()
        rule.runOnUiThread { model.business.open(BusinessPage.MENU) }
    }

    @Test fun imageQuoteCannotSaveUntilConfirmedAndEveryEditRequiresReviewAgain() {
        val activity = rule.activity
        assumeTrue("Requires the user's existing authorized session", MobilePreferences(activity).loadVault().session != null)
        val model = ViewModelProvider(activity, MobileViewModel.Factory(activity))[MobileViewModel::class.java]
        rule.waitUntil(30000) { model.state.value.syncStatus == "已同步" }
        rule.runOnUiThread {
            model.startNewQuote()
            model.applyImageQuoteCandidate(
                QuoteDraft(customer = "手机OCR门禁${System.currentTimeMillis()}", grade = "PA66-IMAGE-QA", price = "12.5"),
                ImageQuoteSource("image-review-qa.png", row = 1),
            )
        }
        rule.waitUntil(10000) { model.state.value.screen.name == "EDITOR" && model.state.value.imageSource != null }
        rule.onNodeWithText("保存报价").assertIsNotEnabled()
        rule.onNodeWithTag("image-quote-review").performClick()
        rule.onNodeWithText("保存报价").assertIsEnabled()
        rule.onNodeWithText("备注").performTextReplacement("需要重新核对")
        rule.onNodeWithText("保存报价").assertIsNotEnabled()
        rule.runOnUiThread(model::cancelEditor)

        val customer = "手机OCR匹配验收"
        val quote = QuoteRecord(
            id = "local-image-match", customer = customer, grade = "PA66-IMAGE-QA", material = "PA66", color = "黑色",
            price = "12.5", taxType = "含税", effectiveDate = "2026-10-23", note = "", reason = "",
            sourceType = "手工录入", customerRevision = "0", historyCount = 1, futureCount = 0,
            previousPrice = null, delta = null, scheduled = false, stale = false, ageDays = 0,
            identity = "", customerKey = "", sourceFile = "", sourceSheet = "", sourceRow = 0,
            importKey = "", createdAt = "",
        )
        @Suppress("UNCHECKED_CAST")
        val appState = MobileViewModel::class.java.getDeclaredField("mutableState").run {
            isAccessible = true
            get(model) as MutableStateFlow<com.song123jian.pricequery.mobile.MobileUiState>
        }
        appState.update { it.copy(quotes = it.quotes + quote) }
        rule.runOnUiThread {
            model.startNewQuote()
            model.applyImageQuoteCandidate(
                QuoteDraft(customer = customer, grade = quote.grade, material = quote.material, color = quote.color,
                    price = quote.price, taxType = quote.taxType, effectiveDate = quote.effectiveDate),
                ImageQuoteSource("image-review-qa.png", row = 1),
            )
        }
        rule.waitUntil(10000) { model.state.value.editingQuote?.id == quote.id && model.state.value.imageSource != null }
        rule.onNodeWithText("调价原因").assertExists()
        rule.onNodeWithText("保存调价").assertIsNotEnabled()
        rule.onNodeWithTag("image-quote-review").performScrollTo().performClick()
        rule.runOnUiThread { assertTrue(model.state.value.imageReviewed) }
        rule.onNodeWithText("保存调价").assertIsEnabled()
        rule.onNodeWithText("价格").performTextReplacement("12.6")
        rule.onNodeWithText("保存调价").assertIsNotEnabled()
        rule.runOnUiThread {
            model.applyImageQuoteCandidate(
                QuoteDraft(customer = customer, grade = "ANOTHER-IMAGE-QA", price = "12.5"),
                ImageQuoteSource("image-review-qa.png", row = 2),
            )
            assertNull(model.state.value.editingQuote)
            assertFalse(model.state.value.imageReviewed)
        }
        rule.onNodeWithText("保存报价").assertIsNotEnabled()
        val second = quote.copy(id = "local-image-ambiguous", color = "白色", taxType = "未税")
        appState.update { it.copy(quotes = it.quotes + second) }
        rule.runOnUiThread {
            model.applyImageQuoteCandidate(
                QuoteDraft(customer = customer, grade = quote.grade, price = "13.5", taxType = "未注明", effectiveDate = quote.effectiveDate),
                ImageQuoteSource("image-review-qa.png", row = 1),
            )
            assertNull(model.state.value.editingQuote)
            model.updateDraft { it.copy(color = "黑色") }
            model.setImageReviewAccepted(true)
            model.saveQuote()
            assertEquals(quote.id, model.state.value.editingQuote?.id)
            assertEquals("含税", model.state.value.draft?.taxType)
            assertFalse(model.state.value.imageReviewed)
            assertFalse(model.state.value.saving)
            assertNull(model.state.value.pendingSave)
        }
        rule.onNodeWithTag("image-quote-review").assertExists()
        rule.onNodeWithText("保存调价").assertIsNotEnabled()
        rule.runOnUiThread {
            model.cancelEditor()
            appState.update { it.copy(quotes = it.quotes.filterNot { row -> row.id in setOf(quote.id, second.id) }) }
        }
    }
}
