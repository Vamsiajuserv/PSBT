import React, { useCallback, useEffect, useState } from 'react'
import { Printer, ChevronDown, ChevronRight, Clock, User } from 'lucide-react'
import { PoojarisAPI } from '../../api/client.js'
import { Select, DateField, Checkbox } from '../common/Field.jsx'
import { T, tr, clock12, personName, getLang, useLang } from '../../i18n/LanguageContext.jsx'
import { useTemple } from '../../lib/SiteContext.jsx'
import { halfLabel, halfIsOver, halfIsNow, todayIST, toMin, nowMinutesIST, HALF } from '../../lib/halfSlots.js'
import { fmtDate } from './ui.jsx'

export { halfLabel, todayIST }

// Half-hour pooja lists: the day's due poojas on half-hour lists (6:00–6:30 AM, 6:30–7:00 AM …
// from the first to the last pooja time in the Pooja Master). Each list is PRINTED for the poojari,
// as often as needed (client, 2026-11-20): printing closes nothing — only the clock does (a 5:30 PM
// pooja can be booked until 5:30 PM). "Print & Send" and its Administrator Undo were removed.
// Shown on Bookings ("Half-hour slots") and the Pooja Queue ("By half-hour").

// "1 devotee", "3 devotees" (t: tr on screen, L on the printed sheet)
const devotees = (n, t = tr) => t(Number(n) === 1 ? 'devotee' : 'devotees')
const TEMPLE_HOURS = /^0?6:00\s*AM\s*-\s*0?9:00\s*PM$/i
/** A pooja's own time on a list row: "05:30 PM", "09:00 AM - 11:30 AM", temple hours → "All day". */
const slotText = (s) => (s && TEMPLE_HOURS.test(s.trim()) ? tr('All day') : s ? clock12(s) : tr('Any time'))

/** The current or next half-hour that still has poojas today (for the "Now" banner). */
export function nextHalf(halves, day) {
  if (day !== todayIST()) return null
  const now = nowMinutesIST()
  const b = (halves || []).find((x) => x.start && x.total > 0 && now < toMin(x.start) + HALF)
  return b ? { ...b, slots: b.slots.filter((s) => s.count > 0) } : null
}

// ── Print sheet: one half-hour, every pooja on it, the devotees' sankalpam details ──
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export function printHourSheet(block, { day, temple, poojariName }) {
  const b = { ...block, slots: block.slots.filter((s) => s.count > 0) }   // free slots are not printed
  const te = getLang() === 'te'
  const L = (s) => esc(tr(s))
  const templeName = te ? (temple?.nameTelugu || tr(temple?.name || 'Shri Shirdi Sai Baba Temple')) : (temple?.name || 'Shri Shirdi Sai Baba Temple')
  const names = poojariName || [...new Set(b.slots.flatMap((s) => s.poojaris))].join(', ')
  const printed = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  let n = 0
  const sections = b.slots.map((s) => `
    <tr class="grp"><td colspan="5">${esc(tr(s.pooja))} — ${esc(slotText(s.slot))} — ${s.count} ${devotees(s.count, L)}</td></tr>
    ${s.devotees.map((d) => `<tr><td>${++n}</td><td class="mono">${esc(d.ticket_no)}</td>
      <td>${esc(personName({ name: d.devotee_name }, te ? 'te' : 'en'))}${d.beneficiary_name ? `<div class="sub">${L('For')}: ${esc(personName({ name: d.beneficiary_name }, te ? 'te' : 'en'))}</div>` : ''}${d.special_notes ? `<div class="sub">${esc(d.special_notes)}</div>` : ''}</td>
      <td>${esc(d.gothram ? tr(d.gothram) : '—')}</td><td>${esc(d.nakshatram ? tr(d.nakshatram) : '—')}</td></tr>`).join('')}`).join('')
  const html = `<!DOCTYPE html><html lang="${te ? 'te' : 'en'}"><head><meta charset="utf-8" />
    <title>${L('Pooja List')} — ${esc(halfLabel(b.start))}</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;600;700&display=swap" rel="stylesheet" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: ${te ? "'Noto Sans Telugu', " : ''}'Segoe UI', Arial, sans-serif; padding: 24px; color: #222; }
      .head { text-align: center; border-bottom: 2px solid #8b4513; padding-bottom: 10px; margin-bottom: 12px; }
      .temple { font-size: 18px; font-weight: 700; color: #8b4513; } .title { font-size: 14px; font-weight: 600; margin-top: 4px; }
      .meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 12px; flex-wrap: wrap; gap: 6px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; vertical-align: top; } th { background: #f6efe6; }
      tr.grp td { background: #fbf6ef; color: #8b4513; font-weight: 700; font-size: 13px; }
      .mono { font-family: Consolas, monospace; white-space: nowrap; } .sub { font-size: 10px; color: #666; }
      .sign { margin-top: 28px; font-size: 12px; }
      .foot { margin-top: 16px; font-size: 10px; color: #888; border-top: 1px dashed #ccc; padding-top: 6px; }
      @media print { body { padding: 8mm; } tr { break-inside: avoid; } }
    </style></head><body>
    <div class="head"><div class="temple">${esc(templeName)}</div><div class="title">${L('Pooja List')} — ${esc(fmtDate(day))} · ${esc(halfLabel(b.start))}</div></div>
    <div class="meta"><span><b>${L('Pooja slot')}:</b> ${esc(halfLabel(b.start))}</span>
      <span><b>${L('Poojari')}:</b> ${esc(names || '—')}</span><span><b>${L('Total')}:</b> ${b.total} ${devotees(b.total, L)}</span></div>
    <table><thead><tr><th>#</th><th>${L('Ticket')}</th><th>${L('Devotee name')}</th><th>${L('Gothram')}</th><th>${L('Nakshatram')}</th></tr></thead>
    <tbody>${sections}</tbody></table>
    <div class="sign">${L('Poojari signature')}: ______________________</div>
    <div class="foot">${L('Printed')} ${esc(printed)}</div></body></html>`
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return false
  win.document.write(html); win.document.close(); win.focus()
  const go = () => { win.print() }
  const fonts = win.document.fonts
  if (fonts?.ready) fonts.ready.then(() => setTimeout(go, 150)).catch(() => setTimeout(go, 300))
  else setTimeout(go, 300)
  return true
}

