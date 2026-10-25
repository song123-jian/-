package com.song123jian.pricequery.mobile.data

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Bitmap
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.test.core.app.ApplicationProvider
import com.song123jian.pricequery.mobile.BusinessController
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

private class FakeDocumentSyncRpc {
    enum class Mode { OFFLINE, ONLINE, CONFLICT }

    var mode = Mode.OFFLINE
    var saveCalls = 0
    var deleteCalls = 0
    private var nextId = 1
    private val records = linkedMapOf<String, JSONObject>()

    suspend fun call(name: String, payload: JSONObject): Any = when (name) {
        "pm_business_document_list_v1" -> {
            ensureOnline()
            JSONObject().put("records", JSONArray().apply {
                records.values.filter { it.optJSONObject("document")?.optString("kind") == payload.optString("p_kind") }
                    .forEach { put(JSONObject(it.toString())) }
            })
        }
        "pm_save_business_document_v1" -> save(payload)
        "pm_delete_business_document_v1" -> delete(payload)
        else -> error("Unexpected RPC: $name")
    }

    private fun save(payload: JSONObject): JSONObject {
        saveCalls++
        ensureOnline()
        if (mode == Mode.CONFLICT) throw ApiFailure("云端制作记录已被其他设备修改", 409, "revision_conflict")
        val remoteId = payload.optNullableString("p_document_id") ?: "cloud-${nextId++}"
        val current = records[remoteId]
        val expected = payload.optNullableInt("p_expected_revision")
        if ((current == null && expected != null) || (current != null && expected != current.optInt("revision"))) {
            throw ApiFailure("云端制作记录已被其他设备修改", 409, "revision_conflict")
        }
        val revision = (current?.optInt("revision") ?: 0) + 1
        records[remoteId] = JSONObject()
            .put("document_id", remoteId)
            .put("revision", revision)
            .put("document", JSONObject(payload.getJSONObject("p_document").toString()))
        return JSONObject().put("id", remoteId).put("revision", revision).put("document", JSONObject(payload.getJSONObject("p_document").toString()))
    }

    private fun delete(payload: JSONObject): JSONObject {
        deleteCalls++
        ensureOnline()
        if (mode == Mode.CONFLICT) throw ApiFailure("云端制作记录已被其他设备修改", 409, "revision_conflict")
        val remoteId = payload.getString("p_document_id")
        val current = records[remoteId] ?: throw ApiFailure("制作记录不存在", 409, "revision_conflict")
        if (payload.optNullableInt("p_expected_revision") != current.optInt("revision")) {
            throw ApiFailure("云端制作记录已被其他设备修改", 409, "revision_conflict")
        }
        records.remove(remoteId)
        return JSONObject().put("deleted", true)
    }

    private fun ensureOnline() {
        if (mode == Mode.OFFLINE) throw ApiFailure("network unavailable", code = "network_error")
    }
}

class BusinessFeaturesTest {
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    private val exchange = FileExchange(context)

    private fun documentController(scope: CoroutineScope, account: String, rpc: FakeDocumentSyncRpc) = BusinessController(
        context, scope, rpc = rpc::call, audit = { JSONArray() }, owner = { account }, pending = { null },
        savePending = {}, writeAllowed = { true }, changed = {},
    )

    private suspend fun awaitIdle(controller: BusinessController) = withTimeout(10000) {
        while (controller.state.value.busy) delay(10)
        assertNull(controller.state.value.error)
    }

