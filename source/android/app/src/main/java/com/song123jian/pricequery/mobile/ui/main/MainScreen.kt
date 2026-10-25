package com.song123jian.pricequery.mobile.ui.main

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Paint as NativePaint
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Build
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.testTag
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.song123jian.pricequery.mobile.BusinessPage
import com.song123jian.pricequery.mobile.MobileScreen
import com.song123jian.pricequery.mobile.MobileUiState
import com.song123jian.pricequery.mobile.MobileViewModel
import com.song123jian.pricequery.mobile.data.CustomerDetail
import com.song123jian.pricequery.mobile.data.CustomerRecord
import com.song123jian.pricequery.mobile.data.ImageQuoteCandidate
import com.song123jian.pricequery.mobile.data.ImageQuoteRecognition
import com.song123jian.pricequery.mobile.data.ImageQuoteRecognizer
import com.song123jian.pricequery.mobile.data.ImageQuoteSource
import com.song123jian.pricequery.mobile.data.QuoteDraft
import com.song123jian.pricequery.mobile.data.QuoteFilters
import com.song123jian.pricequery.mobile.data.QuoteRecord
import com.song123jian.pricequery.mobile.data.QuoteSortField
import com.song123jian.pricequery.mobile.data.TAX_TYPES
import com.song123jian.pricequery.mobile.data.customerDetailCsv
import com.song123jian.pricequery.mobile.data.filterQuotes
import com.song123jian.pricequery.mobile.data.matchingImageQuotes
import com.song123jian.pricequery.mobile.data.normalizeSearch
import com.song123jian.pricequery.mobile.data.quotesCsv
import com.song123jian.pricequery.mobile.data.sortQuotes
import java.math.BigDecimal
import java.time.LocalDate
import org.json.JSONObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun MobileApp() {
    val context = LocalContext.current
    val model: MobileViewModel = viewModel(factory = MobileViewModel.Factory(context))
    LifecycleStartEffect(model) {
        model.onForeground()
        onStopOrDispose { model.onBackground() }
    }
    val state by model.state.collectAsStateWithLifecycle()
    MobileAppContent(state, model)
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
internal fun MobileAppContent(state: MobileUiState, model: MobileViewModel) {
    val business by model.business.state.collectAsStateWithLifecycle()
    val quoteSubPage = state.screen in setOf(MobileScreen.EDITOR, MobileScreen.HISTORY, MobileScreen.CUSTOMER_DETAIL)
    val businessEditor = state.screen == MobileScreen.TOOLS && business.page == BusinessPage.DOCUMENT_EDITOR
    val subPage = quoteSubPage || businessEditor
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var confirmBusinessBack by rememberSaveable { mutableStateOf(false) }
    BackHandler(enabled = quoteSubPage || state.screen == MobileScreen.ACCOUNT) {
        when (state.screen) {
            MobileScreen.EDITOR -> model.cancelEditor()
            MobileScreen.HISTORY -> model.openQuotes()
            MobileScreen.CUSTOMER_DETAIL -> model.openCustomers()
            MobileScreen.ACCOUNT -> model.openQuotes()
            else -> Unit
        }
    }
    fun requestBusinessBack() {
        if (business.documentDirty) confirmBusinessBack = true else model.business.back()
    }
    fun navigate(destination: AppDestination) {
        when (destination) {
            AppDestination.QUOTES -> model.openQuotes()
            AppDestination.NEW_QUOTE -> model.startNewQuote()
            AppDestination.CUSTOMERS -> model.openCustomers()
            AppDestination.DATA -> model.openTools(BusinessPage.DATA)
            AppDestination.IMPORT -> model.openTools(BusinessPage.IMPORT)
            AppDestination.RECYCLE -> model.openTools(BusinessPage.RECYCLE)
            AppDestination.DOCUMENTS -> model.openTools(BusinessPage.DOCUMENTS)
            AppDestination.NEW_QUOTATION -> model.createDocument("quotation")
            AppDestination.NEW_CONTRACT -> model.createDocument("contract")
            AppDestination.INVENTORY -> model.openTools(BusinessPage.INVENTORY)
            AppDestination.BACKUP -> model.openTools(BusinessPage.BACKUP)
            AppDestination.CUSTOMER_PROFILES -> model.openTools(BusinessPage.CUSTOMER_PROFILES)
            AppDestination.TODOS -> model.openTools(BusinessPage.TODOS)
            AppDestination.PROJECT_PROGRESS -> model.openTools(BusinessPage.PROJECT_PROGRESS)
            AppDestination.ACCOUNT -> model.openAccount()
        }
    }
    fun selected(destination: AppDestination): Boolean = when (destination) {
        AppDestination.QUOTES -> state.screen == MobileScreen.QUOTES
        AppDestination.NEW_QUOTE -> state.screen == MobileScreen.EDITOR && state.editingQuote == null && state.editorReturnScreen == MobileScreen.QUOTES
        AppDestination.CUSTOMERS -> state.screen in setOf(MobileScreen.CUSTOMERS, MobileScreen.CUSTOMER_DETAIL) ||
            (state.screen == MobileScreen.EDITOR && state.editorReturnScreen == MobileScreen.CUSTOMERS)
        AppDestination.DATA -> state.screen == MobileScreen.TOOLS && business.page == BusinessPage.DATA
        AppDestination.IMPORT -> state.screen == MobileScreen.TOOLS && business.page == BusinessPage.IMPORT
        AppDestination.RECYCLE -> state.screen == MobileScreen.TOOLS && business.page == BusinessPage.RECYCLE
        AppDestination.DOCUMENTS -> state.screen == MobileScreen.TOOLS && business.page == BusinessPage.DOCUMENTS
        AppDestination.NEW_QUOTATION -> state.screen == MobileScreen.TOOLS && business.page == BusinessPage.DOCUMENT_EDITOR && business.document?.kind == "quotation"
        AppDestination.NEW_CONTRACT -> state.screen == MobileScreen.TOOLS && business.page == BusinessPage.DOCUMENT_EDITOR && business.document?.kind == "contract"
        AppDestination.INVENTORY -> state.screen == MobileScreen.TOOLS && business.page == BusinessPage.INVENTORY
        AppDestination.BACKUP -> state.screen == MobileScreen.TOOLS && business.page == BusinessPage.BACKUP
        AppDestination.CUSTOMER_PROFILES -> state.screen == MobileScreen.TOOLS && business.page == BusinessPage.CUSTOMER_PROFILES
        AppDestination.TODOS -> state.screen == MobileScreen.TOOLS && business.page == BusinessPage.TODOS
        AppDestination.PROJECT_PROGRESS -> state.screen == MobileScreen.TOOLS && business.page == BusinessPage.PROJECT_PROGRESS
        AppDestination.ACCOUNT -> state.screen == MobileScreen.ACCOUNT
    }
    if (state.screen == MobileScreen.LOGIN) {
        LoginScreen(
            state = state,
            onProjectUrlChange = model::setProjectUrl,
            onPublishableKeyChange = model::setPublishableKey,
            onUsernameChange = model::setUsername,
            onPasswordChange = model::setPassword,
            onLogin = model::login,
        )
        return
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = !subPage && !state.saving && !business.busy,
        drawerContent = {
            ModalDrawerSheet {
                Column(
                    Modifier.fillMaxHeight().verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Text("工作", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                    Text(state.accountName.orEmpty(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
                    HorizontalDivider(Modifier.padding(vertical = 8.dp))
                    Text("报价", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 16.dp, top = 6.dp, bottom = 2.dp))
                    AppDrawerItem("报价查询", Icons.AutoMirrored.Filled.List, selected(AppDestination.QUOTES), !state.saving && !business.busy, "drawer-quotes") {
                        scope.launch { drawerState.close(); navigate(AppDestination.QUOTES) }
                    }
                    AppDrawerItem("新增报价", Icons.Default.Add, selected(AppDestination.NEW_QUOTE), !state.saving && !business.busy, "drawer-new-quote") {
                        scope.launch { drawerState.close(); navigate(AppDestination.NEW_QUOTE) }
                    }
                    AppDrawerItem("客户目录", Icons.Default.Person, selected(AppDestination.CUSTOMERS), !state.saving && !business.busy, "drawer-customers") {
                        scope.launch { drawerState.close(); navigate(AppDestination.CUSTOMERS) }
                    }
                    Text("业务", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 16.dp, top = 14.dp, bottom = 2.dp))
                    AppDrawerItem("数据管理", Icons.Default.Settings, selected(AppDestination.DATA), !state.saving && !business.busy, "drawer-data") {
                        scope.launch { drawerState.close(); navigate(AppDestination.DATA) }
                    }
                    AppDrawerItem("导入报价", Icons.Default.Share, selected(AppDestination.IMPORT), !state.saving && !business.busy, "drawer-import") {
                        scope.launch { drawerState.close(); navigate(AppDestination.IMPORT) }
                    }
                    AppDrawerItem("客户回收站", Icons.Default.Refresh, selected(AppDestination.RECYCLE), !state.saving && !business.busy, "drawer-recycle") {
                        scope.launch { drawerState.close(); navigate(AppDestination.RECYCLE) }
                    }
                    AppDrawerItem("报价单与合同", Icons.Default.Build, selected(AppDestination.DOCUMENTS), !state.saving && !business.busy, "drawer-documents") {
                        scope.launch { drawerState.close(); navigate(AppDestination.DOCUMENTS) }
                    }
                    AppDrawerItem("新建报价单", Icons.Default.Add, selected(AppDestination.NEW_QUOTATION), !state.saving && !business.busy, "drawer-new-quotation") {
                        scope.launch { drawerState.close(); navigate(AppDestination.NEW_QUOTATION) }
                    }
                    AppDrawerItem("新建购销合同", Icons.Default.Build, selected(AppDestination.NEW_CONTRACT), !state.saving && !business.busy, "drawer-new-contract") {
                        scope.launch { drawerState.close(); navigate(AppDestination.NEW_CONTRACT) }
                    }
                    AppDrawerItem("库存与批号备货", Icons.Default.Build, selected(AppDestination.INVENTORY), !state.saving && !business.busy, "drawer-inventory") {
                        scope.launch { drawerState.close(); navigate(AppDestination.INVENTORY) }
                    }
                    AppDrawerItem("客户档案", Icons.Default.Person, selected(AppDestination.CUSTOMER_PROFILES), !state.saving && !business.busy, "drawer-customer-profiles") {
                        scope.launch { drawerState.close(); navigate(AppDestination.CUSTOMER_PROFILES) }
                    }
                    AppDrawerItem("待办事项", Icons.Default.Build, selected(AppDestination.TODOS), !state.saving && !business.busy, "drawer-todos") {
                        scope.launch { drawerState.close(); navigate(AppDestination.TODOS) }
                    }
                    AppDrawerItem("项目进度", Icons.Default.Settings, selected(AppDestination.PROJECT_PROGRESS), !state.saving && !business.busy, "drawer-project-progress") {
                        scope.launch { drawerState.close(); navigate(AppDestination.PROJECT_PROGRESS) }
                    }
                    AppDrawerItem("备份与恢复", Icons.Default.Settings, selected(AppDestination.BACKUP), !state.saving && !business.busy, "drawer-backup") {
                        scope.launch { drawerState.close(); navigate(AppDestination.BACKUP) }
                    }
                    HorizontalDivider(Modifier.padding(vertical = 8.dp))
                    AppDrawerItem("账户与同步", Icons.Default.AccountCircle, selected(AppDestination.ACCOUNT), !state.saving && !business.busy, "drawer-account") {
                        scope.launch { drawerState.close(); navigate(AppDestination.ACCOUNT) }
                    }
                }
            }
        },
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text(
                                when (state.screen) {
                                    MobileScreen.QUOTES -> "报价查询"
                                    MobileScreen.CUSTOMERS -> "客户目录"
                                    MobileScreen.CUSTOMER_DETAIL -> "客户详情"
                                    MobileScreen.ACCOUNT -> "账户与同步"
                                    MobileScreen.HISTORY -> "报价历史"
                                    MobileScreen.EDITOR -> when {
                                        state.editingQuote != null -> "编辑报价"
                                        state.editorReturnScreen == MobileScreen.CUSTOMERS -> "新增客户"
                                        else -> "新增报价"
                                    }
                                    MobileScreen.LOGIN -> "登录"
                                    MobileScreen.TOOLS -> when (business.page) {
                                        BusinessPage.DATA -> "数据管理"
                                        BusinessPage.IMPORT -> "导入报价"
                                        BusinessPage.RECYCLE -> "客户回收站"
                                        BusinessPage.DOCUMENTS -> "报价单与合同"
                                        BusinessPage.DOCUMENT_EDITOR -> business.document?.title ?: "单据编辑"
                                        BusinessPage.INVENTORY -> "库存与批号备货"
                                        BusinessPage.BACKUP -> "备份与恢复"
                                        BusinessPage.CUSTOMER_PROFILES -> "客户档案"
                                        BusinessPage.TODOS -> "待办事项"
                                        BusinessPage.PROJECT_PROGRESS -> "项目进度"
                                        BusinessPage.MENU -> "业务操作"
                                    }
                                },
                            )
                            if (!subPage) Text(state.syncStatus, style = MaterialTheme.typography.labelSmall)
                        }
                    },
                    navigationIcon = {
                        if (subPage) {
                            val onBack = when (state.screen) {
                                MobileScreen.HISTORY -> model::openQuotes
                                MobileScreen.CUSTOMER_DETAIL -> model::openCustomers
                                MobileScreen.TOOLS -> ::requestBusinessBack
                                else -> model::cancelEditor
                            }
                            IconButton(onClick = onBack, enabled = !state.saving && !business.busy) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                            }
                        } else {
                            IconButton(onClick = { scope.launch { drawerState.open() } }, enabled = !state.saving && !business.busy) {
                                Icon(Icons.AutoMirrored.Filled.List, contentDescription = "打开导航菜单")
                            }
                        }
                    },
                    actions = {
                        if (!subPage) {
                            IconButton(onClick = { model.refresh() }, enabled = !state.loading) {
                                if (state.loading) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                                else Icon(Icons.Default.Refresh, contentDescription = "立即同步")
                            }
                        }
                    },
                )
            },
        ) { insets ->
            Column(Modifier.fillMaxSize().padding(insets)) {
                state.errorMessage?.let { Notice(it, isError = true, onDismiss = model::clearError) }
                if (state.pendingSave != null) PendingSaveNotice(state, model)
                if (state.pendingBusiness != null && state.screen != MobileScreen.TOOLS) {
                    TextButton(onClick = { model.openTools() }, modifier = Modifier.fillMaxWidth()) { Text("有业务操作待核对，查看原请求") }
                }
                if (state.screen != MobileScreen.TOOLS) {
                    BusinessMessages(business, model.business)
                    ArtifactActions(business, model.business)
                }
                when (state.screen) {
                    MobileScreen.QUOTES -> QuotesScreen(state, model, Modifier.weight(1f))
                    MobileScreen.CUSTOMERS -> CustomersScreen(state, model, Modifier.weight(1f))
                    MobileScreen.CUSTOMER_DETAIL -> CustomerDetailScreen(state, model, Modifier.weight(1f))
                    MobileScreen.ACCOUNT -> AccountScreen(state, model, Modifier.weight(1f))
                    MobileScreen.HISTORY -> HistoryScreen(state, model, Modifier.weight(1f))
                    MobileScreen.EDITOR -> EditorScreen(state, model, Modifier.weight(1f))
                    MobileScreen.LOGIN -> Unit
                    MobileScreen.TOOLS -> BusinessScreen(
                        state, business, model.business, Modifier.weight(1f), ::requestBusinessBack,
                        onCustomerProfileQuotes = { customer -> model.openQuotes(); model.setCustomerFilter(customer); model.refresh(force = true) },
                        onCustomerProfileProject = { profile ->
                            model.openTools(BusinessPage.PROJECT_PROGRESS)
                            model.business.newProjectForProfile(profile)
                        },
                        onCustomerProfileTodo = { profile ->
                            model.openTools(BusinessPage.TODOS)
                            model.business.newTodoForProfile(profile)
                        },
                    )
                }
            }
        }
    }
    if (confirmBusinessBack) AlertDialog(
        onDismissRequest = { confirmBusinessBack = false },
        title = { Text("单据尚未保存") },
        text = { Text("返回单据列表会离开当前未保存内容。") },
        confirmButton = { TextButton(onClick = { confirmBusinessBack = false; model.business.back() }) { Text("离开") } },
        dismissButton = { TextButton(onClick = { confirmBusinessBack = false }) { Text("继续编辑") } },
    )
}

