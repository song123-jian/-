package com.song123jian.pricequery.mobile.data

import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.math.BigDecimal
import java.net.HttpCookie
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class InventoryResult(
    val query: String,
    val mode: String,
    val page: Int,
    val total: Int,
    val rows: List<Map<String, String>>,
    val queriedAt: String,
) {
    val pages: Int get() = maxOf(1, ((total.toLong() + 99) / 100).toInt())
}

internal fun parseInventoryTotalCount(value: Any?): Int {
    val total = when (value) {
        is Int -> value.takeIf { it >= 0 }
        is Long -> value.takeIf { it in 0L..Int.MAX_VALUE.toLong() }?.toInt()
        else -> null
    }
    return total ?: error("MES分页计数无效")
}

internal fun inventoryPageIsConsistent(total: Int, page: Int, rowCount: Int): Boolean {
    if (total < 0 || page < 1 || rowCount !in 0..100 || rowCount > total) return false
    val firstRow = (page.toLong() - 1L) * 100L
    return rowCount == 0 || total.toLong() >= firstRow + rowCount
}

data class InventoryQuantitySummary(
    val unit: String?,
    val stock: BigDecimal,
    val available: BigDecimal?,
    val missingQuantity: Boolean,
)

fun inventoryQuantitySummaries(result: InventoryResult): List<InventoryQuantitySummary> {
    if (result.rows.isEmpty()) return emptyList()
    if (result.mode == "reserve") {
        return listOf(InventoryQuantitySummary(
            unit = null,
            stock = sumInventoryField(result.rows, "备货数量"),
            available = null,
            missingQuantity = result.rows.any { it["备货数量"].isNullOrEmpty() },
        ))
    }
    return result.rows.groupBy { it["单位"].orEmpty().ifEmpty { "未注明单位" } }.map { (unit, rows) ->
        InventoryQuantitySummary(
            unit = unit,
            stock = sumInventoryField(rows, "库存数量"),
            available = sumInventoryField(rows, "可用数量"),
            missingQuantity = rows.any { it["库存数量"].isNullOrEmpty() || it["可用数量"].isNullOrEmpty() },
        )
    }
}

private fun sumInventoryField(rows: List<Map<String, String>>, key: String): BigDecimal =
    rows.fold(BigDecimal.ZERO) { total, row ->
        val value = row[key]
        if (value.isNullOrEmpty()) total else total + (value.toBigDecimalOrNull() ?: error("MES返回的库存数量格式无效"))
    }

class MesClient {
    @Volatile private var epoch = 0
    @Volatile var loggedIn = false
        private set
    private val cookies = mutableMapOf<String, HttpCookie>()
    private var units = emptyMap<String, String>()
    private var depots = emptyMap<String, String>()

    @Synchronized fun logout() {
        epoch++
        cookies.clear()
        units = emptyMap()
        depots = emptyMap()
        loggedIn = false
    }

    fun login(username: String, password: String) {
        require(username.isNotBlank() && username.length <= 120 && password.isNotEmpty() && password.length <= 256) { "请输入有效的 MES 账号和密码" }
        require((username + password).none { it.code < 32 }) { "MES账号或密码包含无效字符" }
        logout()
        val attempt = epoch
        try {
            request("GET", "Login/LogOn", emptyList(), attempt, false)
            val result = request("POST", "Login/LogOn", listOf("Username" to username.trim(), "Password" to password,
                "Language" to "zh-CN", "Language" to "None", "IbtnEnter" to ""), attempt, false)
            require(result.status == 302 && URI(BASE).resolve(result.location).toString() == BASE) { "MES登录失败，请核对MES账号和密码" }
            verifyView("WMS0301", "WH_STOCKQUERY", "WH_STOCKGRID", attempt)
            val readUnits = dictionary(json("POST", "BD_Material/GetKeyValue", listOf("dictType" to "Unit"), attempt), "DATACODE", "DATANAME")
            val readDepots = dictionary(json("POST", "BD_Material/GetAllWareHouseList", emptyList(), attempt), "ROOM", "ROOMNAME")
            synchronized(this) {
                checkEpoch(attempt)
                units = readUnits
                depots = readDepots
                loggedIn = true
            }
        } catch (failure: Exception) {
            synchronized(this) { if (attempt == epoch) logout() }
            throw failure
        }
    }

