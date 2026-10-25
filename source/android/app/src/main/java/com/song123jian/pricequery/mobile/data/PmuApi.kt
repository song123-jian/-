package com.song123jian.pricequery.mobile.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.math.BigDecimal

class ApiFailure(
    override val message: String,
    val status: Int = 0,
    val code: String = "request_failed",
    val uncertain: Boolean = false,
) : Exception(message)

class PmuApi {
    private val desktopProjects = mutableSetOf<String>()

    fun validateConfig(config: MobileConfig): MobileConfig {
        val uri = runCatching { URI(config.projectUrl.trim().trimEnd('/')) }.getOrNull()
            ?: throw ApiFailure("请输入有效的 Supabase 项目地址", code = "invalid_config")
        if (uri.scheme != "https" || uri.host.isNullOrBlank() || !uri.host.endsWith(".supabase.co") ||
            uri.userInfo != null || uri.port != -1 || uri.path !in listOf("", "/") ||
            uri.query != null || uri.fragment != null
        ) throw ApiFailure("项目地址须为 https://项目编号.supabase.co", code = "invalid_config")
        val key = config.publishableKey.trim()
        if (!Regex("sb_publishable_[A-Za-z0-9_-]+").matches(key) || key.length > 512 || key.contains("replace", ignoreCase = true)) {
            throw ApiFailure("请输入项目的 Publishable key", code = "invalid_config")
        }
        return MobileConfig(uri.toString().trimEnd('/'), key)
    }

    suspend fun login(config: MobileConfig, username: String, password: String): MobileSession = withContext(Dispatchers.IO) {
        val checked = validateConfig(config)
        val account = username.trim().lowercase()
        if (!Regex("[a-z0-9_]{3,32}").matches(account)) throw ApiFailure("账号须为 3 至 32 位字母、数字或下划线", code = "invalid_username")
        if (password.length !in 6..256 || password.any { it.code < 32 }) throw ApiFailure("请输入 6 至 256 位密码", code = "invalid_password")
        val payload = request(
            checked,
            "/auth/v1/token?grant_type=password",
            "POST",
            JSONObject().put("email", "$account@$USERNAME_DOMAIN").put("password", password),
        )
        val session = sessionFromAuth(payload, account)
        val verified = authorizedJson(checked, session, "/api/v1/session")
        if (verified.value.optString("user_id") != verified.session.userId ||
            verified.value.optString("username") != account || !verified.value.optBoolean("enabled", false)
        ) throw ApiFailure("该账号尚未开通或已停用，请联系管理人员", status = 403, code = "member_disabled")
        verified.session
    }

    suspend fun restore(config: MobileConfig, session: MobileSession): ApiResult<String> = withContext(Dispatchers.IO) {
        val result = authorizedJson(validateConfig(config), session, "/api/v1/session")
        val username = result.value.optString("username")
        if (result.value.optString("user_id") != result.session.userId || username != result.session.username ||
            !result.value.optBoolean("enabled", false)
        ) throw ApiFailure("账号已停用或登录身份已变化，请重新登录", status = 403, code = "member_disabled")
        ApiResult(result.session, username)
    }

    suspend fun syncMeta(config: MobileConfig, session: MobileSession): ApiResult<SyncMeta> = withContext(Dispatchers.IO) {
        val response = authorizedJson(validateConfig(config), session, "/api/v1/sync/meta")
        ApiResult(response.session, parseMeta(response.value))
    }

    suspend fun snapshot(config: MobileConfig, session: MobileSession): ApiResult<MobileSnapshot> = withContext(Dispatchers.IO) {
        val response = authorizedJson(validateConfig(config), session, "/api/v1/snapshot")
        ApiResult(response.session, parseSnapshot(response.value))
    }

    suspend fun customerDetails(
        config: MobileConfig,
        session: MobileSession,
        customerKey: String,
    ): ApiResult<CustomerDetail> = withContext(Dispatchers.IO) {
        if (!Regex("[a-f0-9]{64}").matches(customerKey)) {
            throw ApiFailure("客户编号无效", code = "invalid_customer")
        }
        val response = authorizedJson(validateConfig(config), session, "/api/v1/customers/${encode(customerKey)}")
        val ownerId = response.value.optionalString("owner_id")
        if (ownerId != null && ownerId != response.session.userId) {
            throw ApiFailure("云端客户数据与当前登录账号不一致", code = "owner_mismatch")
        }
        ApiResult(response.session, parseCustomerDetail(response.value))
    }

    suspend fun history(
        config: MobileConfig,
        session: MobileSession,
        quoteId: String,
        cursor: String?,
    ): ApiResult<QuoteHistoryPage> = withContext(Dispatchers.IO) {
        val path = buildString {
            append("/api/v1/quotes/").append(encode(quoteId)).append("/history?limit=50")
            if (!cursor.isNullOrEmpty()) append("&cursor=").append(encode(cursor))
        }
        val response = authorizedJson(validateConfig(config), session, path)
        ApiResult(response.session, parseHistory(response.value))
    }

