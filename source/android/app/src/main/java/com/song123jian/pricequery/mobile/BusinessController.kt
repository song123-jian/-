package com.song123jian.pricequery.mobile

import android.content.Context
import android.net.Uri
import com.song123jian.pricequery.mobile.data.ApiFailure
import com.song123jian.pricequery.mobile.data.BackupSnapshot
import com.song123jian.pricequery.mobile.data.BusinessDocument
import com.song123jian.pricequery.mobile.data.checkedSupplierFields
import com.song123jian.pricequery.mobile.data.CustomerRecord
import com.song123jian.pricequery.mobile.data.CustomerProfile
import com.song123jian.pricequery.mobile.data.CustomerProfileImportResult
import com.song123jian.pricequery.mobile.data.ProjectProgressRecord
import com.song123jian.pricequery.mobile.data.ProjectProgressImportResult
import com.song123jian.pricequery.mobile.data.ProjectScore
import com.song123jian.pricequery.mobile.data.TODO_CATEGORIES
import com.song123jian.pricequery.mobile.data.TodoItem
import com.song123jian.pricequery.mobile.data.customerProfileFromJson
import com.song123jian.pricequery.mobile.data.filterTodos
import com.song123jian.pricequery.mobile.data.normalizeCustomerProfile
import com.song123jian.pricequery.mobile.data.normalizeProjectProgress
import com.song123jian.pricequery.mobile.data.normalizeTodo
import com.song123jian.pricequery.mobile.data.projectFromJson
import com.song123jian.pricequery.mobile.data.scoreProjectProgress
import com.song123jian.pricequery.mobile.data.todoFromJson
import com.song123jian.pricequery.mobile.data.toJson
import com.song123jian.pricequery.mobile.data.optNullableInt
import com.song123jian.pricequery.mobile.data.optNullableString
import com.song123jian.pricequery.mobile.data.DocumentRenderer
import com.song123jian.pricequery.mobile.data.ExchangeArtifact
import com.song123jian.pricequery.mobile.data.ExistingImportQuote
import com.song123jian.pricequery.mobile.data.ImportCustomerState
import com.song123jian.pricequery.mobile.data.FileExchange
import com.song123jian.pricequery.mobile.data.ImportOptions
import com.song123jian.pricequery.mobile.data.ImportPreview
import com.song123jian.pricequery.mobile.data.InventoryResult
import com.song123jian.pricequery.mobile.data.MesClient
import com.song123jian.pricequery.mobile.data.MesCredentials
import com.song123jian.pricequery.mobile.data.MobilePreferences
import com.song123jian.pricequery.mobile.data.mesCredentialPersistenceWarning
import com.song123jian.pricequery.mobile.data.QuoteRecord
import com.song123jian.pricequery.mobile.data.newRequestId
import com.song123jian.pricequery.mobile.data.withSupplier
import com.song123jian.pricequery.mobile.data.matchImportRows
import com.song123jian.pricequery.mobile.data.objects
import com.song123jian.pricequery.mobile.data.customerProfileTemplateXlsx
import com.song123jian.pricequery.mobile.data.customerProfilesXlsx
import com.song123jian.pricequery.mobile.data.parseCustomerProfilesXlsx
import com.song123jian.pricequery.mobile.data.parseProjectProgressXlsx
import com.song123jian.pricequery.mobile.data.projectProgressTemplateXlsx
import com.song123jian.pricequery.mobile.data.projectProgressXlsx
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

enum class BusinessPage {
    MENU, DATA, IMPORT, RECYCLE, DOCUMENTS, DOCUMENT_EDITOR, INVENTORY, BACKUP,
    CUSTOMER_PROFILES, TODOS, PROJECT_PROGRESS,
}

data class DocumentEntry(
    val id: String,
    val title: String,
    val buyer: String,
    val date: String,
    val kind: String = "quotation",
    val remoteId: String? = null,
    val revision: Int? = null,
    val syncStatus: String = "local",
)

data class BusinessState(
    val page: BusinessPage = BusinessPage.MENU,
    val busy: Boolean = false,
    val busyLabel: String = "",
    val error: String? = null,
    val message: String? = null,
    val artifact: ExchangeArtifact? = null,
    val recycled: List<CustomerRecord> = emptyList(),
    val importOptions: ImportOptions = ImportOptions(),
    val importFilename: String = "",
    val importPreview: ImportPreview? = null,
    val importPage: Int = 0,
    val documents: List<DocumentEntry> = emptyList(),
    val customerProfiles: List<CustomerProfile> = emptyList(),
    val customerProfileImport: CustomerProfileImportResult? = null,
    val todos: List<TodoItem> = emptyList(),
    val projects: List<ProjectProgressRecord> = emptyList(),
    val projectImport: ProjectProgressImportResult? = null,
    val profileDraft: CustomerProfile? = null,
    val todoDraft: TodoItem? = null,
    val projectDraft: ProjectProgressRecord? = null,
    val document: BusinessDocument? = null,
    val documentId: String? = null,
    val documentRemoteId: String? = null,
    val documentRevision: Int? = null,
    val documentSyncStatus: String = "local",
    val documentDirty: Boolean = false,
    val documentPreview: ExchangeArtifact? = null,
    val inventoryLoggedIn: Boolean = false,
    val inventory: InventoryResult? = null,
    val restored: BackupSnapshot? = null,
    val restoredName: String = "",
    val backupQuery: String = "",
)

internal fun BusinessState.withoutInventoryResult(): BusinessState = copy(inventory = null)

