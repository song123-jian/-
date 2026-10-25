package com.song123jian.pricequery.mobile.data

import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.math.RoundingMode
import java.security.MessageDigest
import java.text.Normalizer
import java.time.LocalDate
import java.util.Locale
import java.util.UUID

fun businessNorm(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFKC)
    .replace(Regex("[\\s\\p{Z}\\u0085]+"), " ").trim().uppercase(Locale.ROOT)

fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

// Desktop identity hashes use Python's default JSON separators, including spaces.
fun desktopJsonStrings(parts: List<String>): String = parts.joinToString(", ", "[", "]") { value ->
    buildString {
        append('"')
        value.forEach { character ->
            append(when (character) {
                '"' -> "\\\""
                '\\' -> "\\\\"
                '\b' -> "\\b"
                '\u000C' -> "\\f"
                '\n' -> "\\n"
                '\r' -> "\\r"
                '\t' -> "\\t"
                else -> if (character.code < 32) "\\u%04x".format(character.code) else character.toString()
            })
        }
        append('"')
    }
}

fun quoteIdentity(customer: String, grade: String, color: String, tax: String): String =
    sha256(desktopJsonStrings(listOf(customer, grade, color, tax).map(::businessNorm)))

data class ImportRow(
    val customer: String,
    val grade: String,
    val material: String,
    val color: String,
    val price: String,
    val tax: String,
    val date: String,
    val note: String,
    val reason: String,
    val file: String,
    val sheet: String,
    val row: Int,
    val materialSpec: String = "",
) {
    val customerKey: String get() = sha256(businessNorm(customer))
    val identity: String get() = quoteIdentity(customer, grade, color, tax)
    val importKey: String get() = sha256(desktopJsonStrings(listOf(identity, material, price, date, note, reason)))

    fun json(): JSONObject = JSONObject().put("customer", customer).put("grade", grade)
        .put("material", material).put("color", color).put("price", price).put("tax_type", tax)
        .put("effective_date", date).put("note", note).put("reason", reason)
        .put("source_file", file).put("source_sheet", sheet).put("source_row", row)
        .put("customer_key", customerKey).put("identity", identity).put("import_key", importKey)
}

data class ImportOptions(val customer: String = "", val date: String = LocalDate.now().toString(), val tax: String = "未注明")
data class ImportPreview(
    val rows: List<ImportRow>,
    val errors: List<String>,
    val duplicateCount: Int = 0,
    val updateCount: Int = 0,
    val newCount: Int = 0,
    val revisions: Map<String, String> = emptyMap(),
    val fresh: List<ImportRow> = emptyList(),
    val rowActions: List<String> = emptyList(),
)

data class ImportCustomerState(val customerKey: String, val status: String, val revision: String)

data class ExistingImportQuote(
    val id: Long,
    val customerKey: String,
    val customer: String,
    val grade: String,
    val material: String,
    val color: String,
    val price: String,
    val tax: String,
    val date: String,
    val note: String,
    val reason: String,
    val sourceType: String,
    val file: String,
    val sheet: String,
    val row: Int,
) {
    fun importRow() = ImportRow(customer, grade, material, color, price, tax, date, note, reason, file, sheet, row)
}

