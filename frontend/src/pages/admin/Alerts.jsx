// Alerts — every alert sent to this user's role (kept 90 days), read and unread, by category.
// Same alerts as the header bell (components/admin/AlertBell.jsx); new ones appear here live.
// Every role has this page; each sees only its own alerts (backend app/staff_alerts.py).
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, CheckCheck, Check, ArrowRight, Inbox, AlertTriangle, RotateCcw } from 'lucide-react'
import { PageTitle, Pager } from '../../components/admin/ui.jsx'
import { SearchInput } from '../../components/admin/ui.jsx'
import { DateField } from '../../components/common/Field.jsx'
import { AlertsAPI, getErrorMessage } from '../../api/client.js'
import { T, tr, clock12, getLang, useLang, staffName } from '../../i18n/LanguageContext.jsx'
import { alertText, categoryOf, ALERTS_EVENT, announceAlerts, setAlertUnread } from '../../lib/alerts.js'

const SIZE = 30
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const shift = (iso, days) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days); return d.toLocaleDateString('en-CA') }
const PERIODS = [['all', 'All'], ['today', 'Today'], ['7', '7 Days'], ['30', '30 Days'], ['custom', 'Custom']]

function periodRange(period, custom) {
  const t = todayIST()
  if (period === 'today') return { start: t, end: t }
  if (period === '7') return { start: shift(t, -6), end: t }
  if (period === '30') return { start: shift(t, -29), end: t }
  if (period === 'custom') return { start: custom.start || undefined, end: custom.end || undefined }
  return {}
}

const dayKey = (iso) => (iso || '').slice(0, 10)
function dayHeading(key) {
  const t = todayIST()
  if (key === t) return tr('Today')
  if (key === shift(t, -1)) return tr('Yesterday')
  return new Date(`${key}T00:00:00`).toLocaleDateString(getLang() === 'te' ? 'te-IN' : 'en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}
const clockOf = (iso) => clock12(new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }))

