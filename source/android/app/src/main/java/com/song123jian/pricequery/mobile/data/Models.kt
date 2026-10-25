package com.song123jian.pricequery.mobile.data

import java.math.BigDecimal
import java.text.Normalizer
import java.time.LocalDate
import java.util.Locale
import java.util.UUID

const val DEFAULT_PROJECT_URL = "https://saodtwnvbanjlkwwivcb.supabase.co"
const val USERNAME_DOMAIN = "price-manager.invalid"
val TAX_TYPES = listOf("含税", "未税", "未注明")

data class MobileConfig(val projectUrl: String, val publishableKey: String)

data class MobileSession(
    val userId: String,
    val username: String,
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Long,
)

data class MesCredentials(val username: String, val password: String)

data class QuoteRecord(
    val id: String,
    val customer: String,
    val grade: String,
    val material: String,
    val color: String,
    val price: String,
    val taxType: String,
    val effectiveDate: String,
    val note: String,
    val reason: String,
    val sourceType: String,
    val customerRevision: String,
    val historyCount: Int,
    val futureCount: Int,
    val previousPrice: String?,
    val delta: String?,
    val scheduled: Boolean,
    val stale: Boolean,
    val ageDays: Int,
    val isCurrent: Boolean = false,
    val identity: String = "",
    val customerKey: String = "",
    val sourceFile: String = "",
    val sourceSheet: String = "",
    val sourceRow: Int = 0,
    val importKey: String = "",
    val createdAt: String = "",
    val previousDate: String? = null,
    val previousSourceType: String? = null,
)

data class CustomerRecord(
    val customerKey: String,
    val displayName: String,
    val revision: String,
    val specs: Int,
    val records: Int,
    val status: String = "active",
    val deletedAt: String? = null,
    val deletedReason: String = "",
    val futureRecords: Int = 0,
)

data class CustomerDetail(
    val customer: CustomerRecord,
    val items: List<QuoteRecord>,
    val specs: Int,
    val records: Int,
    val futureRecords: Int,
)

data class QuoteFilters(
    val customer: String = "",
    val query: String = "",
    val material: String = "",
    val tax: String = "",
    val dateFrom: String = "",
    val dateTo: String = "",
    val staleOnly: Boolean = false,
)

enum class QuoteSortField(val label: String) {
    CUSTOMER("客户"), GRADE("牌号"), MATERIAL("材料"), COLOR("颜色"), PRICE("价格"), TAX("税口径"), DATE("更新日期"), NOTE("备注"),
}

fun sortQuotes(quotes: List<QuoteRecord>, field: QuoteSortField, ascending: Boolean): List<QuoteRecord> {
    val comparator = when (field) {
        QuoteSortField.CUSTOMER -> compareBy<QuoteRecord> { it.customer }
        QuoteSortField.GRADE -> compareBy { it.grade }
        QuoteSortField.MATERIAL -> compareBy { it.material }
        QuoteSortField.COLOR -> compareBy { it.color }
        QuoteSortField.PRICE -> compareBy { it.price.toBigDecimalOrNull() ?: BigDecimal.ZERO }
        QuoteSortField.TAX -> compareBy { it.taxType }
        QuoteSortField.DATE -> compareBy { it.effectiveDate }
        QuoteSortField.NOTE -> compareBy { it.note }
    }
    return quotes.sortedWith(if (ascending) comparator else comparator.reversed())
}

data class SyncMeta(
    val dataVersion: String,
    val schemaEpoch: String,
    val businessDate: String,
    val serverTime: String,
) {
    fun sameVersion(other: SyncMeta?): Boolean = other != null &&
        dataVersion == other.dataVersion && schemaEpoch == other.schemaEpoch && businessDate == other.businessDate
}

data class MobileSnapshot(
    val ownerId: String,
    val meta: SyncMeta,
    val customers: List<CustomerRecord>,
    val quotes: List<QuoteRecord>,
)

data class QuoteHistoryPage(
    val meta: SyncMeta,
    val identity: String,
    val items: List<QuoteRecord>,
    val hasMore: Boolean,
    val nextCursor: String?,
)

data class QuoteDraft(
    val customer: String = "",
    val grade: String = "",
    val material: String = "",
    val color: String = "",
    val price: String = "",
    val taxType: String = "含税",
    val effectiveDate: String = "",
    val note: String = "",
    val reason: String = "",
) {
    companion object {
        fun fromQuote(quote: QuoteRecord) = QuoteDraft(
            customer = quote.customer,
            grade = quote.grade,
            material = quote.material,
            color = quote.color,
            price = quote.price,
            taxType = quote.taxType,
            effectiveDate = quote.effectiveDate,
            note = quote.note,
        )
    }
}

