package com.song123jian.pricequery.mobile.data

import org.dhatim.fastexcel.reader.CellType
import org.dhatim.fastexcel.reader.ReadableWorkbook
import org.w3c.dom.Element
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory
import javax.xml.transform.OutputKeys
import javax.xml.transform.TransformerFactory
import javax.xml.transform.dom.DOMSource
import javax.xml.transform.stream.StreamResult

data class CustomerProfileImportResult(
    val filename: String,
    val profiles: List<CustomerProfile>,
    val errors: List<String>,
)

data class ProjectProgressImportResult(
    val filename: String,
    val projects: List<ProjectProgressRecord>,
    val errors: List<String>,
    val imported: Int = 0,
)

private const val XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
private const val SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
private const val PROJECT_SHEET_PATH = "xl/worksheets/sheet1.xml"
private const val MAX_PROJECT_ROWS = 1000

internal val CUSTOMER_PROFILE_XLSX_HEADERS = listOf(
    "客户编号（系统）", "数据版本（系统）", "客户名称", "联系人", "电话", "行业", "地址", "备注",
)

internal val PROJECT_PROGRESS_XLSX_HEADERS = listOf(
    "行业", "客户名称", "材料", "推荐牌号", "材料价值", "颜色", "竞争对手", "产品名称",
    "项目进度(阶段代码)", "项目阶段(自动)", "下一步动作(建议)", "时间节点", "备注", "客户类型",
    "客户战略价值", "竞争态势", "项目编号（系统）", "数据版本（系统）", "项目阶段(自定义)",
    "客户战略价值(自定义)", "材料价值(自定义)", "竞争态势(自定义)",
)

internal fun customerProfilesXlsx(profiles: List<CustomerProfile>): ByteArray = simpleWorkbook(
    "客户资料", CUSTOMER_PROFILE_XLSX_HEADERS,
    profiles.map { profile ->
        listOf(
            profile.profileId.orEmpty(), profile.revision?.toString().orEmpty(), profile.name,
            profile.contact, profile.phone, profile.industry, profile.address, profile.notes,
        )
    },
)

internal fun projectProgressXlsx(projects: List<ProjectProgressRecord>, template: ByteArray): ByteArray {
    require(projects.size <= MAX_PROJECT_ROWS) { "项目进度一次最多导出${MAX_PROJECT_ROWS}项" }
    return rewriteProjectWorkbook(projects.map(::normalizeProjectProgress), template)
}

internal fun customerProfileTemplateXlsx(): ByteArray = customerProfilesXlsx(emptyList())

internal fun projectProgressTemplateXlsx(template: ByteArray): ByteArray = rewriteProjectWorkbook(emptyList(), template)

