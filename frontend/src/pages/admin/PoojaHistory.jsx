import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, RotateCcw, Eye, X, Printer, Calendar, Flame, CalendarCheck, Users, Infinity as InfinityIcon,
  FileText, User, Sparkles, ClipboardList, StickyNote, Info, CheckCircle2, XCircle, Clock, Download,
} from 'lucide-react'
import { toast } from '../../components/common/Dialog.jsx'
import { useFilterableSortableTable, SortFilterPanel, SortableFilterableTh } from '../../components/common/SortableTable.jsx'
import { PageTitle, StatTile, Pill, Pager, inr, num, fmtDate, fmtStamp } from '../../components/admin/ui.jsx'
import { Receipt } from '../../components/common/Receipt.jsx'
import { te } from '../../lib/telugu.js'
import { PoojaHistoryAPI, PoojasAPI } from '../../api/client.js'
import { Select, DateField } from '../../components/common/Field.jsx'
import { T, tr, personName, useLang, stamp, teText } from '../../i18n/LanguageContext.jsx'

const PLAN_TONE = { Daily: 'blue', Monthly: 'green', 'Life Long': 'orange', 'One-Time': 'violet',
  'Full Month': 'violet', '30-Day': 'violet', 'Yearly Once': 'orange', 'Yearly Thrice': 'orange' }
