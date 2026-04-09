const API_BASE = (import.meta as any).env?.VITE_API_BASE?.toString?.() || '';

export function apiUrl(path: string) {
  if (!path.startsWith('/')) path = `/${path}`;
  return `${API_BASE}${path}`;
}