internal fun parseCustomerProfilesXlsx(file: File, filename: String): CustomerProfileImportResult {
    val rows = readWorkbookRows(file, "客户资料")
    val header = rows.firstOrNull()?.second.orEmpty()
    val normalized = header.map(::workbookHeaderKey)
    val expected = CUSTOMER_PROFILE_XLSX_HEADERS.map(::workbookHeaderKey)
    val legacy = normalized.take(7) == expected.take(7) && normalized.drop(7).all(String::isBlank)
    require(normalized.take(expected.size) == expected || legacy) {
        "客户资料模板表头不匹配，请使用固定 XLSX 模板"
    }
    require(normalized.drop(expected.size).all(String::isBlank)) { "客户资料模板包含未知列" }
    val profiles = mutableListOf<CustomerProfile>()
    val errors = mutableListOf<String>()
    val seen = mutableSetOf<String>()
    rows.drop(1).forEach { (line, values) ->
        if (profiles.size + errors.size >= 20_000) {
            if (errors.none { it == "客户资料一次最多导入20000条" }) errors += "客户资料一次最多导入20000条"
            return@forEach
        }
        val padded = values + List((expected.size - values.size).coerceAtLeast(0)) { "" }
        if (padded.take(expected.size).all(String::isBlank)) return@forEach
        try {
            require(padded.none { it == "#ERROR!" || it == "#未计算公式" }) { "单元格含公式错误或未计算公式，请在 Excel 中检查后重试" }
            val profileId = padded[0].trim().ifBlank { null }
            val revisionText = padded[1].trim()
            val revision = revisionText.takeIf(String::isNotBlank)?.let { parseOptionalPositiveInt(it, "数据版本") }
            val normalizedId = profileId?.let { runCatching { UUID.fromString(it).toString() }.getOrNull() }
            require(profileId == null || normalizedId != null) { "客户编号无效" }
            require(profileId != null || revision == null) { "数据版本有值时必须填写客户编号" }
            if (normalizedId != null) require(seen.add(normalizedId)) { "客户编号重复" }
            profiles += normalizeCustomerProfile(
                CustomerProfile(
                    profileId = normalizedId,
                    revision = revision,
                    name = padded[2], contact = padded[3], phone = padded[4], industry = padded[5],
                    address = padded[6], notes = if (legacy) "" else padded[7],
                ),
            )
        } catch (failure: Exception) {
            errors += "第${line}行：${failure.message ?: "客户资料无效"}"
        }
    }
    return CustomerProfileImportResult(filename, profiles, errors)
}

internal fun parseProjectProgressXlsx(file: File, filename: String): ProjectProgressImportResult {
    val rows = readWorkbookRows(file, "项目进度表")
    val knownHeaders = PROJECT_PROGRESS_XLSX_HEADERS.map(::workbookHeaderKey)
    val headerIndex = rows.indexOfFirst { (_, values) ->
        values.map(::workbookHeaderKey).count { it in knownHeaders } >= 3
    }
    require(headerIndex >= 0) { "未找到项目进度表头，请使用固定 XLSX 模板" }
    val headers = rows[headerIndex].second.map(::workbookHeaderKey)
    require(headers.filter(String::isNotBlank).distinct().size == headers.count(String::isNotBlank)) { "项目进度模板包含重复表头" }
    val mapping = headers.mapIndexedNotNull { index, key ->
        knownHeaders.indexOf(key).takeIf { it >= 0 }?.let { it to index }
    }.toMap()
    val required = listOf(0, 1, 2, 4, 8, 13, 14, 15)
    require(required.all(mapping::containsKey)) { "项目进度模板缺少必需列" }
    val projects = mutableListOf<ProjectProgressRecord>()
    val errors = mutableListOf<String>()
    val seen = mutableSetOf<String>()
    var rowLimitReported = false
    rows.drop(headerIndex + 1).forEach { (line, values) ->
        fun value(index: Int): String = mapping[index]?.let { values.getOrElse(it) { "" }.trim() }.orEmpty()
        if (PROJECT_PROGRESS_XLSX_HEADERS.indices.all { value(it).isBlank() }) return@forEach
        if (projects.size + errors.size >= MAX_PROJECT_ROWS) {
            if (!rowLimitReported) errors += "项目进度一次最多导入${MAX_PROJECT_ROWS}项"
            rowLimitReported = true
            return@forEach
        }
        try {
            require(mapping.values.none { index -> values.getOrElse(index) { "" } in setOf("#ERROR!", "#未计算公式") }) {
                "单元格含公式错误或未计算公式，请在 Excel 中检查后重试"
            }
            val projectId = value(16).ifBlank { null }
            val revision = value(17).takeIf(String::isNotBlank)?.let { parseOptionalPositiveInt(it, "数据版本") }
            val normalizedId = projectId?.let { runCatching { UUID.fromString(it).toString() }.getOrNull() }
            require(projectId == null || normalizedId != null) { "项目编号无效" }
            require(projectId != null || revision == null) { "数据版本有值时必须填写项目编号" }
            if (normalizedId != null) require(seen.add(normalizedId)) { "项目编号重复" }
            val customerType = projectChoice(value(13), mapOf("oem" to "oem", "主机厂" to "oem", "汽车零部件主机厂" to "oem", "non_auto" to "non_auto", "非汽车" to "non_auto", "非汽车客户" to "non_auto"))
            val stage = projectChoice(value(8), mapOf("1" to "1", "2" to "2", "3" to "3", "4" to "4", "5" to "5") + stageLabels())
            val customerValue = projectChoice(value(14), customerValueLabels())
            val materialValue = projectChoice(value(4), materialValueLabels())
            val competition = projectChoice(value(15), competitionLabels())
            val customStage = value(18).ifBlank { if (stage == null) value(9) else "" }
            val customCustomer = value(19).ifBlank { if (customerValue == null) value(14) else "" }
            val customMaterial = value(20).ifBlank { if (materialValue == null) value(4) else "" }
            val customCompetition = value(21).ifBlank { if (competition == null) value(15) else "" }
            val project = normalizeProjectProgress(
                ProjectProgressRecord(
                    projectId = normalizedId,
                    revision = revision,
                    industry = value(0), customerType = customerType ?: "", customerName = value(1),
                    material = value(2), recommendedGrade = value(3), materialValue = materialValue ?: "general",
                    color = value(5), competitor = value(6), productName = value(7), stageCode = stage ?: "1",
                    customerValue = customerValue ?: if (customerType == "non_auto") "non_auto" else "oem_t1_regular",
                    competition = competition ?: "open", customStageLabel = customStage,
                    customCustomerValue = customCustomer, customMaterialValue = customMaterial,
                    customCompetition = customCompetition, nextAction = value(10), milestoneDate = value(11), notes = value(12),
                ),
            )
            projects += project
        } catch (failure: Exception) {
            errors += "第${line}行：${failure.message ?: "项目进度无效"}"
        }
    }
    return ProjectProgressImportResult(filename, projects, errors)
}

