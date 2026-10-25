package com.song123jian.pricequery.mobile

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.song123jian.pricequery.mobile.data.ApiFailure
import com.song123jian.pricequery.mobile.data.ApiResult
import com.song123jian.pricequery.mobile.data.CustomerRecord
import com.song123jian.pricequery.mobile.data.CustomerDetail
import com.song123jian.pricequery.mobile.data.ImageQuoteSource
import com.song123jian.pricequery.mobile.data.ImportRow
import com.song123jian.pricequery.mobile.data.MobileConfig
import com.song123jian.pricequery.mobile.data.MobilePreferences
import com.song123jian.pricequery.mobile.data.MobileSaveResult
import com.song123jian.pricequery.mobile.data.MobileSession
import com.song123jian.pricequery.mobile.data.MobileSnapshot
import com.song123jian.pricequery.mobile.data.PendingQuoteSave
import com.song123jian.pricequery.mobile.data.QuoteDraft
import com.song123jian.pricequery.mobile.data.QuoteFilters
import com.song123jian.pricequery.mobile.data.QuoteHistoryPage
import com.song123jian.pricequery.mobile.data.QuoteHistoryKey
import com.song123jian.pricequery.mobile.data.QuoteRecord
import com.song123jian.pricequery.mobile.data.SyncMeta
import com.song123jian.pricequery.mobile.data.VaultState
import com.song123jian.pricequery.mobile.data.validateQuoteFilters
import com.song123jian.pricequery.mobile.data.newRequestId
import com.song123jian.pricequery.mobile.data.validateDraft
import com.song123jian.pricequery.mobile.data.retainPendingSave
import com.song123jian.pricequery.mobile.data.needsIdentityFill
import com.song123jian.pricequery.mobile.data.validateIdentityFill
import com.song123jian.pricequery.mobile.data.matchingImageQuotes
import com.song123jian.pricequery.mobile.data.imageQuoteMatchError
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.time.LocalDate

enum class MobileScreen { LOGIN, QUOTES, CUSTOMERS, CUSTOMER_DETAIL, ACCOUNT, HISTORY, EDITOR, TOOLS }

data class MobileUiState(
    val projectUrl: String,
    val publishableKey: String,
    val username: String = "",
    val password: String = "",
    val accountName: String? = null,
    val screen: MobileScreen = MobileScreen.LOGIN,
    val quotes: List<QuoteRecord> = emptyList(),
    val customers: List<CustomerRecord> = emptyList(),
    val syncMeta: SyncMeta? = null,
    val lastSync: String? = null,
    val query: String = "",
    val filters: QuoteFilters = QuoteFilters(),
    val customerQuery: String = "",
    val filterError: String? = null,
    val loading: Boolean = false,
    val saving: Boolean = false,
    val errorMessage: String? = null,
    val syncStatus: String = "尚未连接",
    val draft: QuoteDraft? = null,
    val editingQuote: QuoteRecord? = null,
    val editorReturnScreen: MobileScreen = MobileScreen.QUOTES,
    val historyQuote: QuoteRecord? = null,
    val historyItems: List<QuoteRecord> = emptyList(),
    val historyHasMore: Boolean = false,
    val historyCursor: String? = null,
    val historyLoading: Boolean = false,
    val customerDetail: CustomerDetail? = null,
    val customerDetailLoading: Boolean = false,
    val pendingSave: PendingQuoteSave? = null,
    val pendingBusiness: org.json.JSONObject? = null,
    val pendingMessage: String? = null,
    val storageLocked: Boolean = false,
    val imageSource: ImageQuoteSource? = null,
    val imageReviewed: Boolean = false,
)