    suspend fun save(
        config: MobileConfig,
        session: MobileSession,
        pending: PendingQuoteSave,
    ): ApiResult<MobileSaveResult> = withContext(Dispatchers.IO) {
        val checked = validateConfig(config)
        val path = pending.baseId?.let { "/api/v1/quotes/${encode(it)}/updates" } ?: "/api/v1/quotes"
        val record = pending.draft.toSaveRecordJson()
        val body = JSONObject()
            .put("request_id", pending.requestId)
            .put("customer_revision", pending.customerRevision)
            .put("record", record)
        pending.imageSource?.let { body.put("image_source", JSONObject()
            .put("file", it.file).put("sheet", it.sheet).put("row", it.row)) }
        if (pending.historyKeys.isNotEmpty()) body.put("history_keys", JSONArray(pending.historyKeys.map { key ->
            JSONObject().put("id", key.id).put("import_key", key.importKey ?: JSONObject.NULL)
        }))
        val requestLimit = if (pending.historyKeys.isEmpty()) 32 * 1024 else 1024 * 1024
        if (body.toString().toByteArray(StandardCharsets.UTF_8).size > requestLimit) {
            throw ApiFailure("报价内容超出请求大小限制", status = 422, code = "validation_error")
        }
        val result = authorizedJson(checked, session, path, "POST", body)
        val value = result.value
        if (value.optString("request_id") != pending.requestId || value.optString("status") != "committed") {
            throw ApiFailure("云端返回的保存确认与原请求不匹配，请按请求编号核对", status = 503, code = "uncertain_save", uncertain = true)
        }
        ApiResult(result.session, MobileSaveResult(
            requestId = value.getString("request_id"),
            savedId = value.getString("saved_id"),
            message = value.optString("message", "报价已保存"),
            meta = parseMeta(value),
        ))
    }

    suspend fun recover(
        config: MobileConfig,
        session: MobileSession,
        pending: PendingQuoteSave,
    ): ApiResult<MobileSaveResult> = withContext(Dispatchers.IO) {
        val requestId = pending.requestId
        if (runCatching { UUID.fromString(requestId) }.isFailure) throw ApiFailure("原请求编号无效", code = "invalid_request_id")
        val body = JSONObject()
            .put("request_id", pending.requestId)
            .put("owner_id", pending.ownerId)
            .put("base_id", pending.baseId ?: JSONObject.NULL)
            .put("customer_revision", pending.customerRevision)
            .put("record", pending.draft.toSaveRecordJson())
        pending.imageSource?.let { body.put("image_source", JSONObject()
            .put("file", it.file).put("sheet", it.sheet).put("row", it.row)) }
        if (pending.historyKeys.isNotEmpty()) body.put("history_keys", JSONArray(pending.historyKeys.map { key ->
            JSONObject().put("id", key.id).put("import_key", key.importKey ?: JSONObject.NULL)
        }))
        val result = authorizedJson(validateConfig(config), session, "/api/v1/requests/${encode(requestId)}", body = body)
        val value = result.value
        if (value.optString("request_id") != requestId || value.optString("status") != "committed") {
            throw ApiFailure("云端没有返回可确认的保存结果", status = 503, code = "uncertain_save", uncertain = true)
        }
        ApiResult(result.session, MobileSaveResult(
            requestId = requestId,
            savedId = value.getString("saved_id"),
            message = value.optString("message", "报价已保存"),
            meta = parseMeta(value),
        ))
    }

    suspend fun logout(config: MobileConfig, session: MobileSession) = withContext(Dispatchers.IO) {
        runCatching { request(validateConfig(config), "/auth/v1/logout?scope=local", "POST", JSONObject(), session.accessToken) }
    }

    suspend fun businessRpc(
        config: MobileConfig,
        session: MobileSession,
        name: String,
        payload: JSONObject,
    ): ApiResult<Any> = withContext(Dispatchers.IO) {
        require(name in setOf(
            "pmu_export_snapshot", "pmu_customer_summaries_v165", "pmu_change_customer", "pmu_import_quotes",
            "pm_customer_profiles_v1", "pm_save_customer_profiles_v1", "pm_project_progress_v2", "pm_save_project_progress_v2",
            "pm_business_document_list_v1", "pm_save_business_document_v1", "pm_delete_business_document_v1",
        ))
        ApiResult(session, requestValue(config, "/rest/v1/rpc/$name", "POST", payload, session.accessToken))
    }

    suspend fun customerAudit(config: MobileConfig, session: MobileSession, requestId: String): ApiResult<JSONArray> =
        withContext(Dispatchers.IO) {
            require(Regex("[a-zA-Z0-9_-]{16,100}").matches(requestId))
            val value = requestValue(config, "/rest/v1/pmu_customer_audit?select=*&request_id=eq.${encode(requestId)}", "GET", accessToken = session.accessToken)
            ApiResult(session, value as? JSONArray ?: throw ApiFailure("客户操作核对响应无效", code = "invalid_response"))
        }

    private fun authorizedJson(
        config: MobileConfig,
        original: MobileSession,
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
    ): ApiResult<JSONObject> {
        val session = refreshIfNeeded(config, original)
        if (config.projectUrl in desktopProjects) {
            return ApiResult(session, desktopRequest(config, session, path, method, body))
        }
        try {
            return ApiResult(session, request(config, "/functions/v1/pmu-mobile$path", method, body, session.accessToken))
        } catch (failure: ApiFailure) {
            // Only session discovery can select the legacy desktop transport; writes never switch on failure.
            if (method != "GET" || path != "/api/v1/session" || failure.code != "gateway_not_deployed") throw failure
            desktopProjects.add(config.projectUrl)
            return ApiResult(session, desktopRequest(config, session, path, method, body))
        }
    }