    fun query(text: String, mode: String, page: Int = 1): InventoryResult {
        require(loggedIn) { "请先登录MES" }
        require(mode in listOf("material_code", "material_name", "reserve") && page in 1..1000000) { "查询方式或页码无效" }
        val value = validateMesQuery(text)
        val reserve = mode == "reserve"
        val attempt = epoch
        if (reserve) verifyView("WMS0305", "VIEW_CLIENTSTOCK", "VIEW_CLIENTSTOCK", attempt)
        val field = if (reserve) "SGBANTCH" else if (mode == "material_name") "MATNAME" else "MATCODE"
        val pattern = if (reserve) mesLiteral(value) else "%${mesLiteral(value)}%"
        val view = if (reserve) "VIEW_CLIENTSTOCK" else "WH_STOCKGRID"
        val params = listOf("CURVIEWID" to view, "VIEWID" to view, field to pattern,
            "querymodels" to JSONArray().put(JSONObject().put("id", field).put("type", "String").put("value", JSONArray().put(pattern))).toString(),
            "page" to page.toString(), "start" to ((page - 1) * 100).toString(), "limit" to "100")
        val response = json("GET", "Query/QuerySqlObjectNew", params, attempt)
        val rows = response.optJSONArray("data")?.objects() ?: error("MES数据格式已变化")
        val total = parseInventoryTotalCount(response.opt("totalCount"))
        require(inventoryPageIsConsistent(total, page, rows.size)) { "MES分页数据不一致，请重新查询" }
        val items = rows.map { row ->
            fun str(key: String): String = if (row.isNull(key)) "" else row.optString(key)
            if (reserve) {
                require(str("SGMATCODE").isNotBlank() && row.has("SGQTY") && str("SGBANTCH").equals(value, true)) { "MES返回了与批号不匹配的备货数据" }
                val depot = str("SGROOM")
                linkedMapOf("牌号" to str("SGMATCODE"), "批号" to str("SGBANTCH"), "备货数量" to quantity(str("SGQTY")),
                    "客户" to str("CGNAME"), "客户编码" to str("CUSTID"), "仓库" to depots.getOrDefault(depot, depot),
                    "质量状态" to str("SGQUASTATE1"), "质量说明" to str("QUADESC"), "销售人员" to str("bussman1"),
                    "销售人员编码" to str("BUSSMAN"), "客户标记" to str("PCLIENTTAG"),
                    "入库日期" to mesDate(str("SGDATE")), "交货日期" to mesDate(str("DILIVERDATE1").ifBlank { str("DILIVERDATE") }))
            } else {
                require(str("MATCODE").isNotBlank() && str(field).contains(value, true) && row.has("SQTY") && row.has("UQTY")) { "MES返回了不匹配或缺少数量的库存数据" }
                val unit = str("UNIT")
                val depot = str("DEPOT")
                linkedMapOf("牌号" to str("MATCODE"), "材料" to str("MATNAME"), "库存数量" to quantity(str("SQTY")),
                    "可用数量" to quantity(str("UQTY")), "单位" to units.getOrDefault(unit, unit), "仓库" to depots.getOrDefault(depot, depot),
                    "仓库编码" to depot, "库位" to str("SITE"), "批号" to str("BANTCHSN"), "客户编码" to str("CUSTID"),
                    "入库日期" to mesDate(str("STOCKDATE")), "更新日期" to mesDate(str("UPDATETIME")))
            }
        }
        checkEpoch(attempt)
        return InventoryResult(value, mode, page, total, items, java.time.LocalTime.now().withNano(0).toString())
    }

    private fun verifyView(page: String, config: String, view: String, attempt: Int) {
        val definition = json("POST", "Main/GetPage", listOf("pgcode" to page), attempt)
        require(definition.optString("SYSID") == page && definition.optString("CONFIGARGU") == config) { "该MES账号未开放此查询权限" }
        val details = json("POST", "Main/GetView", listOf("viewID" to view), attempt).optJSONObject("viewdef")
        require(details != null && details.optString("viewID") == view && details.optString("storeUrl").trimStart('/') == "Query/QuerySqlObjectNew" && details.opt("allowEdit") == false) { "MES只读页面配置已变化，请联系管理员" }
    }

