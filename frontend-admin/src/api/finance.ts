import request from './index'

// 获取财务对账汇总
export const getFinanceStatements = (params: any) => request.get('/finance/statements', { params })
