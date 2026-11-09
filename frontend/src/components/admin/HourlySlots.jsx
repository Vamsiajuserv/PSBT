import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Printer, ChevronDown, ChevronRight, Clock, X, BellRing, RotateCcw, User } from 'lucide-react'
import { PoojarisAPI } from '../../api/client.js'
import { Select, DateField, Checkbox } from '../common/Field.jsx'
import { T, tr, clock12, personName, getLang, useLang } from '../../i18n/LanguageContext.jsx'
import { useTemple } from '../../lib/SiteContext.jsx'
import { fmtDate } from './ui.jsx'

// Hourly slots: the day's due poojas in 1-hour windows (by each pooja's slot from the Pooja
// Master), with the devotees of every slot — on Bookings ("Hourly slots"), the Pooja Queue,
// a print sheet per hour, and the poojari's in-app alert 15 minutes before each hour.
export const ALERT_LEAD_MIN = 15
export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const nowMinutesIST = () => {
  const [h, m] = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }).split(':').map(Number)
  return h * 60 + m
}
/** 6 → "6 AM", 12 → "12 PM", 24 → "12 AM" */
const clock = (h) => `${(h % 24) % 12 || 12} ${(h % 24) >= 12 ? 'PM' : 'AM'}`
// Poojas valid all day (temple hours 6 AM – 9 PM) are one group, hour TEMPLE_HOUR, listed first
export const TEMPLE_HOUR = -1
// The temple's working day (6 AM – 9 PM): the hour tiles always cover at least these hours,
// so the whole day reads at a glance even when only a few hours have poojas.
const DAY_FIRST_HOUR = 6
const DAY_LAST_HOUR = 20
const isTimed = (h) => h != null && h >= 0
/** "6 AM – 7 AM" (Telugu-aware: "ఉదయం 6 – 7"); temple hours and "Any time" have their own names. */
export const hourLabel = (h) => (h == null ? tr('Any time') : h === TEMPLE_HOUR ? tr('Temple hours (6 AM – 9 PM)')
  : clock12(`${clock(h)} – ${clock(h + 1)}`))
/** Short tile caption: "6 AM – 7 AM", "All day", "Any time". */
const tileLabel = (h) => (h == null ? tr('Any time') : h === TEMPLE_HOUR ? tr('All day') : hourLabel(h))
const slotText = (s, h) => (h === TEMPLE_HOUR ? tr('All day') : s ? clock12(s) : tr('Any time'))

/** The current or next hour that still has poojas today (for "Next slot"). */
export function nextHour(hours, day) {
  if (day !== todayIST()) return null
  const now = nowMinutesIST()
  const b = (hours || []).find((x) => isTimed(x.hour) && x.total > 0 && now < (x.hour + 1) * 60)
  return b ? { ...b, slots: b.slots.filter((s) => s.count > 0) } : null
}

