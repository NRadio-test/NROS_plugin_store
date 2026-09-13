/** 前端 API 客户端：统一请求、错误与共享视图状态。 */
import { reactive } from 'vue'
import { statusMeta } from './status'

export interface Plugin {
  id: string
  full_name: string
  source_kind?: 'github' | 'upload'
  /** 公开作者：GitHub 投稿取仓库所属者，直传取提交者掩码（profile 上线后替换）。 */
  author?: string
  description: string | null
  version: string | null
  favorite_count: number
  download_count: number
  favorited?: boolean
  updated_at: number
  status?: string
  blocked?: number
  public_reason?: string
  revision?: number
}

export interface Asset {
  id: string
  name: string
  size: number
  sha256: string
  packageName?: string
  architecture?: string
}

export interface Detail {
  plugin: Plugin
  readme: string | null
  readmePath: string
  readmeCommit: string
  sourceCommit: string
  license: string | null
  assets: Asset[]
  reviewLabel: string
  publicationMode?: 'manual' | 'automatic'
  reviewedAt?: number | null
  reviewPublicReason?: string
  publishedAt?: number | null
}

export interface Session {
  user: { id: string; phone_mask: string } | null
  admin: { id: string; username: string } | null
}

export interface Submission {
  id: string
  full_name: string
  source_kind?: 'github' | 'upload'
  status: string
  public_reason: string
  task_status: string | null
  upload_name?: string
  upload_description?: string
  upload_tutorial?: string
  updated_at?: number
}

export interface StudioPlugin extends Plugin {
  repository_id: number
  submitter_id: string | null
  approved_snapshot_id: string | null
  checked_at: number | null
  created_at: number
  task_status: string | null
  task_attempts: number | null
  last_task_at: number | null
}

export interface StudioTask {
  id: string
  plugin_id: string
  revision: number
  status: string
  attempts: number
  public_reason: string
  internal_reason: string
  created_at: number
  updated_at: number
  queued_at: number | null
  lock_until: number | null
}

export interface StudioAsset { id: number; name: string; size: number; sha256: string; disabled: number; package_name: string | null; architecture: string | null }

export interface StudioPluginDetail {
  plugin: StudioPlugin
  snapshot: { id: string; revision: number; verdict: string; public_reason: string; internal_reason: string; review_version: string; created_at: number } | null
  assets: StudioAsset[]
  tasks: StudioTask[]
  audits: { id: string; action: string; target: string; created_at: number; admin_id: string | null }[]
  /** 直传插件才有：用于更新版本时回填表单。 */
  upload: { name: string | null; description: string | null; tutorial: string | null } | null
}

export interface StudioOverview {
  counts: {
    plugins: number; published: number; inReview: number; waiting: number; rejected: number
    removed: number; blocked: number; favorites: number; downloads: number; users: number
    tasksActive: number; tasksFailed: number
  }
  ai: { configured: boolean; model: string; baseUrl: string }
  sources: { total: number; enabled: number }
  recentTasks: Array<{ id: string; plugin_id: string; full_name: string; status: string; public_reason: string; attempts: number; created_at: number }>
}

export interface DownloadSource {
  id: string; name: string; template: string; allowedHosts: string[]
  enabled: boolean; trusted: boolean; priority: number; timeoutMs: number
}

export interface SourceCandidate {
  pluginId: string
  fullName: string
  version: string | null
  assets: Array<{ id: number; name: string; size: number; architecture: string | null; disabled: number }>
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message) }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
  })
  const value = await response.json().catch(() => ({})) as { error?: string; code?: string }
  if (!response.ok) throw new ApiError(value.error || `请求失败（${response.status}）`, response.status, value.code)
  return value as T
}

export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body: JSON.stringify(body) })
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) })

export const session = reactive<Session & { loaded: boolean; error: string }>({ user: null, admin: null, loaded: false, error: '' })

export async function loadSession() {
  try {
    Object.assign(session, await api<Session>('/api/session'))
    session.error = ''
  } catch (error) {
    session.error = errorMessage(error)
  } finally {
    session.loaded = true
  }
}

export const errorMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : '请求失败，请稍后重试。'

/** 兼容旧调用点：状态中文文案统一由 lib/status.ts 提供。 */
export const statusLabel = (status?: string) => statusMeta(status).label
