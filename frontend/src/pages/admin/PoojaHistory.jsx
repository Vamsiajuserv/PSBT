import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, RotateCcw, Eye, X, Printer, Calendar, Flame, CalendarCheck, Users, Infinity as InfinityIcon,
  FileText, User, Sparkles, ClipboardList, StickyNote, Info, CheckCircle2, XCircle, Clock,
} from 'lucide-react'
import { PageTitle, StatTile, Pill, Pager, inr, num, fmtDate, fmtStamp } from '../../components/admin/ui.jsx'
import { Receipt } from '../../components/common/Receipt.jsx'
import { te } from '../../lib/telugu.js'
import { PoojaHistoryAPI, PoojasAPI } from '../../api/client.js'
import { Select, DateField } from '../../components/common/Field.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const PLAN_TONE = { Daily: 'blue', Monthly: 'green', 'Life Long': 'orange', 'One-Time': 'violet',
  'Full Month': 'violet', '30-Day': 'violet', 'Yearly Once': 'orange', 'Yearly Thrice': 'orange' }
const COMPLETION_TONE = { Completed: 'green', Cancelled: 'red', Ongoing: 'amber' }
const COMPLETION_LABEL = { Completed: 'Completed', Cancelled: 'Cancelled', Ongoing: 'Ongoing' }
const COMPLETION_ICON = { Completed: CheckCircle2, Cancelled: XCircle, Ongoing: Clock }
const STATUS_CLS = { green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700' }
function StatusPill({ completion }) {
  const I = COMPLETION_ICON[completion]
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${STATUS_CLS[COMPLETION_TONE[completion]]}`}><I size={11} /> {COMPLETION_LABEL[completion]}</span>
}
const monthLabel = () => new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
const startOf = (slot) => (slot ? slot.split('-')[0].trim() : '')
const endOf = (slot) => (slot && slot.includes('-') ? slot.split('-')[1].trim() : '')

export default function PoojaHistory() {
  const nav = useNavigate()
  const SIZE = 15
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [stats, setStats] = useState(null)
  const [poojas, setPoojas] = useState([])
  const [drawer, setDrawer] = useState(null)
  const [printDoc, setPrintDoc] = useState(null)

  const [q, setQ] = useState('')
  const [pooja, setPooja] = useState('')
  const [plan, setPlan] = useState('')
  const [status, setStatus] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([
      PoojaHistoryAPI.list({ q, pooja, plan, status, start, end, page, size: SIZE }),
      PoojaHistoryAPI.stats().catch(() => null),
    ])
    setRows(d.items); setTotal(d.total); if (s) setStats(s)
  }, [q, pooja, plan, status, start, end, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useEffect(() => { setPage(1) }, [q, pooja, plan, status, start, end])

  useEffect(() => { PoojasAPI.admin().then((r) => setPoojas(r.items || [])).catch(() => {}) }, [])
  const planNames = [...new Set(poojas.flatMap((p) => (p.plans || []).map((pl) => pl.plan_name)))]

  function open(id) { nav(`/admin/pooja-history/${id}`) }

  return (
    <div>
      <PageTitle title={tr("Pooja History")} subtitle="View completed and historical pooja records." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={Flame} color="#ea580c" bg="bg-orange-50" title={tr("Total Completed Poojas")}
          value={stats ? num(stats.total_completed) : '—'} sub="All time completed poojas" />
        <StatTile icon={CalendarCheck} color="#059669" bg="bg-emerald-50" title={tr("Completed This Month")}
          value={stats ? num(stats.completed_this_month) : '—'} sub={`Poojas completed in ${monthLabel()}`} />
        <StatTile icon={Users} color="#d97706" bg="bg-amber-50" title={tr("Devotees Served")}
          value={stats ? num(stats.devotees_served) : '—'} sub="Unique devotees served" />
        <StatTile icon={InfinityIcon} color="#7c3aed" bg="bg-violet-50" title={tr("Active Long-Term Poojas")}
          value={stats ? num(stats.active_long_term) : '—'} sub="Life Long & Monthly poojas" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search by Devotee / Booking ID / Ticket No.</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search…")} className="input !pl-9" /></div>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Date Range</T></label>
            <div className="flex items-center gap-1.5">
              <DateField value={start} onChange={(e) => setStart(e.target.value)} className="input !px-2.5 text-[0.78125rem]" />
              <span className="text-gray-400">–</span>
              <DateField value={end} onChange={(e) => setEnd(e.target.value)} className="input !px-2.5 text-[0.78125rem]" />
            </div>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Pooja</T></label>
            <Select value={pooja} onChange={(e) => setPooja(e.target.value)} className="input"><option value="">All Poojas</option>{poojas.map((p) => <option key={p.id}>{p.name}</option>)}</Select>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Plan</T></label>
            <Select value={plan} onChange={(e) => setPlan(e.target.value)} className="input"><option value="">All Plans</option>{planNames.map((p) => <option key={p}>{p}</option>)}</Select>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Completion Status</T></label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input"><option value="">All Status</option><option>Completed</option><option>Ongoing</option><option value="Cancelled">Cancelled</option></Select>
          </div>
          <div className="xl:col-span-4 flex gap-2 justify-end">
            <button onClick={() => { setQ(''); setPooja(''); setPlan(''); setStatus(''); setStart(''); setEnd('') }} className="btn-outline !py-2.5"><RotateCcw size={14} />{' '}<T>Clear</T></button>
            <button onClick={() => load()} className="btn-maroon !py-2.5"><Search size={14} />{' '}<T>Search</T></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
              {['Booking ID', 'Devotee Name', 'Pooja Name', 'Plan', 'Poojari Name', 'Performed On', 'Ticket No.', 'Status', 'Actions'].map((c) => <th key={c} className="px-4 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[0.75rem] text-gray-500">{b.booking_code}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{b.devotee_name}</td>
                  <td className="px-4 py-3 text-gray-700">{b.pooja_name}</td>
                  <td className="px-4 py-3">{b.plan_name ? <Pill tone={PLAN_TONE[b.plan_name] || 'gray'}>{b.plan_name}</Pill> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-gray-600">{b.poojari_name || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="text-gray-700 text-[0.8125rem]">{fmtDate(b.scheduled_date)}</div><div className="text-[0.6875rem] text-gray-400">{startOf(b.time_slot)}</div></td>
                  <td className="px-4 py-3 font-mono text-[0.75rem] text-gray-500">{b.ticket_no || '—'}</td>
                  <td className="px-4 py-3"><StatusPill completion={b.completion} /></td>
                  <td className="px-4 py-3">
                    <button onClick={() => open(b.id)} title={tr("View details")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400"><T>No pooja records found.</T></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit="records" />
        </div>
      </div>

      {/* ── Pooja Details drawer (read-only) ── */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Pooja Details</T></h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>View pooja booking and execution details.</T></p></div>
              <button onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-6 flex-1">
              <DSection icon={FileText} n="1" title={tr("Booking Information")}>
                <Field label="Booking ID" value={drawer.booking_code} />
                <Field label="Ticket No." value={drawer.ticket_no} />
                <Field label="Booking Date" value={fmtStamp(drawer.created_at)} />
                <Field label="Booking Mode" value={drawer.source} />
                <Field label="Payment Status" value={<Pill tone={drawer.payment_status === 'Paid' ? 'green' : 'amber'}>{drawer.payment_status}</Pill>} />
                <Field label="Amount Paid" value={inr(drawer.amount)} />
              </DSection>

              <DSection icon={User} n="2" title={tr("Devotee Information")}>
                <Field label="Devotee Name" value={drawer.devotee?.name} />
                <Field label="Mobile Number" value={drawer.devotee?.mobile} />
                <Field label="Email ID" value={drawer.devotee?.email || '—'} />
                <Field label="Address" value={drawer.devotee?.address || '—'} wide />
              </DSection>

              <DSection icon={Sparkles} n="3" title={tr("Pooja & Plan Details")}>
                <Field label="Pooja Name" value={drawer.pooja_name} />
                <Field label="Plan" value={drawer.plan?.plan_name} />
                <Field label="Rate Type" value={drawer.plan?.rate_type} />
                <Field label="Rate Amount" value={inr(drawer.plan?.rate_amount)} />
                <Field label="Validity" value={drawer.plan?.frequency || drawer.plan?.validity_type || '—'} />
                <Field label="Valid From" value={fmtDate(drawer.scheduled_date)} />
                <Field label="Valid To" value={drawer.valid_until ? fmtDate(drawer.valid_until) : fmtDate(drawer.scheduled_date)} />
              </DSection>

              <DSection icon={ClipboardList} n="4" title={tr("Poojari & Execution Details")}>
                <Field label="Poojari Name" value={drawer.poojari_name || '—'} />
                <Field label="Performed On" value={fmtDate(drawer.scheduled_date)} />
                <Field label="Start Time" value={startOf(drawer.time_slot) || '—'} />
                <Field label="End Time" value={endOf(drawer.time_slot) || '—'} />
                <Field label="Execution Status" value={<StatusPill completion={drawer.completion} />} />
              </DSection>

              <DSection icon={StickyNote} n="5" title={tr("Additional Information")}>
                <div className="col-span-2">
                  <div className="text-[0.6875rem] text-gray-400 mb-1"><T>Notes</T></div>
                  <div className="text-[0.8125rem] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 min-h-[2.75rem]">
                    {drawer.completion === 'Completed' ? 'Pooja completed successfully.' : drawer.completion === 'Cancelled' ? 'Booking was cancelled.' : 'Pooja is scheduled / ongoing.'}
                  </div>
                </div>
              </DSection>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setPrintDoc(drawer)} className="btn-outline flex-1 justify-center"><Printer size={15} />{' '}<T>Print Receipt</T></button>
              <button onClick={() => setDrawer(null)} className="btn-maroon flex-1 justify-center"><T>Close</T></button>
            </div>
          </div>
        </div>
      )}

      {printDoc && (
        <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4 no-print" onClick={() => setPrintDoc(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
            <div id="print-area">
              <Receipt title={tr("Pooja Ticket")} titleTe="పూజ టికెట్" no={printDoc.ticket_no} subNo={printDoc.booking_code} subNoLabel="Booking No" amount={printDoc.amount}
                rows={[
                  { en: 'Devotee', value: printDoc.devotee?.name },
                  { en: 'Pooja', value: printDoc.pooja_name, valueTe: te(printDoc.pooja_name) },
                  { en: 'Plan', value: printDoc.plan?.plan_name },
                  { en: 'Poojari', value: printDoc.poojari_name || '—' },
                  { en: 'Date', value: fmtDate(printDoc.scheduled_date) },
                  { en: 'Status', value: COMPLETION_LABEL[printDoc.completion] },
                ]} />
            </div>
            <div className="flex gap-2 justify-center mt-4 no-print">
              <button onClick={() => window.print()} className="btn-maroon"><Printer size={15} />{' '}<T>Print</T></button>
              <button onClick={() => setPrintDoc(null)} className="btn-outline"><T>Close</T></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DSection({ icon: Icon, n, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-maroon-700"><Icon size={15} /><span className="font-semibold text-[0.84375rem]">{n}. {title}</span></div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">{children}</div>
    </div>
  )
}
function Field({ label, value, wide }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[0.6875rem] text-gray-400 mb-0.5">{label}</div>
      <div className="text-[0.8125rem] text-gray-800 font-medium">{value ?? '—'}</div>
    </div>
  )
}