// ── Print sheet: one hour, every slot in it, the devotees' sankalpam details ──
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export function printHourSheet(hourBlock, { day, temple, poojariName }) {
  const block = { ...hourBlock, slots: hourBlock.slots.filter((s) => s.count > 0) }   // free slots are not printed
  const te = getLang() === 'te'
  const L = (s) => esc(tr(s))
  const templeName = te ? (temple?.nameTelugu || tr(temple?.name || 'Shri Shirdi Sai Baba Temple')) : (temple?.name || 'Shri Shirdi Sai Baba Temple')
  const names = poojariName || [...new Set(block.slots.flatMap((s) => s.poojaris))].join(', ')
  const printed = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const sections = block.slots.map((s) => `
    <h2>${esc(tr(s.pooja))} — ${esc(slotText(s.slot, block.hour))} — ${s.count} ${L('devotees')}</h2>
    <table><thead><tr><th>#</th><th>${L('Ticket')}</th><th>${L('Devotee name')}</th><th>${L('Gothram')}</th><th>${L('Nakshatram')}</th></tr></thead>
    <tbody>${s.devotees.map((d, i) => `<tr><td>${i + 1}</td><td class="mono">${esc(d.ticket_no)}</td>
      <td>${esc(personName({ name: d.devotee_name }, te ? 'te' : 'en'))}${d.beneficiary_name ? `<div class="sub">${L('For')}: ${esc(personName({ name: d.beneficiary_name }, te ? 'te' : 'en'))}</div>` : ''}${d.special_notes ? `<div class="sub">${esc(d.special_notes)}</div>` : ''}</td>
      <td>${esc(d.gothram ? tr(d.gothram) : '—')}</td><td>${esc(d.nakshatram ? tr(d.nakshatram) : '—')}</td></tr>`).join('')}</tbody></table>`).join('')
  const html = `<!DOCTYPE html><html lang="${te ? 'te' : 'en'}"><head><meta charset="utf-8" />
    <title>${L('Pooja List')} — ${esc(hourLabel(block.hour))}</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;600;700&display=swap" rel="stylesheet" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: ${te ? "'Noto Sans Telugu', " : ''}'Segoe UI', Arial, sans-serif; padding: 24px; color: #222; }
      .head { text-align: center; border-bottom: 2px solid #8b4513; padding-bottom: 10px; margin-bottom: 12px; }
      .temple { font-size: 18px; font-weight: 700; color: #8b4513; } .title { font-size: 14px; font-weight: 600; margin-top: 4px; }
      .meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 12px; flex-wrap: wrap; gap: 6px; }
      h2 { font-size: 14px; color: #8b4513; margin: 14px 0 6px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; vertical-align: top; } th { background: #f6efe6; }
      .mono { font-family: Consolas, monospace; white-space: nowrap; } .sub { font-size: 10px; color: #666; }
      .foot { margin-top: 16px; font-size: 10px; color: #888; border-top: 1px dashed #ccc; padding-top: 6px; }
      @media print { body { padding: 8mm; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
    </style></head><body>
    <div class="head"><div class="temple">${esc(templeName)}</div><div class="title">${L('Pooja List')}</div></div>
    <div class="meta"><span><b>${L('Date')}:</b> ${esc(fmtDate(day))}</span><span><b>${L('Hour')}:</b> ${esc(hourLabel(block.hour))}</span>
      <span><b>${L('Poojari')}:</b> ${esc(names || '—')}</span><span><b>${L('Total')}:</b> ${block.total} ${L('devotees')}</span></div>
    ${sections}
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

// ── The devotees of one slot (shared by the list rows and the hour-tile detail) ──
function DevoteeTable({ devotees }) {
  const { lang } = useLang()
  return (
    <table className="w-full text-[0.8125rem]">
      <thead><tr className="text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
        <th className="py-1.5 pr-3">#</th><th className="py-1.5 pr-3">{tr('Ticket')}</th><th className="py-1.5 pr-3">{tr('Devotee name')}</th>
        <th className="py-1.5 pr-3">{tr('Gothram')}</th><th className="py-1.5 pr-3">{tr('Nakshatram')}</th><th className="py-1.5">{tr('Status')}</th></tr></thead>
      <tbody className="divide-y divide-gray-50">
        {devotees.map((d, i) => (
          <tr key={d.booking_id}>
            <td className="py-1.5 pr-3 text-gray-500">{i + 1}</td>
            <td className="py-1.5 pr-3 font-mono text-[0.75rem] whitespace-nowrap">{d.ticket_no}</td>
            <td className="py-1.5 pr-3">{personName({ name: d.devotee_name }, lang)}
              {d.beneficiary_name && <div className="text-[0.6875rem] text-gray-500">{tr('For')}: {personName({ name: d.beneficiary_name }, lang)}</div>}</td>
            <td className="py-1.5 pr-3">{d.gothram ? tr(d.gothram) : '—'}</td>
            <td className="py-1.5 pr-3">{d.nakshatram ? tr(d.nakshatram) : '—'}</td>
            <td className="py-1.5">{d.done ? <span className="text-emerald-700 font-semibold">{tr('Done')}</span> : <span className="text-gray-500">{tr('Due')}</span>}</td>
          </tr>))}
      </tbody>
    </table>
  )
}

// ── One slot's devotees (expandable) ──
function SlotRow({ s, hour }) {
  const [open, setOpen] = useState(false)
  const { lang } = useLang()
  if (!s.count) {             // "Show all slots": a free slot nobody booked
    return (
      <div className="border-t border-gray-100 first:border-t-0 flex items-center gap-3 px-4 py-2 text-gray-400">
        <span className="w-[15px] shrink-0" />
        <span className="flex-1 min-w-0 truncate">{tr(s.pooja)}</span>
        <span className="text-[0.8125rem] whitespace-nowrap">{slotText(s.slot, hour)}</span>
        <span className="text-[0.8125rem] whitespace-nowrap">0 {tr('devotees')}</span>
      </div>)
  }
  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50">
        {open ? <ChevronDown size={15} className="text-gray-400 shrink-0" /> : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
        <span className="font-semibold text-gray-800 flex-1 min-w-0 truncate">{tr(s.pooja)}</span>
        <span className="text-[0.8125rem] text-maroon-700 font-semibold whitespace-nowrap">{slotText(s.slot, hour)}</span>
        <span className="text-[0.8125rem] whitespace-nowrap"><b>{s.count}</b> {tr('devotees')}</span>
        {s.poojaris.length > 0 && <span className="hidden sm:inline text-[0.75rem] text-gray-500 whitespace-nowrap">{s.poojaris.map((n) => personName({ name: n }, lang)).join(', ')}</span>}
      </button>
      {open && <div className="overflow-x-auto px-4 pb-3"><DevoteeTable devotees={s.devotees} /></div>}
    </div>
  )
}

/** "Next: 05:00 PM - 06:00 PM — Ashtotharam 05:30 PM — 10 devotees" */
export function NextSlotBanner({ block }) {
  if (!block) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[0.875rem] text-amber-900">
      <Clock size={16} className="text-amber-600 shrink-0" />
      <b>{tr('Next')}: {hourLabel(block.hour)}</b>
      <span>{block.slots.map((s) => `${tr(s.pooja)} ${slotText(s.slot, block.hour)} — ${s.count} ${tr('devotees')}`).join(' · ')}</span>
    </div>
  )
}

/** Hourly slots. controls = Bookings → "Hourly slots": the date / pooja / hour filters and the
 *  hour-tile layout. Without controls (Pooja Queue → "By hour") the caller passes `day` and
 *  the plain hour list is shown. mine = the signed-in poojari's slots only. */
export function HourlySlotsView(props) {
  return props.controls ? <HourTilesView poojas={props.poojas} /> : <HourListView {...props} />
}

// ── Bookings → Hourly slots: summary, a tile per hour of the day, the chosen hour below ──
const ALL_HOURS = 'all'
// Hours as select / state keys: "17", "-1" (temple hours), "any" (no time)
const hourKey = (h) => (h == null ? 'any' : String(h))

function Stat({ value, label }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 min-w-0">
      <div className="text-[1.375rem] font-serif font-semibold text-maroon-800 tabular-nums lining-nums leading-tight truncate">{value}</div>
      <div className="text-[0.75rem] text-gray-500">{label}</div>
    </div>
  )
}

/** One booked or free slot in the detail panel; "View names" opens its devotees. */
function DetailRow({ s, hour }) {
  const [open, setOpen] = useState(false)
  const { lang } = useLang()
  const free = !s.count
  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 ${free ? 'text-gray-400' : ''}`}>
        <span className={`font-semibold flex-[1_1_11rem] min-w-0 ${free ? '' : 'text-gray-800'}`}>{tr(s.pooja)}</span>
        <span className={`text-[0.75rem] font-semibold whitespace-nowrap rounded-full px-2.5 py-0.5 border ${free ? 'border-gray-200' : 'border-maroon-100 bg-maroon-50 text-maroon-700'}`}>{slotText(s.slot, hour)}</span>
        <span className="text-[0.8125rem] whitespace-nowrap"><b className="tabular-nums">{s.count}</b> {tr('devotees')}</span>
        {s.poojaris.length > 0 && <span className="text-[0.75rem] text-gray-500 inline-flex items-center gap-1 min-w-0"><User size={13} className="shrink-0" />{s.poojaris.map((n) => personName({ name: n }, lang)).join(', ')}</span>}
        {!free && <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
          className="ml-auto btn-outline !py-1 !px-2.5 text-[0.75rem]">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{' '}{tr(open ? 'Hide names' : 'View names')}</button>}
      </div>
      {open && <div className="overflow-x-auto px-4 pb-3"><DevoteeTable devotees={s.devotees} /></div>}
    </div>
  )
}