private fun parseOptionalPositiveInt(value: String, label: String): Int {
    val normalized = value.removeSuffix(".0")
    require(normalized.matches(Regex("[0-9]+"))) { "${label}须为正整数" }
    return normalized.toInt().also { require(it > 0) { "${label}须为正整数" } }
}

private fun projectChoice(value: String, aliases: Map<String, String>): String? {
    if (value.isBlank()) return null
    return aliases[value] ?: aliases.entries.firstOrNull { businessNorm(it.key) == businessNorm(value) }?.value
}

private fun stageLabels() = mapOf("项目接触" to "1", "送样 / 试料" to "2", "测试 / 认证" to "3", "定点 / 小批" to "4", "量产" to "5")
private fun customerValueLabels() = mapOf(
    "吉利系 / 战略客户项目" to "geely_strategic", "主机厂 T1 重要客户" to "oem_t1_important",
    "主机厂 T1 普通客户" to "oem_t1_regular", "非汽车客户" to "non_auto",
)
private fun materialValueLabels() = mapOf("特种高价值（长玻纤 / 高增强 / 阻燃）" to "special", "常规增强改性" to "reinforced", "低附加值通用料" to "general")
private fun competitionLabels() = mapOf("已定点我司 / 独供" to "awarded", "有竞争未定点" to "open", "竞争激烈暂无优势" to "intense", "已失单 / 无望" to "lost")

private fun stageLabel(code: String): String = stageLabels().entries.firstOrNull { it.value == code }?.key.orEmpty()
private fun customerTypeLabel(code: String): String = if (code == "oem") "汽车零部件主机厂" else "非汽车客户"
private fun customerValueLabel(code: String): String = customerValueLabels().entries.firstOrNull { it.value == code }?.key.orEmpty()
private fun materialValueLabel(code: String): String = materialValueLabels().entries.firstOrNull { it.value == code }?.key.orEmpty()
private fun competitionLabel(code: String): String = competitionLabels().entries.firstOrNull { it.value == code }?.key.orEmpty()

