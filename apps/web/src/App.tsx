import { useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from './api'
import './App.css'

type ProductType =
  | 'landing'
  | 'website'
  | 'internal_tool'
  | 'simple_app'
  | 'dashboard'
  | 'mvp_tool'
  | 'uploader'
  | 'game'

type RunState =
  | { status: 'debating' }
  | { status: 'awaiting_approval'; proposal: string }
  | { status: 'generating' }
  | { status: 'ready' }
  | { status: 'failed'; error: string }

type BoardroomMessage = {
  id: string
  ts: number
  agent: 'CEO' | 'Planner' | 'Designer' | 'Engineer' | 'Critic'
  kind: 'note' | 'question' | 'risk' | 'decision'
  text: string
}

type RunSnapshot = {
  id: string
  prompt: string
  productType: ProductType
  state: RunState
  messages: BoardroomMessage[]
  files: { path: string; size: number }[]
}

type RunIndexItem = {
  id: string
  createdAt: number
  prompt: string
  productType: ProductType
  state: RunState
}

function fmtTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function productLabel(t: ProductType) {
  switch (t) {
    case 'landing':
      return 'Landing page'
    case 'website':
      return 'Web'
    case 'internal_tool':
      return 'Interní nástroj'
    case 'simple_app':
      return 'Jednoduchá appka'
    case 'dashboard':
      return 'Dashboard'
    case 'mvp_tool':
      return 'Malé MVP'
    case 'uploader':
      return 'Uploader/processor'
    case 'game':
      return 'Hra / prototyp'
  }
}

function App() {
  const [tab, setTab] = useState<'build' | 'docs'>('build')

  const [prompt, setPrompt] = useState('')
  const [productType, setProductType] = useState<ProductType>('landing')
  const [runId, setRunId] = useState<string | null>(null)
  const [recentRuns, setRecentRuns] = useState<RunIndexItem[]>([])

  const [state, setState] = useState<RunState | null>(null)
  const [messages, setMessages] = useState<BoardroomMessage[]>([])
  const [files, setFiles] = useState<{ path: string; size: number }[]>([])
  const [loadingRun, setLoadingRun] = useState(false)
  const [approving, setApproving] = useState(false)
  const logRef = useRef<HTMLDivElement | null>(null)

  const previewUrl = useMemo(() => (runId ? apiUrl(`/preview/${runId}/`) : null), [runId])
  const downloadUrl = useMemo(() => (runId ? apiUrl(`/api/runs/${runId}/download`) : null), [runId])

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(apiUrl('/api/runs'))
        if (!r.ok) return
        const j = (await r.json()) as { runs: RunIndexItem[] }
        setRecentRuns(Array.isArray(j.runs) ? j.runs : [])
      } catch {
        // ignore
      }
    })()
  }, [])

  useEffect(() => {
    if (!logRef.current) return
    logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages.length, state])

  useEffect(() => {
    if (!runId) return
    const es = new EventSource(apiUrl(`/api/runs/${runId}/stream`))
    const onState = (e: MessageEvent) => {
      try {
        setState(JSON.parse(e.data) as RunState)
      } catch {
        // ignore
      }
    }
    const onMsg = (e: MessageEvent) => {
      try {
        const m = JSON.parse(e.data) as BoardroomMessage
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      } catch {
        // ignore
      }
    }
    es.addEventListener('state', onState)
    es.addEventListener('message', onMsg)
    es.onerror = () => {
      // keep UI alive even if stream drops
    }
    return () => es.close()
  }, [runId])

  async function refreshRun(id: string) {
    const r = await fetch(apiUrl(`/api/runs/${id}`))
    if (!r.ok) return
    const j = (await r.json()) as RunSnapshot
    setState(j.state)
    setMessages(j.messages)
    setFiles(j.files)
  }

  async function startRun() {
    setLoadingRun(true)
    setMessages([])
    setFiles([])
    setState(null)
    setRunId(null)
    try {
      const r = await fetch(apiUrl('/api/runs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, productType }),
      })
      const j = (await r.json()) as { id?: string }
      if (!r.ok || !j.id) throw new Error('Nepodařilo se vytvořit běh.')
      setRunId(j.id)
      await refreshRun(j.id)
      // refresh recent runs
      try {
        const rr = await fetch(apiUrl('/api/runs'))
        if (rr.ok) {
          const jj = (await rr.json()) as { runs: RunIndexItem[] }
          setRecentRuns(Array.isArray(jj.runs) ? jj.runs : [])
        }
      } catch {
        // ignore
      }
    } catch (e) {
      setState({ status: 'failed', error: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setLoadingRun(false)
    }
  }

  async function approve() {
    if (!runId) return
    setApproving(true)
    try {
      const r = await fetch(apiUrl(`/api/runs/${runId}/approve`), { method: 'POST' })
      if (!r.ok) throw new Error('Schválení selhalo.')
      await refreshRun(runId)
      // refresh files list after generation
      const rf = await fetch(apiUrl(`/api/runs/${runId}/files`))
      if (rf.ok) {
        const jf = (await rf.json()) as { files: { path: string; content: string }[] }
        setFiles(jf.files.map((f) => ({ path: f.path, size: f.content.length })))
      }
    } catch (e) {
      setState({ status: 'failed', error: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setApproving(false)
    }
  }

  // Docs tab state
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docBusy, setDocBusy] = useState(false)
  const [docResult, setDocResult] = useState<unknown>(null)

  async function exportDocs(format: 'html' | 'json' | 'csv' | 'xlsx') {
    if (!docFile) return
    setDocBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', docFile)
      const r = await fetch(apiUrl(`/api/docs/export?format=${format}`), { method: 'POST', body: fd })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j?.message ?? j?.error ?? 'Export selhal.')
      }
      if (format === 'html') {
        const html = await r.text()
        const w = window.open('', '_blank')
        if (w) {
          w.document.open()
          w.document.write(html)
          w.document.close()
        }
        return
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `summary.${format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setDocBusy(false)
    }
  }

  async function summarizeDocs() {
    if (!docFile) return
    setDocBusy(true)
    setDocResult(null)
    try {
      const fd = new FormData()
      fd.append('file', docFile)
      const r = await fetch(apiUrl('/api/docs/summarize'), { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'Zpracování selhalo.')
      setDocResult(j)
    } catch (e) {
      setDocResult({ error: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setDocBusy(false)
    }
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">
          <img src="/vite.svg" alt="" />
          <div>
            <h1>AI Boardroom</h1>
            <p className="sub">Prompt → debata agentů → schválení → soubory + preview</p>
          </div>
        </div>
        <div className="tabs" role="tablist" aria-label="Sekce">
          <button className={`tab ${tab === 'build' ? 'active' : ''}`} onClick={() => setTab('build')}>
            Builder
          </button>
          <button className={`tab ${tab === 'docs' ? 'active' : ''}`} onClick={() => setTab('docs')}>
            Dokumenty
          </button>
        </div>
      </div>

      {tab === 'build' ? (
        <div className="grid">
          <div className="card">
            <div className="title">Zadání</div>
            <p className="muted">
              Zadej jeden prompt. Boardroom ho rozebere, nechá proběhnout interní debatu a po schválení vygeneruje reálné
              soubory.
            </p>

            <div className="row" style={{ marginTop: 12 }}>
              <div>
                <label>Typ výstupu</label>
                <select value={productType} onChange={(e) => setProductType(e.target.value as ProductType)}>
                  {(
                    [
                      'landing',
                      'website',
                      'dashboard',
                      'internal_tool',
                      'simple_app',
                      'mvp_tool',
                      'uploader',
                      'game',
                    ] as ProductType[]
                  ).map((t) => (
                    <option key={t} value={t}>
                      {productLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Run ID</label>
                <input type="text" value={runId ?? '—'} readOnly />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label>Poslední runy</label>
              <select
                value={runId ?? ''}
                onChange={async (e) => {
                  const id = e.target.value || null
                  setRunId(id)
                  if (id) await refreshRun(id)
                }}
              >
                <option value="">—</option>
                {recentRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.createdAt).toLocaleString()} · {productLabel(r.productType)} · {r.id}
                  </option>
                ))}
              </select>
              <div className="muted" style={{ marginTop: 6 }}>
                Načítá se z disku (`apps/api/.runs/*/run.json`).
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label>Prompt</label>
              <textarea
                rows={6}
                value={prompt}
                placeholder="Např. Landing page pro SaaS na automatizaci faktur…"
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <div className="btnrow">
              <button className="btn primary" disabled={!prompt.trim() || loadingRun} onClick={startRun}>
                {loadingRun ? 'Spouštím…' : 'Spustit boardroom'}
              </button>
              <button className="btn" disabled={!runId} onClick={() => runId && refreshRun(runId)}>
                Refresh
              </button>
              {state?.status === 'awaiting_approval' ? (
                <button className="btn good" disabled={approving} onClick={approve}>
                  {approving ? 'Generuju…' : 'Schválit a generovat soubory'}
                </button>
              ) : null}
            </div>

            {state ? (
              <div style={{ marginTop: 12 }}>
                <div className="muted">
                  Stav: <b>{state.status}</b>
                  {state.status === 'failed' ? ` — ${state.error}` : ''}
                </div>
                {state.status === 'awaiting_approval' ? (
                  <div className="msg" style={{ marginTop: 10 }}>
                    <div className="meta">
                      <div className="agent">Návrh</div>
                      <div className="kind">awaiting approval</div>
                    </div>
                    <pre>{state.proposal}</pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="split">
            <div className="card">
              <div className="title">Debata</div>
              <div ref={logRef} className="log" aria-live="polite">
                {messages.length === 0 ? (
                  <div className="muted">Zatím žádné zprávy. Spusť boardroom.</div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className="msg">
                      <div className="meta">
                        <div className="agent">
                          {m.agent} <span className="kind">· {m.kind}</span>
                        </div>
                        <div className="kind">{fmtTime(m.ts)}</div>
                      </div>
                      <pre>{m.text}</pre>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card">
              <div className="title">Výstup</div>
              <p className="muted">Po schválení se objeví soubory + preview + ZIP.</p>

              <div className="btnrow">
                <a className="btn" href={downloadUrl ?? '#'} onClick={(e) => !downloadUrl && e.preventDefault()}>
                  Stáhnout ZIP
                </a>
                <a className="btn" href={previewUrl ?? '#'} target="_blank" onClick={(e) => !previewUrl && e.preventDefault()}>
                  Otevřít preview
                </a>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Soubory
                </div>
                <div className="files">
                  {files.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    files.map((f) => (
                      <div key={f.path}>
                        <code>{f.path}</code> <span className="muted">({f.size} B)</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {previewUrl ? (
                <div style={{ marginTop: 10 }}>
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Inline preview
                  </div>
                  <iframe className="frame" src={previewUrl} title="Preview" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid">
          <div className="card">
            <div className="title">Dokumenty (PDF / ZIP s PDF)</div>
            <p className="muted">
              MVP pro dokumentové úkoly: nahraj PDF nebo ZIP s více PDF a dostaneš textový preview + základní metadata.
            </p>
            <div style={{ marginTop: 12 }}>
              <label>Soubor</label>
              <input
                type="file"
                accept=".pdf,.zip"
                onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="btnrow">
              <button className="btn primary" disabled={!docFile || docBusy} onClick={summarizeDocs}>
                {docBusy ? 'Zpracovávám…' : 'Zpracovat'}
              </button>
              <button className="btn" disabled={!docFile || docBusy} onClick={() => exportDocs('html')}>
                Export HTML
              </button>
              <button className="btn" disabled={!docFile || docBusy} onClick={() => exportDocs('csv')}>
                Export CSV
              </button>
              <button className="btn" disabled={!docFile || docBusy} onClick={() => exportDocs('xlsx')}>
                Export XLSX
              </button>
            </div>
          </div>

          <div className="card">
            <div className="title">Výsledek</div>
            <p className="muted">Vracíme JSON summary (a exporty HTML/CSV/XLSX přes API).</p>
            <div className="files" style={{ maxHeight: 520 }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {docResult ? JSON.stringify(docResult, null, 2) : '—'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
