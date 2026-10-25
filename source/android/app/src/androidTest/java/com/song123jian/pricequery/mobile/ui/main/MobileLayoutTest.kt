package com.song123jian.pricequery.mobile.ui.main

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.song123jian.pricequery.mobile.data.InventoryResult
import com.song123jian.pricequery.mobile.data.QuoteRecord
import com.song123jian.pricequery.mobile.theme.Theme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.util.concurrent.atomic.AtomicBoolean

class MobileLayoutTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun projectAddressStartsCollapsedAndCanBeExpandedAndCopied() {
        val url = "https://saodtwnvbanjlkwwivcb.supabase.co"
        val copied = AtomicBoolean(false)
        rule.setContent {
            Theme {
                ProjectAddressPanel(url, onCopy = { copied.set(true) })
            }
        }

        rule.onNodeWithText("项目地址").assertExists()
        rule.onNodeWithText(url).assertDoesNotExist()
        rule.onNodeWithTag("project-address-toggle").performClick()
        rule.onNodeWithText(url).assertExists()
        rule.onNodeWithTag("project-address-copy").performClick()
        assertTrue(copied.get())
        rule.onNodeWithTag("project-address-toggle").performClick()
        rule.onNodeWithText(url).assertDoesNotExist()
    }

    @Test
    fun quoteCardKeepsSummaryVisibleAndFoldsSecondaryDetailsAndActions() {
        val copied = AtomicBoolean(false)
        val quote = QuoteRecord(
            id = "layout-quote",
            customer = "布局验收客户",
            grade = "PA66-GF30",
            material = "PA66",
            color = "黑色",
            price = "18.5",
            taxType = "含税",
            effectiveDate = "2026-10-23",
            note = "验收备注内容",
            reason = "",
            sourceType = "文件导入",
            customerRevision = "0",
            historyCount = 3,
            futureCount = 0,
            previousPrice = "18.0",
            delta = "0.5",
            scheduled = false,
            stale = true,
            ageDays = 65,
            sourceFile = "报价导入.xlsx",
            sourceSheet = "报价",
            sourceRow = 4,
        )

        rule.setContent {
            Theme {
                QuoteSummaryCard(quote, onHistory = {}, onEdit = {}, onQuotation = {}, onContract = {}, onCopy = { copied.set(true) })
            }
        }

        rule.onNodeWithText("布局验收客户").assertExists()
        rule.onNodeWithText("￥18.5").assertExists()
        rule.onNodeWithText("验收备注内容").assertDoesNotExist()
        rule.onNodeWithText("来源：文件导入").assertDoesNotExist()
        rule.onNodeWithText("编辑").assertDoesNotExist()

        rule.onNodeWithContentDescription("展开报价详情").performClick()
        rule.onNodeWithText("验收备注内容").assertExists()
        rule.onNodeWithText("来源：文件导入").assertExists()
        rule.onNodeWithText("来源位置：报价导入.xlsx / 报价 / 4").assertExists()
        rule.onNodeWithText("较上一条 +0.5 元/kg").assertExists()
        rule.onNodeWithText("60天未更新").assertExists()
        rule.onNodeWithText("报价单").assertExists()
        rule.onNodeWithText("合同").assertExists()
        rule.onNodeWithText("历史").assertExists()
        rule.onNodeWithText("编辑").assertExists()
        rule.onNodeWithTag("quote-copy-layout-quote").performClick()
        assertTrue(copied.get())

        rule.onNodeWithContentDescription("收起报价详情").performClick()
        rule.onNodeWithText("验收备注内容").assertDoesNotExist()
    }

    @Test
    fun inventoryBatchActionsCopyAndOpenReserveQuery() {
        val copied = AtomicBoolean(false)
        val reserveOpened = AtomicBoolean(false)
        rule.setContent {
            Theme {
                InventoryBatchActions("BATCH-42", true, onCopy = { copied.set(true) }, onReserve = { reserveOpened.set(true) })
            }
        }
        rule.onNodeWithContentDescription("复制批号 BATCH-42").performClick()
        rule.onNodeWithTag("inventory-batch-reserve").performClick()
        assertTrue(copied.get())
        assertTrue(reserveOpened.get())
    }

    @Test
    fun inventoryTotalsRenderUnitGroupsAndMissingQuantityWarning() {
        val result = InventoryResult("PA66", "material_code", 1, 2, listOf(
            mapOf("单位" to "kg", "库存数量" to "1.25", "可用数量" to "0.5"),
            mapOf("单位" to "kg", "库存数量" to "", "可用数量" to "1.5"),
        ), "")

        rule.setContent { Theme { Column { InventoryQuantityTotals(result) } } }

        rule.onNodeWithText("本页库存 1.25 kg · 可分配 2.0 kg（存在空数量，合计仅含已知值）").assertExists()
    }

    @Test
    fun reserveTotalsRenderMissingUnitAndKnownQuantityWarning() {
        val result = InventoryResult("BATCH-42", "reserve", 1, 2, listOf(
            mapOf("备货数量" to "1.25"), mapOf("备货数量" to ""), mapOf("备货数量" to "0.75"),
        ), "")

        rule.setContent { Theme { Column { InventoryQuantityTotals(result) } } }

        rule.onNodeWithText("本页备货数量 2.00 · MES 未提供单位（存在空数量，仅合计已知值）").assertExists()
    }

    @Test
    fun historyTrendAndRecordDetailsKeepExactHistoryVisible() {
        val copied = AtomicBoolean(false)
        val dismissed = AtomicBoolean(false)
        val records = listOf(
            QuoteRecord("10", "趋势客户", "PA66", "增强料", "黑色", "9.9", "含税", "2026-10-01", "首条", "", "手工录入", "1", 3, 1, null, null, false, false, 0, isCurrent = false, createdAt = "2026-10-01 10:00:00"),
            QuoteRecord("11", "趋势客户", "PA66", "增强料", "黑色", "10.25", "含税", "2026-10-01", "同日更新", "客户议价", "手工录入", "1", 3, 1, "9.9", "0.35", false, false, 0, isCurrent = true, createdAt = "2026-10-01 12:00:00"),
            QuoteRecord("12", "趋势客户", "PA66", "增强料", "黑色", "11.5", "含税", "2026-10-12", "待生效", "新订单", "文件导入", "1", 3, 1, "10.25", "1.25", true, false, 0, isCurrent = false, sourceFile = "future.xlsx", sourceSheet = "报价", sourceRow = 6),
        )
        rule.setContent {
            Theme {
                androidx.compose.foundation.layout.Column {
                    QuoteTrendChart(records)
                    QuoteRecordDetails(records.last(), onDismiss = { dismissed.set(true) }, onCopy = { copied.set(true) })
                }
            }
        }
        rule.onNodeWithTag("quote-history-trend").assertExists()
        rule.onNodeWithContentDescription("价格历史趋势图，共3条记录").assertExists()
        rule.onNodeWithText("业务日期 / 状态").assertExists()
        rule.onNodeWithText("2026-10-12 · 待生效").assertExists()
        rule.onNodeWithText("文件导入").assertExists()
        rule.onNodeWithText("复制记录").performClick()
        assertTrue(copied.get())
        rule.onNodeWithText("关闭").performClick()
        assertTrue(dismissed.get())
    }
}
