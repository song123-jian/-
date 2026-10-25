package com.song123jian.pricequery.mobile.ui.main

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.platform.app.InstrumentationRegistry
import com.song123jian.pricequery.mobile.*
import com.song123jian.pricequery.mobile.data.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket

class ActualCloudParityUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test fun authorizedPhoneDesktopRoundTrip() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Explicit controlled-write acceptance only", args.getString("controlled_writes") == "true")
        val nonce = args.getString("qa_nonce") ?: error("Missing temporary bridge nonce")
        require(nonce.length >= 32)
        val activity = rule.activity
        val preferences = MobilePreferences(activity)
        val vault = preferences.loadVault()
        assumeTrue("Requires the user's existing session and no unresolved write", vault.session != null && vault.pendingSave == null && vault.pendingBusiness == null)
        val session = vault.session!!
        val accountDirectory = File(activity.filesDir, "business/${session.userId}")
        val restoredManifest = File(accountDirectory, "restored-library.json")
        assumeTrue("A pre-existing restored-library index must not be replaced", !restoredManifest.exists())
        val model = ViewModelProvider(activity, MobileViewModel.Factory(activity))[MobileViewModel::class.java]
        rule.waitUntil(40000) { model.state.value.syncStatus == "已同步" }
        val api = PmuApi()
        fun snapshot(): BackupSnapshot = runBlocking {
            val activeSession = preferences.loadVault().session ?: error("Session lost")
            BackupSnapshot(api.businessRpc(preferences.config(), session, "pmu_export_snapshot", JSONObject()).value as JSONObject)
        }
        val before = snapshot()
        val original = before.quotes.associate { it.getString("id") to it.toString() }
        val customer = "手机同步验收-${System.currentTimeMillis()}"
        val steps = mutableListOf<String>()
        fun businessDone() {
            rule.waitUntil(45000) { !model.business.state.value.busy }
            assertNull(model.business.state.value.error, model.business.state.value.error)
        }
        fun synced(price: String) {
            rule.waitUntil(45000) {
                !model.state.value.saving && (model.state.value.errorMessage != null || model.state.value.quotes.any { it.customer == customer && it.price == price })
            }
            assertNull(model.state.value.errorMessage, model.state.value.errorMessage)
            assertNull(model.state.value.pendingSave)
            assertTrue(model.state.value.quotes.any { it.customer == customer && it.price == price })
        }
        fun field(label: String, value: String) {
            rule.onNodeWithText(label).performScrollTo().performTextReplacement(value)
        }
        ServerSocket(18763, 1, InetAddress.getLoopbackAddress()).use { server ->
            server.soTimeout = 120000
            server.accept().use { socket ->
                socket.soTimeout = 120000
                val input = socket.getInputStream().bufferedReader(Charsets.UTF_8)
                val output = socket.getOutputStream().bufferedWriter(Charsets.UTF_8)
                check(input.readLine() == nonce) { "Unauthorized bridge" }
                val config = preferences.config()
                val activeSession = preferences.loadVault().session ?: error("Session lost")
                output.write(JSONObject().put("config", JSONObject().put("url", config.projectUrl).put("publishable_key", config.publishableKey))
                    .put("user_id", activeSession.userId).put("username", activeSession.username).put("access_token", activeSession.accessToken).toString())
                output.newLine(); output.flush()
                var completed = false
                fun desktop(action: String, price: String = "") {
                    output.write(JSONObject().put("action", action).put("customer", customer).put("price", price).put("completed", completed).toString())
                    output.newLine(); output.flush()
                    val result = JSONObject(input.readLine() ?: error("Desktop bridge disconnected"))
                    check(result.optBoolean("ok")) { result.optString("error", "Desktop acceptance failed") }
                    steps.add("desktop:$action:$price")
                }
                if (args.getString("diagnostic_only") == "true") {
                    desktop("diagnose")
                    desktop("finish")
                    return
                }
                try {
                    rule.runOnUiThread { model.startNewQuote() }
                    field("客户", customer)
                    field("牌号", "PA66-MOBILE-QA")
                    field("材料", "工程塑料")
                    field("价格", "12.5")
                    rule.onNodeWithText("保存报价").performScrollTo().performClick()
                    synced("12.5")
                    desktop("read", "12.5")
                    rule.runOnUiThread { model.startEdit(model.state.value.quotes.single { it.customer == customer }) }
                    field("价格", "13.5")
                    field("调价原因", "手机同步验收：手机调价")
                    rule.onNodeWithText("保存调价").performScrollTo().performClick()
                    synced("13.5")
                    desktop("read", "13.5")
                    desktop("adjust", "14.5")
                    rule.runOnUiThread { model.refresh(force = true) }
                    synced("14.5")
                    rule.runOnUiThread { model.openHistory(model.state.value.quotes.single { it.customer == customer }) }
                    rule.waitUntil(40000) { !model.state.value.historyLoading }
                    assertNull(model.state.value.errorMessage)
                    assertEquals(setOf("12.5", "13.5", "14.5"), model.state.value.historyItems.map { it.price }.toSet())
                    rule.onNodeWithText("￥14.5").assertExists()
                    steps.add("phone:three-real-history-records")
                    rule.runOnUiThread { model.openTools(BusinessPage.BACKUP); model.business.createBackup() }
                    businessDone()
                    val backup = model.business.state.value.artifact!!
                    val reread = model.business.files.readBackup(backup.file)
                    assertEquals(3, reread.quotes.count { it.optString("customer") == customer })
                    val restored = File(activity.cacheDir, "qa-restored.sqlite3")
                    model.business.files.save(backup, android.net.Uri.fromFile(restored))
                    rule.runOnUiThread { model.business.inspectBackup(android.net.Uri.fromFile(restored)) }
                    businessDone()
                    rule.runOnUiThread { model.business.restoreLocalBackup() }
                    businessDone()
                    rule.runOnUiThread { model.business.openRestoredBackup() }
                    businessDone()
                    assertEquals(3, model.business.state.value.restored!!.quotes.count { it.optString("customer") == customer })
                    restored.delete()
                    steps.add("phone:backup-save-reread-restore")
                    var state = snapshot().customers.single { it.optString("display_name") == customer }
                    fun record(): CustomerRecord = CustomerRecord(state.getString("customer_key"), customer, state.getString("revision"), 1, 3)
                    rule.runOnUiThread { model.business.changeCustomer(record(), false, "手机同步验收：回收") }
                    businessDone()
                    desktop("absent")
                    state = snapshot().customers.single { it.optString("display_name") == customer }
                    rule.runOnUiThread { model.business.changeCustomer(record(), true, "手机同步验收：恢复") }
                    businessDone()
                    desktop("read", "14.5")
                    steps.add("phone:customer-recycle-and-restore")
                    completed = true
                } finally {
                    if (model.state.value.pendingSave == null && model.state.value.pendingBusiness == null) {
                        val target = snapshot().customers.firstOrNull { it.optString("display_name") == customer && it.optString("status") == "active" }
                        if (target != null) {
                            rule.runOnUiThread { model.business.changeCustomer(CustomerRecord(target.getString("customer_key"), customer, target.getString("revision"), 1, 3), false, "手机同步验收：验收结束，保留历史于回收站") }
                            businessDone()
                        }
                    }
                    val after = snapshot()
                    assertTrue("Existing business quotes changed", original.all { (id, row) -> after.quotes.firstOrNull { it.getString("id") == id }?.toString() == row })
                    assertTrue("Test customer cleanup failed", after.customers.none { it.optString("display_name") == customer && it.optString("status") == "active" })
                    assertEquals("Test customer remains available only in the recycle bin", "deleted", after.customers.firstOrNull { it.optString("display_name") == customer }?.optString("status"))
                    if (restoredManifest.isFile) {
                        val backupName = JSONObject(restoredManifest.readText(Charsets.UTF_8)).getString("file")
                        val backupFile = File(accountDirectory, backupName)
                        require(backupFile.canonicalFile.parentFile == File(accountDirectory, "backups").canonicalFile)
                        require(backupFile.name.startsWith("恢复库-"))
                        check(backupFile.delete()) { "Unable to remove the temporary restored QA backup" }
                        check(restoredManifest.delete()) { "Unable to remove the temporary QA restore index" }
                    }
                    File(activity.filesDir, "cloud-parity-report.json").writeText(JSONObject().put("steps", org.json.JSONArray(steps))
                        .put("existing_quotes_unchanged", true).put("cleanup", "recycled-history-preserved").toString(2), Charsets.UTF_8)
                    desktop("absent")
                    desktop("finish")
                }
            }
        }
    }
}
