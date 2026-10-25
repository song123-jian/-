package com.song123jian.pricequery.mobile.ui.main

import android.content.ActivityNotFoundException
import android.content.ClipboardManager
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.core.content.FileProvider
import com.song123jian.pricequery.mobile.*
import com.song123jian.pricequery.mobile.data.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.math.BigDecimal

@Composable
internal fun BusinessMessages(state: BusinessState, controller: BusinessController) {
    val message = state.error ?: state.message ?: return
    Surface(color = if (state.error != null) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(message, Modifier.weight(1f).padding(vertical = 10.dp), style = MaterialTheme.typography.bodySmall)
            IconButton(onClick = controller::dismissError) { Icon(Icons.Default.Clear, "关闭提示") }
        }
    }
}

@Composable
internal fun ArtifactActions(state: BusinessState, controller: BusinessController) {
    val artifact = state.artifact ?: return
    val context = LocalContext.current
    var showPreview by remember(artifact.file.path) { mutableStateOf(false) }
    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(artifact.mime)) { uri ->
        if (uri != null) controller.saveArtifact(uri, artifact)
    }
    ArtifactActionPanel(
        artifact = artifact,
        onPreview = { showPreview = true },
        onSave = { save.launch(artifact.name) },
        saveEnabled = !state.busy,
        onClear = controller::clearArtifact,
    ) { chooser, fallback -> launchArtifactChooser(context, chooser, fallback) }
    if (showPreview) PdfPreview(artifact) { showPreview = false }
}

@Composable
internal fun ArtifactActionPanel(
    artifact: ExchangeArtifact,
    onPreview: () -> Unit,
    onSave: () -> Unit,
    saveEnabled: Boolean,
    onClear: () -> Unit,
    onLaunchChooser: (Intent, String) -> Unit,
) {
    val context = LocalContext.current
    Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
            Text(artifact.name.substringAfter('-'), style = MaterialTheme.typography.labelMedium, maxLines = 2)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                if (artifact.mime == "application/pdf") TextButton(onClick = onPreview) { Text("预览") }
                if (artifact.mime == "application/pdf" || artifact.mime == WORD_DOCUMENT_MIME) {
                    TextButton(
                        onClick = {
                            onLaunchChooser(artifactOpenChooserIntent(context, artifact), "未找到可打开此文件的应用，请安装WPS或先保存文件")
                        },
                        modifier = Modifier.testTag("artifact-open"),
                    ) { Text("WPS打开") }
                }
                TextButton(onClick = onSave, enabled = saveEnabled, modifier = Modifier.testTag("artifact-save")) { Text("保存文件") }
                TextButton(
                    onClick = {
                        onLaunchChooser(artifactShareChooserIntent(context, artifact), "当前设备没有可用的分享应用，请保存文件")
                    },
                    modifier = Modifier.testTag("artifact-share"),
                ) { Text("分享") }
                IconButton(onClick = onClear) { Icon(Icons.Default.Clear, "关闭导出结果") }
            }
        }
    }
}

internal const val WORD_DOCUMENT_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

internal fun artifactOpenIntent(context: android.content.Context, artifact: ExchangeArtifact): Intent {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", artifact.file)
    return Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, artifact.mime)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        clipData = ClipData.newRawUri(artifact.name, uri)
    }
}

internal fun artifactShareIntent(context: android.content.Context, artifact: ExchangeArtifact): Intent {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", artifact.file)
    return Intent(Intent.ACTION_SEND).apply {
        type = artifact.mime
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        clipData = ClipData.newRawUri(artifact.name, uri)
    }
}

internal fun artifactOpenChooserIntent(context: android.content.Context, artifact: ExchangeArtifact): Intent =
    Intent.createChooser(artifactOpenIntent(context, artifact), "用 WPS 或其他应用打开")

internal fun artifactShareChooserIntent(context: android.content.Context, artifact: ExchangeArtifact): Intent =
    Intent.createChooser(artifactShareIntent(context, artifact), "分享文件")

private fun launchArtifactChooser(context: android.content.Context, chooser: Intent, fallback: String) {
    try {
        context.startActivity(chooser)
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(context, fallback, Toast.LENGTH_SHORT).show()
    }
}

@Composable
private fun PdfPreview(artifact: ExchangeArtifact, close: () -> Unit) {
    var page by remember { mutableIntStateOf(0) }
    var pages by remember { mutableIntStateOf(1) }
    var error by remember { mutableStateOf<String?>(null) }
    val bitmap by produceState<Bitmap?>(null, artifact.file.path, page) {
        value = null
        runCatching {
            withContext(Dispatchers.IO) {
                ParcelFileDescriptor.open(artifact.file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
                    PdfRenderer(descriptor).use { renderer ->
                        pages = renderer.pageCount
                        renderer.openPage(page.coerceIn(0, renderer.pageCount - 1)).use { selected ->
                            Bitmap.createBitmap(selected.width * 2, selected.height * 2, Bitmap.Config.ARGB_8888).also { image ->
                                selected.render(image, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                            }
                        }
                    }
                }
            }
        }.onSuccess { value = it }.onFailure { error = "PDF预览失败：${it.message}" }
    }
    Dialog(onDismissRequest = close, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize().systemBarsPadding()) {
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("PDF预览", Modifier.weight(1f).padding(16.dp), fontWeight = FontWeight.Bold)
                    IconButton(onClick = close) { Icon(Icons.Default.Clear, "关闭PDF预览") }
                }
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    error?.let { Text(it, Modifier.padding(16.dp)) }
                    bitmap?.let { Image(it.asImageBitmap(), "单据第${page + 1}页", Modifier.fillMaxSize(), contentScale = ContentScale.Fit) }
                    if (bitmap == null && error == null) CircularProgressIndicator()
                }
                Row(Modifier.fillMaxWidth().padding(8.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { page-- }, enabled = page > 0) { Icon(Icons.Default.KeyboardArrowLeft, "上一页") }
                    Text("${page + 1} / $pages")
                    IconButton(onClick = { page++ }, enabled = page + 1 < pages) { Icon(Icons.Default.KeyboardArrowRight, "下一页") }
                }
            }
        }
    }
}