private fun workbookHeaderKey(value: String): String = businessNorm(value).replace("（", "(").replace("）", ")").replace(Regex("\\s+"), "")

private fun readWorkbookRows(file: File, preferredSheet: String): List<Pair<Int, List<String>>> {
    require(file.length() in 1..20L * 1024 * 1024) { "XLSX文件须大于0且不超过20MB" }
    ZipFile(file).use { archive ->
        var total = 0L
        archive.entries().asSequence().forEach { entry ->
            require(entry.size >= 0) { "Excel压缩目录无效" }
            total += entry.size
            require(total <= 64L * 1024 * 1024) { "Excel解压后超过64MB" }
        }
    }
    ReadableWorkbook(file).use { workbook ->
        val sheets = workbook.sheets.use { it.iterator().asSequence().toList() }
        val sheet = sheets.firstOrNull { it.name == preferredSheet } ?: sheets.firstOrNull()
            ?: error("Excel没有工作表")
        return sheet.openStream().use { stream ->
            stream.iterator().asSequence().map { row ->
                row.rowNum to (0 until row.cellCount).map { index ->
                    val cell = row.getCell(index)
                    when {
                        cell == null -> ""
                        cell.type == CellType.ERROR -> "#ERROR!"
                        cell.formula != null && cell.rawValue.isNullOrEmpty() -> "#未计算公式"
                        else -> cell.text.orEmpty()
                    }
                }
            }.toList()
        }
    }
}

private fun rewriteProjectWorkbook(projects: List<ProjectProgressRecord>, template: ByteArray): ByteArray {
    require(template.isNotEmpty() && template.size <= 20 * 1024 * 1024) { "项目进度模板文件无效" }
    val output = ByteArrayOutputStream()
    var foundSheet = false
    ZipInputStream(ByteArrayInputStream(template)).use { source ->
        ZipOutputStream(output).use { target ->
            while (true) {
                val entry = source.nextEntry ?: break
                val content = source.readBytes()
                val rewritten = if (entry.name == PROJECT_SHEET_PATH) {
                    foundSheet = true
                    rewriteProjectSheet(content, projects)
                } else content
                target.putNextEntry(ZipEntry(entry.name))
                target.write(rewritten)
                target.closeEntry()
            }
        }
    }
    require(foundSheet) { "项目进度模板缺少项目进度表" }
    return output.toByteArray()
}