    @Test fun csvAndXlsxParseDoublePricesAndPreserveSource() {
        val csv = File(context.cacheDir, "parity-input.csv")
        csv.writeText("客户,牌号,材料,颜色,未税价格,含税价格,备注\r\n验收客户,ABC,PA66,黑,10.5,12.5,\"包含,逗号\"\r\n", Charsets.UTF_8)
        val parsed = exchange.parse(csv, csv.name, ImportOptions(date = "2026-10-23"))
        assertEquals(2, parsed.rows.size)
        assertTrue(parsed.errors.isEmpty())
        assertEquals(listOf("未税", "含税"), parsed.rows.map { it.tax })
        assertEquals("包含,逗号", parsed.rows.first().note)
        val xlsx = File(context.cacheDir, "parity-input.xlsx")
        ZipOutputStream(xlsx.outputStream()).use { zip ->
            fun entry(name: String, text: String) { zip.putNextEntry(ZipEntry(name)); zip.write(text.toByteArray(Charsets.UTF_8)); zip.closeEntry() }
            entry("[Content_Types].xml", """<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>""")
            entry("_rels/.rels", """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>""")
            entry("xl/workbook.xml", """<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="价格明细" sheetId="1" r:id="rId1"/></sheets></workbook>""")
            entry("xl/_rels/workbook.xml.rels", """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>""")
            fun row(number: Int, values: List<String>): String = "<row r=\"$number\">" + values.mapIndexed { index, value -> "<c r=\"${('A'.code + index).toChar()}$number\" t=\"inlineStr\"><is><t>$value</t></is></c>" }.joinToString("") + "</row>"
            entry("xl/worksheets/sheet1.xml", """<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>""" + row(1, listOf("客户", "牌号", "价格", "税口径")) + row(2, listOf("验收客户", "XYZ", "15.5", "含税")) + "</sheetData></worksheet>")
        }
        val excel = exchange.parse(xlsx, xlsx.name, ImportOptions(date = "2026-10-23"))
        assertEquals(1, excel.rows.size)
        assertEquals("XYZ", excel.rows.single().grade)
        assertEquals("价格明细", excel.rows.single().sheet)
        assertTrue(excel.errors.isEmpty())
        csv.delete()
        xlsx.delete()
    }

    @Test fun importAliasesPreserveSpecificationAndSplitColorSuffix() {
        val csv = File(context.cacheDir, "parity-spec-input.csv")
        csv.writeText(
            "客户名称,型号,产品名称,材料规格,未税单价,含税单价,价格更新日期\r\n" +
                "验收客户,PA66-GF30,PA66 GF30 黑色,GF30,12,14,2026-10-23\r\n",
            Charsets.UTF_8,
        )
        try {
            val parsed = exchange.parse(csv, csv.name, ImportOptions(date = "2026-10-23"))
            assertTrue(parsed.errors.toString(), parsed.errors.isEmpty())
            assertEquals(2, parsed.rows.size)
            assertTrue(parsed.rows.all { it.material == "PA66 GF30" && it.color == "黑色" })
            assertTrue(parsed.rows.all { it.grade == "PA66-GF30" && it.note == "材料规格：GF30" })
            assertEquals(listOf("未税", "含税"), parsed.rows.map { it.tax })
        } finally { csv.delete() }
    }

    @Test fun selectedImportCustomerOverridesFileCustomerAndKeepsMaterialSpec() {
        val csv = File(context.cacheDir, "parity-selected-customer.csv")
        csv.writeText("客户名称,型号,产品名称,材料规格,含税单价\r\n文件抬头客户,PA66-GF30,PA66 GF30 黑色,GF30,12.5\r\n", Charsets.UTF_8)
        try {
            val parsed = exchange.parse(csv, csv.name, ImportOptions(customer = "指定客户", date = "2026-10-23"))
            assertTrue(parsed.errors.toString(), parsed.errors.isEmpty())
            assertEquals("指定客户", parsed.rows.single().customer)
            assertEquals("PA66 GF30", parsed.rows.single().material)
            assertEquals("黑色", parsed.rows.single().color)
            assertEquals("GF30", parsed.rows.single().materialSpec)
            assertEquals("材料规格：GF30", parsed.rows.single().note)
        } finally { csv.delete() }
    }

