import type { IconName } from './icons'

export type StatusTone = 'success' | 'brand' | 'warning' | 'danger' | 'neutral' | 'info'

export interface StatusMeta {
  /** 面向用户的中文状态文案。 */
  label: string
  tone: StatusTone
  icon: IconName
  /** 仅在 Studio 内部展示的补充说明。 */
  hint?: string
}

const STATUS: Record<string, StatusMeta> = {
  pending: { label: '等待检查', tone: 'info', icon: 'clock', hint: '已进入队列，等待后台读取仓库快照' },
  queued: { label: '等待检查', tone: 'info', icon: 'clock' },
  running: { label: '检查中', tone: 'brand', icon: 'loader', hint: '正在读取 GitHub 快照并执行自动审核' },
  processing: { label: '检查中', tone: 'brand', icon: 'loader' },
  reviewing: { label: '审核中', tone: 'brand', icon: 'loader' },
  retry: { label: '等待重试', tone: 'warning', icon: 'refresh', hint: '外部服务暂时不可用，将按退避策略重试' },
  done: { label: '已完成', tone: 'success', icon: 'check-circle' },
  complete: { label: '已完成', tone: 'success', icon: 'check-circle' },
  allow: { label: '通过自动审核', tone: 'success', icon: 'shield-check' },
  published: { label: '已上架', tone: 'success', icon: 'check-circle' },
  approved: { label: '已上架', tone: 'success', icon: 'check-circle' },
  waiting_package: { label: '等待发布安装包', tone: 'warning', icon: 'package' },
  waiting_release: { label: '等待发布安装包', tone: 'warning', icon: 'package' },
  awaiting_release: { label: '等待发布安装包', tone: 'warning', icon: 'package' },
  waiting_config: { label: '等待审核配置', tone: 'warning', icon: 'settings' },
  budget_exhausted: { label: '等待审核额度', tone: 'warning', icon: 'clock' },
  needs_info: { label: '待补充', tone: 'warning', icon: 'alert-circle' },
  uncertain: { label: '待补充', tone: 'warning', icon: 'alert-circle' },
  incomplete: { label: '检查未完成', tone: 'warning', icon: 'alert-circle' },
  superseded: { label: '已被后续任务替代', tone: 'neutral', icon: 'history' },
  rejected: { label: '已拒绝', tone: 'danger', icon: 'x-circle' },
  failed: { label: '检查失败', tone: 'danger', icon: 'alert' },
  removed: { label: '已下架', tone: 'neutral', icon: 'ban' },
  unlisted: { label: '已下架', tone: 'neutral', icon: 'ban' },
  deleted: { label: '已删除', tone: 'neutral', icon: 'trash' },
}

const UNKNOWN: StatusMeta = { label: '等待检查', tone: 'neutral', icon: 'clock' }

export const statusMeta = (status?: string | null): StatusMeta => (status ? STATUS[status] ?? { ...UNKNOWN, label: status } : UNKNOWN)

export const isSettled = (status?: string | null) => ['done', 'complete', 'rejected', 'failed', 'removed', 'deleted', 'superseded'].includes(status || '')
export const isActive = (status?: string | null) => ['pending', 'queued', 'running', 'processing', 'reviewing', 'retry'].includes(status || '')