private enum class AppDestination {
    QUOTES, NEW_QUOTE, CUSTOMERS, DATA, IMPORT, RECYCLE, DOCUMENTS, NEW_QUOTATION, NEW_CONTRACT, INVENTORY, CUSTOMER_PROFILES, TODOS, PROJECT_PROGRESS, BACKUP, ACCOUNT,
}

@Composable
private fun AppDrawerItem(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    enabled: Boolean,
    tag: String,
    onClick: () -> Unit,
) {
    NavigationDrawerItem(
        label = { Text(label) },
        icon = { Icon(icon, contentDescription = null) },
        selected = selected,
        onClick = { if (enabled) onClick() },
        modifier = Modifier.alpha(if (enabled) 1f else 0.38f).testTag(tag),
    )
}

@Composable
internal fun LoginScreen(
    state: MobileUiState,
    onProjectUrlChange: (String) -> Unit,
    onPublishableKeyChange: (String) -> Unit,
    onUsernameChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onLogin: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .systemBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 22.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("工作", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
        Text("账号登录", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp, bottom = 22.dp))
        OutlinedTextField(
            value = state.projectUrl,
            onValueChange = onProjectUrlChange,
            label = { Text("Supabase 项目地址") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.publishableKey,
            onValueChange = onPublishableKeyChange,
            label = { Text("Publishable key") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.username,
            onValueChange = onUsernameChange,
            label = { Text("用户名") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.password,
            onValueChange = onPasswordChange,
            label = { Text("密码") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
        )
        state.errorMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 12.dp))
        }
        Button(
            onClick = onLogin,
            enabled = !state.loading && !state.storageLocked,
            modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
        ) {
            if (state.loading) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp))
            }
            Text("登录")
        }
    }
}