    @Test fun imageCandidateParserPreservesCustomerMaterialSpecificationAndSource() {
        fun token(text: String, column: Int, row: Int) = ImageOcrToken(text, column * 100f, row * 40f, column * 100f + 85f, row * 40f + 24f)
        val tokens = listOf(
            token("客户", 0, 0), token("型号", 1, 0), token("产品名称", 2, 0), token("材料规格", 3, 0), token("未税单价", 4, 0),
            token("文件客户", 0, 1), token("PA66-GF30", 1, 1), token("PA66 GF30 黑色", 2, 1), token("GF30", 3, 1), token("12.50", 4, 1),
        )
        val candidate = extractImageQuoteCandidates(tokens, "报价原图.png", selectedCustomer = "指定客户", defaultDate = "2026-10-23").single()
        assertEquals("指定客户", candidate.draft.customer)
        assertEquals("PA66-GF30", candidate.draft.grade)
        assertEquals("PA66 GF30", candidate.draft.material)
        assertEquals("黑色", candidate.draft.color)
        assertEquals("12.5", candidate.draft.price)
        assertEquals("未税", candidate.draft.taxType)
        assertEquals("材料规格：GF30", candidate.draft.note)
        assertEquals("报价原图.png", candidate.sourceFile)
        assertTrue(candidate.warnings.any { it.contains("对照原图") })
    }

