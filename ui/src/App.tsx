import { useAppApi } from '@kirocrew/app-sdk'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const BASE = '/apps/floating-todo/api'
const POLL_MS = 30_000

type Todo = { id: string; text: string; done: boolean; date: string; createdAt: string; doneAt: string | null }
type Day = { date: string; done: number; total: number }
type View = { date: string; items: Todo[]; carryover: Todo[]; history: Day[] }

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + n)
  return iso(d)
}
const label = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

const CSS = `
.ft{box-sizing:border-box;height:100%;min-height:0;display:flex;flex-direction:column;gap:10px;padding:12px;
  font:13px/1.4 system-ui,sans-serif;background:var(--bg,#fff);color:var(--text,#111)}
.ft *{box-sizing:border-box}
.ft button{font:inherit;color:inherit;background:none;border:1px solid var(--border,#8884);border-radius:6px;padding:2px 8px;cursor:pointer}
.ft button:hover{background:var(--hover,#8882)}
.ft-head{display:flex;align-items:center;gap:6px}
.ft-head b{flex:1;text-align:center}
.ft-bar{height:6px;border-radius:3px;background:var(--border,#8883);overflow:hidden}
.ft-bar i{display:block;height:100%;background:var(--accent,#3b82f6);transition:width .2s}
.ft-sum{display:flex;justify-content:space-between;opacity:.7;font-size:12px}
.ft input[type=text]{width:100%;padding:6px 8px;font:inherit;color:inherit;background:transparent;border:1px solid var(--border,#8886);border-radius:6px}
.ft ul{list-style:none;margin:0;padding:0;overflow-y:auto;flex:1;min-height:0}
.ft li{display:flex;align-items:center;gap:8px;padding:4px 0}
.ft li span{flex:1;word-break:break-word}
.ft li.done span{text-decoration:line-through;opacity:.5}
.ft h4{margin:4px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.6}
.ft-x{border:none!important;opacity:.4;padding:0 4px!important}
.ft-x:hover{opacity:1}
.ft-hist{display:flex;gap:4px;align-items:flex-end;height:32px}
.ft-hist div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:2px;font-size:10px;opacity:.8}
.ft-hist em{display:block;width:100%;border-radius:2px;background:var(--accent,#3b82f6);min-height:2px}
.ft-err{color:#d33}
`

function Board({ api, onFloat, floating }: {
  api: ReturnType<typeof useAppApi>
  onFloat?: () => void
  floating?: boolean
}) {
  const today = iso(new Date())
  const [day, setDay] = useState(today)
  const [view, setView] = useState<View | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const dayRef = useRef(day)
  dayRef.current = day

  const load = useCallback(async () => {
    try {
      const v = await api.get<View>(`${BASE}/todos?date=${dayRef.current}`)
      setView(v)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load')
    }
  }, [api])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load, day])

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
      return
    }
    await load()
  }

  const add = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    run(() => api.post(`${BASE}/todos`, { text, date: day }))
  }

  const items = view?.items ?? []
  const done = items.filter((t) => t.done).length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0
  const maxTotal = Math.max(1, ...(view?.history ?? []).map((h) => h.total))

  const row = (t: Todo, extra?: React.ReactNode) => (
    <li key={t.id} className={t.done ? 'done' : ''}>
      <input type="checkbox" checked={t.done} aria-label={t.text}
        onChange={() => run(() => api.patch(`${BASE}/todos/${t.id}`, { done: !t.done }))} />
      <span>{t.text}</span>
      {extra}
      <button className="ft-x" aria-label={`Delete ${t.text}`} onClick={() => run(() => api.del(`${BASE}/todos/${t.id}`))}>×</button>
    </li>
  )

  return (
    <div className="ft">
      <style>{CSS}</style>
      <div className="ft-head">
        <button aria-label="Previous day" onClick={() => setDay(shift(day, -1))}>‹</button>
        <b>{day === today ? `Today · ${label(day)}` : label(day)}</b>
        <button aria-label="Next day" onClick={() => setDay(shift(day, 1))}>›</button>
        {day !== today && <button onClick={() => setDay(today)}>Today</button>}
        {onFloat && !floating && <button onClick={onFloat} title="Open as a floating window">Float</button>}
      </div>
      <div className="ft-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
      <div className="ft-sum"><span>{done}/{items.length} done</span><span>{pct}%</span></div>
      <input type="text" value={draft} maxLength={200} placeholder="Add a task and press Enter" aria-label="New task"
        onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      {error && <div className="ft-err" role="alert">{error}</div>}
      <ul>
        {items.map((t) => row(t))}
        {!items.length && <li><span style={{ opacity: 0.5 }}>Nothing planned for this day.</span></li>}
        {!!view?.carryover.length && (
          <>
            <h4>From earlier</h4>
            {view.carryover.map((t) =>
              row(t, <button title="Move to this day" onClick={() => run(() => api.patch(`${BASE}/todos/${t.id}`, { date: day }))}>→</button>))}
          </>
        )}
      </ul>
      <div className="ft-hist" aria-label="Last 7 days">
        {(view?.history ?? []).map((h) => (
          <div key={h.date} title={`${h.date}: ${h.done}/${h.total}`}>
            <em style={{ height: `${(h.total / maxTotal) * 20}px`, opacity: h.total ? (0.3 + 0.7 * h.done / h.total) : 0.15 }} />
            {label(h.date).slice(0, 1)}
          </div>
        ))}
      </div>
    </div>
  )
}

// Document Picture-in-Picture gives a small always-on-top window in Chromium/Electron.
type PipApi = { requestWindow(o?: { width?: number; height?: number }): Promise<Window> }
const pipApi = () => (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture

export default function FloatingTodo() {
  const api = useAppApi()
  const [pip, setPip] = useState<Window | null>(null)
  const [note, setNote] = useState('')

  const float = async () => {
    const dpip = pipApi()
    if (!dpip) {
      setNote('Floating windows need Document Picture-in-Picture (Chrome/Edge or the desktop app).')
      return
    }
    try {
      const w = await dpip.requestWindow({ width: 340, height: 480 })
      const root = getComputedStyle(document.documentElement)
      for (const v of ['--bg', '--text', '--border', '--accent', '--hover']) {
        const val = root.getPropertyValue(v)
        if (val) w.document.documentElement.style.setProperty(v, val)
      }
      w.document.body.style.margin = '0'
      w.addEventListener('pagehide', () => setPip(null))
      setPip(w)
      setNote('')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not open the floating window')
    }
  }

  useEffect(() => () => pip?.close(), [pip])

  return (
    <div style={{ height: '100%', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
      {note && <div role="status" style={{ padding: '8px 12px', opacity: 0.8 }}>{note}</div>}
      {pip
        ? <div style={{ padding: 16, opacity: 0.7 }}>Floating window is open. Close it to bring the list back here.</div>
        : <Board api={api} onFloat={float} />}
      {pip && createPortal(<Board api={api} floating />, pip.document.body)}
    </div>
  )
}
