import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { BasePageConfig } from '@/views/base/base-data-schema'
import { buildMetricCards } from '@/views/base/base-data-schema'

type PageResponse = {
  data?: {
    records?: any[]
    list?: any[]
    total?: number
  }
}

type CrudApi = {
  list: (params: Record<string, any>) => Promise<PageResponse>
  create: (payload: Record<string, any>) => Promise<any>
  update: (id: number, payload: Record<string, any>) => Promise<any>
  remove: (id: number) => Promise<any>
}

type UseBaseCrudPageOptions = {
  config: BasePageConfig<any, any>
  api: CrudApi
  titles: { add: string; edit: string }
  messages: { createSuccess: string; updateSuccess: string; deleteSuccess: string }
  deleteConfirmText: (row: any) => string
  pageSize?: number
}

export function useBaseCrudPage(options: UseBaseCrudPageOptions) {
  const loading = ref(false)
  const tableData = ref<any[]>([])
  const selectedRow = ref<any>(null)
  const selectedRows = ref<any[]>([])
  const dialogVisible = ref(false)
  const dialogTitle = ref(options.titles.add)
  const searchKeyword = ref('')
  const searchState = reactive({ ...(options.config.createSearchState() as Record<string, any>) })
  const form = reactive({ ...(options.config.createFormState() as Record<string, any>) })
  const pagination = reactive({
    page: 1,
    pageSize: options.pageSize ?? 20,
    total: 0,
  })

  const metrics = computed(() => buildMetricCards(tableData.value, pagination.total, options.config.metrics))

  function syncSelectedRow() {
    if (!tableData.value.length) {
      selectedRow.value = null
      return
    }
    if (!selectedRow.value?.id) {
      selectedRow.value = tableData.value[0]
      return
    }
    selectedRow.value = tableData.value.find((row) => row.id === selectedRow.value.id) || tableData.value[0]
  }

  async function fetchData() {
    loading.value = true
    try {
      const res: any = await options.api.list(
        options.config.buildQuery({
          page: pagination.page,
          pageSize: pagination.pageSize,
          keyword: searchKeyword.value,
          search: searchState,
        }),
      )
      tableData.value = res.data?.records || res.data?.list || []
      pagination.total = res.data?.total || 0
      selectedRows.value = []
      syncSelectedRow()
    } catch {
      tableData.value = []
      pagination.total = 0
      selectedRow.value = null
      selectedRows.value = []
    } finally {
      loading.value = false
    }
  }

  function handleSearch(formData: { keyword: string }) {
    searchKeyword.value = formData.keyword || ''
    pagination.page = 1
    return fetchData()
  }

  function handleReset() {
    searchKeyword.value = ''
    Object.assign(searchState, options.config.createSearchState())
    pagination.page = 1
    return fetchData()
  }

  function handleSelectionChange(rows: any[]) {
    selectedRows.value = rows
  }

  function openAdd() {
    dialogTitle.value = options.titles.add
    Object.assign(form, options.config.createFormState())
    dialogVisible.value = true
  }

  function openEdit(row: any) {
    dialogTitle.value = options.titles.edit
    Object.assign(form, options.config.mapFormFromRow(row))
    dialogVisible.value = true
  }

  async function submitForm() {
    try {
      const payload = options.config.buildPayload(form)
      if (form.id) {
        await options.api.update(Number(form.id), payload)
        ElMessage.success(options.messages.updateSuccess)
      } else {
        await options.api.create(payload)
        ElMessage.success(options.messages.createSuccess)
      }
      dialogVisible.value = false
      await fetchData()
    } catch {
      return
    }
  }

  async function deleteRow(row: any) {
    await ElMessageBox.confirm(options.deleteConfirmText(row), '提示', { type: 'warning' })
    try {
      await options.api.remove(Number(row.id))
      ElMessage.success(options.messages.deleteSuccess)
      await fetchData()
    } catch {
      return
    }
  }

  return {
    loading,
    tableData,
    selectedRow,
    selectedRows,
    dialogVisible,
    dialogTitle,
    searchKeyword,
    searchState,
    form,
    pagination,
    metrics,
    fetchData,
    handleSearch,
    handleReset,
    handleSelectionChange,
    openAdd,
    openEdit,
    submitForm,
    deleteRow,
  }
}