fun matchImportRows(
    preview: ImportPreview,
    quoteRows: List<ExistingImportQuote>,
    customerRows: List<ImportCustomerState>,
    selectedCustomer: String,
    cutoffDate: String,
): ImportPreview {
    val customers = customerRows.associateBy { it.customerKey }
    val selectedKey = selectedCustomer.takeIf(String::isNotBlank)?.let { sha256(businessNorm(it)) }
    val selected = selectedKey?.let(customers::get)
    val blockedSelection = selectedKey != null && (selected == null || selected.status != "active")
    val errors = preview.errors.toMutableList()
    val activeQuotes = quoteRows.filter { row ->
        customers[row.customerKey]?.status == "active"
    }
    val groupedQuotes = activeQuotes.map { row ->
        val immediate = row.sourceType in setOf("文件导入", "图片导入", "导入更新")
        Triple(row.importRow(), row.id, immediate || row.date <= cutoffDate)
    }.groupBy { it.first.identity }
    val currentByIdentity = groupedQuotes.mapValues { (_, values) ->
        values.maxWithOrNull(compareBy<Triple<ImportRow, Long, Boolean>> { if (it.third) 1 else 0 }
            .thenBy { it.first.date }.thenBy { it.second })!!.first
    }
    val existing = currentByIdentity.values.toMutableList()
    val knownKeys = activeQuotes.map { it.importRow().importKey }.toMutableSet()
    val knownGroups = currentByIdentity.keys.toMutableSet()
    val actions = mutableListOf<String>()
    val rows = mutableListOf<ImportRow>()
    val fresh = mutableListOf<ImportRow>()
    var duplicates = 0
    var updates = 0

    preview.rows.forEach { original ->
        var row = if (selectedCustomer.isBlank()) original else original.copy(customer = selectedCustomer.trim())
        var failure: String? = when {
            blockedSelection -> "所选客户已不存在或在回收站，请刷新客户目录后重新选择"
            customers[row.customerKey]?.status == "deleted" -> "客户${row.customer}在回收站，请先恢复"
            else -> null
        }
        val lookupCustomer = businessNorm(row.customer)
        val lookupGrade = businessNorm(row.grade)
        var candidates = existing.filter {
            businessNorm(it.customer) == lookupCustomer && businessNorm(it.grade) == lookupGrade &&
                (row.tax == "未注明" || it.tax == row.tax) &&
                (row.color.isBlank() || businessNorm(it.color) == businessNorm(row.color))
        }.distinctBy { it.identity }
        if (failure == null && candidates.size > 1 && row.material.isNotBlank()) {
            val exactMaterial = candidates.filter { businessNorm(it.material) == businessNorm(row.material) }
            if (exactMaterial.isNotEmpty()) candidates = exactMaterial
        }
        if (failure == null && candidates.size > 1) {
            failure = "牌号 ${row.grade} 匹配多个颜色或税口径，请核对后再导入"
        }
        if (failure == null && candidates.size == 1) {
            val previous = candidates.single()
            if (row.material.isNotBlank() && previous.material.isNotBlank() && businessNorm(row.material) != businessNorm(previous.material)) {
                failure = "牌号 ${row.grade} 的产品名称与已有记录冲突，请核对"
            }
            val previousSpec = materialSpec(previous.note)
            val incomingSpec = materialSpec(row.note)
            if (failure == null && previousSpec.isNotBlank() && incomingSpec.isNotBlank() && businessNorm(previousSpec) != businessNorm(incomingSpec)) {
                failure = "牌号 ${row.grade} 的材料规格与已有记录冲突，请核对"
            }
            if (failure == null) {
                row = row.copy(
                    customer = previous.customer,
                    grade = previous.grade,
                    color = previous.color,
                    tax = previous.tax,
                    material = row.material.ifBlank { previous.material },
                    note = row.note.ifBlank { previous.note },
                    reason = previous.reason,
                )
                val explicitNote = row.note.lineSequence().filterNot { it.startsWith("材料规格：") }.joinToString("\n")
                if (explicitNote.isBlank()) {
                    val mergedNote = previous.note.let { old ->
                        if (incomingSpec.isNotBlank() && previousSpec.isBlank()) listOf(old, "材料规格：$incomingSpec").filter(String::isNotBlank).joinToString("\n") else old
                    }
                    row = row.copy(note = mergedNote)
                }
            }
        }
        rows += row
        if (failure != null) {
            errors += "第${original.row}行：$failure"
            actions += "匹配冲突"
            return@forEach
        }
        val duplicate = !knownKeys.add(row.importKey)
        if (duplicate) {
            duplicates++
            actions += "重复跳过"
            return@forEach
        }
        val existed = row.identity in knownGroups
        if (existed) updates++ else knownGroups += row.identity
        actions += if (existed) "更新 / 合并" else "新增牌号"
        fresh += row
        existing += row
    }
    val revisions = fresh.map { it.customerKey }.distinct().associateWith { key ->
        customers[key]?.revision ?: "0"
    }
    return preview.copy(
        rows = rows,
        errors = errors,
        duplicateCount = duplicates,
        updateCount = updates,
        newCount = fresh.size - updates,
        revisions = revisions,
        fresh = fresh,
        rowActions = actions,
    )
}

fun materialSpec(note: String): String = note.lineSequence()
    .firstOrNull { it.startsWith("材料规格：") }
    ?.removePrefix("材料规格：")
    .orEmpty()

