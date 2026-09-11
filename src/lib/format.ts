/** 展示格式化工具：统一数字、体积、时间与手机号掩码的输出。 */

const numberFormat = new Intl.NumberFormat('zh-CN')
const dateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

export const formatNumber = (value: number | null | undefined) => numberFormat.format(Number(value) || 0)

export function formatSize(bytes: number | null | undefined): string {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(2)} MiB`
}

export const formatDateTime = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—'
  const date = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
  return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date)
}

/** 相对时间：7 天内用「x 分钟前」，更早显示具体日期。 */
export function formatRelative(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const time = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value).getTime()
  if (Number.isNaN(time)) return '—'
  const diff = Date.now() - time
  if (diff < 0) return formatDateTime(time)
  const minute = 60_000, hour = 60 * minute, day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return formatDateTime(time)
}

export const shortHash = (value: string | null | undefined, length = 12): string =>
  value ? (value.length > length ? `${value.slice(0, length)}…` : value) : '—'

export const shortId = (value: string | null | undefined, length = 8): string =>
  value ? `${value.slice(0, length)}` : '—'