    private fun desktopRequest(
        config: MobileConfig,
        session: MobileSession,
        path: String,
        method: String,
        body: JSONObject?,
    ): JSONObject {
        fun rpc(name: String, payload: JSONObject = JSONObject()): JSONObject =
            request(config, "/rest/v1/rpc/$name", "POST", payload, session.accessToken)

        if (path == "/api/v1/session" && method == "GET") {
            val user = request(config, "/auth/v1/user", "GET", accessToken = session.accessToken)
            if (user.optString("id") != session.userId) throw ApiFailure("登录身份校验失败", 401, "session_expired")
            val members = requestValue(
                config,
                "/rest/v1/pmu_members?select=user_id,username,enabled&user_id=eq.${encode(session.userId)}",
                "GET",
                accessToken = session.accessToken,
            ) as? JSONArray ?: throw ApiFailure("云端账号响应无效", code = "invalid_response")
            val member = if (members.length() == 1) members.optJSONObject(0) else null
            if (member == null || member.optString("user_id") != session.userId || member.optString("username") != session.username ||
                !member.optBoolean("enabled")
            ) throw ApiFailure("该账号尚未开通或已停用，请联系管理人员", 403, "member_disabled")
            return member
        }
        if (path == "/api/v1/sync/meta" && method == "GET") return rpc("pmu_sync_meta_v1")
        if (path == "/api/v1/snapshot" && method == "GET") {
            val snapshot = rpc("pmu_mobile_snapshot_v1")
            val date = snapshot.getString("business_date")
            snapshot.optJSONArray("quotes")?.let { quotes ->
                for (index in 0 until quotes.length()) {
                    val row = quotes.getJSONObject(index)
                    decorateQuote(row, date)
                    row.put("is_current", !row.optBoolean("scheduled"))
                }
            }
            return snapshot
        }
        val customerDetail = Regex("/api/v1/customers/([a-f0-9]{64})").matchEntire(path)
        if (customerDetail != null && method == "GET") {
            return rpc("pmu_customer_details_v165", JSONObject().put("p_customer_key", customerDetail.groupValues[1]))
        }
        val history = Regex("/api/v1/quotes/([0-9]+)/history\\?limit=50(?:&cursor=(.*))?").matchEntire(path)
        if (history != null && method == "GET") {
            val id = history.groupValues[1]
            val cursor = history.groupValues[2].takeIf { it.isNotEmpty() }?.let {
                JSONObject(java.net.URLDecoder.decode(it, StandardCharsets.UTF_8.name()))
            }
            if (cursor != null && cursor.optString("quote_id") != id) throw ApiFailure("历史页已失效，请从第一页重新读取", 409, "snapshot_changed")
            val snapshot = rpc("pmu_mobile_snapshot_v1")
            val meta = parseMeta(snapshot)
            if (cursor != null && (cursor.optString("data_version") != meta.dataVersion || cursor.optString("schema_epoch") != meta.schemaEpoch || cursor.optString("business_date") != meta.businessDate)) {
                throw ApiFailure("云端报价已变化，请从第一页重新读取", 409, "snapshot_changed")
            }
            val selected = snapshot.optJSONArray("quotes").objects().firstOrNull { it.optString("id") == id }
            val reference = selected ?: run {
                val rows = requestValue(config, "/rest/v1/pmu_quotes?select=identity,customer_key&id=eq.$id", "GET", accessToken = session.accessToken) as? JSONArray
                    ?: throw ApiFailure("报价历史目标响应无效", code = "invalid_response")
                if (rows.length() != 1) throw ApiFailure("该报价不存在或已被删除", 404, "not_found")
                rows.getJSONObject(0)
            }
            val customerKey = reference.optString("customer_key")
            if (snapshot.optJSONArray("customers").objects().none { it.optString("customer_key") == customerKey }) {
                throw ApiFailure("该客户已在回收站，请从回收站查看只读历史", 404, "not_found")
            }
            val identity = reference.getString("identity")
            val current = snapshot.optJSONArray("quotes").objects().firstOrNull { it.optString("identity") == identity }
            val beforeDate = cursor?.optString("before_date")?.takeIf(String::isNotBlank)
            val beforeId = cursor?.optString("before_id")?.toLongOrNull()
            if ((beforeDate == null) != (beforeId == null)) throw ApiFailure("历史分页位置无效，请从第一页重新读取", code = "invalid_cursor")
            val pagePath = buildString {
                append("/rest/v1/pmu_quotes?select=*&identity=eq.").append(encode(identity))
                append("&order=effective_date.desc,id.desc&limit=51")
                if (beforeDate != null && beforeId != null) {
                    append("&or=").append(encode("(effective_date.lt.$beforeDate,and(effective_date.eq.$beforeDate,id.lt.$beforeId))"))
                }
            }
            val pageRows = (requestValue(config, pagePath, "GET", accessToken = session.accessToken) as? JSONArray)?.objects()
                ?: throw ApiFailure("云端历史页格式无效", code = "invalid_response")
            if (pageRows.any { it.optString("customer_key") != customerKey || it.optString("identity") != identity }) {
                throw ApiFailure("云端历史页归属校验失败", code = "owner_mismatch")
            }
            val hasMore = pageRows.size > 50
            val visible = pageRows.take(50)
            visible.forEachIndexed { index, row ->
                val effective = LocalDate.parse(row.getString("effective_date"))
                val day = LocalDate.parse(meta.businessDate)
                val scheduled = row.optString("source_type") !in setOf("文件导入", "图片导入", "导入更新") && effective > day
                val age = ChronoUnit.DAYS.between(effective, day)
                row.put("customer_revision", current?.optString("customer_revision") ?: "0")
                    .put("history_count", current?.optInt("history_count", pageRows.size) ?: pageRows.size)
                    .put("future_count", current?.optInt("future_count") ?: 0)
                    .put("scheduled", scheduled).put("stale", !scheduled && age > 60).put("age_days", age)
                    .put("is_current", row.optString("id") == current?.optString("id"))
                val previous = pageRows.getOrNull(index + 1)
                if (previous == null) {
                    row.put("previous_price", JSONObject.NULL).put("previous_date", JSONObject.NULL)
                        .put("previous_source_type", JSONObject.NULL).put("delta", JSONObject.NULL)
                } else {
                    row.put("previous_price", previous.optString("price"))
                        .put("previous_date", previous.optString("effective_date"))
                        .put("previous_source_type", previous.optString("source_type"))
                        .put("delta", BigDecimal(row.getString("price")).subtract(BigDecimal(previous.getString("price"))).toPlainString())
                }
            }
            val result = JSONObject(snapshot.toString())
                .put("identity", identity)
                .put("has_more", hasMore)
                .put("items", JSONArray(visible))
            if (hasMore) {
                val last = visible.last()
                val next = JSONObject().put("quote_id", id).put("before_date", last.getString("effective_date"))
                    .put("before_id", last.getString("id")).put("data_version", meta.dataVersion)
                    .put("schema_epoch", meta.schemaEpoch).put("business_date", meta.businessDate)
                result.put("next_cursor", next.toString())
            } else result.put("next_cursor", JSONObject.NULL)
            return result
        }
        val update = Regex("/api/v1/quotes/([0-9]+)/updates").matchEntire(path)
        if (method == "POST" && (path == "/api/v1/quotes" || update != null) && body != null) {
            val record = body.getJSONObject("record")
            val baseId = update?.groupValues?.get(1)
            val imageSource = body.optJSONObject("image_source")?.let { source ->
                ImageQuoteSource(source.getString("file"), source.optString("sheet", "图片识别"), source.getInt("row"))
            }
            val historyKeys = body.optJSONArray("history_keys")
            if (historyKeys != null) {
                require(historyKeys.length() in 1..5000) { "该规格历史超过手机端补齐上限，请在电脑端完成" }
                requireQuoteWorkflow(config, session)
                val compatibleRecord = legacyQuoteRecord(record, imageSource, body.getString("customer_revision"))
                val saved = rpc("pmu_save_quote_v160", JSONObject()
                    .put("p_record", compatibleRecord)
                    .put("p_base_id", baseId?.toLongOrNull() ?: JSONObject.NULL)
                    .put("p_history_keys", historyKeys))
                return quoteWriteResponse(saved, body.getString("request_id"), rpc("pmu_sync_meta_v1"))
            }
            val mobilePayload = JSONObject()
                .put("p_request_id", body.getString("request_id"))
                .put("p_record", record)
                .put("p_base_id", baseId ?: JSONObject.NULL)
                .put("p_customer_revision", body.getString("customer_revision"))
            try {
                return rpc("pmu_mobile_save_quote_v1", mobilePayload)
            } catch (failure: ApiFailure) {
                if (failure.code != "sync_not_installed") throw failure
            }

            if (imageSource != null) requireQuoteWorkflow(config, session)
            val compatibleRecord = legacyQuoteRecord(record, imageSource, body.getString("customer_revision"))
            val saved = rpc("pmu_add_quote", JSONObject()
                .put("p_record", compatibleRecord)
                .put("p_base_id", baseId?.toLongOrNull() ?: JSONObject.NULL))
            return quoteWriteResponse(saved, body.getString("request_id"), rpc("pmu_sync_meta_v1"))
        }
        val recovery = Regex("/api/v1/requests/([0-9a-f-]+)").matchEntire(path)
        if (recovery != null && method == "GET") {
            val pendingBody = body ?: throw ApiFailure("本机缺少原报价内容，无法核对", code = "invalid_pending_save")
            val pendingRecord = pendingBody.getJSONObject("record")
            val identity = quoteIdentity(pendingRecord.getString("customer"), pendingRecord.getString("grade"), pendingRecord.optString("color"), pendingRecord.getString("tax_type"))
            val customerKey = sha256(businessNorm(pendingRecord.getString("customer")))
            val historyKeys = pendingBody.optJSONArray("history_keys")
            if (historyKeys != null) {
                val expected = historyKeys.objects().associate { it.getString("id") to it.optionalString("import_key") }
                require(expected.isNotEmpty() && expected.size == historyKeys.length() && expected.size <= 5000) { "原规格历史核对清单无效" }
                require(pendingBody.optString("base_id") in expected) { "原规格历史核对缺少基准报价" }
                val rows = mutableListOf<JSONObject>()
                var offset = 0
                while (true) {
                    val page = requestValue(config,
                        "/rest/v1/pmu_quotes?select=*&customer_key=eq.$customerKey&identity=eq.$identity&order=id.asc&limit=1000&offset=$offset",
                        "GET", accessToken = session.accessToken) as? JSONArray
                        ?: throw ApiFailure("补齐后的规格历史响应无效", code = "invalid_response", uncertain = true)
                    rows += page.objects()
                    if (page.length() < 1000) break
                    offset += page.length()
                    if (offset > 10_000) throw ApiFailure("补齐后历史过多，无法自动确认，请保留原请求编号并在电脑端核对", code = "uncertain_save", uncertain = true)
                }
                if (rows.isEmpty()) throw ApiFailure("尚未查到原规格历史的补齐结果", 404, "not_found")
                val byId = rows.associateBy { it.optString("id") }
                expected.forEach { (id, importKey) ->
                    val row = byId[id] ?: throw ApiFailure("部分原规格历史尚未匹配，结果仍需人工核对", code = "uncertain_save", uncertain = true)
                    if (row.optString("customer_key") != customerKey || row.optString("customer") != pendingRecord.optString("customer") ||
                        row.optString("grade") != pendingRecord.optString("grade") || row.optString("color") != pendingRecord.optString("color") ||
                        row.optString("tax_type") != pendingRecord.optString("tax_type") || row.optionalString("import_key") != importKey) {
                        throw ApiFailure("原规格历史内容与补齐请求不符，结果仍需人工核对", code = "uncertain_save", uncertain = true)
                    }
                }
                val added = rows.filter { it.optString("id") !in expected }
                val matchingAdded = added.filter { row ->
                    row.optString("customer") == pendingRecord.optString("customer") && row.optString("grade") == pendingRecord.optString("grade") &&
                        row.optString("color") == pendingRecord.optString("color") && row.optString("tax_type") == pendingRecord.optString("tax_type") &&
                        row.optString("material") == pendingRecord.optString("material") && row.optString("price") == pendingRecord.optString("price") &&
                        row.optString("effective_date") == pendingRecord.optString("effective_date") && row.optString("note") == pendingRecord.optString("note") &&
                        row.optString("reason") == pendingRecord.optString("reason")
                }
                if (added.size != matchingAdded.size || matchingAdded.size > 1) throw ApiFailure("补齐后的新增报价无法唯一核对，请在电脑端查看历史", code = "ambiguous_save", uncertain = true)
                val confirmed = matchingAdded.singleOrNull() ?: byId[pendingBody.optString("base_id")]
                    ?: throw ApiFailure("补齐后的基准报价不在历史中，请保留原请求并在电脑端核对", code = "uncertain_save", uncertain = true)
                val meta = rpc("pmu_sync_meta_v1")
                return confirmed.put("request_id", recovery.groupValues[1]).put("status", "committed")
                    .put("saved_id", confirmed.optString("id")).put("data_version", meta.optString("data_version"))
                    .put("schema_epoch", meta.optString("schema_epoch")).put("business_date", meta.optString("business_date"))
                    .put("server_time", meta.optString("server_time"))
            }
            val rows = requestValue(config,
                "/rest/v1/pmu_quotes?select=*&customer_key=eq.$customerKey&identity=eq.$identity&order=effective_date.desc,id.desc&limit=1000",
                "GET", accessToken = session.accessToken) as? JSONArray
                ?: throw ApiFailure("报价历史核对响应无效", code = "invalid_response")
            val matches = rows.objects().filter { row ->
                row.optString("id") != pendingBody.optString("base_id") &&
                    row.optString("customer") == pendingRecord.optString("customer") &&
                    row.optString("grade") == pendingRecord.optString("grade") &&
                    row.optString("material") == pendingRecord.optString("material") &&
                    row.optString("color") == pendingRecord.optString("color") &&
                    row.optString("price") == pendingRecord.optString("price") &&
                    row.optString("tax_type") == pendingRecord.optString("tax_type") &&
                    row.optString("effective_date") == pendingRecord.optString("effective_date") &&
                    row.optString("note") == pendingRecord.optString("note") &&
                    row.optString("reason") == pendingRecord.optString("reason") &&
                    pendingBody.optJSONObject("image_source")?.let { source ->
                        row.optString("source_type") == "图片导入" && row.optString("source_file") == source.optString("file") &&
                            row.optString("source_sheet") == source.optString("sheet") && row.optInt("source_row") == source.optInt("row")
                    } != false
            }
            if (matches.isEmpty()) throw ApiFailure("尚未在报价历史中查到本次内容，可按相同表单和基准重试", 404, "not_found")
            if (matches.size != 1) throw ApiFailure("存在多条相同报价，无法唯一核对，请先人工检查历史", code = "ambiguous_save")
            val meta = rpc("pmu_sync_meta_v1")
            return matches.single()
                .put("request_id", recovery.groupValues[1])
                .put("status", "committed")
                .put("saved_id", matches.single().optString("id"))
                .put("message", "已在云端报价历史中核对到相同记录")
                .put("data_version", meta.optString("data_version"))
                .put("schema_epoch", meta.optString("schema_epoch"))
                .put("business_date", meta.optString("business_date"))
                .put("server_time", meta.optString("server_time"))
        }
        throw ApiFailure("该云端接口暂不支持", 404, "unsupported_endpoint")
    }