@Composable
private fun PendingSaveNotice(state: MobileUiState, model: MobileViewModel) {
    Surface(
        color = MaterialTheme.colorScheme.secondaryContainer,
        shape = RoundedCornerShape(6.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
            Text(state.pendingMessage ?: "有一条保存请求尚未核对", style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = model::recoverPending, enabled = !state.saving) { Text("核对结果") }
                TextButton(onClick = model::retryPending, enabled = !state.saving) { Text("原编号重试") }
            }
        }
    }
}

@Composable
private fun Notice(message: String, isError: Boolean, onDismiss: () -> Unit) {
    Surface(
        color = if (isError) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer,
        shape = RoundedCornerShape(6.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Row(
            modifier = Modifier.padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                message,
                modifier = Modifier.weight(1f),
                color = if (isError) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSecondaryContainer,
            )
            TextButton(onClick = onDismiss) { Text("关闭") }
        }
    }
}

@Composable
private fun QuotesScreen(state: MobileUiState, model: MobileViewModel, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var filtersExpanded by rememberSaveable { mutableStateOf(false) }
    var exportExpanded by rememberSaveable { mutableStateOf(false) }
    var sortExpanded by rememberSaveable { mutableStateOf(false) }
    var sortFieldName by rememberSaveable { mutableStateOf("") }
    var ascending by rememberSaveable { mutableStateOf(true) }
    val filters = state.filters
    val filtered = if (state.filterError == null) filterQuotes(state.quotes, filters) else emptyList()
    val sortField = QuoteSortField.entries.firstOrNull { it.name == sortFieldName }
    val visibleQuotes = sortField?.let { sortQuotes(filtered, it, ascending) } ?: filtered
    val hasFilters = filters != QuoteFilters()
    val activeFilterCount = listOf(
        filters.customer.isNotBlank(),
        filters.material.isNotBlank(),
        filters.tax.isNotBlank(),
        filters.dateFrom.isNotBlank(),
        filters.dateTo.isNotBlank(),
        filters.staleOnly,
    ).count { it }
    val materials = state.quotes.map { it.material }.filter(String::isNotBlank).distinct().sorted()
    val customers = state.customers.map { it.displayName }.filter(String::isNotBlank).distinct().sorted()

    Column(modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = filters.query,
                onValueChange = model::setQuery,
                placeholder = { Text("搜索客户、牌号、材料或备注", maxLines = 1) },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = { filtersExpanded = !filtersExpanded }, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Default.Settings, contentDescription = if (filtersExpanded) "收起筛选" else "展开筛选")
            }
        }
        if (filtersExpanded) {
            QuoteFilterPanel(
                filters = filters,
                customers = customers,
                materials = materials,
                onCustomerChange = model::setCustomerFilter,
                onMaterialChange = model::setMaterialFilter,
                onTaxChange = model::setTaxFilter,
                onDateFromChange = model::setDateFrom,
                onDateToChange = model::setDateTo,
                onStaleChange = model::setStaleOnly,
                onReset = model::resetFilters,
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 18.dp, end = 12.dp, top = 2.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                if (hasFilters) "筛选结果 ${visibleQuotes.size} 条" else "共 ${visibleQuotes.size} 条报价",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            if (activeFilterCount > 0) {
                Text("筛选 $activeFilterCount 项", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(4.dp))
            }
            Box {
                IconButton(onClick = { exportExpanded = true }, enabled = filtered.isNotEmpty()) {
                    Icon(Icons.Default.Share, contentDescription = "导出报价")
                }
                DropdownMenu(expanded = exportExpanded, onDismissRequest = { exportExpanded = false }) {
                    DropdownMenuItem(
                        text = { Text("导出当前报价 CSV") },
                        onClick = { exportExpanded = false; model.business.exportCurrent(filtered) },
                    )
                    DropdownMenuItem(
                        text = { Text("导出匹配规格的全部历史") },
                        onClick = { exportExpanded = false; model.business.exportAllHistory(filtered.map { it.identity }.toSet()) },
                    )
                }
            }
            Button(
                onClick = model::startNewQuote,
                enabled = state.pendingSave == null && state.syncMeta != null && !state.loading,
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text("新增")
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.weight(1f)) {
                TextButton(onClick = { sortExpanded = true }, modifier = Modifier.testTag("quote-sort-menu")) {
                    Text("排序：${sortField?.label ?: "默认"}")
                    Icon(Icons.Default.KeyboardArrowDown, null)
                }
                DropdownMenu(expanded = sortExpanded, onDismissRequest = { sortExpanded = false }) {
                    DropdownMenuItem(text = { Text("默认顺序") }, onClick = { sortFieldName = ""; sortExpanded = false })
                    QuoteSortField.entries.forEach { field ->
                        DropdownMenuItem(text = { Text(field.label) }, onClick = { sortFieldName = field.name; sortExpanded = false })
                    }
                }
            }
            if (sortField != null) IconButton(onClick = { ascending = !ascending }, modifier = Modifier.testTag("quote-sort-direction")) {
                Icon(
                    if (ascending) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = if (ascending) "升序" else "降序",
                )
            }
        }
        state.filterError?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 18.dp, vertical = 2.dp))
        }
        if (visibleQuotes.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxWidth().weight(1f).padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (state.loading) CircularProgressIndicator()
                else {
                    Icon(
                        Icons.AutoMirrored.Filled.List,
                        contentDescription = null,
                        modifier = Modifier.size(40.dp),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        if (state.quotes.isEmpty()) "暂无报价数据" else "没有匹配的报价",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    Text(
                        if (state.quotes.isEmpty()) "同步完成后，报价会显示在这里。" else "可调整搜索词或筛选条件。",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    if (hasFilters) {
                        TextButton(onClick = model::resetFilters, modifier = Modifier.padding(top = 4.dp)) { Text("清除筛选") }
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 6.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(visibleQuotes, key = { it.id }) { quote ->
                    QuoteSummaryCard(
                        quote = quote,
                        onCustomer = { model.openCustomerForQuote(quote) },
                        onHistory = { model.openHistory(quote) },
                        onEdit = { model.startEdit(quote) },
                        onQuotation = { model.createDocument("quotation", quote) },
                        onContract = { model.createDocument("contract", quote) },
                        onCopy = { copyQuoteRecord(context, quote) },
                    )
                }
            }
        }
    }
}

@Composable
private fun QuoteFilterPanel(
    filters: QuoteFilters,
    customers: List<String>,
    materials: List<String>,
    onCustomerChange: (String) -> Unit,
    onMaterialChange: (String) -> Unit,
    onTaxChange: (String) -> Unit,
    onDateFromChange: (String) -> Unit,
    onDateToChange: (String) -> Unit,
    onStaleChange: (Boolean) -> Unit,
    onReset: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            FilterDropdown("客户", filters.customer, customers, onCustomerChange, Modifier.weight(1f))
            FilterDropdown("材料", filters.material, materials, onMaterialChange, Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            FilterDropdown("税口径", filters.tax, TAX_TYPES, onTaxChange, Modifier.weight(1f))
            OutlinedTextField(
                value = filters.dateFrom,
                onValueChange = onDateFromChange,
                label = { Text("开始日期") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = filters.dateTo,
                onValueChange = onDateToChange,
                label = { Text("结束日期") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                FilterChip(selected = filters.staleOnly, onClick = { onStaleChange(!filters.staleOnly) }, label = { Text("60天未更新") })
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onReset) {
                Icon(Icons.Default.Clear, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text("重置")
            }
        }
    }
}

@Composable
private fun FilterDropdown(
    label: String,
    value: String,
    options: List<String>,
    onSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by rememberSaveable(label) { mutableStateOf(false) }
    Box(modifier) {
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
            Text("$label：${value.ifBlank { "全部" }}", maxLines = 1)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text("全部") },
                onClick = {
                    expanded = false
                    onSelected("")
                },
            )
            options.filter(String::isNotBlank).forEach { option ->
                DropdownMenuItem(
                    text = { Text(option) },
                    onClick = {
                        expanded = false
                        onSelected(option)
                    },
                )
            }
        }
    }
}

