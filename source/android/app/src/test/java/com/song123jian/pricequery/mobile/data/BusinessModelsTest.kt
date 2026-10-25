package com.song123jian.pricequery.mobile.data

import org.junit.Assert.*
import org.junit.Test
import java.math.BigDecimal

class BusinessModelsTest {
    private fun quote(
        id: String,
        customer: String = "验收客户",
        grade: String = "PA66",
        material: String = "尼龙",
        color: String = "黑色",
        tax: String = "含税",
        note: String = "",
        identity: String = "",
    ) = QuoteRecord(
        id = id, customer = customer, grade = grade, material = material, color = color, price = "10",
        taxType = tax, effectiveDate = "2026-10-20", note = note, reason = "", sourceType = "手工录入",
        customerRevision = "1", historyCount = 1, futureCount = 0, previousPrice = null, delta = null,
        scheduled = false, stale = false, ageDays = 0, identity = identity,
    )

    @Test fun identitiesMatchDesktopPythonReference() {
        val row = ImportRow(" 验收 客户 ", "ＡＢＣ-1", "PA66", "黑", "12.5", "含税", "2026-10-23", "测试", "导入", "test.csv", "CSV", 2)
        assertEquals("b7f49f2071ceb05f9c4ab52122c6c646ad4a4b02d03d12b2caeee40493c14e36", row.customerKey)
        assertEquals("c847b9cf54f9d5bb80444a9d7bbc97b51d9883b1a027613fa054e9fbec23182d", row.identity)
        assertEquals("ca740ed4b3d74a46a61d1b01d521addcb6b326e8eb9451f001aec90a000984a2", row.importKey)
    }

    @Test fun normalizationAndPricesRejectInvalidValues() {
        assertEquals("A B", businessNorm("\u00a0Ａ\u3000b "))
        assertEquals("12.5", normalizedPrice("12.500000"))
        listOf("0", "-1", "NaN", "1.0000001", "1000000001", "1e3").forEach { input -> assertTrue(input, runCatching { normalizedPrice(input) }.isFailure) }
    }

    @Test fun datesUseExplicitFallbackAndExcelEpoch() {
        assertEquals("2026-10-23", importDate("", "2026-10-23"))
        assertEquals("1900-01-01", importDate("2", ""))
        assertEquals("1904-01-01", importDate("0", "", true))
        assertTrue(runCatching { importDate("2026-02-30", "") }.isFailure)
        assertTrue(runCatching { importDate("2201-01-01", "") }.isFailure)
    }

    @Test fun contractAmountRoundsPerItem() {
        val item = mapOf("price" to "1.005", "quantity" to "1")
        assertEquals(BigDecimal("1.01"), itemAmount(item))
        assertTrue(runCatching { itemAmount(mapOf("price" to "999999999", "quantity" to "999999999")) }.isFailure)
        assertTrue(runCatching { itemAmount(mapOf("price" to "1", "quantity" to "0")) }.isFailure)
        assertEquals("壹亿零壹元零壹分", rmbUpper(BigDecimal("100000001.01")))
        assertEquals("零元整", rmbUpper(BigDecimal.ZERO))
    }

    @Test fun newContractNeverInventsTaxConversion() {
        val quotation = BusinessDocument.create("quotation")
        assertEquals("南京聚隆科技股份有限公司", quotation.fields["seller_name"])
        assertEquals(9, quotation.terms.size)
        assertEquals(1, quotation.items.size)
        assertTrue(runCatching { validateDocument(quotation) }.isFailure)
    }

    @Test fun mesQueryRejectsDelimitersAndEscapesLikeWildcards() {
        listOf("A'B", "A--B", "a;b", "a\nb", "a/*b").forEach { assertTrue(runCatching { validateMesQuery(it) }.isFailure) }
        assertEquals("A[%][_][[]B", mesLiteral("A%_[B"))
    }

    @Test fun csvSpreadsheetPayloadsAreNeutralized() {
        assertEquals("'=SUM(A1)", FileExchange.spreadsheetCell("=SUM(A1)"))
        assertEquals("'  @cmd", FileExchange.spreadsheetCell("  @cmd"))
        assertEquals("中文", FileExchange.spreadsheetCell("中文"))
    }

    @Test fun importMatchingMergesOnlyUniqueCustomerGradeAndPreservesExistingSpec() {
        val customerKey = sha256(businessNorm("验收客户"))
        val customer = ImportCustomerState(customerKey, "active", "7")
        val existing = ExistingImportQuote(12, customerKey, "验收客户", "PA66-GF30", "PA66", "黑色", "10", "含税",
            "2026-10-20", "原备注\n材料规格：GF30", "", "手工录入", "", "", 0)
        val incoming = ImportRow("验收客户", "PA66-GF30", "", "", "12.5", "未注明", "2026-10-23", "", "", "a.csv", "CSV", 2)
        val result = matchImportRows(ImportPreview(listOf(incoming), emptyList()), listOf(existing), listOf(customer), "验收客户", "2026-10-23")
        assertEquals(listOf("更新 / 合并"), result.rowActions)
        assertEquals(1, result.updateCount)
        assertEquals("黑色", result.fresh.single().color)
        assertEquals("含税", result.fresh.single().tax)
        assertEquals("PA66", result.fresh.single().material)
        assertEquals("原备注\n材料规格：GF30", result.fresh.single().note)
        assertEquals("7", result.revisions[customerKey])
    }