    private fun requireQuoteWorkflow(config: MobileConfig, session: MobileSession) {
        val settings = requestValue(config, "/rest/v1/pmu_settings?select=value&key=eq.quote_workflow_version", "GET", accessToken = session.accessToken) as? JSONArray
            ?: throw ApiFailure("报价流程版本响应无效", code = "invalid_response")
        if (settings.length() != 1 || settings.optJSONObject(0)?.optString("value") != "1.6.0") {
            throw ApiFailure("云端尚未启用电脑端报价完善流程，未提交本次报价", code = "quote_workflow_not_installed")
        }
    }

    private fun quoteWriteResponse(saved: JSONObject, requestId: String, meta: JSONObject): JSONObject {
        val confirmed = saved.optJSONObject("record") ?: throw ApiFailure("电脑端保存响应缺少报价结果", code = "invalid_response")
        return saved.put("request_id", requestId).put("status", "committed")
            .put("saved_id", confirmed.optString("id"))
            .put("data_version", meta.optString("data_version"))
            .put("schema_epoch", meta.optString("schema_epoch"))
            .put("business_date", meta.optString("business_date"))
            .put("server_time", meta.optString("server_time"))
    }

    private fun decorateQuote(row: JSONObject, date: String) {
        val day = LocalDate.parse(date)
        val effective = LocalDate.parse(row.getString("effective_date"))
        val immediateSources = setOf("文件导入", "图片导入", "导入更新")
        val scheduled = row.optString("source_type") !in immediateSources && effective > day
        val age = ChronoUnit.DAYS.between(effective, day)
        row.put("scheduled", scheduled).put("age_days", age).put("stale", !scheduled && age > 60)
        val previousDate = row.optionalString("previous_date")
        val previous = row.optionalString("previous_price")
        if (previous != null) {
            if (scheduled || previousDate == null || (LocalDate.parse(previousDate) > day && row.optString("previous_source_type") !in immediateSources)) {
                row.put("previous_price", JSONObject.NULL).put("delta", JSONObject.NULL)
            } else row.put("delta", BigDecimal(row.getString("price")).subtract(BigDecimal(previous)).toPlainString())
        }
    }