@Composable
internal fun BusinessScreen(
    ui: MobileUiState,
    state: BusinessState,
    controller: BusinessController,
    modifier: Modifier = Modifier,
    onBackRequested: () -> Unit,
    onCustomerProfileQuotes: (String) -> Unit = {},
    onCustomerProfileProject: (CustomerProfile) -> Unit = {},
    onCustomerProfileTodo: (CustomerProfile) -> Unit = {},
) {
    BackHandler(enabled = state.page != BusinessPage.MENU) { if (!state.busy) onBackRequested() }
    Column(modifier.fillMaxSize()) {
        BusinessMessages(state, controller)
        if (state.busy) {
            Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                Text(state.busyLabel, style = MaterialTheme.typography.bodySmall)
            }
        }
        ui.pendingBusiness?.let { pending ->
            Surface(color = MaterialTheme.colorScheme.tertiaryContainer) {
                Column(Modifier.fillMaxWidth().padding(12.dp)) {
                    Text("业务操作结果待核对", fontWeight = FontWeight.Bold)
                    Text("原请求：${pending.optString("request_id")}", style = MaterialTheme.typography.bodySmall)
                    Row {
                        TextButton(onClick = { controller.recoverPending() }, enabled = !state.busy) { Text("核对结果") }
                        TextButton(onClick = { controller.recoverPending(true) }, enabled = !state.busy) { Text("原编号重试") }
                    }
                }
            }
        }
        ArtifactActions(state, controller)
        when (state.page) {
            BusinessPage.MENU -> BusinessMenu(controller, !state.busy)
            BusinessPage.DATA -> DataPage(ui, state, controller)
            BusinessPage.IMPORT -> ImportPage(ui, state, controller)
            BusinessPage.RECYCLE -> RecyclePage(state, controller)
            BusinessPage.DOCUMENTS -> DocumentsPage(state, controller)
            BusinessPage.DOCUMENT_EDITOR -> DocumentEditor(state, controller)
            BusinessPage.INVENTORY -> InventoryPage(state, controller)
            BusinessPage.BACKUP -> BackupPage(state, controller)
            BusinessPage.CUSTOMER_PROFILES -> CustomerProfilesPage(state, controller, onCustomerProfileQuotes, onCustomerProfileProject, onCustomerProfileTodo)
            BusinessPage.TODOS -> TodosPage(state, controller)
            BusinessPage.PROJECT_PROGRESS -> ProjectProgressPage(state, controller)
        }
    }
}

@Composable
private fun BusinessMenu(controller: BusinessController, enabled: Boolean) {
    var commonExpanded by rememberSaveable { mutableStateOf(true) }
    var dataExpanded by rememberSaveable { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            BusinessMenuSection("常用业务", "库存查询、报价单与购销合同", commonExpanded) { commonExpanded = !commonExpanded }
        }
        if (commonExpanded) {
            item { MenuButton("库存与批号备货", enabled, description = "查询物料库存与批号") { controller.open(BusinessPage.INVENTORY) } }
            item { MenuButton("报价单与购销合同", enabled, description = "编辑单据并导出 PDF 或 Word") { controller.open(BusinessPage.DOCUMENTS) } }
            item { MenuButton("客户档案", enabled, description = "维护客户联系人和业务资料") { controller.open(BusinessPage.CUSTOMER_PROFILES) } }
            item { MenuButton("待办事项", enabled, description = "跟进客户、项目和回款") { controller.open(BusinessPage.TODOS) } }
            item { MenuButton("项目进度", enabled, description = "维护项目阶段并查看评分") { controller.open(BusinessPage.PROJECT_PROGRESS) } }
        }
        item {
            BusinessMenuSection("数据管理与恢复", "导入导出、客户回收站、备份恢复", dataExpanded) { dataExpanded = !dataExpanded }
        }
        if (dataExpanded) {
            item { MenuButton("数据管理", enabled, description = "导入报价、导出记录与模板") { controller.open(BusinessPage.DATA) } }
            item { MenuButton("客户回收站", enabled, description = "查看并恢复已停用客户") { controller.open(BusinessPage.RECYCLE) } }
            item { MenuButton("备份与恢复", enabled, description = "导出完整备份或恢复本机数据") { controller.open(BusinessPage.BACKUP) } }
        }
    }
}

@Composable
private fun BusinessMenuSection(label: String, summary: String, expanded: Boolean, onClick: () -> Unit) {
    Surface(
        shape = androidx.compose.foundation.shape.RoundedCornerShape(6.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(summary, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(
                Icons.Default.KeyboardArrowDown,
                contentDescription = if (expanded) "收起$label" else "展开$label",
                modifier = Modifier.rotate(if (expanded) 180f else 0f),
            )
        }
    }
}

@Composable
private fun MenuButton(label: String, enabled: Boolean = true, description: String = "", action: () -> Unit) {
    OutlinedButton(
        onClick = action,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(6.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
            Text(label, fontWeight = FontWeight.Medium)
            if (description.isNotBlank()) Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(Icons.Default.KeyboardArrowRight, null)
    }
}

@Composable
private fun DataPage(ui: MobileUiState, state: BusinessState, controller: BusinessController) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("云端：${ui.customers.size}客户 · ${ui.quotes.size}当前规格", style = MaterialTheme.typography.bodyMedium) }
        item { MenuButton("导入 XLSX / CSV / 文字 PDF", !state.busy) { controller.open(BusinessPage.IMPORT) } }
        item { MenuButton("下载报价导入模板", !state.busy, action = controller::template) }
        item { MenuButton("导出全部报价历史 CSV", !state.busy) { controller.exportAllHistory() } }
        item { MenuButton("完整备份与恢复", !state.busy) { controller.open(BusinessPage.BACKUP) } }
        item { MenuButton("客户回收站", !state.busy) { controller.open(BusinessPage.RECYCLE) } }
    }
}

@Composable
private fun CustomerProfilesPage(
    state: BusinessState,
    controller: BusinessController,
    onQuotes: (String) -> Unit,
    onProject: (CustomerProfile) -> Unit,
    onTodo: (CustomerProfile) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var confirmImport by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) controller.inspectCustomerProfiles(uri)
    }
    val needle = businessNorm(query)
    val rows = state.customerProfiles.filter { profile ->
        needle.isBlank() || businessNorm(listOf(profile.name, profile.contact, profile.phone, profile.industry, profile.address, profile.notes).joinToString(" ")).contains(needle)
    }
    LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { BusinessField("搜索客户档案", query, !state.busy) { query = it } }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = controller::newCustomerProfile, enabled = !state.busy, modifier = Modifier.weight(1f)) { Text("新增客户") }
                OutlinedButton(onClick = { picker.launch(arrayOf("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream")) }, enabled = !state.busy, modifier = Modifier.weight(1f)) { Text("导入 XLSX") }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = controller::customerProfileTemplate, enabled = !state.busy, modifier = Modifier.weight(1f)) { Text("下载模板") }
                TextButton(onClick = controller::exportCustomerProfiles, enabled = !state.busy, modifier = Modifier.weight(1f)) { Text("导出 XLSX") }
            }
        }
        state.customerProfileImport?.let { preview ->
            item {
                Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("待导入：${preview.filename}", fontWeight = FontWeight.SemiBold)
                        Text("有效 ${preview.profiles.size} 条 · 错误 ${preview.errors.size}", style = MaterialTheme.typography.bodySmall)
                        preview.errors.take(8).forEach { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { confirmImport = true }, enabled = !state.busy && preview.errors.isEmpty() && preview.profiles.isNotEmpty(), modifier = Modifier.weight(1f)) { Text("确认导入") }
                            TextButton(onClick = controller::clearCustomerProfileImport, enabled = !state.busy, modifier = Modifier.weight(1f)) { Text("取消") }
                        }
                    }
                }
            }
        }
        item { Text("${rows.size} 条客户档案", style = MaterialTheme.typography.labelMedium) }
        if (rows.isEmpty()) item { Text("暂无客户档案", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(rows, key = { it.profileId ?: "${it.name}-${it.phone}" }) { profile ->
            Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(profile.name.ifBlank { "未填写客户名称" }, style = MaterialTheme.typography.titleMedium)
                    Text(listOf(profile.contact, profile.phone, profile.industry).filter(String::isNotBlank).joinToString(" · ").ifBlank { "未填写联系人、电话或行业" }, style = MaterialTheme.typography.bodySmall)
                    if (profile.address.isNotBlank()) Text("地址：${profile.address}", style = MaterialTheme.typography.bodySmall)
                    if (profile.notes.isNotBlank()) Text("备注：${profile.notes}", style = MaterialTheme.typography.bodySmall)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        TextButton(onClick = { controller.editCustomerProfile(profile) }, enabled = !state.busy) { Text("编辑") }
                        if (profile.name.isNotBlank()) TextButton(onClick = { onQuotes(profile.name) }, enabled = !state.busy) { Text("查看报价") }
                        TextButton(onClick = { onProject(profile) }, enabled = !state.busy) { Text("新增项目") }
                        TextButton(onClick = { onTodo(profile) }, enabled = !state.busy) { Text("新增待办") }
                    }
                }
            }
        }
    }
    state.profileDraft?.let { CustomerProfileEditor(it, state.busy, controller) }
    if (confirmImport) AlertDialog(
        onDismissRequest = { confirmImport = false },
        title = { Text("确认导入客户资料") },
        text = { Text("将按系统编号和数据版本新增或更新 ${state.customerProfileImport?.profiles?.size ?: 0} 条客户资料。") },
        confirmButton = { TextButton(onClick = { confirmImport = false; controller.commitCustomerProfilesImport() }) { Text("导入") } },
        dismissButton = { TextButton(onClick = { confirmImport = false }) { Text("取消") } },
    )
}