/** The detail card of one hour: heading, total, Print, and its slots. */
function HourDetail({ b, isNext, onPrint }) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isNext ? 'border-amber-300' : 'border-gray-100'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 border-b border-gray-100 bg-gray-50/70">
        <Clock size={16} className="text-maroon-700 shrink-0" />
        <h3 className="font-serif font-semibold text-[1.0625rem] text-maroon-800">{hourLabel(b.hour)}</h3>
        {isNext && <span className="text-[0.6875rem] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200">{tr('Next')}</span>}
        <span className="ml-auto text-[0.8125rem]"><b className="tabular-nums">{b.total}</b> {tr('devotees')}</span>
        {b.total > 0 && <button type="button" onClick={() => onPrint(b)} className="btn-maroon !py-1 !px-2.5 text-[0.75rem]"><Printer size={13} />{' '}<T>Print</T></button>}
      </div>
      {b.slots.length ? b.slots.map((s) => <DetailRow key={`${s.pooja}-${s.slot}`} s={s} hour={b.hour} />)
        : <div className="px-4 py-6 text-center text-[0.8125rem] text-gray-500">{tr('No poojas booked in this hour.')}</div>}
    </div>
  )
}

function HourTilesView({ poojas }) {
  const temple = useTemple()
  const [f, setF] = useState({ day: todayIST(), pooja_id: '', all: false })
  // Chosen tile: null = automatic (the next hour today, else the first hour with poojas);
  // ALL_HOURS = every hour listed one below the other; otherwise that hour's hourKey.
  const [sel, setSel] = useState(null)
  const day = f.day
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const load = useCallback(({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setErr('') }
    return PoojarisAPI.hourly({ day, pooja_id: f.pooja_id || undefined, all_slots: f.all || undefined })
      .then(setData).catch(() => { if (!silent) setErr(tr('Could not load the hourly slots.')) })
      .finally(() => { if (!silent) setLoading(false) })
  }, [day, f.pooja_id, f.all])
  useEffect(() => { load() }, [load])
  useEffect(() => {          // today's counts stay fresh while the page is open
    if (day !== todayIST()) return undefined
    const t = setInterval(() => document.visibilityState === 'visible' && load({ silent: true }), 60000)
    return () => clearInterval(t)
  }, [day, load])

  const blocks = data?.hours || []
  const byHour = new Map(blocks.map((b) => [b.hour, b]))
  const next = nextHour(blocks, day)
  // Tiles: "All day" (temple-hours poojas) first, then one tile per hour from the earliest to
  // the latest pooja timing (at least 6 AM – 9 PM, the temple's day), then "Any time".
  const timed = [...(data?.slot_hours || []), ...blocks.map((b) => b.hour)].filter(isTimed)
  const first = Math.min(DAY_FIRST_HOUR, ...timed)
  const last = Math.max(DAY_LAST_HOUR, ...timed)
  const tiles = [
    ...(byHour.has(TEMPLE_HOUR) || (data?.slot_hours || []).includes(TEMPLE_HOUR) ? [TEMPLE_HOUR] : []),
    ...Array.from({ length: last - first + 1 }, (_, i) => first + i),
    ...(byHour.has(null) ? [null] : []),
  ]
  const busiest = Math.max(1, ...blocks.map((b) => b.total))
  const firstBooked = blocks.find((b) => b.total > 0) || blocks[0]
  const auto = next ? hourKey(next.hour) : firstBooked ? hourKey(firstBooked.hour) : ALL_HOURS
  const tileOf = new Map(tiles.map((h) => [hourKey(h), h]))
  const chosen = sel === null || (sel !== ALL_HOURS && !tileOf.has(sel)) ? auto : sel
  const shown = chosen === ALL_HOURS ? blocks
    : [byHour.get(tileOf.get(chosen)) || { hour: tileOf.get(chosen), total: 0, slots: [] }]

  const allSlots = blocks.flatMap((b) => b.slots)
  const stillToDo = allSlots.reduce((t, s) => t + s.devotees.filter((d) => !d.done).length, 0)
  const nowH = day === todayIST() ? Math.floor(nowMinutesIST() / 60) : null
  const print = (b) => { if (!printHourSheet(b, { day, temple })) setErr(tr('Allow pop-ups to print the list.')) }
  const setFilter = (x) => { setF({ ...f, ...x }); setSel(null) }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div className="w-[10rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Date</T></label>
          <DateField className="input" value={f.day} onChange={(e) => setFilter({ day: e.target.value || todayIST() })} /></div>
        <div className="w-[13rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Pooja</T></label>
          <Select className="input" value={f.pooja_id} onChange={(e) => setFilter({ pooja_id: e.target.value })}>
            <option value="">{tr('All')}</option>{(poojas || []).map((p) => <option key={p.id} value={p.id}>{tr(p.name)}</option>)}</Select></div>
        <div className="w-[13rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Hour</T></label>
          <Select className="input" value={chosen} onChange={(e) => setSel(e.target.value)}>
            <option value={ALL_HOURS}>{tr('All hours')}</option>
            {tiles.map((h) => <option key={hourKey(h)} value={hourKey(h)}>{hourLabel(h)}</option>)}</Select></div>
        <label className="inline-flex items-center gap-2 text-[0.8125rem] text-gray-700 pb-2.5 cursor-pointer" title={tr('Also list free slots of every pooja, with 0 devotees')}>
          <Checkbox checked={f.all} onChange={() => setFilter({ all: !f.all })} /><T>Show all slots</T></label>
        <button type="button" onClick={() => { setF({ day: todayIST(), pooja_id: '', all: false }); setSel(null) }} className="btn-outline !py-2.5"><RotateCcw size={14} />{' '}<T>Clear</T></button>
        <div className="ml-auto text-[0.8125rem] text-gray-600">{data ? <><b>{data.total}</b> {tr('devotees')} · {fmtDate(day)}</> : ''}</div>
      </div>

      {err && <div className="text-[0.8125rem] text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{err}</div>}
      {loading && !data && <div className="text-sm text-gray-500 px-1"><T>Loading...</T></div>}

      {data && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat value={data.total} label={tr('Devotees')} />
          <Stat value={allSlots.filter((s) => s.count > 0).length} label={tr('Pooja slots')} />
          <Stat value={stillToDo} label={tr('Still to do')} />
          <Stat value={next ? hourLabel(next.hour) : '—'} label={tr('Next hour')} />
        </div>

        <div role="group" aria-label={tr('Hour')} className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(7.25rem,1fr))]">
          {tiles.map((h) => {
            const b = byHour.get(h)
            const n = b?.total || 0
            const usable = !!b?.slots.length
            const isSel = chosen === hourKey(h)
            const isNext = next && next.hour === h
            const past = nowH !== null && isTimed(h) && h < nowH
            return (
              <button key={hourKey(h)} type="button" disabled={!usable} aria-pressed={isSel} onClick={() => setSel(hourKey(h))}
                title={h === TEMPLE_HOUR ? tr('Temple hours (6 AM – 9 PM)') : hourLabel(h)}
                className={`text-left rounded-xl border px-3 py-2 grid gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-500 focus-visible:ring-offset-1
                  ${isSel ? 'border-maroon-500 ring-2 ring-maroon-100 bg-white' : isNext ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white hover:border-maroon-300'}
                  ${!usable ? 'opacity-50 cursor-default hover:border-gray-200' : 'cursor-pointer'}`}>
                <span className={`text-[0.75rem] font-semibold leading-tight break-words ${isSel ? 'text-maroon-700' : past ? 'text-gray-400' : 'text-gray-600'}`}>{tileLabel(h)}</span>
                <span className={`font-serif text-[1.25rem] leading-none tabular-nums lining-nums ${n ? 'text-gray-900' : 'text-gray-400'}`}>{n || '–'}</span>
                <span className="h-1 rounded-full bg-gray-100 overflow-hidden">
                  <span className={`block h-full rounded-full ${isNext ? 'bg-amber-500' : 'bg-maroon-500'}`} style={{ width: n ? `${Math.max(12, (n / busiest) * 100)}%` : 0 }} /></span>
              </button>)
          })}
        </div>

        {!blocks.length
          ? <div className="bg-white rounded-xl border border-gray-100 px-4 py-8 text-center text-[0.8125rem] text-gray-500">{tr('No poojas due in this period.')}</div>
          : shown.map((b) => <HourDetail key={hourKey(b.hour)} b={b} isNext={!!next && next.hour === b.hour} onPrint={print} />)}
      </>}
    </div>
  )
}

