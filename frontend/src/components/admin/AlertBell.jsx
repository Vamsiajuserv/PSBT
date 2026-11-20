// Staff alerts — the header bell, for every role. New alerts arrive live (Server-Sent Events,
// backend app/staff_alerts.py) within about a second: the badge count goes up, a toast pops up
// at the bottom right with a short chime, and the dropdown lists the latest ones.
// Who gets what is decided on the server (Medical → Admin + Accountant, Gold / Silver →
// Stores Officer + Admin, other material → Stores Officer, sponsorship / annadanam / big cash →
// Admin). If the live stream cannot connect, the bell re-reads the list every 30 seconds.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellRing, CheckCheck, Volume2, VolumeX, X, Settings2, ArrowRight } from 'lucide-react'
import { AlertsAPI, ApiError } from '../../api/client.js'
import { tr, clock12, getLang, useLang } from '../../i18n/LanguageContext.jsx'
import { alertText, accentOf, setAlertUnread, announceAlerts, ALERTS_EVENT } from '../../lib/alerts.js'

const SOUND_KEY = 'psbt_alert_sound'
const TOAST_MS = 9000
const POLL_MS = 30000

const storeGet = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const storeSet = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

function timeLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const clock = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const today = new Date().toDateString() === d.toDateString()
  return today ? clock12(clock) : `${d.toLocaleDateString(getLang() === 'te' ? 'te-IN' : 'en-IN', { day: '2-digit', month: 'short' })}, ${clock12(clock)}`
}

/** A short two-note chime (no sound file needed). */
function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = chime.ctx || (chime.ctx = new Ctx())
    if (ctx.state === 'suspended') ctx.resume()
    ;[[880, 0], [1320, 0.16]].forEach(([f, at]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.35)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.4)
    })
  } catch { /* audio blocked */ }
}