data class PendingQuoteSave(
    val ownerId: String,
    val requestId: String,
    val baseId: String?,
    val customerRevision: String,
    val draft: QuoteDraft,
    val imageSource: ImageQuoteSource? = null,
    val historyKeys: List<QuoteHistoryKey> = emptyList(),
)

data class ImageQuoteSource(val file: String, val sheet: String = "图片识别", val row: Int)

data class QuoteHistoryKey(val id: String, val importKey: String?)

fun needsIdentityFill(base: QuoteRecord, draft: QuoteDraft): Boolean =
    quoteIdentity(base.customer, base.grade, base.color, base.taxType) !=
        quoteIdentity(draft.customer.trim(), draft.grade.trim(), draft.color.trim(), draft.taxType)

fun validateIdentityFill(base: QuoteRecord, draft: QuoteDraft): String? {
    if (draft.customer.trim() != base.customer || draft.grade.trim() != base.grade) return "补齐规格时不能更改客户或牌号"
    if (base.color.isNotBlank() && draft.color.trim() != base.color) return "只能补齐原来空白的颜色"
    if (base.taxType != "未注明" && draft.taxType != base.taxType) return "只能补齐原来未注明的税口径"
    if (draft.taxType !in TAX_TYPES) return "请选择有效税口径"
    if (!needsIdentityFill(base, draft)) return "没有需要补齐的颜色或税口径"
    return null
}

data class MobileSaveResult(
    val requestId: String,
    val savedId: String,
    val message: String,
    val meta: SyncMeta,
)

data class ApiResult<T>(val session: MobileSession, val value: T)

fun normalizeSearch(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFKC)
    .replace(Regex("\\s+"), " ")
    .trim()
    .uppercase(Locale.ROOT)

fun validateQuoteFilters(filters: QuoteFilters): String? {
    val from = filters.dateFrom.trim()
    val to = filters.dateTo.trim()
    val fromDate = if (from.isBlank()) null else runCatching { LocalDate.parse(from) }.getOrNull()
    val toDate = if (to.isBlank()) null else runCatching { LocalDate.parse(to) }.getOrNull()
    if (from.isNotBlank() && fromDate == null || to.isNotBlank() && toDate == null) {
        return "日期须为 YYYY-MM-DD"
    }
    if (fromDate != null && toDate != null && fromDate > toDate) return "开始日期不能晚于结束日期"
    if (filters.tax.isNotBlank() && filters.tax !in TAX_TYPES) return "税口径无效"
    return null
}

fun filterQuotes(quotes: List<QuoteRecord>, filters: QuoteFilters): List<QuoteRecord> {
    val customer = normalizeSearch(filters.customer)
    val term = normalizeSearch(filters.query)
    val start = filters.dateFrom.trim().takeIf(String::isNotBlank)
    val end = filters.dateTo.trim().takeIf(String::isNotBlank)
    return quotes.filter { quote ->
        val searchable = normalizeSearch(listOf(quote.grade, quote.material, quote.color, quote.note).joinToString(" "))
        (customer.isBlank() || normalizeSearch(quote.customer).contains(customer)) &&
            (term.isBlank() || searchable.contains(term)) &&
            (filters.material.isBlank() || quote.material == filters.material) &&
            (filters.tax.isBlank() || quote.taxType == filters.tax) &&
            (start == null || quote.effectiveDate >= start) &&
            (end == null || quote.effectiveDate <= end) &&
            (!filters.staleOnly || (!quote.scheduled && quote.ageDays > 60))
    }
}

private fun csvCell(value: String): String =
    if (value.any { it == ',' || it == '"' || it == '\n' || it == '\r' }) {
        "\"${value.replace("\"", "\"\"")}\""
    } else value

