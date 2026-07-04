import request from './index'

// 获取财务对账汇总
export const getFinanceStatements = (params: any) => request.get('/finance/statements', { params })

// 获取应收订单明细
export const getFinanceReceivables = (params: any) => request.get('/finance/receivables', { params })
