import request from './index'

export const getWorkflowTodos = (params: Record<string, any> = {}) => request.get('/workflows/todos', { params })

export const runWorkflowTaskAction = (
  id: number | string,
  action: 'claim' | 'assign' | 'start' | 'close',
  data: Record<string, any> = {},
) => request.put(`/workflows/tasks/${id}/${action}`, data)