    private fun dictionary(value: JSONObject, code: String, name: String): Map<String, String> =
        (value.optJSONArray("datas") ?: error("MES字典格式无效")).objects().filter { !it.isNull(code) }
            .associate { it.getString(code) to it.optString(name, it.getString(code)) }

    private fun quantity(value: String): String {
        if (value.isBlank()) return ""
        val number = value.toBigDecimalOrNull() ?: error("MES库存数量格式无效")
        require(number.abs() <= BigDecimal("1e15")) { "MES库存数量超出范围" }
        return number.stripTrailingZeros().toPlainString()
    }

    private fun mesDate(value: String): String {
        val milliseconds = Regex("/Date\\((-?[0-9]+)(?:[+-][0-9]+)?\\)/").matchEntire(value)?.groupValues?.get(1)?.toLongOrNull()
        return if (milliseconds != null) Instant.ofEpochMilli(milliseconds).atZone(ZoneId.of("Asia/Shanghai")).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")) else value
    }

    private data class Response(val status: Int, val location: String, val bytes: ByteArray)

    private fun json(method: String, path: String, data: List<Pair<String, String>>, attempt: Int): JSONObject {
        val response = request(method, path, data, attempt, true)
        return runCatching { JSONObject(String(response.bytes, Charsets.UTF_8)) }.getOrElse { error("MES响应不是有效数据，请重新登录或联系管理员") }
    }

    private fun request(method: String, path: String, data: List<Pair<String, String>>, attempt: Int, authenticated: Boolean): Response {
        checkEpoch(attempt)
        require((method to path) in ALLOWED) { "不允许的MES操作" }
        val encoded = data.joinToString("&") { (key, value) -> "${encode(key)}=${encode(value)}" }
        val target = BASE + path + if (method == "GET" && data.isNotEmpty()) "?$encoded" else ""
        val uri = URI(target)
        require(uri.scheme == "http" && uri.host == "mes.njjulong.cn" && uri.port == 8081 && uri.userInfo == null) { "MES地址不受允许" }
        val connection = (URL(target).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            instanceFollowRedirects = false
            connectTimeout = 10000
            readTimeout = 20000
            useCaches = false
            setRequestProperty("User-Agent", "PriceManager-Android/1.1")
            setRequestProperty("X-Requested-With", "XMLHttpRequest")
            val cookie = synchronized(this@MesClient) { cookies.values.filter { !it.hasExpired() && uri.path.startsWith(it.path ?: "/") }.joinToString("; ") { "${it.name}=${it.value}" } }
            if (cookie.isNotEmpty()) setRequestProperty("Cookie", cookie)
            if (method == "POST") { doOutput = true; setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8") }
        }
        try {
            if (method == "POST") connection.outputStream.use { it.write(encoded.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            synchronized(this) {
                checkEpoch(attempt)
                connection.headerFields.filterKeys { it.equals("Set-Cookie", true) }.values.flatten().forEach { header ->
                    HttpCookie.parse(header).forEach { cookie ->
                        if (cookie.domain == null || cookie.domain.trimStart('.').equals("mes.njjulong.cn", true)) cookies[cookie.name] = cookie
                    }
                }
            }
            if (authenticated && status in 300..399) {
                logout()
                error("MES会话已过期，请重新登录")
            }
            require(status in 200..399) { "MES请求失败（$status）" }
            val bytes = connection.inputStream.use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    require(output.size() + count <= 8 * 1024 * 1024) { "MES响应超过8MB" }
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
            checkEpoch(attempt)
            return Response(status, connection.getHeaderField("Location").orEmpty(), bytes)
        } catch (_: IOException) {
            error("MES网络连接失败，请检查网络后重试")
        } finally { connection.disconnect() }
    }

    private fun checkEpoch(attempt: Int) { check(attempt == epoch) { "MES操作已取消" } }
    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")

    companion object {
        private const val BASE = "http://mes.njjulong.cn:8081/"
        private val ALLOWED = setOf("GET" to "Login/LogOn", "POST" to "Login/LogOn", "POST" to "Main/GetPage", "POST" to "Main/GetView",
            "POST" to "BD_Material/GetKeyValue", "POST" to "BD_Material/GetAllWareHouseList", "GET" to "Query/QuerySqlObjectNew")
    }
}
