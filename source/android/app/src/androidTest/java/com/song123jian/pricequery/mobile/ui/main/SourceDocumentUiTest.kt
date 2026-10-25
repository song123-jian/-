package com.song123jian.pricequery.mobile.ui.main

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.platform.app.InstrumentationRegistry
import com.song123jian.pricequery.mobile.BusinessPage
import com.song123jian.pricequery.mobile.MainActivity
import com.song123jian.pricequery.mobile.MobileViewModel
import com.song123jian.pricequery.mobile.data.MobilePreferences
import com.song123jian.pricequery.mobile.data.sourceReference
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.File

class SourceDocumentUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test fun productDetailsFoldInMemoryDraft() {
        val activity = rule.activity
        assertNotNull("Requires the existing session; this test does not save a draft", MobilePreferences(activity).loadVault().session)
        val model = ViewModelProvider(activity, MobileViewModel.Factory(activity))[MobileViewModel::class.java]
        rule.waitUntil(30000) { model.state.value.syncStatus == "已同步" }
        rule.onNodeWithContentDescription("打开导航菜单").performClick()
        rule.onNodeWithTag("drawer-documents").performClick()
        rule.onNode(hasText("新建报价单") and !isSelectable()).performClick()
        rule.waitUntil(10000) { model.business.state.value.document != null && !model.business.state.value.busy }
        val reference = sourceReference(activity, "quotation")
        rule.runOnUiThread {
            model.business.updateDocument {
                it.copy(items = listOf(
                    reference.items[0] + ("model" to "QA-FOLD-1"),
                    reference.items[0] + ("model" to "QA-FOLD-2"),
                ))
            }
        }

        rule.onNode(hasScrollToIndexAction()).performScrollToNode(hasContentDescription("展开产品 2 明细"))
        rule.onNodeWithTag("document-item-1-model").assertDoesNotExist()
        rule.onNodeWithContentDescription("展开产品 2 明细").assertExists()
        rule.onNodeWithContentDescription("展开产品 2 明细").performClick()
        rule.onNode(hasScrollToIndexAction()).performScrollToNode(hasTestTag("document-item-1-model"))
        rule.onNodeWithTag("document-item-1-model").assertExists()
        rule.onNode(hasScrollToIndexAction()).performScrollToNode(hasContentDescription("收起产品 2 明细"))
        rule.onNodeWithContentDescription("收起产品 2 明细").performClick()
        rule.onNodeWithTag("document-item-1-model").assertDoesNotExist()

        rule.runOnUiThread { model.business.open(BusinessPage.MENU) }
    }

    @Test fun actualEditorExportsCompactRowsAndPreviewsBothSourceForms() {
        val activity = rule.activity
        val outputDirectory = InstrumentationRegistry.getArguments().getString("qa_output_directory", "source-document-qa")!!
        require(Regex("[A-Za-z0-9_-]+").matches(outputDirectory))
        assertNotNull("Requires the user's existing session; no cloud writes are made", MobilePreferences(activity).loadVault().session)
        val model = ViewModelProvider(activity, MobileViewModel.Factory(activity))[MobileViewModel::class.java]
        rule.waitUntil(30000) { model.state.value.syncStatus == "已同步" }
        rule.onNodeWithContentDescription("打开导航菜单").performClick()
        rule.onNodeWithTag("drawer-documents").performClick()
        for ((kind, count) in listOf("quotation" to 1, "quotation" to 2, "contract" to 1, "contract" to 3)) {
            rule.runOnUiThread { model.business.open(BusinessPage.DOCUMENTS) }
            rule.onNode(hasText(if (kind == "quotation") "新建报价单" else "新建购销合同") and !isSelectable()).performClick()
            rule.waitUntil(10000) { model.business.state.value.document?.kind == kind && !model.business.state.value.busy }
            rule.runOnUiThread { model.business.updateDocument {
                val reference = sourceReference(activity, kind)
                reference.copy(items = List(count) { reference.items[0] + ("model" to "QA-$it") })
            } }
            if (count > 1) {
                rule.onNode(hasScrollToIndexAction()).performScrollToNode(hasContentDescription("展开产品 2 明细"))
                rule.onNodeWithTag("document-item-1-model").assertDoesNotExist()
                rule.onNodeWithContentDescription("展开产品 2 明细").performClick()
                rule.onNode(hasScrollToIndexAction()).performScrollToNode(hasTestTag("document-item-1-model"))
                rule.onNodeWithTag("document-item-1-model").assertIsDisplayed().assertTextContains("QA-1")
                rule.onNode(hasScrollToIndexAction()).performScrollToNode(hasContentDescription("收起产品 2 明细"))
                rule.onNodeWithContentDescription("收起产品 2 明细").performClick()
                rule.onNodeWithTag("document-item-1-model").assertDoesNotExist()
            }
            rule.onNode(hasScrollToIndexAction()).performScrollToNode(hasText("需方单位名称"))
            rule.onNodeWithText("需方单位名称").performTextReplacement("手机单据验收客户")
            rule.onNode(hasScrollToIndexAction()).performScrollToNode(hasText("导出Word"))
            rule.onNodeWithText("导出Word").performClick()
            rule.waitUntil(60000) { !model.business.state.value.busy && (model.business.state.value.artifact?.mime?.contains("wordprocessingml") == true || model.business.state.value.error != null) }
            assertNull(model.business.state.value.error)
            val directory = File(activity.filesDir, outputDirectory).apply { mkdirs() }
            model.business.state.value.artifact!!.file.copyTo(File(directory, "ui-$kind-rows$count.docx"), overwrite = true)
            rule.onNode(hasScrollToIndexAction()).performScrollToNode(hasText("生成PDF"))
            rule.onNodeWithText("生成PDF").performClick()
            rule.waitUntil(60000) { !model.business.state.value.busy && (model.business.state.value.documentPreview != null || model.business.state.value.error != null) }
            assertNull(model.business.state.value.error)
            model.business.state.value.documentPreview!!.file.copyTo(File(directory, "ui-$kind-rows$count.pdf"), overwrite = true)
            rule.onNodeWithText("预览", useUnmergedTree = true).performClick()
            rule.onNodeWithText("PDF预览").assertExists()
            rule.waitUntil(30000) { rule.onAllNodesWithContentDescription("单据第1页").fetchSemanticsNodes().isNotEmpty() }
            rule.onNodeWithContentDescription("上一页").assertIsNotEnabled()
            if (count > 1) {
                rule.onNodeWithContentDescription("下一页").performClick()
                rule.waitUntil(30000) { rule.onAllNodesWithContentDescription("单据第2页").fetchSemanticsNodes().isNotEmpty() }
                rule.onNodeWithText("2 / 2").assertExists()
                rule.onNodeWithContentDescription("下一页").assertIsNotEnabled()
                rule.onNodeWithContentDescription("上一页").performClick()
                rule.waitUntil(30000) { rule.onAllNodesWithContentDescription("单据第1页").fetchSemanticsNodes().isNotEmpty() }
            } else {
                rule.onNodeWithText("1 / 1").assertExists()
                rule.onNodeWithContentDescription("下一页").assertIsNotEnabled()
            }
            rule.onNodeWithContentDescription("关闭PDF预览").performClick()
        }
        rule.runOnUiThread { model.business.open(BusinessPage.DOCUMENTS) }
    }
}