// ── The devotees of one pooja on a list ──
function DevoteeTable({ devotees: rows }) {
  const { lang } = useLang()
  return (
    <table className="w-full text-[0.8125rem]">
      <thead><tr className="text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
        <th className="py-1.5 pr-3">#</th><th className="py-1.5 pr-3">{tr('Ticket')}</th><th className="py-1.5 pr-3">{tr('Devotee name')}</th>
        <th className="py-1.5 pr-3">{tr('Gothram')}</th><th className="py-1.5 pr-3">{tr('Nakshatram')}</th><th className="py-1.5">{tr('Performed')}</th></tr></thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((d, i) => (
          <tr key={d.booking_id}>
            <td className="py-1.5 pr-3 text-gray-500">{i + 1}</td>
            <td className="py-1.5 pr-3 font-mono text-[0.75rem] whitespace-nowrap">{d.ticket_no}
              </td>
            <td className="py-1.5 pr-3">{personName({ name: d.devotee_name }, lang)}
              {d.beneficiary_name && <div className="text-[0.6875rem] text-gray-500">{tr('For')}: {personName({ name: d.beneficiary_name }, lang)}</div>}</td>
            <td className="py-1.5 pr-3">{d.gothram ? tr(d.gothram) : '—'}</td>
            <td className="py-1.5 pr-3">{d.nakshatram ? tr(d.nakshatram) : '—'}</td>
            <td className="py-1.5">{d.done ? <span className="text-emerald-700 font-semibold">{tr('Done')}</span> : <span className="text-gray-500">{tr('Not yet')}</span>}</td>
          </tr>))}
      </tbody>
    </table>
  )
}