@Composable
internal fun QuoteSummaryCard(
    quote: QuoteRecord,
    onCustomer: (() -> Unit)? = null,
    onHistory: (() -> Unit)? = null,
    onEdit: (() -> Unit)? = null,
    onQuotation: (() -> Unit)? = null,
    onContract: (() -> Unit)? = null,
    onCopy: (() -> Unit)? = null,
    onDetails: (() -> Unit)? = null,
) {
    var expanded by rememberSaveable(quote.id) { mutableStateOf(false) }
    val delta = quote.delta?.let { runCatching { BigDecimal(it) }.getOrNull() }
    Card(
        shape = RoundedCornerShape(6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth().clickable { expanded = !expanded },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(quote.customer, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Text(quoteStatus(quote), style = MaterialTheme.typography.labelMedium, color = quoteStatusColor(quote))
                if (quote.stale) Text(
                    "60天未更新",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(start = 4.dp),
                )
                onCustomer?.let {
                    IconButton(onClick = it, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Default.Person, contentDescription = "查看客户详情")
                    }
                }
                IconButton(
                    onClick = { expanded = !expanded },
                    modifier = Modifier.size(36.dp),
                ) {
                    Icon(
                        Icons.Default.KeyboardArrowDown,
                        contentDescription = if (expanded) "收起报价详情" else "展开报价详情",
                        modifier = Modifier.rotate(if (expanded) 180f else 0f),
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                listOf(quote.grade, quote.material, quote.color).filter(String::isNotBlank).joinToString("  ·  "),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("￥${quote.price}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
                Column(horizontalAlignment = Alignment.End, modifier = Modifier.padding(start = 8.dp)) {
                    Text(quote.taxType, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(quote.effectiveDate, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (expanded) {
                HorizontalDivider(Modifier.padding(top = 8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("来源：${quote.sourceType.ifBlank { "手工录入" }}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("历史 ${quote.historyCount} 条", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                delta?.takeUnless { it.compareTo(BigDecimal.ZERO) == 0 }?.let { change ->
                    val increased = change.signum() > 0
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                        Icon(
                            if (increased) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                            contentDescription = if (increased) "价格上涨" else "价格下降",
                            tint = if (increased) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            "较上一条 ${if (increased) "+" else ""}${change.toPlainString()} 元/kg",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (increased) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(start = 3.dp),
                        )
                    }
                }
                val sourceLocation = listOf(quote.sourceFile, quote.sourceSheet, quote.sourceRow.takeIf { it > 0 }?.toString())
                    .filterNot(String?::isNullOrBlank)
                    .joinToString(" / ")
                if (sourceLocation.isNotBlank()) {
                    Text("来源位置：$sourceLocation", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 3.dp))
                }
                if (quote.note.isNotBlank()) {
                    Text(quote.note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 5.dp))
                }
                if (onHistory != null || onEdit != null || onQuotation != null || onContract != null || onCopy != null || onDetails != null) {
                    HorizontalDivider(Modifier.padding(top = 8.dp))
                    Column(Modifier.fillMaxWidth()) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            onQuotation?.let { TextButton(onClick = it) { Text("报价单") } }
                            onContract?.let { TextButton(onClick = it) { Text("合同") } }
                            onHistory?.let { TextButton(onClick = it) { Text("历史") } }
                            onEdit?.let { TextButton(onClick = it) { Text("编辑") } }
                        }
                        if (onDetails != null || onCopy != null) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                            onDetails?.let { TextButton(onClick = it) { Text("详情") } }
                            onCopy?.let { TextButton(onClick = it, modifier = Modifier.testTag("quote-copy-${quote.id}")) { Text("复制记录") } }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CustomersScreen(state: MobileUiState, model: MobileViewModel, modifier: Modifier = Modifier) {
    val business by model.business.state.collectAsStateWithLifecycle()
    val query = normalizeSearch(state.customerQuery)
    val customers = state.customers.filter { query.isBlank() || normalizeSearch(it.displayName).contains(query) }
    Column(modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("${customers.size} 家客户", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Button(
                onClick = model::startNewCustomer,
                enabled = !state.saving && !state.storageLocked && !business.busy,
                modifier = Modifier.testTag("customer-add"),
            ) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("新增客户")
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = state.customerQuery,
                onValueChange = model::setCustomerQuery,
                label = { Text("搜索客户") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
        }
        if (customers.isEmpty()) {
            Column(Modifier.fillMaxWidth().weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                if (state.loading) CircularProgressIndicator() else Text(if (state.customers.isEmpty()) "暂无客户数据" else "没有匹配的客户", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(customers) { customer ->
                    CustomerSummaryCard(customer) { model.openCustomer(customer) }
                }
            }
        }
    }
}

@Composable
private fun CustomerSummaryCard(customer: CustomerRecord, onOpen: () -> Unit) {
    var expanded by rememberSaveable(customer.customerKey) { mutableStateOf(false) }
    Card(
        shape = RoundedCornerShape(6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth().clickable { expanded = !expanded },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(customer.displayName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        "${customer.specs} 个规格  ·  ${customer.records} 条报价",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                Text(customerStatus(customer), style = MaterialTheme.typography.labelMedium, color = customerStatusColor(customer))
                IconButton(onClick = { expanded = !expanded }, modifier = Modifier.size(40.dp)) {
                    Icon(
                        Icons.Default.KeyboardArrowDown,
                        contentDescription = if (expanded) "收起客户摘要" else "展开客户摘要",
                        modifier = Modifier.rotate(if (expanded) 180f else 0f),
                    )
                }
            }
            if (expanded) {
                HorizontalDivider(Modifier.padding(top = 8.dp))
                Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                    DetailMetric("规格", customer.specs.toString())
                    DetailMetric("报价记录", customer.records.toString())
                    DetailMetric("待生效", customer.futureRecords.toString())
                }
                TextButton(onClick = onOpen, modifier = Modifier.fillMaxWidth()) { Text("查看客户详情") }
            }
        }
    }
}

@Composable
private fun CustomerDetailScreen(state: MobileUiState, model: MobileViewModel, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val detail = state.customerDetail
    if (detail == null) {
        Column(modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            if (state.customerDetailLoading) CircularProgressIndicator() else Text("暂无客户详情", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    Column(modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(detail.customer.displayName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                Text(customerStatus(detail.customer), style = MaterialTheme.typography.bodySmall, color = customerStatusColor(detail.customer), modifier = Modifier.padding(top = 3.dp))
            }
            IconButton(onClick = { shareCsv(context, "客户-${detail.customer.displayName}.csv", customerDetailCsv(detail)) }, enabled = detail.items.isNotEmpty()) {
                Icon(Icons.Default.Share, contentDescription = "分享客户详情 CSV")
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            DetailMetric("规格", detail.specs.toString())
            DetailMetric("报价记录", detail.records.toString())
            DetailMetric("待生效", detail.futureRecords.toString())
        }
        CustomerLifecycleAction(detail.customer, model.business)
        if (state.customerDetailLoading && detail.items.isEmpty()) {
            Column(Modifier.fillMaxWidth().weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                CircularProgressIndicator()
            }
        } else if (detail.items.isEmpty()) {
            Column(Modifier.fillMaxWidth().weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text("该客户暂无报价记录", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(detail.items, key = { it.id }) { quote ->
                    QuoteSummaryCard(
                        quote = quote,
                        onHistory = { model.openHistory(quote) },
                        onEdit = { model.startEdit(quote) },
                    )
                }
            }
        }
    }
}

@Composable
private fun DetailMetric(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun HistoryScreen(state: MobileUiState, model: MobileViewModel, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val quote = state.historyQuote
    val currentQuote = state.historyItems.firstOrNull { it.isCurrent }
    var detailQuote by remember { mutableStateOf<QuoteRecord?>(null) }
    Column(modifier.fillMaxSize()) {
        if (quote != null) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("${quote.customer}  ·  ${quote.grade}", style = MaterialTheme.typography.titleMedium)
                    Text("历史 ${quote.historyCount} 条  ·  待生效 ${quote.futureCount} 条", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 3.dp))
                }
                Column(horizontalAlignment = Alignment.End) {
                    IconButton(onClick = { shareCsv(context, "报价历史-${quote.id}.csv", quotesCsv(state.historyItems, history = true)) }, enabled = state.historyItems.isNotEmpty()) {
                        Icon(Icons.Default.Share, contentDescription = "分享报价历史 CSV")
                    }
                    TextButton(onClick = { currentQuote?.let(model::startEdit) }, enabled = currentQuote != null && !state.saving && state.pendingSave == null) {
                        Text("更新价格")
                    }
                }
            }
        }
        if (state.historyItems.isEmpty() && state.historyLoading) {
            Column(Modifier.fillMaxWidth().weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                CircularProgressIndicator()
            }
        } else if (state.historyItems.isEmpty()) {
            Column(Modifier.fillMaxWidth().weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text("暂无历史记录", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            QuoteTrendChart(state.historyItems)
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        if (state.historyHasMore) {
                            OutlinedButton(onClick = model::loadAllHistory, enabled = !state.historyLoading) {
                                if (state.historyLoading) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                                else Text("加载全部历史")
                            }
                        }
                    }
                }
                items(state.historyItems, key = { it.id }) {
                    QuoteSummaryCard(
                        quote = it,
                        onCopy = { copyQuoteRecord(context, it) },
                        onDetails = { detailQuote = it },
                    )
                }
                if (state.historyHasMore) {
                    item {
                        TextButton(onClick = model::loadOlderHistory, enabled = !state.historyLoading, modifier = Modifier.fillMaxWidth()) {
                            Text("加载更早记录")
                        }
                    }
                }
            }
        }
    }
    detailQuote?.let { selected ->
        QuoteRecordDetails(selected, onDismiss = { detailQuote = null }, onCopy = { copyQuoteRecord(context, selected) })
    }
}

@Composable
internal fun QuoteTrendChart(items: List<QuoteRecord>) {
    val chronological = remember(items) {
        items.sortedWith(compareBy<QuoteRecord> { it.effectiveDate }
            .thenBy { it.id.toLongOrNull() ?: Long.MAX_VALUE }
            .thenBy { it.id })
    }
    val density = LocalDensity.current
    val labelSize = with(density) { MaterialTheme.typography.labelSmall.fontSize.toPx() }
    val colors = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
        Text("价格趋势 · 按业务日期", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Canvas(
            Modifier.fillMaxWidth().height(176.dp).testTag("quote-history-trend")
                .semantics { contentDescription = "价格历史趋势图，共${chronological.size}条记录" },
        ) {
            val points = chronological.mapNotNull { row ->
                val price = row.price.toBigDecimalOrNull() ?: return@mapNotNull null
                val date = runCatching { LocalDate.parse(row.effectiveDate).toEpochDay() }.getOrNull() ?: return@mapNotNull null
                Triple(row, date, price)
            }
            if (points.isEmpty()) return@Canvas

            val left = 64.dp.toPx()
            val right = size.width - 12.dp.toPx()
            val top = 22.dp.toPx()
            val bottom = size.height - 38.dp.toPx()
            val plotWidth = (right - left).coerceAtLeast(1f)
            val plotHeight = (bottom - top).coerceAtLeast(1f)
            val minimum = points.minOf { it.third }
            val maximum = points.maxOf { it.third }
            val spread = maximum - minimum
            val span = if (spread.compareTo(BigDecimal.ZERO) == 0) {
                minimum.abs().multiply(BigDecimal("0.05")).max(BigDecimal("0.01"))
            } else spread
            val lower = minimum - span.multiply(BigDecimal("0.2"))
            val upper = maximum + span.multiply(BigDecimal("0.2"))
            val priceRange = upper - lower
            val firstDate = points.first().second
            val lastDate = points.last().second
            val dateCounts = points.groupingBy { it.second }.eachCount()
            val dateOffsets = mutableMapOf<Long, Int>()
            val axis = colors.outlineVariant
            val label = colors.onSurfaceVariant
            val primary = colors.primary
            val future = colors.tertiary
            val paint = NativePaint(NativePaint.ANTI_ALIAS_FLAG).apply {
                color = label.toArgb()
                textSize = labelSize
            }

            listOf(top, top + plotHeight / 2f, bottom).forEach { y ->
                drawLine(axis, androidx.compose.ui.geometry.Offset(left, y), androidx.compose.ui.geometry.Offset(right, y), 1.dp.toPx())
            }
            listOf(minimum, maximum).distinct().forEach { value ->
                val ratio = ((value - lower).toDouble() / priceRange.toDouble()).toFloat()
                val y = bottom - ratio * plotHeight
                paint.textAlign = NativePaint.Align.RIGHT
                drawContext.canvas.nativeCanvas.drawText(value.stripTrailingZeros().toPlainString(), left - 8.dp.toPx(), y + labelSize / 3f, paint)
            }

            var previous: Pair<androidx.compose.ui.geometry.Offset, QuoteRecord>? = null
            points.forEach { (row, day, value) ->
                val sameDayIndex = dateOffsets.getOrDefault(day, 0)
                dateOffsets[day] = sameDayIndex + 1
                val baseX = if (firstDate == lastDate) left + plotWidth / 2f
                else left + ((day - firstDate).toFloat() / (lastDate - firstDate).toFloat()) * plotWidth
                val daySpacing = minOf(6.dp.toPx(), plotWidth / points.size.coerceAtLeast(1))
                val x = (baseX + (sameDayIndex - (dateCounts.getValue(day) - 1) / 2f) * daySpacing).coerceIn(left, right)
                val ratio = ((value - lower).toDouble() / priceRange.toDouble()).toFloat()
                val y = bottom - ratio * plotHeight
                val position = androidx.compose.ui.geometry.Offset(x, y)
                previous?.let { (priorPoint, _) ->
                    drawLine(
                        primary,
                        priorPoint,
                        position,
                        strokeWidth = 2.dp.toPx(),
                        pathEffect = if (row.scheduled) PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx())) else null,
                    )
                }
                drawCircle(if (row.scheduled) future else primary, radius = 4.dp.toPx(), center = position)
                if (points.size <= 6) {
                    paint.textAlign = NativePaint.Align.CENTER
                    paint.color = primary.toArgb()
                    drawContext.canvas.nativeCanvas.drawText(row.price, x, y - 9.dp.toPx(), paint)
                    paint.color = label.toArgb()
                }
                previous = position to row
            }

            paint.textAlign = NativePaint.Align.LEFT
            drawContext.canvas.nativeCanvas.drawText(points.first().first.effectiveDate, left, size.height - 8.dp.toPx(), paint)
            if (firstDate != lastDate) {
                paint.textAlign = NativePaint.Align.RIGHT
                drawContext.canvas.nativeCanvas.drawText(points.last().first.effectiveDate, right, size.height - 8.dp.toPx(), paint)
            }
            if (points.size == 1) {
                paint.textAlign = NativePaint.Align.CENTER
                drawContext.canvas.nativeCanvas.drawText("只有一条真实报价记录", left + plotWidth / 2f, size.height - 8.dp.toPx(), paint)
            }
        }
    }
}

@Composable
internal fun QuoteRecordDetails(quote: QuoteRecord, onDismiss: () -> Unit, onCopy: () -> Unit) {
    val state = when {
        quote.scheduled -> "待生效"
        quote.isCurrent -> "当前价"
        else -> "历史价"
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("历史记录详情") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).testTag("history-record-details")) {
                listOf(
                    "客户" to quote.customer,
                    "牌号" to quote.grade,
                    "材料" to quote.material,
                    "颜色" to quote.color,
                    "业务日期 / 状态" to "${quote.effectiveDate} · $state",
                    "价格（元/kg）" to quote.price,
                    "较上一条" to (quote.delta?.let { "$it 元/kg" } ?: "首条记录"),
                    "调价原因" to quote.reason,
                    "备注" to quote.note,
                    "录入时间" to quote.createdAt,
                    "来源类型" to quote.sourceType,
                    "来源位置" to listOf(quote.sourceFile, quote.sourceSheet, quote.sourceRow.takeIf { it > 0 }?.toString())
                        .filterNot(String?::isNullOrBlank).joinToString(" / ").ifBlank { "手工录入" },
                ).filter { it.second.isNotBlank() }.forEach { (label, value) ->
                    Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(value, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 8.dp))
                }
            }
        },
        confirmButton = { TextButton(onClick = onCopy) { Text("复制记录") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("关闭") } },
    )
}

private fun copyQuoteRecord(context: Context, quote: QuoteRecord) {
    val json = JSONObject()
        .put("id", quote.id)
        .put("customer", quote.customer)
        .put("grade", quote.grade)
        .put("material", quote.material)
        .put("color", quote.color)
        .put("price", quote.price)
        .put("tax_type", quote.taxType)
        .put("effective_date", quote.effectiveDate)
        .put("scheduled", quote.scheduled)
        .put("is_current", quote.isCurrent)
        .put("reason", quote.reason)
        .put("note", quote.note)
        .put("source_type", quote.sourceType)
        .put("source_file", quote.sourceFile)
        .put("source_sheet", quote.sourceSheet)
        .put("source_row", quote.sourceRow)
        .put("created_at", quote.createdAt)
        .put("previous_price", quote.previousPrice ?: JSONObject.NULL)
        .put("delta", quote.delta ?: JSONObject.NULL)
        .put("customer_revision", quote.customerRevision)
        .put("history_count", quote.historyCount)
        .put("future_count", quote.futureCount)
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("报价记录", json.toString(2)))
    Toast.makeText(context, "记录已复制", Toast.LENGTH_SHORT).show()
}

@Composable
private fun EditorScreen(state: MobileUiState, model: MobileViewModel, modifier: Modifier = Modifier) {
    val draft = state.draft ?: QuoteDraft()
    val matchedQuote = if (state.imageSource != null) matchingImageQuotes(state.quotes, draft).singleOrNull() else null
    val editingExistingQuote = state.editingQuote != null || matchedQuote != null
    val editable = !state.saving && state.pendingSave == null
    val newIdentity = editable && state.editingQuote == null
    val colorEditable = editable && (state.editingQuote == null || state.editingQuote.color.isBlank())
    val taxEditable = editable && (state.editingQuote == null || state.editingQuote.taxType == "未注明")
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var recognition by remember { mutableStateOf<ImageQuoteRecognition?>(null) }
    var chosenCandidate by remember { mutableStateOf<ImageQuoteCandidate?>(null) }
    var recognizing by remember { mutableStateOf(false) }
    var imageError by remember { mutableStateOf<String?>(null) }
    val advancedFieldsKey = state.editingQuote?.id ?: matchedQuote?.id ?: "new"
    var optionalFieldsExpanded by rememberSaveable(advancedFieldsKey) { mutableStateOf(editingExistingQuote) }
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            recognition = null
            chosenCandidate = null
            model.setImageQuoteSource(null)
            recognizing = true
            imageError = null
            scope.launch {
                try {
                    recognition = withContext(Dispatchers.IO) {
                        ImageQuoteRecognizer(context).recognize(uri, defaultDate = draft.effectiveDate)
                    }
                } catch (failure: Exception) {
                    imageError = failure.message ?: "图片识别失败，请重新选择图片"
                } finally {
                    recognizing = false
                }
            }
        }
    }
    Column(
        modifier = modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (state.editingQuote == null) {
            OutlinedButton(onClick = { imagePicker.launch(arrayOf("image/*")) }, enabled = editable && !recognizing, modifier = Modifier.fillMaxWidth()) {
                Text("从图片识别报价")
            }
            if (recognizing) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                Text("正在本机识别图片文字", Modifier.padding(start = 10.dp), style = MaterialTheme.typography.bodySmall)
            }
            imageError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
        recognition?.let { result ->
            Text("${result.sourceFile} · ${result.candidates.size}条候选", style = MaterialTheme.typography.labelMedium)
            Image(result.preview.asImageBitmap(), "报价原图预览", Modifier.fillMaxWidth().heightIn(max = 260.dp), contentScale = ContentScale.Fit)
            result.candidates.forEach { candidate ->
                val selected = chosenCandidate == candidate
                OutlinedButton(onClick = {
                    model.applyImageQuoteCandidate(candidate.draft, ImageQuoteSource(result.sourceFile, row = candidate.sourceRow))
                    chosenCandidate = candidate
                }, enabled = editable, modifier = Modifier.fillMaxWidth()) {
                    Text("${if (selected) "已选择" else "采用"} ${candidate.draft.grade.ifBlank { "待补牌号" }} · ${candidate.draft.price.ifBlank { "待补价格" }} ${candidate.draft.taxType}")
                }
                if (selected && candidate.warnings.isNotEmpty()) Text(candidate.warnings.joinToString("\n"), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        }
        if (state.imageSource != null) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Checkbox(state.imageReviewed, model::setImageReviewAccepted, enabled = editable, modifier = Modifier.testTag("image-quote-review"))
                Text("已对照原图核对客户、牌号、材料、颜色、价格、税口径和日期", style = MaterialTheme.typography.bodySmall)
            }
        }
        DraftField("客户", draft.customer, { value -> model.updateDraft { it.copy(customer = value) } }, enabled = newIdentity)
        DraftField("牌号", draft.grade, { value -> model.updateDraft { it.copy(grade = value) } }, enabled = newIdentity)
        DraftField("材料", draft.material, { value -> model.updateDraft { it.copy(material = value) } }, enabled = editable)
        DraftField("颜色", draft.color, { value -> model.updateDraft { it.copy(color = value) } }, enabled = colorEditable)
        DraftField("价格", draft.price, { value -> model.updateDraft { it.copy(price = value) } }, keyboardType = KeyboardType.Decimal, enabled = editable)
        DraftField("生效日期（YYYY-MM-DD）", draft.effectiveDate, { value -> model.updateDraft { it.copy(effectiveDate = value) } }, enabled = editable)
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("税口径", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TAX_TYPES.forEach { type ->
                    FilterChip(
                        selected = draft.taxType == type,
                        onClick = { model.updateDraft { it.copy(taxType = type) } },
                        enabled = taxEditable,
                        label = { Text(type) },
                    )
                }
            }
        }
        TextButton(
            onClick = { optionalFieldsExpanded = !optionalFieldsExpanded },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (editingExistingQuote) "备注与调价原因" else "备注", modifier = Modifier.weight(1f))
            Icon(
                Icons.Default.KeyboardArrowDown,
                contentDescription = if (optionalFieldsExpanded) "收起备注与调价原因" else "展开备注与调价原因",
                modifier = Modifier.rotate(if (optionalFieldsExpanded) 180f else 0f),
            )
        }
        if (optionalFieldsExpanded) {
            DraftField("备注", draft.note, { value -> model.updateDraft { it.copy(note = value) } }, singleLine = false, enabled = editable)
            if (editingExistingQuote) DraftField("调价原因", draft.reason, { value -> model.updateDraft { it.copy(reason = value) } }, singleLine = false, enabled = editable)
        }
        Button(onClick = model::saveQuote, enabled = editable && (state.imageSource == null || state.imageReviewed), modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).testTag("quote-save")) {
            if (state.saving) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp))
            }
            Text(when {
                editingExistingQuote -> "保存调价"
                state.editorReturnScreen == MobileScreen.CUSTOMERS -> "保存客户及报价"
                else -> "保存报价"
            })
        }
    }
}

