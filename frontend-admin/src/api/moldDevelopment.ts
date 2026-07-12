import request from './index'

export const getMoldDevelopmentList = (resource: string, params: Record<string, any> = {}) =>
  request.get(`/${resource}`, { params })

export const createMoldDevelopmentRecord = (resource: string, data: Record<string, any>) =>
  request.post(`/${resource}`, data)

export const updateMoldDevelopmentRecord = (resource: string, id: number, data: Record<string, any>) =>
  request.put(`/${resource}/${id}`, data)

export const deleteMoldDevelopmentRecord = (resource: string, id: number) =>
  request.delete(`/${resource}/${id}`)

export const releaseMoldTrialRecord = (id: number) =>
  request.post(`/mold-trial-details/${id}/release`)

export type MoldTrialIssueAction = 'START' | 'WAIT_RETEST' | 'CLOSE' | 'REOPEN'

export const transitionMoldTrialIssue = (
  id: number,
  action: MoldTrialIssueAction,
  evidence = '',
) => request.post(`/mold-trial-details/${id}/issue-transition`, { action, evidence })

export const advanceMoldDevelopmentProject = (id: number) =>
  request.post(`/mold-development-projects/${id}/advance`)

export const transitionMoldRevision = (id: number, action: 'SUBMIT' | 'APPROVE' | 'VOID') =>
  request.post(`/mold-revisions/${id}/transition`, { action })

export const uploadMoldDevelopmentFile = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return request.post('/mold-development/uploads', form)
}

export const getMoldDevelopmentFileUrl = (fileUrl: string) =>
  request.get('/mold-development/files/signed-url', { params: { fileUrl } })
