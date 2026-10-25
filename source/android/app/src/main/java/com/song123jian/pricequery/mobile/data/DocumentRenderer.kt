package com.song123jian.pricequery.mobile.data

import android.content.Context
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.contentstream.operator.Operator
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.cos.COSFloat
import com.tom_roush.pdfbox.cos.COSNumber
import com.tom_roush.pdfbox.cos.COSString
import com.tom_roush.pdfbox.multipdf.PDFMergerUtility
import com.tom_roush.pdfbox.pdfparser.PDFStreamParser
import com.tom_roush.pdfbox.pdfwriter.ContentStreamWriter
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDStream
import com.tom_roush.pdfbox.pdmodel.font.PDType0Font
import com.tom_roush.pdfbox.pdmodel.graphics.state.RenderingMode
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.math.BigDecimal
import java.security.MessageDigest
import java.time.LocalDate
import java.util.Locale

class DocumentRenderer(private val context: Context, private val exchange: FileExchange) {
    private data class Template(val layout: JSONObject, val pdf: ByteArray, val word: ByteArray)
    private data class Glyph(val text: String, val font: PDType0Font, val advance: Double)
    private data class Line(val glyphs: List<Glyph>, val width: Double)
    private data class Change(val edit: JSONObject, val lines: List<Line>)