@Composable
private fun DraftField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    keyboardType: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
    enabled: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = singleLine,
        enabled = enabled,
        minLines = if (singleLine) 1 else 3,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun AccountScreen(state: MobileUiState, model: MobileViewModel, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 12.dp)) {
        Text(state.accountName.orEmpty(), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        Text("当前账号", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp, bottom = 18.dp))
        HorizontalDivider()
        AccountLine("同步状态", state.syncStatus, if (state.syncStatus == "已同步") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
        AccountLine("最近同步", state.lastSync ?: "尚无成功同步")
        AccountLine("报价数量", state.quotes.size.toString())
        AccountLine("客户数量", state.customers.size.toString())
        ProjectAddressPanel(state.projectUrl, Modifier.padding(top = 6.dp)) {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("项目地址", state.projectUrl))
            Toast.makeText(context, "项目地址已复制", Toast.LENGTH_SHORT).show()
        }
        HorizontalDivider(Modifier.padding(vertical = 14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = { model.refresh(force = true) }, enabled = !state.loading, modifier = Modifier.weight(1f)) { Text("立即同步") }
            OutlinedButton(onClick = model::logout, enabled = state.pendingSave == null && !state.loading && !state.saving, modifier = Modifier.weight(1f)) { Text("退出账号") }
        }
        if (state.pendingSave != null) {
            Text("完成保存结果核对后才能退出。", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 10.dp))
        }
    }
}

