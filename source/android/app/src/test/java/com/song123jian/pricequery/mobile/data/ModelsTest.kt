package com.song123jian.pricequery.mobile.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Test

class ModelsTest {
    private val validDraft = QuoteDraft(
        customer = "示例客户",
        grade = "PA66",
        material = "增强料",
        color = "黑色",
        price = "12.3456",
        taxType = "含税",
        effectiveDate = "2026-10-23",
    )

    @Test
    fun validQuoteDraftIsAccepted() {
        assertNull(validateDraft(validDraft, isUpdate = false))
    }

    @Test
    fun quoteDraftRejectsZeroPriceAndInvalidCalendarDate() {
        assertEquals("价格须大于 0 且不超过 10 亿元/kg", validateDraft(validDraft.copy(price = "0"), false))
        assertEquals("日期须为 YYYY-MM-DD", validateDraft(validDraft.copy(effectiveDate = "2026-02-30"), false))
    }

    @Test
    fun quoteUpdateRequiresReason() {
        assertEquals("请输入本次调价原因", validateDraft(validDraft, isUpdate = true))
        assertNull(validateDraft(validDraft.copy(reason = "客户调价"), isUpdate = true))
    }

    @Test
    fun quoteIdentityFillOnlyAllowsPreviouslyMissingColorAndTax() {
        val base = quote("10", tax = "未注明").copy(color = "")
        val target = QuoteDraft.fromQuote(base).copy(color = "黑色", taxType = "含税")
        assertTrue(needsIdentityFill(base, target))
        assertNull(validateIdentityFill(base, target))
        assertTrue(validateIdentityFill(quote("11"), QuoteDraft.fromQuote(quote("11")).copy(color = "白色")).orEmpty().contains("空白的颜色"))
        assertTrue(validateIdentityFill(base, target.copy(grade = "PA66-OTHER")).orEmpty().contains("不能更改客户或牌号"))
        assertFalse(needsIdentityFill(base, QuoteDraft.fromQuote(base)))
    }

    @Test
    fun supplierProfileAcceptsOnlyKnownSingleLineFields() {
        val fields = checkedSupplierFields(mapOf("seller_name" to "供方", "email" to "sales@example.test", "unknown" to "ignored"))
        assertEquals(mapOf("seller_name" to "供方", "email" to "sales@example.test"), fields)
        assertTrue(runCatching { checkedSupplierFields(mapOf("seller_phone" to "123\n456")) }.isFailure)
        assertTrue(runCatching { checkedSupplierFields(mapOf("seller_name" to "x".repeat(2001))) }.isFailure)
    }

    @Test
    fun definitiveRejectionOnlyClearsNewRequest() {
        val rejected = ApiFailure("rejected", status = 409, uncertain = false)
        assertFalse(retainPendingSave(submitted = true, isRetry = false, rejected))
        assertTrue(retainPendingSave(submitted = true, isRetry = true, rejected))
    }

    @Test
    fun uncertainOrUnexpectedFailureRetainsSubmittedRequest() {
        assertTrue(retainPendingSave(true, false, ApiFailure("network", uncertain = true)))
        assertTrue(retainPendingSave(true, false, IllegalStateException("response parse failed")))
        assertFalse(retainPendingSave(false, false, IllegalStateException("local storage failed")))
    }

    @Test
    fun quoteFiltersCombineCustomerKeywordMaterialTaxDateAndStale() {
        val rows = listOf(
            quote("1", customer = "华东客户", material = "增强料", tax = "含税", date = "2026-01-01", ageDays = 80, stale = true),
            quote("2", customer = "华东客户", material = "增强料", tax = "含税", date = "2026-02-01", ageDays = 20, stale = false),
            quote("3", customer = "华南客户", material = "普通料", tax = "未税", date = "2026-01-01", ageDays = 90, stale = true),
        )

        val result = filterQuotes(
            rows,
            QuoteFilters(
                customer = "华东",
                query = "PA66",
                material = "增强料",
                tax = "含税",
                dateFrom = "2026-01-01",
                dateTo = "2026-01-31",
                staleOnly = true,
            ),
        )

        assertEquals(listOf("1"), result.map { it.id })
    }

    @Test
    fun quoteFilterValidationRejectsInvalidDatesAndRanges() {
        assertEquals("日期须为 YYYY-MM-DD", validateQuoteFilters(QuoteFilters(dateFrom = "2026-02-30")))
        assertEquals("开始日期不能晚于结束日期", validateQuoteFilters(QuoteFilters(dateFrom = "2026-03-01", dateTo = "2026-02-01")))
        assertNull(validateQuoteFilters(QuoteFilters(dateFrom = "2026-02-01", dateTo = "2026-03-01")))
    }

    @Test
    fun quoteSortingUsesNumericPricesAndSupportsReverseOrder() {
        val rows = listOf(quote("10.5").copy(id = "ten", price = "10.5"), quote("9.9").copy(id = "nine", price = "9.9"))
        assertEquals(listOf("nine", "ten"), sortQuotes(rows, QuoteSortField.PRICE, ascending = true).map { it.id })
        assertEquals(listOf("ten", "nine"), sortQuotes(rows, QuoteSortField.PRICE, ascending = false).map { it.id })
        assertEquals(listOf("nine", "ten"), sortQuotes(rows, QuoteSortField.PRICE, ascending = true).map { it.id })
    }

    @Test
    fun csvExportEscapesCommaQuoteAndLineBreak() {
        val row = quote("1", note = "备注,含\"引号\"\n第二行")
        val csv = quotesCsv(listOf(row), history = false)

        assertTrue(csv.contains("\"备注,含\"\"引号\"\"\n第二行\""))
        assertTrue(csv.startsWith("客户,牌号,材料类别"))
    }

    private fun quote(
        id: String,
        customer: String = "示例客户",
        material: String = "增强料",
        tax: String = "含税",
        date: String = "2026-10-23",
        ageDays: Int = 0,
        stale: Boolean = false,
        note: String = "",
    ) = QuoteRecord(
        id = id,
        customer = customer,
        grade = "PA66",
        material = material,
        color = "黑色",
        price = "12.3456",
        taxType = tax,
        effectiveDate = date,
        note = note,
        reason = "",
        sourceType = "手工录入",
        customerRevision = "0",
        historyCount = 1,
        futureCount = 0,
        previousPrice = null,
        delta = null,
        scheduled = false,
        stale = stale,
        ageDays = ageDays,
    )
}