/** One pooja on a list; "View names" opens its devotees (open from the start on a short list). */
function DetailRow({ s, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const { lang } = useLang()
  const free = !s.count
  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 ${free ? 'text-gray-400' : ''}`}>
        <span className={`font-semibold flex-[1_1_11rem] min-w-0 ${free ? '' : 'text-gray-800'}`}>{tr(s.pooja)}</span>
        <span className={`text-[0.75rem] font-semibold whitespace-nowrap rounded-full px-2.5 py-0.5 border ${free ? 'border-gray-200' : 'border-maroon-100 bg-maroon-50 text-maroon-700'}`}>{slotText(s.slot)}</span>
        <span className="text-[0.8125rem] whitespace-nowrap"><b className="tabular-nums">{s.count}</b> {devotees(s.count)}</span>
        {s.poojaris.length > 0 && <span className="text-[0.75rem] text-gray-500 inline-flex items-center gap-1 min-w-0"><User size={13} className="shrink-0" />{s.poojaris.map((n) => personName({ name: n }, lang)).join(', ')}</span>}
        {!free && <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
          className="ml-auto btn-outline !py-1 !px-2.5 text-[0.75rem]">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{' '}{tr(open ? 'Hide names' : 'View names')}</button>}
      </div>
      {open && <div className="overflow-x-auto px-4 pb-3"><DevoteeTable devotees={s.devotees} /></div>}
    </div>
  )
}

/** Status chip of a list, by the clock only: Open now (gold) / Over (grey, its time has passed) / Open. */
function StatusChip({ b, day }) {
  if (!b.start) return null
  if (halfIsNow(b.start, day)) return <span className="text-[0.6875rem] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200">{tr('Open now')}</span>
  if (halfIsOver(b.start, day)) return <span className="text-[0.6875rem] font-bold rounded-full px-2 py-0.5 bg-gray-100 text-gray-600 border border-gray-200">{tr('Over')}</span>
  return <span className="text-[0.6875rem] font-semibold rounded-full px-2 py-0.5 bg-white text-gray-600 border border-gray-200">{tr('Open')}</span>
}

/** The detail card of one half-hour: heading, status, Print (any time, as often as needed), its poojas. */
function HalfDetail({ b, day, onPrint }) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${b.start && halfIsNow(b.start, day) ? 'border-amber-300' : 'border-gray-100'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 border-b border-gray-100 bg-gray-50/70">
        <Clock size={16} className="text-maroon-700 shrink-0" />
        <h3 className="font-sans font-bold text-[1.0625rem] tabular-nums text-maroon-800">{halfLabel(b.start)}</h3>
        <StatusChip b={b} day={day} />
        <span className="ml-auto text-[0.8125rem]"><b className="tabular-nums">{b.total}</b> {devotees(b.total)}</span>
        {b.total > 0 &&
          <button type="button" onClick={() => onPrint(b)} className="btn-maroon !py-1 !px-2.5 text-[0.75rem]"><Printer size={13} />{' '}<T>Print</T></button>}
      </div>
      {b.slots.length ? b.slots.map((s) => <DetailRow key={`${b.start}-${s.pooja}-${s.slot}`} s={s} defaultOpen={b.total <= 12} />)
        : <div className="px-4 py-6 text-center text-[0.8125rem] text-gray-500">{tr('No poojas booked in this half-hour.')}</div>}
    </div>
  )
}

/** Loads one day's lists and keeps today's fresh every minute. */
function useHalves({ day, mine, pooja_id, all }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const load = useCallback(({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setErr('') }
    return PoojarisAPI.hourly({ day, mine: mine || undefined, pooja_id: pooja_id || undefined, all_slots: all || undefined })
      .then(setData).catch(() => { if (!silent) setErr(tr('Could not load the pooja slots.')) })
      .finally(() => { if (!silent) setLoading(false) })
  }, [day, mine, pooja_id, all])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (day !== todayIST()) return undefined
    const t = setInterval(() => document.visibilityState === 'visible' && load({ silent: true }), 60000)
    return () => clearInterval(t)
  }, [day, load])
  return { data, loading, err, setErr, load }
}

/** Print, shared by the tiles and the list view. */
function usePrint({ day, temple, poojariName, setErr }) {
  return (b) => { if (!printHourSheet(b, { day, temple, poojariName })) setErr(tr('Allow pop-ups to print the list.')) }
}

/** Half-hour slots. controls = Bookings → "Half-hour slots": filters + tiles. Without controls
 *  (Pooja Queue → "By half-hour") the caller passes `day` and the plain list is shown.
 *  mine = the signed-in poojari's poojas only. */
export function HourlySlotsView(props) {
  return props.controls ? <HalfBoardView poojas={props.poojas} /> : <HalfListView {...props} />
}

const keyOf = (start) => start || 'any'

/** Which group a half-hour list is in, by the clock only: Open (now or later) or Over (its time
 *  has passed — folded away, still printable). */
const stateOf = (b, day) => (b.start && halfIsOver(b.start, day) ? 'over' : 'open')
const GROUPS = [   // [state, heading, heading colour, dot colour]
  ['open', 'Open', 'text-amber-800', 'bg-amber-500'],
  ['over', 'Over', 'text-gray-500', 'bg-gray-400'],
]
const dotOf = (st) => GROUPS.find(([g]) => g === st)[3]

/** One half-hour in the left list. Line 1: its time (the same "7:30 PM – 8:00 PM" as the panel
 *  on the right) · devotees; line 2: the poojas on it. The selected row
 *  is the only one with a maroon bar and an arrow. */
function HalfRow({ b, day, on, onPick }) {
  const st = stateOf(b, day)
  const now = st === 'open' && b.start && halfIsNow(b.start, day)
  const names = b.slots.filter((s) => s.count > 0).map((s) => tr(s.pooja))
  return (
    <button type="button" onClick={onPick} aria-pressed={on} aria-current={on ? 'true' : undefined}
      className={`w-full text-left flex items-center gap-2 pl-3 pr-2 py-2 border-l-[3px] transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-maroon-500
        ${on ? 'border-l-maroon-700 bg-maroon-50' : 'border-l-transparent hover:bg-gray-50'}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotOf(st)}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`text-[0.8125rem] font-semibold whitespace-nowrap ${on ? 'text-maroon-800' : 'text-gray-800'}`}>{halfLabel(b.start)}</span>
          {now && <span className="text-[0.625rem] font-bold uppercase tracking-wide rounded px-1.5 py-px bg-amber-100 text-amber-800">{tr('Now')}</span>}
          <span className="ml-auto text-[0.75rem] text-gray-600 whitespace-nowrap"><b className="tabular-nums text-gray-900">{b.total}</b> {devotees(b.total)}</span>
        </span>
        <span className="block truncate text-[0.75rem] text-gray-500">
          {names.length ? names.join(', ') : tr('No devotees')}</span>
      </span>
      <ChevronRight size={15} className={`shrink-0 ${on ? 'text-maroon-700' : 'text-gray-300'}`} aria-hidden="true" />
    </button>
  )
}