fun normalizedPrice(value: String): String {
    val text = value.trim().replace(",", "").removePrefix("￥").removePrefix("¥")
    require(Regex("[0-9]+(?:\\.[0-9]+)?").matches(text)) { "价格须为正数" }
    val price = BigDecimal(text).stripTrailingZeros()
    require(price.signum() > 0 && price <= BigDecimal("1000000000") && price.scale() <= 6) { "价格须大于0、不超过10亿且最多6位小数" }
    return price.toPlainString()
}

fun importDate(value: String, fallback: String, epoch1904: Boolean = false): String {
    val text = value.trim()
    val date = if (text.isBlank()) LocalDate.parse(fallback) else if (Regex("[0-9]+(?:\\.[0-9]+)?").matches(text)) {
        val serial = BigDecimal(text).toLong()
        require(serial in 0..120000) { "Excel 日期无效" }
        val origin = if (epoch1904) LocalDate.of(1904, 1, 1) else LocalDate.of(1899, 12, 30)
        origin.plusDays(serial)
    } else {
        LocalDate.parse(text.substringBefore('T').substringBefore(' ').replace('/', '-').replace('.', '-'))
    }
    require(date.year in 1900..2200) { "日期须在1900至2200年之间" }
    return date.toString()
}

fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }

data class BackupSnapshot(val json: JSONObject) {
    val quotes: List<JSONObject> get() = json.getJSONArray("quotes").objects()
    val customers: List<JSONObject> get() = json.getJSONArray("customers").objects()
    val audit: List<JSONObject> get() = json.getJSONArray("audit").objects()

    init {
        require(json.optInt("schema_version") == 2) { "备份版本不兼容" }
        listOf("quotes", "customers", "audit").forEach { require(json.optJSONArray(it) != null) { "备份缺少 $it" } }
    }
}

val DOCUMENT_PARTY_FIELDS = listOf("name", "address", "representative", "agent", "phone", "fax", "bank", "account")
val DOCUMENT_PARTY_LABELS = listOf("单位名称", "单位地址", "法定代表人", "委托代理人", "电话", "传真", "开户银行", "账号")
val DOCUMENT_SUPPLIER_FIELDS = DOCUMENT_PARTY_FIELDS.map { "seller_$it" } + "email"
val DOCUMENT_TERMS = linkedMapOf(
    "quote_note" to "如项目正式量产原材料高于或低于10%，双方需要重新核价。",
    "quality" to "质量要求按供方材料技术质量标准。",
    "delivery" to "交货地点为供方仓库,供方代办运输。",
    "transport" to "汽配至需方指定地点，供方负责运费。",
    "packaging" to "25KG/袋。",
    "acceptance" to "按条款（二）验收，提出异议期限为收货一周内。异议期内，需方不得批量投料，一经投料，供方将不承担任何经济损失。",
    "breach" to "需方应按约付款，延迟一日承担货款总额万分之三的违约金。",
    "dispute" to "双方协商解决，协商不成，由供方所在地法院诉讼解决。",
    "effective" to "本合同经双方签字或盖章后即生效，传真件具有同等法律效力。",
)
val DOCUMENT_TERM_LABELS = listOf("报价说明", "质量要求技术标准", "交货地点与方式", "运输方式及费用", "包装方式", "验收与异议", "违约责任", "纠纷解决", "生效条件")
val DOCUMENT_PAYMENTS = listOf("款到发货", "月结30天", "月结60天")
val DOCUMENT_ITEM_FIELDS = listOf("name", "model", "price", "note", "manufacturer", "quantity", "delivery")

