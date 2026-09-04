import React, { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search, Eye, Ticket, RotateCcw, SlidersHorizontal, Ban, CheckCircle2,
  ChevronLeft, ChevronRight, CalendarClock, CalendarPlus, Users, X,
  ArrowUp, ArrowDown,
} from 'lucide-react'
import { useSortableTable, SortPanel } from '../../components/common/SortableTable.jsx'
import { BookingsAPI, PoojasAPI, PoojarisAPI } from '../../api/client.js'
import { TableStates, LOAD_ERROR } from '../../components/common/states.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Select, DateField, Checkbox } from '../../components/common/Field.jsx'
import { confirmDialog, promptDialog, toast } from '../../components/common/Dialog.jsx'
import { T, tr, clock12, personName, useLang, stamp } from '../../i18n/LanguageContext.jsx'

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

const PLAN_TONE = {
  Daily: 'bg-emerald-50 text-emerald-700', Monthly: 'bg-blue-50 text-blue-700',
  'One-Time': 'bg-violet-50 text-violet-700', 'Life Long': 'bg-amber-50 text-amber-700',
}
const STATUS_TONE = {
  Confirmed: 'bg-emerald-50 text-emerald-700', Pending: 'bg-amber-50 text-amber-700',
  Cancelled: 'bg-red-50 text-red-700', Completed: 'bg-blue-50 text-blue-700',
}
const fmtDT = (d, slot) => (d
  ? `${stamp(new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))}`
    + (slot ? ', ' + clock12(slot) : '')
  : '—')
const fmtStamp = (s) => (s ? stamp(new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })) : '—')