    @Test fun chineseOcrRunsLocallyAndReturnsAnEditableCandidate() {
        val bitmap = Bitmap.createBitmap(1200, 900, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap).apply { drawColor(android.graphics.Color.WHITE) }
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.BLACK; textSize = 54f }
        listOf("客户：验收客户", "牌号：PA66-QA", "材料：PA66 GF30", "颜色：黑色", "含税单价：12.50", "日期：2026-10-23")
            .forEachIndexed { index, text -> canvas.drawText(text, 60f, 100f + index * 110f, paint) }
        val file = File(context.cacheDir, "local-ocr-quote.png")
        try {
            file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            val recognizer = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
            val recognized = try {
                Tasks.await(recognizer.process(InputImage.fromFilePath(context, android.net.Uri.fromFile(file))))
            } finally {
                recognizer.close()
            }
            val diagnostic = recognized.textBlocks.joinToString(" | ") { block ->
                block.lines.joinToString(" / ") { line ->
                    val elements = line.elements.joinToString(" ") { element ->
                        val box = element.boundingBox
                        "${element.text}@${box?.left},${box?.top},${box?.right},${box?.bottom}"
                    }
                    elements.ifBlank { "${line.text}@${line.boundingBox}" }
                }
            }
            val result = try {
                ImageQuoteRecognizer(context).recognize(android.net.Uri.fromFile(file), defaultDate = "2026-10-23")
            } catch (failure: Exception) {
                Log.i("ImageQuoteOcrQA", diagnostic.take(3000))
                throw AssertionError("本地OCR实际文本/边界框：$diagnostic", failure)
            }
            assertTrue(result.preview.width <= 1200)
            assertTrue(result.candidates.isNotEmpty())
            assertTrue(result.candidates.any { it.draft.grade.contains("PA66") && it.draft.price == "12.5" })
        } finally {
            bitmap.recycle()
            file.delete()
        }
    }

    @Test fun supplierProfileIsSavedPerAccountAndPrefillsNewDocuments() = runBlocking {
        val firstAccount = UUID.randomUUID().toString()
        val secondAccount = UUID.randomUUID().toString()
        val firstScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val secondScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        fun controller(scope: CoroutineScope, account: String) = BusinessController(
            context, scope, rpc = { _, _ -> error("Unexpected network request") }, audit = { JSONArray() },
            owner = { account }, pending = { null }, savePending = {}, writeAllowed = { true }, changed = {},
        )
        val first = controller(firstScope, firstAccount)
        val second = controller(secondScope, secondAccount)
        suspend fun awaitIdle(target: BusinessController) = withTimeout(5000) {
            while (target.state.value.busy) delay(10)
            assertNull(target.state.value.error)
        }
        try {
            first.newDocument("quotation")
            awaitIdle(first)
            first.updateDocument { it.copy(fields = it.fields + mapOf("seller_agent" to "验收供方联系人", "seller_phone" to "13800000000", "email" to "qa@example.test")) }
            first.saveSupplierProfile()
            awaitIdle(first)
            first.newDocument("contract")
            awaitIdle(first)
            assertEquals("验收供方联系人", first.state.value.document?.fields?.get("seller_agent"))
            assertEquals("qa@example.test", first.state.value.document?.fields?.get("email"))
            second.newDocument("contract")
            awaitIdle(second)
            assertEquals("", second.state.value.document?.fields?.get("seller_agent"))
        } finally {
            firstScope.cancel()
            secondScope.cancel()
            File(context.filesDir, "business/$firstAccount").deleteRecursively()
            File(context.filesDir, "business/$secondAccount").deleteRecursively()
        }
    }

    @Test fun offlineDocumentSaveReconcilesRemoteIdRevisionAndStatus() = runBlocking {
        val account = UUID.randomUUID().toString()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val rpc = FakeDocumentSyncRpc()
        val controller = documentController(scope, account, rpc)
        try {
            controller.newDocument("quotation")
            awaitIdle(controller)
            controller.updateDocument { it.copy(fields = it.fields + ("buyer_name" to "离线验收客户")) }
            controller.saveDocument()
            awaitIdle(controller)
            val localId = controller.state.value.documentId ?: error("Local document ID missing")
            assertEquals("pending", controller.state.value.documentSyncStatus)
            assertEquals(1, JSONObject(File(context.filesDir, "business/$account/document-sync-pending.json").readText())
                .getJSONArray("operations").length())

            rpc.mode = FakeDocumentSyncRpc.Mode.ONLINE
            controller.loadDocuments()
            awaitIdle(controller)

            val documents = controller.state.value.documents
            assertEquals("离线草稿同步后应与云端副本合并", 1, documents.size)
            val entry = documents.first()
            assertEquals("synced", entry.syncStatus)
            assertEquals("cloud-1", entry.remoteId)
            assertEquals(1, entry.revision)
            val local = JSONObject(File(context.filesDir, "business/$account/documents/$localId.json").readText())
            assertEquals("cloud-1", local.optNullableString("_remote_id"))
            assertEquals(1, local.optNullableInt("_revision"))
            assertEquals("synced", local.optString("_sync_status"))
            assertEquals(0, JSONObject(File(context.filesDir, "business/$account/document-sync-pending.json").readText())
                .getJSONArray("operations").length())
        } finally {
            scope.cancel()
            File(context.filesDir, "business/$account").deleteRecursively()
        }
    }

    @Test fun recoveredDocumentConflictIsMarkedAndNotRetriedAutomatically() = runBlocking {
        val account = UUID.randomUUID().toString()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val rpc = FakeDocumentSyncRpc().apply { mode = FakeDocumentSyncRpc.Mode.ONLINE }
        val controller = documentController(scope, account, rpc)
        try {
            controller.newDocument("quotation")
            awaitIdle(controller)
            controller.updateDocument { it.copy(fields = it.fields + ("buyer_name" to "冲突验收客户")) }
            controller.saveDocument()
            awaitIdle(controller)
            val localId = controller.state.value.documentId ?: error("Local document ID missing")
            controller.openDocument(localId)
            awaitIdle(controller)
            controller.updateDocument { it.copy(fields = it.fields + ("buyer_name" to "本机未同步修改")) }
            rpc.mode = FakeDocumentSyncRpc.Mode.OFFLINE
            controller.saveDocument()
            awaitIdle(controller)

            rpc.mode = FakeDocumentSyncRpc.Mode.CONFLICT
            controller.loadDocuments()
            awaitIdle(controller)

            assertEquals("conflict", controller.state.value.documents.single().syncStatus)
            val local = JSONObject(File(context.filesDir, "business/$account/documents/$localId.json").readText())
            assertEquals("conflict", local.optString("_sync_status"))
            assertEquals("本机未同步修改", local.getJSONObject("fields").getString("buyer_name"))
            val operation = JSONObject(File(context.filesDir, "business/$account/document-sync-pending.json").readText())
                .getJSONArray("operations").getJSONObject(0)
            assertEquals("conflict", operation.optString("status"))
            assertEquals("cloud-1", operation.optString("remote_id"))
            val callsAtConflict = rpc.saveCalls
            controller.loadDocuments()
            awaitIdle(controller)
            assertEquals(callsAtConflict, rpc.saveCalls)
        } finally {
            scope.cancel()
            File(context.filesDir, "business/$account").deleteRecursively()
        }
    }

    @Test fun offlineDeleteConflictRestoresLocalCopyAndStopsRetrying() = runBlocking {
        val account = UUID.randomUUID().toString()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val rpc = FakeDocumentSyncRpc().apply { mode = FakeDocumentSyncRpc.Mode.ONLINE }
        val controller = documentController(scope, account, rpc)
        try {
            controller.newDocument("contract")
            awaitIdle(controller)
            controller.updateDocument { it.copy(fields = it.fields + ("buyer_name" to "删除冲突验收客户")) }
            controller.saveDocument()
            awaitIdle(controller)
            val entry = controller.state.value.documents.single()
            val localFile = File(context.filesDir, "business/$account/documents/${entry.id}.json")

            rpc.mode = FakeDocumentSyncRpc.Mode.OFFLINE
            controller.deleteDocument(entry)
            awaitIdle(controller)
            assertFalse(localFile.exists())

            rpc.mode = FakeDocumentSyncRpc.Mode.CONFLICT
            controller.loadDocuments()
            awaitIdle(controller)

            assertEquals("conflict", controller.state.value.documents.single().syncStatus)
            assertTrue(localFile.exists())
            assertEquals("删除冲突验收客户", JSONObject(localFile.readText()).getJSONObject("fields").getString("buyer_name"))
            val operation = JSONObject(File(context.filesDir, "business/$account/document-sync-pending.json").readText())
                .getJSONArray("operations").getJSONObject(0)
            assertEquals("conflict", operation.optString("status"))
            val callsAtConflict = rpc.deleteCalls
            controller.loadDocuments()
            awaitIdle(controller)
            assertEquals(callsAtConflict, rpc.deleteCalls)
        } finally {
            scope.cancel()
            File(context.filesDir, "business/$account").deleteRecursively()
        }
    }

    @Test fun sqliteBackupRoundTripsAllTablesAndIsDesktopReadable() {
        val row = ImportRow("备份验收", "ABC", "PA66", "黑", "12.5", "含税", "2026-10-23", "原备注", "验收", "test.csv", "CSV", 2)
        val customer = JSONObject().put("customer_key", row.customerKey).put("display_name", row.customer).put("status", "deleted").put("revision", 2).put("deleted_at", "2026-10-23T00:00:00+08:00").put("deleted_reason", "验收")
        val quote = row.json().put("id", 1).put("created_at", "2026-10-23T00:00:00+08:00").put("source_type", "文件导入")
        val audit = JSONObject().put("request_id", "parity-test-request-001").put("customer_key", row.customerKey).put("action", "delete").put("expected_revision", 1).put("revision", 2).put("reason", "验收").put("created_at", "2026-10-23T00:00:00+08:00")
        val snapshot = BackupSnapshot(JSONObject().put("schema_version", 2).put("customers", JSONArray().put(customer)).put("quotes", JSONArray().put(quote)).put("audit", JSONArray().put(audit)))
        val backup = exchange.backup(snapshot, "合成备份验收")
        val reread = exchange.readBackup(backup.file)
        assertEquals("deleted", reread.customers.single().getString("status"))
        assertEquals("12.5", reread.quotes.single().getString("price"))
        assertEquals("原备注", reread.quotes.single().getString("note"))
        assertEquals("delete", reread.audit.single().getString("action"))
        assertEquals(row.importKey, reread.quotes.single().getString("import_key"))
        backup.file.copyTo(File(context.filesDir, "parity-test-backup.sqlite3"), overwrite = true)
    }

    @Test fun actualPdfRendererCreatesMultipageDocumentsWithSameSeal() {
        val document = BusinessDocument.create("quotation", customer = "单据验收")
        val item = BusinessDocument.blankItem() + mapOf("name" to "工程塑料", "model" to "PA66-A", "price" to "12.5", "quantity" to "100")
        val quotation = document.copy(items = List(4) { item })
        val quotePdf = DocumentRenderer(context, exchange).render(quotation)
        val contract = BusinessDocument.create("contract", customer = "单据验收").copy(items = List(2) { item })
        val contractPdf = DocumentRenderer(context, exchange).render(contract)
        listOf(quotePdf, contractPdf).forEach { artifact ->
            assertTrue(artifact.file.length() > 5000)
            ParcelFileDescriptor.open(artifact.file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd -> PdfRenderer(fd).use { assertEquals(2, it.pageCount) } }
        }
        quotePdf.file.copyTo(File(context.filesDir, "parity-test-quotation.pdf"), overwrite = true)
        contractPdf.file.copyTo(File(context.filesDir, "parity-test-contract.pdf"), overwrite = true)
        val draft = BusinessDocument.fromJson(quotation.json())
        assertEquals(quotation, draft)
    }

    @Test fun encryptedBusinessRequestSurvivesReloadWithoutChangingId() {
        val isolated = context.createDeviceProtectedStorageContext()
        val store = MobilePreferences(isolated)
        val original = store.loadVault()
        try {
            val request = JSONObject().put("owner_id", "synthetic-owner").put("kind", "customer").put("request_id", "synthetic-request-001")
                .put("payload", JSONObject().put("p_action", "delete"))
            store.saveVault(original.copy(pendingBusiness = request))
            assertEquals("synthetic-request-001", store.loadVault().pendingBusiness?.getString("request_id"))
            assertEquals("delete", store.loadVault().pendingBusiness?.getJSONObject("payload")?.getString("p_action"))
        } finally { store.saveVault(original) }
    }

    @Test fun textPdfUsesRealExtractorAndRejectsImageOnlyDocuments() {
        val file = File(context.cacheDir, "parity-text.pdf")
        val pdf = PdfDocument()
        try {
            val page = pdf.startPage(PdfDocument.PageInfo.Builder(595, 842, 1).create())
            val paint = Paint().apply { textSize = 12f }
            val headers = listOf("客户", "牌号", "价格", "税口径")
            val values = listOf("验收客户", "ABC", "12.5", "含税")
            headers.forEachIndexed { index, value -> page.canvas.drawText(value, 35f + index * 130, 40f, paint) }
            values.forEachIndexed { index, value -> page.canvas.drawText(value, 35f + index * 130, 65f, paint) }
            pdf.finishPage(page)
            file.outputStream().use { pdf.writeTo(it) }
        } finally { pdf.close() }
        val parsed = exchange.parse(file, file.name, ImportOptions(date = "2026-10-23"))
        assertTrue(parsed.errors.toString(), parsed.errors.isEmpty())
        assertEquals("12.5", parsed.rows.single().price)
        file.delete()
        val imageOnly = File(context.cacheDir, "parity-image-only.pdf")
        val imagePdf = PdfDocument()
        try {
            val page = imagePdf.startPage(PdfDocument.PageInfo.Builder(595, 842, 1).create())
            page.canvas.drawRect(20f, 20f, 300f, 200f, Paint())
            imagePdf.finishPage(page)
            imageOnly.outputStream().use { imagePdf.writeTo(it) }
        } finally { imagePdf.close() }
        try {
            val failure = runCatching { exchange.parse(imageOnly, imageOnly.name, ImportOptions(date = "2026-10-23")) }.exceptionOrNull()
            assertNotNull("A PDF without a text layer must not be imported", failure)
            assertTrue(failure!!.message.orEmpty().contains("没有可提取的文字"))
        } finally { imageOnly.delete() }
    }
}