data class BusinessDocument(
    val kind: String,
    val fields: Map<String, String>,
    val items: List<Map<String, String>>,
    val terms: Map<String, String> = DOCUMENT_TERMS,
    val payment: String = DOCUMENT_PAYMENTS.first(),
) {
    val title: String get() = if (kind == "quotation") "报价单" else "购销合同"
    fun json(): JSONObject = JSONObject().put("schema", 1).put("kind", kind).put("fields", JSONObject(fields))
        .put("items", JSONArray(items.map { JSONObject(it) })).put("terms", JSONObject(terms)).put("payment", payment)

    companion object {
        fun blankItem(): Map<String, String> = DOCUMENT_ITEM_FIELDS.associateWith { "" } +
            mapOf("manufacturer" to "聚隆", "delivery" to "具体交期双方协商")

        fun create(kind: String, quote: QuoteRecord? = null, customer: String = ""): BusinessDocument {
            val today = LocalDate.now().toString()
            val fields = (listOf("date", "recipient", "sender", "subject", "cc", "valid_from", "valid_to", "tax_type", "email", "contract_no", "place") +
                listOf("seller", "buyer").flatMap { party -> DOCUMENT_PARTY_FIELDS.map { "${party}_$it" } }).associateWith { "" } + mapOf(
                "seller_name" to "南京聚隆科技股份有限公司", "seller_address" to "南京高新技术开发区聚龙路8号",
                "buyer_name" to (quote?.customer ?: customer), "date" to today, "valid_from" to today,
                "valid_to" to LocalDate.parse(today).plusDays(30).toString(), "tax_type" to (quote?.taxType ?: "未税"),
                "subject" to "材料报价", "place" to "南京", "contract_no" to "TZJP-${today.replace("-", "")}",
            )
            val item = blankItem() + mapOf("name" to (quote?.material?.ifBlank { "工程塑料" } ?: ""),
                "model" to (quote?.grade ?: ""), "note" to (quote?.note ?: ""),
                "price" to if (kind == "quotation" || quote?.taxType == "含税") quote?.price.orEmpty() else "")
            return BusinessDocument(kind, fields, listOf(item))
        }

        fun fromJson(json: JSONObject): BusinessDocument {
            require(json.getInt("schema") == 1 && json.getString("kind") in listOf("quotation", "contract")) { "单据草稿版本无效" }
            fun values(value: JSONObject): Map<String, String> = value.keys().asSequence().associateWith { value.getString(it) }
            return BusinessDocument(json.getString("kind"), values(json.getJSONObject("fields")),
                json.getJSONArray("items").objects().map(::values), values(json.getJSONObject("terms")), json.getString("payment"))
        }
    }
}

fun checkedSupplierFields(fields: Map<String, String>): Map<String, String> {
    val result = fields.filterKeys { it in DOCUMENT_SUPPLIER_FIELDS }
    require(result.values.all { it.length <= 2000 && it.none { character -> character.code < 32 } }) { "供方信息须为不超过2000字的单行文字" }
    return result
}

fun BusinessDocument.withSupplier(fields: Map<String, String>): BusinessDocument =
    copy(fields = this.fields + checkedSupplierFields(fields))

fun matchingImageQuotes(quotes: List<QuoteRecord>, draft: QuoteDraft): List<QuoteRecord> {
    if (draft.customer.isBlank() || draft.grade.isBlank()) return emptyList()
    val customer = businessNorm(draft.customer)
    val grade = businessNorm(draft.grade)
    return quotes.filter { quote ->
        businessNorm(quote.customer) == customer && businessNorm(quote.grade) == grade &&
            (draft.color.isBlank() || businessNorm(quote.color) == businessNorm(draft.color)) &&
            (draft.taxType == "未注明" || quote.taxType == draft.taxType)
    }.distinctBy { quote ->
        quote.identity.ifBlank { quoteIdentity(quote.customer, quote.grade, quote.color, quote.taxType) }
    }
}

fun imageQuoteMatchError(draft: QuoteDraft, quote: QuoteRecord): String? {
    if (draft.material.isNotBlank() && quote.material.isNotBlank() && businessNorm(draft.material) != businessNorm(quote.material)) {
        return "识别到的产品名称与已有规格冲突，请核对原图"
    }
    val incomingSpec = materialSpec(draft.note)
    val existingSpec = materialSpec(quote.note)
    if (incomingSpec.isNotBlank() && existingSpec.isNotBlank() && businessNorm(incomingSpec) != businessNorm(existingSpec)) {
        return "识别到的材料规格与已有报价冲突，请核对原图"
    }
    return null
}

fun itemAmount(item: Map<String, String>): BigDecimal {
    fun number(key: String): BigDecimal {
        val value = item[key].orEmpty().trim()
        require(Regex("[0-9]{1,9}(?:\\.[0-9]{1,6})?").matches(value)) { "数量及单价须为最多9位整数、6位小数的数字" }
        return BigDecimal(value)
    }
    val quantity = number("quantity")
    require(quantity.signum() > 0) { "数量须大于0" }
    val amount = quantity.multiply(number("price")).setScale(2, RoundingMode.HALF_UP)
    require(amount <= BigDecimal("999999999.99")) { "单项金额不能超过999999999.99元" }
    return amount
}