export default function AlertBell({ showSettingsLink = false }) {
  useLang()                                    // re-render on language change
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const [live, setLive] = useState(false)
  const [sound, setSound] = useState(() => storeGet(SOUND_KEY) !== 'off')
  const soundRef = useRef(sound)
  const lastId = useRef(null)
  const boxRef = useRef(null)
  soundRef.current = sound
  useEffect(() => { setAlertUnread(unread) }, [unread])          // sidebar badge

  const load = useCallback(async () => {
    try {
      const r = await AlertsAPI.list(30)
      setItems(r.items || []); setUnread(r.unread || 0)
      if (lastId.current == null || (r.last_id || 0) > lastId.current) lastId.current = r.last_id || 0
    } catch { /* keep what we have */ }
  }, [])

  const addToast = useCallback((a) => {
    setToasts((ts) => [a, ...ts.filter((t) => t.id !== a.id)].slice(0, 3))
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== a.id)), TOAST_MS)
  }, [])

  // Live stream with reconnect; polling while it is down.
  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()
    let failures = 0
    let pollTimer = null
    const startPoll = () => { if (!pollTimer) pollTimer = setInterval(load, POLL_MS) }
    const stopPoll = () => { clearInterval(pollTimer); pollTimer = null }
    const wait = (ms) => new Promise((res) => setTimeout(res, ms))

    ;(async () => {
      await load()
      while (alive) {
        try {
          await AlertsAPI.stream({
            after: lastId.current, signal: ctrl.signal,
            onEvent: (name, data) => {
              if (name === 'ready') { failures = 0; setLive(true); stopPoll() }
              else if (name === 'logout') { alive = false }
              else if (name === 'alert') {
                if (lastId.current != null && data.id <= lastId.current) return
                lastId.current = data.id
                setItems((xs) => [data, ...xs.filter((x) => x.id !== data.id)].slice(0, 30))
                if (data.unread >= 0) setUnread(data.unread)
                addToast(data)
                announceAlerts({ source: 'bell', alert: data })      // an open Alerts page refreshes
                if (soundRef.current) chime()
              }
            },
          })
        } catch (e) {
          if (!alive || ctrl.signal.aborted) break
          if (e instanceof ApiError && e.status === 401) break
          failures += 1
        }
        if (!alive) break
        setLive(false)
        if (failures >= 2) startPoll()
        await wait(Math.min(3000 * Math.max(1, failures), 30000))
        if (failures) await load()                       // catch up after a drop
      }
    })()
    return () => { alive = false; ctrl.abort(); stopPoll() }
  }, [load, addToast])

  // The Alerts page marked something read → refresh the bell.
  useEffect(() => {
    const on = (e) => { if (e.detail?.source === 'page') load() }
    window.addEventListener(ALERTS_EVENT, on)
    return () => window.removeEventListener(ALERTS_EVENT, on)
  }, [load])

  // Close the dropdown on an outside click / Escape.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const markRead = async (ids) => {
    setItems((xs) => xs.map((x) => (!ids || ids.includes(x.id) ? { ...x, read: true } : x)))
    try { const r = await AlertsAPI.read(ids); setUnread(r.unread); announceAlerts({ source: 'bell' }) } catch { load() }
  }
  const openAlert = (a) => {
    if (!a.read) markRead([a.id])
    setOpen(false); setToasts((ts) => ts.filter((t) => t.id !== a.id))
    if (a.link) navigate(a.link)
  }
  const toggleSound = () => { const v = !sound; setSound(v); storeSet(SOUND_KEY, v ? 'on' : 'off'); if (v) chime() }

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={() => { setOpen((o) => !o); if (!open) load() }} title={tr('Alerts')} aria-label={tr('Alerts')} aria-expanded={open}
        className="relative text-[#E5B94F] hover:text-[#FFF1C7] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:ring-offset-1 focus:ring-offset-[#5A071A] rounded-full p-1">
        {unread > 0 ? <BellRing size={18} /> : <Bell size={18} />}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-600 text-white text-[0.625rem] font-bold grid place-items-center ring-2 ring-maroon-900 tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-[4.5rem] sm:top-9 sm:w-[24rem] bg-white rounded-xl shadow-2xl border border-[#E8D9B5] z-50 overflow-hidden" role="dialog" aria-label={tr('Alerts')}>
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#FFF8E7] border-b border-[#E8D9B5]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-maroon-900">{tr('Alerts')}</span>
              <span className={`inline-flex items-center gap-1 text-[0.6875rem] ${live ? 'text-emerald-700' : 'text-gray-500'}`} title={live ? tr('Live — new alerts arrive at once') : tr('Reconnecting — checking every 30 seconds')}>
                <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />{live ? tr('Live') : tr('Reconnecting…')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={toggleSound} title={sound ? tr('Sound on') : tr('Sound off')} aria-label={sound ? tr('Sound on') : tr('Sound off')} className="p-1.5 rounded-lg text-gray-600 hover:bg-white">
                {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              {unread > 0 && (
                <button onClick={() => markRead(null)} className="flex items-center gap-1 text-[0.75rem] font-semibold text-maroon-800 px-2 py-1 rounded-lg hover:bg-white">
                  <CheckCheck size={14} /> {tr('Mark all read')}
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
            {items.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-500">{tr('No alerts yet.')}</div>}
            {items.map((a) => {
              const t = alertText(a)
              return (
                <button key={a.id} onClick={() => openAlert(a)} className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-[#FFFBF0] ${a.read ? '' : 'bg-amber-50/60'}`}>
                  <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: a.read ? 'transparent' : (accentOf(a.event)), border: a.read ? '1px solid #d1d5db' : 'none' }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`text-sm ${a.read ? 'font-semibold text-gray-700' : 'font-bold text-gray-900'}`}>{t.title}</span>
                      <span className="text-[0.6875rem] text-gray-500 whitespace-nowrap">{timeLabel(a.created_at)}</span>
                    </span>
                    <span className="block text-[0.8125rem] text-gray-700 break-words">{t.body}</span>
                    {t.action && <span className="block text-[0.75rem] mt-0.5" style={{ color: accentOf(a.event) }}>{t.action}</span>}
                  </span>
                </button>
              )
            })}
          </div>
          <button onClick={() => { setOpen(false); navigate('/admin/alerts') }} className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-[0.8125rem] font-semibold text-maroon-800 border-t border-[#E8D9B5] bg-[#FFFBF0] hover:bg-[#FFF3D6]">
            {tr('View all alerts')} <ArrowRight size={14} />
          </button>
          {showSettingsLink && (
            <button onClick={() => { setOpen(false); navigate('/admin/notifications') }} className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-[0.75rem] text-gray-600 border-t border-gray-100 hover:bg-gray-50">
              <Settings2 size={13} /> {tr('SMS / Email Settings')}
            </button>
          )}
        </div>
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[22rem] z-[60] flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {toasts.map((a) => {
          const t = alertText(a)
          return (
            <div key={a.id} className="pointer-events-auto bg-white rounded-xl shadow-2xl border-l-4 border border-[#E8D9B5] p-3 flex gap-3 animate-fade-in" style={{ borderLeftColor: accentOf(a.event) }}>
              <BellRing size={18} className="mt-0.5 shrink-0" style={{ color: accentOf(a.event) }} />
              <button onClick={() => openAlert(a)} className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-bold text-gray-900">{t.title}</span>
                <span className="block text-[0.8125rem] text-gray-700 break-words">{t.body}</span>
                {t.action && <span className="block text-[0.75rem] mt-0.5 font-semibold" style={{ color: accentOf(a.event) }}>{t.action}</span>}
              </button>
              <button onClick={() => setToasts((ts) => ts.filter((x) => x.id !== a.id))} aria-label={tr('Close')} title={tr('Close')} className="self-start p-0.5 text-gray-400 hover:text-gray-700"><X size={14} /></button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
