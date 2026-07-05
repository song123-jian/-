import request from './index'
import type { InjectionModuleKey } from '@/utils/injection-professional'

export function getInjectionList(resource: string, params: Record<string, any> = {}) {
  return request.get(`/${resource}`, { params })
}

export function getInjectionDetail(resource: string, id: number) {
  return request.get(`/${resource}/${id}`)
}

export function createInjectionRecord(resource: string, data: Record<string, any>) {
  return request.post(`/${resource}`, data)
}

export function updateInjectionRecord(resource: string, id: number, data: Record<string, any>) {
  return request.put(`/${resource}/${id}`, data)
}

export function deleteInjectionRecord(resource: string, id: number) {
  return request.delete(`/${resource}/${id}`)
}

export function runInjectionAction(resource: string, id: number, action: string, data: Record<string, any> = {}) {
  return request.put(`/${resource}/${id}/${action}`, data)
}

export function getInjectionMobileTasks(moduleKey?: InjectionModuleKey) {
  return request.get('/injection/mobile-tasks', { params: { moduleKey } })
}