    @Test fun importMatchingRejectsAmbiguousAndConflictingMaterialSpecs() {
        val customerKey = sha256(businessNorm("验收客户"))
        val customer = ImportCustomerState(customerKey, "active", "1")
        fun quote(id: Long, color: String, tax: String, note: String) = ExistingImportQuote(
            id, customerKey, "验收客户", "PA66", "尼龙", color, "10", tax, "2026-10-20", note, "", "手工录入", "", "", 0)
        val ambiguous = ImportRow("验收客户", "PA66", "尼龙", "", "12", "未注明", "2026-10-23", "", "", "a.csv", "CSV", 2)
        val collision = matchImportRows(ImportPreview(listOf(ambiguous), emptyList()),
            listOf(quote(1, "黑色", "含税", ""), quote(2, "白色", "未税", "")), listOf(customer), "验收客户", "2026-10-23")
        assertEquals(listOf("匹配冲突"), collision.rowActions)
        assertTrue(collision.errors.single().contains("匹配多个颜色或税口径"))
        assertTrue(collision.fresh.isEmpty())

        val specConflict = ambiguous.copy(color = "黑色", tax = "含税", note = "材料规格：GF15")
        val conflict = matchImportRows(ImportPreview(listOf(specConflict), emptyList()),
            listOf(quote(1, "黑色", "含税", "材料规格：GF30")), listOf(customer), "验收客户", "2026-10-23")
        assertEquals(listOf("匹配冲突"), conflict.rowActions)
        assertTrue(conflict.errors.single().contains("材料规格与已有记录冲突"))
    }

    @Test fun imageQuoteMatchesUniqueSpecificationAndPreservesAmbiguityWithoutIdentityFields() {
        val blackTaxed = quote("1", identity = "")
        val whiteUntaxed = quote("2", color = "白色", tax = "未税", identity = "")
        val incomplete = QuoteDraft(customer = "验收客户", grade = "PA66", taxType = "未注明")
        assertEquals(2, matchingImageQuotes(listOf(blackTaxed, whiteUntaxed), incomplete).size)
        assertEquals("1", matchingImageQuotes(listOf(blackTaxed, whiteUntaxed), incomplete.copy(color = "黑色", taxType = "含税")).single().id)

        val sameSpecificationHistory = quote("3", identity = quoteIdentity("验收客户", "PA66", "黑色", "含税"))
        assertEquals(1, matchingImageQuotes(listOf(blackTaxed, sameSpecificationHistory), incomplete).size)
    }

    @Test fun imageQuoteMatchRejectsProductAndMaterialSpecificationConflicts() {
        val existing = quote("1", material = "尼龙", note = "材料规格：GF30")
        val productConflict = imageQuoteMatchError(QuoteDraft(customer = "验收客户", grade = "PA66", material = "工程塑料"), existing)
        assertTrue(productConflict!!.contains("产品名称与已有规格冲突"))
        val specConflict = imageQuoteMatchError(QuoteDraft(customer = "验收客户", grade = "PA66", note = "材料规格：GF15"), existing)
        assertTrue(specConflict!!.contains("材料规格与已有报价冲突"))
    }

    @Test fun selectedImportCustomerOverridesFileCustomerAndUsesSelectedRevision() {
        val fileCustomerKey = sha256(businessNorm("文件客户"))
        val selectedKey = sha256(businessNorm("指定客户"))
        val customers = listOf(
            ImportCustomerState(fileCustomerKey, "active", "3"),
            ImportCustomerState(selectedKey, "active", "9"),
        )
        val existing = ExistingImportQuote(
            12, selectedKey, "指定客户", "PA66", "尼龙", "黑色", "10", "含税",
            "2026-10-20", "已有备注", "", "手工录入", "", "", 0,
        )
        val incoming = ImportRow("文件客户", "PA66", "", "", "12.5", "未注明", "2026-10-23", "", "", "a.csv", "CSV", 2)
        val result = matchImportRows(ImportPreview(listOf(incoming), emptyList()), listOf(existing), customers, "指定客户", "2026-10-23")
        assertEquals("指定客户", result.rows.single().customer)
        assertEquals(selectedKey, result.fresh.single().customerKey)
        assertEquals("黑色", result.fresh.single().color)
        assertEquals("含税", result.fresh.single().tax)
        assertEquals(mapOf(selectedKey to "9"), result.revisions)
        assertEquals(1, result.updateCount)
    }

    @Test fun selectedImportCustomerMustStillBeActive() {
        val key = sha256(businessNorm("验收客户"))
        val row = ImportRow("验收客户", "PA66", "", "", "12", "含税", "2026-10-23", "", "", "a.csv", "CSV", 2)
        val deleted = ImportCustomerState(key, "deleted", "2")
        val result = matchImportRows(ImportPreview(listOf(row), emptyList()), emptyList(), listOf(deleted), "验收客户", "2026-10-23")
        assertTrue(result.errors.single().contains("所选客户已不存在或在回收站"))
        assertTrue(result.fresh.isEmpty())
    }
}