export default function Bookings() {
  const { lang } = useLang()
  const { user } = useAuth()
  const nav = useNavigate()
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)
  // Operational roles that run/perform poojas may mark them completed (backend enforces too).
  const canOperate = isAdmin || ['Counter Staff', 'Poojari'].includes(user?.role)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [poojas, setPoojas] = useState([])
  // filters
  const SIZE = 10
  const [q, setQ] = useState('')
  const [pooja, setPooja] = useState('')
  const [plan, setPlan] = useState('')
  const [status, setStatus] = useState('')
  const [payment, setPayment] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [page, setPage] = useState(1)
  const [applied, setApplied] = useState({ q: '', pooja: '', plan: '', status: '', payment: '', start: '', end: '' })
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  // Multi-select for bulk poojari assignment
  const [selected, setSelected] = useState(new Set())
  const [poojaris, setPoojaris] = useState([])
  const [bulkPoojari, setBulkPoojari] = useState('')
  const [assigning, setAssigning] = useState(false)

  // Sortable table columns
  const sortColumns = [
    { key: 'booking_code', label: 'Booking ID', type: 'text' },
    { key: 'seva_name', label: 'Pooja Name', type: 'text' },
    { key: 'devotee_name', label: 'Devotee Name', type: 'text' },
    { key: 'plan_name', label: 'Plan', type: 'text' },
    { key: 'scheduled_date', label: 'Date & Time', type: 'date' },
    { key: 'amount', label: 'Amount (₹)', type: 'money' },
    { key: 'status', label: 'Status', type: 'text' },
    { key: 'ticket_no', label: 'Ticket No.', type: 'text' },
    { key: 'created_at', label: 'Booked On', type: 'date' },
  ]
  const { sortedRows, sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection } = useSortableTable(rows, sortColumns, [{ key: 'scheduled_date', direction: 'desc' }])

  const loadList = useCallback(async (f, pg) => {
    setLoading(true); setLoadErr('')
    try {
      const d = await BookingsAPI.list({ ...f, page: pg, size: SIZE })
      setRows(d.items); setTotal(d.total)
    } catch (ex) {
      setLoadErr(ex?.detail || LOAD_ERROR); setRows([]); setTotal(0)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    PoojasAPI.list().then((d) => setPoojas(d.items)).catch(() => {})
    PoojarisAPI.list().then((d) => setPoojaris((Array.isArray(d) ? d : d?.items || []).filter((p) => p.active))).catch(() => {})
  }, [])
  useEffect(() => { loadList(applied, page); setSelected(new Set()) }, [applied, page, loadList])

  // Selection helpers
  const toggleSelect = (id) => setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const selectAll = () => setSelected(new Set(rows.map((r) => r.id)))
  const deselectAll = () => setSelected(new Set())
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))

  // Bulk poojari assignment
  async function assignPoojari() {
    if (selected.size === 0 || !bulkPoojari) return
    setAssigning(true)
    try {
      const res = await PoojarisAPI.assignBulk([...selected], Number(bulkPoojari))
      toast(`${res.assigned} booking(s) assigned to ${res.poojari_name || 'poojari'}.`)
      setSelected(new Set())
      setBulkPoojari('')
      loadList(applied, page)
    } catch (ex) {
      toast(ex.detail || 'Could not assign poojari.', 'error')
    } finally {
      setAssigning(false)
    }
  }

  const search = () => { setPage(1); setApplied({ q, pooja, plan, status, payment, start, end }) }
  const clear = () => { setQ(''); setPooja(''); setPlan(''); setStatus(''); setPayment(''); setStart(''); setEnd(''); setPage(1); setApplied({ q: '', pooja: '', plan: '', status: '', payment: '', start: '', end: '' }) }
  async function cancel(b) {
    const paid = b.payment_status === 'Paid' && Number(b.amount) > 0
    // Suggest a prorated refund when part of a finite quota is already consumed.
    const allowed = b.performances_allowed, done = b.performances_done || 0
    const suggested = allowed && done > 0
      ? Math.round(Number(b.amount) * (allowed - done) / allowed)
      : Number(b.amount)
    const res = await promptDialog({
      title: `Cancel booking ${b.booking_code}?`,
      tone: 'danger', confirmLabel: tr('Cancel Booking'), cancelLabel: 'Keep Booking',
      fields: [
        { k: 'reason', label: tr('Reason'), required: true, placeholder: 'Why is this booking being cancelled?' },
        ...(paid ? [{ k: 'refund', label: tr('Refund amount (₹)'), type: 'number', defaultValue: String(suggested),
          note: allowed && done > 0 ? `Prorated — ${done}/${allowed} already performed.` : 'Full paid amount suggested.' }] : []),
      ],
    })
    if (!res) return
    const refund_amount = paid ? (Number(res.refund) || 0) : undefined
    try { await BookingsAPI.cancel(b.id, { reason: res.reason.trim(), refund_amount }); toast('Booking cancelled.'); loadList(applied, page); loadStats() }
    catch (ex) { toast(ex.detail || 'Could not cancel this booking.', 'error') }
  }
  async function reschedule(b) {
    if (!(b.status === 'Confirmed' && b.payment_status === 'Paid' && !(b.performances_done > 0))) {
      toast('Only a paid booking that has not yet started can be rescheduled.', 'info'); return
    }
    const res = await promptDialog({
      title: `Reschedule ${b.booking_code}`,
      fields: [{ k: 'date', label: tr('New date'), type: 'date', required: true, defaultValue: b.scheduled_date || '' }],
      confirmLabel: tr('Reschedule'),
    })
    if (!res) return
    try { await BookingsAPI.reschedule(b.id, { scheduled_date: res.date }); toast('Booking rescheduled.'); loadList(applied, page); loadStats() }
    catch (ex) { toast(ex.detail || 'Could not reschedule this booking.', 'error') }
  }
  async function complete(b) {
    if (!(await confirmDialog({ title: `Mark ${b.booking_code} as completed?`, message: 'It will move to Pooja History.' }))) return
    try { await BookingsAPI.complete(b.id); toast('Performance recorded.'); loadList(applied, page); loadStats() }
    catch (ex) { toast(ex.detail || 'Could not complete this booking.', 'error') }
  }

  const planOptions = [...new Set(poojas.flatMap((p) => (p.plans || []).map((pl) => pl.plan_name)))]
  const pageCount = Math.max(1, Math.ceil(total / SIZE))
  const from = total === 0 ? 0 : (page - 1) * SIZE + 1
  const to = Math.min(page * SIZE, total)
  const pageNums = pagesFor(page, pageCount)

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-maroon-700"><T>Pooja Management</T></h1>
          <p className="text-sm text-gray-500 mt-1"><T>Manage pooja bookings and related operations.</T></p>
        </div>
        <Link to="/admin/bookings/new" className="btn-maroon !py-2.5"><CalendarPlus size={16} />{' '}<T>Advance Booking</T></Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder={tr("Search by Pooja Name, Devotee Name or Booking ID")} className="input !pl-9" />
          </div>
          <div className="flex gap-2">
            <button onClick={clear} className="btn-outline !py-2.5"><RotateCcw size={15} />{' '}<T>Clear</T></button>
            <button onClick={search} className="btn-maroon !py-2.5"><Search size={15} />{' '}<T>Search</T></button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-7 gap-4 mt-4">
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>From</T></label>
            <DateField value={start} onChange={(e) => setStart(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
            <DateField value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Pooja</T></label>
            <Select value={pooja} onChange={(e) => setPooja(e.target.value)} className="input">
              <option value="">{tr("All Poojas")}</option>
              {poojas.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Plan</T></label>
            <Select value={plan} onChange={(e) => setPlan(e.target.value)} className="input">
              <option value="">{tr("All Plans")}</option>
              {planOptions.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
              <option value="">{tr("All Status")}</option>
              <option value="Confirmed">{tr("Confirmed")}</option><option value="Pending">{tr("Pending")}</option><option value="Cancelled">{tr("Cancelled")}</option><option value="Completed">{tr("Completed")}</option>
            </Select>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Payment Status</T></label>
            <Select value={payment} onChange={(e) => setPayment(e.target.value)} className="input">
              <option value="">{tr("All Payments")}</option>
              <option value="Paid">{tr("Paid")}</option><option value="Pending">{tr("Pending")}</option><option value="Failed">{tr("Failed")}</option>
            </Select>
          </div>
          <div className="flex items-end">
            <button onClick={search} className="btn-maroon !py-2.5 w-full justify-center"><SlidersHorizontal size={15} />{' '}<T>Apply Filters</T></button>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-maroon-50 border border-maroon-200 rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[0.875rem] font-semibold text-maroon-700">
              {selected.size} {tr(selected.size === 1 ? 'booking selected' : 'bookings selected')}
            </span>
            <button onClick={deselectAll} className="text-[0.8125rem] text-maroon-600 hover:text-maroon-800 flex items-center gap-1">
              <X size={14} /> {tr('Clear')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-maroon-600" />
            <Select value={bulkPoojari} onChange={(e) => setBulkPoojari(e.target.value)} className="input !w-auto !py-1.5 text-[0.8125rem]">
              <option value="">{tr('Select Poojari…')}</option>
              {poojaris.map((p) => <option key={p.id} value={p.id}>{personName(p, lang)}{p.specialization ? ` · ${tr(p.specialization)}` : ''}</option>)}
            </Select>
            <button onClick={assignPoojari} disabled={!bulkPoojari || assigning} className="btn-maroon !py-1.5 !text-[0.8125rem] disabled:opacity-50">
              {assigning ? tr('Assigning…') : tr('Assign Poojari')}
            </button>
          </div>
        </div>
      )}

      {/* Bookings list */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Bookings List</T></h3>
          {rows.length > 0 && (
            <button onClick={allSelected ? deselectAll : selectAll} className="text-[0.8125rem] text-maroon-600 hover:text-maroon-800">
              {allSelected ? tr('Deselect All') : tr('Select All')}
            </button>
          )}
        </div>
        <SortPanel sorts={sorts} columns={sortColumns} onToggle={handleColumnClick} onRemove={removeSort} onClear={clearSorts} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
                <th className="px-3 py-3 w-10">
                  <Checkbox checked={allSelected && rows.length > 0} onChange={allSelected ? deselectAll : selectAll} />
                </th>
                {sortColumns.map((col) => {
                  const sortIdx = getSortIndex(col.key)
                  const sortDir = getSortDirection(col.key)
                  const isSorted = sortIdx >= 0
                  return (
                    <th key={col.key} onClick={(e) => handleColumnClick(col.key, e)}
                      className={`px-3 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-blue-700 bg-blue-50/50' : ''}`}
                      title={tr("Click to sort, Shift+Click to add secondary sort")}>
                      <span className="inline-flex items-center gap-1">
                        {tr(col.label)}
                        {isSorted && (
                          <span className="inline-flex items-center gap-0.5 text-blue-600">
                            {sorts.length > 1 && <span className="text-[0.5625rem] font-bold">{sortIdx + 1}</span>}
                            {sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                          </span>
                        )}
                      </span>
                    </th>
                  )
                })}
                <th className="px-3 py-3 font-semibold whitespace-nowrap">{tr('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRows.map((b) => (
                <tr key={b.id} className={`hover:bg-gray-50/60 ${selected.has(b.id) ? 'bg-maroon-50/40' : ''}`}>
                  <td className="px-3 py-3.5">
                    <Checkbox checked={selected.has(b.id)} onChange={() => toggleSelect(b.id)} />
                  </td>
                  <td className="px-3 py-3.5 font-mono text-[0.75rem] text-gray-500">{b.booking_code}</td>
                  <td className="px-3 py-3.5 font-semibold text-gray-800">{tr(b.seva_name)}</td>
                  <td className="px-3 py-3.5 text-gray-700">{personName({ name: b.devotee_name, name_te: b.devotee_name_te }, lang)}</td>
                  <td className="px-3 py-3.5"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${PLAN_TONE[b.plan_name] || 'bg-gray-100 text-gray-500'}`}>{b.plan_name ? tr(b.plan_name) : '—'}</span></td>
                  <td className="px-3 py-3.5 text-gray-600 text-[0.8125rem] whitespace-nowrap">{fmtDT(b.scheduled_date, b.time_slot)}</td>
                  <td className="px-3 py-3.5 font-semibold text-gray-800">{Number(b.amount).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-3.5"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${STATUS_TONE[b.status] || 'bg-gray-100 text-gray-500'}`}>{tr(b.status)}</span></td>
                  <td className="px-3 py-3.5 font-mono text-[0.75rem] text-gray-500">{b.ticket_no || '—'}</td>
                  <td className="px-3 py-3.5 text-gray-500 text-[0.8125rem] whitespace-nowrap">{fmtStamp(b.created_at)}</td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => nav(`/admin/bookings/${b.id}`)} title={tr("View")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                      <button onClick={() => nav(`/admin/bookings/${b.id}`)} title={tr("Ticket")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-maroon-600 hover:bg-maroon-50"><Ticket size={15} /></button>
                      {canOperate && b.status === 'Confirmed' && <button onClick={() => complete(b)} title={tr("Mark Completed")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300"><CheckCircle2 size={15} /></button>}
                      {canOperate && b.status === 'Confirmed' && b.payment_status === 'Paid' && !(b.performances_done > 0) && <button onClick={() => reschedule(b)} title={tr("Reschedule")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300"><CalendarClock size={15} /></button>}
                      {isAdmin && b.status !== 'Cancelled' && <button onClick={() => cancel(b)} title={tr("Cancel")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-red-600 hover:border-red-300"><Ban size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <TableStates colSpan={11} loading={loading} error={loadErr} onRetry={() => loadList(applied, page)} empty={tr("No bookings found.")} />}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3.5 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[0.8125rem] text-gray-500">{tr('Showing')} {from} {tr('to')} {to} {tr('of')} {total} {tr('bookings')}{sorts.length > 0 && <span className="text-blue-600 ml-2">• {tr('Sorted')}</span>}</div>
          <div className="flex items-center gap-1.5">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:border-maroon-300"><ChevronLeft size={15} /></button>
            {pageNums.map((n, i) => n === '…'
              ? <span key={`e${i}`} className="px-1 text-gray-400">…</span>
              : <button key={n} onClick={() => setPage(n)} className={`w-8 h-8 grid place-items-center rounded-lg text-[0.8125rem] font-semibold ${n === page ? 'bg-maroon-700 text-cream' : 'border border-gray-200 text-gray-600 hover:border-maroon-300'}`}>{n}</button>)}
            <button disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:border-maroon-300"><ChevronRight size={15} /></button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-[0.8125rem] text-gray-500 bg-amber-50/60 border border-amber-100 rounded-lg px-4 py-2.5">
        <span className="text-amber-500">ⓘ</span>{' '}<T>Counter staff books the pooja and issues the ticket to the devotee.</T>{' '}</div>
    </div>
  )
}
