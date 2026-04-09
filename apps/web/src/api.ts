const API_BASE = (import.meta).env?.VITE_API_BASE?.toString?.() || ''

function isNetlifyHost() {
  try {
    return window.location.hostname.endsWith('netlify.app')
  } catch {
    return false
  }
}

export function apiUrl(path: string) {
  if (!path.startsWith('/')) path = `/${path}`

  // If VITE_API_BASE is set, always use it (e.g. separate API deployment).
  if (API_BASE) return `${API_BASE}${path}`

  // Netlify-only fallback: call Functions directly even if redirects fail.
  if (isNetlifyHost()) {
    if (path.startsWith('/api/')) return `/.netlify/functions/api${path.slice('/api'.length)}`
    if (path.startsWith('/preview/')) return `/.netlify/functions/api${path}`
  }

  return path
}