class MobileViewModel(context: Context) : ViewModel() {
    private val preferences = MobilePreferences(context.applicationContext)
    private val api = com.song123jian.pricequery.mobile.data.PmuApi()
    private val initialVault = runCatching { preferences.loadVault() }
    private val storageError = initialVault.exceptionOrNull()?.message
    private var vault: VaultState = initialVault.getOrDefault(VaultState())
    private var session: MobileSession? = vault.session
    private var pollingJob: Job? = null
    private val networkMutex = Mutex()
    private val vaultMutex = Mutex()
    private val refreshMutex = Mutex()
    private var foreground = false
    private val mutableState = MutableStateFlow(
        MobileUiState(
            projectUrl = preferences.config().projectUrl,
            publishableKey = preferences.config().publishableKey,
            pendingSave = vault.pendingSave,
            pendingBusiness = vault.pendingBusiness,
            storageLocked = storageError != null,
            errorMessage = storageError,
        ),
    )
    val state: StateFlow<MobileUiState> = mutableState.asStateFlow()
    val business: BusinessController by lazy {
        BusinessController(
            context.applicationContext, viewModelScope,
            rpc = { name, payload -> useSession { config, active -> api.businessRpc(config, active, name, payload) } },
            audit = { request -> useSession { config, active -> api.customerAudit(config, active, request) } },
            owner = { session?.userId },
            pending = { vault.pendingBusiness },
            savePending = { pending ->
                changeVault { it.copy(pendingBusiness = pending) }
                mutableState.update { it.copy(pendingBusiness = pending) }
            },
            writeAllowed = { storageError == null && session != null && vault.pendingSave == null && !mutableState.value.saving },
            changed = { refresh(force = true) },
        )
    }

    init {
        session?.let { restored ->
            mutableState.update { it.copy(screen = MobileScreen.QUOTES, accountName = restored.username, loading = true) }
            viewModelScope.launch { restoreSession(restored) }
        }
    }

    fun setProjectUrl(value: String) = mutableState.update { it.copy(projectUrl = value, errorMessage = storageError) }
    fun setPublishableKey(value: String) = mutableState.update { it.copy(publishableKey = value, errorMessage = storageError) }
    fun setUsername(value: String) = mutableState.update { it.copy(username = value, errorMessage = storageError) }
    fun setPassword(value: String) = mutableState.update { it.copy(password = value, errorMessage = storageError) }
    fun setQuery(value: String) = updateFilters { it.copy(query = value) }
    fun setCustomerFilter(value: String) = updateFilters { it.copy(customer = value) }
    fun setMaterialFilter(value: String) = updateFilters { it.copy(material = value) }
    fun setTaxFilter(value: String) = updateFilters { it.copy(tax = value) }
    fun setDateFrom(value: String) = updateFilters { it.copy(dateFrom = value) }
    fun setDateTo(value: String) = updateFilters { it.copy(dateTo = value) }
    fun setStaleOnly(value: Boolean) = updateFilters { it.copy(staleOnly = value) }
    fun resetFilters() = updateFilters { QuoteFilters() }
    fun setCustomerQuery(value: String) = mutableState.update { it.copy(customerQuery = value) }
    fun clearError() = mutableState.update { it.copy(errorMessage = storageError) }

    private fun updateFilters(transform: (QuoteFilters) -> QuoteFilters) {
        mutableState.update { state ->
            val filters = transform(state.filters)
            state.copy(
                query = filters.query,
                filters = filters,
                filterError = validateQuoteFilters(filters),
            )
        }
    }

    fun onForeground() {
        foreground = true
        if (session != null) {
            startPolling()
            refresh(force = false, silent = true)
        }
    }

    fun onBackground() {
        foreground = false
        pollingJob?.cancel()
    }