@Composable
private fun CustomerProfileEditor(profile: CustomerProfile, busy: Boolean, controller: BusinessController) {
    AlertDialog(
        onDismissRequest = { if (!busy) controller.cancelCustomerProfile() },
        title = { Text(if (profile.profileId == null) "新增客户档案" else "编辑客户档案") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                BusinessField("客户名称", profile.name, !busy) { value -> controller.updateCustomerProfile { it.copy(name = value) } }
                BusinessField("联系人", profile.contact, !busy) { value -> controller.updateCustomerProfile { it.copy(contact = value) } }
                BusinessField("电话", profile.phone, !busy) { value -> controller.updateCustomerProfile { it.copy(phone = value) } }
                BusinessField("行业", profile.industry, !busy) { value -> controller.updateCustomerProfile { it.copy(industry = value) } }
                BusinessField("地址", profile.address, !busy, multiline = true) { value -> controller.updateCustomerProfile { it.copy(address = value) } }
                BusinessField("备注", profile.notes, !busy, multiline = true) { value -> controller.updateCustomerProfile { it.copy(notes = value) } }
            }
        },
        confirmButton = { TextButton(onClick = controller::saveCustomerProfile, enabled = !busy) { Text("保存") } },
        dismissButton = { TextButton(onClick = controller::cancelCustomerProfile, enabled = !busy) { Text("取消") } },
    )
}

@Composable
private fun TodosPage(state: BusinessState, controller: BusinessController) {
    var query by rememberSaveable { mutableStateOf("") }
    var status by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf("") }
    var priority by rememberSaveable { mutableStateOf("") }
    var due by rememberSaveable { mutableStateOf("") }
    val rows = filterTodos(state.todos, query, status, category, priority, due)
    val counts = countTodos(state.todos)
    val statusOptions = listOf(
        "" to "全部",
        "open" to "全部未完成",
        "not_started" to "未开始",
        "in_progress" to "进行中",
        "waiting" to "等待反馈",
        "today" to "今日到期",
        "overdue" to "已逾期",
        "completed" to "已完成",
    )
    val categoryOptions = (TODO_CATEGORIES + state.todos.map { it.category })
        .filter(String::isNotBlank).distinct().map { it to it }
    LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { BusinessField("搜索待办、客户或项目", query, !state.busy) { query = it } }
        item { Choice("状态", status, statusOptions, !state.busy) { status = it } }
        item { Choice("类别", category, listOf("" to "全部") + categoryOptions, !state.busy) { category = it } }
        item { Choice("优先级", priority, listOf("" to "全部") + TODO_PRIORITIES.map { it.key to it.value }, !state.busy) { priority = it } }
        item { Choice("日期", due, listOf("" to "全部") + listOf("today" to "今日到期", "overdue" to "已逾期"), !state.busy) { due = it } }
        item { Button(onClick = controller::newTodo, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("新建待办") } }
        item { Text("${counts.open} 项未完成 · ${counts.completed} 项已完成 · ${counts.overdue} 项逾期", style = MaterialTheme.typography.labelMedium) }
        item { Text("${rows.size} 条匹配待办", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (rows.isEmpty()) item { Text("暂无匹配待办", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(rows, key = { it.id ?: it.title }) { item ->
            Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(item.title, style = MaterialTheme.typography.titleMedium)
                    Text("${TODO_STATUSES[item.status] ?: item.status} · ${TODO_PRIORITIES[item.priority] ?: item.priority} · ${item.category}", style = MaterialTheme.typography.bodySmall)
                    item.dueDate?.takeIf(String::isNotBlank)?.let { Text("截止：$it", style = MaterialTheme.typography.bodySmall) }
                    item.owner.takeIf(String::isNotBlank)?.let { Text("负责人：$it", style = MaterialTheme.typography.bodySmall) }
                    item.customerName.takeIf(String::isNotBlank)?.let { Text("客户：$it", style = MaterialTheme.typography.bodySmall) }
                    item.projectName.takeIf(String::isNotBlank)?.let { Text("项目：$it", style = MaterialTheme.typography.bodySmall) }
                    item.related.takeIf(String::isNotBlank)?.let { Text("关联说明：$it", style = MaterialTheme.typography.bodySmall) }
                    item.notes.takeIf(String::isNotBlank)?.let { Text("备注：$it", style = MaterialTheme.typography.bodySmall) }
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(onClick = { controller.toggleTodo(item) }, enabled = !state.busy) { Text(if (item.completed) "恢复" else "完成") }
                        TextButton(onClick = { controller.editTodo(item) }, enabled = !state.busy) { Text("编辑") }
                        TextButton(onClick = { controller.deleteTodo(item) }, enabled = !state.busy) { Text("删除") }
                    }
                }
            }
        }
    }
    state.todoDraft?.let { TodoEditor(it, state.busy, controller) }
}

