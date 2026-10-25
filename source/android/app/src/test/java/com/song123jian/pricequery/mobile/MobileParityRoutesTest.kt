package com.song123jian.pricequery.mobile

import org.junit.Assert.assertTrue
import org.junit.Test

class MobileParityRoutesTest {
    @Test
    fun desktopWorkspaceDomainsHaveMobileDestinations() {
        val mobilePages = BusinessPage.values().map { it.name }.toSet()

        listOf("CUSTOMER_PROFILES", "TODOS", "PROJECT_PROGRESS").forEach { requiredPage ->
            assertTrue("Missing mobile destination: $requiredPage", requiredPage in mobilePages)
        }
    }
}