fun validateDocument(document: BusinessDocument) {
    require(document.kind in listOf("quotation", "contract") && document.items.size in 1..30) { "单据须有1至30项产品" }
    require(document.payment in DOCUMENT_PAYMENTS) { "请选择结算方式" }
    require(document.fields["seller_name"].orEmpty().isNotBlank() && document.fields["buyer_name"].orEmpty().isNotBlank()) { "请填写供方和需方单位名称" }
    importDate(document.fields["date"].orEmpty(), "")
    if (document.kind == "quotation") {
        val from = importDate(document.fields["valid_from"].orEmpty(), "")
        val to = importDate(document.fields["valid_to"].orEmpty(), "")
        require(from <= to) { "报价有效期起始日期不能晚于截止日期" }
        require(document.fields["tax_type"] in listOf("含税", "未税")) { "请确认报价的含税/未税口径" }
    } else require(document.fields["contract_no"].orEmpty().isNotBlank()) { "请填写合同编号" }
    document.items.forEachIndexed { index, item ->
        require(item["name"].orEmpty().isNotBlank() && item["model"].orEmpty().isNotBlank()) { "第${index + 1}项请填写产品名称和规格型号" }
        if (document.kind == "contract") itemAmount(item) else normalizedPrice(item["price"].orEmpty())
        require(item.values.all { it.length <= 1000 }) { "产品字段内容过长" }
    }
    require(document.fields.values.all { it.length <= 1000 } && document.terms.values.all { it.length <= 3000 }) { "单据字段内容过长" }
}

fun validateMesQuery(value: String): String {
    require(value.isNotBlank() && value.trim().length <= 120 && value.none { it.code < 32 || it.code == 127 }) { "查询文本须为1至120个字符" }
    require(value.none { it in "'\";\\`" } && listOf("--", "/*", "*/").none { value.contains(it) }) { "查询文本包含不支持的引号或分隔符" }
    return value.trim()
}

fun mesLiteral(value: String): String = validateMesQuery(value).map { when (it) { '[' -> "[[]"; '%' -> "[%]"; '_' -> "[_]"; else -> it.toString() } }.joinToString("")

fun rmbUpper(value: BigDecimal): String {
    val amount = value.setScale(2, RoundingMode.HALF_UP)
    require(amount.signum() >= 0 && amount < BigDecimal("1000000000000")) { "人民币金额须在0至一万亿元之间" }
    val digits = "零壹贰叁肆伍陆柒捌玖"
    val cents = amount.movePointRight(2).longValueExact()
    val integer = cents / 100
    val groups = mutableListOf<Long>()
    var working = integer
    while (working > 0) { groups.add(working % 10000); working /= 10000 }
    var text = ""
    var gap = false
    for (index in groups.indices.reversed()) {
        val group = groups[index]
        if (group == 0L) { if (text.isNotEmpty()) gap = true; continue }
        if (text.isNotEmpty() && (gap || group < 1000)) text += "零"
        var block = ""
        var zero = false
        group.toString().padStart(4, '0').toList().zip(listOf("仟", "佰", "拾", "")).forEach { (digit, unit) ->
            val number = digit.digitToInt()
            if (number > 0) {
                if (zero && block.isNotEmpty()) block += "零"
                block += "${digits[number]}$unit"
                zero = false
            } else if (block.isNotEmpty()) zero = true
        }
        text += block + listOf("", "万", "亿")[index]
        gap = false
    }
    text = text.ifEmpty { "零" } + "元"
    val jiao = ((cents % 100) / 10).toInt()
    val fen = (cents % 10).toInt()
    if (jiao > 0) text += "${digits[jiao]}角"
    if (fen > 0) { if (jiao == 0 && integer > 0) text += "零"; text += "${digits[fen]}分" }
    return if (cents % 100 == 0L) text + "整" else text
}

data class CustomerProfile(
    val profileId: String? = null,
    val revision: Int? = null,
    val name: String = "",
    val contact: String = "",
    val phone: String = "",
    val industry: String = "",
    val address: String = "",
    val notes: String = "",
)

private val CUSTOMER_PROFILE_LIMITS = mapOf(
    "name" to 240, "contact" to 120, "phone" to 80, "industry" to 120, "address" to 500, "notes" to 2000,
)