@Composable
private fun TodoEditor(item: TodoItem, busy: Boolean, controller: BusinessController) {
    val state = controller.state.value
    val customerOptions = buildList {
        add("" to "未关联")
        item.customerId?.takeIf { selected -> state.customerProfiles.none { it.profileId == selected } }?.let { selected ->
            add(selected to "未找到关联记录 · ${selected.take(8)}")
        }
        addAll(state.customerProfiles.mapNotNull { profile -> profile.profileId?.let { it to todoCustomerLabel(profile) } })
    }.distinctBy { it.first }
    val projectOptions = buildList {
        add("" to "未关联")
        item.projectId?.takeIf { selected -> state.projects.none { it.projectId == selected } }?.let { selected ->
            add(selected to "未找到关联记录 · ${selected.take(8)}")
        }
        addAll(state.projects.mapNotNull { project -> project.projectId?.let { it to todoProjectLabel(project) } })
    }.distinctBy { it.first }
    AlertDialog(
        onDismissRequest = { if (!busy) controller.cancelTodo() },
        title = { Text(if (item.id == null) "新建待办" else "编辑待办") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                BusinessField("事项", item.title, !busy) { value -> controller.updateTodo { it.copy(title = value) } }
                Choice("状态", item.status, TODO_STATUSES.map { it.key to it.value }, !busy) { value -> controller.updateTodo { it.copy(status = value) } }
                BusinessField("类别", item.category, !busy) { value -> controller.updateTodo { it.copy(category = value.take(60)) } }
                BusinessField("负责人", item.owner, !busy) { value -> controller.updateTodo { it.copy(owner = value.take(80)) } }
                Choice("关联客户", item.customerId.orEmpty(), customerOptions, !busy) { value ->
                    val profile = state.customerProfiles.firstOrNull { it.profileId == value }
                    controller.updateTodo { it.copy(customerId = value.ifBlank { null }, customerName = profile?.name.orEmpty()) }
                }
                BusinessField("客户名称", item.customerName, !busy) { value -> controller.updateTodo {
                    it.copy(customerName = value.take(240), customerId = if (value == it.customerName) it.customerId else null)
                } }
                Choice("关联项目", item.projectId.orEmpty(), projectOptions, !busy) { value ->
                    val project = state.projects.firstOrNull { it.projectId == value }
                    controller.updateTodo { it.copy(projectId = value.ifBlank { null }, projectName = project?.let(::todoProjectLabel).orEmpty()) }
                }
                BusinessField("项目名称", item.projectName, !busy) { value -> controller.updateTodo {
                    it.copy(projectName = value.take(240), projectId = if (value == it.projectName) it.projectId else null)
                } }
                BusinessField("关联说明", item.related, !busy) { value -> controller.updateTodo { it.copy(related = value.take(240)) } }
                BusinessField("截止日期（YYYY-MM-DD）", item.dueDate.orEmpty(), !busy) { value -> controller.updateTodo { it.copy(dueDate = value.ifBlank { null }) } }
                Choice("优先级", item.priority, TODO_PRIORITIES.map { it.key to it.value }, !busy) { value -> controller.updateTodo { it.copy(priority = value) } }
                BusinessField("备注", item.notes, !busy, multiline = true) { value -> controller.updateTodo { it.copy(notes = value) } }
            }
        },
        confirmButton = { TextButton(onClick = controller::saveTodo, enabled = !busy) { Text("保存") } },
        dismissButton = { TextButton(onClick = controller::cancelTodo, enabled = !busy) { Text("取消") } },
    )
}

private fun todoCustomerLabel(profile: CustomerProfile): String =
    profile.name.trim().ifBlank { "未命名客户 · ${profile.profileId.orEmpty().take(8)}" }

private fun todoProjectLabel(project: ProjectProgressRecord): String =
    listOf(project.customerName, project.productName, project.material)
        .map(String::trim).filter(String::isNotBlank).joinToString(" · ")
        .ifBlank { project.projectId.orEmpty().take(8) }

@Composable
private fun ProjectProgressPage(state: BusinessState, controller: BusinessController) {
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) controller.inspectProjectProgress(uri)
    }
    var confirmImport by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Button(onClick = controller::newProject, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("新建项目") } }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { picker.launch(arrayOf("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream")) }, enabled = !state.busy, modifier = Modifier.weight(1f)) { Text("导入 XLSX") }
                OutlinedButton(onClick = controller::exportProjectProgress, enabled = !state.busy, modifier = Modifier.weight(1f)) { Text("导出 XLSX") }
            }
        }
        item { TextButton(onClick = controller::projectProgressTemplate, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("下载项目进度模板") } }
        state.projectImport?.let { preview ->
            item {
                Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("待导入：${preview.filename}", fontWeight = FontWeight.SemiBold)
                        Text("已写入 ${preview.imported} 项 · 待处理 ${preview.projects.size} 项 · 错误 ${preview.errors.size}", style = MaterialTheme.typography.bodySmall)
                        preview.errors.take(8).forEach { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { confirmImport = true }, enabled = !state.busy && preview.errors.isEmpty() && preview.projects.isNotEmpty(), modifier = Modifier.weight(1f)) { Text("确认导入") }
                            TextButton(onClick = controller::clearProjectProgressImport, enabled = !state.busy, modifier = Modifier.weight(1f)) { Text("取消") }
                        }
                    }
                }
            }
        }
        item { Text("${state.projects.size} 个项目", style = MaterialTheme.typography.labelMedium) }
        if (state.projects.isEmpty()) item { Text("暂无项目进度", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(state.projects, key = { it.projectId ?: "${it.customerName}-${it.material}" }) { project ->
            val score = scoreProjectProgress(project)
            Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("${project.customerName} · ${project.material}", style = MaterialTheme.typography.titleMedium)
                    Text("${project.industry} · 阶段${project.stageCode.ifBlank { project.customStageLabel }} · ${score.total}分 / ${score.tier}档", style = MaterialTheme.typography.bodySmall)
                    if (project.nextAction.isNotBlank()) Text("下一步：${project.nextAction}", style = MaterialTheme.typography.bodySmall)
                    if (project.milestoneDate.isNotBlank()) Text("时间节点：${project.milestoneDate}", style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { controller.editProject(project) }, enabled = !state.busy) { Text("编辑") }
                }
            }
        }
    }
    state.projectDraft?.let { ProjectEditor(it, state.busy, controller) }
    if (confirmImport) AlertDialog(
        onDismissRequest = { confirmImport = false },
        title = { Text("确认导入项目进度") },
        text = { Text("将新增或按项目编号和数据版本更新 ${state.projectImport?.projects?.size ?: 0} 个项目。已写入项目不会重复提交。") },
        confirmButton = { TextButton(onClick = { confirmImport = false; controller.commitProjectProgressImport() }) { Text("导入") } },
        dismissButton = { TextButton(onClick = { confirmImport = false }) { Text("取消") } },
    )
}

