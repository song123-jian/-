package com.song123jian.pricequery.mobile.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.provider.OpenableColumns
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVPrinter
import org.dhatim.fastexcel.reader.CellType
import org.dhatim.fastexcel.reader.ReadableWorkbook
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.StringReader
import java.io.StringWriter
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID
import java.util.zip.ZipFile

internal fun normalizedHeaderKey(value: String): String? {
    val text = businessNorm(value).replace(Regex("\\s+"), "")
        .replace(Regex("\\((元|RMB|CNY)(/(KG|公斤|千克))?\\)$"), "")
    return FileExchange.HEADER_ALIASES[text] ?: FileExchange.HEADER_ALIASES[text.replace("(", "").replace(")", "")]
}

data class ExchangeArtifact(val file: File, val mime: String) {
    val name: String get() = file.name
}

class FileExchange(private val context: Context) {
    private val exports = File(context.cacheDir, "exports").apply { mkdirs() }

    fun filename(uri: Uri): String {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) return cursor.getString(0).substringAfterLast('/').substringAfterLast('\\')
        }
        return "导入文件"
    }

    fun copyInput(uri: Uri, maxBytes: Int = 20 * 1024 * 1024): Pair<File, String> {
        val name = filename(uri)
        val file = File(context.cacheDir, "input-${UUID.randomUUID()}.${name.substringAfterLast('.', "bin")}")
        try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                file.outputStream().use { output ->
                    val buffer = ByteArray(8192)
                    var total = 0
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        require(total <= maxBytes) { "文件超过${maxBytes / 1024 / 1024}MB，请拆分后再试" }
                        output.write(buffer, 0, count)
                    }
                    require(total > 0) { "文件为空" }
                }
            } ?: error("无法打开所选文件")
            return file to name
        } catch (failure: Exception) {
            file.delete()
            throw failure
        }
    }

    fun save(artifact: ExchangeArtifact, uri: Uri) {
        context.contentResolver.openOutputStream(uri, "wt")?.use { output ->
            artifact.file.inputStream().use { it.copyTo(output) }
        } ?: error("无法写入所选位置")
    }

    fun artifact(name: String, mime: String, bytes: ByteArray): ExchangeArtifact {
        val safeName = name.replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").take(160)
        val file = File(exports, "${System.currentTimeMillis()}-$safeName")
        file.outputStream().use { it.write(bytes) }
        return ExchangeArtifact(file, mime)
    }

    fun csv(name: String, headers: List<String>, rows: List<List<String>>): ExchangeArtifact {
        val text = StringWriter()
        CSVPrinter(text, CSVFormat.DEFAULT).use { printer ->
            printer.printRecord(headers)
            rows.forEach { row -> printer.printRecord(row.map(::spreadsheetCell)) }
        }
        return artifact(name, "text/csv", ("\uFEFF" + text.toString()).toByteArray(Charsets.UTF_8))
    }

    fun xlsx(name: String, bytes: ByteArray): ExchangeArtifact =
        artifact(name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes)

    fun template(): ExchangeArtifact = csv("报价导入模板.csv",
        listOf("客户", "牌号", "材料", "颜色", "价格", "税口径", "记录日期", "备注", "调价原因"), emptyList())

    fun parse(file: File, name: String, options: ImportOptions): ImportPreview {
        require(file.length() in 1..20L * 1024 * 1024) { "文件须大于0且不超过20MB" }
        return when (name.substringAfterLast('.').lowercase()) {
            "csv" -> parseTable(csvRows(file), "CSV", name, options)
            "xlsx" -> parseXlsx(file, name, options)
            "pdf" -> parsePdf(file, name, options)
            else -> error("请选择 .xlsx、.csv 或文字表格 .pdf，旧版 .xls 请先另存为 .xlsx")
        }
    }

    private fun csvRows(file: File): List<Pair<Int, List<String>>> {
        val bytes = file.readBytes()
        fun decode(charset: String): String = java.nio.charset.Charset.forName(charset).newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes)).toString().removePrefix("\uFEFF")
        val text = runCatching { decode("UTF-8") }.getOrElse { decode("GB18030") }
        return CSVFormat.DEFAULT.parse(StringReader(text)).use { parser ->
            buildList {
                for (record in parser) {
                    require(size <= 20020) { "一次最多导入20000条报价" }
                    require(record.size() <= 128) { "导入区域超过128列" }
                    add(record.recordNumber.toInt() to record.toList())
                }
            }
        }
    }

    private fun parseXlsx(file: File, name: String, options: ImportOptions): ImportPreview {
        ZipFile(file).use { archive ->
            var total = 0L
            val entries = archive.entries()
            while (entries.hasMoreElements()) {
                val entry = entries.nextElement()
                require(entry.size >= 0) { "Excel 压缩目录无效" }
                total += entry.size
                require(total <= 64L * 1024 * 1024) { "Excel 解压后超过64MB，请拆分" }
            }
        }
        ReadableWorkbook(file).use { workbook ->
            val sheets = workbook.sheets.use { it.iterator().asSequence().toList() }.sortedBy { if (it.name == "价格明细") 0 else 1 }
            for (sheet in sheets) {
                val rows = sheet.openStream().use { stream ->
                    val iterator = stream.iterator()
                    buildList {
                        while (iterator.hasNext()) {
                            val row = iterator.next()
                            require(size <= 20020 && row.cellCount <= 128) { "Excel 超过20000行或128列" }
                            add(row.rowNum to (0 until row.cellCount).map { index ->
                                val cell = row.getCell(index)
                                when {
                                    cell == null -> ""
                                    cell.type == CellType.ERROR -> "#ERROR!"
                                    cell.formula != null && cell.rawValue.isNullOrEmpty() -> "#未计算公式"
                                    else -> cell.text.orEmpty()
                                }
                            })
                        }
                    }
                }
                if (findHeader(rows) != null) return parseTable(rows, sheet.name, name, options, workbook.isDate1904)
            }
        }
        error("未找到价格表头，请使用导入模板")
    }

    private fun parsePdf(file: File, name: String, options: ImportOptions): ImportPreview {
        PDFBoxResourceLoader.init(context)
        PDDocument.load(file).use { document ->
            require(document.numberOfPages in 1..100) { "文字PDF最多100页" }
            require(!document.isEncrypted && document.currentAccessPermission.canExtractContent()) { "PDF 加密或禁止提取文本" }
            val stripper = PDFTextStripper().apply { sortByPosition = true; wordSeparator = "\t" }
            val text = stripper.getText(document)
            require(text.isNotBlank()) { "PDF没有可提取的文字，请使用文字表格PDF或原始Excel" }
            val rows = text.lineSequence().mapIndexed { index, line ->
                index + 1 to line.trim().split(Regex("\\t+| {2,}|\\s*[|│]\\s*"))
            }.toList()
            return parseTable(rows, "文字PDF", name, options)
        }
    }

    private fun parseTable(
        rows: List<Pair<Int, List<String>>>, sheet: String, file: String, options: ImportOptions, epoch1904: Boolean = false,
    ): ImportPreview {
        val header = findHeader(rows) ?: error("未找到价格表头，至少须有牌号/材料规格及价格列")
        val mapping = rows[header].second.mapIndexedNotNull { index, value -> headerKey(value)?.let { it to index } }.groupBy({ it.first }, { it.second })
        require(options.customer.isNotBlank() || "customer" in mapping) { "全客户导入须包含客户列；或先选择客户" }
        val records = mutableListOf<ImportRow>()
        val errors = mutableListOf<String>()
        var businessRows = 0
        rows.drop(header + 1).forEach { (line, values) ->
            if (values.all { it.isBlank() } || values.firstOrNull()?.trim() in listOf("合计", "总计", "小计")) return@forEach
            if (values.count { headerKey(it) != null } >= 3) return@forEach
            businessRows++
            require(businessRows <= 20000) { "一次最多导入20000条业务报价" }
            runCatching {
                fun field(key: String): String {
                    val parts = mapping[key].orEmpty().map { values.getOrElse(it) { "" }.trim() }.filter { it.isNotBlank() }
                    require(parts.distinct().size <= 1) { "$key 重复列内容不一致" }
                    return parts.firstOrNull().orEmpty()
                }
                val combined = mutableMapOf<String, String>()
                mapOf("grade_product" to listOf("grade", "material"), "product_grade" to listOf("material", "grade"),
                    "material_color" to listOf("material", "color"), "color_material" to listOf("color", "material")).forEach { (key, targets) ->
                    val value = field(key)
                    if (value.isNotBlank()) {
                        val normalized = businessNorm(value)
                        if (key in listOf("material_color", "color_material") && COLOR_ONLY.matches(normalized)) {
                            require(field("color").isBlank() || businessNorm(field("color")) == normalized) { "颜色与组合列冲突" }
                            combined["color"] = value
                        } else {
                            val parts = value.split(Regex("[\\r\\n|;；]+|[ \\t]+/[ \\t]+"))
                                .map { it.trim() }.filter { it.isNotEmpty() }
                            if (parts.size == 1) {
                                val target = if (key in listOf("grade_product", "product_grade")) "grade" else "material"
                                combined[target] = parts.single()
                            } else {
                                require(parts.size == 2) { "$key 组合列须用换行、竖线、分号或两侧空格的 / 分隔两项" }
                                targets.zip(parts).forEach { (target, part) ->
                                    val previous = field(target).ifBlank { combined[target].orEmpty() }
                                    require(previous.isBlank() || businessNorm(previous) == businessNorm(part)) { "$target 与组合列冲突" }
                                    combined[target] = part
                                }
                            }
                        }
                    }
                }
                val customer = options.customer.ifBlank { field("customer") }
                val materialSpec = field("material_spec")
                val explicitGrade = field("grade").ifBlank { combined["grade"].orEmpty() }
                val grade = explicitGrade.ifBlank { materialSpec }.ifBlank { field("material") }.ifBlank { combined["material"].orEmpty() }
                var material = field("material").ifBlank { combined["material"].orEmpty() }
                var color = field("color").ifBlank { combined["color"].orEmpty() }
                val colorSuffix = COLOR_SUFFIX.find(material)
                if (colorSuffix != null) {
                    val suffixColor = colorSuffix.groupValues[2]
                    require(color.isBlank() || businessNorm(color) == businessNorm(suffixColor)) { "材料名称中的颜色与颜色列冲突" }
                    color = color.ifBlank { suffixColor }
                    material = colorSuffix.groupValues[1]
                }
                val note = buildList {
                    field("note").takeIf(String::isNotBlank)?.let(::add)
                    if (materialSpec.isNotBlank() && explicitGrade.isNotBlank() && businessNorm(materialSpec) != businessNorm(explicitGrade)) {
                        add("材料规格：$materialSpec")
                    }
                }.joinToString("\n")
                require(customer.isNotBlank() && customer.length <= 200 && grade.isNotBlank() && grade.length <= 200) { "客户和牌号必填且最多200字" }
                require(listOf(material, color).all { it.length <= 200 } && note.length <= 2000 && field("reason").length <= 1000) { "字段内容过长" }
                require(values.none { it.startsWith("#ERROR") || it == "#未计算公式" }) { "公式错误或未保存计算结果" }
                val date = importDate(field("date"), options.date, epoch1904)
                val explicit = listOf("untaxed" to "未税", "taxed" to "含税").mapNotNull { (key, tax) -> field(key).takeIf { it.isNotBlank() }?.let { it to tax } }
                val prices = explicit.ifEmpty { listOf(field("price") to field("tax").ifBlank { options.tax }) }
                prices.forEach { (price, tax) ->
                    val normalizedTax = when (businessNorm(tax)) { "不含税", "未含税", "未税" -> "未税"; "含税" -> "含税"; "未注明", "" -> "未注明"; else -> error("税口径须为含税、未税或未注明") }
                    records.add(ImportRow(customer, grade, material, color, normalizedPrice(price), normalizedTax, date,
                        note.trim(), field("reason"), file, sheet, line, materialSpec))
                    require(records.size <= 20000) { "一次最多20000条报价，双价格分别计数" }
                }
            }.onFailure { errors.add("第${line}行：${it.message ?: "报价格式无效"}") }
        }
        require(records.isNotEmpty() || errors.isNotEmpty()) { "表格没有报价记录" }
        require(records.size <= 20000) { "一次最多20000条报价" }
        return ImportPreview(records, errors)
    }

    private fun findHeader(rows: List<Pair<Int, List<String>>>): Int? = rows.take(20).indexOfFirst { (_, cells) ->
        val keys = cells.mapNotNull(::headerKey).toSet()
        keys.any { it in listOf("grade", "material_spec", "material", "grade_product", "product_grade") } && keys.any { it in listOf("price", "untaxed", "taxed") }
    }.takeIf { it >= 0 }

    fun headerKey(value: String): String? {
        return normalizedHeaderKey(value)
    }

    fun backup(snapshot: BackupSnapshot, label: String = "完整备份", privateDirectory: File? = null): ExchangeArtifact {
        val timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss-SSS"))
        val directory = privateDirectory ?: exports
        directory.mkdirs()
        val file = File(directory, "$label-$timestamp.sqlite3")
        try {
            SQLiteDatabase.openOrCreateDatabase(file, null).use { database ->
                database.beginTransaction()
                try {
                    database.execSQL("CREATE TABLE settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)")
                    database.execSQL("INSERT INTO settings VALUES ('schema_version','2'),('seed_loaded','1')")
                    database.execSQL("CREATE TABLE customers (customer_key TEXT PRIMARY KEY,display_name TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL,deleted_at TEXT,deleted_reason TEXT NOT NULL)")
                    database.execSQL("CREATE TABLE quotes (id INTEGER PRIMARY KEY AUTOINCREMENT,identity TEXT NOT NULL,customer TEXT NOT NULL,grade TEXT NOT NULL,material TEXT NOT NULL,color TEXT NOT NULL,price TEXT NOT NULL,tax_type TEXT NOT NULL,effective_date TEXT NOT NULL,note TEXT NOT NULL,reason TEXT NOT NULL,source_file TEXT NOT NULL,source_sheet TEXT NOT NULL,source_row INTEGER NOT NULL,created_at TEXT NOT NULL,source_type TEXT NOT NULL,import_key TEXT UNIQUE,customer_key TEXT REFERENCES customers(customer_key))")
                    database.execSQL("CREATE TABLE customer_audit (request_id TEXT PRIMARY KEY,customer_key TEXT NOT NULL REFERENCES customers(customer_key),action TEXT NOT NULL,expected_revision INTEGER NOT NULL,revision INTEGER NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL)")
                    fun insert(table: String, columns: List<String>, rows: List<JSONObject>) {
                        rows.forEach { row ->
                            val values = ContentValues()
                            columns.forEach { key -> if (row.isNull(key)) values.putNull(key) else values.put(key, row.get(key).toString()) }
                            check(database.insertOrThrow(table, null, values) >= 0)
                        }
                    }
                    insert("customers", CUSTOMER_COLUMNS, snapshot.customers)
                    insert("quotes", QUOTE_COLUMNS, snapshot.quotes)
                    insert("customer_audit", AUDIT_COLUMNS, snapshot.audit)
                    database.execSQL("CREATE INDEX idx_quotes_identity_date ON quotes(identity,effective_date DESC,id DESC)")
                    database.execSQL("CREATE INDEX idx_quotes_customer ON quotes(customer_key,identity,effective_date DESC,id DESC)")
                    database.setTransactionSuccessful()
                } finally { database.endTransaction() }
            }
            val verified = readBackup(file)
            require(verified.quotes.size == snapshot.quotes.size && verified.customers.size == snapshot.customers.size && verified.audit.size == snapshot.audit.size) { "备份回读计数不一致" }
            return ExchangeArtifact(file, "application/vnd.sqlite3")
        } catch (failure: Exception) {
            file.delete()
            throw failure
        }
    }

    fun readBackup(file: File): BackupSnapshot {
        require(file.length() in 1..128L * 1024 * 1024) { "备份文件为空或超过128MB" }
        return SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY).use { database ->
            database.rawQuery("PRAGMA integrity_check(1)", null).use { require(it.moveToFirst() && it.getString(0) == "ok") { "备份完整性检查失败" } }
            database.rawQuery("SELECT value FROM settings WHERE key='schema_version'", null).use { require(it.moveToFirst() && it.getString(0) == "2") { "仅支持桌面端第2版SQLite备份" } }
            fun read(table: String, columns: List<String>, order: String): JSONArray {
                val array = JSONArray()
                database.rawQuery("SELECT ${columns.joinToString(",")} FROM $table ORDER BY $order", null).use { cursor ->
                    while (cursor.moveToNext()) {
                        require(array.length() < 200000) { "备份记录超过本机恢复上限" }
                        val row = JSONObject()
                        columns.forEachIndexed { index, key -> row.put(key, if (cursor.isNull(index)) JSONObject.NULL else cursor.getString(index)) }
                        array.put(row)
                    }
                }
                return array
            }
            BackupSnapshot(JSONObject().put("schema_version", 2).put("customers", read("customers", CUSTOMER_COLUMNS, "customer_key"))
                .put("quotes", read("quotes", QUOTE_COLUMNS, "id")).put("audit", read("customer_audit", AUDIT_COLUMNS, "request_id")))
        }
    }

    companion object {
        val CUSTOMER_COLUMNS = listOf("customer_key", "display_name", "status", "revision", "deleted_at", "deleted_reason")
        val QUOTE_COLUMNS = listOf("id", "identity", "customer", "grade", "material", "color", "price", "tax_type", "effective_date", "note", "reason", "source_file", "source_sheet", "source_row", "created_at", "source_type", "import_key", "customer_key")
        val AUDIT_COLUMNS = listOf("request_id", "customer_key", "action", "expected_revision", "revision", "reason", "created_at")
        val HEADER_ALIASES: Map<String, String> = buildMap {
            fun aliases(key: String, vararg names: String) { names.forEach { put(businessNorm(it).replace(" ", ""), key) } }
            aliases("customer", "客户", "客户名称", "客戶", "客戶名称", "客戸", "客戸名称")
            aliases("row_label", "序号", "编号")
            aliases("grade", "牌号", "材料牌号", "型号")
            aliases("material_spec", "材料规格", "规格型号", "规格", "材质规格")
            aliases("material", "产品名称", "产品名", "物料名称", "材料名称", "材料类别", "材料", "类别")
            aliases("color", "颜色", "产品颜色", "色号")
            aliases("grade_product", "牌号/产品名称", "牌号产品名称", "牌号/产品名", "牌号(产品名称)", "牌号（产品名称）")
            aliases("product_grade", "产品名称/牌号", "产品名称牌号", "产品名称(牌号)", "产品名称（牌号）")
            aliases("material_color", "材料/颜色", "材料颜色", "材料及颜色", "材料和颜色")
            aliases("color_material", "颜色/材料", "颜色材料")
            aliases("price", "价格(元/kg)", "价格（元/kg）", "单价(元/kg)", "单价", "价格", "当前价格(元/kg)", "当前价格")
            aliases("untaxed", "未税价格", "未税单价", "不含税价格", "不含税单价", "价格未税", "单价未税", "未税", "不含税", "未税价", "不含税价")
            aliases("taxed", "含税价格", "含税单价", "价格含税", "单价含税", "税后价格", "税后单价", "含税", "含税价")
            aliases("date", "记录日期", "更新日期", "价格更新日期", "生效日期", "报价日期")
            aliases("tax", "税口径", "含税状态", "含税/未税", "含税未税", "是否含税", "税别")
            aliases("note", "备注")
            aliases("reason", "调价原因")
        }
        private val COLOR_ONLY = Regex("黑色|白色|本色|透明|黑|白|松露蓝|燕麦灰|桃桃粉|[\\u4e00-\\u9fff]{1,8}[色灰蓝绿红粉黄紫橙]")
        private val COLOR_SUFFIX = Regex("^(.+?)\\s+(黑色|白色|本色|透明|黑|白|松露蓝|燕麦灰|桃桃粉|[\\u4e00-\\u9fff]{1,8}[色灰蓝绿红粉黄紫橙])$")
        fun spreadsheetCell(value: String): String = if (value.trimStart().firstOrNull() in listOf('=', '+', '-', '@') || value.startsWith('\t') || value.startsWith('\r')) "'$value" else value
    }
}