/** The plain hour list (Pooja Queue → "By hour"). */
function HourListView({ day: fixedDay, mine = false, poojas = null, controls = false, poojariName = null }) {
  const temple = useTemple()
  const [f, setF] = useState({ day: fixedDay || todayIST(), pooja_id: '', hour: '', all: false })
  const day = controls ? f.day : (fixedDay || todayIST())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const load = useCallback(({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setErr('') }
    return PoojarisAPI.hourly({ day, mine: mine || undefined, pooja_id: (controls && f.pooja_id) || undefined,
      all_slots: (controls && f.all) || undefined })
      .then(setData).catch(() => { if (!silent) setErr(tr('Could not load the hourly slots.')) })
      .finally(() => { if (!silent) setLoading(false) })
  }, [day, mine, controls, f.pooja_id, f.all])
  useEffect(() => { load() }, [load])
  useEffect(() => {          // today's counts stay fresh while the page is open
    if (day !== todayIST()) return undefined
    const t = setInterval(() => document.visibilityState === 'visible' && load({ silent: true }), 60000)
    return () => clearInterval(t)
  }, [day, load])

  const hours = (data?.hours || []).filter((b) => !controls || f.hour === '' || String(b.hour) === f.hour)
  const next = nextHour(data?.hours, day)
  const print = (b) => { if (!printHourSheet(b, { day, temple, poojariName })) setErr(tr('Allow pop-ups to print the list.')) }
  return (
    <div className="space-y-3">
      {controls && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-end gap-3">
          <div className="w-[10rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Date</T></label>
            <DateField className="input" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value || todayIST(), hour: '' })} /></div>
          <div className="w-[13rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Pooja</T></label>
            <Select className="input" value={f.pooja_id} onChange={(e) => setF({ ...f, pooja_id: e.target.value })}>
              <option value="">{tr('All')}</option>{(poojas || []).map((p) => <option key={p.id} value={p.id}>{tr(p.name)}</option>)}</Select></div>
          <div className="w-[13rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Hour</T></label>
            <Select className="input" value={f.hour} onChange={(e) => setF({ ...f, hour: e.target.value })}>
              <option value="">{tr('All')}</option>{(data?.slot_hours || (data?.hours || []).map((b) => b.hour)).map((h) => <option key={String(h)} value={String(h)}>{hourLabel(h)}</option>)}</Select></div>
          <label className="inline-flex items-center gap-2 text-[0.8125rem] text-gray-700 pb-2.5 cursor-pointer" title={tr('Also list free slots of every pooja, with 0 devotees')}>
            <Checkbox checked={f.all} onChange={() => setF({ ...f, all: !f.all, hour: '' })} /><T>Show all slots</T></label>
          <button type="button" onClick={() => setF({ day: todayIST(), pooja_id: '', hour: '', all: false })} className="btn-outline !py-2.5"><RotateCcw size={14} />{' '}<T>Clear</T></button>
          <div className="ml-auto text-[0.8125rem] text-gray-600">{data ? <><b>{data.total}</b> {tr('devotees')} · {fmtDate(day)}</> : ''}</div>
        </div>)}
      {next && (!controls || f.hour === '') && <NextSlotBanner block={next} />}
      {err && <div className="text-[0.8125rem] text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{err}</div>}
      {loading && !data && <div className="text-sm text-gray-500 px-1"><T>Loading...</T></div>}
      {data && !hours.length && <div className="bg-white rounded-xl border border-gray-100 px-4 py-8 text-center text-[0.8125rem] text-gray-500">{controls && f.hour !== '' ? tr('No poojas booked in this hour.') : tr('No poojas due in this period.')}</div>}
      {hours.map((b) => (
        <div key={String(b.hour)} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${next && next.hour === b.hour ? 'border-amber-300' : 'border-gray-100'}`}>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50/70 border-b border-gray-100">
            <Clock size={15} className="text-maroon-700 shrink-0" />
            <span className="font-semibold text-maroon-800 flex-1">{hourLabel(b.hour)}</span>
            <span className="text-[0.8125rem]"><b>{b.total}</b> {tr('devotees')}</span>
            {b.total > 0 && <button type="button" onClick={() => print(b)} className="btn-outline !py-1 !px-2.5 text-[0.75rem]"><Printer size={13} />{' '}<T>Print</T></button>}
          </div>
          {b.slots.map((s) => <SlotRow key={`${s.pooja}-${s.slot}`} s={s} hour={b.hour} />)}
        </div>))}
    </div>
  )
}

// ── Poojari's in-app alert: 15 minutes before each hour that has their poojas ──
const seenKey = (day, h) => `slotAlert:${day}:${h}`
const wasSeen = (day, h) => { try { return localStorage.getItem(seenKey(day, h)) === '1' } catch { return false } }
const markSeen = (day, h) => { try { localStorage.setItem(seenKey(day, h), '1') } catch { /* private window */ } }

export function HourlySlotAlert() {
  const navigate = useNavigate()
  const temple = useTemple()
  const [data, setData] = useState(null)
  const [tick, setTick] = useState(0)
  const [hidden, setHidden] = useState({})
  useEffect(() => {
    const load = () => PoojarisAPI.hourly({ day: todayIST(), mine: true }).then(setData).catch(() => {})
    load()
    const poll = setInterval(() => document.visibilityState === 'visible' && load(), 5 * 60000)
    const clockTick = setInterval(() => setTick((t) => t + 1), 30000)
    return () => { clearInterval(poll); clearInterval(clockTick) }
  }, [])
  const day = todayIST()
  if (!data || data.day !== day) return null
  const now = nowMinutesIST()
  const block = data.hours.find((b) => isTimed(b.hour) && now >= b.hour * 60 - ALERT_LEAD_MIN && now < (b.hour + 1) * 60
    && !hidden[b.hour] && !wasSeen(day, b.hour))
  if (!block) return null          // `tick` re-renders this every 30 s, so the alert appears on time
  const close = () => { markSeen(day, block.hour); setHidden((x) => ({ ...x, [block.hour]: true })) }
  return (
    <div role="alert" className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] bg-white rounded-xl shadow-2xl border border-amber-300 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200">
        <BellRing size={16} className="text-amber-600" />
        <b className="flex-1 text-amber-900 text-[0.875rem]">{tr('Next hour')}: {hourLabel(block.hour)}</b>
        <button onClick={close} aria-label={tr('Close')} className="text-gray-400 hover:text-maroon-700"><X size={16} /></button>
      </div>
      <div className="px-4 py-3 space-y-1 text-[0.875rem]">
        {block.slots.map((s) => (
          <div key={`${s.pooja}-${s.slot}`} className="flex justify-between gap-3"><span className="font-semibold text-gray-800">{tr(s.pooja)}</span>
            <span className="whitespace-nowrap">{slotText(s.slot, block.hour)} · <b>{s.count}</b> {tr('devotees')}</span></div>))}
      </div>
      <div className="px-4 pb-3 flex gap-2">
        <button onClick={() => { close(); navigate('/admin/my-poojas') }} className="btn-maroon flex-1 justify-center !py-2"><T>View list</T></button>
        <button onClick={() => printHourSheet(block, { day, temple, poojariName: data.poojari_name })} className="btn-outline flex-1 justify-center !py-2"><Printer size={14} />{' '}<T>Print</T></button>
      </div>
    </div>
  )
}