@Composable
private fun ProjectEditor(project: ProjectProgressRecord, busy: Boolean, controller: BusinessController) {
    AlertDialog(
        onDismissRequest = { if (!busy) controller.cancelProject() },
        title = { Text(if (project.projectId == null) "新建项目" else "编辑项目") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                BusinessField("行业", project.industry, !busy) { value -> controller.updateProject { it.copy(industry = value) } }
                Choice("客户类型", project.customerType, listOf("oem" to "汽车零部件主机厂", "non_auto" to "非汽车客户"), !busy) { value -> controller.updateProject { it.copy(customerType = value) } }
                BusinessField("客户名称", project.customerName, !busy) { value -> controller.updateProject { it.copy(customerName = value) } }
                BusinessField("材料", project.material, !busy) { value -> controller.updateProject { it.copy(material = value) } }
                BusinessField("推荐牌号", project.recommendedGrade, !busy) { value -> controller.updateProject { it.copy(recommendedGrade = value) } }
                Choice("材料价值", project.materialValue, listOf("special" to "特种高价值", "reinforced" to "常规增强改性", "general" to "低附加值通用料"), !busy) { value -> controller.updateProject { it.copy(materialValue = value, customMaterialValue = "") } }
                BusinessField("自定义材料价值", project.customMaterialValue, !busy) { value -> controller.updateProject { it.copy(customMaterialValue = value) } }
                Choice("项目阶段", project.stageCode, listOf("1" to "项目接触", "2" to "送样 / 试料", "3" to "测试 / 认证", "4" to "定点 / 小批", "5" to "量产"), !busy) { value -> controller.updateProject { it.copy(stageCode = value, customStageLabel = "") } }
                BusinessField("自定义项目阶段", project.customStageLabel, !busy) { value -> controller.updateProject { it.copy(customStageLabel = value) } }
                Choice("客户战略价值", project.customerValue, listOf("geely_strategic" to "吉利系 / 战略客户", "oem_t1_important" to "主机厂 T1 重要", "oem_t1_regular" to "主机厂 T1 普通", "non_auto" to "非汽车客户"), !busy) { value -> controller.updateProject { it.copy(customerValue = value, customCustomerValue = "") } }
                BusinessField("自定义客户价值", project.customCustomerValue, !busy) { value -> controller.updateProject { it.copy(customCustomerValue = value) } }
                Choice("竞争态势", project.competition, listOf("awarded" to "已定点我司 / 独供", "open" to "有竞争未定点", "intense" to "竞争激烈暂无优势", "lost" to "已失单 / 无望"), !busy) { value -> controller.updateProject { it.copy(competition = value, customCompetition = "") } }
                BusinessField("自定义竞争态势", project.customCompetition, !busy) { value -> controller.updateProject { it.copy(customCompetition = value) } }
                BusinessField("颜色", project.color, !busy) { value -> controller.updateProject { it.copy(color = value) } }
                BusinessField("竞争对手", project.competitor, !busy) { value -> controller.updateProject { it.copy(competitor = value) } }
                BusinessField("产品名称", project.productName, !busy) { value -> controller.updateProject { it.copy(productName = value) } }
                BusinessField("下一步动作", project.nextAction, !busy, multiline = true) { value -> controller.updateProject { it.copy(nextAction = value) } }
                BusinessField("时间节点（YYYY-MM-DD）", project.milestoneDate, !busy) { value -> controller.updateProject { it.copy(milestoneDate = value) } }
                BusinessField("备注", project.notes, !busy, multiline = true) { value -> controller.updateProject { it.copy(notes = value) } }
                Text("当前评分：${scoreProjectProgress(project).total}分，${scoreProjectProgress(project).tier}档", style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = { TextButton(onClick = controller::saveProject, enabled = !busy) { Text("保存") } },
        dismissButton = { TextButton(onClick = controller::cancelProject, enabled = !busy) { Text("取消") } },
    )
}

@Composable
private fun ImportPage(ui: MobileUiState, state: BusinessState, controller: BusinessController) {
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) controller.previewImport(uri) }
    var confirm by remember { mutableStateOf(false) }
    val preview = state.importPreview
    LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Choice("导入客户", state.importOptions.customer, listOf("" to "按文件中的客户列") + ui.customers.map { it.displayName to it.displayName }, !state.busy) {
                controller.updateImportOptions { options -> options.copy(customer = it) }
            }
        }
        item { BusinessField("无日期时的业务日期", state.importOptions.date, !state.busy) { value -> controller.updateImportOptions { it.copy(date = value) } } }
        item { Choice("默认税口径", state.importOptions.tax, TAX_TYPES.map { it to it }, !state.busy) { value -> controller.updateImportOptions { it.copy(tax = value) } } }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { picker.launch(arrayOf("text/*", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/pdf", "application/octet-stream")) }, enabled = !state.busy) { Text("选择文件并预览") }
                TextButton(onClick = controller::template, enabled = !state.busy) { Text("导入模板") }
            }
        }
        if (preview != null) {
            val pageCount = maxOf(1, (preview.rows.size + 49) / 50)
            val start = state.importPage * 50
            val pageRows = preview.rows.drop(start).take(50)
            item {
                Text(state.importFilename, fontWeight = FontWeight.Bold)
                Text("有效${preview.rows.size} · 新增${preview.newCount} · 更新${preview.updateCount} · 重复${preview.duplicateCount} · 错误${preview.errors.size}")
            }
            items(preview.errors.take(50)) { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            itemsIndexed(pageRows, key = { index, row -> "${row.row}-${row.importKey}-$index" }) { pageOffset, row ->
                Column(Modifier.fillMaxWidth()) {
                    Text("${row.customer} · ${row.grade} · ${row.color}", fontWeight = FontWeight.Medium)
                    if (row.material.isNotBlank()) Text("材料：${row.material}", style = MaterialTheme.typography.bodySmall)
                    if (row.materialSpec.isNotBlank()) Text("材料规格：${row.materialSpec}", style = MaterialTheme.typography.bodySmall)
                    Text("${row.price}元/kg · ${row.tax} · ${row.date}", style = MaterialTheme.typography.bodySmall)
                    if (row.note.isNotBlank()) Text("备注：${row.note}", style = MaterialTheme.typography.bodySmall)
                    if (row.reason.isNotBlank()) Text("调价原因：${row.reason}", style = MaterialTheme.typography.bodySmall)
                    Text("来源：${row.file} · ${row.sheet} · 第${row.row}行", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val action = preview.rowActions.getOrNull(start + pageOffset).orEmpty()
                    if (action.isNotBlank()) Text(action,
                        color = if (action == "匹配冲突") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelSmall)
                    HorizontalDivider(Modifier.padding(top = 8.dp))
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                    IconButton(onClick = { controller.setImportPage(state.importPage - 1) }, enabled = !state.busy && state.importPage > 0) {
                        Icon(Icons.Default.KeyboardArrowLeft, "上一页导入预览")
                    }
                    Text(if (preview.rows.isEmpty()) "0条" else "第${state.importPage + 1} / ${pageCount}页 · ${start + 1}-${start + pageRows.size}条")
                    IconButton(onClick = { controller.setImportPage(state.importPage + 1) }, enabled = !state.busy && state.importPage + 1 < pageCount) {
                        Icon(Icons.Default.KeyboardArrowRight, "下一页导入预览")
                    }
                }
            }
            item { Button(onClick = { confirm = true }, enabled = !state.busy && preview.errors.isEmpty() && preview.fresh.isNotEmpty() && ui.pendingBusiness == null && ui.pendingSave == null, modifier = Modifier.fillMaxWidth()) { Text("确认导入 ${preview.fresh.size} 条") } }
        }
    }
    if (confirm) AlertDialog(onDismissRequest = { confirm = false }, title = { Text("导入云端报价") },
        text = { Text("将先保存完整备份，再导入${preview?.fresh?.size ?: 0}条报价。重复内容不会再次添加，现有历史保留。") },
        confirmButton = { TextButton(onClick = { confirm = false; controller.commitImport() }) { Text("确认导入") } },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("取消") } })
}

@Composable
internal fun CustomerLifecycleAction(customer: CustomerRecord, controller: BusinessController) {
    val state by controller.state.collectAsState()
    var confirm by remember(customer.customerKey) { mutableStateOf(false) }
    var reason by remember(customer.customerKey) { mutableStateOf("") }
    val restore = customer.status == "deleted"
    TextButton(onClick = { confirm = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
        Text(if (restore) "恢复客户" else "移入回收站", color = if (restore) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
    }
    if (confirm) AlertDialog(onDismissRequest = { confirm = false }, title = { Text(if (restore) "恢复客户" else "移入回收站") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("${customer.displayName}\n${customer.records}条报价历史保留。操作前自动生成完整备份。")
                BusinessField("操作原因（选填）", reason, true) { reason = it }
            }
        }, confirmButton = { TextButton(onClick = { confirm = false; controller.changeCustomer(customer, restore, reason) }) { Text("确认") } },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("取消") } })
}

