import React, { useEffect, useMemo, useState } from 'react'
import { Printer, Search, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react'
import { PoojarisAPI, getErrorMessage } from '../../api/client.js'
import { T, tr, personName, useLang } from '../../i18n/LanguageContext.jsx'
import { useTemple } from '../../lib/SiteContext.jsx'
import { PERIODS, halfPeriod, halfLabel, halfRange, halfIsOver, halfIsNow, toMin, nowMinutesIST, todayIST, HALF } from '../../lib/halfSlots.js'
import { printHourSheet } from './HourlySlots.jsx'

// My Poojas — "Sankalpam sheet" (client picked Design 5, 2026-11-27). The whole pooja day (every half-hour
// from the first to the last pooja time, 6:00 AM – 9:00 PM) on one strip in Morning · Afternoon · Evening,
// each half-hour with its number of devotees. Tap a time to open only that half-hour's names — even 100 at
// 6:00 AM — with a search and "Group by gothram" for reading the sankalpam. Empty half-hours are grey; the
// current one is marked NOW and opens by itself. Data: the same half-hour lists as "By half-hour".

const SEARCH_FROM = 10        // a search box once a half-hour has more names than this
const shortClock = (start) => halfRange(start).split(' – ')[0]

export default function SankalpamSheet({ day, mine, poojariName, refreshKey }) {
  const { lang } = useLang()
  const temple = useTemple()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(undefined)      // the half-hour shown open ("06:00"); null = all closed
  const [q, setQ] = useState({})                   // search text per half-hour
  const [byGothram, setByGothram] = useState({})   // group by gothram, per half-hour

  useEffect(() => {
    let alive = true
    PoojarisAPI.hourly({ day, mine: mine || undefined })
      .then((d) => { if (alive) { setData(d); setErr('') } })
      .catch((ex) => { if (alive) setErr(getErrorMessage(ex, tr('Could not load the pooja list.'))) })
    return () => { alive = false }
  }, [day, mine, refreshKey])
  useEffect(() => { setOpen(undefined) }, [day, mine])      // a new day opens its own "now" again

  const hours = useMemo(() => (data?.hours || []).filter((h) => h.start && h.total > 0), [data])
  const byStart = useMemo(() => Object.fromEntries(hours.map((h) => [h.start, h])), [hours])
  const range = useMemo(() => [...new Set([...(data?.range || []), ...hours.map((h) => h.start)])].sort(), [data, hours])
  const noTime = (data?.hours || []).find((h) => !h.start && h.total > 0)       // poojas without a half-hour

  // Opens by itself: the half-hour going on now (or the next one with poojas), else the first one
  useEffect(() => {
    if (open !== undefined || !data) return
    const now = day === todayIST() ? nowMinutesIST() : -1
    const pick = hours.find((h) => now < toMin(h.start) + HALF) || hours[0]
    setOpen(pick ? pick.start : null)
  }, [data, hours, open, day])

  const total = hours.reduce((t, h) => t + h.total, 0)
  const doneOf = (h) => h.slots.reduce((t, s) => t + s.devotees.filter((d) => d.done).length, 0)
  const performed = hours.reduce((t, h) => t + doneOf(h), 0)
  const show = (start) => {
    setOpen(start)
    setTimeout(() => document.getElementById(`half-${start}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  if (err) return <div className="card px-4 py-5 text-[0.8125rem] text-red-700">{err}</div>
  if (!data) return <div className="card px-4 py-8 text-center text-gray-500"><T>Loading…</T></div>

  return (
    <div className="card p-4 sm:p-6 border-t-4 border-t-gold-500">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-amber-100 pb-3">
        <div>
          <h2 className="font-serif text-xl font-bold text-maroon-800"><T>Pooja List</T></h2>
          <div className="text-[0.8125rem] text-gray-600">
            {total} {tr('devotees')} · {hours.length} {tr('of')} {range.length} {tr('half-hours')} · <span className="text-emerald-700 font-semibold">{performed} {tr('performed')}</span>
          </div>
        </div>
      </div>

      {/* The day on one strip: Morning · Afternoon · Evening */}
      <div className="py-4 space-y-2.5">
        {PERIODS.map((p) => {
          const halves = range.filter((s) => halfPeriod(s) === p)
          if (!halves.length) return null
          const n = halves.reduce((t, s) => t + (byStart[s]?.total || 0), 0)
          return (
            <div key={p} className="flex gap-3 items-start">
              <div className="w-28 shrink-0 pt-1.5">
                <div className="text-[0.75rem] font-extrabold uppercase tracking-wider text-gold-700">{tr(p)}</div>
                <div className="text-[0.6875rem] text-gray-500">{n} {tr('devotees')}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {halves.map((s) => {
                  const h = byStart[s]
                  const c = h?.total || 0
                  const now = halfIsNow(s, day), over = halfIsOver(s, day), on = open === s
                  const cls = on ? 'bg-maroon-700 border-maroon-700 text-white'
                    : !c ? 'bg-gray-50 border-dashed border-gray-200 text-gray-400 cursor-default'
                      : over ? 'bg-emerald-50 border-emerald-200 text-gray-800 hover:border-emerald-400'
                        : 'bg-white border-amber-200 text-gray-800 hover:border-maroon-400'
                  return (
                    <button key={s} type="button" disabled={!c} onClick={() => show(s)} title={halfLabel(s)}
                      className={`relative w-16 rounded-xl border px-1 py-1.5 text-center transition ${cls} ${now && !on ? '!border-2 !border-orange-600' : ''}`}>
                      {now && <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-orange-600 px-1.5 text-[0.5625rem] font-extrabold text-white">{tr('NOW')}</span>}
                      <div className={`text-[0.8125rem] font-bold ${on ? 'text-white' : c ? 'text-maroon-800' : ''}`}>{shortClock(s)}</div>
                      <div className="text-[0.75rem] font-semibold">{c || '—'}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        <div className="pl-[7.75rem] text-[0.6875rem] text-gray-500">
          <span className="inline-block w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-300 align-middle" /> {tr('over')} ·{' '}
          <span className="inline-block w-2.5 h-2.5 rounded border-2 border-orange-600 align-middle" /> {tr('now')} ·{' '}
          <span className="inline-block w-2.5 h-2.5 rounded border border-dashed border-gray-300 bg-gray-50 align-middle" /> {tr('no poojas')}
        </div>
      </div>

      {/* The half-hours that have poojas: one open at a time */}
      <div className="space-y-2.5">
        {hours.length === 0 && <div className="py-8 text-center text-gray-500 text-[0.875rem]"><T>No poojas for this day.</T></div>}
        {hours.map((h) => (
          <HalfBox key={h.start} h={h} day={day} lang={lang} isOpen={open === h.start}
            onToggle={() => setOpen(open === h.start ? null : h.start)}
            q={q[h.start] || ''} setQ={(v) => setQ((x) => ({ ...x, [h.start]: v }))}
            gothram={!!byGothram[h.start]} setGothram={(v) => setByGothram((x) => ({ ...x, [h.start]: v }))}
            done={doneOf(h)} onPrint={() => printHourSheet(h, { day, temple, poojariName })} />
        ))}
        {noTime && (
          <div className="text-[0.75rem] text-gray-500 pt-1">{noTime.total} {tr('devotee(s) with no fixed time are in the list below.')}</div>
        )}
      </div>
    </div>
  )
}

function HalfBox({ h, day, lang, isOpen, onToggle, q, setQ, gothram, setGothram, done, onPrint }) {
  const now = halfIsNow(h.start, day)
  const all = done === h.total
  const poojas = h.slots.map((s) => tr(s.pooja)).join(' · ')
  // every devotee of the half-hour, with the pooja they are on
  const rows = useMemo(() => h.slots.flatMap((s) => s.devotees.map((d) => ({ ...d, pooja: s.pooja }))), [h])
  const t = q.trim().toLowerCase()
  const shown = useMemo(() => {
    const l = rows.filter((d) => !t || `${d.devotee_name} ${d.beneficiary_name || ''} ${d.mobile || ''} ${d.ticket_no || ''} ${d.gothram || ''} ${d.nakshatram || ''}`.toLowerCase().includes(t))
    return gothram ? [...l].sort((a, b) => (a.gothram || '~').localeCompare(b.gothram || '~')) : l
  }, [rows, t, gothram])
  let prev = null
  return (
    <div id={`half-${h.start}`} className={`rounded-xl border overflow-hidden scroll-mt-20 ${isOpen ? 'border-amber-300 shadow-md' : 'border-amber-100'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-50/40 px-4 py-3">
        <button type="button" onClick={onToggle} aria-expanded={isOpen} className="flex flex-1 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-left">
          {isOpen ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
          <span className="font-extrabold text-maroon-800 min-w-[9.5rem]">{halfLabel(h.start)}</span>
          <span className="flex-1 min-w-[8rem] text-[0.875rem] text-gray-700 truncate">{poojas}</span>
          <span className="text-[0.875rem] font-bold text-gray-800">{h.total} {tr(h.total === 1 ? 'devotee' : 'devotees')}</span>
          {now && <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[0.6875rem] font-bold text-white">{tr('NOW')}</span>}
          <span className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold ${all ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {all ? `✔ ${tr('Performed')}` : `${h.total - done} ${tr('to perform')}`}</span>
        </button>
        <button type="button" onClick={onPrint} title={tr('Print this half-hour')} aria-label={tr('Print this half-hour')}
          className="w-9 h-9 grid place-items-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:text-maroon-700"><Printer size={15} /></button>
      </div>
      {isOpen && (
        <div className="border-t border-amber-100 px-4 py-3 space-y-2.5">
          {h.total > SEARCH_FROM && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[14rem]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="input !pl-9" value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder={`${tr('Search in')} ${shortClock(h.start)} — ${tr('name, mobile, ticket, gothram…')}`} />
              </div>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[0.8125rem] font-semibold">
                <button type="button" onClick={() => setGothram(false)} className={`px-3 py-2 ${!gothram ? 'bg-maroon-700 text-cream' : 'bg-white text-gray-600'}`}>{tr('In booking order')}</button>
                <button type="button" onClick={() => setGothram(true)} className={`px-3 py-2 ${gothram ? 'bg-maroon-700 text-cream' : 'bg-white text-gray-600'}`}>{tr('Group by gothram')}</button>
              </div>
            </div>
          )}
          <div className="max-h-[28rem] overflow-auto rounded-lg border border-amber-100">
            <table className="w-full text-[0.875rem]">
              <thead className="sticky top-0 z-10"><tr className="bg-amber-50 text-left text-[0.6875rem] uppercase tracking-wide text-gray-600">
                {['', '#', 'Devotee / for', 'Pooja', 'Gothram', 'Nakshatram', 'Ticket'].map((c) => <th key={c} className="px-3 py-2 font-semibold whitespace-nowrap">{tr(c)}</th>)}
              </tr></thead>
              <tbody>
                {shown.map((d, i) => {
                  const head = gothram && (d.gothram || '') !== prev
                  prev = d.gothram || ''
                  return (
                    <React.Fragment key={d.booking_id}>
                      {head && <tr><td colSpan={7} className="bg-amber-100/60 px-3 py-1.5 text-[0.8125rem] font-bold text-maroon-800">
                        {d.gothram ? `${tr(d.gothram)} ${tr('gothram')}` : tr('No gothram')} · {shown.filter((x) => (x.gothram || '') === (d.gothram || '')).length}</td></tr>}
                      <tr className={`border-t border-amber-50 ${d.done ? 'text-gray-500' : ''}`}>
                        <td className="px-3 py-2">{d.done ? <CheckCircle2 size={16} className="text-emerald-600" aria-label={tr('Performed')} />
                          : <span className="inline-block w-4 h-4 rounded border-2 border-amber-300 align-middle" aria-label={tr('To perform')} />}</td>
                        <td className="px-3 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2"><b className={d.done ? 'font-semibold' : 'text-gray-900'}>{personName({ name: d.devotee_name }, lang)}</b>
                          {d.beneficiary_name && <span className="text-[0.75rem] text-gray-500"> · {tr('For')}: {personName({ name: d.beneficiary_name }, lang)}</span>}
                          {d.special_notes && <div className="text-[0.75rem] text-gray-500">{d.special_notes}</div>}</td>
                        <td className="px-3 py-2">{tr(d.pooja)}</td>
                        <td className="px-3 py-2">{d.gothram ? tr(d.gothram) : '—'}</td>
                        <td className="px-3 py-2">{d.nakshatram ? tr(d.nakshatram) : '—'}</td>
                        <td className="px-3 py-2 font-mono text-[0.75rem] whitespace-nowrap">{d.ticket_no}</td>
                      </tr>
                    </React.Fragment>
                  )
                })}
                {!shown.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">{tr('No devotee matches.')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