fun normalizeCustomerProfile(profile: CustomerProfile): CustomerProfile {
    profile.profileId?.takeIf { it.isNotBlank() }?.let { require(runCatching { UUID.fromString(it) }.isSuccess) { "客户编号无效，请重新读取客户资料" } }
    require(profile.revision == null || profile.revision > 0) { "客户资料版本无效，请刷新后重试" }
    val values = mapOf(
        "name" to profile.name.trim(), "contact" to profile.contact.trim(), "phone" to profile.phone.trim(),
        "industry" to profile.industry.trim(), "address" to profile.address.trim(), "notes" to profile.notes.trim(),
    )
    values.forEach { (field, value) ->
        require(value.length <= CUSTOMER_PROFILE_LIMITS.getValue(field)) { "客户${field}超过允许长度" }
        require(value.none { it.code < 32 && it !in "\n\r\t" }) { "客户资料包含不可见字符" }
    }
    return profile.copy(
        profileId = profile.profileId?.trim()?.ifBlank { null },
        name = values.getValue("name"), contact = values.getValue("contact"), phone = values.getValue("phone"),
        industry = values.getValue("industry"), address = values.getValue("address"), notes = values.getValue("notes"),
    )
}

fun CustomerProfile.toJson(): JSONObject = JSONObject().apply {
    put("profile_id", profileId ?: JSONObject.NULL)
    put("revision", revision ?: JSONObject.NULL)
    put("name", name).put("contact", contact).put("phone", phone).put("industry", industry)
    put("address", address).put("notes", notes)
}

fun customerProfileFromJson(row: JSONObject): CustomerProfile = normalizeCustomerProfile(
    CustomerProfile(
        profileId = row.optNullableString("profile_id"),
        revision = row.optNullableInt("revision"),
        name = row.optString("name"), contact = row.optString("contact"), phone = row.optString("phone"),
        industry = row.optString("industry"), address = row.optString("address"), notes = row.optString("notes"),
    ),
)

data class TodoItem(
    val id: String? = null,
    val title: String = "",
    val related: String = "",
    val dueDate: String? = null,
    val priority: String = "normal",
    val status: String = "open",
    val category: String = "其他",
    val notes: String = "",
    val owner: String = "",
    val customerId: String? = null,
    val customerName: String = "",
    val projectId: String? = null,
    val projectName: String = "",
    val createdAt: String = "",
    val updatedAt: String = "",
) {
    val completed: Boolean get() = status == "completed"
}

val TODO_STATUSES = linkedMapOf("open" to "未开始", "in_progress" to "进行中", "waiting" to "等待反馈", "completed" to "已完成")
val TODO_PRIORITIES = linkedMapOf("low" to "低", "normal" to "普通", "high" to "高")
val TODO_CATEGORIES = listOf("客户跟进", "送样", "测试/认证", "报价", "定点/量产", "交付", "回款", "其他")

fun normalizeTodo(item: TodoItem): TodoItem {
    val title = item.title.trim()
    val category = item.category.trim().ifBlank { "其他" }
    val owner = item.owner.trim()
    val customerName = item.customerName.trim()
    val projectName = item.projectName.trim()
    val customerId = item.customerId?.trim()?.takeIf(String::isNotBlank)
    val projectId = item.projectId?.trim()?.takeIf(String::isNotBlank)

    require(title.isNotBlank()) { "请填写待办事项" }
    require(title.length <= 240 && item.related.trim().length <= 240 && item.notes.trim().length <= 2000 &&
        category.length <= 60 && owner.length <= 80 && customerName.length <= 240 && projectName.length <= 240) {
        "待办事项或备注超过允许长度"
    }
    require(item.priority in TODO_PRIORITIES) { "待办优先级无效" }
    require(item.status in TODO_STATUSES) { "待办状态无效" }
    item.dueDate?.takeIf { it.isNotBlank() }?.let { LocalDate.parse(it) }
    customerId?.let { require(runCatching { UUID.fromString(it) }.isSuccess) { "关联客户编号无效" } }
    projectId?.let { require(runCatching { UUID.fromString(it) }.isSuccess) { "关联项目编号无效" } }
    return item.copy(
        title = title,
        related = item.related.trim(),
        notes = item.notes.trim(),
        category = category,
        owner = owner,
        customerId = customerId,
        customerName = customerName,
        projectId = projectId,
        projectName = projectName,
    )
}