@Composable
private fun RecyclePage(state: BusinessState, controller: BusinessController) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { TextButton(onClick = controller::loadRecycle, enabled = !state.busy) { Text("刷新回收站") } }
        if (state.recycled.isEmpty() && !state.busy) item { Text("回收站为空", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(state.recycled, key = { it.customerKey }) { customer ->
            Column(Modifier.fillMaxWidth()) {
                Text(customer.displayName, style = MaterialTheme.typography.titleMedium)
                Text("${customer.specs}规格 · ${customer.records}报价 · ${customer.deletedAt.orEmpty()}", style = MaterialTheme.typography.bodySmall)
                if (customer.deletedReason.isNotBlank()) Text(customer.deletedReason, style = MaterialTheme.typography.bodySmall)
                CustomerLifecycleAction(customer, controller)
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun DocumentsPage(state: BusinessState, controller: BusinessController) {
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { if (it != null) controller.importDraft(it) }
    var deleteEntry by remember { mutableStateOf<DocumentEntry?>(null) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { MenuButton("新建报价单", !state.busy) { controller.newDocument("quotation") } }
        item { MenuButton("新建购销合同", !state.busy) { controller.newDocument("contract") } }
        item { MenuButton("导入单据草稿", !state.busy) { picker.launch(arrayOf("application/json", "text/*", "application/octet-stream")) } }
        item { Text("本机草稿", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp)) }
        if (state.documents.isEmpty()) item { Text("暂无已保存草稿", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(state.documents, key = { it.id }) { entry ->
            Column(Modifier.fillMaxWidth()) {
                MenuButton("${entry.title} · ${entry.buyer.ifBlank { "未填需方" }} · ${entry.date}", !state.busy) { controller.openDocument(entry.id) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    Text(entry.syncStatusLabel(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TextButton(onClick = { deleteEntry = entry }, enabled = !state.busy) { Text("删除记录") }
                }
            }
        }
    }
    deleteEntry?.let { entry ->
        AlertDialog(
            onDismissRequest = { deleteEntry = null },
            title = { Text("删除制作记录") },
            text = { Text("将删除本机记录${if (entry.remoteId != null) "并同步云端" else ""}。此操作不可恢复。") },
            confirmButton = { TextButton(onClick = { deleteEntry = null; controller.deleteDocument(entry) }, enabled = !state.busy) { Text("确认删除") } },
            dismissButton = { TextButton(onClick = { deleteEntry = null }, enabled = !state.busy) { Text("取消") } },
        )
    }
}

private fun DocumentEntry.syncStatusLabel(): String = when (syncStatus) {
    "synced" -> "已同步"
    "pending" -> "待同步"
    "conflict" -> "云端有新版本"
    else -> "仅本机"
}

@Composable
private fun DocumentEditor(state: BusinessState, controller: BusinessController) {
    val document = state.document ?: return
    val contract = document.kind == "contract"
    val enabled = !state.busy
    var supplierExpanded by rememberSaveable { mutableStateOf(false) }
    var buyerExpanded by rememberSaveable { mutableStateOf(false) }
    var termsExpanded by rememberSaveable { mutableStateOf(false) }
    var expandedProductIndex by rememberSaveable(state.documentId) { mutableIntStateOf(0) }
    LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text(if (state.documentDirty) "未保存修改" else "草稿已保存", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall) }
        val common = if (contract) listOf("date" to "签订日期", "contract_no" to "合同编号", "place" to "合同履行地点")
            else listOf("date" to "报价日期", "recipient" to "收件人", "sender" to "发件人", "subject" to "主题", "cc" to "抄送", "email" to "电子邮件")
        item { DocumentField("buyer_name", "需方单位名称", document, controller, enabled) }
        items(common) { (key, label) -> DocumentField(key, label, document, controller, enabled) }
        if (!contract) item { Choice("税口径", document.fields["tax_type"].orEmpty(), TAX_TYPES.map { it to it }, enabled) { value -> controller.updateDocument { it.copy(fields = it.fields + ("tax_type" to value)) } } }
        if (contract) item { Text("合同价格为含税价；不会从未税报价自动换算税率。", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall) }
        document.items.forEachIndexed { index, product ->
            item(key = "item-title-$index") {
                HorizontalDivider()
                val summary = listOf(
                    product["name"].orEmpty(),
                    product["model"].orEmpty(),
                    product["quantity"].orEmpty().takeIf(String::isNotBlank)?.let { "数量 $it kg" }.orEmpty(),
                    product["price"].orEmpty().takeIf(String::isNotBlank)?.let { "￥$it/kg" }.orEmpty(),
                ).filter(String::isNotBlank).joinToString(" · ").ifBlank { "待填写" }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    TextButton(
                        onClick = { expandedProductIndex = if (expandedProductIndex == index) -1 else index },
                        enabled = enabled,
                        modifier = Modifier.weight(1f),
                    ) {
                        Column(Modifier.weight(1f), horizontalAlignment = Alignment.Start) {
                            Text("产品 ${index + 1}", fontWeight = FontWeight.SemiBold)
                            Text(summary, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                        }
                        Icon(
                            Icons.Default.KeyboardArrowDown,
                            contentDescription = if (expandedProductIndex == index) "收起产品 ${index + 1} 明细" else "展开产品 ${index + 1} 明细",
                            modifier = Modifier.rotate(if (expandedProductIndex == index) 180f else 0f),
                        )
                    }
                    if (document.items.size > 1) TextButton(
                        onClick = {
                            expandedProductIndex = when {
                                expandedProductIndex == index -> (index - 1).coerceAtLeast(0)
                                expandedProductIndex > index -> expandedProductIndex - 1
                                else -> expandedProductIndex
                            }
                            controller.updateDocument { it.copy(items = it.items.filterIndexed { at, _ -> at != index }) }
                        },
                        enabled = enabled,
                    ) { Text("删除") }
                }
            }
            val fields = if (contract) listOf("name" to "产品名称", "model" to "规格型号", "manufacturer" to "生产厂家", "quantity" to "数量（kg）", "price" to "含税单价（元/kg）", "delivery" to "交货时间")
                else listOf("name" to "材料名称", "model" to "材料规格", "price" to "价格（元/kg）", "note" to "备注")
            if (expandedProductIndex == index) {
                fields.forEach { (key, label) ->
                    item(key = "item-$index-$key") {
                        BusinessField(
                            label,
                            product[key].orEmpty(),
                            enabled,
                            numeric = key in listOf("quantity", "price"),
                            modifier = Modifier.testTag("document-item-$index-$key"),
                        ) { value ->
                            controller.updateDocument { it.copy(items = it.items.mapIndexed { at, item -> if (at == index) item + (key to value) else item }) }
                        }
                    }
                }
                if (contract) item { Text("金额：${runCatching { itemAmount(product).toPlainString() }.getOrDefault("待填写")} 元", style = MaterialTheme.typography.bodyMedium) }
            }
        }
        item { OutlinedButton(onClick = {
            expandedProductIndex = document.items.size
            controller.updateDocument { it.copy(items = it.items + BusinessDocument.blankItem()) }
        }, enabled = enabled && document.items.size < 30, modifier = Modifier.fillMaxWidth()) { Text("增加产品（${document.items.size}/30）") } }
        item { ExpandHeader("供方资料", supplierExpanded) { supplierExpanded = !supplierExpanded } }
        if (supplierExpanded) {
            DOCUMENT_PARTY_FIELDS.zip(DOCUMENT_PARTY_LABELS).forEach { (key, label) -> item { DocumentField("seller_$key", "供方$label", document, controller, enabled) } }
            if (contract) item { DocumentField("email", "电子邮件", document, controller, enabled) }
            item { OutlinedButton(onClick = controller::saveSupplierProfile, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text("保存为本账号默认供方") } }
        }
        item { ExpandHeader("需方资料", buyerExpanded) { buyerExpanded = !buyerExpanded } }
        if (buyerExpanded) DOCUMENT_PARTY_FIELDS.zip(DOCUMENT_PARTY_LABELS).filter { it.first != "name" }.forEach { (key, label) -> item { DocumentField("buyer_$key", "需方$label", document, controller, enabled) } }
        if (contract) item { Choice("结算方式", document.payment, DOCUMENT_PAYMENTS.map { it to it }, enabled) { value -> controller.updateDocument { it.copy(payment = value) } } }
        item { ExpandHeader(if (contract) "合同条款" else "报价说明", termsExpanded) { termsExpanded = !termsExpanded } }
        if (termsExpanded) DOCUMENT_TERMS.keys.zip(DOCUMENT_TERM_LABELS).filter { (key, _) -> (key != "quote_note") == contract }.forEach { (key, label) ->
            item { BusinessField(label, document.terms[key].orEmpty(), enabled, multiline = true) { value -> controller.updateDocument { it.copy(terms = it.terms + (key to value)) } } }
        }
        if (contract) item { Text("合同合计：${runCatching { document.items.fold(BigDecimal.ZERO) { sum, item -> sum + itemAmount(item) }.toPlainString() }.getOrDefault("待填写")} 元", fontWeight = FontWeight.Bold) }
        item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = controller::saveDocument, enabled = enabled, modifier = Modifier.weight(1f)) { Text("保存草稿") }
            Button(onClick = controller::previewDocument, enabled = enabled, modifier = Modifier.weight(1f)) { Text("生成PDF") }
        } }
        item { OutlinedButton(onClick = controller::exportWord, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text("导出Word") } }
        item { TextButton(onClick = controller::exportDraft, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text("导出可编辑草稿") } }
    }
}

@Composable
private fun DocumentField(key: String, label: String, document: BusinessDocument, controller: BusinessController, enabled: Boolean) {
    BusinessField(label, document.fields[key].orEmpty(), enabled) { value -> controller.updateDocument { it.copy(fields = it.fields + (key to value)) } }
}

@Composable
private fun ExpandHeader(label: String, expanded: Boolean, onClick: () -> Unit) {
    TextButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Text(label, Modifier.weight(1f), fontWeight = FontWeight.Medium)
        Icon(Icons.Default.KeyboardArrowDown, if (expanded) "收起$label" else "展开$label", modifier = Modifier.rotate(if (expanded) 180f else 0f))
    }
}

@Composable
private fun InventoryPage(state: BusinessState, controller: BusinessController) {
    val context = LocalContext.current
    val preferences = remember(context) { MobilePreferences(context) }
    val credentialResult = remember(preferences) { runCatching { preferences.loadMesCredentials() } }
    var savedCredentials by remember { mutableStateOf(credentialResult.getOrNull()) }
    var credentialError by remember { mutableStateOf(credentialResult.exceptionOrNull()?.message) }
    var username by rememberSaveable { mutableStateOf(savedCredentials?.username.orEmpty()) }
    var password by remember { mutableStateOf(savedCredentials?.password.orEmpty()) }
    var rememberLogin by rememberSaveable { mutableStateOf(savedCredentials != null) }
    var text by rememberSaveable { mutableStateOf("") }
    var mode by rememberSaveable { mutableStateOf("material_code") }
    var httpConfirm by remember { mutableStateOf(false) }
    var capturedPassword by remember { mutableStateOf("") }
    LaunchedEffect(state.inventoryLoggedIn) {
        if (state.inventoryLoggedIn) {
            password = ""
            val loaded = runCatching { preferences.loadMesCredentials() }
            savedCredentials = loaded.getOrNull()
            credentialError = loaded.exceptionOrNull()?.message
            rememberLogin = savedCredentials != null
        }
    }
    fun clearSavedLogin(clearInputs: Boolean = false) {
        runCatching { preferences.clearMesCredentials() }
            .onSuccess {
                savedCredentials = null
                credentialError = null
                rememberLogin = false
                if (clearInputs) {
                    username = ""
                    password = ""
                }
            }
            .onFailure { credentialError = it.message ?: "无法清除已保存的MES登录信息，请重试" }
    }
    LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (!state.inventoryLoggedIn) {
            item { Text("MES 独立账号", style = MaterialTheme.typography.titleSmall) }
            credentialError?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }
            item { BusinessField("MES账号", username, !state.busy) { username = it } }
            item { OutlinedTextField(password, { password = it }, label = { Text("MES密码") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), enabled = !state.busy, modifier = Modifier.fillMaxWidth()) }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = rememberLogin, onCheckedChange = { checked ->
                        if (checked) rememberLogin = true else clearSavedLogin()
                    }, enabled = !state.busy, modifier = Modifier.testTag("mes-remember-login"))
                    Text("记住账号和密码（本机加密）")
                }
            }
            if (savedCredentials != null || credentialError != null) item {
                TextButton(onClick = { clearSavedLogin(clearInputs = true) }, enabled = !state.busy,
                    modifier = Modifier.testTag("mes-clear-saved-login")) { Text("清除已保存登录") }
            }
            item { Button(onClick = { capturedPassword = password; password = ""; httpConfirm = true }, enabled = !state.busy && username.isNotBlank() && password.isNotEmpty(), modifier = Modifier.fillMaxWidth()) { Text("登录MES") } }
        } else {
            item { Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text("MES已登录", Modifier.weight(1f)); TextButton(onClick = controller::logoutMes, enabled = !state.busy) { Text("退出MES") } } }
            item { Choice("查询方式", mode, listOf("material_code" to "物料编码", "material_name" to "物料名称", "reserve" to "批号备货"), !state.busy) { mode = it } }
            item { BusinessField(if (mode == "reserve") "批号（精确匹配）" else "物料关键字", text, !state.busy) { text = it } }
            item { Button(onClick = { controller.queryInventory(text, mode) }, enabled = !state.busy && text.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("查询") } }
            state.inventory?.let { result ->
                item {
                    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("${result.query} · 共${result.total}条 · ${result.queriedAt}", style = MaterialTheme.typography.bodySmall)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconButton(onClick = { controller.queryInventory(result.query, result.mode, result.page - 1) }, enabled = !state.busy && result.page > 1) { Icon(Icons.Default.KeyboardArrowLeft, "上一页库存") }
                            Text("${result.page}/${result.pages}")
                            IconButton(onClick = { controller.queryInventory(result.query, result.mode, result.page + 1) }, enabled = !state.busy && result.page < result.pages) { Icon(Icons.Default.KeyboardArrowRight, "下一页库存") }
                            TextButton(onClick = controller::exportInventory, enabled = !state.busy && result.rows.isNotEmpty()) { Text("导出本页") }
                        }
                        InventoryQuantityTotals(result)
                    }
                }
                if (result.rows.isEmpty()) item { Text("未查询到匹配库存") }
                items(result.rows) { row ->
                    Column(Modifier.fillMaxWidth()) {
                        Text(row["牌号"].orEmpty(), fontWeight = FontWeight.Bold)
                        row.filter { it.key != "牌号" && it.value.isNotBlank() }.forEach { (key, value) -> Text("$key：$value", style = MaterialTheme.typography.bodySmall) }
                        if (result.mode != "reserve" && !row["批号"].isNullOrBlank()) InventoryBatchActions(
                            batch = row["批号"].orEmpty(),
                            enabled = !state.busy,
                            onCopy = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("MES批号", row["批号"].orEmpty()))
                                Toast.makeText(context, "批号已复制", Toast.LENGTH_SHORT).show()
                            },
                            onReserve = { text = row["批号"].orEmpty(); mode = "reserve"; controller.queryInventory(text, mode) },
                        )
                        HorizontalDivider(Modifier.padding(vertical = 8.dp))
                    }
                }
            }
        }
    }
    if (httpConfirm) AlertDialog(onDismissRequest = { httpConfirm = false; capturedPassword = "" }, title = { Text("MES旧服务使用HTTP") },
        text = { Text("电脑端同一旧服务 mes.njjulong.cn:8081 使用明文HTTP，会传输MES账号密码。仅在可信网络继续；勾选记住后，凭据在本机加密保存，MES会话不写入磁盘。") },
        confirmButton = { TextButton(onClick = { val value = capturedPassword; capturedPassword = ""; httpConfirm = false; controller.loginMes(username, value, rememberLogin) }) { Text("继续登录") } },
        dismissButton = { TextButton(onClick = { httpConfirm = false; capturedPassword = "" }) { Text("取消") } })
}

