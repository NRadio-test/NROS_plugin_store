import type { IconName } from './icons'

export type StatusTone = 'success' | 'brand' | 'warning' | 'danger' | 'neutral' | 'info'

export interface StatusMeta {
  /** 面向用户的中文状态文案。 */
  label: string
  tone: StatusTone
  icon: IconName
}

const STATUS: Record<string, StatusMeta> = {
  awaiting_review: { label: '待人工审核', tone: 'warning', icon: 'clock' },
  pending: { label: '资料整理中', tone: 'info', icon: 'clock' },
  queued: { label: '资料整理中', tone: 'info', icon: 'clock' },
  running: { label: '检查中', tone: 'brand', icon: 'loader' },
  processing: { label: '检查中', tone: 'brand', icon: 'loader' },
  reviewing: { label: '审核中', tone: 'brand', icon: 'loader' },
  retry: { label: '等待重试', tone: 'warning', icon: 'refresh' },
  done: { label: '已完成', tone: 'success', icon: 'check-circle' },
  complete: { label: '已完成', tone: 'success', icon: 'check-circle' },
  allow: { label: '审核通过', tone: 'success', icon: 'shield-check' },
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
  rejected: { label: '已退回', tone: 'danger', icon: 'x-circle' },
  failed: { label: '检查失败', tone: 'danger', icon: 'alert' },
  removed: { label: '已下架', tone: 'neutral', icon: 'ban' },
  unlisted: { label: '已下架', tone: 'neutral', icon: 'ban' },
  deleted: { label: '已删除', tone: 'neutral', icon: 'trash' },
}

const UNKNOWN: StatusMeta = { label: '资料整理中', tone: 'neutral', icon: 'clock' }

export const statusMeta = (status?: string | null): StatusMeta => (status ? STATUS[status] ?? { ...UNKNOWN, label: status } : UNKNOWN)

export const isActive = (status?: string | null) => ['pending', 'queued', 'running', 'processing', 'reviewing', 'retry'].includes(status || '')

const AUDIT_ACTIONS: Record<string, string> = {
  login: '管理员登录', logout: '退出登录', submit: '提交仓库', sync: '同步仓库', retry: '重新整理资料',
  upload: '上传插件', 'upload-update': '上传新版本', unlist: '下架插件', delete: '删除插件', restore: '恢复插件',
  'ai-settings': '更新 AI 设置', 'ai-test': '测试 AI 接口', 'download-sources': '更新下载源', 'source-test': '测试下载源',
  'manual-publish': '手动上架', 'manual-approve': '人工审核通过', 'manual-reject': '退回修改',
  'password-change': '修改管理员密码', legacy_account_link: '绑定历史账号',
}
export const auditActionLabel = (action: string) => AUDIT_ACTIONS[action] || action
