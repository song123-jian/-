'use strict';
const $ = id => document.getElementById(id);
const state = {meta: null, items: [], page: 1, pageSize: 15, token: '', editing: null, history: null, preview: null, request: null, backend: 'sqlite'};
const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function money(value) {
  if (value === null || value === undefined) return '—';
  const [whole, fraction = ''] = String(value).split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction.padEnd(2, '0');
}
function change(value) {
  if (value === null || value === undefined) return '<span class="muted">首次记录</span>';
  const amount = Number(value);
  return `<span class="${amount > 0 ? 'change-up' : amount < 0 ? 'change-down' : 'muted'}">${amount > 0 ? '+' : ''}${money(value)}</span>`;
}
function taxBadge(row) {return `<span class="badge ${row.tax_type === '含税' ? 'tax' : row.tax_type === '未税' ? 'untaxed' : 'neutral'}">${escapeHTML(row.tax_type)}</span>`;}
function icons() {
  const ids = {newQuote:'plus',queryNav:'search',dataNav:'database',resetSearch:'rotate-ccw',exportCurrent:'download',exportHistory:'history',backupButton:'hard-drive-download',templateButton:'file-down',schemaButton:'code-xml',testConnection:'plug',saveBackend:'database',saveQuote:'save',updateFromHistory:'square-pen',previousPage:'chevron-left',nextPage:'chevron-right',commitImport:'upload'};
  Object.entries(ids).forEach(([id, name]) => {const b=$(id); if(!b.querySelector('svg,i')){const i=document.createElement('i');i.setAttribute('data-lucide',name);i.setAttribute('aria-hidden','true');b.prepend(i);}});
  document.querySelectorAll('.icon-button').forEach(b=>{if(!b.querySelector('svg,i')){b.textContent='';b.innerHTML='<i data-lucide="x" aria-hidden="true"></i>';b.title=b.getAttribute('aria-label');}});
  window.lucide?.createIcons();
}
function notify(message, error = false) {
  $('notice').textContent = message; $('notice').className = 'notice' + (error ? ' error' : ''); $('notice').hidden = false;
}
async function api(path, data, signal) {
  const response = await fetch(path, {method: data === undefined ? 'GET' : 'POST', headers: {'Content-Type':'application/json', 'X-Price-Token':state.token}, body: data === undefined ? undefined : JSON.stringify({...data,_storage_revision:state.storageRevision}), signal});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '操作失败，请重试');
  return result;
}
function filters() {
  return new URLSearchParams({customer: $('customerSearch').value.trim(), q: $('gradeSearch').value.trim(), material: $('materialFilter').value, tax: $('taxFilter').value, from: $('fromDate').value, to: $('toDate').value, stale: $('staleFilter').checked ? '1' : ''});
}
async function loadMeta() {
  state.meta = await api('/api/meta'); state.token = state.meta.token;
  $('customerCount').textContent = state.meta.customers.length;
  $('customerList').innerHTML = `<button class="customer-item" data-customer=""><span>全部客户</span><span class="count">${state.meta.customers.length}</span></button>` + state.meta.customers.map(c => `<button class="customer-item" data-customer="${escapeHTML(c.name)}"><span>${escapeHTML(c.name)}</span><span class="count">${c.count}</span></button>`).join('');
  const selectedMaterial = $('materialFilter').value;
  $('materialFilter').innerHTML = '<option value="">全部类别</option>' + state.meta.materials.map(m => `<option>${escapeHTML(m)}</option>`).join('');
  $('materialFilter').value = selectedMaterial;
  $('sourceInfo').textContent = state.meta.backend === 'supabase' ? '正在使用 Supabase 云端报价；可导入随附 Excel 或后续报价文件。' : `初始数据：${state.meta.seed.customers} 个客户、${state.meta.seed.records} 条真实报价。更早历史可继续导入或补录。`;
  $('dataLocation').textContent = state.meta.data_path;
  $('newQuote').disabled = false;
}
async function loadBackend() {
  const result = await api('/api/backend'); state.token = result.token; state.backend = result.backend;
  state.storageRevision = result.storage_revision;
  $('backendMode').value = result.backend; $('supabaseUrl').value = result.url;
  $('supabaseKey').value = ''; $('supabaseKey').placeholder = result.has_key ? '已保存；留空沿用同一项目密钥' : '输入项目后端密钥';
  $('supabaseFields').hidden = result.backend !== 'supabase';
  $('backendBadge').textContent = result.backend === 'supabase' ? 'Supabase 云数据库' : '本地数据库';
}
async function configureBackend(save) {
  $('testConnection').disabled = true; $('saveBackend').disabled = true;
  $('backendMessage').textContent = save ? '正在检查并切换数据库…' : '正在检查连接…';
  try {
    const result = await api('/api/backend/' + (save ? 'save' : 'test'), {backend:$('backendMode').value, url:$('supabaseUrl').value.trim(), key:$('supabaseKey').value.trim()});
    $('backendMessage').textContent = result.message;
    if (save) {
      state.preview = null; $('commitImport').disabled = true; $('importPreview').hidden = true; $('importFile').value = ''; $('importStatus').textContent = '数据后端已切换，请重新选择报价文件。';
      state.items = []; state.meta = null; $('newQuote').disabled = true; renderRows();
      await loadBackend(); await loadMeta(); await query(); notify(result.message);
    }
  } catch (error) {$('backendMessage').textContent = '操作失败：' + error.message;}
  finally {$('testConnection').disabled = false; $('saveBackend').disabled = false;}
}
async function query(resetPage = true) {
  state.request?.abort(); state.request = new AbortController();
  const signal = state.request.signal;
  try {
    const result = await api('/api/quotes?' + filters(), undefined, signal);
    if (resetPage) state.page = 1;
    state.items = result.items;
    $('statCustomers').textContent = result.stats.customers;
    $('statItems').textContent = result.stats.items;
    $('statRecords').textContent = result.stats.records;
    $('statDate').textContent = result.stats.last_date || '—';
    const customer = $('customerSearch').value.trim();
    $('resultsTitle').textContent = customer ? `“${customer}”的匹配报价` : '全部客户报价';
    $('resultCaption').textContent = `共 ${result.stats.items} 个报价规格 · ${result.stats.records} 条历史 · 价格单位：元/kg`;
    document.querySelectorAll('[data-customer]').forEach(b => {const selected = b.dataset.customer === customer; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', String(selected));});
    renderRows();
  } catch (error) {if (error.name !== 'AbortError') {notify(error.message, true); $('resultCaption').textContent = '本次查询失败，请检查条件后重试。';}}
}
function renderRows() {
  const totalPages = Math.max(1, Math.ceil(state.items.length / state.pageSize));
  state.page = Math.max(1, Math.min(state.page, totalPages));
  const start = (state.page - 1) * state.pageSize;
  const rows = state.items.slice(start, start + state.pageSize);
  $('quoteRows').innerHTML = rows.map(r => `<tr>
    <td><span class="customer-name">${escapeHTML(r.customer)}</span><span class="grade">${escapeHTML(r.grade)}</span></td>
    <td>${escapeHTML(r.material || '—')}<span class="subtext">${escapeHTML(r.color || '未注明颜色')}</span></td>
    <td class="number"><span class="price">${money(r.price)}</span>${r.delta !== null ? `<span class="subtext">较上一条 ${Number(r.delta) > 0 ? '+' : ''}${money(r.delta)}</span>` : ''}</td>
    <td>${taxBadge(r)}</td>
    <td><span class="date">${escapeHTML(r.effective_date)}</span>${r.scheduled ? '<span class="subtext"><span class="badge future">待生效</span></span>' : r.stale ? `<span class="subtext">${r.age_days} 天未更新</span>` : ''}${r.future_count && !r.scheduled ? `<span class="subtext">另有 ${r.future_count} 条预约报价</span>` : ''}</td>
    <td class="remark">${escapeHTML(r.note || '—')}</td>
    <td><div class="row-actions"><button class="link-button" data-history="${r.id}">价格历史 (${r.history_count})</button><button class="link-button" data-update="${r.id}">更新价格</button></div></td>
  </tr>`).join('');
  $('emptyState').hidden = state.items.length !== 0;
  $('pageInfo').textContent = state.items.length ? `显示第 ${start + 1}–${Math.min(start + state.pageSize, state.items.length)} 条，共 ${state.items.length} 条` : '共 0 条';
  $('pageNumber').textContent = `${state.page} / ${totalPages}`;
  $('previousPage').disabled = state.page === 1; $('nextPage').disabled = state.page === totalPages;
  icons();
}
function resetSearch() {
  $('searchForm').reset(); $('notice').hidden = true; query();
}
function drawTrend(rows) {
  const chronological = rows.slice().reverse();
  const points = chronological.length <= 12 ? chronological : chronological.filter((_, i) => i === 0 || i === chronological.length - 1 || i % Math.ceil(chronological.length / 10) === 0);
  const values = points.map(r => Number(r.price));
  const min = Math.min(...values), max = Math.max(...values), spread = max - min || 1;
  const coords = points.map((r, i) => ({x: points.length === 1 ? 390 : 55 + i * 670 / (points.length - 1), y: 102 - (Number(r.price) - min) / spread * 62, row:r}));
  let svg = '<svg viewBox="0 0 780 155" role="img" aria-label="按报价日期与录入顺序排列的价格趋势"><line class="chart-grid" x1="35" y1="118" x2="755" y2="118"/>';
  if (coords.length > 1) svg += `<polyline class="chart-line" points="${coords.map(p => `${p.x},${p.y}`).join(' ')}"/>`;
  coords.forEach((p, i) => {
    svg += `<circle class="chart-point" cx="${p.x}" cy="${p.y}" r="5"><title>${escapeHTML(p.row.effective_date)}：${money(p.row.price)} 元/kg${p.row.scheduled ? '（待生效）' : ''}</title></circle>`;
    if (coords.length <= 6 || i === 0 || i === coords.length - 1) svg += `<text class="chart-price" x="${p.x}" y="${p.y - 12}" text-anchor="middle">${money(p.row.price)}</text><text class="chart-text" x="${p.x}" y="140" text-anchor="middle">${p.row.effective_date}</text>`;
  });
  $('trend').innerHTML = svg + '</svg>' + `<p>${rows.length === 1 ? '目前仅有 1 条报价，后续更新将形成价格趋势。' : `共 ${rows.length} 条历史，${points.length < rows.length ? '趋势图抽样展示，' : ''}完整明细见下表。`}</p>`;
}
async function openHistory(id) {
  try {
    const result = await api('/api/history?id=' + id);
    const current = result.items.find(r => r.is_current) || result.items[0];
    state.history = current;
    $('historyTitle').textContent = current.grade;
    $('historySubtitle').textContent = `${current.customer} · ${current.material || '未注明材料'} · ${current.color || '未注明颜色'} · ${current.tax_type}`;
    $('historyPrice').textContent = result.items.some(r => r.is_current) ? money(current.price) : '待生效';
    $('historyDate').textContent = current.effective_date;
    $('historyRows').innerHTML = result.items.map(r => `<tr><td><span class="date">${r.effective_date}</span><span class="subtext"><span class="badge ${r.is_current ? 'current' : r.scheduled ? 'future' : 'neutral'}">${r.is_current ? '当前报价' : r.scheduled ? '待生效' : '历史报价'}</span></span></td><td class="number"><strong>${money(r.price)}</strong></td><td class="number">${change(r.delta)}</td><td>${escapeHTML(r.reason || (r.source_type === '手工录入' ? '首次录入' : '文件报价'))}<span class="subtext">${escapeHTML(r.note)}</span></td><td class="source">${escapeHTML(r.created_at.replace('T',' ').replace('+08:00',''))}<span class="subtext">${escapeHTML(r.source_file ? `${r.source_file} / ${r.source_sheet} 第 ${r.source_row} 行` : r.source_type)}</span></td></tr>`).join('');
    drawTrend(result.items);
    $('historyDialog').showModal();
  } catch (error) {notify(error.message, true);}
}
function openQuote(row = null) {
  state.editing = row;
  $('quoteForm').reset(); $('quoteError').hidden = true;
  $('quoteTitle').textContent = row ? '更新价格 / 补录历史' : '新增报价';
  $('quoteHint').textContent = row ? '保存一条新报价，原记录保留。未来日期的报价到期后生效。' : '同一客户、牌号、颜色、税口径组成一个报价规格。';
  const pairs = {quoteCustomer:'customer', quoteGrade:'grade', quoteMaterial:'material', quoteColor:'color', quotePrice:'price', quoteTax:'tax_type', quoteNote:'note'};
  Object.entries(pairs).forEach(([id, key]) => {$(id).value = row?.[key] ?? (id === 'quoteTax' ? '含税' : '');});
  $('quoteDate').value = state.meta.today;
  ['quoteCustomer','quoteGrade','quoteColor'].forEach(id => {$(id).readOnly = Boolean(row);});
  $('quoteTax').disabled = Boolean(row);
  $('quoteReason').required = Boolean(row);
  if ($('historyDialog').open) $('historyDialog').close();
  $('quoteDialog').showModal();
  if (row) $('quotePrice').focus();
}
async function saveQuote(event) {
  event.preventDefault(); $('quoteError').hidden = true; $('saveQuote').disabled = true;
  const body = {customer:$('quoteCustomer').value, grade:$('quoteGrade').value, material:$('quoteMaterial').value, color:$('quoteColor').value, price:$('quotePrice').value, tax_type:$('quoteTax').value, effective_date:$('quoteDate').value, note:$('quoteNote').value, reason:$('quoteReason').value};
  if (state.editing) body.base_id = state.editing.id;
  try {
    const result = await api('/api/quotes', body);
    $('quoteDialog').close(); notify(result.message);
    await loadMeta(); await query(false);
    await openHistory(result.id);
  } catch (error) {$('quoteError').textContent = error.message; $('quoteError').hidden = false;}
  finally {$('saveQuote').disabled = false;}
}
async function download(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) {const error = await response.json(); throw new Error(error.error || '导出失败');}
    const match = (response.headers.get('Content-Disposition') || '').match(/filename\*=UTF-8''(.+)/);
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement('a'); a.href = url; a.download = match ? decodeURIComponent(match[1]) : '价格导出'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    notify('文件已生成并开始下载。');
  } catch (error) {notify(error.message, true);}
}
async function previewImport() {
  const file = $('importFile').files[0];
  state.preview = null; $('commitImport').disabled = true; $('importPreview').hidden = true; $('importError').hidden = true;
  if (!file) return;
  $('importStatus').textContent = '正在读取并检查文件…';
  $('importFile').disabled = true;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB，请拆分后导入。');
    const content = await new Promise((resolve, reject) => {const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('文件读取失败')); reader.readAsDataURL(file);});
    const result = await api('/api/import/preview', {filename:file.name, content});
    state.preview = result.preview_id;
    $('importStatus').textContent = `已检查“${file.name}”的 ${result.sheet}：${result.total} 条报价，跳过 ${result.omitted} 行汇总。`;
    $('importPreview').innerHTML = `<div class="preview-counts"><span>新增 ${result.added} 条</span><span>重复跳过 ${result.skipped} 条</span><span>错误 ${result.error_count} 条</span></div>` + (result.errors.length ? `<ul class="import-errors">${result.errors.map(e => `<li>第 ${e.row} 行：${escapeHTML(e.message)}</li>`).join('')}</ul>` : '') + (result.samples.length ? `<div class="table-wrap"><table><thead><tr><th>客户 / 牌号</th><th>价格（元/kg）</th><th>日期</th><th>税口径</th></tr></thead><tbody>${result.samples.map(r => `<tr><td>${escapeHTML(r.customer)}<span class="subtext">${escapeHTML(r.grade)}</span></td><td>${money(r.price)}</td><td>${r.effective_date}</td><td>${escapeHTML(r.tax_type)}</td></tr>`).join('')}</tbody></table></div><p class="dialog-note">预览最多展示前 8 条新增记录。</p>` : '');
    $('importPreview').hidden = false; $('commitImport').disabled = result.error_count > 0 || result.added === 0;
    if (!result.added && !result.error_count) $('importStatus').textContent += ' 文件中所有报价均已存在，无需重复导入。';
  } catch (error) {$('importError').textContent = error.message; $('importError').hidden = false; $('importStatus').textContent = '文件检查失败，尚未保存任何记录。';}
  finally {$('importFile').disabled = false;}
}
async function commitImport() {
  $('commitImport').disabled = true; $('importFile').disabled = true; $('importError').hidden = true;
  try {
    const result = await api('/api/import/commit', {preview_id:state.preview}); state.preview = null;
    $('importStatus').textContent = `导入完成：新增 ${result.added} 条，跳过 ${result.skipped} 条。${result.backup ? '已自动备份导入前数据。' : ''}`;
    notify($('importStatus').textContent); await loadMeta(); await query();
  } catch (error) {$('importError').textContent = error.message + '；请重新选择文件获取预览。'; $('importError').hidden = false;}
  finally {$('importFile').disabled = false;}
}
let debounceTimer;
['customerSearch','gradeSearch'].forEach(id => $(id).addEventListener('input', () => {clearTimeout(debounceTimer); debounceTimer = setTimeout(() => query(), 280);}));
['materialFilter','taxFilter','fromDate','toDate','staleFilter'].forEach(id => $(id).addEventListener('change', () => query()));
$('searchForm').addEventListener('submit', e => {e.preventDefault(); clearTimeout(debounceTimer); query();});
$('resetSearch').addEventListener('click', resetSearch); $('emptyReset').addEventListener('click', resetSearch);
$('customerList').addEventListener('click', e => {const button = e.target.closest('[data-customer]'); if (button) {$('customerSearch').value = button.dataset.customer; query();}});
$('quoteRows').addEventListener('click', e => {const history = e.target.closest('[data-history]'); const update = e.target.closest('[data-update]'); if (history) openHistory(history.dataset.history); if (update) openQuote(state.items.find(r => String(r.id) === update.dataset.update));});
$('previousPage').addEventListener('click', () => {state.page--; renderRows();}); $('nextPage').addEventListener('click', () => {state.page++; renderRows();});
$('newQuote').addEventListener('click', () => openQuote()); $('quoteForm').addEventListener('submit', saveQuote); $('updateFromHistory').addEventListener('click', () => openQuote(state.history));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(b.dataset.close).close()));
$('queryNav').addEventListener('click', () => $('customerSearch').focus()); $('dataNav').addEventListener('click', () => $('dataDialog').showModal());
$('exportCurrent').addEventListener('click', () => download('/api/export?' + filters())); $('exportHistory').addEventListener('click', () => download('/api/export?mode=history&' + filters()));
$('backupButton').addEventListener('click', () => download('/api/backup')); $('templateButton').addEventListener('click', () => download('/api/template'));
$('schemaButton').addEventListener('click', () => download('/api/schema'));
$('backendMode').addEventListener('change', () => {$('supabaseFields').hidden = $('backendMode').value !== 'supabase'; $('backendMessage').textContent = '';});
$('testConnection').addEventListener('click', () => configureBackend(false)); $('saveBackend').addEventListener('click', () => configureBackend(true));
$('importFile').addEventListener('change', previewImport); $('commitImport').addEventListener('click', commitImport);
$('exitButton').addEventListener('click', () => $('exitDialog').showModal());
$('confirmExit').addEventListener('click', async () => {try {const r = await api('/api/shutdown', {}); $('exitDialog').close(); notify(r.message + '。可关闭此页面。'); document.querySelectorAll('button,input,select,textarea').forEach(el => el.disabled = true);} catch (error) {notify(error.message, true);}});
icons();
(async () => {try {await loadBackend(); await loadMeta(); await query();} catch (error) {notify('程序数据读取失败：' + error.message + '。可在“数据与导入”中检查设置或切回本地。', true);}})();
