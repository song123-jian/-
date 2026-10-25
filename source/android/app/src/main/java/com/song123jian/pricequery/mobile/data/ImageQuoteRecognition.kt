package com.song123jian.pricequery.mobile.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import java.io.File
import java.text.Normalizer
import java.time.LocalDate
import java.util.UUID
import java.util.regex.Pattern

data class ImageOcrToken(val text: String, val left: Float, val top: Float, val right: Float, val bottom: Float)

data class ImageQuoteCandidate(val draft: QuoteDraft, val sourceFile: String, val sourceRow: Int, val warnings: List<String>)

data class ImageQuoteRecognition(val preview: Bitmap, val sourceFile: String, val candidates: List<ImageQuoteCandidate>)

class ImageQuoteRecognizer(private val context: Context) {
    fun recognize(uri: Uri, selectedCustomer: String = "", defaultDate: String = LocalDate.now().toString()): ImageQuoteRecognition {
        val input = File(context.cacheDir, "quote-image-${UUID.randomUUID()}.img")
        try {
            context.contentResolver.openInputStream(uri)?.use { stream ->
                input.outputStream().use { output ->
                    val buffer = ByteArray(8192)
                    var total = 0
                    while (true) {
                        val count = stream.read(buffer)
                        if (count < 0) break
                        total += count
                        require(total <= 20 * 1024 * 1024) { "图片文件不能超过20MB，请截取报价区域" }
                        output.write(buffer, 0, count)
                    }
                    require(total > 0) { "图片文件为空" }
                }
            } ?: error("无法读取所选图片")
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(input.path, bounds)
            require(bounds.outWidth > 0 && bounds.outHeight > 0) { "图片无法读取，请选择PNG、JPG或WebP图片" }
            require(bounds.outWidth.toLong() * bounds.outHeight <= 24_000_000L) { "图片超过2400万像素，请截取报价明细区域" }
            val image = InputImage.fromFilePath(context, Uri.fromFile(input))
            val recognizer = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
            val tokens = try {
                val recognized = Tasks.await(recognizer.process(image))
                recognized.textBlocks.flatMap { block ->
                    block.lines.flatMap { line ->
                        val elements = line.elements
                        if (elements.isEmpty()) {
                            listOfNotNull(line.boundingBox?.let { box ->
                                ImageOcrToken(line.text, box.left.toFloat(), box.top.toFloat(), box.right.toFloat(), box.bottom.toFloat())
                            })
                        } else elements.mapNotNull { element ->
                            element.boundingBox?.let { box ->
                                ImageOcrToken(element.text, box.left.toFloat(), box.top.toFloat(), box.right.toFloat(), box.bottom.toFloat())
                            }
                        }
                    }
                }
            } finally {
                recognizer.close()
            }
            require(tokens.isNotEmpty()) { "图片没有可识别的报价文字，请选择清晰的报价表格或截图" }
            val sourceFile = filename(uri)
            val candidates = extractImageQuoteCandidates(tokens, sourceFile, selectedCustomer, defaultDate)
            val previewOptions = BitmapFactory.Options().apply {
                inSampleSize = maxOf(1, maxOf(bounds.outWidth, bounds.outHeight) / 1200)
            }
            val preview = BitmapFactory.decodeFile(input.path, previewOptions) ?: error("图片预览无法生成")
            return ImageQuoteRecognition(preview, sourceFile, candidates)
        } finally {
            input.delete()
        }
    }

    private fun filename(uri: Uri): String {
        val name = runCatching {
            context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0)?.substringAfterLast('/')?.substringAfterLast('\\') else null }
        }.getOrNull()
        return name?.takeIf { it.isNotBlank() }?.take(250) ?: "报价图片"
    }
}

fun extractImageQuoteCandidates(
    tokens: List<ImageOcrToken>,
    filename: String,
    selectedCustomer: String = "",
    defaultDate: String = LocalDate.now().toString(),
): List<ImageQuoteCandidate> {
    require(tokens.size <= 3000) { "图片文字过多，请截取报价明细区域" }
    val rows = groupImageTokens(tokens)
    val table = imageTableRecords(rows)
    val records = table.ifEmpty { imageLabelRecords(rows) }
    val candidates = records.flatMapIndexed { index, fields ->
        imageCandidates(fields, filename, index + 1, selectedCustomer, defaultDate)
    }
    require(candidates.isNotEmpty()) { "未识别到报价字段，请选择含有牌号或产品名称及价格的清晰图片" }
    require(candidates.size <= 100) { "图片包含超过100条报价，请分批截图识别" }
    return candidates
}

private fun groupImageTokens(tokens: List<ImageOcrToken>): List<List<ImageOcrToken>> {
    val rows = mutableListOf<MutableList<ImageOcrToken>>()
    tokens.sortedWith(compareBy<ImageOcrToken> { (it.top + it.bottom) / 2 }.thenBy { it.left }).forEach { token ->
        if (token.text.isBlank()) return@forEach
        val target = rows.takeLast(4).lastOrNull { row ->
            val center = row.map { (it.top + it.bottom) / 2 }.average().toFloat()
            val height = row.maxOf { it.bottom - it.top }
            kotlin.math.abs((token.top + token.bottom) / 2 - center) <= maxOf(4f, minOf(token.bottom - token.top, height) * .55f)
        }
        if (target == null) rows += mutableListOf(token) else target += token
    }
    return rows.map { it.sortedBy(ImageOcrToken::left) }
}