    suspend fun freshSession(config: MobileConfig, session: MobileSession): MobileSession = withContext(Dispatchers.IO) {
        refreshIfNeeded(validateConfig(config), session)
    }

    private fun refreshIfNeeded(config: MobileConfig, session: MobileSession): MobileSession {
        if (System.currentTimeMillis() / 1000 < session.expiresAt - 60) return session
        val payload = request(
            config,
            "/auth/v1/token?grant_type=refresh_token",
            "POST",
            JSONObject().put("refresh_token", session.refreshToken),
        )
        val refreshed = sessionFromAuth(payload, session.username)
        if (refreshed.userId != session.userId) throw ApiFailure("登录身份已变化，请重新登录", status = 401, code = "session_expired")
        return refreshed
    }

    private fun sessionFromAuth(payload: JSONObject, username: String): MobileSession {
        val userId = payload.optJSONObject("user")?.optString("id").orEmpty()
        val uuid = runCatching { UUID.fromString(userId).toString() }.getOrNull()
            ?: throw ApiFailure("登录身份无效，请重新登录", code = "invalid_auth_response")
        val access = payload.optString("access_token")
        val refresh = payload.optString("refresh_token")
        val expiresIn = payload.optLong("expires_in", 0)
        if (access.isBlank() || refresh.isBlank() || expiresIn <= 0) throw ApiFailure("登录响应异常，请重新登录", code = "invalid_auth_response")
        return MobileSession(uuid, username, access, refresh, System.currentTimeMillis() / 1000 + expiresIn)
    }