/** Bookings → "Half-hour slots": a toolbar (date · pooja · free times · total), the day's busy
 *  half-hours grouped Open / Over (Over folded), and the chosen list beside them
 *  (on a phone: right under its row). Default: the current half-hour, else the next open one. */
function HalfBoardView({ poojas }) {
  const temple = useTemple()
  const [f, setF] = useState({ day: todayIST(), pooja_id: '', all: false })
  const [sel, setSel] = useState(null)          // null = automatic: the current / next list
  const [showOver, setShowOver] = useState(false)
  const day = f.day
  const today = day === todayIST()
  const { data, loading, err, setErr } = useHalves({ day, pooja_id: f.pooja_id, all: f.all })
  const print = usePrint({ day, temple, setErr })
  const rows = (data?.hours || []).filter((b) => b.total > 0 || (f.all && b.slots.length))
  const byGroup = Object.fromEntries(GROUPS.map(([g]) => [g, rows.filter((b) => stateOf(b, day) === g)]))
  const nowRow = byGroup.open.find((b) => b.start && halfIsNow(b.start, day))
  const auto = nowRow || byGroup.open.find((b) => b.total > 0) || byGroup.open[0] || byGroup.over[byGroup.over.length - 1]
  const chosen = rows.find((b) => keyOf(b.start) === sel) || auto || null
  const setFilter = (x) => { setF({ ...f, ...x }); setSel(null) }
  const detail = chosen && <HalfDetail b={chosen} day={day} onPrint={print} />
  const overOpen = showOver || (chosen && stateOf(chosen, day) === 'over')
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="w-[9.5rem]"><DateField className="input !py-1.5" aria-label={tr('Date')} value={f.day}
          onChange={(e) => setFilter({ day: e.target.value || todayIST() })} /></div>
        <div className="w-[12rem]"><Select className="input !py-1.5" aria-label={tr('Pooja')} value={f.pooja_id} onChange={(e) => setFilter({ pooja_id: e.target.value })}>
          <option value="">{tr('All poojas')}</option>{(poojas || []).map((p) => <option key={p.id} value={p.id}>{tr(p.name)}</option>)}</Select></div>
        <label className="inline-flex items-center gap-2 text-[0.8125rem] text-gray-700 cursor-pointer" title={tr('Also list free slots of every pooja, with 0 devotees')}>
          <Checkbox checked={f.all} onChange={() => setFilter({ all: !f.all })} /><T>Show free times</T></label>
        {!today && <button type="button" onClick={() => setFilter({ day: todayIST() })} className="text-[0.8125rem] font-semibold text-maroon-700 hover:underline"><T>Today</T></button>}
        <span className="sm:ml-auto text-[0.8125rem] text-gray-600"><b className="tabular-nums text-gray-900">{data?.total ?? 0}</b> {devotees(data?.total ?? 0)} · {fmtDate(day)}</span>
      </div>
      {err && <div className="text-[0.8125rem] text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{err}</div>}
      {loading && !data && <div className="text-sm text-gray-500 px-1"><T>Loading...</T></div>}
      {data && (!rows.length
        ? <div className="bg-white rounded-xl border border-gray-100 px-4 py-8 text-center text-[0.8125rem] text-gray-500">{tr('No poojas due in this period.')}</div>
        : <div className="grid gap-3 lg:grid-cols-[minmax(19rem,24rem)_1fr] items-start">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
            {GROUPS.filter(([g]) => byGroup[g].length).map(([g, label, tone]) => {
              const folded = g === 'over' && !overOpen
              const head = <>{tr(label)} <span className="font-semibold text-gray-400">({byGroup[g].length})</span></>
              return (
                <div key={g}>
                  {g === 'over'
                    ? <button type="button" onClick={() => setShowOver(!overOpen)} aria-expanded={!folded}
                        className={`w-full flex items-center gap-1.5 px-3 py-2 text-[0.6875rem] font-bold uppercase tracking-wider ${tone} hover:bg-gray-50`}>
                        {folded ? <ChevronRight size={12} /> : <ChevronDown size={12} />}{head}
                        <span className="ml-auto normal-case tracking-normal font-semibold text-gray-500">{tr(folded ? 'Show' : 'Hide')}</span></button>
                    : <div className={`px-3 pt-2.5 pb-1 text-[0.6875rem] font-bold uppercase tracking-wider ${tone}`}>{head}</div>}
                  {!folded && byGroup[g].map((b) => {
                    const on = chosen === b
                    return (
                      <div key={keyOf(b.start)}>
                        <HalfRow b={b} day={day} on={on} onPick={() => setSel(keyOf(b.start))} />
                        {on && <div className="lg:hidden px-2 pb-2">{detail}</div>}
                      </div>)
                  })}
                </div>)
            })}
          </div>
          <div className="hidden lg:block lg:sticky lg:top-20">{detail}</div>
        </div>)}
    </div>
  )
}