const COMPLETION_TONE = { Completed: 'green', Cancelled: 'red', Ongoing: 'amber' }
const COMPLETION_LABEL = { Completed: 'Completed', Cancelled: 'Cancelled', Ongoing: 'Ongoing' }
const COMPLETION_ICON = { Completed: CheckCircle2, Cancelled: XCircle, Ongoing: Clock }
const STATUS_CLS = { green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700' }
function StatusPill({ completion }) {
  const I = COMPLETION_ICON[completion]
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${STATUS_CLS[COMPLETION_TONE[completion]]}`}><I size={11} /> {tr(COMPLETION_LABEL[completion])}</span>
}
const monthLabel = () => stamp(new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }))
  .replace(/[A-Za-z]{3,}/g, (w) => tr(w))
const startOf = (slot) => (slot ? slot.split('-')[0].trim() : '')
const endOf = (slot) => (slot && slot.includes('-') ? slot.split('-')[1].trim() : '')

// Date helpers for presets
const todayISO = () => new Date().toISOString().slice(0, 10)
const yesterdayISO = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) }
const weekStartISO = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10) }
const monthStartISO = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

const DATE_PRESETS = [
  { key: 'today', label: 'Today', getRange: () => ({ start: todayISO(), end: todayISO() }) },
  { key: 'yesterday', label: 'Yesterday', getRange: () => ({ start: yesterdayISO(), end: yesterdayISO() }) },
  { key: 'week', label: 'This Week', getRange: () => ({ start: weekStartISO(), end: todayISO() }) },
  { key: 'month', label: 'This Month', getRange: () => ({ start: monthStartISO(), end: todayISO() }) },
  { key: 'custom', label: 'Custom', getRange: () => null },
]

// Calculate validity end date based on plan
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function calcValidTo(plan, fromDate, bookingTime) {
  if (!fromDate) return null
  const n = (plan?.plan_name || '').toLowerCase()
  if (n.includes('life')) return null // Lifetime = no end
  let days = plan?.duration_days
  if (!days) {
    if (n.includes('monthly')) days = 30
    else if (n.includes('year')) days = 365
    else days = 1
  }
  // Calculate expiry with same time as booking
  const from = new Date(fromDate)
  if (bookingTime) {
    const bt = new Date(bookingTime)
    from.setHours(bt.getHours(), bt.getMinutes(), bt.getSeconds())
  }
  return addDays(from, days)
}
function formatValidTo(plan, fromDate, bookingTime) {
  const validUntil = calcValidTo(plan, fromDate, bookingTime)
  if (!validUntil) return 'Lifetime'
  const dateStr = fmtDate(validUntil)
  const hours = validUntil.getHours()
  const mins = String(validUntil.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const hr12 = hours % 12 || 12
  return `${dateStr}, ${String(hr12).padStart(2, '0')}:${mins} ${ampm}`
}

export default function PoojaHistory() {
  const { lang } = useLang()
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
  const [start, setStart] = useState(todayISO())
  const [end, setEnd] = useState(todayISO())
  const [datePreset, setDatePreset] = useState('today')
  const [showPrintModal, setShowPrintModal] = useState(false)

  // Handle date preset selection
  const selectPreset = (preset) => {
    setDatePreset(preset.key)
    if (preset.key !== 'custom') {
      const range = preset.getRange()
      if (range) {
        setStart(range.start)
        setEnd(range.end)
      }
    }
  }

  // Handle manual date change - switch to custom
  // DEF-006: Clear end date if new start is after current end
  const handleStartChange = (e) => {
    const newStart = e.target.value
    setStart(newStart)
    if (end && newStart > end) setEnd('')
    setDatePreset('custom')
  }
  const handleEndChange = (e) => {
    setEnd(e.target.value)
    setDatePreset('custom')
  }

  // Download CSV export
  const downloadCSV = () => {
    if (!rows.length) return
    const headers = ['Receipt No', 'Ticket No', 'Devotee', 'Mobile', 'Pooja', 'Plan', 'Date', 'Amount', 'Payment', 'Status']
    const csvRows = [headers.join(',')]
    for (const r of rows) {
      const row = [
        r.receipt_no || r.booking_code,
        r.ticket_no || '',
        `"${(r.devotee_name || '').replace(/"/g, '""')}"`,
        r.mobile || '',
        `"${(r.pooja_name || '').replace(/"/g, '""')}"`,
        r.plan_name || '',
        r.scheduled_date || '',
        r.amount || 0,
        r.payment_method || 'Cash',
        r.completion || 'Ongoing',
      ]
      csvRows.push(row.join(','))
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Pooja_History_${start}_to_${end}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Sortable table columns with filtering support
  const sortColumns = [
    { key: 'booking_code', label: 'Booking ID', type: 'text' },
    { key: 'devotee_name', label: 'Devotee Name', type: 'text' },
    { key: 'pooja_name', label: 'Pooja Name', type: 'text' },
    { key: 'plan_name', label: 'Plan', type: 'text', filterable: true, filterOptions: ['One-Time', 'Daily', 'Monthly', 'Life Long'] },
    { key: 'poojari_name', label: 'Poojari Name', type: 'text' },
    { key: 'scheduled_date', label: 'Performed On', type: 'date' },
    { key: 'ticket_no', label: 'Ticket No.', type: 'text' },
    { key: 'completion', label: 'Status', type: 'text', filterable: true, filterOptions: ['Completed', 'Ongoing', 'Cancelled'] },
  ]
  const {
    filteredSortedRows,
    sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection,
    filters, toggleFilterValue, clearFilter, clearAllFilters, getFilterValues,
  } = useFilterableSortableTable(rows, sortColumns, [{ key: 'scheduled_date', direction: 'desc' }])

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([
      PoojaHistoryAPI.list({ q, pooja, plan, status, start, end, page, size: SIZE }),
      PoojaHistoryAPI.stats().catch(() => null),
    ])
    setRows(d.items); setTotal(d.total); if (s) setStats(s)
  }, [q, pooja, plan, status, start, end, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useEffect(() => { setPage(1) }, [q, pooja, plan, status, start, end])

  useEffect(() => { PoojasAPI.admin().then((r) => setPoojas(r.items || [])).catch(() => toast('Failed to load poojas', 'error')) }, [])
  const planNames = [...new Set(poojas.flatMap((p) => (p.plans || []).map((pl) => pl.plan_name)))]

  function open(id) { nav(`/admin/pooja-history/${id}`) }

  return (
    <div>
      <PageTitle title={tr("Pooja History")} subtitle={tr("View completed and historical pooja records.")} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={Flame} color="#ea580c" bg="bg-orange-50" title={tr("Total Completed Poojas")}
          value={stats ? num(stats.total_completed) : '—'} sub={tr("All time completed poojas")} />
        <StatTile icon={CalendarCheck} color="#059669" bg="bg-emerald-50" title={tr("Completed This Month")}
          value={stats ? num(stats.completed_this_month) : '—'} sub={`${tr('Poojas completed in')} ${monthLabel()}`} />
        <StatTile icon={Users} color="#d97706" bg="bg-amber-50" title={tr("Devotees Served")}
          value={stats ? num(stats.devotees_served) : '—'} sub={tr("Unique devotees served")} />
        <StatTile icon={InfinityIcon} color="#7c3aed" bg="bg-violet-50" title={tr("Active Long-Term Poojas")}
          value={stats ? num(stats.active_long_term) : '—'} sub={tr("Life Long & Monthly poojas")} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Date Presets Row */}
        <div className="px-5 pt-4 pb-2 border-b border-gray-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.75rem] text-gray-500 font-medium"><T>Quick Select</T>:</span>
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => selectPreset(p)}
                className={`px-3 py-1.5 rounded-full text-[0.75rem] font-semibold border transition ${
                  datePreset === p.key
                    ? 'bg-maroon-600 text-white border-maroon-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-maroon-300 hover:text-maroon-700'
                }`}
              >
                {tr(p.label)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadCSV} disabled={!rows.length} className="btn-outline !py-2 !px-3 text-sm disabled:opacity-50" title={tr("Download CSV")}>
              <Download size={15} /> <T>Download</T>
            </button>
            <button onClick={() => setShowPrintModal(true)} disabled={!rows.length} className="btn-outline !py-2 !px-3 text-sm disabled:opacity-50" title={tr("Print History")}>
              <Printer size={15} /> <T>Print</T>
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-end gap-3">
          <div className="flex-[2_1_14rem] min-w-0">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Devotee / Booking ID / Ticket No.")} className="input !pl-9" /></div>
          </div>
          <div className="flex-[1_1_8rem] min-w-0">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>From</T></label>
            <DateField value={start} onChange={handleStartChange} className="input" />
          </div>
          <div className="flex-[1_1_8rem] min-w-0">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
            <DateField value={end} onChange={handleEndChange} min={start} className="input" />
          </div>
          <div className="flex-[1_1_10rem] min-w-0">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Pooja</T></label>
            <Select value={pooja} onChange={(e) => setPooja(e.target.value)} className="input"><option value="">{tr("All Poojas")}</option>{poojas.map((p) => <option key={p.id} value={p.name}>{tr(p.name)}</option>)}</Select>
          </div>
          <div className="flex-[1_1_9rem] min-w-0">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Plan</T></label>
            <Select value={plan} onChange={(e) => setPlan(e.target.value)} className="input"><option value="">{tr("All Plans")}</option>{planNames.map((p) => <option key={p} value={p}>{tr(p)}</option>)}</Select>
          </div>
          <div className="flex-[1_1_10rem] min-w-0">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input"><option value="">{tr("All Status")}</option><option value="Completed">{tr("Completed")}</option><option value="Ongoing">{tr("Ongoing")}</option><option value="Cancelled">{tr("Cancelled")}</option></Select>
          </div>
          <button onClick={() => { setQ(''); setPooja(''); setPlan(''); setStatus(''); setStart(todayISO()); setEnd(todayISO()); setDatePreset('today') }} className="btn-outline !py-2.5 shrink-0"><RotateCcw size={14} />{' '}<T>Clear</T></button>
        </div>

        <SortFilterPanel
          sorts={sorts}
          filters={filters}
          columns={sortColumns}
          onToggleSort={handleColumnClick}
          onRemoveSort={removeSort}
          onClearSorts={clearSorts}
          onClearFilter={clearFilter}
          onClearAllFilters={clearAllFilters}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              {sortColumns.map((col) => (
                <SortableFilterableTh
                  key={col.key}
                  colKey={col.key}
                  label={tr(col.label)}
                  type={col.type}
                  filterable={col.filterable}
                  filterOptions={col.filterOptions}
                  onSort={handleColumnClick}
                  sortIndex={getSortIndex(col.key)}
                  sortDirection={getSortDirection(col.key)}
                  multiSort={sorts.length > 1}
                  filterValues={getFilterValues(col.key)}
                  onToggleFilter={toggleFilterValue}
                  onClearFilter={clearFilter}
                />
              ))}
              <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSortedRows.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[0.75rem] text-gray-500">{b.booking_code}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{personName({ name: b.devotee_name, name_te: b.devotee_name_te }, lang)}</td>
                  <td className="px-4 py-3 text-gray-700">{tr(b.pooja_name)}</td>
                  <td className="px-4 py-3">{b.plan_name ? <Pill tone={PLAN_TONE[b.plan_name] || 'gray'}>{b.plan_name}</Pill> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-gray-600">{b.poojari_name ? personName({ name: b.poojari_name }, lang) : '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="text-gray-700 text-[0.8125rem]">{fmtDate(b.scheduled_date)}</div><div className="text-[0.6875rem] text-gray-400">{startOf(b.time_slot)}</div></td>
                  <td className="px-4 py-3 font-mono text-[0.75rem] text-gray-500">{b.ticket_no || '—'}</td>
                  <td className="px-4 py-3"><StatusPill completion={b.completion} /></td>
                  <td className="px-4 py-3">
                    <button onClick={() => open(b.id)} title={tr("View details")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-600"><T>No pooja records found.</T></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit={tr("records")} />
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
                <Field label={tr("Booking ID")} value={drawer.booking_code} />
                <Field label={tr("Ticket No.")} value={drawer.ticket_no} />
                <Field label={tr("Booking Date")} value={fmtStamp(drawer.created_at)} />
                <Field label={tr("Booking Mode")} value={drawer.source} />
                <Field label={tr("Payment Status")} value={<Pill tone={drawer.payment_status === 'Paid' ? 'green' : 'amber'}>{tr(drawer.payment_status)}</Pill>} />
                <Field label={tr("Amount Paid")} value={inr(drawer.amount)} />
              </DSection>

              <DSection icon={User} n="2" title={tr("Devotee Information")}>
                <Field label={tr("Devotee Name")} value={personName(drawer.devotee, lang)} />
                <Field label={tr("Mobile Number")} value={drawer.devotee?.mobile} />
                <Field label={tr("Email ID")} value={drawer.devotee?.email || '—'} />
                <Field label={tr("Address")} value={drawer.devotee?.address || '—'} wide />
              </DSection>

              <DSection icon={Sparkles} n="3" title={tr("Pooja & Plan Details")}>
                <Field label={tr("Pooja Name")} value={drawer.pooja_name} />
                <Field label={tr("Plan")} value={drawer.plan?.plan_name} />
                <Field label={tr("Rate Type")} value={drawer.plan?.rate_type} />
                <Field label={tr("Rate Amount")} value={inr(drawer.plan?.rate_amount)} />
                <Field label={tr("Validity")} value={drawer.plan?.frequency || drawer.plan?.validity_type || '—'} />
                <Field label={tr("Valid From")} value={fmtDate(drawer.scheduled_date)} />
                <Field label={tr("Valid To")} value={drawer.valid_until ? fmtDate(drawer.valid_until) : formatValidTo(drawer.plan, drawer.scheduled_date, drawer.created_at)} />
              </DSection>

              <DSection icon={ClipboardList} n="4" title={tr("Poojari & Execution Details")}>
                <Field label={tr("Poojari Name")} value={drawer.poojari_name ? personName({ name: drawer.poojari_name }, lang) : '—'} />
                <Field label={tr("Performed On")} value={fmtDate(drawer.scheduled_date)} />
                <Field label={tr("Start Time")} value={startOf(drawer.time_slot) || '—'} />
                <Field label={tr("End Time")} value={endOf(drawer.time_slot) || '—'} />
                <Field label={tr("Execution Status")} value={<StatusPill completion={drawer.completion} />} />
              </DSection>

              <DSection icon={StickyNote} n="5" title={tr("Additional Information")}>
                <div className="col-span-2">
                  <div className="text-[0.6875rem] text-gray-400 mb-1"><T>Notes</T></div>
                  <div className="text-[0.8125rem] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 min-h-[2.75rem]">
                    {drawer.completion === 'Completed' ? tr('Pooja completed successfully.') : drawer.completion === 'Cancelled' ? tr('Booking was cancelled.') : tr('Pooja is scheduled / ongoing.')}
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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto print-modal" onClick={() => setPrintDoc(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg my-auto">
            <div id="print-area">
              <Receipt title={tr("Pooja Ticket")} titleTe="పూజ టికెట్" no={printDoc.ticket_no} subNo={printDoc.booking_code} subNoLabel="Booking No" amount={printDoc.amount}
                expiryHours={printDoc.plan?.plan_name === 'Daily' ? 24 : undefined}
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

      {/* Print History Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto print-modal" onClick={() => setShowPrintModal(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-4xl my-auto max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header - hidden in print */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between no-print">
              <div>
                <h3 className="font-bold text-gray-900 text-lg"><T>Print Pooja History</T></h3>
                <p className="text-sm text-gray-500">{fmtDate(start)} — {fmtDate(end)} · {rows.length} {tr('records')}</p>
              </div>
              <button onClick={() => setShowPrintModal(false)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>

            {/* Printable Content */}
            <div className="flex-1 overflow-y-auto p-6" id="print-history-area">
              {/* Temple Header */}
              <div className="text-center mb-6 print-header">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <img src="/images/logo.png" alt="Temple" className="w-12 h-12 rounded-full" onError={(e) => e.target.style.display = 'none'} />
                  <div>
                    <h1 className="font-serif text-xl font-bold text-maroon-800">Sri Shirdi Sai Baba Temple</h1>
                    <p className="text-sm text-gray-600">శ్రీ షిర్డీ సాయిబాబా దేవస్థానం</p>
                  </div>
                </div>
                <h2 className="text-lg font-semibold text-gray-800 mt-4"><T>Pooja History Report</T></h2>
                <p className="text-sm text-gray-600">
                  <T>Date Range</T>: {fmtDate(start)} — {fmtDate(end)}
                </p>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-4 mb-6 print-stats">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-800">{rows.length}</div>
                  <div className="text-xs text-gray-500"><T>Total Records</T></div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-700">{rows.filter(r => r.completion === 'Completed').length}</div>
                  <div className="text-xs text-emerald-600"><T>Completed</T></div>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-amber-700">{rows.filter(r => r.completion === 'Ongoing').length}</div>
                  <div className="text-xs text-amber-600"><T>Ongoing</T></div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700">₹{rows.reduce((s, r) => s + (r.amount || 0), 0).toLocaleString('en-IN')}</div>
                  <div className="text-xs text-blue-600"><T>Total Amount</T></div>
                </div>
              </div>

              {/* Table */}
              <table className="w-full text-sm border border-gray-200 print-table">
                <thead>
                  <tr className="bg-gray-100 text-left text-xs uppercase text-gray-700">
                    <th className="px-3 py-2 border-b font-semibold">{tr('Receipt')}</th>
                    <th className="px-3 py-2 border-b font-semibold">{tr('Devotee')}</th>
                    <th className="px-3 py-2 border-b font-semibold">{tr('Pooja')}</th>
                    <th className="px-3 py-2 border-b font-semibold">{tr('Plan')}</th>
                    <th className="px-3 py-2 border-b font-semibold">{tr('Date')}</th>
                    <th className="px-3 py-2 border-b font-semibold text-right">{tr('Amount')}</th>
                    <th className="px-3 py-2 border-b font-semibold">{tr('Payment')}</th>
                    <th className="px-3 py-2 border-b font-semibold">{tr('Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">{r.receipt_no || r.booking_code}</td>
                      <td className="px-3 py-2 text-gray-800">{r.devotee_name}</td>
                      <td className="px-3 py-2 text-gray-700">{r.pooja_name}</td>
                      <td className="px-3 py-2 text-gray-600">{r.plan_name || '—'}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(r.scheduled_date)}</td>
                      <td className="px-3 py-2 text-gray-800 font-semibold text-right">₹{(r.amount || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-gray-600">{r.payment_method || 'Cash'}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-medium ${r.completion === 'Completed' ? 'text-emerald-700' : r.completion === 'Cancelled' ? 'text-red-600' : 'text-amber-600'}`}>
                          {r.completion}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold">
                    <td colSpan={5} className="px-3 py-2 text-right text-gray-700"><T>Total</T>:</td>
                    <td className="px-3 py-2 text-right text-maroon-700">₹{rows.reduce((s, r) => s + (r.amount || 0), 0).toLocaleString('en-IN')}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>

              {/* Footer */}
              <div className="mt-6 pt-4 border-t border-gray-200 text-center text-xs text-gray-500 print-footer">
                <p><T>Generated on</T>: {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                <p className="mt-1">Sri Shirdi Sai Baba Temple · Pooja History Report</p>
              </div>
            </div>

            {/* Actions - hidden in print */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 no-print">
              <button onClick={() => setShowPrintModal(false)} className="btn-outline"><T>Close</T></button>
              <button onClick={() => window.print()} className="btn-maroon"><Printer size={15} /> <T>Print Report</T></button>
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
  value = typeof value === 'string' ? teText(value) : value

  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[0.6875rem] text-gray-400 mb-0.5">{label}</div>
      <div className="text-[0.8125rem] text-gray-800 font-medium">{value ?? '—'}</div>
    </div>
  )
}
