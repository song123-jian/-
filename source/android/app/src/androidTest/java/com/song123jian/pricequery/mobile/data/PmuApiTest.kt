package com.song123jian.pricequery.mobile.data

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PmuApiTest {
    @Test
    fun snapshotCurrentStatusDoesNotDependOnGatewayOptionalFlag() {
        val snapshot = JSONObject()
            .put("owner_id", "00000000-0000-0000-0000-000000000001")
            .put("data_version", "1")
            .put("schema_epoch", "qa")
            .put("business_date", "2026-10-23")
            .put("customers", JSONArray())
            .put("quotes", JSONArray()
                .put(JSONObject().put("id", "1").put("scheduled", false))
                .put(JSONObject().put("id", "2").put("scheduled", true)))
        val quotes = PmuApi().parseSnapshot(snapshot).quotes
        assertTrue(quotes[0].isCurrent)
        assertFalse(quotes[1].isCurrent)
    }

    @Test
    fun malformedSnapshotCannotMasqueradeAsEmptyAccount() {
        val result = runCatching {
            PmuApi().parseSnapshot(JSONObject().put("owner_id", "00000000-0000-0000-0000-000000000001"))
        }
        assertTrue(result.exceptionOrNull() is ApiFailure)
    }

    @Test
    fun sourceMetadataIsAddedOnlyToTheLegacyDesktopRpcRecord() {
        val mobileRecord = QuoteDraft(customer = "客户", grade = "PA66", price = "12", taxType = "含税", effectiveDate = "2026-10-23").toSaveRecordJson()
        assertFalse(mobileRecord.has("source_file"))
        assertFalse(mobileRecord.has("import_immediate"))
        val compatible = legacyQuoteRecord(mobileRecord, ImageQuoteSource("quote.png", row = 2), "7")
        assertEquals("quote.png", compatible.getString("source_file"))
        assertEquals("图片识别", compatible.getString("source_sheet"))
        assertEquals(2, compatible.getInt("source_row"))
        assertTrue(compatible.getBoolean("import_immediate"))
        assertEquals("7", compatible.getString("customer_revision"))
        assertFalse(mobileRecord.has("source_file"))
    }
}