@Composable
internal fun ProjectAddressPanel(projectUrl: String, modifier: Modifier = Modifier, onCopy: () -> Unit) {
    var expanded by rememberSaveable(projectUrl) { mutableStateOf(false) }
    Surface(
        modifier = modifier.fillMaxWidth().testTag("project-address-panel"),
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth().testTag("project-address-toggle")
                    .clickable { expanded = !expanded }.padding(horizontal = 14.dp, vertical = 13.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("项目地址", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                Icon(
                    Icons.Default.KeyboardArrowDown,
                    contentDescription = if (expanded) "收起项目地址" else "展开项目地址",
                    modifier = Modifier.rotate(if (expanded) 180f else 0f),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (expanded) {
                HorizontalDivider()
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = 14.dp, top = 6.dp, end = 6.dp, bottom = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SelectionContainer(Modifier.weight(1f)) {
                        Text(
                            projectUrl,
                            modifier = Modifier.fillMaxWidth().testTag("project-address-value"),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontFamily = FontFamily.Monospace,
                            softWrap = true,
                        )
                    }
                    TextButton(onClick = onCopy, modifier = Modifier.testTag("project-address-copy")) { Text("复制") }
                }
            }
        }
    }
}

@Composable
private fun AccountLine(label: String, value: String, valueColor: Color = MaterialTheme.colorScheme.onSurface) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 11.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(16.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium, color = valueColor, modifier = Modifier.weight(1f), textAlign = TextAlign.End)
    }
}