fun TodoItem.toJson(): JSONObject = JSONObject().apply {
    put("id", id ?: JSONObject.NULL).put("title", title).put("related", related)
    put("due_date", dueDate ?: JSONObject.NULL).put("priority", priority).put("status", status).put("completed", completed)
    put("category", category).put("notes", notes).put("owner", owner)
    put("customer_id", customerId ?: JSONObject.NULL).put("customer_name", customerName)
    put("project_id", projectId ?: JSONObject.NULL).put("project_name", projectName)
    put("created_at", createdAt).put("updated_at", updatedAt)
}

fun todoFromJson(row: JSONObject): TodoItem = normalizeTodo(TodoItem(
    id = row.optNullableString("id"), title = row.optString("title"), related = row.optString("related"),
    dueDate = row.optNullableString("due_date"), priority = row.optString("priority", "normal"),
    status = row.optString("status", if (row.optBoolean("completed")) "completed" else "open"),
    category = row.optString("category", "其他"), notes = row.optString("notes"), owner = row.optString("owner"),
    customerId = row.optNullableString("customer_id"), customerName = row.optString("customer_name"),
    projectId = row.optNullableString("project_id"), projectName = row.optString("project_name"),
    createdAt = row.optString("created_at"), updatedAt = row.optString("updated_at"),
))

fun filterTodos(
    items: List<TodoItem>, query: String = "", status: String = "", category: String = "", priority: String = "",
    due: String = "", today: String = LocalDate.now().toString(),
): List<TodoItem> {
    val needle = businessNorm(query)
    val todayDate = LocalDate.parse(today)
    val priorityOrder = mapOf("high" to 0, "normal" to 1, "low" to 2)
    return items.filter { item ->
        val text = businessNorm(
            listOf(item.title, item.related, item.notes, item.category, item.owner, item.customerName, item.projectName)
                .joinToString(" "),
        )
        val dueDate = item.dueDate?.takeIf(String::isNotBlank)?.let(LocalDate::parse)
        val statusMatches = when (status) {
            "", "all" -> true
            "open" -> !item.completed
            "completed" -> item.completed
            "not_started" -> item.status == "open"
            "today" -> !item.completed && dueDate == todayDate
            "overdue" -> !item.completed && dueDate != null && dueDate < todayDate
            else -> item.status == status
        }
        val dueMatches = when (due) {
            "today" -> !item.completed && dueDate == todayDate
            "overdue" -> !item.completed && dueDate != null && dueDate < todayDate
            else -> true
        }
        (needle.isBlank() || text.contains(needle)) && statusMatches && dueMatches &&
            (category.isBlank() || businessNorm(item.category) == businessNorm(category)) &&
            (priority.isBlank() || item.priority == priority)
    }.sortedWith(
        compareBy<TodoItem> { it.completed }
            .thenBy { it.dueDate ?: "9999-12-31" }
            .thenBy { priorityOrder[it.priority] ?: Int.MAX_VALUE }
            .thenBy { it.id.orEmpty() },
    )
}

data class TodoCounts(val open: Int, val completed: Int, val overdue: Int)

fun countTodos(items: List<TodoItem>, today: String = LocalDate.now().toString()): TodoCounts {
    val todayDate = LocalDate.parse(today)
    val openItems = items.filterNot(TodoItem::completed)
    val completedCount = items.count(TodoItem::completed)
    val overdueCount = openItems.count { item ->
        item.dueDate?.takeIf(String::isNotBlank)?.let(LocalDate::parse)?.isBefore(todayDate) == true
    }
    return TodoCounts(open = openItems.size, completed = completedCount, overdue = overdueCount)
}

data class ProjectProgressRecord(
    val projectId: String? = null,
    val revision: Int? = null,
    val industry: String = "",
    val customerType: String = "",
    val customerName: String = "",
    val material: String = "",
    val recommendedGrade: String = "",
    val materialValue: String = "",
    val color: String = "",
    val competitor: String = "",
    val productName: String = "",
    val stageCode: String = "",
    val customerValue: String = "",
    val competition: String = "",
    val customStageLabel: String = "",
    val customCustomerValue: String = "",
    val customMaterialValue: String = "",
    val customCompetition: String = "",
    val nextAction: String = "",
    val milestoneDate: String = "",
    val notes: String = "",
)

val PROJECT_STAGE_SCORES = mapOf("1" to 6, "2" to 12, "3" to 18, "4" to 24, "5" to 30)
val PROJECT_CUSTOMER_SCORES = mapOf("geely_strategic" to 30, "oem_t1_important" to 22, "oem_t1_regular" to 15, "non_auto" to 8)
val PROJECT_COMPETITION_SCORES = mapOf("awarded" to 20, "open" to 12, "intense" to 8, "lost" to 0)
val PROJECT_MATERIAL_SCORES = mapOf("special" to 20, "reinforced" to 12, "general" to 6)

