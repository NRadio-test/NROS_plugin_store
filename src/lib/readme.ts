import { marked } from 'marked'
import DOMPurify from 'dompurify'

export function publicHttps(value: string): URL | null {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null
    if (!host.includes('.') || host.includes(':') || /^[\d.]+$/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(host)) return null
    return url
  } catch { return null }
}

/** 只渲染已审核的 GitHub 展示快照，不执行仓库 HTML。图片限 GitHub 内容域名。 */
export function renderReadme(markdown: string, fullName: string, commit: string, path: string): string {
  const repository = fullName.split('/').map(encodeURIComponent).join('/')
  const snapshotPath = path.split('/').map(encodeURIComponent).join('/')
  const encodedCommit = encodeURIComponent(commit)
  const clean = DOMPurify.sanitize(marked.parse(markdown, { async: false, gfm: true }) as string, {
    ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'strong', 'em', 'del', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'details', 'summary'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'start'], ALLOW_DATA_ATTR: false,
  })
  const document = new DOMParser().parseFromString(clean, 'text/html')
  for (const anchor of document.querySelectorAll('a')) {
    const href = anchor.getAttribute('href') || ''
    // 无可执行 fragment，站内标题定位不转到 GitHub。
    if (href.startsWith('#')) { anchor.removeAttribute('href'); continue }
    let resolved = ''
    try { resolved = new URL(href, `https://github.com/${repository}/blob/${encodedCommit}/${snapshotPath}`).href } catch { /* 丢弃非法 URL */ }
    const url = publicHttps(resolved)
    if (!url || !href) anchor.removeAttribute('href')
    else { anchor.href = url.href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer nofollow' }
  }
  for (const img of document.querySelectorAll('img')) {
    const src = img.getAttribute('src') || ''
    let resolved = ''
    try { resolved = new URL(src, `https://raw.githubusercontent.com/${repository}/${encodedCommit}/${snapshotPath}`).href } catch { /* 丢弃非法 URL */ }
    const url = publicHttps(resolved)
    if (!src || !url || !/(^|\.)githubusercontent\.com$/.test(url.hostname)) {
      img.replaceWith(document.createTextNode(`[图片未加载：${img.alt || '外部图片'}]`))
    } else { img.src = url.href; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.decoding = 'async' }
  }
  return document.body.innerHTML
}