private fun rewriteProjectSheet(xml: ByteArray, projects: List<ProjectProgressRecord>): ByteArray {
    val factory = DocumentBuilderFactory.newInstance().apply {
        isNamespaceAware = true
        setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
        setFeature("http://xml.org/sax/features/external-general-entities", false)
        setFeature("http://xml.org/sax/features/external-parameter-entities", false)
    }
    val document = factory.newDocumentBuilder().parse(ByteArrayInputStream(xml))
    val sheetData = document.getElementsByTagNameNS(SPREADSHEET_NS, "sheetData").item(0) as? Element
        ?: error("项目进度模板缺少表格数据区域")
    val originalRows = childElements(sheetData, "row")
    val header = originalRows.firstOrNull { it.getAttribute("r") == "2" }
        ?: error("项目进度模板缺少第2行表头")
    val firstPrototype = originalRows.firstOrNull { it.getAttribute("r") == "8" }
        ?: originalRows.firstOrNull { it.getAttribute("r") == "3" }
        ?: error("项目进度模板缺少可复用的数据行格式")
    val secondPrototype = originalRows.firstOrNull { it.getAttribute("r") == "9" } ?: firstPrototype
    val headerStyle = cellStyle(header, "M2")

    childElements(sheetData, "row").filter { it.getAttribute("r").toIntOrNull()?.let { row -> row > 2 } == true }
        .forEach(sheetData::removeChild)
    header.setAttribute("spans", "1:22")
    PROJECT_PROGRESS_XLSX_HEADERS.forEachIndexed { index, label ->
        if (index >= 13) writeWorkbookCell(header, excelAddress(index + 1, 2), label, headerStyle)
    }

    projects.forEachIndexed { index, project ->
        val rowNumber = index + 3
        val prototype = if (index == 0) firstPrototype else secondPrototype
        val row = prototype.cloneNode(true) as Element
        row.setAttribute("r", rowNumber.toString())
        row.setAttribute("spans", "1:22")
        projectExportValues(project).forEachIndexed { column, value ->
            val address = excelAddress(column + 1, rowNumber)
            val styleColumn = minOf(column + 1, 13)
            val style = if (column + 1 <= 16) cellStyle(prototype, excelAddress(styleColumn, prototype.getAttribute("r").toInt())) else null
            writeWorkbookCell(row, address, value, style, numeric = column + 1 in setOf(9, 18))
        }
        sheetData.appendChild(row)
    }

    (document.getElementsByTagNameNS(SPREADSHEET_NS, "dimension").item(0) as? Element)
        ?.setAttribute("ref", "A1:V${maxOf(2, projects.size + 2)}")
    val columns = document.getElementsByTagNameNS(SPREADSHEET_NS, "cols").item(0) as? Element
        ?: error("项目进度模板缺少列格式")
    childElements(columns, "col").filter { it.getAttribute("min").toIntOrNull()?.let { first -> first > 13 } == true }
        .forEach(columns::removeChild)
    listOf(
        listOf("14", "14", "20", "0"), listOf("15", "15", "28", "0"), listOf("16", "16", "24", "0"),
        listOf("17", "18", "15", "1"), listOf("19", "19", "22", "0"), listOf("20", "22", "24", "0"),
    ).forEach { (first, last, width, hidden) ->
        val col = document.createElementNS(SPREADSHEET_NS, "col")
        col.setAttribute("min", first)
        col.setAttribute("max", last)
        col.setAttribute("width", width)
        col.setAttribute("customWidth", "1")
        if (hidden == "1") col.setAttribute("hidden", "1")
        columns.appendChild(col)
    }
    val merges = document.getElementsByTagNameNS(SPREADSHEET_NS, "mergeCell")
    for (index in 0 until merges.length) {
        val merge = merges.item(index) as? Element ?: continue
        if (merge.getAttribute("ref") == "A1:L1") merge.setAttribute("ref", "A1:V1")
    }
    val serialized = ByteArrayOutputStream()
    TransformerFactory.newInstance().apply {
        setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)
    }.newTransformer().apply {
        setOutputProperty(OutputKeys.ENCODING, "UTF-8")
        setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "no")
    }.transform(DOMSource(document), StreamResult(serialized))
    return serialized.toByteArray()
}

private fun projectExportValues(project: ProjectProgressRecord): List<String> = listOf(
    project.industry, project.customerName, project.material, project.recommendedGrade,
    project.customMaterialValue.ifBlank { materialValueLabel(project.materialValue) }, project.color,
    project.competitor, project.productName, project.stageCode,
    project.customStageLabel.ifBlank { stageLabel(project.stageCode) }, project.nextAction,
    project.milestoneDate, project.notes, customerTypeLabel(project.customerType),
    project.customCustomerValue.ifBlank { customerValueLabel(project.customerValue) },
    project.customCompetition.ifBlank { competitionLabel(project.competition) },
    project.projectId.orEmpty(), project.revision?.toString().orEmpty(), project.customStageLabel,
    project.customCustomerValue, project.customMaterialValue, project.customCompetition,
)

private fun childElements(parent: Element, localName: String): List<Element> =
    (0 until parent.childNodes.length).mapNotNull { parent.childNodes.item(it) as? Element }
        .filter { it.localName == localName }

private fun cellStyle(row: Element, address: String): String? = childElements(row, "c")
    .firstOrNull { it.getAttribute("r") == address }?.getAttribute("s")?.takeIf(String::isNotBlank)

