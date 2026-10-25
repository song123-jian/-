package com.song123jian.pricequery.mobile.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.test.core.app.ApplicationProvider
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.zip.ZipInputStream

internal fun sourceReference(context: Context, kind: String): BusinessDocument {
    val manifest = context.assets.open("business_templates/source-layout.json").bufferedReader().use { JSONObject(it.readText()) }
    val layout = manifest.getJSONObject("kinds").getJSONObject(kind)
    var doc = BusinessDocument.create(kind)
    val fields = doc.fields.toMutableMap()
    val terms = doc.terms.toMutableMap()
    val items = MutableList(layout.getInt("per_page")) { BusinessDocument.blankItem().toMutableMap() }
    layout.getJSONArray("slots").objects().forEach { slot ->
        slot.getJSONArray("edits").objects().forEach { edit ->
            val key = edit.getString("key")
            val text = slot.getString("source").substring(edit.getInt("start"), edit.getInt("end"))
            when {
                key in fields -> fields[key] = text
                key.startsWith("term_") -> terms[key.removePrefix("term_")] = text
                key.startsWith("item") -> {
                    val parts = key.removePrefix("item").split('_', limit = 2)
                    if (parts[1] != "amount") items[parts[0].toInt()][parts[1]] = text
                }
                key == "date_slash" -> fields["date"] = text.split('/').joinToString("-") { it.padStart(2, '0') }
                key == "delivery" -> items.forEach { it["delivery"] = text }
            }
        }
    }
    fields["valid_from"] = "2026-10-23"
    fields["valid_to"] = "2026-11-22"
    return doc.copy(fields = fields, terms = terms, items = items)
}

class SourceDocumentFidelityTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val renderer = DocumentRenderer(context, FileExchange(context))
    private val evidence = File(context.filesDir, "source-document-qa").apply { mkdirs() }

    private fun parts(data: ByteArray): Map<String, ByteArray> = buildMap {
        ZipInputStream(data.inputStream()).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                put(entry.name, zip.readBytes())
                entry = zip.nextEntry
            }
        }
    }

    @Test fun originalInputsReturnOriginalBytesAndEditedExportsRemainReadable() {
        PDFBoxResourceLoader.init(context)
        for (kind in listOf("quotation", "contract")) {
            var document = sourceReference(context, kind)
            val shortDates = mapOf("date-1-1" to "2026-09-01", "date-1-2" to "2026-09-23", "date-2-1" to "2026-10-01")
            for (scenario in listOf("source", "edited", "multiple") + if (kind == "quotation") shortDates.keys else emptySet()) {
                if (scenario == "edited") {
                    document = document.copy(fields = document.fields + mapOf("buyer_name" to "验收客户有限公司", "date" to "2026-10-24", "seller_agent" to "测试", "seller_phone" to "13800000000"),
                        items = document.items.mapIndexed { i, item -> if (i == 0) item + ("price" to "13.95") else item })
                } else if (scenario == "multiple") {
                    val count = if (kind == "quotation") 2 else 3
                    document = document.copy(items = List(count) { document.items[0] + ("model" to "QA-$it") })
                } else if (scenario in shortDates) {
                    document = sourceReference(context, kind).let { it.copy(fields = it.fields + ("date" to shortDates.getValue(scenario))) }
                }
                val pdf = renderer.render(document)
                val word = renderer.renderWord(document)
                pdf.file.copyTo(File(evidence, "$kind-$scenario.pdf"), overwrite = true)
                word.file.copyTo(File(evidence, "$kind-$scenario.docx"), overwrite = true)
                if (scenario == "source") {
                    assertArrayEquals(context.assets.open("business_templates/source-$kind.pdf").use { it.readBytes() }, pdf.file.readBytes())
                    assertArrayEquals(context.assets.open("business_templates/source-$kind.docx").use { it.readBytes() }, word.file.readBytes())
                } else if (scenario == "edited") {
                    val original = parts(context.assets.open("business_templates/source-$kind.docx").use { it.readBytes() })
                    val changed = parts(word.file.readBytes())
                    assertEquals(original.keys, changed.keys)
                    val editedParts = setOf("word/document.xml", "word/footer3.xml")
                    original.filterKeys { it !in editedParts }.forEach { (name, bytes) -> assertArrayEquals(name, bytes, changed[name]) }
                    val textNodes = Regex("<w:t(?:\\s[^>]*)?>[\\s\\S]*?</w:t>")
                    editedParts.filter { it in original }.forEach { name ->
                        assertEquals("Only text-node edits are allowed in $name", String(original.getValue(name), Charsets.UTF_8).replace(textNodes, "<w:t/>"), String(changed.getValue(name), Charsets.UTF_8).replace(textNodes, "<w:t/>"))
                    }
                    assertTrue(String(changed.getValue("word/document.xml"), Charsets.UTF_8).contains("验收客户有限公司"))
                }
                ParcelFileDescriptor.open(pdf.file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                    PdfRenderer(fd).use { preview ->
                        assertEquals(if (scenario == "multiple") 2 else 1, preview.pageCount)
                        preview.openPage(preview.pageCount - 1).use { page ->
                            val bitmap = Bitmap.createBitmap(595, 842, Bitmap.Config.ARGB_8888)
                            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                            assertTrue((0 until 842 step 5).sumOf { y -> (0 until 595 step 5).count { x -> bitmap.getPixel(x, y) and 0x00ffffff != 0x00ffffff } } > 200)
                            bitmap.recycle()
                        }
                    }
                }
                PDDocument.load(pdf.file).use { generated ->
                    val text = PDFTextStripper().getText(generated)
                    assertFalse(text.contains("请核对单据信息后使用"))
                    if (scenario in listOf("edited", "multiple")) assertTrue(text.contains("验收客户有限公司"))
                    if (scenario == "multiple") assertTrue(text.contains("QA-0") && text.contains("QA-1"))
                }
            }
        }
        File(evidence, "device-result.json").writeText(JSONObject().put("version", "1.2/code3").put("original_bytes_equal", true).put("edited_and_multiple_pdf_rendered", true).put("short_date_shapes_rendered", 3).put("word_parts_preserved", true).toString(2))
    }

    @Test fun oversizedFieldFailsBeforeReplacingArtifact() {
        val valid = sourceReference(context, "quotation")
        val artifact = renderer.render(valid)
        val before = artifact.file.readBytes()
        val oversized = valid.copy(items = listOf(valid.items[0] + ("model" to "超长规格".repeat(100))))
        for (word in listOf(false, true)) {
            val failure = runCatching { if (word) renderer.renderWord(oversized) else renderer.render(oversized) }.exceptionOrNull()
            assertNotNull(failure)
            assertTrue(failure!!.message.orEmpty().contains("内容过长"))
        }
        assertArrayEquals(before, artifact.file.readBytes())
        assertTrue(runCatching { renderer.render(valid.copy(fields = valid.fields + ("tax_type" to "未注明"))) }.isFailure)
        val contract = sourceReference(context, "contract")
        assertTrue(runCatching { renderer.render(contract.copy(fields = contract.fields + ("contract_no" to ""))) }.isFailure)
    }

    @Test fun emptyProductRowsAreRemovedWithoutLosingDeliveryOrSeal() {
        PDFBoxResourceLoader.init(context)
        val namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        for (kind in listOf("contract", "quotation")) for (count in if (kind == "contract") listOf(1, 3) else listOf(1, 2)) {
            val reference = sourceReference(context, kind)
            val document = reference.copy(items = List(count) { reference.items[0] + ("model" to "QA-$it") })
            val pdf = renderer.render(document)
            val word = renderer.renderWord(document)
            pdf.file.copyTo(File(evidence, "$kind-rows$count.pdf"), overwrite = true)
            word.file.copyTo(File(evidence, "$kind-rows$count.docx"), overwrite = true)
            val generated = parts(word.file.readBytes())
            val original = parts(context.assets.open("business_templates/source-$kind.docx").use { it.readBytes() })
            original.filterKeys { it != "word/document.xml" }.forEach { (name, bytes) -> assertArrayEquals(name, bytes, generated[name]) }
            val factory = javax.xml.parsers.DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }
            val root = factory.newDocumentBuilder().parse(generated.getValue("word/document.xml").inputStream())
            val tables = root.getElementsByTagNameNS(namespace, "tbl")
            if (kind == "contract") {
                val expected = if (count == 3) listOf(6, 5) else listOf(5)
                assertEquals(expected, (0 until tables.length step 2).map { (tables.item(it) as org.w3c.dom.Element).getElementsByTagNameNS(namespace, "tr").length })
                assertTrue(root.documentElement.textContent.contains("具体交期双方协商"))
            }
            PDDocument.load(pdf.file).use { output ->
                val text = PDFTextStripper().getText(output).replace("\n", "").replace("\r", "")
                repeat(count) { assertTrue(text.contains("QA-$it")) }
                if (kind == "contract") assertTrue(text.contains("具体交期双方协商"))
            }
            ParcelFileDescriptor.open(pdf.file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                PdfRenderer(fd).use { preview ->
                    assertEquals(if (count > 1) 2 else 1, preview.pageCount)
                    preview.openPage(preview.pageCount - 1).use { page ->
                        val bitmap = Bitmap.createBitmap(595, 842, Bitmap.Config.ARGB_8888)
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        if (kind == "contract") {
                            fun visibleDark(x: Int, y: Int): Boolean {
                                val pixel = bitmap.getPixel(x, y)
                                return pixel ushr 24 > 127 && pixel and 0x00ffffff < 0x808080
                            }
                            val rawDark = (55..480).count { x -> (242..244).any { y -> bitmap.getPixel(x, y) and 0x00ffffff < 0x808080 } }
                            val visibleDivider = (55..480).count { x -> (242..244).any { y -> visibleDark(x, y) } }
                            val bottomBorder = (55..480).count { x -> (250..252).any { y -> visibleDark(x, y) } }
                            File(evidence, "contract-rows$count-raster.json").writeText(JSONObject()
                                .put("raw_dark_columns", rawDark).put("visible_divider_columns", visibleDivider)
                                .put("visible_bottom_border_columns", bottomBorder).toString(2))
                            assertTrue("Unused row divider must be absent: $visibleDivider", visibleDivider < 20)
                            assertTrue("Retained product bottom border must remain visible: $bottomBorder", bottomBorder > 350)
                        }
                        bitmap.recycle()
                    }
                }
            }
        }
        File(evidence, "empty-rows-result.json").writeText(JSONObject().put("cases", 4).put("status", "passed").toString(2))
    }
}
