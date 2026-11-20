import React, { useEffect, useState, useCallback, useRef } from 'react'
import { FilterPanel } from '../../components/admin/ui.jsx'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search, Ban, CheckCircle2, ChevronLeft, ChevronRight, CalendarClock, CalendarPlus, Users, X,
  SlidersHorizontal, ArrowDown, ArrowUp, Phone,
} from 'lucide-react'
import { BookingsAPI, PoojasAPI, PoojarisAPI } from '../../api/client.js'
import { TableStates, LOAD_ERROR } from '../../components/common/states.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { canAccessKey, isAdminRole } from '../../auth/access.js'
import { Select, DateField, Checkbox } from '../../components/common/Field.jsx'
import { confirmDialog, promptDialog, toast } from '../../components/common/Dialog.jsx'
import { T, tr, clock12, personName, useLang, stamp, teTerm } from '../../i18n/LanguageContext.jsx'
import { useFilterParams } from '../../hooks/useUrlState.js'
import { HourlySlotsView } from '../../components/admin/HourlySlots.jsx'
import { halfLabel, todayIST } from '../../lib/halfSlots.js'
import { isTempleHours } from '../../lib/slots.js'
import { statusChip } from '../../lib/bookingStatus.js'

// Bookings → "All bookings" (client review 2026-11-14): one toolbar — all dates by default or a
// From–To range, search, pooja, "More filters" (time slot, plan, payment) and Apply Filters
// (client: nothing reloads until Apply, so a big list does not reload on every pick) — status tabs with counts
// and the amount collected, and a table that fits without sideways scrolling (cards on a phone).
// A row opens the booking; Reschedule and Cancel stay visible; "Assign poojari" turns on the
// checkboxes for bulk assignment. View-only roles (Accountant) get the list without actions.

const SIZE = 20

// Page-number list with ellipsis, e.g. 1 … 4 5 [6] 7 8 … 12
function pagesFor(page, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const out = [1]
  const lo = Math.max(2, page - 1), hi = Math.min(count - 1, page + 1)
  if (lo > 2) out.push('…')
  for (let i = lo; i <= hi; i++) out.push(i)
  if (hi < count - 1) out.push('…')
  out.push(count)
  return out
}

// Plan badge colour by kind, so every plan the master can hold is coloured
const planTone = (name) => {
  const n = (name || '').toLowerCase()
  if (!n) return 'bg-gray-100 text-gray-500'
  if (n.includes('life')) return 'bg-amber-50 text-amber-700'
  if (n.includes('year')) return 'bg-indigo-50 text-indigo-700'
  if (n.includes('month')) return 'bg-blue-50 text-blue-700'
  if (n === 'daily') return 'bg-emerald-50 text-emerald-700'
  const days = /^(\d+)-day$/.exec(n)
  if (days && Number(days[1]) > 1) return 'bg-rose-50 text-rose-700'
  return 'bg-violet-50 text-violet-700'   // One-Time, 1-Day
}
// A booking's slot as shown: "05:30 PM", "09:00 AM - 11:30 AM", or "All day" for temple hours
const slotName = (sl) => (isTempleHours(sl) ? tr('All day') : clock12(sl))
const fmtDay = (d, withYear = true) => (d
  ? stamp(new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }))
  : '—')
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')

/** A multi-day plan's window: "until 11 Dec · 0/1 done", "Life long · 12 done"; null for one day. */
function validity(b) {
  const allowed = b.performances_allowed, done = b.performances_done || 0
  const longer = b.valid_until && b.valid_until !== b.scheduled_date
  if (!longer && !(allowed > 1) && !(allowed == null && /life/i.test(b.plan_name || ''))) return null
  const until = b.valid_until ? tr('until {date}').replace('{date}', fmtDay(b.valid_until, false)) : tr('Life long')
  return `${until} · ${allowed ? `${done}/${allowed}` : done} ${tr('done')}`
}

const STATUS_TABS = [['', 'All'], ['Confirmed', 'Confirmed'], ['Completed', 'Completed'], ['Cancelled', 'Cancelled'], ['Pending', 'Pending']]