    fun login() {
        if (storageError != null) {
            mutableState.update { it.copy(errorMessage = storageError, password = "") }
            return
        }
        if (mutableState.value.loading) return
        val current = mutableState.value
        val config = try {
            api.validateConfig(MobileConfig(current.projectUrl, current.publishableKey))
        } catch (failure: ApiFailure) {
            mutableState.update { it.copy(errorMessage = failure.message, password = "") }
            return
        }
        val username = current.username
        val password = current.password
        mutableState.update { it.copy(loading = true, errorMessage = null, password = "") }
        viewModelScope.launch {
            try {
                preferences.saveConfig(config)
                val loggedIn = api.login(config, username, password)
                val pending = vault.pendingSave
                if ((pending != null && pending.ownerId != loggedIn.userId) ||
                    (vault.pendingBusiness != null && vault.pendingBusiness?.optString("owner_id") != loggedIn.userId)) {
                    api.logout(config, loggedIn)
                    throw ApiFailure("有一条尚未核对的保存请求，请使用原账号登录后先完成核对。", code = "pending_account_mismatch")
                }
                changeVault { it.copy(session = loggedIn) }
                session = loggedIn
                mutableState.update {
                    it.copy(
                        projectUrl = config.projectUrl,
                        publishableKey = config.publishableKey,
                        accountName = loggedIn.username,
                        screen = MobileScreen.QUOTES,
                        pendingSave = pending,
                        pendingMessage = pending?.let { "有一条保存请求尚未核对" },
                        loading = false,
                        syncStatus = "正在读取云端报价",
                        quotes = emptyList(),
                        customers = emptyList(),
                        syncMeta = null,
                        lastSync = null,
                    )
                }
                startPolling()
                refresh(force = true, silent = true)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                mutableState.update { it.copy(loading = false, errorMessage = failure.message ?: "登录失败，请重试") }
            }
        }
    }

    fun refresh(force: Boolean = true, silent: Boolean = false) {
        if (mutableState.value.loading || session == null) return
        viewModelScope.launch { refreshNow(force, silent) }
    }