class BusinessController(
    private val context: Context,
    private val scope: CoroutineScope,
    private val rpc: suspend (String, JSONObject) -> Any,
    private val audit: suspend (String) -> JSONArray,
    private val owner: () -> String?,
    private val pending: () -> JSONObject?,
    private val savePending: suspend (JSONObject?) -> Unit,
    private val writeAllowed: () -> Boolean,
    private val changed: () -> Unit,
) {
    private val mutableState = MutableStateFlow(BusinessState())
    val state = mutableState.asStateFlow()
    val files = FileExchange(context)
    private val preferences = MobilePreferences(context)
    private val mes = MesClient()
    private var task: Job? = null
    private var restoredInput: File? = null

    fun open(page: BusinessPage = BusinessPage.MENU) {
        mutableState.update { it.copy(page = page, error = null, message = null) }
        when (page) {
            BusinessPage.RECYCLE -> loadRecycle()
            BusinessPage.DOCUMENTS -> loadDocuments()
            BusinessPage.CUSTOMER_PROFILES -> loadCustomerProfiles()
            BusinessPage.TODOS -> loadTodos()
            BusinessPage.PROJECT_PROGRESS -> loadProjects()
            else -> Unit
        }
    }

    fun back() {
        val current = mutableState.value
        open(when (current.page) {
            BusinessPage.DOCUMENT_EDITOR -> BusinessPage.DOCUMENTS
            BusinessPage.IMPORT, BusinessPage.BACKUP -> BusinessPage.DATA
            BusinessPage.CUSTOMER_PROFILES, BusinessPage.TODOS, BusinessPage.PROJECT_PROGRESS -> BusinessPage.MENU
            else -> BusinessPage.MENU
        })
    }

    fun dismissError() = mutableState.update { it.copy(error = null, message = null) }
    fun clearArtifact() = mutableState.update { it.copy(artifact = null) }
    fun setBackupQuery(value: String) = mutableState.update { it.copy(backupQuery = value) }

    private fun run(label: String, block: suspend () -> Unit) {
        if (mutableState.value.busy) return
        val account = owner() ?: return
        mutableState.update { it.copy(busy = true, busyLabel = label, error = null, message = null) }
        task = scope.launch {
            try {
                block()
                check(owner() == account) { "账号已变化，请重新打开页面" }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                if (owner() == account) mutableState.update { it.copy(error = failure.message?.take(500) ?: "操作未完成，请重试") }
            } finally {
                if (owner() == account) mutableState.update { it.copy(busy = false, busyLabel = "", inventoryLoggedIn = mes.loggedIn) }
            }
        }
    }

    private fun accountDirectory(): File {
        val id = owner() ?: error("请先登录")
        require(Regex("[a-zA-Z0-9-]{16,80}").matches(id))
        return File(context.filesDir, "business/$id").apply { mkdirs() }
    }

    private suspend fun snapshot(): BackupSnapshot {
        val account = owner() ?: error("请先登录")
        val result = BackupSnapshot(rpc("pmu_export_snapshot", JSONObject()) as? JSONObject ?: error("完整快照响应无效"))
        require((result.customers + result.quotes + result.audit).all { it.isNull("owner_id") || it.getString("owner_id") == account }) { "完整快照的账号校验失败" }
        return result
    }

    private suspend fun backupBefore(snapshot: BackupSnapshot, label: String): ExchangeArtifact = withContext(Dispatchers.IO) {
        files.backup(snapshot, label, File(accountDirectory(), "backups"))
    }

    suspend fun backupBeforeQuoteFill(): ExchangeArtifact {
        val label = "补齐规格前备份"
        while (true) {
            val current = mutableState.value
            check(!current.busy) { "业务操作正在进行，请稍后重试" }
            if (mutableState.compareAndSet(current, current.copy(busy = true, busyLabel = label, error = null, message = null))) break
        }
        try {
            val source = snapshot()
            return backupBefore(source, "补齐规格前")
        } finally {
            mutableState.update {
                if (it.busyLabel == label) it.copy(busy = false, busyLabel = "") else it
            }
        }
    }

    fun createBackup() = run("生成完整备份") {
        val source = snapshot()
        val artifact = withContext(Dispatchers.IO) { files.backup(source) }
        mutableState.update { it.copy(artifact = artifact, message = "完整备份已核对：${source.customers.size}客户、${source.quotes.size}报价、${source.audit.size}操作记录") }
    }

    fun exportAllHistory(identities: Set<String>? = null) = run("导出完整报价历史") {
        val source = snapshot()
        val active = source.customers.filter { it.optString("status") == "active" }.map { it.getString("customer_key") }.toSet()
        val rows = source.quotes.filter { it.optString("customer_key") in active && (identities == null || it.optString("identity") in identities) }
            .sortedWith(compareBy<JSONObject> { it.optString("customer") }.thenBy { it.optString("grade") }.thenByDescending { it.optString("effective_date") }.thenByDescending { it.optLong("id") })
        val columns = listOf("customer", "grade", "material", "color", "price", "tax_type", "effective_date", "note", "reason", "source_type", "source_file", "source_sheet", "source_row", "created_at")
        val labels = listOf("客户", "牌号", "材料", "颜色", "价格", "税口径", "记录日期", "备注", "调价原因", "来源", "来源文件", "来源工作表", "来源行", "录入时间")
        val artifact = withContext(Dispatchers.IO) { files.csv(if (identities == null) "全部报价历史.csv" else "筛选规格全部历史.csv", labels, rows.map { row -> columns.map { row.optString(it, "") } }) }
        mutableState.update { it.copy(artifact = artifact, message = "已导出${rows.size}条历史记录") }
    }

    fun exportCurrent(rows: List<QuoteRecord>) = run("导出当前报价") {
        val artifact = withContext(Dispatchers.IO) {
            files.csv("当前筛选报价.csv", listOf("客户", "牌号", "材料", "颜色", "价格", "税口径", "记录日期", "备注", "调价原因", "来源", "状态", "历史记录数"),
                rows.map { listOf(it.customer, it.grade, it.material, it.color, it.price, it.taxType, it.effectiveDate, it.note, it.reason, it.sourceType, if (it.scheduled) "待生效" else "当前报价", it.historyCount.toString()) })
        }
        mutableState.update { it.copy(artifact = artifact, message = "已生成${rows.size}条报价") }
    }

    fun template() = run("生成导入模板") { mutableState.update { it.copy(artifact = files.template()) } }

    fun updateImportOptions(transform: (ImportOptions) -> ImportOptions) {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(importOptions = transform(it.importOptions), importPreview = null, importFilename = "", importPage = 0) }
    }

    fun setImportPage(page: Int) {
        val count = mutableState.value.importPreview?.rows?.size ?: 0
        val pages = maxOf(1, (count + 49) / 50)
        if (page in 0 until pages) mutableState.update { it.copy(importPage = page) }
    }

    fun previewImport(uri: Uri) = run("读取文件并核对云端") {
        val options = mutableState.value.importOptions
        val parsed = withContext(Dispatchers.IO) {
            val (input, name) = files.copyInput(uri)
            try { name to files.parse(input, name, options) } finally { input.delete() }
        }
        val source = snapshot()
        val quoteRows = source.quotes.map { row ->
            ExistingImportQuote(
                id = row.optLong("id"), customerKey = row.optString("customer_key"),
                customer = row.optString("customer"), grade = row.optString("grade"), material = row.optString("material"),
                color = row.optString("color"), price = row.optString("price"), tax = row.optString("tax_type"),
                date = row.optString("effective_date"), note = row.optString("note"), reason = row.optString("reason"),
                sourceType = row.optString("source_type"), file = row.optString("source_file"),
                sheet = row.optString("source_sheet"), row = row.optInt("source_row"),
            )
        }
        val customerRows = source.customers.map { row ->
            ImportCustomerState(row.optString("customer_key"), row.optString("status"), row.optString("revision", "0"))
        }
        val classified = matchImportRows(parsed.second, quoteRows, customerRows, options.customer,
            LocalDate.now(ZoneId.of("Asia/Shanghai")).toString())
        mutableState.update { it.copy(page = BusinessPage.IMPORT, importFilename = parsed.first, importPreview = classified, importPage = 0) }
    }

    fun commitImport() = run("备份并导入报价") {
        check(writeAllowed() && pending() == null) { "请先核对未完成的保存请求" }
        val preview = mutableState.value.importPreview ?: error("请先选择文件并预览")
        require(preview.errors.isEmpty() && preview.fresh.isNotEmpty()) { "请先处理全部错误，重复记录不会再次导入" }
        val source = snapshot()
        val revisions = source.customers.associate { it.getString("customer_key") to it.optString("revision", "0") }
        require(preview.revisions.all { (key, expected) -> (revisions[key] ?: "0") == expected }) { "预览后客户已变化，请重新选择文件预览" }
        val backup = backupBefore(source, "导入前")
        val payload = JSONObject().put("p_records", JSONArray(preview.fresh.map { it.json() })).put("p_customer_revisions", JSONObject(preview.revisions))
        val operation = JSONObject().put("kind", "import").put("owner_id", owner()).put("request_id", newRequestId())
            .put("payload", payload).put("backup", backup.file.path)
        savePending(operation)
        try {
            rpc("pmu_import_quotes", payload)
            finishImport(operation)
        } catch (failure: Exception) {
            if (failure is ApiFailure && !failure.uncertain) savePending(null)
            throw failure
        }
    }

    private suspend fun finishImport(operation: JSONObject) {
        val source = snapshot()
        val keys = source.quotes.map { it.optString("import_key") }.toSet()
        val expected = operation.getJSONObject("payload").getJSONArray("p_records").objects().map { it.getString("import_key") }
        require(expected.all { it in keys }) { "导入结果仍未完全核对，请保留原记录后重新核对" }
        savePending(null)
        mutableState.update { it.copy(importPreview = null, message = "已核对导入${expected.size}条报价；导入前完整备份已保存在本机") }
        changed()
    }

    fun loadRecycle() = run("读取客户回收站") { readRecycle() }

    private suspend fun readRecycle() {
        val result = rpc("pmu_customer_summaries_v165", JSONObject().put("p_status", "deleted")) as? JSONArray ?: error("客户目录响应无效")
        val customers = result.objects().map { row ->
            CustomerRecord(row.getString("customer_key"), row.getString("display_name"), row.getString("revision"), row.optInt("specs"),
                row.optInt("records"), row.optString("status"), row.optString("deleted_at"), row.optString("deleted_reason"))
        }
        mutableState.update { it.copy(recycled = customers) }
    }

    fun changeCustomer(customer: CustomerRecord, restore: Boolean, reason: String) = run(if (restore) "恢复客户" else "客户移入回收站") {
        check(writeAllowed() && pending() == null) { "请先核对未完成的保存请求" }
        require(reason.length <= 1000) { "操作原因最多1000字" }
        val source = snapshot()
        val current = source.customers.firstOrNull { it.optString("customer_key") == customer.customerKey } ?: error("客户已不存在，请刷新")
        require(current.getString("revision") == customer.revision && current.getString("status") == if (restore) "deleted" else "active") { "客户或报价已变化，请刷新详情后操作" }
        val backup = backupBefore(source, if (restore) "恢复客户前" else "删除客户前")
        val request = newRequestId()
        val payload = JSONObject().put("p_customer_key", customer.customerKey).put("p_action", if (restore) "restore" else "delete")
            .put("p_expected_revision", customer.revision).put("p_request_id", request).put("p_reason", reason)
        val operation = JSONObject().put("kind", "customer").put("owner_id", owner()).put("request_id", request).put("payload", payload).put("backup", backup.file.path)
        savePending(operation)
        try {
            rpc("pmu_change_customer", payload)
            check(finishCustomer(operation)) { "客户操作结果尚未出现，请稍后核对原请求" }
        } catch (failure: Exception) {
            if (failure is ApiFailure && !failure.uncertain) savePending(null)
            throw failure
        }
    }

    private suspend fun finishCustomer(operation: JSONObject): Boolean {
        val payload = operation.getJSONObject("payload")
        val rows = audit(operation.getString("request_id")).objects()
        if (rows.isEmpty()) return false
        val event = rows.single()
        require(event.optString("customer_key") == payload.getString("p_customer_key") && event.optString("action") == payload.getString("p_action") &&
            event.optString("expected_revision") == payload.getString("p_expected_revision") && event.optString("reason") == payload.getString("p_reason")) { "请求编号对应其他客户操作，请停止重试" }
        savePending(null)
        readRecycle()
        mutableState.update { it.copy(message = if (event.getString("action") == "restore") "客户已恢复，全部报价历史保留" else "客户已移入回收站，全部报价历史保留") }
        changed()
        return true
    }

    fun recoverPending(retry: Boolean = false) = run("核对原业务请求") {
        val operation = pending() ?: error("当前没有待核对的业务请求")
        require(operation.optString("owner_id") == owner()) { "请使用原账号核对" }
        if (operation.getString("kind") == "customer") {
            if (!finishCustomer(operation)) {
                if (retry) {
                    rpc("pmu_change_customer", operation.getJSONObject("payload"))
                    check(finishCustomer(operation)) { "原请求结果尚未出现，请稍后核对" }
                } else mutableState.update { it.copy(message = "尚未查到原请求，可使用原编号重试") }
            }
        } else {
            val keys = snapshot().quotes.map { it.optString("import_key") }.toSet()
            val expected = operation.getJSONObject("payload").getJSONArray("p_records").objects().map { it.getString("import_key") }
            if (!expected.all { it in keys } && retry) rpc("pmu_import_quotes", operation.getJSONObject("payload"))
            finishImport(operation)
        }
    }

    private fun accountJson(name: String): File = File(accountDirectory(), name)

    private suspend fun writeAccountJson(name: String, value: JSONObject) = withContext(Dispatchers.IO) {
        val target = accountJson(name)
        val temporary = File(target.parentFile, "${target.name}.tmp")
        temporary.writeText(value.toString(), Charsets.UTF_8)
        try {
            Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
        } finally {
            temporary.delete()
        }
    }

    private suspend fun readAccountJson(name: String, fallback: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        val file = accountJson(name)
        if (!file.exists()) fallback else JSONObject(file.readText(Charsets.UTF_8))
    }

    private fun responseArray(value: Any, key: String): JSONArray = when (value) {
        is JSONArray -> value
        is JSONObject -> value.optJSONArray(key) ?: JSONArray()
        else -> error("云端响应格式无效")
    }

    fun loadCustomerProfiles() = run("读取客户档案") {
        val local = readAccountJson("customer-profiles.json", JSONObject().put("profiles", JSONArray()))
        val localProfiles = local.optJSONArray("profiles")?.objects()?.map(::customerProfileFromJson).orEmpty()
        val profiles = runCatching {
            responseArray(rpc("pm_customer_profiles_v1", JSONObject()), "profiles").objects().map(::customerProfileFromJson)
        }.getOrElse { localProfiles }
        mutableState.update { it.copy(customerProfiles = profiles.sortedBy { profile -> profile.name.lowercase() }, customerProfileImport = null) }
    }

    fun newCustomerProfile() = mutableState.update { it.copy(profileDraft = CustomerProfile()) }
    fun editCustomerProfile(profile: CustomerProfile) = mutableState.update { it.copy(profileDraft = profile) }
    fun updateCustomerProfile(transform: (CustomerProfile) -> CustomerProfile) =
        mutableState.update { it.copy(profileDraft = it.profileDraft?.let(transform)) }
    fun cancelCustomerProfile() = mutableState.update { it.copy(profileDraft = null) }

    private suspend fun saveCustomerProfileValue(profile: CustomerProfile): CustomerProfile {
        val payload = JSONObject().put("p_profiles", JSONArray().put(profile.toJson()))
        return try {
            responseArray(rpc("pm_save_customer_profiles_v1", payload), "profiles").optJSONObject(0)?.let(::customerProfileFromJson)
                ?: error("云端客户档案保存响应无效")
        } catch (failure: ApiFailure) {
            if (failure.status == 409 || failure.code == "P0001" || failure.code == "snapshot_changed" || failure.code.contains("conflict", ignoreCase = true)) throw failure
            profile.copy(profileId = profile.profileId ?: UUID.randomUUID().toString(), revision = profile.revision ?: 1)
        } catch (_: Exception) {
            profile.copy(profileId = profile.profileId ?: UUID.randomUUID().toString(), revision = profile.revision ?: 1)
        }
    }

    fun saveCustomerProfile() = run("保存客户档案") {
        val profile = normalizeCustomerProfile(mutableState.value.profileDraft ?: error("请先填写客户档案"))
        val saved = saveCustomerProfileValue(profile)
        val profiles = mutableState.value.customerProfiles.filterNot { it.profileId == saved.profileId } + saved
        writeAccountJson("customer-profiles.json", JSONObject().put("schema", 1).put("profiles", JSONArray(profiles.map { it.toJson() })))
        mutableState.update { it.copy(customerProfiles = profiles.sortedBy { row -> row.name.lowercase() }, profileDraft = null, message = "客户档案已保存") }
    }

    fun exportCustomerProfiles() = run("导出客户档案") {
        mutableState.update { it.copy(artifact = files.xlsx("客户资料.xlsx", customerProfilesXlsx(it.customerProfiles))) }
    }

    fun customerProfileTemplate() = run("生成客户资料模板") {
        mutableState.update { it.copy(artifact = files.xlsx("客户资料模板.xlsx", customerProfileTemplateXlsx())) }
    }

    fun inspectCustomerProfiles(uri: Uri) = run("校验客户资料 XLSX") {
        val result = withContext(Dispatchers.IO) {
            val (file, name) = files.copyInput(uri)
            try {
                parseCustomerProfilesXlsx(file, name)
            } finally {
                file.delete()
            }
        }
        mutableState.update { it.copy(customerProfileImport = result) }
    }

    fun commitCustomerProfilesImport() = run("导入客户资料") {
        val preview = mutableState.value.customerProfileImport ?: error("请先选择客户资料模板")
        require(preview.errors.isEmpty()) { "客户资料模板存在错误，请修正后再导入" }
        require(preview.profiles.isNotEmpty()) { "模板中没有客户资料" }
        val response = rpc(
            "pm_save_customer_profiles_v1",
            JSONObject().put("p_profiles", JSONArray(preview.profiles.map { it.toJson() })),
        ) as? JSONObject ?: error("云端客户档案导入响应无效；请刷新后核对结果")
        val savedProfiles = responseArray(response, "profiles").objects().map(::customerProfileFromJson)
        require(savedProfiles.size == preview.profiles.size) { "云端返回的客户资料条数不完整；请刷新后核对结果" }
        var profiles = mutableState.value.customerProfiles
        savedProfiles.forEach { saved -> profiles = profiles.filterNot { it.profileId == saved.profileId } + saved }
        writeAccountJson("customer-profiles.json", JSONObject().put("schema", 1).put("profiles", JSONArray(profiles.map { it.toJson() })))
        mutableState.update { it.copy(customerProfiles = profiles.sortedBy { row -> row.name.lowercase() }, customerProfileImport = null, message = "客户资料已导入${preview.profiles.size}条") }
    }

    fun clearCustomerProfileImport() = mutableState.update { it.copy(customerProfileImport = null) }

    fun newProjectForProfile(profile: CustomerProfile) = mutableState.update {
        it.copy(projectDraft = ProjectProgressRecord(customerName = profile.name, industry = profile.industry))
    }

    fun newTodoForProfile(profile: CustomerProfile) = mutableState.update {
        it.copy(todoDraft = TodoItem(customerId = profile.profileId, customerName = profile.name))
    }

    fun loadTodos() = run("读取待办") {
        val root = readAccountJson("todos.json", JSONObject().put("version", 1).put("items", JSONArray()))
        val items = root.optJSONArray("items")?.objects()?.map(::todoFromJson).orEmpty()
        val current = mutableState.value
        val localProfiles = readAccountJson("customer-profiles.json", JSONObject().put("profiles", JSONArray()))
            .optJSONArray("profiles")?.objects()?.map(::customerProfileFromJson).orEmpty()
        val profiles = current.customerProfiles.ifEmpty {
            runCatching {
                responseArray(rpc("pm_customer_profiles_v1", JSONObject()), "profiles").objects().map(::customerProfileFromJson)
            }.getOrElse { localProfiles }
        }
        val localProjects = readAccountJson("project-progress.json", JSONObject().put("projects", JSONArray()))
            .optJSONArray("projects")?.objects()?.map(::projectFromJson).orEmpty()
        val projects = current.projects.ifEmpty {
            runCatching {
                responseArray(rpc("pm_project_progress_v2", JSONObject()), "projects").objects().map(::projectFromJson)
            }.getOrElse { localProjects }
        }
        mutableState.update {
            it.copy(
                todos = filterTodos(items),
                customerProfiles = profiles.sortedBy { profile -> profile.name.lowercase() },
                projects = projects.sortedBy { project -> project.customerName.lowercase() },
            )
        }
    }

    fun newTodo() = mutableState.update { it.copy(todoDraft = TodoItem()) }
    fun editTodo(item: TodoItem) = mutableState.update { it.copy(todoDraft = item) }
    fun updateTodo(transform: (TodoItem) -> TodoItem) = mutableState.update { it.copy(todoDraft = it.todoDraft?.let(transform)) }
    fun cancelTodo() = mutableState.update { it.copy(todoDraft = null) }

    fun saveTodo() = run("保存待办") {
        val draft = normalizeTodo(mutableState.value.todoDraft ?: error("请先填写待办"))
        val now = java.time.OffsetDateTime.now().toString()
        val saved = draft.copy(id = draft.id ?: UUID.randomUUID().toString(), createdAt = draft.createdAt.ifBlank { now }, updatedAt = now)
        val items = mutableState.value.todos.filterNot { it.id == saved.id } + saved
        writeAccountJson("todos.json", JSONObject().put("version", 1).put("items", JSONArray(items.map { it.toJson() })))
        mutableState.update { it.copy(todos = items, todoDraft = null, message = "待办已保存到本账号设备") }
    }

    fun toggleTodo(item: TodoItem) = run("更新待办状态") {
        val status = if (item.completed) "open" else "completed"
        val saved = item.copy(status = status, updatedAt = java.time.OffsetDateTime.now().toString())
        val items = mutableState.value.todos.map { if (it.id == item.id) saved else it }
        writeAccountJson("todos.json", JSONObject().put("version", 1).put("items", JSONArray(items.map { it.toJson() })))
        mutableState.update { it.copy(todos = items, message = if (saved.completed) "待办已完成" else "待办已恢复") }
    }

    fun deleteTodo(item: TodoItem) = run("删除待办") {
        val items = mutableState.value.todos.filterNot { it.id == item.id }
        writeAccountJson("todos.json", JSONObject().put("version", 1).put("items", JSONArray(items.map { it.toJson() })))
        mutableState.update { it.copy(todos = items, message = "待办已删除") }
    }

    fun loadProjects() = run("读取项目进度") {
        val local = readAccountJson("project-progress.json", JSONObject().put("projects", JSONArray()))
        val localProjects = local.optJSONArray("projects")?.objects()?.map(::projectFromJson).orEmpty()
        val projects = runCatching {
            responseArray(rpc("pm_project_progress_v2", JSONObject()), "projects").objects().map(::projectFromJson)
        }.getOrElse { localProjects }
        mutableState.update { it.copy(projects = projects.sortedBy { row -> row.customerName.lowercase() }, projectImport = null) }
    }

    fun newProject() = mutableState.update { it.copy(projectDraft = ProjectProgressRecord()) }
    fun editProject(project: ProjectProgressRecord) = mutableState.update { it.copy(projectDraft = project) }
    fun updateProject(transform: (ProjectProgressRecord) -> ProjectProgressRecord) = mutableState.update { it.copy(projectDraft = it.projectDraft?.let(transform)) }
    fun cancelProject() = mutableState.update { it.copy(projectDraft = null) }

    private suspend fun saveProjectValue(project: ProjectProgressRecord, requireRemoteConfirmation: Boolean = false): ProjectProgressRecord {
        val payload = JSONObject()
            .put("p_project_id", project.projectId ?: JSONObject.NULL)
            .put("p_expected_revision", project.revision ?: JSONObject.NULL)
            .put("p_record", project.toJson())
        val savedResponse = try {
            rpc("pm_save_project_progress_v2", payload)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: ApiFailure) {
            if (requireRemoteConfirmation || failure.status == 409 || failure.code == "P0001" || failure.code == "snapshot_changed" || failure.code.contains("conflict", ignoreCase = true)) throw failure
            null
        } catch (failure: Exception) {
            if (requireRemoteConfirmation) throw failure
            null
        }
        if (requireRemoteConfirmation) {
            val result = savedResponse as? JSONObject ?: error("云端没有返回项目保存结果；请刷新后核对")
            val projectId = result.optNullableString("project_id") ?: error("云端项目保存结果缺少项目编号；请刷新后核对")
            val revision = result.optNullableInt("revision")?.takeIf { it > 0 }
                ?: error("云端项目保存结果缺少有效版本；请刷新后核对")
            return project.copy(projectId = projectId, revision = revision)
        }
        return project.copy(
            projectId = (savedResponse as? JSONObject)?.optString("project_id")?.takeIf { it.isNotBlank() } ?: project.projectId ?: UUID.randomUUID().toString(),
            revision = (savedResponse as? JSONObject)?.optInt("revision")?.takeIf { it > 0 } ?: (project.revision ?: 1),
        )
    }

    fun saveProject() = run("保存项目进度") {
        val project = normalizeProjectProgress(mutableState.value.projectDraft ?: error("请先填写项目进度"))
        val saved = saveProjectValue(project)
        val projects = mutableState.value.projects.filterNot { it.projectId == saved.projectId } + saved
        writeAccountJson("project-progress.json", JSONObject().put("schema", 2).put("projects", JSONArray(projects.map { it.toJson() })))
        mutableState.update { it.copy(projects = projects, projectDraft = null, message = "项目进度已保存，当前评分${scoreProjectProgress(saved).total}分（${scoreProjectProgress(saved).tier}档）") }
    }

    fun exportProjectProgress() = run("导出项目进度") {
        val template = context.assets.open("business_templates/project-progress-template.xlsx").use { it.readBytes() }
        mutableState.update { it.copy(artifact = files.xlsx("项目进度.xlsx", projectProgressXlsx(it.projects, template))) }
    }

    fun projectProgressTemplate() = run("生成项目进度模板") {
        val template = context.assets.open("business_templates/project-progress-template.xlsx").use { it.readBytes() }
        mutableState.update { it.copy(artifact = files.xlsx("项目进度导入模板.xlsx", projectProgressTemplateXlsx(template))) }
    }

    fun inspectProjectProgress(uri: Uri) = run("校验项目进度 XLSX") {
        val result = withContext(Dispatchers.IO) {
            val (file, name) = files.copyInput(uri)
            try {
                parseProjectProgressXlsx(file, name)
            } finally {
                file.delete()
            }
        }
        mutableState.update { it.copy(projectImport = result) }
    }

    fun commitProjectProgressImport() = run("导入项目进度") {
        val preview = mutableState.value.projectImport ?: error("请先选择项目进度模板")
        require(preview.errors.isEmpty()) { "项目进度模板存在错误，请修正后再导入" }
        require(preview.projects.isNotEmpty()) { "模板中没有项目进度" }
        var projects = mutableState.value.projects
        var remaining = preview.projects
        var imported = preview.imported
        while (remaining.isNotEmpty()) {
            val candidate = remaining.first()
            val saved = try {
                saveProjectValue(candidate, requireRemoteConfirmation = true)
            } catch (failure: Exception) {
                if (failure is CancellationException) throw failure
                if (imported > 0) {
                    throw IllegalStateException(
                        "项目进度导入已中断：已确认写入${imported}项，剩余${remaining.size}项预览已保留。${failure.message ?: "请刷新后核对云端结果"}",
                        failure,
                    )
                }
                throw failure
            }
            projects = projects.filterNot { it.projectId == saved.projectId } + saved
            remaining = remaining.drop(1)
            imported += 1
            val nextPreview = preview.copy(projects = remaining, imported = imported)
            mutableState.update { it.copy(projects = projects.sortedBy { row -> row.customerName.lowercase() }, projectImport = nextPreview) }
            writeAccountJson("project-progress.json", JSONObject().put("schema", 2).put("projects", JSONArray(projects.map { it.toJson() })))
        }
        mutableState.update { it.copy(projects = projects.sortedBy { row -> row.customerName.lowercase() }, projectImport = null, message = "项目进度已导入${imported}条") }
    }

    fun clearProjectProgressImport() = mutableState.update { it.copy(projectImport = null) }

    fun inspectBackup(uri: Uri) = run("校验完整备份") {
        val result = withContext(Dispatchers.IO) {
            val (file, name) = files.copyInput(uri, 128 * 1024 * 1024)
            try { Triple(file, name, files.readBackup(file)) } catch (failure: Exception) { file.delete(); throw failure }
        }
        restoredInput?.delete()
        restoredInput = result.first
        mutableState.update { it.copy(page = BusinessPage.BACKUP, restored = result.third, restoredName = result.second, backupQuery = "") }
    }

    fun restoreLocalBackup() = run("恢复本机备份资料库") {
        val input = restoredInput ?: error("请先选择备份并校验")
        val restored = mutableState.value.restored ?: error("备份尚未校验")
        withContext(Dispatchers.IO) {
            val artifact = files.backup(restored, "恢复库", accountDirectory())
            val manifest = File(accountDirectory(), "restored-library.json")
            val temporary = File(accountDirectory(), "restored-library.tmp")
            temporary.writeText(JSONObject().put("file", artifact.file.name).put("name", input.name).toString(), Charsets.UTF_8)
            check(temporary.renameTo(manifest)) { "本机恢复索引无法保存" }
        }
        mutableState.update { it.copy(message = "完整备份已恢复到本机资料库，可离线查阅；云端数据保持当前状态") }
    }

    fun openRestoredBackup() = run("打开本机恢复库") {
        val result = withContext(Dispatchers.IO) {
            val manifest = JSONObject(File(accountDirectory(), "restored-library.json").readText(Charsets.UTF_8))
            val file = File(accountDirectory(), manifest.getString("file"))
            require(file.canonicalFile.parentFile == accountDirectory().canonicalFile) { "恢复库路径无效" }
            Triple(file, manifest.optString("name", file.name), files.readBackup(file))
        }
        mutableState.update { it.copy(page = BusinessPage.BACKUP, restored = result.third, restoredName = result.second, backupQuery = "") }
    }

    fun exportRestoredBackup() = run("导出本机恢复库") {
        val source = mutableState.value.restored ?: error("请先打开备份")
        val artifact = withContext(Dispatchers.IO) { files.backup(source, "恢复库导出") }
        mutableState.update { it.copy(artifact = artifact) }
    }

    fun newDocument(kind: String, quote: QuoteRecord? = null, customer: String = "") = run("读取默认供方资料") {
        val supplier = withContext(Dispatchers.IO) { readSupplierFields() }
        val document = BusinessDocument.create(kind, quote, customer).withSupplier(supplier)
        mutableState.update { it.copy(page = BusinessPage.DOCUMENT_EDITOR, document = document,
            documentId = null, documentDirty = true, documentPreview = null, error = null, message = null) }
    }

    fun updateDocument(transform: (BusinessDocument) -> BusinessDocument) {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(document = it.document?.let(transform), documentDirty = true, documentPreview = null) }
    }

    fun loadDocuments() = run("读取单据草稿") { readDocuments() }

    private suspend fun readDocuments() {
        syncPendingDocuments()
        val local = withContext(Dispatchers.IO) {
            File(accountDirectory(), "documents").listFiles().orEmpty().filter { it.extension == "json" }.mapNotNull { file ->
                runCatching {
                    val root = JSONObject(file.readText(Charsets.UTF_8))
                    val document = BusinessDocument.fromJson(root)
                    DocumentEntry(
                        file.nameWithoutExtension, document.title, document.fields["buyer_name"].orEmpty(), document.fields["date"].orEmpty(),
                        kind = document.kind, remoteId = root.optNullableString("_remote_id"), revision = root.optNullableInt("_revision"),
                        syncStatus = root.optString("_sync_status", "local"),
                    )
                }.getOrNull()
            }.sortedByDescending { it.id }
        }
        val remote = runCatching {
            listOf("quotation", "contract").flatMap { kind ->
                val rows = responseArray(rpc("pm_business_document_list_v1", JSONObject().put("p_kind", kind)), "records").objects()
                rows.mapNotNull { row ->
                    val remoteId = row.optNullableString("document_id") ?: row.optNullableString("id") ?: return@mapNotNull null
                    val document = row.optJSONObject("document") ?: row.optJSONObject("payload") ?: return@mapNotNull null
                    val normalized = if (document.optInt("schema", 1) == 1) document else document.put("schema", 1)
                    val cacheId = "cloud-$remoteId"
                    withContext(Dispatchers.IO) {
                        val target = File(accountDirectory(), "documents/$cacheId.json").apply { parentFile?.mkdirs() }
                        val localStatus = runCatching {
                            if (target.exists()) JSONObject(target.readText(Charsets.UTF_8)).optString("_sync_status") else ""
                        }.getOrDefault("")
                        if (localStatus !in setOf("pending", "conflict", "error")) {
                            target.writeText(normalized.put("_remote_id", remoteId).put("_revision", row.optInt("revision", 1)).put("_sync_status", "synced").toString(), Charsets.UTF_8)
                        }
                    }
                    val parsed = BusinessDocument.fromJson(normalized)
                    DocumentEntry(cacheId, parsed.title, parsed.fields["buyer_name"].orEmpty(), parsed.fields["date"].orEmpty(), parsed.kind, remoteId, row.optInt("revision", 1), "synced")
                }
            }
        }.getOrElse { emptyList() }
        val merged = (local + remote).groupBy { it.remoteId ?: it.id }.values.map { entries ->
            entries.firstOrNull { it.syncStatus == "conflict" }
                ?: entries.firstOrNull { it.syncStatus == "pending" }
                ?: entries.firstOrNull { it.syncStatus == "error" }
                ?: entries.last()
        }.sortedWith(compareByDescending<DocumentEntry> { it.date }.thenByDescending { it.id })
        mutableState.update { it.copy(documents = merged) }
    }

    fun openDocument(id: String) = run("打开单据草稿") {
        require(Regex("[0-9a-zA-Z-]{1,100}").matches(id))
        val root = withContext(Dispatchers.IO) { JSONObject(File(accountDirectory(), "documents/$id.json").readText(Charsets.UTF_8)) }
        val document = BusinessDocument.fromJson(root)
        val entry = mutableState.value.documents.firstOrNull { it.id == id }
        mutableState.update { it.copy(page = BusinessPage.DOCUMENT_EDITOR, document = document, documentId = id,
            documentRemoteId = entry?.remoteId ?: root.optNullableString("_remote_id"),
            documentRevision = entry?.revision ?: root.optNullableInt("_revision"),
            documentSyncStatus = entry?.syncStatus ?: root.optString("_sync_status", "local"), documentDirty = false, documentPreview = null) }
    }

    fun deleteDocument(entry: DocumentEntry) = run("删除制作记录") {
        val file = File(accountDirectory(), "documents/${entry.id}.json")
        val root = withContext(Dispatchers.IO) { if (file.exists()) JSONObject(file.readText(Charsets.UTF_8)) else null }
        val document = root?.let { BusinessDocument.fromJson(it) }
        if (entry.remoteId != null && entry.revision != null) {
            try {
                rpc("pm_delete_business_document_v1", JSONObject().put("p_kind", entry.kind).put("p_document_id", entry.remoteId).put("p_expected_revision", entry.revision))
            } catch (failure: ApiFailure) {
                if (isDocumentConflict(failure)) {
                    val localDocument = document ?: throw failure
                    enqueueDocumentDelete(entry, localDocument, "conflict")
                    updateDocumentSyncState(entry.id, entry.remoteId, entry.revision, "conflict")
                    mutableState.update { state ->
                        state.copy(
                            documents = state.documents.map { row ->
                                if (row.id == entry.id || row.remoteId == entry.remoteId) row.copy(syncStatus = "conflict") else row
                            },
                            message = "云端版本已变化，本机制作记录已保留，请刷新后处理冲突",
                        )
                    }
                    return@run
                }
                if (document != null) enqueueDocumentDelete(entry, document)
            } catch (_: Exception) {
                if (document != null) enqueueDocumentDelete(entry, document)
            }
        }
        removeDocumentCopies(entry.id, entry.remoteId)
        mutableState.update { it.copy(documents = it.documents.filterNot { row -> row.id == entry.id || (entry.remoteId != null && row.remoteId == entry.remoteId) }, message = "制作记录已删除") }
    }

    fun saveDocument() = run("保存单据草稿") { saveDocumentNow() }

    fun saveSupplierProfile() = run("保存默认供方资料") {
        val document = mutableState.value.document ?: error("当前没有单据")
        val changes = checkedSupplierFields(document.fields)
        withContext(Dispatchers.IO) {
            val current = readSupplierFields().toMutableMap().apply { putAll(changes) }
            val directory = accountDirectory()
            val target = File(directory, "supplier.json")
            val temporary = File(directory, "supplier.tmp")
            temporary.writeText(JSONObject().put("schema", 1).put("fields", JSONObject(current)).toString(), Charsets.UTF_8)
            try {
                Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
            } catch (_: AtomicMoveNotSupportedException) {
                Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
            } finally {
                temporary.delete()
            }
        }
        mutableState.update { it.copy(message = "默认供方资料已保存，本账号新建报价单和合同将自动填入") }
    }

    private fun readSupplierFields(): Map<String, String> {
        val file = File(accountDirectory(), "supplier.json")
        if (!file.exists()) return emptyMap()
        require(file.length() in 1..200_000) { "已保存的供方信息文件过大，请检查文件" }
        val root = JSONObject(file.readText(Charsets.UTF_8))
        require(root.optInt("schema") == 1 && root.optJSONObject("fields") != null) { "已保存的供方信息格式无效，原文件已保留" }
        val fields = root.getJSONObject("fields").keys().asSequence().associateWith { root.getJSONObject("fields").getString(it) }
        return checkedSupplierFields(fields)
    }

    private suspend fun saveDocumentNow() {
        val current = mutableState.value
        val document = current.document ?: error("当前没有单据")
        val id = current.documentId ?: "${System.currentTimeMillis()}-${UUID.randomUUID()}"
        withContext(Dispatchers.IO) {
            val directory = File(accountDirectory(), "documents").apply { mkdirs() }
            val temporary = File(directory, "$id.tmp")
            temporary.writeText(document.json().put("_remote_id", current.documentRemoteId ?: JSONObject.NULL)
                .put("_revision", current.documentRevision ?: JSONObject.NULL).put("_sync_status", current.documentSyncStatus).toString(), Charsets.UTF_8)
            check(temporary.renameTo(File(directory, "$id.json"))) { "草稿无法保存" }
        }
        var remoteId = current.documentRemoteId
        var revision = current.documentRevision
        var status = "synced"
        var syncMessage = "草稿已保存到本机并已同步"
        try {
            val payload = JSONObject().put("p_document_id", remoteId ?: JSONObject.NULL).put("p_expected_revision", revision ?: JSONObject.NULL)
                .put("p_kind", document.kind).put("p_title", document.title).put("p_document", document.json())
            val saved = savedDocumentVersion(rpc("pm_save_business_document_v1", payload), remoteId, revision)
            remoteId = saved.first
            revision = saved.second
        } catch (failure: Exception) {
            status = if (isDocumentConflict(failure)) "conflict" else "pending"
            syncMessage = if (status == "conflict") "本机草稿已保存，但云端版本已变化，请打开桌面端或刷新后合并" else "本机草稿已保存，网络恢复后自动同步"
            enqueueDocumentSync(id, current.documentRemoteId, current.documentRevision, document, status)
        }
        withContext(Dispatchers.IO) {
            val file = File(accountDirectory(), "documents/$id.json")
            if (file.exists()) {
                val saved = JSONObject(file.readText(Charsets.UTF_8)).put("_remote_id", remoteId ?: JSONObject.NULL).put("_revision", revision ?: JSONObject.NULL).put("_sync_status", status)
                file.writeText(saved.toString(), Charsets.UTF_8)
            }
        }
        mutableState.update { it.copy(documentId = id, documentRemoteId = remoteId, documentRevision = revision, documentSyncStatus = status, documentDirty = false, message = syncMessage) }
        readDocuments()
    }

    private suspend fun enqueueDocumentSync(id: String, remoteId: String?, revision: Int?, document: BusinessDocument, status: String = "pending") {
        val root = readAccountJson("document-sync-pending.json", JSONObject().put("schema", 1).put("operations", JSONArray()))
        val operations = root.optJSONArray("operations")?.objects().orEmpty().filterNot { it.optString("local_id") == id }.toMutableList()
        operations += JSONObject().put("local_id", id).put("remote_id", remoteId ?: JSONObject.NULL).put("revision", revision ?: JSONObject.NULL)
            .put("kind", document.kind).put("title", document.title).put("document", document.json()).put("status", status)
        writeAccountJson("document-sync-pending.json", JSONObject().put("schema", 1).put("operations", JSONArray(operations)))
    }

    private suspend fun enqueueDocumentDelete(entry: DocumentEntry, document: BusinessDocument, status: String = "pending") {
        val root = readAccountJson("document-sync-pending.json", JSONObject().put("schema", 1).put("operations", JSONArray()))
        val operations = root.optJSONArray("operations")?.objects().orEmpty().filterNot { it.optString("local_id") == entry.id }.toMutableList()
        operations += JSONObject().put("operation", "delete").put("local_id", entry.id).put("remote_id", entry.remoteId)
            .put("revision", entry.revision).put("kind", entry.kind).put("title", document.title).put("document", document.json()).put("status", status)
        writeAccountJson("document-sync-pending.json", JSONObject().put("schema", 1).put("operations", JSONArray(operations)))
    }

    private suspend fun syncPendingDocuments() {
        val root = readAccountJson("document-sync-pending.json", JSONObject().put("schema", 1).put("operations", JSONArray()))
        val pending = root.optJSONArray("operations")?.objects().orEmpty()
        if (pending.isEmpty()) return
        val remaining = mutableListOf<JSONObject>()
        pending.forEach { operation ->
            if (operation.optString("status", "pending") != "pending") {
                remaining += operation
                return@forEach
            }
            try {
                if (operation.optString("operation", "save") == "delete") {
                    rpc("pm_delete_business_document_v1", JSONObject().put("p_kind", operation.getString("kind"))
                        .put("p_document_id", operation.optNullableString("remote_id") ?: JSONObject.NULL)
                        .put("p_expected_revision", operation.optNullableInt("revision") ?: JSONObject.NULL))
                    removeDocumentCopies(operation.getString("local_id"), operation.optNullableString("remote_id"))
                } else {
                    val payload = JSONObject().put("p_document_id", operation.optNullableString("remote_id") ?: JSONObject.NULL)
                        .put("p_expected_revision", operation.optNullableInt("revision") ?: JSONObject.NULL).put("p_kind", operation.getString("kind"))
                        .put("p_title", operation.getString("title")).put("p_document", operation.getJSONObject("document"))
                    val saved = savedDocumentVersion(
                        rpc("pm_save_business_document_v1", payload),
                        operation.optNullableString("remote_id"),
                        operation.optNullableInt("revision"),
                    )
                    updateDocumentSyncState(operation.getString("local_id"), saved.first, saved.second, "synced")
                    mutableState.update { state ->
                        if (state.documentId == operation.optString("local_id")) {
                            state.copy(documentRemoteId = saved.first, documentRevision = saved.second, documentSyncStatus = "synced")
                        } else state
                    }
                }
            } catch (failure: Exception) {
                if (isDocumentConflict(failure)) {
                    operation.put("status", "conflict")
                    if (operation.optString("operation", "save") == "delete") {
                        restoreConflictedDocument(operation)
                    } else {
                        updateDocumentSyncState(
                            operation.getString("local_id"), operation.optNullableString("remote_id"),
                            operation.optNullableInt("revision"), "conflict",
                        )
                        mutableState.update { state ->
                            if (state.documentId == operation.optString("local_id")) state.copy(documentSyncStatus = "conflict") else state
                        }
                    }
                }
                remaining += operation
            }
        }
        writeAccountJson("document-sync-pending.json", JSONObject().put("schema", 1).put("operations", JSONArray(remaining)))
    }

    private fun savedDocumentVersion(response: Any?, fallbackRemoteId: String?, fallbackRevision: Int?): Pair<String, Int> {
        val result = response as? JSONObject ?: error("制作记录保存响应无效")
        val nested = result.optJSONObject("document")
        val remoteId = result.optNullableString("id") ?: result.optNullableString("document_id")
            ?: nested?.optNullableString("document_id") ?: nested?.optNullableString("id") ?: fallbackRemoteId
            ?: error("制作记录保存响应缺少云端编号")
        val revision = result.optNullableInt("revision") ?: nested?.optNullableInt("revision") ?: fallbackRevision ?: 1
        require(revision >= 1) { "制作记录保存响应版本无效" }
        return remoteId to revision
    }

    private fun isDocumentConflict(failure: Exception): Boolean = failure is ApiFailure &&
        (failure.status == 409 || failure.code == "P0001" || failure.code == "snapshot_changed" || failure.code.contains("conflict", ignoreCase = true))

    private suspend fun updateDocumentSyncState(localId: String, remoteId: String?, revision: Int?, status: String) {
        withContext(Dispatchers.IO) {
            require(Regex("[0-9a-zA-Z-]{1,100}").matches(localId))
            val file = File(accountDirectory(), "documents/$localId.json")
            if (file.exists()) {
                val document = JSONObject(file.readText(Charsets.UTF_8))
                    .put("_remote_id", remoteId ?: JSONObject.NULL)
                    .put("_revision", revision ?: JSONObject.NULL)
                    .put("_sync_status", status)
                file.writeText(document.toString(), Charsets.UTF_8)
            }
        }
    }

    private suspend fun restoreConflictedDocument(operation: JSONObject) {
        val localId = operation.getString("local_id")
        withContext(Dispatchers.IO) {
            require(Regex("[0-9a-zA-Z-]{1,100}").matches(localId))
            val file = File(accountDirectory(), "documents/$localId.json").apply { parentFile?.mkdirs() }
            val document = JSONObject(operation.getJSONObject("document").toString())
                .put("_remote_id", operation.optNullableString("remote_id") ?: JSONObject.NULL)
                .put("_revision", operation.optNullableInt("revision") ?: JSONObject.NULL)
                .put("_sync_status", "conflict")
            file.writeText(document.toString(), Charsets.UTF_8)
        }
    }

    private suspend fun removeDocumentCopies(localId: String, remoteId: String?) {
        withContext(Dispatchers.IO) {
            require(Regex("[0-9a-zA-Z-]{1,100}").matches(localId))
            File(accountDirectory(), "documents").listFiles().orEmpty().filter { it.extension == "json" }.forEach { file ->
                val sameRemote = remoteId != null && runCatching {
                    JSONObject(file.readText(Charsets.UTF_8)).optNullableString("_remote_id") == remoteId
                }.getOrDefault(false)
                if (file.nameWithoutExtension == localId || sameRemote) file.delete()
            }
        }
    }

    fun previewDocument() = run("生成单据PDF") {
        val document = mutableState.value.document ?: error("当前没有单据")
        val artifact = withContext(Dispatchers.IO) { DocumentRenderer(context, files).render(document) }
        saveDocumentNow()
        mutableState.update { it.copy(documentPreview = artifact, artifact = artifact, message = "PDF已生成，共${if (document.kind == "quotation") document.items.size else (document.items.size + 1) / 2}页") }
    }

    fun exportWord() = run("生成单据Word") {
        val document = mutableState.value.document ?: error("当前没有单据")
        val artifact = withContext(Dispatchers.IO) { DocumentRenderer(context, files).renderWord(document) }
        mutableState.update { it.copy(artifact = artifact) }
        try {
            saveDocumentNow()
            mutableState.update { it.copy(message = "Word已生成，草稿已保存到本机") }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            mutableState.update { it.copy(error = "Word已生成；草稿保存失败：${failure.message.orEmpty().take(300)}") }
        }
    }

    fun exportDraft() = run("导出单据草稿") {
        val document = mutableState.value.document ?: error("当前没有单据")
        mutableState.update { it.copy(artifact = files.artifact("${document.title}-草稿.json", "application/json", document.json().toString(2).toByteArray(Charsets.UTF_8))) }
    }

    fun importDraft(uri: Uri) = run("导入单据草稿") {
        val document = withContext(Dispatchers.IO) {
            val (input, _) = files.copyInput(uri, 1024 * 1024)
            try { BusinessDocument.fromJson(JSONObject(input.readText(Charsets.UTF_8))) } finally { input.delete() }
        }
        mutableState.update { it.copy(page = BusinessPage.DOCUMENT_EDITOR, document = document, documentId = null, documentDirty = true, documentPreview = null) }
    }

    fun loginMes(username: String, password: String, rememberCredentials: Boolean = false) = run("登录MES") {
        withContext(Dispatchers.IO) { mes.login(username, password) }
        val credentialWarning = withContext(Dispatchers.IO) {
            mesCredentialPersistenceWarning(rememberCredentials) {
                if (rememberCredentials) preferences.saveMesCredentials(MesCredentials(username.trim(), password))
                else preferences.clearMesCredentials()
            }
        }
        mutableState.update {
            it.copy(inventoryLoggedIn = true, inventory = null, message = "MES已登录", error = credentialWarning)
        }
    }

    fun clearMesCredentials() = run("清除已保存MES登录信息") {
        withContext(Dispatchers.IO) { preferences.clearMesCredentials() }
        mutableState.update { it.copy(message = "已清除本机保存的MES登录信息") }
    }

    fun logoutMes() {
        mes.logout()
        mutableState.update { it.copy(inventoryLoggedIn = false, inventory = null) }
    }

    fun clearInventoryResult() {
        if (!mutableState.value.busy) mutableState.update { it.withoutInventoryResult() }
    }

    fun queryInventory(text: String, mode: String, page: Int = 1) {
        clearInventoryResult()
        run("查询库存") {
            val result = withContext(Dispatchers.IO) { mes.query(text, mode, page) }
            mutableState.update { it.copy(inventory = result) }
        }
    }

    fun exportInventory() = run("导出当前页库存") {
        val result = mutableState.value.inventory ?: error("请先查询库存")
        val headers = result.rows.firstOrNull()?.keys?.toList() ?: error("当前页没有库存记录")
        mutableState.update { it.copy(artifact = files.csv("库存-${result.query}-第${result.page}页.csv", headers, result.rows.map { row -> headers.map { row[it].orEmpty() } })) }
    }

    fun saveArtifact(uri: Uri, artifact: ExchangeArtifact) = run("保存文件") {
        withContext(Dispatchers.IO) { files.save(artifact, uri) }
        mutableState.update { it.copy(message = "文件已保存") }
    }

    fun reset() {
        task?.cancel()
        mes.logout()
        restoredInput?.delete()
        restoredInput = null
        mutableState.value = BusinessState()
    }
}