export default function Bookings() {
  const { lang } = useLang()
  const { user } = useAuth()
  const nav = useNavigate()
  const location = useLocation()
  const isAdmin = isAdminRole(user)
  // Counter Staff and Administrator run the list; the Accountant only views it (backend enforces too).
  const canOperate = isAdmin || user?.role === 'Counter Staff'
  const canBook = canAccessKey(user, 'bookings/new')
  const [params, setParams] = useSearchParams()
  const hourly = params.get('view') === 'hourly'
  const setView = (v) => setParams((p) => { const n = new URLSearchParams(p); if (v === 'hourly') n.set('view', 'hourly'); else n.delete('view'); return n }, { replace: true })

  // Filters live in the URL (survive opening a booking and coming back). No start/end = every
  // date. by=booked: start/end are the booking date (the Dashboard's "Pooja Bookings" tile),
  // otherwise the pooja date. ts = time slot filter ("p:06:30" half-hour list, "s:05:30 PM" exact time).
  const f = useFilterParams({ q: '', pooja: '', plan: '', status: '', payment: '', start: '', end: '', by: '', ts: '', sort: '', page: 1 })
  const set = (x) => f.setFilters({ ...x, page: 1 })
  const today = todayIST()
  const start = f.start, end = f.end
  const allDates = !start && !end
  const oneDay = !!start && start === end
  // Default order: a dated view by pooja time (the counter's day), every date by newest booking
  const sort = f.sort || (allDates ? 'booked_desc' : 'time_asc')

  // Search, dates, pooja and More filters are a draft until "Apply Filters" (or Enter in search).
  // Status tabs, sorting and pages still apply at once — they only switch the view.
  const DRAFT_KEYS = ['q', 'start', 'end', 'pooja', 'ts', 'plan', 'payment']
  const applied = Object.fromEntries(DRAFT_KEYS.map((k) => [k, f[k] || '']))
  const [draft, setDraft] = useState(applied)
  const appliedKey = JSON.stringify(applied)
  useEffect(() => { setDraft(JSON.parse(appliedKey)) }, [appliedKey])   // Back, Clear, Dashboard links
  const edit = (x) => setDraft((d) => ({ ...d, ...x }))
  const pending = DRAFT_KEYS.filter((k) => (k === 'q' ? draft.q.trim() : draft[k]) !== applied[k]).length
  const apply = () => set({ ...draft, q: draft.q.trim() })
  const anyFilter = DRAFT_KEYS.some((k) => applied[k] || draft[k]) || !!f.by
  const clearAll = () => set(Object.fromEntries([...DRAFT_KEYS, 'by', 'status'].map((k) => [k, ''])))

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(null)
  const [poojas, setPoojas] = useState([])
  const [poojaris, setPoojaris] = useState([])
  const [slotOptions, setSlotOptions] = useState([])
  const [halfOptions, setHalfOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [more, setMore] = useState(false)
  const moreRef = useRef(null)
  // Bulk poojari assignment: checkboxes only while "Assign poojari" is on
  const [assignMode, setAssignMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [bulkPoojari, setBulkPoojari] = useState('')
  const [assigning, setAssigning] = useState(false)

  const [sortKey, sortDir] = { time_asc: ['scheduled_date', 'asc'], time_desc: ['scheduled_date', 'desc'], booked_desc: ['created_at', 'desc'],
    booked_asc: ['created_at', 'asc'], amount_desc: ['amount', 'desc'], amount_asc: ['amount', 'asc'] }[sort] || ['created_at', 'desc']
  const loadList = useCallback(async () => {
    setLoading(true); setLoadErr('')
    try {
      const d = await BookingsAPI.list({ q: f.q, pooja: f.pooja, plan: f.plan, status: f.status, payment: f.payment,
        start: start || undefined, end: end || undefined, by: f.by || undefined, page: f.page, size: SIZE, sort_by: sortKey, sort_dir: sortDir,
        half: f.ts.startsWith('p:') ? f.ts.slice(2) : undefined, slot: f.ts.startsWith('s:') ? f.ts.slice(2) : undefined })
      setRows(d.items); setTotal(d.total); setSummary(d.summary || null)
    } catch (ex) {
      setLoadErr(ex?.detail || LOAD_ERROR); setRows([]); setTotal(0); setSummary(null)
    } finally { setLoading(false) }
  }, [f.q, f.pooja, f.plan, f.status, f.payment, start, end, f.by, f.page, sortKey, sortDir, f.ts])
  useEffect(() => { if (!hourly) { loadList(); setSelected(new Set()) } }, [loadList, hourly])

  useEffect(() => {
    PoojasAPI.list().then((d) => setPoojas(d.items)).catch(() => toast(tr('Failed to load poojas'), 'error'))
    if (canOperate) PoojarisAPI.list().then((d) => setPoojaris((Array.isArray(d) ? d : d?.items || []).filter((p) => p.active))).catch(() => {})
  }, [canOperate])
  // Time Slot options come from the Pooja Master (live) — the half-hour lists and every exact time
  useEffect(() => {
    BookingsAPI.slotOptions(draft.pooja ? { pooja: draft.pooja } : {}).then((d) => { setSlotOptions(d.hours || []); setHalfOptions(d.halves || []) })
      .catch(() => { setSlotOptions([]); setHalfOptions([]) })
  }, [draft.pooja])
  // "More filters" closes on a click outside it or Escape
  useEffect(() => {
    if (!more) return undefined
    const away = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMore(false) }
    const esc = (e) => { if (e.key === 'Escape') setMore(false) }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [more])

  const open = (b) => nav(`/admin/bookings/${b.id}`, { state: { back: location.search } })
  const toggleSelect = (id) => setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const stopAssign = () => { setAssignMode(false); setSelected(new Set()); setBulkPoojari('') }

  async function assignPoojari() {
    if (selected.size === 0 || !bulkPoojari) return
    setAssigning(true)
    try {
      const res = await PoojarisAPI.assignBulk([...selected], Number(bulkPoojari))
      toast(tr('${count} booking(s) assigned to ${name}.').replace('${count}', res.assigned).replace('${name}', res.poojari_name ? personName({ name: res.poojari_name }, lang) : tr('poojari')))
      stopAssign()
      loadList()
    } catch (ex) {
      toast(ex.detail || tr('Could not assign poojari.'), 'error')
    } finally {
      setAssigning(false)
    }
  }
  async function cancel(b) {
    const paid = b.payment_status === 'Paid' && Number(b.amount) > 0
    // Suggest a prorated refund when part of a finite quota is already consumed.
    const allowed = b.performances_allowed, done = b.performances_done || 0
    const suggested = allowed && done > 0 ? Math.round(Number(b.amount) * (allowed - done) / allowed) : Number(b.amount)
    const res = await promptDialog({
      title: `${tr('Cancel booking')} ${b.ticket_no || b.booking_code}?`,
      tone: 'danger', confirmLabel: tr('Cancel Booking'), cancelLabel: tr('Keep Booking'),
      fields: [
        { k: 'reason', label: tr('Reason'), required: true, placeholder: tr('Why is this booking being cancelled?') },
        ...(paid ? [{ k: 'refund', label: tr('Refund amount (₹)'), type: 'number', defaultValue: String(suggested),
          note: allowed && done > 0 ? `${tr('Prorated')} — ${done}/${allowed} ${tr('already performed')}.` : tr('Full paid amount suggested.') }] : []),
      ],
    })
    if (!res) return
    const refund_amount = paid ? (Number(res.refund) || 0) : undefined
    try { await BookingsAPI.cancel(b.id, { reason: res.reason.trim(), refund_amount }); toast(tr('Booking cancelled.')); loadList() }
    catch (ex) { toast(ex.detail || tr('Could not cancel this booking.'), 'error') }
  }
  const canReschedule = (b) => canOperate && b.status === 'Confirmed' && b.payment_status === 'Paid' && !(b.performances_done > 0)
  async function reschedule(b) {
    const res = await promptDialog({
      title: `${tr('Reschedule')} ${b.ticket_no || b.booking_code}`,
      fields: [{ k: 'date', label: tr('New date'), type: 'date', required: true, defaultValue: b.scheduled_date || '', min: today }],
      confirmLabel: tr('Reschedule'),
    })
    if (!res) return
    try { await BookingsAPI.reschedule(b.id, { scheduled_date: res.date }); toast(tr('Booking rescheduled.')); loadList() }
    catch (ex) { toast(ex.detail || tr('Could not reschedule this booking.'), 'error') }
  }
  async function complete(b) {
    if (!(await confirmDialog({ title: `${tr('Mark performed')} — ${b.ticket_no || b.booking_code}?`, message: tr('It will move to Pooja History.') }))) return
    try { await BookingsAPI.complete(b.id); toast(tr('Performance recorded.')); loadList() }
    catch (ex) { toast(ex.detail || tr('Could not complete this booking.'), 'error') }
  }

  const planOptions = [...new Set((poojas || []).flatMap((p) => (p.plans || []).map((pl) => pl.plan_name)))]
  const moreCount = [draft.ts, draft.plan, draft.payment].filter(Boolean).length
  const pageCount = Math.max(1, Math.ceil(total / SIZE))
  const from = total === 0 ? 0 : (f.page - 1) * SIZE + 1
  const to = Math.min(f.page * SIZE, total)
  const counts = summary?.by_status || {}
  const sortBtn = (asc, desc, label) => {
    const on = sort === asc || sort === desc
    return (
      <button type="button" onClick={() => set({ sort: sort === asc ? desc : asc })} className={`inline-flex items-center gap-1 uppercase tracking-wide ${on ? 'text-maroon-700' : ''}`}>
        {tr(label)}{on && (sort === asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}</button>)
  }

  // ── Row pieces shared by the table and the phone cards ──
  const devoteeCell = (b) => (
    <>
      <div className="font-semibold text-gray-800 truncate">{personName({ name: b.devotee_name, name_te: b.devotee_name_te }, lang)}</div>
      {b.mobile && <div className="text-[0.75rem] text-gray-500 tabular-nums inline-flex items-center gap-1"><Phone size={10} />{b.mobile}</div>}
    </>)
  const poojaCell = (b) => {
    const v = validity(b)
    return (
      <>
        <div className="font-medium text-gray-800 leading-snug">{tr(b.seva_name)}
          {b.plan_name && <span className={`ml-1.5 align-middle inline-flex px-2 py-px rounded-full text-[0.625rem] font-semibold whitespace-nowrap ${planTone(b.plan_name)}`}>{tr(b.plan_name)}</span>}</div>
        {v && <div className="text-[0.6875rem] text-gray-500">{v}</div>}
      </>)
  }
  const timeCell = (b) => (
    <>
      {!oneDay && <div className="text-gray-700 whitespace-nowrap">{fmtDay(b.scheduled_date)}</div>}
      <div className={oneDay ? 'font-semibold text-maroon-700' : 'text-[0.75rem] text-gray-600'}>{b.time_slot ? slotName(b.time_slot) : '—'}</div>
      {b.batch_slot && <div className="text-[0.6875rem] text-gray-500">{tr('Pooja slot')}: {halfLabel(b.batch_slot)}</div>}
    </>)
  const amountCell = (b) => (
    <>
      <div className="font-semibold text-gray-800 tabular-nums whitespace-nowrap">{inr(b.amount)}</div>
      {b.payment_status === 'Paid'
        ? <div className="text-[0.6875rem] text-gray-500">{tr(b.payment_method || 'Paid')}</div>
        : <div className="text-[0.6875rem] font-semibold text-red-700">{tr(b.payment_status === 'Failed' ? 'Payment failed' : 'Not paid')}</div>}
    </>)
  const statusBadge = (b) => <span className={`inline-flex px-2.5 py-0.5 rounded-full border text-[0.6875rem] font-semibold whitespace-nowrap ${statusChip(b.status)}`}>{tr(b.status)}</span>
  const actions = (b) => (
    <div className="flex flex-wrap items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      {canOperate && b.status === 'Confirmed' && b.payment_status === 'Paid' && (
        <button type="button" onClick={() => complete(b)} title={tr('Mark performed')} aria-label={`${tr('Mark performed')} ${b.ticket_no || b.booking_code}`}
          className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300"><CheckCircle2 size={15} /></button>)}
      {canReschedule(b) && (
        <button type="button" onClick={() => reschedule(b)} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-gray-200 text-[0.75rem] font-semibold text-blue-700 hover:bg-blue-50 hover:border-blue-300 whitespace-nowrap">
          <CalendarClock size={14} />{tr('Reschedule')}</button>)}
      {isAdmin && b.status !== 'Cancelled' && (
        <button type="button" onClick={() => cancel(b)} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-gray-200 text-[0.75rem] font-semibold text-red-700 hover:bg-red-50 hover:border-red-300 whitespace-nowrap">
          <Ban size={14} />{tr('Cancel')}</button>)}
    </div>)
  const hasActions = canOperate && !assignMode   // hidden while ticking bookings to assign

  return (
    <div>
      {/* Header: title · view tabs · Advance Booking on one row (wraps on a phone) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mb-4">
        <div className="mr-auto">
          <h1 className="font-serif text-2xl font-bold text-maroon-700"><T>Pooja Management</T></h1>
          <p className="text-sm text-gray-500 mt-1"><T>Manage pooja bookings and related operations.</T></p>
        </div>
        <div role="tablist" className="order-last sm:order-none inline-flex rounded-lg border border-gray-200 bg-white p-1 text-[0.8125rem] font-semibold">
          {[['list', 'All bookings'], ['hourly', 'Half-hour slots']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={(k === 'hourly') === hourly} onClick={() => setView(k)}
              className={`px-3.5 py-1.5 rounded-md whitespace-nowrap ${(k === 'hourly') === hourly ? 'bg-maroon-700 text-white' : 'text-gray-600 hover:text-maroon-700'}`}>{tr(l)}</button>))}
        </div>
        {canBook && <Link to="/admin/bookings/new" className="btn-maroon !py-2.5"><CalendarPlus size={16} />{' '}<T>Advance Booking</T></Link>}
      </div>

      {hourly ? <HourlySlotsView controls poojas={poojas} /> : <>

      {/* Toolbar: date · search · pooja · more filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 mb-3 space-y-3">
        <FilterPanel active={DRAFT_KEYS.filter((k) => applied[k]).length} className="-mx-4 -my-3 md:m-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5" role="group" aria-label={tr('Pooja date')}>
            <div className="w-[9.25rem]"><DateField className="input !py-1.5" aria-label={tr('From')} placeholder={tr('From')} value={draft.start}
              onChange={(e) => edit({ start: e.target.value, end: draft.end && e.target.value > draft.end ? e.target.value : draft.end })} /></div>
            <span className="text-gray-400 text-sm">–</span>
            <div className="w-[9.25rem]"><DateField className="input !py-1.5" aria-label={tr('To')} placeholder={tr('To')} value={draft.end} min={draft.start}
              onChange={(e) => edit({ end: e.target.value })} /></div>
          </div>
          <div className="relative w-full sm:w-[13rem]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input value={draft.q} onChange={(e) => edit({ q: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && apply()}
              placeholder={tr('Name, mobile or ticket')} title={tr('Search devotee, mobile, ticket or pooja')} aria-label={tr('Search bookings')} className={`input !py-1.5 !pl-9 ${draft.q ? '!pr-7' : '!pr-2'}`} />
            {draft.q && <button type="button" onClick={() => edit({ q: '' })} aria-label={tr('Clear')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-maroon-700"><X size={15} /></button>}
          </div>
          <div className="w-[11rem]"><Select className="input !py-1.5" aria-label={tr('Pooja')} value={draft.pooja} onChange={(e) => edit({ pooja: e.target.value, ts: '' })}>
            <option value="">{tr('All poojas')}</option>
            {poojas.map((p) => <option key={p.id} value={p.name}>{teTerm(p.name)}</option>)}</Select></div>
          <div className="relative" ref={moreRef}>
            <button type="button" onClick={() => setMore(!more)} aria-expanded={more}
              className={`btn-outline !py-1.5 ${moreCount ? '!border-maroon-400 !text-maroon-700' : ''}`}>
              <SlidersHorizontal size={14} />{' '}{tr('More filters')}{moreCount > 0 && <span className="ml-1 rounded-full bg-maroon-700 text-cream text-[0.625rem] px-1.5">{moreCount}</span>}</button>
            {more && (
              <div className="absolute right-0 z-30 mt-1.5 w-[17rem] bg-white rounded-xl border border-gray-200 shadow-xl p-3 space-y-2.5">
                <label className="block text-[0.75rem] text-gray-500"><T>Time Slot</T>
                  <Select className="input !py-1.5 mt-1" value={draft.ts} onChange={(e) => edit({ ts: e.target.value })}>
                    <option value="">{tr('All Slots')}</option>
                    {halfOptions.length > 0 && <optgroup label={tr('Pooja slot (half-hour list)')}>
                      {halfOptions.map((h) => <option key={h} value={`p:${h}`}>{halfLabel(h)}</option>)}</optgroup>}
                    {slotOptions.length > 0 && <optgroup label={tr('Pooja time')}>
                      {[...new Set(slotOptions.flatMap((h) => h.slots))].map((sl) => <option key={sl} value={`s:${sl}`}>{slotName(sl)}</option>)}</optgroup>}
                  </Select></label>
                <label className="block text-[0.75rem] text-gray-500"><T>Plan</T>
                  <Select className="input !py-1.5 mt-1" value={draft.plan} onChange={(e) => edit({ plan: e.target.value })}>
                    <option value="">{tr('All Plans')}</option>{planOptions.map((p) => <option key={p} value={p}>{tr(p)}</option>)}</Select></label>
                <label className="block text-[0.75rem] text-gray-500"><T>Payment Status</T>
                  <Select className="input !py-1.5 mt-1" value={draft.payment} onChange={(e) => edit({ payment: e.target.value })}>
                    <option value="">{tr('All Payments')}</option>
                    <option value="Paid">{tr('Paid')}</option><option value="Pending">{tr('Pending')}</option><option value="Failed">{tr('Failed')}</option></Select></label>
                {moreCount > 0 && <button type="button" onClick={() => edit({ ts: '', plan: '', payment: '' })} className="text-[0.8125rem] font-semibold text-maroon-700 hover:underline"><T>Clear these filters</T></button>}
              </div>)}
          </div>
          <button type="button" onClick={() => { setMore(false); apply() }} disabled={!pending}
            className={`btn-maroon !py-1.5 ${pending ? '' : 'opacity-50 cursor-default'}`}>
            {tr('Apply Filters')}{pending > 0 && <span className="ml-1 rounded-full bg-cream text-maroon-700 text-[0.625rem] px-1.5 tabular-nums">{pending}</span>}</button>
          {anyFilter && <button type="button" onClick={clearAll} className="text-[0.8125rem] font-semibold text-maroon-700 hover:underline whitespace-nowrap">{tr('Clear filters')}</button>}
        </div>
        </FilterPanel>
        {f.by === 'booked' && (
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-[0.75rem] font-semibold pl-3 pr-1 py-0.5">
            {tr('Dates are when the booking was made (from the Dashboard)')}
            <button type="button" onClick={() => set({ by: '' })} aria-label={tr('Clear')} className="rounded-full p-0.5 hover:bg-blue-100"><X size={13} /></button></div>)}
        {/* Status tabs with counts · amount collected */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-100 pt-2.5">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label={tr('Status')}>
            {STATUS_TABS.filter(([k]) => !k || k === 'Confirmed' || k === 'Completed' || counts[k] > 0 || f.status === k).map(([k, l]) => {
              const n = k ? (counts[k] || 0) : (summary?.all ?? 0)
              const on = f.status === k
              return (
                <button key={k || 'all'} type="button" role="tab" aria-selected={on} onClick={() => set({ status: k })}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.75rem] font-semibold border transition-colors
                    ${on ? 'bg-maroon-700 border-maroon-700 text-cream' : k ? `${statusChip(k)} hover:brightness-95` : 'bg-white border-gray-200 text-gray-700 hover:border-maroon-300'}`}>
                  {tr(l)} <span className="tabular-nums">{n}</span></button>)
            })}
          </div>
          <span className="sm:ml-auto text-[0.8125rem] text-gray-600">{tr('Collected')} <b className="tabular-nums text-gray-900">{inr(summary?.collected)}</b>
            <span className="text-gray-400"> · {allDates ? tr('All dates') : oneDay ? fmtDay(start)
              : !end ? `${tr('From')} ${fmtDay(start)}` : !start ? `${tr('To')} ${fmtDay(end)}` : `${fmtDay(start)} – ${fmtDay(end)}`}</span></span>
          {canOperate && !assignMode && rows.length > 0 && (
            <button type="button" onClick={() => setAssignMode(true)} className="text-[0.8125rem] font-semibold text-maroon-700 hover:underline inline-flex items-center gap-1"><Users size={14} />{tr('Assign poojari')}</button>)}
        </div>
      </div>

      {/* Bulk assignment bar */}
      {assignMode && (
        <div className="bg-maroon-50 border border-maroon-200 rounded-xl px-4 py-2.5 mb-3 flex flex-wrap items-center gap-3">
          <span className="text-[0.8125rem] font-semibold text-maroon-700">{tr('Tick the bookings to assign')} · {selected.size} {tr(selected.size === 1 ? 'booking selected' : 'bookings selected')}</span>
          <Select value={bulkPoojari} onChange={(e) => setBulkPoojari(e.target.value)} className="input !w-auto !py-1.5 text-[0.8125rem]">
            <option value="">{tr('Select Poojari…')}</option>
            {poojaris.map((p) => <option key={p.id} value={p.id}>{personName(p, lang)}{p.specialization ? ` · ${tr(p.specialization)}` : ''}</option>)}
          </Select>
          <button onClick={assignPoojari} disabled={!bulkPoojari || !selected.size || assigning} className="btn-maroon !py-1.5 !text-[0.8125rem] disabled:opacity-50">
            {assigning ? tr('Assigning…') : tr('Assign Poojari')}</button>
          <button onClick={stopAssign} className="ml-auto text-[0.8125rem] text-maroon-700 hover:underline inline-flex items-center gap-1"><X size={14} />{tr('Done')}</button>
        </div>)}

      {/* Table (wide screens). Widths are in rem, so they grow with A+; min width keeps the Pooja
          column readable — below it the table scrolls inside its box instead of overlapping. */}
      <div className="hidden xl:block bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm table-fixed">
          <thead>
            <tr className="text-left text-[0.6875rem] uppercase tracking-wide text-gray-600 bg-gray-50 border-b border-gray-100 [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-semibold">
              {assignMode && <th className="w-10"><Checkbox checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} /></th>}
              <th className="w-[12rem]">{tr('Ticket')} · {tr('Devotee')}</th>
              <th>{tr('Pooja')}</th>
              <th className="w-[11rem] 2xl:w-[13rem]">{sortBtn('time_asc', 'time_desc', oneDay ? 'Time' : 'Date & time')}</th>
              <th className="w-[6.75rem]">{sortBtn('amount_desc', 'amount_asc', 'Amount')}</th>
              <th className="w-[8rem]">{tr('Status')}</th>
              {hasActions && <th className={`w-[9rem] ${isAdmin ? '2xl:w-[17.5rem]' : '2xl:w-[11rem]'}`}><span className="sr-only">{tr('Actions')}</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((b) => (
              <tr key={b.id} onClick={() => (assignMode ? toggleSelect(b.id) : open(b))}
                className={`cursor-pointer align-top [&>td]:px-3 [&>td]:py-2.5 ${selected.has(b.id) ? 'bg-maroon-50/50' : 'hover:bg-amber-50/40'}`}>
                {assignMode && <td onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(b.id)} onChange={() => toggleSelect(b.id)} /></td>}
                <td className="min-w-0">
                  <Link to={`/admin/bookings/${b.id}`} state={{ back: location.search }} onClick={(e) => e.stopPropagation()} title={b.booking_code}
                    className="font-mono text-[0.75rem] font-semibold text-maroon-700 hover:underline whitespace-nowrap">{b.ticket_no || b.booking_code}</Link>
                  {devoteeCell(b)}
                </td>
                <td>{poojaCell(b)}</td>
                <td className="text-[0.8125rem]">{timeCell(b)}</td>
                <td>{amountCell(b)}</td>
                <td>{statusBadge(b)}</td>
                {hasActions && <td>{actions(b)}</td>}
              </tr>))}
            {rows.length === 0 && <TableStates colSpan={5 + (hasActions ? 1 : 0) + (assignMode ? 1 : 0)} loading={loading} error={loadErr} onRetry={loadList} empty={tr('No bookings found.')} />}
          </tbody>
        </table>
      </div>

      {/* Cards (phone, tablet, laptop with large text) — two per row when there is room */}
      <div className="xl:hidden grid gap-2 md:grid-cols-2">
        {rows.map((b) => (
          <div key={b.id} onClick={() => (assignMode ? toggleSelect(b.id) : open(b))}
            className={`bg-white rounded-xl border shadow-sm p-3 space-y-2 cursor-pointer ${selected.has(b.id) ? 'border-maroon-400 bg-maroon-50/40' : 'border-gray-100'}`}>
            <div className="flex items-center gap-2">
              {assignMode && <span onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(b.id)} onChange={() => toggleSelect(b.id)} /></span>}
              <span className="font-mono text-[0.75rem] font-semibold text-maroon-700">{b.ticket_no || b.booking_code}</span>
              <span className="ml-auto">{statusBadge(b)}</span>
            </div>
            <div className="text-[0.875rem]">{poojaCell(b)}</div>
            <div className="flex items-start gap-3 text-[0.8125rem]">
              <div className="min-w-0 flex-1">{devoteeCell(b)}</div>
              <div className="text-right">{amountCell(b)}</div>
            </div>
            <div className="text-[0.8125rem]">{timeCell(b)}</div>
            {hasActions && !assignMode && actions(b)}
          </div>))}
        {rows.length === 0 && (
          <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 px-4 py-8 text-center text-[0.8125rem] text-gray-500">
            {loading ? tr('Loading…') : loadErr ? <>{tr(loadErr)} <button onClick={loadList} className="font-semibold text-maroon-700 underline">{tr('Retry')}</button></> : tr('No bookings found.')}</div>)}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[0.8125rem] text-gray-500">{tr('Showing')} {from} {tr('to')} {to} {tr('of')} {total} {tr('bookings')}</div>
          {pageCount > 1 && (
            <nav className="flex items-center gap-1.5" aria-label={tr('Pagination')}>
              <button disabled={f.page <= 1} onClick={() => f.setPage(f.page - 1)} aria-label={tr('Previous page')} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 bg-white text-gray-500 disabled:opacity-40 hover:border-maroon-300"><ChevronLeft size={14} /></button>
              {pagesFor(f.page, pageCount).map((n, i) => n === '…'
                ? <span key={`e${i}`} className="px-1 text-gray-400" aria-hidden="true">…</span>
                : <button key={n} onClick={() => f.setPage(n)} aria-label={`${tr('Page')} ${n}`} aria-current={n === f.page ? 'page' : undefined}
                    className={`w-8 h-8 grid place-items-center rounded-lg text-[0.8125rem] font-semibold ${n === f.page ? 'bg-maroon-700 text-cream' : 'border border-gray-200 bg-white text-gray-600 hover:border-maroon-300'}`}>{n}</button>)}
              <button disabled={f.page >= pageCount} onClick={() => f.setPage(f.page + 1)} aria-label={tr('Next page')} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 bg-white text-gray-500 disabled:opacity-40 hover:border-maroon-300"><ChevronRight size={14} /></button>
            </nav>)}
        </div>)}

      </>}
    </div>
  )
}