    private suspend fun refreshNow(force: Boolean, silent: Boolean) {
        if (session == null || !refreshMutex.tryLock()) return
        if (!silent) mutableState.update { it.copy(loading = true, errorMessage = null) }
        try {
            val checked = useSession(api::syncMeta)
            val currentMeta = mutableState.value.syncMeta
            val needsSnapshot = force || !checked.sameVersion(currentMeta)
            if (needsSnapshot) {
                applySnapshot(useSession(api::snapshot))
            } else {
                mutableState.update { it.copy(syncMeta = checked, lastSync = nowClock(), syncStatus = "已同步") }
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            handleSessionFailure(failure)
            mutableState.update {
                it.copy(
                    loading = false,
                    syncStatus = "同步中断",
                    errorMessage = if (silent) it.errorMessage else failure.message ?: "读取云端数据失败",
                )
            }
        } finally {
            if (!silent) mutableState.update { it.copy(loading = false) }
            refreshMutex.unlock()
        }
    }

    fun openQuotes() = mutableState.update { it.copy(screen = MobileScreen.QUOTES, errorMessage = null) }
    fun openCustomers() = mutableState.update { it.copy(screen = MobileScreen.CUSTOMERS, errorMessage = null) }
    fun openAccount() = mutableState.update { it.copy(screen = MobileScreen.ACCOUNT, errorMessage = null) }
    fun openTools(page: BusinessPage = BusinessPage.MENU) {
        business.open(page)
        mutableState.update { it.copy(screen = MobileScreen.TOOLS, errorMessage = null) }
    }
    fun createDocument(kind: String, quote: QuoteRecord? = null) {
        business.newDocument(kind, quote)
        mutableState.update { it.copy(screen = MobileScreen.TOOLS, errorMessage = null) }
    }

    fun openCustomer(customer: CustomerRecord) = openCustomer(customer.customerKey, customer.displayName)

    fun openCustomer(customerKey: String, displayName: String) {
        if (customerKey.isBlank()) {
            mutableState.update { it.copy(errorMessage = "当前报价没有可用的客户编号，请先刷新云端数据") }
            return
        }
        val known = mutableState.value.customers.firstOrNull { it.customerKey == customerKey }
        mutableState.update {
            it.copy(
                screen = MobileScreen.CUSTOMER_DETAIL,
                customerDetail = known?.let { record -> CustomerDetail(record, emptyList(), record.specs, record.records, record.futureRecords) },
                customerDetailLoading = true,
                errorMessage = null,
            )
        }
        viewModelScope.launch {
            try {
                val result = useSession { config, active -> api.customerDetails(config, active, customerKey) }
                mutableState.update { state ->
                    if (state.screen == MobileScreen.CUSTOMER_DETAIL && state.customerDetail?.customer?.customerKey in setOf(null, customerKey)) {
                        state.copy(customerDetail = result, customerDetailLoading = false, errorMessage = null)
                    } else state
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                handleSessionFailure(failure)
                mutableState.update { state ->
                    state.copy(
                        customerDetailLoading = false,
                        errorMessage = failure.message ?: "读取客户详情失败",
                    )
                }
            }
        }
    }

    fun openCustomerForQuote(quote: QuoteRecord) = openCustomer(quote.customerKey, quote.customer)

    fun startNewQuote() = startQuoteEditor(MobileScreen.QUOTES)

    fun startNewCustomer() = startQuoteEditor(MobileScreen.CUSTOMERS)

    private fun startQuoteEditor(returnScreen: MobileScreen) {
        if (mutableState.value.saving || mutableState.value.storageLocked) return
        if (mutableState.value.syncMeta == null || mutableState.value.loading) {
            mutableState.update { it.copy(errorMessage = "请先完成一次云端同步") }
            return
        }
        if (vault.pendingSave != null || vault.pendingBusiness != null || business.state.value.busy) {
            mutableState.update { it.copy(errorMessage = "请先核对上一条保存请求") }
            return
        }
        val date = mutableState.value.syncMeta?.businessDate ?: LocalDate.now().toString()
        mutableState.update {
            it.copy(
                screen = MobileScreen.EDITOR,
                editingQuote = null,
                editorReturnScreen = returnScreen,
                draft = QuoteDraft(effectiveDate = date),
                imageSource = null,
                imageReviewed = false,
                errorMessage = null,
            )
        }
    }

    fun startEdit(quote: QuoteRecord) {
        if (vault.pendingSave != null || vault.pendingBusiness != null || business.state.value.busy) {
            mutableState.update { it.copy(errorMessage = "请先核对上一条保存请求") }
            return
        }
        mutableState.update {
            it.copy(
                screen = MobileScreen.EDITOR,
                editingQuote = quote,
                editorReturnScreen = MobileScreen.QUOTES,
                draft = QuoteDraft.fromQuote(quote),
                imageSource = null,
                imageReviewed = false,
                errorMessage = null,
            )
        }
    }

    fun updateDraft(transform: (QuoteDraft) -> QuoteDraft) {
        mutableState.update { state -> state.copy(draft = state.draft?.let(transform), imageReviewed = if (state.imageSource != null) false else state.imageReviewed, errorMessage = null) }
    }

    fun setImageQuoteSource(source: ImageQuoteSource?) = mutableState.update {
        it.copy(imageSource = source, imageReviewed = false, errorMessage = null)
    }

    fun setImageReviewAccepted(accepted: Boolean) = mutableState.update {
        it.copy(imageReviewed = accepted && it.imageSource != null, errorMessage = null)
    }

    fun applyImageQuoteCandidate(draft: QuoteDraft, source: ImageQuoteSource) {
        val current = mutableState.value
        if (current.saving) return
        if (vault.pendingSave != null || vault.pendingBusiness != null || business.state.value.busy) {
            mutableState.update { it.copy(errorMessage = "请先核对上一条保存请求") }
            return
        }
        val matches = matchingImageQuotes(current.quotes, draft)
        val quote = matches.singleOrNull()
        val conflict = quote?.let { imageQuoteMatchError(draft, it) }
        if (quote != null && conflict == null) startEdit(quote)
        val nextDraft = if (quote != null && conflict == null) {
            draft.copy(
                customer = quote.customer,
                grade = quote.grade,
                material = draft.material.ifBlank { quote.material },
                color = draft.color.ifBlank { quote.color },
                taxType = if (draft.taxType == "未注明") quote.taxType else draft.taxType,
                note = draft.note.ifBlank { quote.note },
                reason = "",
            )
        } else draft
        mutableState.update {
            it.copy(
                draft = nextDraft,
                editingQuote = quote?.takeIf { conflict == null },
                imageSource = source,
                imageReviewed = false,
                errorMessage = conflict ?: if (matches.size > 1) "图片报价匹配到多个颜色或税口径，请补全识别字段后再保存" else null,
            )
        }
    }

    fun cancelEditor() {
        if (!mutableState.value.saving) mutableState.update {
            it.copy(screen = it.editorReturnScreen, editorReturnScreen = MobileScreen.QUOTES, draft = null, editingQuote = null, imageSource = null, imageReviewed = false, errorMessage = null)
        }
    }

    fun saveQuote() {
        val current = mutableState.value
        val activeSession = session
        var draft = current.draft ?: return
        if (activeSession == null || current.saving) return
        if (vault.pendingSave != null || vault.pendingBusiness != null || business.state.value.busy) {
            mutableState.update { it.copy(errorMessage = "请先核对上一条保存请求") }
            return
        }
        val imageMatches = if (current.imageSource != null) matchingImageQuotes(current.quotes, draft) else emptyList()
        if (imageMatches.size > 1) {
            mutableState.update { it.copy(errorMessage = "图片报价匹配到多个颜色或税口径，请补全识别字段后再保存") }
            return
        }
        val base = current.editingQuote ?: imageMatches.singleOrNull()
        if (current.imageSource != null && current.editingQuote == null && base != null) {
            applyImageQuoteCandidate(draft, current.imageSource)
            return
        }
        if (current.imageSource != null && base != null) {
            imageQuoteMatchError(draft, base)?.let { message ->
                mutableState.update { it.copy(errorMessage = message) }
                return
            }
        }
        val fillIdentity = base != null && needsIdentityFill(base, draft)
        if (base != null && fillIdentity) {
            validateIdentityFill(base, draft)?.let { message ->
                mutableState.update { it.copy(errorMessage = message) }
                return
            }
        }
        if (current.imageSource != null && !current.imageReviewed) {
            mutableState.update { it.copy(errorMessage = "请先逐项对照原图并确认识别结果") }
            return
        }
        if (base != null && draft.reason.isBlank() && draft.price == base.price && draft.effectiveDate == base.effectiveDate) {
            if (fillIdentity) draft = draft.copy(reason = "補齊缺失字段")
            else if (draft.material != base.material || draft.note != base.note) draft = draft.copy(reason = "完善报价资料")
        }
        validateDraft(draft, base != null)?.let { message ->
            mutableState.update { it.copy(errorMessage = message) }
            return
        }
        val customerRevision = base?.customerRevision
            ?: current.customers.firstOrNull { it.displayName == draft.customer.trim() }?.revision
            ?: "0"
        val requestId = newRequestId()
        mutableState.update { it.copy(saving = true, errorMessage = null) }
        viewModelScope.launch {
            var submitted = false
            try {
                var historyKeys = emptyList<QuoteHistoryKey>()
                if (fillIdentity && base != null) {
                    mutableState.update { it.copy(pendingMessage = "正在保存补齐前的完整备份") }
                    business.backupBeforeQuoteFill()
                    mutableState.update { it.copy(pendingMessage = "正在读取并核对该规格的完整历史") }
                    historyKeys = readAllHistoryKeys(base, draft)
                }
                val pending = PendingQuoteSave(
                    ownerId = activeSession.userId,
                    requestId = requestId,
                    baseId = base?.id,
                    customerRevision = customerRevision,
                    draft = draft,
                    imageSource = current.imageSource,
                    historyKeys = historyKeys,
                )
                changeVault { it.copy(pendingSave = pending) }
                mutableState.update { it.copy(pendingSave = pending, pendingMessage = "正在保存并等待云端确认") }
                submitted = true
                completeSave(useSession { config, active -> api.save(config, active, pending) })
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                handleSessionFailure(failure)
                val uncertain = retainPendingSave(submitted, isRetry = false, failure)
                if (!uncertain && vault.pendingSave != null) {
                    try {
                        clearPending()
                    } catch (_: Exception) {
                        mutableState.update { it.copy(saving = false, errorMessage = "本机保存记录暂时无法更新，请保留原请求并检查存储空间") }
                        return@launch
                    }
                }
                mutableState.update {
                    it.copy(
                        saving = false,
                        errorMessage = failure.message ?: "保存失败",
                        pendingMessage = if (uncertain) "保存结果未确认，保留原请求编号后再核对" else null,
                    )
                }
            }
        }
    }

    private suspend fun readAllHistoryKeys(base: QuoteRecord, target: QuoteDraft): List<QuoteHistoryKey> {
        val result = mutableListOf<QuoteHistoryKey>()
        var cursor: String? = null
        var dataVersion: String? = null
        var hasMore: Boolean
        do {
            val page = useSession { config, active -> api.history(config, active, base.id, cursor) }
            if (page.identity != base.identity || page.items.any { it.customer != base.customer || it.grade != base.grade || it.identity != base.identity }) {
                throw ApiFailure("报价历史与当前规格不一致，请刷新后重试", code = "snapshot_changed")
            }
            if (dataVersion != null && dataVersion != page.meta.dataVersion) throw ApiFailure("读取期间云端报价已变化，请刷新后重试", code = "snapshot_changed")
            dataVersion = page.meta.dataVersion
            page.items.forEach { item ->
                val updatedKey = if (item.importKey.isBlank()) null else ImportRow(
                    customer = item.customer, grade = item.grade, material = item.material, color = target.color.trim(),
                    price = item.price, tax = target.taxType, date = item.effectiveDate, note = item.note, reason = item.reason,
                    file = item.sourceFile, sheet = item.sourceSheet, row = item.sourceRow,
                ).importKey
                result += QuoteHistoryKey(item.id, updatedKey)
                if (result.size > 5000) throw ApiFailure("该规格历史超过手机端补齐上限，请在电脑端完成", code = "history_too_large")
            }
            cursor = page.nextCursor
            hasMore = page.hasMore
            if (hasMore && cursor.isNullOrBlank()) throw ApiFailure("报价历史分页游标缺失，尚未提交补齐", code = "invalid_history")
        } while (hasMore)
        if (result.isEmpty() || result.none { it.id == base.id }) throw ApiFailure("未能读取完整报价历史，尚未提交补齐", code = "invalid_history")
        return result
    }

    fun openHistory(quote: QuoteRecord) {
        if (session == null) return
        mutableState.update {
            it.copy(
                screen = MobileScreen.HISTORY,
                historyQuote = quote,
                historyItems = emptyList(),
                historyHasMore = false,
                historyCursor = null,
                historyLoading = true,
                errorMessage = null,
            )
        }
        viewModelScope.launch {
            try {
                val result = useSession { config, active -> api.history(config, active, quote.id, null) }
                if (mutableState.value.historyQuote?.id == quote.id) applyHistoryPage(result, append = false)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                handleSessionFailure(failure)
                mutableState.update { it.copy(historyLoading = false, errorMessage = failure.message ?: "读取报价历史失败") }
            }
        }
    }

    fun loadOlderHistory() {
        val current = mutableState.value
        val quote = current.historyQuote ?: return
        val cursor = current.historyCursor ?: return
        val activeSession = session ?: return
        if (current.historyLoading) return
        mutableState.update { it.copy(historyLoading = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                val result = useSession { config, active -> api.history(config, active, quote.id, cursor) }
                if (mutableState.value.historyQuote?.id == quote.id) applyHistoryPage(result, append = true)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                handleSessionFailure(failure)
                mutableState.update { it.copy(historyLoading = false, errorMessage = failure.message ?: "读取更多历史失败") }
            }
        }
    }

    fun loadAllHistory() {
        val first = mutableState.value
        val quote = first.historyQuote ?: return
        if (first.historyLoading || !first.historyHasMore) return
        mutableState.update { it.copy(historyLoading = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                var cursor = mutableState.value.historyCursor
                var hasMore = mutableState.value.historyHasMore
                while (hasMore && cursor != null && mutableState.value.historyQuote?.id == quote.id) {
                    val page = useSession { config, active -> api.history(config, active, quote.id, cursor) }
                    applyHistoryPage(page, append = true)
                    cursor = mutableState.value.historyCursor
                    hasMore = mutableState.value.historyHasMore
                }
                mutableState.update { it.copy(historyLoading = false) }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                handleSessionFailure(failure)
                mutableState.update { it.copy(historyLoading = false, errorMessage = failure.message ?: "读取全部历史失败") }
            }
        }
    }

    fun recoverPending() {
        val pending = vault.pendingSave ?: return
        val activeSession = session ?: return
        if (activeSession.userId != pending.ownerId || mutableState.value.saving) return
        mutableState.update { it.copy(saving = true, errorMessage = null, pendingMessage = "正在核对原请求编号") }
        viewModelScope.launch {
            try {
                completeSave(useSession { config, active -> api.recover(config, active, pending) })
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                handleSessionFailure(failure)
                val notFound = (failure as? ApiFailure)?.code == "not_found"
                mutableState.update {
                    it.copy(
                        saving = false,
                        errorMessage = if (notFound) null else failure.message ?: "核对失败",
                        pendingMessage = if (notFound) "云端暂未查到结果，可用同一请求编号重试" else "核对未完成，请保留原请求编号",
                    )
                }
            }
        }
    }

    fun retryPending() {
        val pending = vault.pendingSave ?: return
        val activeSession = session ?: return
        if (activeSession.userId != pending.ownerId || mutableState.value.saving) return
        mutableState.update { it.copy(saving = true, errorMessage = null, pendingMessage = "正在用原请求编号重试") }
        viewModelScope.launch {
            try {
                completeSave(useSession { config, active -> api.save(config, active, pending) })
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                handleSessionFailure(failure)
                val keepPending = retainPendingSave(submitted = true, isRetry = true, failure = failure)
                mutableState.update {
                    it.copy(
                        saving = false,
                        errorMessage = failure.message ?: "重试失败",
                        pendingSave = if (keepPending) pending else null,
                        pendingMessage = if (keepPending) "原保存结果仍需核对，请保留原请求编号" else null,
                    )
                }
            }
        }
    }

    fun logout() {
        if (mutableState.value.loading || mutableState.value.saving || business.state.value.busy) return
        if (vault.pendingSave != null || vault.pendingBusiness != null) {
            mutableState.update { it.copy(errorMessage = "仍有一条保存结果未核对，完成核对后才能退出账号") }
            return
        }
        val config = preferences.config()
        mutableState.update { it.copy(loading = true) }
        pollingJob?.cancel()
        viewModelScope.launch {
            try {
                networkMutex.withLock {
                    session?.let { api.logout(config, it) }
                    changeVault { VaultState() }
                    session = null
                }
                business.reset()
                showLogin(null)
            } catch (_: Exception) {
                mutableState.update { it.copy(loading = false, errorMessage = "本机退出状态无法保存，请检查存储空间后重试") }
            }
        }
    }

    private suspend fun restoreSession(original: MobileSession) {
        try {
            val restored = useSession(api::restore)
            mutableState.update { it.copy(accountName = restored, screen = MobileScreen.QUOTES, loading = false) }
            startPolling()
            refreshNow(force = true, silent = true)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            if ((failure as? ApiFailure)?.status in setOf(401, 403)) {
                handleSessionFailure(failure)
            } else {
                mutableState.update { it.copy(screen = MobileScreen.QUOTES, accountName = original.username, loading = false, syncStatus = "同步中断", errorMessage = failure.message) }
                startPolling()
            }
        }
    }

    private fun startPolling() {
        pollingJob?.cancel()
        if (!foreground) return
        pollingJob = viewModelScope.launch {
            while (isActive) {
                delay(15_000)
                refreshNow(force = false, silent = true)
            }
        }
    }

    private suspend fun acceptSession(value: MobileSession) {
        if (session != value) {
            changeVault { it.copy(session = value) }
            session = value
        }
    }

    private suspend fun <T> useSession(call: suspend (MobileConfig, MobileSession) -> ApiResult<T>): T = networkMutex.withLock {
        val config = preferences.config()
        val current = session ?: throw ApiFailure("请先登录", 401, "session_expired")
        val fresh = withContext(NonCancellable) {
            val refreshed = api.freshSession(config, current)
            acceptSession(refreshed)
            refreshed
        }
        val result = call(config, fresh)
        acceptSession(result.session)
        result.value
    }

    private suspend fun changeVault(transform: (VaultState) -> VaultState) = vaultMutex.withLock {
        val updated = transform(vault)
        withContext(Dispatchers.IO) { preferences.saveVault(updated) }
        vault = updated
    }

    private suspend fun applySnapshot(snapshot: MobileSnapshot) {
        if (snapshot.ownerId != session?.userId) throw ApiFailure("云端数据账号与当前登录账号不一致", code = "owner_mismatch")
        val timestamp = nowClock()
        mutableState.update {
            it.copy(
                quotes = snapshot.quotes,
                customers = snapshot.customers,
                syncMeta = snapshot.meta,
                lastSync = timestamp,
                syncStatus = "已同步",
                loading = false,
                errorMessage = null,
            )
        }
    }

    private fun applyHistoryPage(page: QuoteHistoryPage, append: Boolean) {
        mutableState.update { current ->
            val combined = if (append) current.historyItems + page.items else page.items
            current.copy(
                historyItems = combined.distinctBy { it.id },
                historyHasMore = page.hasMore,
                historyCursor = page.nextCursor,
                historyLoading = false,
                errorMessage = null,
            )
        }
    }

    private suspend fun completeSave(result: MobileSaveResult) {
        clearPending()
        mutableState.update {
            it.copy(
                screen = it.editorReturnScreen,
                customerQuery = if (it.editorReturnScreen == MobileScreen.CUSTOMERS) "" else it.customerQuery,
                editorReturnScreen = MobileScreen.QUOTES,
                draft = null,
                editingQuote = null,
                imageSource = null,
                imageReviewed = false,
                saving = false,
                pendingMessage = null,
                errorMessage = null,
                syncStatus = result.message,
            )
        }
        refresh(force = true, silent = true)
    }

    private suspend fun clearPending() {
        changeVault { it.copy(pendingSave = null) }
        mutableState.update { it.copy(pendingSave = null) }
    }

    private suspend fun handleSessionFailure(failure: Exception) {
        if ((failure as? ApiFailure)?.status in setOf(401, 403)) {
            session = null
            pollingJob?.cancel()
            val stored = runCatching { changeVault { it.copy(session = null) } }.isSuccess
            showLogin(if (stored) failure.message else "登录失效，本机状态未能更新，请检查存储空间")
        }
    }

    private fun showLogin(message: String?) {
        business.reset()
        mutableState.update {
            MobileUiState(
                projectUrl = it.projectUrl,
                publishableKey = it.publishableKey,
                pendingSave = vault.pendingSave,
                pendingBusiness = vault.pendingBusiness,
                pendingMessage = vault.pendingSave?.let { "原保存结果仍需核对" },
                filters = QuoteFilters(),
                customerQuery = "",
                filterError = null,
                customerDetail = null,
                customerDetailLoading = false,
                errorMessage = message ?: storageError,
                storageLocked = storageError != null,
            )
        }
    }

    private fun nowClock(): String = java.time.LocalTime.now().withNano(0).toString()

    class Factory(private val context: Context) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            if (!modelClass.isAssignableFrom(MobileViewModel::class.java)) throw IllegalArgumentException("Unknown ViewModel")
            return MobileViewModel(context) as T
        }
    }
}