private fun writeWorkbookCell(row: Element, address: String, value: String, style: String?, numeric: Boolean = false) {
    val existing = childElements(row, "c").firstOrNull { it.getAttribute("r") == address }
    val cell = existing ?: row.ownerDocument.createElementNS(SPREADSHEET_NS, "c").also { created ->
        val targetColumn = address.takeWhile(Char::isLetter)
        val targetIndex = targetColumn.fold(0) { total, char -> total * 26 + char.code - 'A'.code + 1 }
        val next = childElements(row, "c").firstOrNull { current ->
            current.getAttribute("r").takeWhile(Char::isLetter)
                .fold(0) { total, char -> total * 26 + char.code - 'A'.code + 1 } > targetIndex
        }
        row.insertBefore(created, next)
    }
    while (cell.attributes.length > 0) {
        val attribute = cell.attributes.item(0)
        cell.removeAttribute(attribute.nodeName)
    }
    cell.setAttribute("r", address)
    style?.let { cell.setAttribute("s", it) }
    while (cell.hasChildNodes()) cell.removeChild(cell.firstChild)
    if (value.isEmpty()) return
    if (numeric) {
        cell.setAttribute("t", "n")
        row.ownerDocument.createElementNS(SPREADSHEET_NS, "v").also { it.textContent = value }.let(cell::appendChild)
    } else {
        cell.setAttribute("t", "inlineStr")
        val inline = row.ownerDocument.createElementNS(SPREADSHEET_NS, "is")
        val text = row.ownerDocument.createElementNS(SPREADSHEET_NS, "t").apply {
            textContent = value
            if (value.firstOrNull()?.isWhitespace() == true || value.lastOrNull()?.isWhitespace() == true) {
                setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve")
            }
        }
        inline.appendChild(text)
        cell.appendChild(inline)
    }
}

private fun excelAddress(column: Int, row: Int): String = "${excelColumn(column)}$row"

internal fun simpleWorkbook(sheetName: String, headers: List<String>, rows: List<List<String>>): ByteArray {
    val output = ByteArrayOutputStream()
    ZipOutputStream(output).use { zip ->
        val sheetRows = buildList {
            add(headers)
            addAll(rows)
        }.mapIndexed { index, values ->
            val cells = values.mapIndexed { column, value ->
                val address = "${excelColumn(column + 1)}${index + 1}"
                if (value.isBlank()) "" else "<c r=\"$address\" t=\"inlineStr\"><is><t>${xmlEscape(value)}</t></is></c>"
            }.joinToString("")
            "<row r=\"${index + 1}\">$cells</row>"
        }.joinToString("")
        val worksheet = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><dimension ref=\"A1:${excelColumn(headers.size)}${rows.size + 1}\"/><sheetData>$sheetRows</sheetData></worksheet>"
        val workbook = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"${xmlEscape(sheetName)}\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>"
        val contentTypes = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>"
        val rootRels = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>"
        val workbookRels = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>"
        listOf(
            "[Content_Types].xml" to contentTypes,
            "_rels/.rels" to rootRels,
            "xl/workbook.xml" to workbook,
            "xl/_rels/workbook.xml.rels" to workbookRels,
            "xl/worksheets/sheet1.xml" to worksheet,
        ).forEach { (name, content) ->
            zip.putNextEntry(ZipEntry(name))
            zip.write(content.toByteArray(Charsets.UTF_8))
            zip.closeEntry()
        }
    }
    return output.toByteArray()
}

private fun excelColumn(value: Int): String {
    var index = value
    var result = ""
    while (index > 0) {
        val remainder = (index - 1) % 26
        result = ('A'.code + remainder).toChar() + result
        index = (index - 1) / 26
    }
    return result
}

private fun xmlEscape(value: String): String = value
    .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    .replace("\"", "&quot;").replace("'", "&apos;")