private fun quoteStatus(quote: QuoteRecord): String = when {
    quote.scheduled -> "待生效"
    quote.stale -> "待更新"
    quote.isCurrent -> "当前报价"
    else -> "历史报价"
}

@Composable
private fun quoteStatusColor(quote: QuoteRecord): Color = when {
    quote.scheduled -> MaterialTheme.colorScheme.tertiary
    quote.stale -> MaterialTheme.colorScheme.error
    quote.isCurrent -> MaterialTheme.colorScheme.primary
    else -> MaterialTheme.colorScheme.onSurfaceVariant
}

private fun customerStatus(customer: CustomerRecord): String = when {
    customer.status == "active" && customer.deletedAt == null -> "正常"
    customer.deletedAt != null || customer.status == "deleted" -> "已停用"
    else -> customer.status.ifBlank { "状态未知" }
}

@Composable
private fun customerStatusColor(customer: CustomerRecord): Color = if (customerStatus(customer) == "正常") {
    MaterialTheme.colorScheme.primary
} else {
    MaterialTheme.colorScheme.error
}

private fun shareCsv(context: Context, filename: String, content: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/csv"
        putExtra(Intent.EXTRA_SUBJECT, filename)
        putExtra(Intent.EXTRA_TEXT, content)
    }
    try {
        context.startActivity(Intent.createChooser(intent, "分享 $filename"))
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(context, "当前设备没有可用的分享应用", Toast.LENGTH_SHORT).show()
    }
}