export default function Alerts() {
  useLang()
  const navigate = useNavigate()
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('all')
  const [period, setPeriod] = useState('all')
  const [custom, setCustom] = useState({ start: '', end: '' })
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // Search waits until typing stops
  useEffect(() => { const id = setTimeout(() => setSearch(q.trim()), 350); return () => clearTimeout(id) }, [q])
  useEffect(() => { setPage(1) }, [category, status, period, custom.start, custom.end, search])

  const load = useCallback(async () => {
    const { start, end } = periodRange(period, custom)
    if (period === 'custom' && start && end && end < start) { setErr(tr('The To date cannot be before the From date.')); return }
    try {
      const r = await AlertsAPI.page({ category, status, start, end, q: search, page, size: SIZE })
      setData(r); setErr(''); setAlertUnread(r.unread)
    } catch (e) { setErr(getErrorMessage(e, tr('Could not load alerts.'))) }
  }, [category, status, period, custom, search, page])
  useEffect(() => { load() }, [load])

  // Live: the bell got a new alert / marked some read → reload this page
  useEffect(() => {
    const on = (e) => { if (e.detail?.source === 'bell') load() }
    window.addEventListener(ALERTS_EVENT, on)
    return () => window.removeEventListener(ALERTS_EVENT, on)
  }, [load])

  const markRead = async (body) => {
    setBusy(true)
    try { await AlertsAPI.read(body.ids ?? null, body.category); announceAlerts({ source: 'page' }); await load() }
    catch (e) { setErr(getErrorMessage(e, tr('Could not mark the alerts read.'))) }
    finally { setBusy(false) }
  }
  const openAlert = (a) => {
    if (!a.read) markRead({ ids: [a.id] })
    if (a.link) navigate(a.link)
  }

  const cats = data?.categories || []
  const groups = useMemo(() => {
    const out = []
    for (const a of data?.items || []) {
      const k = dayKey(a.created_at)
      if (!out.length || out[out.length - 1].key !== k) out.push({ key: k, items: [] })
      out[out.length - 1].items.push(a)
    }
    return out
  }, [data])
  const unreadHere = category ? (cats.find((c) => c.key === category)?.unread || 0) : (data?.all_unread || 0)
  const filtered = category || status !== 'all' || period !== 'all' || search

  const CatButton = ({ k, label, Icon, color, count, unread }) => {
    const on = category === k
    return (
      <button type="button" onClick={() => setCategory(k)} aria-pressed={on}
        className={`shrink-0 lg:w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[0.8125rem] border lg:border-0 transition-colors ${on ? 'bg-maroon-700 text-white border-maroon-700' : 'bg-white lg:bg-transparent text-gray-700 border-gray-200 hover:bg-[#FFF8E7]'}`}>
        <span className="w-7 h-7 rounded-lg grid place-items-center shrink-0" style={{ background: on ? 'rgba(255,255,255,.15)' : `${color}14`, color: on ? '#fff' : color }}><Icon size={15} /></span>
        <span className="flex-1 min-w-0 font-semibold whitespace-nowrap lg:whitespace-normal">{label}</span>
        {unread > 0 && <span className={`min-w-[1.25rem] h-5 px-1.5 rounded-full text-[0.6875rem] font-bold grid place-items-center ${on ? 'bg-white text-maroon-800' : 'bg-red-600 text-white'}`} title={tr('Unread')}>{unread}</span>}
        <span className={`text-[0.75rem] tabular-nums ${on ? 'text-white/80' : 'text-gray-400'}`}>{count}</span>
      </button>
    )
  }

  return (
    <div className="pb-6">
      <PageTitle title={tr('Alerts')}
        subtitle={tr('Everything sent to you, kept for 90 days. New alerts appear here at once.')}
        actions={unreadHere > 0 && (
          <button onClick={() => markRead(category ? { category } : {})} disabled={busy} className="btn-primary !py-2.5 disabled:opacity-60">
            <CheckCheck size={16} /> {category ? tr('Mark this category read') : tr('Mark all read')}
          </button>
        )} />

      {/* Filters */}
      <div className="mb-4 bg-white rounded-xl border border-gray-100 shadow-sm p-3 sm:p-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label={tr('Show')} className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-[0.8125rem] font-semibold">
          {[['all', 'All', data?.all], ['unread', 'Unread', data?.all_unread]].map(([k, l, n]) => (
            <button key={k} type="button" role="tab" aria-selected={status === k} onClick={() => setStatus(k)}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 ${status === k ? 'bg-maroon-700 text-white' : 'text-gray-600 hover:text-maroon-700'}`}>
              {tr(l)}{n != null && <span className={`text-[0.6875rem] ${status === k ? 'text-white/80' : 'text-gray-400'}`}>{n}</span>}
            </button>))}
        </div>
        <div role="tablist" aria-label={tr('Period')} className="inline-flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5 text-[0.8125rem] font-semibold">
          {PERIODS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={period === k} onClick={() => setPeriod(k)}
              className={`px-3 py-1.5 rounded-md ${period === k ? 'bg-maroon-700 text-white' : 'text-gray-600 hover:text-maroon-700'}`}>{tr(l)}</button>))}
        </div>
        {period === 'custom' && (
          <span className="inline-flex items-center gap-2">
            <div className="w-[9.5rem]"><DateField className="input !py-2" value={custom.start} max={custom.end || todayIST()} aria-label={tr('From')}
              onChange={(e) => setCustom({ ...custom, start: e.target.value })} /></div>
            <span className="text-gray-500 text-[0.8125rem]">–</span>
            <div className="w-[9.5rem]"><DateField className="input !py-2" value={custom.end} min={custom.start} max={todayIST()} aria-label={tr('To')}
              onChange={(e) => setCustom({ ...custom, end: e.target.value })} /></div>
          </span>
        )}
        <SearchInput value={q} onChange={setQ} placeholder={tr('Search donor, item or receipt…')} className="flex-1 min-w-[12rem]" />
        {filtered && (
          <button type="button" onClick={() => { setCategory(''); setStatus('all'); setPeriod('all'); setCustom({ start: '', end: '' }); setQ('') }}
            className="inline-flex items-center gap-1.5 text-[0.8125rem] text-gray-600 hover:text-maroon-700">
            <RotateCcw size={14} /> {tr('Clear')}
          </button>
        )}
      </div>

      {err && <div className="mb-4 flex items-center gap-2 text-[0.8125rem] rounded-lg px-4 py-2.5 border bg-red-50 border-red-200 text-red-700"><AlertTriangle size={15} />{err}</div>}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Categories: a side list on a wide screen, a scrolling chip row on a phone */}
        <aside className="lg:w-60 shrink-0">
          <div className="lg:bg-white lg:rounded-xl lg:border lg:border-gray-100 lg:shadow-sm lg:p-2">
            <div className="hidden lg:block px-3 pt-1 pb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-400"><T>Categories</T></div>
            <div className="flex lg:flex-col gap-2 lg:gap-0.5 overflow-x-auto pb-1 lg:pb-0 -mx-1 px-1 lg:mx-0 lg:px-0">
              <CatButton k="" label={tr('All')} Icon={BellRing} color="#7f1d1d" count={data?.all ?? 0} unread={data?.all_unread ?? 0} />
              {cats.map((c) => {
                const m = categoryOf(c.key)
                return <CatButton key={c.key} k={c.key} label={tr(m.label)} Icon={m.icon} color={m.color} count={c.count} unread={c.unread} />
              })}
            </div>
          </div>
        </aside>

        {/* List */}
        <section className="flex-1 min-w-0">
          {!data && !err && <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-500 text-sm"><T>Loading…</T></div>}
          {data && data.items.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
              <Inbox size={34} className="mx-auto text-gray-300 mb-2" />
              <div className="font-semibold text-gray-700">{data.all === 0 && !filtered ? tr('No alerts for your role yet.') : tr('No alerts match these filters.')}</div>
              {data.all === 0 && !filtered && <div className="text-[0.8125rem] text-gray-500 mt-1">{tr('When something needs you, it shows up here and in the bell at the top.')}</div>}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key} className="mb-4">
              <div className="px-1 pb-1.5 text-[0.75rem] font-bold uppercase tracking-wider text-gray-500">{dayHeading(g.key)}</div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
                {g.items.map((a) => {
                  const t = alertText(a)
                  const m = categoryOf(a.event)
                  const Icon = m.icon
                  return (
                    <div key={a.id} className={`flex gap-3 px-4 py-3 ${a.read ? '' : 'bg-amber-50/60'}`}>
                      <span className="mt-0.5 w-9 h-9 rounded-lg grid place-items-center shrink-0 relative" style={{ background: `${m.color}14`, color: m.color }}>
                        <Icon size={17} />
                        {!a.read && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white" style={{ background: m.color }} />}
                      </span>
                      <button type="button" onClick={() => openAlert(a)} className="min-w-0 flex-1 text-left">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className={`text-[0.875rem] ${a.read ? 'font-semibold text-gray-700' : 'font-bold text-gray-900'}`}>{t.title}</span>
                          <span className="text-[0.6875rem] text-gray-500">{clockOf(a.created_at)}</span>
                        </span>
                        <span className="block text-[0.8125rem] text-gray-700 break-words">{t.body}</span>
                        {t.action && <span className="block text-[0.75rem] mt-0.5" style={{ color: m.color }}>{t.action}</span>}
                        <span className="block text-[0.6875rem] text-gray-400 mt-0.5">
                          {a.created_by && <>{tr('Recorded by')} {staffName(a.created_by)}</>}
                          {a.read && <span className="ml-2 inline-flex items-center gap-0.5 text-emerald-700"><Check size={11} />{tr('Read')}</span>}
                        </span>
                      </button>
                      <span className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0 self-center">
                        {!a.read && (
                          <button type="button" onClick={() => markRead({ ids: [a.id] })} disabled={busy} title={tr('Mark read')} aria-label={tr('Mark read')}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50"><Check size={16} /></button>
                        )}
                        {a.link && (
                          <button type="button" onClick={() => openAlert(a)} className="btn-outline !py-1.5 !px-3 text-[0.8125rem]">
                            {tr('View')} <ArrowRight size={14} />
                          </button>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {data && data.total > SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2"><Pager page={page} size={SIZE} total={data.total} onPage={setPage} unit="alerts" /></div>
          )}
        </section>
      </div>
    </div>
  )
}
