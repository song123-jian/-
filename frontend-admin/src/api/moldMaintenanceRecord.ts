import request from './index'

export const getMoldMaintenanceRecordList = (params: any) =>
  request.get('/mold-maintenance-records', { params })