fun quotesCsv(rows: List<QuoteRecord>, history: Boolean): String {
    val columns = if (history) {
        listOf(
            "客户" to { row: QuoteRecord -> row.customer },
            "牌号" to { row: QuoteRecord -> row.grade },
            "材料类别" to { row: QuoteRecord -> row.material },
            "颜色" to { row: QuoteRecord -> row.color },
            "价格(元/kg)" to { row: QuoteRecord -> row.price },
            "税口径" to { row: QuoteRecord -> row.taxType },
            "更新日期" to { row: QuoteRecord -> row.effectiveDate },
            "备注" to { row: QuoteRecord -> row.note },
            "调价原因" to { row: QuoteRecord -> row.reason },
            "录入时间" to { row: QuoteRecord -> row.createdAt },
            "来源文件" to { row: QuoteRecord -> row.sourceFile },
            "来源工作表" to { row: QuoteRecord -> row.sourceSheet },
            "来源行" to { row: QuoteRecord -> row.sourceRow.toString() },
        )
    } else {
        listOf(
            "客户" to { row: QuoteRecord -> row.customer },
            "牌号" to { row: QuoteRecord -> row.grade },
            "材料类别" to { row: QuoteRecord -> row.material },
            "颜色" to { row: QuoteRecord -> row.color },
            "价格(元/kg)" to { row: QuoteRecord -> row.price },
            "税口径" to { row: QuoteRecord -> row.taxType },
            "更新日期" to { row: QuoteRecord -> row.effectiveDate },
            "备注" to { row: QuoteRecord -> row.note },
            "报价状态" to { row: QuoteRecord -> if (row.scheduled) "待生效" else "当前报价" },
            "历史记录数" to { row: QuoteRecord -> row.historyCount.toString() },
        )
    }
    return buildString {
        append(columns.joinToString(",") { csvCell(it.first) }).append('\n')
        rows.forEach { row ->
            append(columns.joinToString(",") { csvCell(it.second(row)) }).append('\n')
        }
    }
}

fun customerDetailCsv(detail: CustomerDetail): String {
    val columns = listOf(
        "客户" to { _: QuoteRecord -> detail.customer.displayName },
        "牌号" to { row: QuoteRecord -> row.grade },
        "颜色" to { row: QuoteRecord -> row.color },
        "税口径" to { row: QuoteRecord -> row.taxType },
        "价格(元/kg)" to { row: QuoteRecord -> row.price },
        "业务日期" to { row: QuoteRecord -> row.effectiveDate },
        "材料" to { row: QuoteRecord -> row.material },
        "备注 / 原因" to { row: QuoteRecord -> listOf(row.note, row.reason).filter(String::isNotBlank).joinToString(" / ") },
        "来源" to { row: QuoteRecord -> listOf(row.sourceFile, row.sourceSheet, row.sourceRow.takeIf { it > 0 }?.toString()).filterNotNull().filter(String::isNotBlank).joinToString(" / ") },
    )
    return buildString {
        append(columns.joinToString(",") { csvCell(it.first) }).append('\n')
        detail.items.forEach { row ->
            append(columns.joinToString(",") { csvCell(it.second(row)) }).append('\n')
        }
    }
}

fun retainPendingSave(submitted: Boolean, isRetry: Boolean, failure: Throwable): Boolean =
    submitted && (isRetry || (failure as? ApiFailure)?.uncertain != false)

fun newRequestId(): String = UUID.randomUUID().toString()

fun validateDraft(draft: QuoteDraft, isUpdate: Boolean): String? {
    if (draft.customer.trim().isEmpty() || draft.customer.length > 250) return "请输入有效客户名称"
    if (draft.grade.trim().isEmpty() || draft.grade.length > 250) return "请输入有效牌号"
    if (draft.material.length > 250 || draft.color.length > 250) return "材料或颜色内容过长"
    if (draft.note.length > 2000 || draft.reason.length > 1000) return "备注或调价原因过长"
    if (isUpdate && draft.reason.trim().isEmpty()) return "请输入本次调价原因"
    if (draft.taxType !in TAX_TYPES) return "请选择税口径"
    if (!Regex("[0-9]+(?:\\.[0-9]{1,6})?").matches(draft.price.trim())) return "价格须为正数，最多保留 6 位小数"
    val price = runCatching { BigDecimal(draft.price.trim()) }.getOrNull() ?: return "价格格式无效"
    if (price <= BigDecimal.ZERO || price > BigDecimal("1000000000")) return "价格须大于 0 且不超过 10 亿元/kg"
    val date = runCatching { LocalDate.parse(draft.effectiveDate.trim()) }.getOrNull() ?: return "日期须为 YYYY-MM-DD"
    if (date.year !in 1900..2200) return "日期年份须在 1900 至 2200 年之间"
    return null
}
