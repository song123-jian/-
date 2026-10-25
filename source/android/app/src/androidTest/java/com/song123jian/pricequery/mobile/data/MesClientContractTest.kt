package com.song123jian.pricequery.mobile.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MesClientContractTest {
    @Test
    fun androidJsonTotalCountMatchesDesktopIntegerContract() {
        val integer = JSONObject("""{"totalCount":7}""").get("totalCount")
        assertEquals(7, parseInventoryTotalCount(integer))

        listOf(
            """{"totalCount":7.0}""",
            """{"totalCount":7.5}""",
            """{"totalCount":"7"}""",
            """{"totalCount":-1}""",
            """{"totalCount":2147483648}""",
        ).forEach { body ->
            val value = JSONObject(body).get("totalCount")
            assertTrue("Expected MES totalCount to be rejected: $body", runCatching {
                parseInventoryTotalCount(value)
            }.isFailure)
        }

        assertEquals(
            21_474_837,
            InventoryResult("PA66", "material_code", 1, Int.MAX_VALUE, emptyList(), "").pages,
        )
        assertTrue(inventoryPageIsConsistent(Int.MAX_VALUE, 21_474_837, 47))
        assertFalse(inventoryPageIsConsistent(Int.MAX_VALUE, 21_474_837, 48))
    }
}