@Composable
internal fun InventoryQuantityTotals(result: InventoryResult) {
    val totals = remember(result) { inventoryQuantitySummaries(result) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        totals.forEach { total ->
            val warning = if (total.missingQuantity) "（存在空数量，合计仅含已知值）" else ""
            if (result.mode == "reserve") {
                Text("本页备货数量 ${total.stock.toPlainString()} · MES 未提供单位${if (total.missingQuantity) "（存在空数量，仅合计已知值）" else ""}")
            } else {
                val unit = total.unit ?: "未注明单位"
                val available = requireNotNull(total.available)
                Text("本页库存 ${total.stock.toPlainString()} $unit · 可分配 ${available.toPlainString()} $unit$warning")
            }
        }
    }
}

@Composable
internal fun InventoryBatchActions(batch: String, enabled: Boolean, onCopy: () -> Unit, onReserve: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onReserve, enabled = enabled, modifier = Modifier.weight(1f).testTag("inventory-batch-reserve")) {
            Text("查询此批号备货")
        }
        TextButton(
            onClick = onCopy,
            enabled = enabled,
            modifier = Modifier.testTag("inventory-batch-copy").semantics { contentDescription = "复制批号 $batch" },
        ) { Text("复制批号") }
    }
}

@Composable
private fun BackupPage(state: BusinessState, controller: BusinessController) {
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { if (it != null) controller.inspectBackup(it) }
    var restoreConfirm by remember { mutableStateOf(false) }
    val backup = state.restored
    val rows = remember(backup, state.backupQuery) {
        val query = businessNorm(state.backupQuery)
        backup?.quotes.orEmpty().filter { row -> query.isEmpty() || businessNorm(listOf("customer", "grade", "material", "color", "note").joinToString(" ") { row.optString(it) }).contains(query) }
            .sortedWith(compareByDescending<org.json.JSONObject> { it.optString("effective_date") }.thenByDescending { it.optLong("id") })
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { MenuButton("导出云端完整SQLite备份", !state.busy, action = controller::createBackup) }
        item { MenuButton("选择电脑/手机备份并校验", !state.busy) { picker.launch(arrayOf("*/*")) } }
        item { MenuButton("打开本机恢复库", !state.busy, action = controller::openRestoredBackup) }
        if (backup != null) {
            item {
                Text(state.restoredName, fontWeight = FontWeight.Bold)
                Text("完整性已核对：${backup.customers.size}客户 · ${backup.quotes.size}报价 · ${backup.audit.size}操作记录")
                Text("恢复到独立本机资料库，不覆盖云端。电脑端同样没有云库覆盖恢复接口。", style = MaterialTheme.typography.bodySmall)
            }
            item { Button(onClick = { restoreConfirm = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("恢复到本机资料库") } }
            item { OutlinedButton(onClick = controller::exportRestoredBackup, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("另存完整备份") } }
            item { BusinessField("查询备份中的客户、牌号、材料", state.backupQuery, !state.busy, onChange = controller::setBackupQuery) }
            item { Text("匹配${rows.size}条历史报价", style = MaterialTheme.typography.labelMedium) }
            items(rows.take(300), key = { it.optString("id") }) { row ->
                Column(Modifier.fillMaxWidth()) {
                    Text("${row.optString("customer")} · ${row.optString("grade")}", fontWeight = FontWeight.Medium)
                    Text("${row.optString("price")}元/kg · ${row.optString("tax_type")} · ${row.optString("effective_date")}", style = MaterialTheme.typography.bodySmall)
                    Text("${row.optString("material")} ${row.optString("color")} ${row.optString("note")}", style = MaterialTheme.typography.bodySmall)
                    HorizontalDivider(Modifier.padding(top = 8.dp))
                }
            }
            if (rows.size > 300) item { Text("显示前300条，请缩小查询范围或将完整备份交由电脑端查询。") }
        }
    }
    if (restoreConfirm) AlertDialog(onDismissRequest = { restoreConfirm = false }, title = { Text("恢复本机资料库") },
        text = { Text("将保存已校验的全部客户、报价和审计记录，作为本机离线资料库。不会上传或覆盖云端数据。") },
        confirmButton = { TextButton(onClick = { restoreConfirm = false; controller.restoreLocalBackup() }) { Text("确认恢复") } },
        dismissButton = { TextButton(onClick = { restoreConfirm = false }) { Text("取消") } })
}

@Composable
private fun BusinessField(label: String, value: String, enabled: Boolean, numeric: Boolean = false, multiline: Boolean = false, modifier: Modifier = Modifier, onChange: (String) -> Unit) {
    OutlinedTextField(value, onChange, label = { Text(label) }, enabled = enabled, modifier = modifier.fillMaxWidth(),
        singleLine = !multiline, minLines = if (multiline) 3 else 1,
        keyboardOptions = KeyboardOptions(keyboardType = if (numeric) KeyboardType.Decimal else KeyboardType.Text))
}

@Composable
private fun Choice(label: String, value: String, options: List<Pair<String, String>>, enabled: Boolean, onChange: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth()) {
        OutlinedButton(onClick = { expanded = true }, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp), shape = androidx.compose.foundation.shape.RoundedCornerShape(6.dp)) {
            Text("$label：${options.firstOrNull { it.first == value }?.second ?: value}", Modifier.weight(1f))
            Icon(Icons.Default.KeyboardArrowDown, null)
        }
        DropdownMenu(expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (key, name) -> DropdownMenuItem(text = { Text(name) }, onClick = { expanded = false; onChange(key) }) }
        }
    }
}