    private fun asset(name: String): ByteArray = context.assets.open("business_templates/$name").use { it.readBytes() }
    private fun template(kind: String): Template {
        val manifest = JSONObject(String(asset("source-layout.json"), Charsets.UTF_8))
        require(manifest.getInt("schema") == 1) { "原件单据模板版本不兼容" }
        val layout = manifest.getJSONObject("kinds").getJSONObject(kind)
        val pdf = asset("source-$kind.pdf")
        val word = asset("source-$kind.docx")
        fun hash(data: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(data).joinToString("") { "%02x".format(it) }
        require(hash(pdf) == layout.getString("pdf_sha256") && hash(word) == layout.getString("docx_sha256")) { "原件单据模板已损坏，请恢复本版模板文件" }
        return Template(layout, pdf, word)
    }

    private fun pages(document: BusinessDocument, layout: JSONObject): List<Map<String, String>> {
        val perPage = layout.getInt("per_page")
        val groups = document.items.chunked(perPage)
        return groups.mapIndexed { page, items ->
            buildMap {
                putAll(document.fields)
                document.terms.forEach { (key, value) -> put("term_$key", value) }
                val date = LocalDate.parse(document.fields.getValue("date"))
                put("date_cn", "${date.year}年${date.monthValue}月${date.dayOfMonth}日")
                put("date_year", date.year.toString())
                put("date_month", date.monthValue.toString())
                put("date_day", date.dayOfMonth.toString())
                put("date_slash", "${date.year}/${date.monthValue}/${date.dayOfMonth}")
                put("page", (page + 1).toString())
                put("pages", groups.size.toString())
                put("page_label", groups.size.toString())
                DOCUMENT_PAYMENTS.forEachIndexed { index, label -> put("payment$index", (if (document.payment == label) "■" else "□") + label) }
                repeat(perPage) { index ->
                    val item = items.getOrNull(index).orEmpty()
                    DOCUMENT_ITEM_FIELDS.forEach { key -> put("item${index}_$key", item[key].orEmpty()) }
                    put("item${index}_amount", if (item.isNotEmpty() && document.kind == "contract") itemAmount(item).toPlainString() else "")
                }
                put("delivery", items.map { it["delivery"].orEmpty().replace("\n", "") }.filter(String::isNotBlank).distinct().joinToString("\n"))
                val total = if (document.kind == "contract") items.fold(BigDecimal.ZERO) { sum, item -> sum + itemAmount(item) } else BigDecimal.ZERO
                put("total", total.stripTrailingZeros().toPlainString())
                put("total_upper", rmbUpper(total))
            }
        }
    }

    private fun value(slot: JSONObject, edit: JSONObject, values: Map<String, String>): String {
        val original = slot.getString("source").substring(edit.getInt("start"), edit.getInt("end"))
        val replacement = values[edit.getString("key")].orEmpty()
        if (edit.optBoolean("numeric") && original.isNotEmpty() && replacement.isNotEmpty()) {
            if (runCatching { BigDecimal(original).compareTo(BigDecimal(replacement)) == 0 }.getOrDefault(false)) return original
        }
        return replacement
    }

    private fun font(document: PDDocument, cache: MutableMap<String, PDType0Font>, key: String): PDType0Font = cache.getOrPut(key) {
        context.assets.open("business_templates/source-font-$key.ttf").use { PDType0Font.load(document, it) }
    }

    private fun lines(value: String, edit: JSONObject, document: PDDocument, fonts: MutableMap<String, PDType0Font>): List<Line> {
        val style = edit.getJSONObject("pdf")
        val size = style.getDouble("size")
        val spacing = style.getDouble("spacing")
        val rows = mutableListOf<Line>()
        var row = mutableListOf<Glyph>()
        var width = 0.0
        value.replace("\r\n", "\n").replace('\r', '\n').replace('\t', ' ').forEach { character ->
            if (character == '\n') {
                rows += Line(row.toList(), width)
                row = mutableListOf()
                width = 0.0
            } else {
                val text = character.toString()
                var face = font(document, fonts, style.getString("font"))
                if (runCatching { face.encode(text) }.isFailure) face = font(document, fonts, "song")
                require(runCatching { face.encode(text) }.isSuccess) { "单据包含原件字体无法显示的字符，请修改后导出" }
                val advance = face.getStringWidth(text).toDouble() * size / 1000.0
                val limit = style.getDouble(if (rows.isEmpty()) "width" else "next_width")
                if (row.isNotEmpty() && width + spacing + advance > limit + 0.01f) {
                    rows += Line(row.toList(), width)
                    row = mutableListOf()
                    width = 0.0
                }
                width += advance + if (row.isEmpty()) 0.0 else spacing
                row += Glyph(text, face, advance)
            }
        }
        rows += Line(row.toList(), width)
        require(rows.size <= edit.getInt("lines") && rows.withIndex().all { (i, row) -> row.width <= style.getDouble(if (i == 0) "width" else "next_width") + 0.01 }) { "单据字段内容过长，原件字号及位置放不下，请缩短或拆分单据" }
        return rows
    }

    private fun changes(slots: JSONArray, values: Map<String, String>, document: PDDocument, fonts: MutableMap<String, PDType0Font>): List<Change> = buildList {
        slots.objects().forEach { slot ->
            slot.getJSONArray("edits").objects().forEach edits@ { edit ->
                val replacement = value(slot, edit, values)
                val original = slot.getString("source").substring(edit.getInt("start"), edit.getInt("end"))
                if (replacement != original) {
                    if (edit.getString("key") == "date_cn" && replacement.length != original.length) {
                        val shape = "${values.getValue("date_month").length}-${values.getValue("date_day").length}"
                        val calibrated = edit.getJSONObject("pdf").optJSONObject("date_layouts")?.optJSONArray(shape)?.objects().orEmpty()
                        require(calibrated.size == replacement.length) { "原件日期排版资源缺失或日期超出模板范围，请核对日期与模板" }
                        calibrated.zip(replacement.toList()).forEachIndexed { index, (glyph, character) ->
                            val small = JSONObject(edit.toString()).put("align", "left").put("lines", 1)
                            val style = small.getJSONObject("pdf")
                            glyph.keys().forEach { key -> style.put(key, glyph.get(key)) }
                            style.put("ops", if (index == 0) edit.getJSONObject("pdf").getJSONArray("ops") else JSONArray()).put("spacing", 0)
                            add(Change(small, lines(character.toString(), small, document, fonts)))
                        }
                        return@edits
                    }
                    val glyphs = edit.getJSONObject("pdf").getJSONArray("glyphs").objects()
                    var fine = replacement.length == original.length && original.length == glyphs.size &&
                        glyphs.map { it.getInt("op") }.distinct().size == glyphs.size &&
                        glyphs.withIndex().all { (index, glyph) -> glyph.getInt("offset") == index }
                    if (fine) {
                        fine = glyphs.zip(replacement.toList()).all { (glyph, character) ->
                            val face = font(document, fonts, glyph.getString("font"))
                            runCatching {
                                kotlin.math.abs(face.getStringWidth(glyph.getString("text")) - face.getStringWidth(character.toString())) < 0.01f
                            }.getOrDefault(false)
                        }
                    }
                    if (fine) {
                        glyphs.zip(replacement.toList()).forEach { (glyph, character) ->
                            if (glyph.getString("text") != character.toString()) {
                                val small = JSONObject(edit.toString()).put("align", "left").put("lines", 1)
                                val style = small.getJSONObject("pdf")
                                glyph.keys().forEach { key -> style.put(key, glyph.get(key)) }
                                style.put("ops", JSONArray().put(glyph.getInt("op"))).put("spacing", 0)
                                add(Change(small, lines(character.toString(), small, document, fonts)))
                            }
                        }
                    } else add(Change(edit, lines(replacement, edit, document, fonts)))
                }
            }
        }
    }

    private fun compactContractRow(kind: String, tokens: MutableList<Any?>, values: Map<String, String>, layout: JSONObject,
                                   document: PDDocument, fonts: MutableMap<String, PDType0Font>): Double {
        if (kind != "contract" || values.any { (key, value) -> key.startsWith("item1_") && value.isNotBlank() }) return 0.0
        val delivery = layout.getJSONArray("slots").objects().flatMap { it.getJSONArray("edits").objects() }.first { it.getString("key") == "delivery" }
        val height = if (lines(values.getValue("delivery"), delivery, document, fonts).size > 1) 31.4 else 22.9
        val shift = 38.9 - height
        val operations = mutableListOf<Pair<List<Int>, Int>>()
        var operands = mutableListOf<Int>()
        tokens.forEachIndexed { index, token ->
            if (token is Operator) { operations += operands.toList() to index; operands = mutableListOf() }
            else operands += index
        }
        fun number(index: Int) = (tokens[index] as COSNumber).doubleValue()
        var removed = 0
        // Match the hash-checked source page's top-down geometry without reflowing its fonts or seal.
        operations.forEachIndexed { index, (args, at) ->
            val operator = (tokens[at] as Operator).name
            if (operator == "S" && index >= 2) {
                val prior = operations.subList(maxOf(0, index - 6), index)
                val move = prior.lastOrNull { (tokens[it.second] as Operator).name == "m" }
                val line = prior.lastOrNull { (tokens[it.second] as Operator).name == "l" }
                if (move != null && line != null && number(move.first[0]) == 52.63 && number(line.first[0]) == 486.42 &&
                    listOf(move, line).all { kotlin.math.abs(number(it.first[1]) - 242.57) < 0.001 }) {
                    tokens[at] = Operator.getOperator("n")
                    removed++
                }
            }
            val position = when (operator) {
                "Tm" -> 5
                "m", "l", "re" -> 1
                "cm" -> if (number(args[3]) != -1.0) 5 else null
                else -> null
            }
            if (position != null && number(args[position]) >= 258.45 - 0.001) {
                tokens[args[position]] = COSFloat(String.format(Locale.ROOT, "%.5f", number(args[position]) - shift))
            }
            if (operator == "re" && kotlin.math.abs(number(args[1]) - 219.55) < 0.001 && number(args[3]) > 22 && number(args[3]) < 40) {
                tokens[args[3]] = COSFloat(height.toString())
            }
        }
        require(removed == 1) { "原件商品行定位已失效，请恢复完整模板" }
        return shift
    }

    fun render(document: BusinessDocument): ExchangeArtifact {
        validateDocument(document)
        PDFBoxResourceLoader.init(context)
        val template = template(document.kind)
        val values = pages(document, template.layout)
        PDDocument().use { output ->
            values.forEach { pageValues ->
                PDDocument.load(template.pdf).use { source ->
                    val fonts = mutableMapOf<String, PDType0Font>()
                    val changes = changes(template.layout.getJSONArray("slots"), pageValues, source, fonts)
                    if (values.size == 1 && changes.isEmpty()) {
                        return exchange.artifact("${document.title}-${document.fields["buyer_name"]}-${document.fields["date"]}.pdf", "application/pdf", template.pdf)
                    }
                    val page = source.getPage(0)
                    val parser = PDFStreamParser(page)
                    parser.parse()
                    val tokens: MutableList<Any?> = parser.tokens.toMutableList()
                    val shift = compactContractRow(document.kind, tokens, pageValues, template.layout, source, fonts)
                    val removeText = changes.flatMap { it.edit.getJSONObject("pdf").getJSONArray("ops").ints() }.toSet()
                    val foreground = template.layout.getJSONArray("foreground").objects()
                    val removeImages = foreground.flatMap { it.getJSONArray("ops").ints() }.toSet()
                    var operation = 0
                    tokens.forEachIndexed { index, token ->
                        if (token is Operator) {
                            if (operation in removeText) {
                                require(token.name == "Tj" && tokens[index - 1] is COSString) { "原件字段定位已失效，请恢复模板" }
                                tokens[index - 1] = COSString(ByteArray(0))
                            }
                            if (operation in removeImages) {
                                require(token.name == "Do") { "原章定位已失效，请恢复模板" }
                                tokens[index - 1] = null
                                tokens[index] = null
                            }
                            operation++
                        }
                    }
                    val stream = PDStream(source)
                    stream.createOutputStream(COSName.FLATE_DECODE).use { ContentStreamWriter(it).writeTokens(tokens.filterNotNull()) }
                    page.setContents(stream)
                    PDPageContentStream(source, page, PDPageContentStream.AppendMode.APPEND, true, true).use { drawing ->
                        drawing.setNonStrokingColor(0)
                        drawing.setStrokingColor(0)
                        changes.forEach { change ->
                            val edit = change.edit
                            val style = edit.getJSONObject("pdf")
                            val size = style.getDouble("size").toFloat()
                            val spacing = style.getDouble("spacing")
                            change.lines.forEachIndexed { index, line ->
                                var x = style.getDouble(if (index == 0) "x" else "next_x")
                                val spare = style.getDouble("width") - line.width
                                x += when (edit.getString("align")) { "center" -> spare / 2; "right" -> spare; else -> 0.0 }
                                val y = style.getDouble("y") - index * style.getDouble("leading") +
                                    if (template.layout.getJSONArray("page_size").getDouble(1) - style.getDouble("y") >= 258.45) shift else 0.0
                                line.glyphs.forEachIndexed { glyphIndex, glyph ->
                                    drawing.setLineWidth(style.getDouble("stroke_width").toFloat())
                                    drawing.beginText()
                                    drawing.setRenderingMode(RenderingMode.fromInt(style.getInt("render_mode")))
                                    drawing.setFont(glyph.font, size)
                                    drawing.appendRawCommands(String.format(Locale.ROOT, "%.3f %.3f Td\n", x, y))
                                    drawing.showText(glyph.text)
                                    drawing.endText()
                                    x += glyph.advance + if (glyphIndex < line.glyphs.size - 1) spacing else 0.0
                                }
                            }
                        }
                        foreground.forEach { image ->
                            val name = image.getString("name")
                            require(Regex("[A-Za-z0-9]+").matches(name)) { "原章资源名称无效" }
                            drawing.appendRawCommands(String.format(Locale.ROOT, "q\n%.5f 0 0 %.5f %.5f %.5f cm\n/%s Do\nQ\n", image.getDouble("width"), image.getDouble("height"), image.getDouble("x"), image.getDouble("y") + shift, name))
                        }
                    }
                    // Finalize glyph subsets before importing their resources into the output.
                    val onePage = ByteArrayOutputStream().also { source.save(it) }.toByteArray()
                    PDDocument.load(onePage).use { completed -> PDFMergerUtility().appendDocument(output, completed) }
                }
            }
            val bytes = ByteArrayOutputStream().also { output.save(it) }.toByteArray()
            return exchange.artifact("${document.title}-${document.fields["buyer_name"]}-${document.fields["date"]}.pdf", "application/pdf", bytes)
        }
    }

    fun renderWord(document: BusinessDocument): ExchangeArtifact {
        validateDocument(document)
        PDFBoxResourceLoader.init(context)
        val template = template(document.kind)
        val pages = pages(document, template.layout)
        PDDocument().use { preflight ->
            val fonts = mutableMapOf<String, PDType0Font>()
            pages.forEach { changes(template.layout.getJSONArray("slots"), it, preflight, fonts) }
        }
        val bytes = SourceDocxExporter.build(template.word, template.layout.getJSONArray("slots"), pages)
        return exchange.artifact("${document.title}-${document.fields["buyer_name"]}-${document.fields["date"]}.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes)
    }

    private fun JSONArray.ints(): List<Int> = (0 until length()).map(::getInt)
}