private fun imageTableRecords(rows: List<List<ImageOcrToken>>): List<Map<String, String>> {
    val headerIndex = rows.indexOfFirst { row ->
        val keys = row.mapNotNull { normalizedHeaderKey(it.text) }.toSet()
        keys.any { it in setOf("grade", "material_spec", "material", "grade_product", "product_grade") } &&
            keys.any { it in setOf("price", "untaxed", "taxed") }
    }
    if (headerIndex < 0) return emptyList()
    val columns = rows[headerIndex].mapNotNull { token ->
        normalizedHeaderKey(token.text)?.let { token.left + (token.right - token.left) / 2 to it }
    }.sortedBy { it.first }
    if (columns.size < 2) return emptyList()
    val boundaries = columns.zipWithNext().map { (left, right) -> (left.first + right.first) / 2 }
    val records = mutableListOf<Map<String, String>>()
    rows.drop(headerIndex + 1).forEach { row ->
        if (row.any { normalizedHeaderKey(it.text) != null } && row.count { normalizedHeaderKey(it.text) != null } >= 2) return@forEach
        if (imageLabelValues(row).isNotEmpty()) return@forEach
        val cells = MutableList(columns.size) { mutableListOf<String>() }
        row.forEach { token ->
            val x = token.left + (token.right - token.left) / 2
            val column = boundaries.count { x > it }.coerceAtMost(columns.lastIndex)
            cells[column] += token.text.trim()
        }
        val fields = linkedMapOf<String, String>()
        columns.forEachIndexed { index, (_, key) ->
            val value = cells[index].joinToString(" ").trim()
            if (value.isNotBlank()) mergeImageField(fields, key, value)
        }
        if (fields.keys.any { it in setOf("grade", "material_spec", "material", "grade_product", "product_grade") } &&
            fields.keys.any { it in setOf("price", "untaxed", "taxed") }) records += fields
    }
    return records
}

private val IMAGE_LABELS: Map<String, String> by lazy {
    FileExchange.HEADER_ALIASES.mapNotNull { (alias, key) ->
        val field = when (key) { "date" -> "effective_date"; else -> key }
        if (field in setOf("customer", "grade", "material_spec", "material", "color", "grade_product", "product_grade",
                "material_color", "color_material", "price", "untaxed", "taxed", "effective_date", "tax", "note", "reason")) {
            alias to field
        } else null
    }.toMap() + mapOf("含稅单价" to "taxed", "未稅单价" to "untaxed")
}

private val IMAGE_LABEL_PATTERN: Pattern by lazy {
    val labels = IMAGE_LABELS.keys.sortedByDescending(String::length).joinToString("|") { Pattern.quote(it) }
    Pattern.compile("(?<![\\w/])(?<label>$labels)\\s*(?:\\((?:元|RMB|CNY)(?:/(?:kg|公斤|千克))?\\))?\\s*(?::|：|(?=\\s))\\s*", Pattern.CASE_INSENSITIVE)
}

private fun imageLabelValues(row: List<ImageOcrToken>): List<Pair<String, String>> {
    val text = Normalizer.normalize(row.joinToString("  ") { it.text.trim() }, Normalizer.Form.NFKC)
    val matcher = IMAGE_LABEL_PATTERN.matcher(text)
    val matches = mutableListOf<Triple<Int, Int, String>>()
    while (matcher.find()) {
        val label = matcher.group("label").uppercase()
        val field = IMAGE_LABELS.entries.firstOrNull { it.key.uppercase() == label }?.value ?: continue
        matches += Triple(matcher.start(), matcher.end(), field)
    }
    return matches.mapIndexedNotNull { index, (_, end, field) ->
        val next = matches.getOrNull(index + 1)?.first ?: text.length
        val value = text.substring(end, next).trim().split(Regex("\\s+(?:数量|总金额|金额|合计|总计|联系人)\\s*[:：]"), limit = 2).first().trim()
        if (value.isBlank()) null else field to value
    }
}

private fun imageLabelRecords(rows: List<List<ImageOcrToken>>): List<Map<String, String>> {
    val records = mutableListOf<Map<String, String>>()
    val defaults = linkedMapOf<String, String>()
    var current = linkedMapOf<String, String>()
    fun finish() {
        if (current.keys.any { it in setOf("grade", "material_spec", "material", "grade_product", "product_grade") } &&
            current.keys.any { it in setOf("price", "untaxed", "taxed") }) records += defaults + current
        current = linkedMapOf()
    }
    rows.forEach { row ->
        imageLabelValues(row).forEach { (key, value) ->
            val core = key in setOf("grade", "material_spec", "material", "grade_product", "product_grade")
            if (core && current.keys.any { it in setOf("grade", "material_spec", "material", "grade_product", "product_grade") } &&
                current.keys.any { it in setOf("price", "untaxed", "taxed") }) finish()
            if (key == "customer" && current["customer"] != null && current["customer"] != value && current.keys.any { it in setOf("price", "untaxed", "taxed") }) finish()
            if (key in setOf("customer", "effective_date", "tax") && current.keys.none { it in setOf("grade", "material_spec", "material", "grade_product", "product_grade", "price", "untaxed", "taxed") }) {
                defaults[key] = value
            } else mergeImageField(current, key, value)
        }
    }
    finish()
    return records
}

