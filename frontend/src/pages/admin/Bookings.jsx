import React, { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search, Eye, Ticket, RotateCcw, SlidersHorizontal, Ban, CheckCircle2,
  Flame, CalendarDays, CalendarRange, TicketCheck, Clock, Plus, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { BookingsAPI, PoojasAPI } from '../../api/client.js'
import { TableStates, LOAD_ERROR } from '../../components/common/states.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'

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

const inr = (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN')
const PLAN_TONE = {
  Daily: 'bg-emerald-50 text-emerald-700', Monthly: 'bg-blue-50 text-blue-700',
  'One-Time': 'bg-violet-50 text-violet-700', 'Life Long': 'bg-amber-50 text-amber-700',
}
const STATUS_TONE = {
  Confirmed: 'bg-emerald-50 text-emerald-700', Pending: 'bg-amber-50 text-amber-700',
  Cancelled: 'bg-red-50 text-red-700', Completed: 'bg-blue-50 text-blue-700',
}
const fmtDT = (d, slot) => (d ? `${new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}${slot ? ', ' + slot : ''}` : '—')
const fmtStamp = (s) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

function Kpi({ icon: Icon, iconBg, iconColor, title, value, foot }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-full grid place-items-center shrink-0 ${iconBg}`} style={{ color: iconColor }}><Icon size={20} /></div>
        <div className="min-w-0">
          <div className="text-[13px] text-gray-500 leading-tight">{title}</div>
          <div className="text-2xl font-extrabold text-gray-800 mt-1">{value}</div>
        </div>
      </div>
      {foot && <div className="mt-3 pt-3 border-t border-gray-100 text-[12px] text-gray-400">{foot.label} <span className="font-semibold text-gray-600">{foot.value}</span></div>}
    </div>
  )
}

export default function Bookings() {
  const { user } = useAuth()
  const nav = useNavigate()
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)
  // Operational roles that run/perform poojas may mark them completed (backend enforces too).
  const canOperate = isAdmin || ['Counter Staff', 'Poojari'].includes(user?.role)
  const [stats, setStats] = useState(null)
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

  const loadStats = useCallback(() => BookingsAPI.stats().then(setStats).catch(() => {}), [])
  const loadList = useCallback(async (f, pg) => {
    setLoading(true); setLoadErr('')
    try {
      const d = await BookingsAPI.list({ ...f, page: pg, size: SIZE })
      setRows(d.items); setTotal(d.total)
    } catch (ex) {
      setLoadErr(ex?.detail || LOAD_ERROR); setRows([]); setTotal(0)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadStats(); PoojasAPI.list().then((d) => setPoojas(d.items)).catch(() => {}) }, [loadStats])
  useEffect(() => { loadList(applied, page) }, [applied, page, loadList])

  const search = () => { setPage(1); setApplied({ q, pooja, plan, status, payment, start, end }) }
  const clear = () => { setQ(''); setPooja(''); setPlan(''); setStatus(''); setPayment(''); setStart(''); setEnd(''); setPage(1); setApplied({ q: '', pooja: '', plan: '', status: '', payment: '', start: '', end: '' }) }
  async function cancel(b) {
    if (!confirm(`Cancel booking ${b.booking_code}?`)) return
    await BookingsAPI.cancel(b.id); loadList(applied, page); loadStats()
  }
  async function complete(b) {
    if (!confirm(`Mark ${b.booking_code} as completed? It will move to Pooja History.`)) return
    try { await BookingsAPI.complete(b.id); loadList(applied, page); loadStats() }
    catch (ex) { alert(ex.detail || 'Could not complete this booking.') }
  }

  const planOptions = [...new Set(poojas.flatMap((p) => (p.plans || []).map((pl) => pl.plan_name)))]
  const pageCount = Math.max(1, Math.ceil(total / SIZE))
  const from = total === 0 ? 0 : (page - 1) * SIZE + 1
  const to = Math.min(page * SIZE, total)
  const pageNums = pagesFor(page, pageCount)

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-[26px] font-bold text-maroon-800">Pooja Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage pooja bookings and related operations.</p>
        </div>
        <Link to="/admin/bookings/new" className="btn-maroon !py-2.5"><Plus size={16} /> New Booking</Link>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <Kpi icon={Flame} iconBg="bg-orange-50" iconColor="#ea580c" title="Today's Bookings"
          value={stats?.today.count ?? '—'} foot={{ label: 'Amount', value: inr(stats?.today.amount) }} />
        <Kpi icon={CalendarDays} iconBg="bg-emerald-50" iconColor="#059669" title="This Week Bookings"
          value={stats?.week.count ?? '—'} foot={{ label: 'Amount', value: inr(stats?.week.amount) }} />
        <Kpi icon={CalendarRange} iconBg="bg-rose-50" iconColor="#e11d48" title="This Month Bookings"
          value={stats?.month.count ?? '—'} foot={{ label: 'Amount', value: inr(stats?.month.amount) }} />
        <Kpi icon={TicketCheck} iconBg="bg-violet-50" iconColor="#7c3aed" title="Tickets Generated (This Month)"
          value={stats ? Number(stats.tickets_month).toLocaleString('en-IN') : '—'} />
        <Kpi icon={Clock} iconBg="bg-amber-50" iconColor="#d97706" title="Upcoming Bookings"
          value={stats?.upcoming ?? '—'} foot={{ label: 'Next 7 Days', value: '' }} />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Search by Pooja Name, Devotee Name or Booking ID" className="input !pl-9" />
          </div>
          <div className="flex gap-2">
            <button onClick={clear} className="btn-outline !py-2.5"><RotateCcw size={15} /> Clear</button>
            <button onClick={search} className="btn-maroon !py-2.5"><Search size={15} /> Search</button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-4 mt-4">
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Date Range</label>
            <div className="flex items-center gap-1">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input !px-2 !text-[12px]" />
              <span className="text-gray-300">–</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input !px-2 !text-[12px]" />
            </div>
          </div>
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Pooja</label>
            <select value={pooja} onChange={(e) => setPooja(e.target.value)} className="input">
              <option value="">All Poojas</option>
              {poojas.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className="input">
              <option value="">All Plans</option>
              {planOptions.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
              <option value="">All Status</option>
              <option>Confirmed</option><option>Pending</option><option>Cancelled</option><option>Completed</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Payment Status</label>
            <select value={payment} onChange={(e) => setPayment(e.target.value)} className="input">
              <option value="">All Payments</option>
              <option>Paid</option><option>Pending</option><option>Failed</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={search} className="btn-maroon !py-2.5 w-full justify-center"><SlidersHorizontal size={15} /> Apply Filters</button>
          </div>
        </div>
      </div>

      {/* Bookings list */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-gray-100">
          <h3 className="font-serif text-lg font-bold text-maroon-800">Bookings List</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/70 text-left text-[11px] uppercase tracking-wide text-gray-500">
                {['Booking ID', 'Pooja Name', 'Devotee Name', 'Plan', 'Date & Time', 'Amount (₹)', 'Status', 'Ticket No.', 'Booked On', 'Actions'].map((c) => (
                  <th key={c} className="px-3 py-3 font-semibold whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-3.5 font-mono text-[12px] text-gray-500">{b.booking_code}</td>
                  <td className="px-3 py-3.5 font-semibold text-gray-800">{b.seva_name}</td>
                  <td className="px-3 py-3.5 text-gray-700">{b.devotee_name}</td>
                  <td className="px-3 py-3.5"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${PLAN_TONE[b.plan_name] || 'bg-gray-100 text-gray-500'}`}>{b.plan_name || '—'}</span></td>
                  <td className="px-3 py-3.5 text-gray-600 text-[13px] whitespace-nowrap">{fmtDT(b.scheduled_date, b.time_slot)}</td>
                  <td className="px-3 py-3.5 font-semibold text-gray-800">{Number(b.amount).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-3.5"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_TONE[b.status] || 'bg-gray-100 text-gray-500'}`}>{b.status}</span></td>
                  <td className="px-3 py-3.5 font-mono text-[12px] text-gray-500">{b.ticket_no || '—'}</td>
                  <td className="px-3 py-3.5 text-gray-500 text-[13px] whitespace-nowrap">{fmtStamp(b.created_at)}</td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => nav(`/admin/bookings/${b.id}`)} title="View" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-500 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                      <button onClick={() => nav(`/admin/bookings/${b.id}`)} title="Ticket" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-maroon-600 hover:bg-maroon-50"><Ticket size={15} /></button>
                      {canOperate && b.status === 'Confirmed' && <button onClick={() => complete(b)} title="Mark Completed" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300"><CheckCircle2 size={15} /></button>}
                      {isAdmin && b.status !== 'Cancelled' && <button onClick={() => cancel(b)} title="Cancel" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300"><Ban size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <TableStates colSpan={10} loading={loading} error={loadErr} onRetry={() => loadList(applied, page)} empty="No bookings found." />}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3.5 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[13px] text-gray-500">Showing {from} to {to} of {total} bookings</div>
          <div className="flex items-center gap-1.5">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:border-maroon-300"><ChevronLeft size={15} /></button>
            {pageNums.map((n, i) => n === '…'
              ? <span key={`e${i}`} className="px-1 text-gray-400">…</span>
              : <button key={n} onClick={() => setPage(n)} className={`w-8 h-8 grid place-items-center rounded-lg text-[13px] font-semibold ${n === page ? 'bg-maroon-700 text-cream' : 'border border-gray-200 text-gray-600 hover:border-maroon-300'}`}>{n}</button>)}
            <button disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:border-maroon-300"><ChevronRight size={15} /></button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-[13px] text-gray-500 bg-amber-50/60 border border-amber-100 rounded-lg px-4 py-2.5">
        <span className="text-amber-500">ⓘ</span> Counter staff books the pooja and issues the ticket to the devotee.
      </div>
    </div>
  )
}
