package com.song123jian.pricequery.mobile.ui.main

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModelProvider
import androidx.test.platform.app.InstrumentationRegistry
import com.song123jian.pricequery.mobile.*
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

class SupplementCloudParityUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test fun nullHistoryImportFingerprintMustRemainAbsent() {
        val method = PmuApi::class.java.getDeclaredMethod("parseQuote", JSONObject::class.java)
        method.isAccessible = true
        val inputs = listOf(
            JSONObject().put("id", "1") to "",
            JSONObject().put("id", "2").put("import_key", JSONObject.NULL) to "",
            JSONObject().put("id", "3").put("import_key", sha256("controlled-fingerprint")) to sha256("controlled-fingerprint"),
        )
        inputs.forEach { (input, expected) ->
            val parsed = method.invoke(PmuApi(), input) as QuoteRecord
            assertEquals("Import fingerprint must preserve missing, null and valid values", expected, parsed.importKey)
        }
    }

    @Test fun quoteWorkflowCapabilityIsReadableForPersonalAccount() {
        val preferences = MobilePreferences(rule.activity)
        val session = preferences.loadVault().session
        assumeTrue("Requires existing authorized login", session != null)
        val api = PmuApi()
        val method = PmuApi::class.java.getDeclaredMethod("requireQuoteWorkflow", MobileConfig::class.java, MobileSession::class.java)
        method.isAccessible = true
        try {
            method.invoke(api, preferences.config(), session)
        } catch (failure: java.lang.reflect.InvocationTargetException) {
            val cause = failure.targetException
            val code = (cause as? ApiFailure)?.code
            val status = (cause as? ApiFailure)?.status
            throw AssertionError("Personal quote-workflow read failed: status=$status code=$code", cause)
        }
    }

    @Test fun controlledImportIdentityFillAndImageSourceReachDesktop() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Explicit controlled-write acceptance only", args.getString("controlled_writes") == "true")
        val nonce = args.getString("qa_nonce") ?: error("Missing temporary bridge nonce")
        require(nonce.length >= 32)
        val activity = rule.activity
        val preferences = MobilePreferences(activity)
        val vault = preferences.loadVault()
        assumeTrue("Requires authorized session without unresolved writes", vault.session != null && vault.pendingSave == null && vault.pendingBusiness == null)
        val model = ViewModelProvider(activity, MobileViewModel.Factory(activity))[MobileViewModel::class.java]
        rule.waitUntil(40000) { model.state.value.syncStatus == "已同步" }
        val api = PmuApi()
        runBlocking { api.restore(preferences.config(), preferences.loadVault().session!!) }
        fun snapshot(): BackupSnapshot = runBlocking {
            val active = preferences.loadVault().session ?: error("Session lost")
            BackupSnapshot(api.businessRpc(preferences.config(), active, "pmu_export_snapshot", JSONObject()).value as JSONObject)
        }
        if (args.getString("recycle_prior_supplement") == "true") {
            val source = snapshot()
            val leftovers = source.customers.filter {
                it.optString("display_name").startsWith("手机同步验收-补充-") && it.optString("status") == "active"
            }
            leftovers.forEach { customer ->
                val history = source.quotes.filter { it.optString("customer_key") == customer.getString("customer_key") }
                require(history.isNotEmpty() && history.all {
                    it.optString("grade") == "PA66-PARITY-FILL" && it.optString("price") in setOf("21.5", "22.5", "23.5")
                }) { "Refuse to recycle records outside this controlled acceptance" }
                rule.runOnUiThread {
                    model.business.changeCustomer(CustomerRecord(customer.getString("customer_key"), customer.getString("display_name"), customer.getString("revision"), 1, history.size),
                        false, "手机同步验收：回收本轮中断的标记测试客户，保留历史")
                }
                rule.waitUntil(45000) { !model.business.state.value.busy }
                assertNull(model.business.state.value.error, model.business.state.value.error)
                assertNull(model.state.value.pendingBusiness)
            }
            if (leftovers.isNotEmpty()) {
                rule.waitUntil(40000) { !model.state.value.loading && model.state.value.syncStatus == "已同步" }
                assertTrue(snapshot().customers.none { it.optString("display_name").startsWith("手机同步验收-补充-") && it.optString("status") == "active" })
            }
        }
        val before = snapshot()
        val original = before.quotes.associate { it.getString("id") to it.toString() }
        val customer = "手机同步验收-补充-${System.currentTimeMillis()}"
        val date = model.state.value.syncMeta!!.businessDate
        val steps = mutableListOf<String>()
        val account = vault.session!!.userId
        val backups = File(activity.filesDir, "business/$account/backups")
        val initialBackups = backups.listFiles().orEmpty().map { it.name }.toSet()
        val inputFile = File(activity.cacheDir, "exports/phone-parity-supplement.csv")
        fun rows(source: BackupSnapshot) = source.quotes.filter { it.optString("customer") == customer }
        fun businessDone() {
            rule.waitUntil(45000) { !model.business.state.value.busy }
            assertNull(model.business.state.value.error, model.business.state.value.error)
            assertNull(model.state.value.pendingBusiness)
        }
        fun synced(price: String, color: String = "") {
            rule.waitUntil(45000) {
                !model.state.value.saving && !model.state.value.loading &&
                    (model.state.value.errorMessage != null || model.state.value.quotes.any { it.customer == customer && it.price == price && it.color == color })
            }
            assertNull(model.state.value.errorMessage, model.state.value.errorMessage)
            assertNull(model.state.value.pendingSave)
            assertTrue(model.state.value.quotes.any { it.customer == customer && it.price == price && it.color == color })
        }
        fun field(label: String, value: String) = rule.onNodeWithText(label).performScrollTo().performTextReplacement(value)
        ServerSocket(18763, 1, InetAddress.getLoopbackAddress()).use { server ->
            server.soTimeout = 120000
            server.accept().use { socket ->
                socket.soTimeout = 120000
                val input = socket.getInputStream().bufferedReader(Charsets.UTF_8)
                val output = socket.getOutputStream().bufferedWriter(Charsets.UTF_8)
                check(input.readLine() == nonce) { "Unauthorized bridge" }
                val active = preferences.loadVault().session ?: error("Session lost")
                val config = preferences.config()
                output.write(JSONObject().put("config", JSONObject().put("url", config.projectUrl).put("publishable_key", config.publishableKey))
                    .put("user_id", active.userId).put("username", active.username).put("access_token", active.accessToken).toString())
                output.newLine()
                output.flush()
                var completed = false
                var primaryFailure: Throwable? = null
                fun desktop(action: String) {
                    val message = JSONObject().put("action", action).put("customer", customer).put("completed", completed)
                    if (action == "inspect") {
                        val quote = model.state.value.quotes.single { it.customer == customer }
                        message.put("expect", JSONObject().put("id", quote.id).put("price", quote.price).put("grade", quote.grade)
                            .put("material", quote.material).put("color", quote.color).put("tax_type", quote.taxType)
                            .put("source_type", quote.sourceType).put("source_file", quote.sourceFile)
                            .put("source_sheet", quote.sourceSheet).put("source_row", quote.sourceRow))
                        message.put("history", JSONArray(rows(snapshot())))
                    }
                    output.write(message.toString())
                    output.newLine()
                    output.flush()
                    val result = JSONObject(input.readLine() ?: error("Desktop bridge disconnected"))
                    if (action != "finish" || completed) {
                        check(result.optBoolean("ok")) { result.optString("error", "Desktop acceptance failed") }
                    }
                    steps += "desktop:$action"
                }
                try {
                    rule.runOnUiThread { model.startNewQuote() }
                    field("客户", customer)
                    field("牌号", "PA66-PARITY-FILL")
                    field("材料", "PA66")
                    field("价格", "21.5")
                    rule.onNodeWithText("未注明").performScrollTo().performClick()
                    rule.onNodeWithText("保存报价").performScrollTo().performClick()
                    synced("21.5")
                    assertEquals("未注明", model.state.value.quotes.single { it.customer == customer }.taxType)
                    steps += "phone:real-new-quote-with-missing-identity"

                    inputFile.parentFile!!.mkdirs()
                    inputFile.writeText("客户,牌号,材料,颜色,价格,税口径,记录日期,备注\n文件客户应被覆盖,PA66-PARITY-FILL,PA66,,22.5,未注明,$date,\n", Charsets.UTF_8)
                    val uri = FileProvider.getUriForFile(activity, activity.packageName + ".files", inputFile)
                    rule.runOnUiThread { model.openTools(BusinessPage.IMPORT) }
                    rule.onNodeWithText("导入客户：按文件中的客户列").performClick()
                    rule.onNodeWithText(customer).performClick()
                    assertEquals(customer, model.business.state.value.importOptions.customer)
                    steps += "phone:selected-customer-option"
                    rule.runOnUiThread { model.business.previewImport(uri) }
                    businessDone()
                    val preview = model.business.state.value.importPreview!!
                    assertEquals(emptyList<String>(), preview.errors)
                    assertEquals(1, preview.updateCount)
                    assertEquals(customer, preview.fresh.single().customer)
                    rule.onNode(hasScrollToIndexAction()).performScrollToNode(hasText("确认导入 1 条"))
                    rule.onNodeWithText("确认导入 1 条").performClick()
                    rule.onNodeWithText("确认导入", useUnmergedTree = true).performClick()
                    businessDone()
                    synced("22.5")
                    val prior = rows(snapshot())
                    assertEquals(2, prior.size)
                    assertEquals(1, prior.count { !it.isNull("import_key") })
                    assertTrue(snapshot().customers.none { it.optString("display_name") == "文件客户应被覆盖" })
                    steps += "phone:real-selected-customer-import-with-fingerprint"

                    rule.runOnUiThread { model.startEdit(model.state.value.quotes.single { it.customer == customer }) }
                    field("颜色", "黑色")
                    rule.onNodeWithText("含税").performScrollTo().performClick()
                    rule.onNodeWithText("保存调价").performScrollTo().performClick()
                    synced("22.5", "黑色")
                    val filled = rows(snapshot())
                    assertEquals(prior.map { it.getString("id") }.toSet(), filled.map { it.getString("id") }.toSet())
                    val preserved = listOf("price", "effective_date", "material", "note", "reason", "source_type", "source_file", "source_sheet", "source_row", "created_at")
                    prior.forEach { old ->
                        val updated = filled.single { it.getString("id") == old.getString("id") }
                        preserved.forEach { key -> assertEquals("Preserve $key", old.get(key).toString(), updated.get(key).toString()) }
                        assertEquals("黑色", updated.getString("color"))
                        assertEquals("含税", updated.getString("tax_type"))
                        assertEquals(quoteIdentity(customer, "PA66-PARITY-FILL", "黑色", "含税"), updated.getString("identity"))
                        if (!old.isNull("import_key")) {
                            val expected = ImportRow(customer, updated.getString("grade"), updated.getString("material"), "黑色", updated.getString("price"),
                                "含税", updated.getString("effective_date"), updated.getString("note"), updated.getString("reason"),
                                updated.getString("source_file"), updated.getString("source_sheet"), updated.getInt("source_row")).importKey
                            assertNotEquals(old.getString("import_key"), expected)
                            assertEquals(expected, updated.getString("import_key"))
                        } else assertTrue(updated.isNull("import_key"))
                    }
                    val fillBackup = backups.listFiles().orEmpty().single { it.name !in initialBackups && it.name.startsWith("补齐规格前-") && it.extension == "sqlite3" }
                    val backedUpRows = rows(model.business.files.readBackup(fillBackup))
                    assertEquals(prior.map { it.getString("id") }.toSet(), backedUpRows.map { it.getString("id") }.toSet())
                    assertTrue(backedUpRows.all { it.optString("color").isEmpty() && it.optString("tax_type") == "未注明" })
                    steps += "phone:real-identity-fill-preserves-history-and-migrates-fingerprint-with-backup"
                    val filledQuote = model.state.value.quotes.single { it.customer == customer }
                    val checkRequest = PendingQuoteSave(account, newRequestId(), filledQuote.id, filledQuote.customerRevision,
                        QuoteDraft.fromQuote(filledQuote).copy(reason = "補齊缺失字段"),
                        historyKeys = filled.map { QuoteHistoryKey(it.getString("id"), if (it.isNull("import_key")) null else it.getString("import_key")) })
                    val recovered = runBlocking {
                        api.recover(preferences.config(), preferences.loadVault().session!!, checkRequest).value
                    }
                    assertEquals(filledQuote.id, recovered.savedId)
                    steps += "phone:read-only-fill-result-reconciliation-with-null-fingerprint"
                    desktop("inspect")

                    rule.runOnUiThread {
                        model.startNewQuote()
                        model.applyImageQuoteCandidate(QuoteDraft(customer, "PA66-PARITY-FILL", "PA66", "黑色", "23.5", "含税", date),
                            ImageQuoteSource("phone-parity-image.png", row = 2))
                    }
                    assertNotNull(model.state.value.editingQuote)
                    rule.onNodeWithText("保存调价").assertIsNotEnabled()
                    field("调价原因", "手机同步验收：图片来源保存")
                    rule.onNodeWithTag("image-quote-review").performScrollTo().performClick()
                    rule.onNodeWithText("保存调价").performScrollTo().performClick()
                    synced("23.5", "黑色")
                    val image = model.state.value.quotes.single { it.customer == customer }
                    assertEquals("图片导入", image.sourceType)
                    assertEquals("phone-parity-image.png", image.sourceFile)
                    assertEquals("图片识别", image.sourceSheet)
                    assertEquals(2, image.sourceRow)
                    assertEquals(3, rows(snapshot()).size)
                    rule.runOnUiThread { model.openHistory(image) }
                    rule.waitUntil(40000) { !model.state.value.historyLoading }
                    assertNull(model.state.value.errorMessage)
                    assertEquals(setOf("21.5", "22.5", "23.5"), model.state.value.historyItems.map { it.price }.toSet())
                    steps += "phone:real-image-source-save-and-three-history-records"
                    desktop("inspect")
                    completed = true
                } catch (failure: Throwable) {
                    primaryFailure = failure
                    File(activity.filesDir, "cloud-parity-supplement-failure.txt").writeText(
                        "steps=${steps.joinToString()}\n" + failure.stackTraceToString(), Charsets.UTF_8)
                    throw failure
                } finally {
                    try {
                    if (!model.state.value.saving && model.state.value.pendingSave == null && model.state.value.pendingBusiness == null) {
                        val target = snapshot().customers.firstOrNull { it.optString("display_name") == customer && it.optString("status") == "active" }
                        if (target != null) {
                            val historyCount = rows(snapshot()).size
                            rule.runOnUiThread {
                                model.business.changeCustomer(CustomerRecord(target.getString("customer_key"), customer, target.getString("revision"), 1, historyCount),
                                    false, "手机同步验收：补充验收结束，保留历史于回收站")
                            }
                            businessDone()
                        }
                    }
                    val after = snapshot()
                    assertTrue("Existing business quotes changed", original.all { (id, row) -> after.quotes.firstOrNull { it.getString("id") == id }?.toString() == row })
                    assertEquals("deleted", after.customers.firstOrNull { it.optString("display_name") == customer }?.optString("status"))
                    rule.runOnUiThread { model.refresh(force = true) }
                    rule.waitUntil(40000) { !model.state.value.loading && model.state.value.quotes.none { it.customer == customer } }
                    assertNull(model.state.value.errorMessage)
                    inputFile.delete()
                    desktop("absent")
                    File(activity.filesDir, "cloud-parity-supplement-report.json").writeText(JSONObject().put("completed", completed).put("steps", JSONArray(steps))
                        .put("existing_quotes_unchanged", true).put("cleanup", "recycled-history-preserved")
                        .put("image_input", "synthetic-candidate; OCR covered separately by real local-recognition device test").toString(2), Charsets.UTF_8)
                    desktop("finish")
                    } catch (cleanupFailure: Throwable) {
                        val originalFailure = primaryFailure
                        if (originalFailure != null) originalFailure.addSuppressed(cleanupFailure) else throw cleanupFailure
                    }
                }
            }
        }
    }
}