    private fun request(
        config: MobileConfig,
        route: String,
        method: String,
        body: JSONObject? = null,
        accessToken: String? = null,
    ): JSONObject = requestValue(config, route, method, body, accessToken) as? JSONObject
        ?: throw ApiFailure("云端返回格式无效，请稍后重试", code = "invalid_response", uncertain = isQuoteWrite(route, method))

    private fun requestValue(
        config: MobileConfig,
        route: String,
        method: String,
        body: JSONObject? = null,
        accessToken: String? = null,
    ): Any {
        val quoteWrite = isQuoteWrite(route, method)
        val url = URL(config.projectUrl.trimEnd('/') + route)
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 15_000
            instanceFollowRedirects = false
            useCaches = false
            setRequestProperty("apikey", config.publishableKey)
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            if (accessToken != null) setRequestProperty("Authorization", "Bearer $accessToken")
            if (body != null) doOutput = true
        }
        try {
            if (body != null) connection.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val bytes = stream?.use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                var total = 0
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    total += count
                    val limit = if (route.endsWith("/pmu_export_snapshot")) 64 * 1024 * 1024 else 6 * 1024 * 1024
                    if (total > limit) throw ApiFailure("云端响应超过大小限制", status = 503, code = "response_too_large", uncertain = quoteWrite)
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            } ?: ByteArray(0)
            val payload = if (bytes.isEmpty()) JSONObject() else runCatching {
                JSONTokener(String(bytes, StandardCharsets.UTF_8)).nextValue()
            }.getOrElse { throw ApiFailure("云端返回格式无效，请稍后重试", status = status, code = "invalid_response", uncertain = quoteWrite) }
            if (status !in 200..299) throw mapFailure(status, payload as? JSONObject ?: JSONObject(), route)
            if (payload !is JSONObject && payload !is JSONArray) throw ApiFailure("云端响应格式无效", code = "invalid_response", uncertain = quoteWrite)
            return payload
        } catch (failure: ApiFailure) {
            throw failure
        } catch (_: IOException) {
            throw ApiFailure(
                "网络连接中断。若刚才正在保存，请先核对原请求编号，不要创建重复报价。",
                code = "network_interrupted",
                uncertain = quoteWrite,
            )
        } finally {
            connection.disconnect()
        }
    }

    private fun mapFailure(status: Int, payload: JSONObject, route: String): ApiFailure {
        val code = payload.optString("code", payload.optString("error"))
        if (route.contains("grant_type=password") && status in 400..499) {
            return ApiFailure("账号或密码错误，请重新输入", status, "invalid_credentials")
        }
        if (route.contains("grant_type=refresh_token") && status in 400..499) {
            return ApiFailure("登录已失效，请重新登录", status, "session_expired")
        }
        if (status == 401) return ApiFailure("登录已失效，请重新登录", status, "session_expired")
        if (status == 403 || code == "42501") return ApiFailure("该账号尚未开通或已停用，请联系管理人员", status, "member_disabled")
        if (status == 404 && code == "not_found") return ApiFailure("尚无已提交结果，可使用原请求编号重试", status, code)
        if (status == 404 && route.startsWith("/rest/")) return ApiFailure("当前电脑端云项目尚缺移动同步接口，请先完成受控升级", status, "sync_not_installed")
        if (status == 404) return ApiFailure("移动端云服务尚未部署，请联系管理人员完成配置", status, "gateway_not_deployed")
        if (status == 409 || code == "P0001") return ApiFailure("云端数据已变化或请求编号冲突，请刷新后核对", status, code.ifBlank { "snapshot_changed" })
        if (status == 422 || code in setOf("22023", "22007", "22008", "22P02", "23514")) {
            return ApiFailure("报价字段无效或超出范围，请核对后重试", status, "validation_error")
        }
        if (status == 429) return ApiFailure("请求过于频繁，请稍后重试", status, "rate_limited")
        val uncertain = isQuoteWrite(route, "POST") && status >= 500
        return ApiFailure(
            if (uncertain) "保存结果暂未确认，请保留原请求编号并进行核对。" else "云端服务暂不可用，请稍后重试。",
            status,
            code.ifBlank { "backend_unavailable" },
            uncertain,
        )
    }

    internal fun parseSnapshot(value: JSONObject): MobileSnapshot {
        if (value.optJSONArray("customers") == null || value.optJSONArray("quotes") == null) {
            throw ApiFailure("云端报价快照缺少必要字段", code = "invalid_snapshot")
        }
        val customers = value.optJSONArray("customers").objectList(::parseCustomer)
        val quotes = value.optJSONArray("quotes").objectList(::parseQuote).map { it.copy(isCurrent = !it.scheduled) }
        if (value.optString("owner_id").isBlank() || quotes.size > 2000) throw ApiFailure("云端报价快照无效或超过移动端读取范围", code = "invalid_snapshot")
        return MobileSnapshot(value.getString("owner_id"), parseMeta(value), customers, quotes)
    }

    private fun parseHistory(value: JSONObject): QuoteHistoryPage {
        val meta = parseMeta(value)
        val items = value.optJSONArray("items").objectList { row ->
            if (!row.has("scheduled") || !row.has("age_days") || !row.has("stale")) {
                decorateQuote(row, meta.businessDate)
            }
            parseQuote(row)
        }
        return QuoteHistoryPage(
            meta = meta,
            identity = value.optString("identity"),
            items = items,
            hasMore = value.optBoolean("has_more"),
            nextCursor = value.optionalString("next_cursor"),
        )
    }

    private fun parseCustomerDetail(value: JSONObject): CustomerDetail {
        val key = value.optString("customer_key")
        if (key.isBlank() || value.optString("display_name").isBlank()) {
            throw ApiFailure("云端客户详情缺少必要字段", code = "invalid_customer_detail")
        }
        val rawItems = value.optJSONArray("items").objectList(::parseQuote)
        val decorated = decorateCustomerItems(rawItems)
        val customer = CustomerRecord(
            customerKey = key,
            displayName = value.optString("display_name"),
            revision = value.optString("revision", "0"),
            specs = value.optInt("specs", decorated.map { it.identity }.filter(String::isNotBlank).toSet().size),
            records = value.optInt("records", decorated.size),
            status = value.optString("status", "active"),
            deletedAt = value.optionalString("deleted_at"),
            deletedReason = value.optString("deleted_reason"),
            futureRecords = value.optInt("future_records", decorated.count { it.scheduled }),
        )
        return CustomerDetail(
            customer = customer,
            items = decorated,
            specs = value.optInt("specs", customer.specs),
            records = value.optInt("records", decorated.size),
            futureRecords = value.optInt("future_records", decorated.count { it.scheduled }),
        )
    }

    private fun decorateCustomerItems(items: List<QuoteRecord>): List<QuoteRecord> {
        val cutoff = LocalDate.now(java.time.ZoneId.of("Asia/Shanghai"))
        val immediateSources = setOf("文件导入", "图片导入", "导入更新")
        val groups = items.groupBy { row ->
            row.identity.ifBlank { listOf(row.customer, row.grade, row.color, row.taxType).joinToString("\u0000") }
        }
        return items.map { row ->
            val group = groups[row.identity.ifBlank { listOf(row.customer, row.grade, row.color, row.taxType).joinToString("\u0000") }].orEmpty()
            val ordered = group.sortedWith(
                compareByDescending<QuoteRecord> { item ->
                    item.sourceType in immediateSources || parseDate(item.effectiveDate)?.let { it <= cutoff } == true
                }.thenByDescending { item -> item.effectiveDate }
                    .thenByDescending { item -> item.id.toLongOrNull() ?: 0L },
            )
            val current = ordered.firstOrNull()
            val chronological = group.sortedWith(
                compareByDescending<QuoteRecord> { item -> item.effectiveDate }
                    .thenByDescending { item -> item.id.toLongOrNull() ?: 0L },
            )
            val index = chronological.indexOfFirst { it.id == row.id }
            val previous = chronological.getOrNull(index + 1)
            val effective = parseDate(row.effectiveDate)
            val scheduled = row.sourceType !in immediateSources && effective?.isAfter(cutoff) == true
            val age = effective?.let { java.time.temporal.ChronoUnit.DAYS.between(it, cutoff).toInt() } ?: 0
            row.copy(
                historyCount = group.size,
                futureCount = group.count { item ->
                    item.sourceType !in immediateSources && parseDate(item.effectiveDate)?.isAfter(cutoff) == true
                },
                previousPrice = previous?.price,
                delta = previous?.let { runCatching { BigDecimal(row.price).subtract(BigDecimal(it.price)).toPlainString() }.getOrNull() },
                scheduled = scheduled,
                stale = !scheduled && age > 60,
                ageDays = age,
                isCurrent = current?.id == row.id,
            )
        }.sortedWith(compareByDescending<QuoteRecord> { it.effectiveDate }.thenByDescending { it.id.toLongOrNull() ?: 0L })
    }

    private fun parseMeta(value: JSONObject) = SyncMeta(
        dataVersion = value.optString("data_version"),
        schemaEpoch = value.optString("schema_epoch"),
        businessDate = value.optString("business_date"),
        serverTime = value.optString("server_time"),
    ).also {
        if (it.dataVersion.isBlank() || it.schemaEpoch.isBlank() || it.businessDate.isBlank()) {
            throw ApiFailure("云端同步版本信息无效，请稍后刷新", code = "invalid_sync_meta")
        }
    }

    private fun parseCustomer(value: JSONObject) = CustomerRecord(
        customerKey = value.optString("customer_key"),
        displayName = value.optString("display_name"),
        revision = value.optString("revision", "0"),
        specs = value.optInt("specs"),
        records = value.optInt("records"),
        status = value.optString("status", "active"),
        deletedAt = value.optionalString("deleted_at"),
        deletedReason = value.optString("deleted_reason"),
        futureRecords = value.optInt("future_records"),
    )

    private fun parseQuote(value: JSONObject) = QuoteRecord(
        id = value.optString("id"),
        customer = value.optString("customer"),
        grade = value.optString("grade"),
        material = value.optString("material"),
        color = value.optString("color"),
        price = value.optString("price"),
        taxType = value.optString("tax_type", "未注明"),
        effectiveDate = value.optString("effective_date"),
        note = value.optString("note"),
        reason = value.optString("reason"),
        sourceType = value.optString("source_type"),
        customerRevision = value.optString("customer_revision", "0"),
        historyCount = value.optInt("history_count", 1),
        futureCount = value.optInt("future_count"),
        previousPrice = value.optionalString("previous_price"),
        delta = value.optionalString("delta"),
        scheduled = value.optBoolean("scheduled"),
        stale = value.optBoolean("stale"),
        ageDays = value.optInt("age_days"),
        isCurrent = value.optBoolean("is_current"),
        identity = value.optString("identity"),
        customerKey = value.optString("customer_key"),
        sourceFile = value.optString("source_file"),
        sourceSheet = value.optString("source_sheet"),
        sourceRow = value.optInt("source_row"),
        importKey = value.optionalString("import_key").orEmpty(),
        createdAt = value.optString("created_at"),
        previousDate = value.optionalString("previous_date"),
        previousSourceType = value.optionalString("previous_source_type"),
    )

    private fun parseDate(value: String): LocalDate? = runCatching { LocalDate.parse(value) }.getOrNull()

    private fun <T> JSONArray?.objectList(parse: (JSONObject) -> T): List<T> {
        if (this == null) return emptyList()
        return List(length()) { parse(getJSONObject(it)) }
    }

    private fun JSONObject.optionalString(key: String): String? =
        if (!has(key) || isNull(key)) null else optString(key).takeUnless(String::isBlank)

    private fun encode(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8.name())

    private fun isQuoteWrite(route: String, method: String): Boolean =
        method == "POST" && (route.contains("/quotes") || route.endsWith("/pmu_mobile_save_quote_v1") ||
            route.endsWith("/pmu_save_quote_v160") || route.endsWith("/pmu_add_quote") ||
            route.endsWith("/pmu_change_customer") || route.endsWith("/pmu_import_quotes"))
}

internal fun QuoteDraft.toSaveRecordJson(): JSONObject = JSONObject()
    .put("customer", customer.trim())
    .put("grade", grade.trim())
    .put("material", material.trim())
    .put("color", color.trim())
    .put("price", price.trim())
    .put("tax_type", taxType)
    .put("effective_date", effectiveDate.trim())
    .put("note", note.trim())
    .put("reason", reason.trim())

internal fun legacyQuoteRecord(record: JSONObject, source: ImageQuoteSource?, customerRevision: String): JSONObject {
    val compatible = JSONObject(record.toString())
        .put("identity", quoteIdentity(record.getString("customer"), record.getString("grade"), record.optString("color"), record.getString("tax_type")))
        .put("customer_key", sha256(businessNorm(record.getString("customer"))))
        .put("customer_revision", customerRevision)
    if (source != null) compatible.put("import_immediate", true)
        .put("source_file", source.file).put("source_sheet", source.sheet).put("source_row", source.row)
    return compatible
}