/** "Now: 6:30 – 7:00 AM — Archana All day — 3 devotees" */
export function NextSlotBanner({ block }) {
  if (!block) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[0.875rem] text-amber-900">
      <Clock size={16} className="text-amber-600 shrink-0" />
      <b>{tr('Next')}: {halfLabel(block.start)}</b>
      <span>{block.slots.map((s) => `${tr(s.pooja)} ${slotText(s.slot)} — ${s.count} ${devotees(s.count)}`).join(' · ')}</span>
    </div>
  )
}

/** The plain half-hour list (Pooja Queue → "By half-hour"). */
function HalfListView({ day: fixedDay, mine = false, poojariName = null }) {
  const temple = useTemple()
  const day = fixedDay || todayIST()
  const { data, loading, err, setErr } = useHalves({ day, mine })
  const print = usePrint({ day, temple, poojariName, setErr })
  const [open, setOpen] = useState({})
  const halves = (data?.hours || []).filter((b) => b.total > 0)
  const next = nextHalf(data?.hours, day)
  return (
    <div className="space-y-3">
      {next && <NextSlotBanner block={next} />}
      {err && <div className="text-[0.8125rem] text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{err}</div>}
      {loading && !data && <div className="text-sm text-gray-500 px-1"><T>Loading...</T></div>}
      {data && !halves.length && <div className="bg-white rounded-xl border border-gray-100 px-4 py-8 text-center text-[0.8125rem] text-gray-500">{tr('No poojas due in this period.')}</div>}
      {halves.map((b) => {
        const done = b.slots.reduce((n, s) => n + s.devotees.filter((d) => d.done).length, 0)
        const isOpen = open[keyOf(b.start)] ?? (next && next.start === b.start)
        return (
          <div key={keyOf(b.start)} className="space-y-0">
            <button type="button" onClick={() => setOpen({ ...open, [keyOf(b.start)]: !isOpen })}
              className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 rounded-xl border text-left border-gray-100 bg-white">
              {isOpen ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
              <span className="font-semibold text-maroon-800">{halfLabel(b.start)}</span>
              <StatusChip b={b} day={day} />
              <span className="ml-auto text-[0.8125rem]"><b>{b.total}</b> {devotees(b.total)} · <span className="text-emerald-700">✔ {done} {tr('done')}</span></span>
            </button>
            {isOpen && <div className="mt-2"><HalfDetail b={b} day={day} onPrint={print} /></div>}
          </div>)
      })}
    </div>
  )
}
