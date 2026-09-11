import { ApiError } from './api'
/** 先验证可用性，再交给浏览器原生附件下载；不在浏览器缓存整包。 */
export async function downloadAsset(pluginId: string, assetId: string) {
  const path = `/api/plugins/${encodeURIComponent(pluginId)}/download/${encodeURIComponent(assetId)}`
  const response = await fetch(path, { method: 'HEAD', credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) throw new ApiError(`下载源暂时不可用（${response.status}），请稍后重试。`, response.status)
  const link = document.createElement('a')
  link.href = path; link.download = ''; document.body.append(link); link.click(); link.remove()
}
