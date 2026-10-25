package com.song123jian.pricequery.mobile.ui.main

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.platform.app.InstrumentationRegistry
import com.song123jian.pricequery.mobile.MainActivity
import com.song123jian.pricequery.mobile.MobileScreen
import com.song123jian.pricequery.mobile.MobileViewModel
import com.song123jian.pricequery.mobile.data.*
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket

class CustomerCreationCloudUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun authorizedDirectoryCreationSyncsToDesktopAndIsRecycled() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Requires explicit controlled-write authorization", args.getString("controlled_writes") == "true")
        val nonce = args.getString("qa_nonce") ?: error("Missing bridge nonce")
        require(nonce.length >= 32)
        val preferences = MobilePreferences(rule.activity)
        val vault = preferences.loadVault()
        assertNotNull(vault.session)
        assertNull(vault.pendingSave)
        assertNull(vault.pendingBusiness)
        val model = ViewModelProvider(rule.activity, MobileViewModel.Factory(rule.activity))[MobileViewModel::class.java]
        rule.waitUntil(40000) { model.state.value.syncMeta != null && !model.state.value.loading }
        val api = PmuApi()
        fun snapshot(): BackupSnapshot = runBlocking {
            val session = preferences.loadVault().session ?: error("Session unavailable")
            BackupSnapshot(api.businessRpc(preferences.config(), session, "pmu_export_snapshot", JSONObject()).value as JSONObject)
        }
        val before = snapshot()
        val oldQuotes = before.quotes.associate { it.getString("id") to it.toString() }
        val oldCustomers = before.customers.associate { it.getString("customer_key") to it.toString() }
        val customer = "手机客户新增验收-${System.currentTimeMillis()}"
        var completed = false
        val steps = JSONArray()
        ServerSocket(18764, 1, InetAddress.getLoopbackAddress()).use { server ->
            server.soTimeout = 120000
            server.accept().use { socket ->
                socket.soTimeout = 120000
                val input = socket.getInputStream().bufferedReader(Charsets.UTF_8)
                val output = socket.getOutputStream().bufferedWriter(Charsets.UTF_8)
                check(input.readLine() == nonce) { "Unauthorized bridge" }
                val config = preferences.config()
                val session = preferences.loadVault().session ?: error("Session unavailable")
                output.write(JSONObject().put("config", JSONObject().put("url", config.projectUrl).put("publishable_key", config.publishableKey))
                    .put("user_id", session.userId).put("username", session.username).put("access_token", session.accessToken).toString())
                output.newLine(); output.flush()
                fun desktop(action: String, quote: QuoteRecord? = null) {
                    val message = JSONObject().put("action", action).put("customer", customer).put("completed", completed)
                    quote?.let {
                        message.put("expect", JSONObject().put("id", it.id).put("customer", it.customer).put("grade", it.grade)
                            .put("material", it.material).put("color", it.color).put("price", it.price).put("tax_type", it.taxType)
                            .put("effective_date", it.effectiveDate))
                    }
                    output.write(message.toString()); output.newLine(); output.flush()
                    val response = JSONObject(input.readLine() ?: error("Desktop bridge disconnected"))
                    check(response.optBoolean("ok")) { "Desktop $action did not pass" }
                    steps.put("desktop:$action")
                }
                try {
                    desktop("ready")
                    rule.onNodeWithContentDescription("打开导航菜单").performClick()
                    rule.onNodeWithTag("drawer-customers").performScrollTo().performClick()
                    rule.onNodeWithText("搜索客户").performTextReplacement("NO-MATCH-CLOUD-QA")
                    rule.onNodeWithTag("customer-add").performClick()
                    rule.onNode(hasText("新增客户") and !isSelectable()).assertIsDisplayed()
                    fun field(label: String, value: String) = rule.onNodeWithText(label).performScrollTo().performTextReplacement(value)
                    field("客户", customer)
                    field("牌号", "PA66-CUSTOMER-QA")
                    field("材料", "工程塑料")
                    field("颜色", "黑色")
                    field("价格", "26.5")
                    rule.onNodeWithText("含税").performScrollTo().performClick()
                    rule.onNodeWithTag("quote-save").performScrollTo().performClick()
                    rule.waitUntil(50000) {
                        !model.state.value.saving && (model.state.value.errorMessage != null || model.state.value.customers.any { it.displayName == customer })
                    }
                    assertNull(model.state.value.errorMessage, model.state.value.errorMessage)
                    assertNull(model.state.value.pendingSave)
                    assertEquals(MobileScreen.CUSTOMERS, model.state.value.screen)
                    assertEquals("", model.state.value.customerQuery)
                    rule.onNodeWithText(customer).assertIsDisplayed()
                    val quote = model.state.value.quotes.single { it.customer == customer }
                    assertEquals("26.5", quote.price)
                    steps.put("phone:directory-create-save-visible")
                    desktop("created", quote)
                    rule.onNodeWithText(customer).performClick()
                    rule.onNodeWithText("查看客户详情").performScrollTo().performClick()
                    rule.waitUntil(30000) { !model.state.value.customerDetailLoading }
                    assertNull(model.state.value.errorMessage)
                    rule.onNodeWithText("移入回收站").performClick()
                    rule.onNodeWithText("操作原因（选填）").performTextReplacement("手机客户新增验收：结束后回收，保留历史")
                    rule.onNode(hasText("确认") and hasAnyAncestor(isDialog())).performClick()
                    rule.waitUntil(50000) { !model.business.state.value.busy }
                    assertNull(model.business.state.value.error, model.business.state.value.error)
                    assertNull(model.state.value.pendingBusiness)
                    rule.waitUntil(40000) { model.state.value.customers.none { it.displayName == customer } }
                    desktop("recycled")
                    completed = true
                } finally {
                    if (model.state.value.pendingSave == null && model.state.value.pendingBusiness == null) {
                        val target = snapshot().customers.firstOrNull { it.optString("display_name") == customer && it.optString("status") == "active" }
                        if (target != null) {
                            rule.runOnUiThread {
                                model.business.changeCustomer(CustomerRecord(target.getString("customer_key"), customer, target.getString("revision"), 1, 1), false, "手机客户新增验收：失败恢复回收，保留历史")
                            }
                            rule.waitUntil(50000) { !model.business.state.value.busy }
                            assertNull(model.business.state.value.error, model.business.state.value.error)
                        }
                    }
                    val after = snapshot()
                    assertTrue("Existing quotes must remain unchanged", oldQuotes.all { (id, row) -> after.quotes.singleOrNull { it.getString("id") == id }?.toString() == row })
                    assertTrue("Existing customers must remain unchanged", oldCustomers.all { (key, row) -> after.customers.singleOrNull { it.getString("customer_key") == key }?.toString() == row })
                    assertEquals("deleted", after.customers.single { it.optString("display_name") == customer }.optString("status"))
                    assertEquals(1, after.quotes.count { it.optString("customer") == customer })
                    rule.runOnUiThread { model.openCustomers() }
                    File(rule.activity.filesDir, "customer-creation-report.json").writeText(JSONObject()
                        .put("completed", completed).put("steps", steps).put("existing_quotes_unchanged", true)
                        .put("existing_customers_unchanged", true).put("cleanup", "recycled-history-preserved")
                        .put("test_quote_count", 1).toString(2), Charsets.UTF_8)
                    desktop("finish")
                }
            }
        }
    }
}