private fun mergeImageField(fields: MutableMap<String, String>, key: String, value: String) {
    val previous = fields[key]
    if (previous == null || previous.isBlank()) fields[key] = value
    else if (businessNorm(previous) != businessNorm(value)) fields[key] = "$previous | $value"
}

private fun imageCandidates(
    input: Map<String, String>, filename: String, sourceRow: Int, selectedCustomer: String, defaultDate: String,
): List<ImageQuoteCandidate> {
    val fields = input.toMutableMap()
    fun combined(key: String, targets: List<String>) {
        val value = fields.remove(key)?.trim().orEmpty()
        if (value.isBlank()) return
        val parts = value.split(Regex("[\\r\\n|;；]+|[ \\t]+/[ \\t]+" )).map(String::trim).filter(String::isNotBlank)
        if (parts.size == 2) targets.zip(parts).forEach { (target, part) -> fields.putIfAbsent(target, part) }
        else if (targets.first() == "grade") fields.putIfAbsent("grade", value) else fields.putIfAbsent("material", value)
    }
    combined("grade_product", listOf("grade", "material"))
    combined("product_grade", listOf("material", "grade"))
    combined("material_color", listOf("material", "color"))
    combined("color_material", listOf("color", "material"))
    val customer = selectedCustomer.ifBlank { fields["customer"].orEmpty() }
    val gradeValue = fields["grade"].orEmpty().ifBlank { fields["material_spec"].orEmpty() }.ifBlank { fields["material"].orEmpty() }
    var material = fields["material"].orEmpty()
    var color = fields["color"].orEmpty()
    val suffix = COLOR_SUFFIX.find(material)
    if (suffix != null) {
        material = suffix.groupValues[1]
        if (color.isBlank()) color = suffix.groupValues[2]
    }
    val spec = fields["material_spec"].orEmpty()
    val note = listOf(fields["note"].orEmpty(), if (spec.isNotBlank() && fields["grade"].orEmpty().isNotBlank() && businessNorm(spec) != businessNorm(fields["grade"].orEmpty())) "材料规格：$spec" else "")
        .filter(String::isNotBlank).joinToString("\n")
    val rawDate = fields["effective_date"].orEmpty().replace("年", "-").replace("月", "-").replace("日", "")
    val date = runCatching { importDate(rawDate, defaultDate) }.getOrElse { defaultDate }
    val prices = listOf("untaxed" to "未税", "taxed" to "含税").mapNotNull { (key, tax) ->
        fields[key]?.takeIf(String::isNotBlank)?.let { cleanImagePrice(it) to tax }
    }.ifEmpty {
        val price = fields["price"].orEmpty()
        if (price.isBlank()) emptyList() else listOf(cleanImagePrice(price) to normalizeImageTax(fields["tax"].orEmpty()))
    }
    return prices.mapNotNull { (price, tax) ->
        val warnings = mutableListOf("请逐项对照原图，确认客户、规格、价格、税口径和业务日期后再保存")
        if (customer.isBlank()) warnings += "未识别到客户，请补充"
        if (gradeValue.isBlank()) warnings += "未识别到牌号或产品名称，请补充"
        if (price.isBlank()) warnings += "未识别到单价，请补充"
        if (tax == "未注明") warnings += "图片未明确标注含税或未税，请核对"
        val normalized = runCatching { normalizedPrice(price) }.getOrElse {
            warnings += "单价格式不明确，请核对原图"
            price
        }
        val candidate = ImageQuoteCandidate(
            QuoteDraft(customer = customer, grade = gradeValue, material = material, color = color, price = normalized,
                taxType = tax, effectiveDate = date, note = note), filename, sourceRow, warnings,
        )
        if (normalized.isBlank()) null else candidate
    }
}

private fun cleanImagePrice(value: String): String {
    val normalized = Normalizer.normalize(value, Normalizer.Form.NFKC).replace(",", "").trim()
    return Regex("(?:人民币|RMB|CNY|[¥￥])?\\s*([0-9]+(?:\\.[0-9]+)?)").find(normalized)?.groupValues?.get(1).orEmpty()
}

private fun normalizeImageTax(value: String): String = when (businessNorm(value).replace(" ", "")) {
    "不含税", "未含税", "未税" -> "未税"
    "含税" -> "含税"
    else -> "未注明"
}

private val COLOR_SUFFIX = Regex("^(.+?)\\s+(黑色|白色|本色|透明|黑|白|松露蓝|燕麦灰|桃桃粉|[\\u4e00-\\u9fff]{1,8}[色灰蓝绿红粉黄紫橙])$")