fun normalizeProjectProgress(record: ProjectProgressRecord): ProjectProgressRecord {
    require(record.industry.isNotBlank() && record.customerName.isNotBlank() && record.material.isNotBlank()) { "请填写行业、客户名称和材料" }
    require(record.customerType in setOf("oem", "non_auto")) { "请选择客户类型" }
    require(record.customerValue in PROJECT_CUSTOMER_SCORES || record.customCustomerValue.isNotBlank()) { "客户战略价值选项无效" }
    require(record.competition in PROJECT_COMPETITION_SCORES || record.customCompetition.isNotBlank()) { "竞争态势选项无效" }
    require(record.materialValue in PROJECT_MATERIAL_SCORES || record.customMaterialValue.isNotBlank()) { "材料价值选项无效" }
    require(record.stageCode in PROJECT_STAGE_SCORES || record.customStageLabel.isNotBlank()) { "项目阶段选项无效" }
    if (record.milestoneDate.isNotBlank()) LocalDate.parse(record.milestoneDate)
    require(record.notes.length <= 4000 && record.nextAction.length <= 1000) { "项目说明超过允许长度" }
    return record.copy(industry = record.industry.trim(), customerName = record.customerName.trim(), material = record.material.trim())
}

data class ProjectScore(val total: Int, val tier: String)

fun scoreProjectProgress(record: ProjectProgressRecord): ProjectScore {
    val total = (if (record.customStageLabel.isBlank()) PROJECT_STAGE_SCORES[record.stageCode] ?: 0 else 0) +
        (if (record.customCustomerValue.isBlank()) PROJECT_CUSTOMER_SCORES[record.customerValue] ?: 0 else 0) +
        (if (record.customCompetition.isBlank()) PROJECT_COMPETITION_SCORES[record.competition] ?: 0 else 0) +
        (if (record.customMaterialValue.isBlank()) PROJECT_MATERIAL_SCORES[record.materialValue] ?: 0 else 0)
    val tier = when { total >= 80 -> "A"; total >= 65 -> "B"; total >= 45 -> "C"; else -> "D" }
    return ProjectScore(total, tier)
}

fun ProjectProgressRecord.toJson(): JSONObject = JSONObject().apply {
    put("project_id", projectId ?: JSONObject.NULL).put("revision", revision ?: JSONObject.NULL)
    put("industry", industry).put("customer_type", customerType).put("customer_name", customerName)
    put("material", material).put("recommended_grade", recommendedGrade).put("material_value", materialValue)
    put("color", color).put("competitor", competitor).put("product_name", productName)
    put("stage_code", stageCode).put("customer_value", customerValue).put("competition", competition)
    put("custom_stage_label", customStageLabel).put("custom_customer_value", customCustomerValue)
    put("custom_material_value", customMaterialValue).put("custom_competition", customCompetition)
    put("next_action", nextAction).put("milestone_date", milestoneDate).put("notes", notes)
}

fun projectFromJson(row: JSONObject): ProjectProgressRecord = normalizeProjectProgress(ProjectProgressRecord(
    projectId = row.optNullableString("project_id"), revision = row.optNullableInt("revision"),
    industry = row.optString("industry"), customerType = row.optString("customer_type"), customerName = row.optString("customer_name"),
    material = row.optString("material"), recommendedGrade = row.optString("recommended_grade"), materialValue = row.optString("material_value"),
    color = row.optString("color"), competitor = row.optString("competitor"), productName = row.optString("product_name"),
    stageCode = row.optString("stage_code"), customerValue = row.optString("customer_value"), competition = row.optString("competition"),
    customStageLabel = row.optString("custom_stage_label"), customCustomerValue = row.optString("custom_customer_value"),
    customMaterialValue = row.optString("custom_material_value"), customCompetition = row.optString("custom_competition"),
    nextAction = row.optString("next_action"), milestoneDate = row.optString("milestone_date"), notes = row.optString("notes"),
))

fun JSONObject.optNullableString(name: String): String? = if (isNull(name)) null else optString(name).takeIf { it.isNotBlank() }
fun JSONObject.optNullableInt(name: String): Int? = if (isNull(name)) null else optInt(name)
