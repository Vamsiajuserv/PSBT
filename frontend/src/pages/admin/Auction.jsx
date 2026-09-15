import React, { useEffect, useState, useCallback } from 'react'
import {
  Plus, X, Eye, MoreVertical, Search, RotateCcw, Info, Trash2,
  Gavel, CalendarClock, Users, CheckCircle2, User, ShieldCheck,
  XCircle, Banknote, Receipt, Printer, ArrowDown, ArrowUp, ChevronsUpDown,
} from 'lucide-react'
import { PageTitle, StatTile, Pill, Pager, inr, num, fmtDate, fmtStamp } from '../../components/admin/ui.jsx'
import { AuctionAPI, AuctionItemsAPI, DevoteesAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { TableStates } from '../../components/common/states.jsx'
import { useFilterableSortableTable, SortFilterPanel, SortableFilterableTh } from '../../components/common/SortableTable.jsx'
import ExportButtons from '../../components/common/ExportButtons.jsx'
import { Select, DateField, TimeField, NumberField, Combobox } from '../../components/common/Field.jsx'
import { confirmDialog, promptDialog, toast } from '../../components/common/Dialog.jsx'
import { T, tr, clock12, personName, useLang } from '../../i18n/LanguageContext.jsx'
import { sanitizeName } from '../../lib/validation.js'

const STATUS_TONE = { Scheduled: 'blue', 'In Progress': 'amber', Completed: 'green' }
const VERIFY_TONE = { Pending: 'gray', Verified: 'green', Rejected: 'red' }
const PAYMENT_TONE = { Pending: 'amber', Paid: 'green' }

// Sortable columns configuration with filtering support
const SORT_COLUMNS = [
  { key: 'item', label: 'Item Name', type: 'text' },
  { key: 'auction_date', label: 'Auction Date', type: 'date' },
  { key: 'current_amount', label: 'Highest Bid', type: 'number' },
  { key: 'status', label: 'Status', type: 'text', filterable: true, filterOptions: ['Scheduled', 'In Progress', 'Completed'] },
]
const todayISO = () => new Date().toISOString().slice(0, 10)
const to12h = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 || 12
  return clock12(`${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`)
}
const emptyForm = () => ({ itemChoice: '', item: '', base_amount: '', devotee: null, winner: '', description: '', auction_date: '', start_time: '', notes: '' })

export default function Auction() {
  const { lang } = useLang()
  const { user } = useAuth()
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)
  const isCommittee = user?.role === 'Committee'
  const canWrite = user?.role !== 'Accountant'
  const SIZE = 15
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [stats, setStats] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [view, setView] = useState(null)
  const [menu, setMenu] = useState(null)
  const [receipt, setReceipt] = useState(null) // for printing receipt
  const [paymentModal, setPaymentModal] = useState(null) // for payment collection

  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [verification, setVerification] = useState('')
  const [payment, setPayment] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [saving, setSaving] = useState(false)

  // Sorting with filtering
  const {
    filteredSortedRows,
    sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection,
    filters, toggleFilterValue, clearFilter, clearAllFilters, getFilterValues,
  } = useFilterableSortableTable(rows, SORT_COLUMNS, [{ key: 'auction_date', direction: 'desc' }])

  // master auction items for the item dropdown
  const [items, setItems] = useState([])
  useEffect(() => {
    AuctionItemsAPI.list({ status: 'Active' })
      .then((r) => setItems(Array.isArray(r) ? r : (r.items || [])))
      .catch(() => setItems([]))
  }, [])

  // devotee type-ahead inside the drawer (Item 27 fix)
  const [dq, setDq] = useState('')
  const [results, setResults] = useState([])
  const picked = drawer?.devotee
  useEffect(() => {
    // Require at least 4 characters for search (consistent with other forms)
    if (!drawer || picked || dq.trim().length < 4) { setResults([]); return }
    const t = setTimeout(() => {
      DevoteesAPI.list({ q: dq.trim(), size: 8 })
        .then((r) => setResults(Array.isArray(r) ? r : (r.items || [])))
        .catch(() => setResults([]))
    }, 200)
    return () => clearTimeout(t)
  }, [dq, picked, drawer])

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('')
    try {
      const [d, s] = await Promise.all([
        AuctionAPI.list({ q, status, verification, payment, start, end, page, size: SIZE }),
        AuctionAPI.stats().catch(() => null),
      ])
      setRows(d.items); setTotal(d.total); if (s) setStats(s)
    } catch (ex) {
      setLoadErr(ex?.detail || "Couldn't load auctions — check your connection and retry.")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q, status, verification, payment, start, end, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useEffect(() => { setPage(1) }, [q, status, verification, payment, start, end])

  async function save(e) {
    e.preventDefault()
    if (saving) return
    // Prevent scheduling auctions for past dates
    if (drawer.auction_date && drawer.auction_date < todayISO()) {
      toast(tr('Auction date cannot be in the past. Please select today or a future date.'), 'error')
      return
    }
    setSaving(true)
    try {
      await AuctionAPI.create({
        devotee_id: drawer.devotee?.id || null,
        item: drawer.item, description: drawer.description || null,
        base_amount: Number(drawer.base_amount) || 0,
        winner: drawer.winner || null,
        auction_date: drawer.auction_date || null, start_time: to12h(drawer.start_time) || null,
        notes: drawer.notes || null, status: 'Scheduled',
      })
      setDrawer(null); setDq(''); load()
    } catch (ex) {
      toast(ex?.detail || tr('Could not save the auction — check the base amount and details.'), 'error')
    } finally { setSaving(false) }
  }

  // Committee decision: record the highest bid + winner, optionally close the auction.
  async function recordResult(a) {
    // Prevent recording results for future dates (Item 28)
    if (a.auction_date && a.auction_date > todayISO()) {
      toast(tr('Cannot record results for future auctions. Please wait until the auction date.'), 'error')
      return
    }
    const res = await promptDialog({
      title: `${tr('Record result')} — ${tr(a.item)}`,
      confirmLabel: tr('Record Result'),
      fields: [
        { k: 'amount', label: tr('Highest bid (₹)'), type: 'number', required: true,
          defaultValue: String(a.current_amount || a.base_amount || ''),
          note: `Base amount ₹${Number(a.base_amount).toLocaleString('en-IN')} — the bid cannot be below it.` },
        { k: 'winner', label: tr('Winning bidder name'), defaultValue: a.winner || '' },
        { k: 'close', label: tr('Mark as Completed (winner finalised)'), type: 'checkbox' },
      ],
    })
    if (!res) return
    try {
      await AuctionAPI.update(a.id, {
        current_amount: Number(res.amount) || 0,
        winner: res.winner.trim() || null,
        status: res.close ? 'Completed' : 'In Progress',
      })
      toast(res.close ? tr('Auction completed.') : tr('Bid recorded.'))
      load()
    } catch (ex) {
      toast(ex?.detail || tr('Could not record the auction result.'), 'error')
    }
  }
  async function remove(a) { setMenu(null); if (await confirmDialog({ title: `${tr('Delete auction')} "${tr(a.item)}"?`, message: tr('It will be marked Void and excluded from totals.'), tone: 'danger', confirmLabel: tr('Delete') })) { await AuctionAPI.remove(a.id); toast(tr('Auction voided.')); load() } }
  const setM = (patch) => setDrawer((d) => ({ ...d, ...patch }))

  // Committee verify auction
  async function verifyAuction(a) {
    const ok = await confirmDialog({
      title: `${tr('Verify Auction')} — ${tr(a.item)}`,
      message: `${tr('Verify that')} ${personName({ name: a.winner }, lang)} ${tr('won the auction for')} ${inr(a.current_amount)}?`,
      confirmLabel: tr('Verify'),
    })
    if (!ok) return
    try {
      await AuctionAPI.verify(a.id)
      toast(tr('Auction verified successfully.'))
      load()
    } catch (ex) {
      toast(ex?.detail || tr('Could not verify the auction.'), 'error')
    }
  }

  // Committee reject auction
  async function rejectAuction(a) {
    const res = await promptDialog({
      title: `${tr('Reject Auction')} — ${tr(a.item)}`,
      confirmLabel: tr('Reject'),
      fields: [
        { k: 'reason', label: tr('Rejection Reason'), required: true, note: tr('Explain why this auction result is being rejected.') },
      ],
    })
    if (!res) return
    try {
      await AuctionAPI.reject(a.id, res.reason)
      toast(tr('Auction rejected.'))
      load()
    } catch (ex) {
      toast(ex?.detail || tr('Could not reject the auction.'), 'error')
    }
  }

  // Collect payment for verified auction
  const [payMode, setPayMode] = useState('Cash')
  const [payRef, setPayRef] = useState('')

  async function collectPayment(a) {
    setPayMode('Cash')
    setPayRef('')
    setPaymentModal(a)
  }

  async function submitPayment(e) {
    e.preventDefault()
    if (payMode === 'UPI/QR Code' && !payRef.trim()) {
      toast(tr('Transaction reference is required for UPI payments.'), 'error')
      return
    }
    try {
      const result = await AuctionAPI.payment(paymentModal.id, { mode: payMode, txn_ref: payRef.trim() })
      toast(tr('Payment collected successfully.'))
      setPaymentModal(null)
      setReceipt(result) // show receipt
      load()
    } catch (ex) {
      toast(ex?.detail || tr('Could not collect payment.'), 'error')
    }
  }

  // item selection → sets item name + prefills base amount from master if matched
  const onItemSelect = (val) => {
    const it = items.find((x) => x.name === val)
    if (it) setM({ itemChoice: String(it.id), item: it.name, base_amount: it.base_price ?? '' })
    else setM({ itemChoice: '__custom__', item: val })
  }

  const EXPORT_COLS = [{ key: 'code', label: tr('Auction ID') }, { key: 'item', label: tr('Item') }, { key: 'auction_date', label: tr('Date') },
    { key: 'base_amount', label: tr('Base (₹)'), type: 'money' }, { key: 'current_amount', label: tr('Highest Bid (₹)'), type: 'money' },
    { key: 'winner', label: tr('Winner') }, { key: 'status', label: tr('Status') },
    { key: 'verification_status', label: tr('Verification') }, { key: 'verified_by', label: tr('Verified By') },
    { key: 'payment_status', label: tr('Payment') }, { key: 'receipt_no', label: tr('Receipt No') }]
  const exportRows = rows
  const exportTotal = { code: 'Total', current_amount: rows.reduce((s, a) => s + Number(a.current_amount || 0), 0) }
  return (
    <div>
      <PageTitle title={tr("Auction Management")} subtitle={tr("Record temple auctions and their winning devotees.")}
        actions={<span className="inline-flex items-center gap-2"><ExportButtons title={tr("Auction Register")} columns={EXPORT_COLS} rows={exportRows} total={exportTotal} />{canWrite ? <button onClick={() => { setDrawer(emptyForm()); setDq('') }} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Create New Auction</T></button> : <span className="px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-blue-50 text-blue-700"><T>View only</T></span>}</span>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
        <StatTile icon={Gavel} color="#d97706" bg="bg-amber-50" title={tr("Total Auctions")} value={stats ? num(stats.total) : '—'} sub={tr("All Time")} />
        <StatTile icon={CalendarClock} color="#ea580c" bg="bg-orange-50" title={tr("Scheduled")} value={stats ? num(stats.scheduled) : '—'} sub={tr("Yet to Start")} />
        <StatTile icon={Users} color="#7c3aed" bg="bg-violet-50" title={tr("In Progress")} value={stats ? num(stats.in_progress) : '—'} sub={tr("Active Now")} />
        <StatTile icon={CheckCircle2} color="#3b82f6" bg="bg-blue-50" title={tr("Completed")} value={stats ? num(stats.completed) : '—'} sub={tr("Result Recorded")} />
        <StatTile icon={ShieldCheck} color="#059669" bg="bg-emerald-50" title={tr("Verified")} value={stats ? num(stats.verified) : '—'} sub={tr("Committee Approved")} />
        <StatTile icon={Banknote} color="#16a34a" bg="bg-green-50" title={tr("Payment Collected")} value={stats ? num(stats.paid) : '—'} sub={tr("Receipts Issued")} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search by Auction ID / Item / Winner</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search auction ID, item or winner…")} className="input !pl-9" /></div>
          </div>
          <div className="min-w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>From</T></label>
            <DateField value={start} onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd('') }} className="input" />
          </div>
          <div className="min-w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
            <DateField value={end} onChange={(e) => setEnd(e.target.value)} min={start} className="input" />
          </div>
          <div className="min-w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input"><option value="">{tr("All")}</option><option value="Scheduled">{tr("Scheduled")}</option><option value="In Progress">{tr("In Progress")}</option><option value="Completed">{tr("Completed")}</option></Select>
          </div>
          <div className="min-w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Verification</T></label>
            <Select value={verification} onChange={(e) => setVerification(e.target.value)} className="input"><option value="">{tr("All")}</option><option value="Pending">{tr("Pending")}</option><option value="Verified">{tr("Verified")}</option><option value="Rejected">{tr("Rejected")}</option></Select>
          </div>
          <div className="min-w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Payment</T></label>
            <Select value={payment} onChange={(e) => setPayment(e.target.value)} className="input"><option value="">{tr("All")}</option><option value="Pending">{tr("Pending")}</option><option value="Paid">{tr("Paid")}</option></Select>
          </div>
        </div>
        <SortFilterPanel
          sorts={sorts}
          filters={filters}
          columns={SORT_COLUMNS}
          onToggleSort={handleColumnClick}
          onRemoveSort={removeSort}
          onClearSorts={clearSorts}
          onClearFilter={clearFilter}
          onClearAllFilters={clearAllFilters}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Auction ID')}</th>
              {SORT_COLUMNS.slice(0, 2).map((col) => {
                const sortIdx = getSortIndex(col.key)
                const sortDir = getSortDirection(col.key)
                const isSorted = sortIdx >= 0
                return (
                  <th key={col.key} onClick={(e) => handleColumnClick(col.key, e)}
                    className={`group px-4 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-maroon-700 bg-maroon-50/50' : ''}`}
                    title={tr("Click to sort (↓→↑→clear). Shift+Click for multi-column sort.")}>
                    <span className="inline-flex items-center gap-0.5">
                      {col.key === 'current_amount' ? tr('Highest Bid (₹)') : tr(col.label)}
                      {isSorted ? (
                        <span className="inline-flex items-center gap-0.5 text-maroon-600 ml-1">
                          {sorts.length > 1 && sortIdx > 0 && <span className="text-[0.5625rem] font-bold">{sortIdx + 1}</span>}
                          {sortDir === 'desc' ? <ArrowDown size={13} strokeWidth={2.5} /> : <ArrowUp size={13} strokeWidth={2.5} />}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-gray-400 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronsUpDown size={14} strokeWidth={2} />
                        </span>
                      )}
                    </span>
                  </th>
                )
              })}
              {(() => {
                const col = SORT_COLUMNS.find(c => c.key === 'current_amount')
                const sortIdx = getSortIndex(col.key)
                const sortDir = getSortDirection(col.key)
                const isSorted = sortIdx >= 0
                return (
                  <th onClick={(e) => handleColumnClick(col.key, e)}
                    className={`group px-4 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-maroon-700 bg-maroon-50/50' : ''}`}
                    title={tr("Click to sort (↓→↑→clear). Shift+Click for multi-column sort.")}>
                    <span className="inline-flex items-center gap-0.5">
                      {tr('Highest Bid (₹)')}
                      {isSorted ? (
                        <span className="inline-flex items-center gap-0.5 text-maroon-600 ml-1">
                          {sorts.length > 1 && sortIdx > 0 && <span className="text-[0.5625rem] font-bold">{sortIdx + 1}</span>}
                          {sortDir === 'desc' ? <ArrowDown size={13} strokeWidth={2.5} /> : <ArrowUp size={13} strokeWidth={2.5} />}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-gray-400 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronsUpDown size={14} strokeWidth={2} />
                        </span>
                      )}
                    </span>
                  </th>
                )
              })()}
              <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Winner')}</th>
              {(() => {
                const col = SORT_COLUMNS.find(c => c.key === 'status')
                const sortIdx = getSortIndex(col.key)
                const sortDir = getSortDirection(col.key)
                const isSorted = sortIdx >= 0
                return (
                  <th onClick={(e) => handleColumnClick(col.key, e)}
                    className={`group px-4 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-maroon-700 bg-maroon-50/50' : ''}`}
                    title={tr("Click to sort (↓→↑→clear). Shift+Click for multi-column sort.")}>
                    <span className="inline-flex items-center gap-0.5">
                      {tr('Status')}
                      {isSorted ? (
                        <span className="inline-flex items-center gap-0.5 text-maroon-600 ml-1">
                          {sorts.length > 1 && sortIdx > 0 && <span className="text-[0.5625rem] font-bold">{sortIdx + 1}</span>}
                          {sortDir === 'desc' ? <ArrowDown size={13} strokeWidth={2.5} /> : <ArrowUp size={13} strokeWidth={2.5} />}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-gray-400 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronsUpDown size={14} strokeWidth={2} />
                        </span>
                      )}
                    </span>
                  </th>
                )
              })()}
              <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Verification')}</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Payment')}</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSortedRows.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[0.75rem] text-gray-500">{a.code}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{tr(a.item)}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="text-gray-700 text-[0.8125rem]">{fmtDate(a.auction_date)}</div><div className="text-[0.6875rem] text-gray-400">{a.start_time || ''}</div></td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{Number(a.current_amount) > 0 ? inr(a.current_amount) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-gray-600">{a.winner ? personName({ name: a.winner }, lang) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3"><Pill tone={STATUS_TONE[a.status] || 'gray'}>{tr(a.status)}</Pill></td>
                  <td className="px-4 py-3">
                    {a.status === 'Completed' && (
                      <Pill tone={VERIFY_TONE[a.verification_status] || 'gray'}>{tr(a.verification_status)}</Pill>
                    )}
                    {a.status !== 'Completed' && <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {a.verification_status === 'Verified' ? (
                      <Pill tone={PAYMENT_TONE[a.payment_status] || 'gray'}>{tr(a.payment_status)}</Pill>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 relative flex-wrap">
                      <button onClick={() => setView(a)} title={tr("View details")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                      {/* Record Result button - for non-completed auctions */}
                      {canWrite && a.status !== 'Completed' && a.status !== 'Void' && (
                        <button onClick={() => recordResult(a)} title={tr("Record bid / winner / close")} className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-violet-200 text-violet-700 text-[0.78125rem] font-semibold hover:bg-violet-50"><T>Record</T></button>
                      )}
                      {/* Committee Verify/Reject buttons - for completed auctions pending verification */}
                      {isCommittee && a.status === 'Completed' && a.verification_status === 'Pending' && (
                        <>
                          <button onClick={() => verifyAuction(a)} title={tr("Verify auction result")} className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-emerald-200 text-emerald-700 text-[0.78125rem] font-semibold hover:bg-emerald-50"><ShieldCheck size={14} /><T>Verify</T></button>
                          <button onClick={() => rejectAuction(a)} title={tr("Reject auction result")} className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-red-200 text-red-700 text-[0.78125rem] font-semibold hover:bg-red-50"><XCircle size={14} /><T>Reject</T></button>
                        </>
                      )}
                      {/* Collect Payment button - for verified auctions pending payment */}
                      {canWrite && a.verification_status === 'Verified' && a.payment_status === 'Pending' && (
                        <button onClick={() => collectPayment(a)} title={tr("Collect payment from winner")} className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-green-200 text-green-700 text-[0.78125rem] font-semibold hover:bg-green-50"><Banknote size={14} /><T>Payment</T></button>
                      )}
                      {/* Print Receipt button - for paid auctions */}
                      {a.payment_status === 'Paid' && (
                        <button onClick={() => setReceipt(a)} title={tr("Print receipt")} className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-blue-200 text-blue-700 text-[0.78125rem] font-semibold hover:bg-blue-50"><Receipt size={14} /><T>Receipt</T></button>
                      )}
                      <button onClick={() => setMenu(menu === a.id ? null : a.id)} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700 hover:border-maroon-300"><MoreVertical size={15} /></button>
                      {menu === a.id && (
                        <div className="absolute right-0 top-9 z-20 bg-white border border-gray-100 rounded-lg shadow-lg py-1 w-36 text-sm">
                          <button onClick={() => { setView(a); setMenu(null) }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-600"><Eye size={14} />{' '}<T>View</T></button>
                          {isAdmin && <button onClick={() => remove(a)} className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600"><Trash2 size={14} />{' '}<T>Delete</T></button>}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredSortedRows.length === 0 && <TableStates colSpan={9} loading={loading} error={loadErr} onRetry={load} empty={tr("No auctions found.")} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit={tr("auctions")} />
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 text-[0.8125rem] text-gray-600 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-3">
        <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />{' '}<T>Auction workflow: Create auction → Record result → Committee verifies → Collect payment → Print receipt. Committee members can verify or reject completed auctions.</T>
      </div>

      {/* ── Create New Auction drawer ── */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Create New Auction</T></h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Create a new auction for items, materials or rights.</T></p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-5 flex-1">
              <div className="flex items-center gap-2 text-maroon-700 font-semibold text-[0.875rem]"><T>1. Auction Details</T></div>
              <div><label className="label"><T>Auction Item *</T></label>
                <Combobox
                  value={drawer.item}
                  onChange={(e) => onItemSelect(e.target.value)}
                  options={items.map((it) => it.name)}
                  placeholder={tr("Select or type item name")}
                  className="input"
                />
              </div>
              <div><label className="label"><T>Base Amount (₹) *</T></label>
                <NumberField required min="0" step="1" prefix="₹" placeholder={tr("0")} value={drawer.base_amount} onChange={(e) => setM({ base_amount: e.target.value })} />
              </div>
              <div><label className="label"><T>Devotee (Optional)</T></label>
                {!drawer.devotee ? (
                  <div className="relative">
                    <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input className="input pr-9" placeholder={tr("Search name or mobile number…")} value={dq} onChange={(e) => setDq(e.target.value)} />
                    {results.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-gray-100 rounded-lg shadow-lg py-1">
                        {results.map((d) => (
                          <button type="button" key={d.id} onClick={() => { setM({ devotee: d, winner: d.name }); setResults([]); setDq('') }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-amber-50 text-amber-700 grid place-items-center text-[0.75rem] font-bold">{d.name[0]}</span>
                            <span><span className="font-semibold text-gray-800 text-[0.8125rem]">{personName(d, lang)}</span><span className="block text-[0.6875rem] text-gray-400">{d.code} · {d.mobile}</span></span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-3.5 py-3 bg-gray-50/50">
                    <div className="w-10 h-10 rounded-full bg-maroon-700 text-cream grid place-items-center"><User size={18} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className="font-semibold text-gray-800">{personName(drawer.devotee, lang)}</span><Pill tone="green"><T>Registered</T></Pill></div>
                      <div className="text-[0.75rem] text-gray-500">Mobile: {drawer.devotee.mobile}</div>
                    </div>
                    <button type="button" onClick={() => { setM({ devotee: null }); setDq('') }} className="text-gray-400 hover:text-red-600"><X size={17} /></button>
                  </div>
                )}
              </div>
              <div><label className="label"><T>Winner / Highest Bidder (Optional)</T></label><input className="input" placeholder={tr("Enter Winner / Highest Bidder Name")} value={personName({ name: drawer.winner }, lang)} onChange={(e) => setM({ winner: sanitizeName(e.target.value) })} /></div>
              <div><label className="label"><T>Description (Optional)</T></label>
                <textarea className="input min-h-[5.625rem]" maxLength={250} placeholder={tr("Enter description…")} value={drawer.description} onChange={(e) => setM({ description: e.target.value })} />
                <div className="text-right text-[0.6875rem] text-gray-400 mt-0.5">{drawer.description.length} / 250</div></div>
              <div><label className="label"><T>Auction Date *</T></label>
                <DateField required min={todayISO()} value={drawer.auction_date} onChange={(e) => setM({ auction_date: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label"><T>Start Time *</T></label>
                  <TimeField required value={drawer.start_time} onChange={(e) => setM({ start_time: e.target.value })} /></div>
                <div><label className="label"><T>Notes (Optional)</T></label>
                  <textarea className="input min-h-[2.75rem]" maxLength={250} placeholder={tr("Enter notes…")} value={drawer.notes} onChange={(e) => setM({ notes: e.target.value })} />
                  <div className="text-right text-[0.6875rem] text-gray-400 mt-0.5">{drawer.notes.length} / 250</div></div>
              </div>
              <div className="bg-amber-50/60 border border-amber-100 rounded-lg px-4 py-3.5">
                <div className="flex items-center gap-2 text-[0.8125rem] font-semibold text-amber-700 mb-2"><Info size={15} />{' '}<T>Note</T></div>
                <p className="text-[0.78125rem] text-gray-600"><T>This records the auction and its winning devotee. Live bid-by-bid tracking and on-system payment receipts are not yet available — settle the winning payment at the counter and record it there.</T></p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60">{saving ? tr('Saving…') : <T>Create Auction</T>}</button>
            </div>
          </form>
        </div>
      )}

      {/* ── View drawer (read-only) ── */}
      {view && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setView(null)} />
          <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Auction Details</T></h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5 font-mono">{view.code}</p></div>
              <button onClick={() => setView(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <VField label={tr("Item Name")} value={tr(view.item)} wide />
                <VField label={tr("Description")} value={view.description || '—'} wide />
                <VField label={tr("Auction Date")} value={fmtDate(view.auction_date)} />
                <VField label={tr("Start Time")} value={view.start_time || '—'} />
                <VField label={tr("No. of Bidders")} value={view.bids} />
                <VField label={tr("Status")} value={<Pill tone={STATUS_TONE[view.status] || 'gray'}>{tr(view.status)}</Pill>} />
                <VField label={tr("Highest Bid")} value={Number(view.current_amount) > 0 ? inr(view.current_amount) : '—'} />
                <VField label={tr("Winner")} value={view.winner ? personName({ name: view.winner }, lang) : '—'} />
                <VField label={tr("Notes")} value={view.notes || '—'} wide />
              </div>
              {/* Verification Section */}
              {view.status === 'Completed' && (
                <div className="border-t border-gray-100 pt-4 mt-4">
                  <h4 className="text-[0.8125rem] font-semibold text-gray-700 mb-3"><T>Committee Verification</T></h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                    <VField label={tr("Verification Status")} value={<Pill tone={VERIFY_TONE[view.verification_status] || 'gray'}>{tr(view.verification_status)}</Pill>} />
                    {view.verified_by && <VField label={tr("Verified By")} value={view.verified_by} />}
                    {view.verified_at && <VField label={tr("Verified At")} value={fmtStamp(view.verified_at)} />}
                    {view.rejection_reason && <VField label={tr("Rejection Reason")} value={view.rejection_reason} wide />}
                  </div>
                </div>
              )}
              {/* Payment Section */}
              {view.verification_status === 'Verified' && (
                <div className="border-t border-gray-100 pt-4 mt-4">
                  <h4 className="text-[0.8125rem] font-semibold text-gray-700 mb-3"><T>Payment Details</T></h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                    <VField label={tr("Payment Status")} value={<Pill tone={PAYMENT_TONE[view.payment_status] || 'gray'}>{tr(view.payment_status)}</Pill>} />
                    {view.payment_mode && <VField label={tr("Payment Mode")} value={view.payment_mode} />}
                    {view.payment_ref && <VField label={tr("Transaction Ref")} value={view.payment_ref} />}
                    {view.receipt_no && <VField label={tr("Receipt No")} value={view.receipt_no} />}
                    {view.paid_at && <VField label={tr("Paid At")} value={fmtStamp(view.paid_at)} />}
                    {view.paid_by && <VField label={tr("Collected By")} value={view.paid_by} />}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white flex gap-3">
              {view.payment_status === 'Paid' && (
                <button onClick={() => { setReceipt(view); setView(null) }} className="btn-outline flex-1 justify-center"><Receipt size={16} className="mr-1" /><T>Print Receipt</T></button>
              )}
              <button onClick={() => setView(null)} className="btn-maroon flex-1 justify-center"><T>Close</T></button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Collection Modal ── */}
      {paymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPaymentModal(null)} />
          <form onSubmit={submitPayment} className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Collect Payment</T></h3>
              <button type="button" onClick={() => setPaymentModal(null)} className="text-gray-400 hover:text-maroon-700"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-1">
                <div className="text-[0.75rem] text-gray-500"><T>Auction</T></div>
                <div className="font-semibold text-gray-800">{tr(paymentModal.item)}</div>
                <div className="text-[0.8125rem] text-gray-600"><T>Winner</T>: {personName({ name: paymentModal.winner }, lang)}</div>
                <div className="text-lg font-bold text-maroon-700">{inr(paymentModal.current_amount)}</div>
              </div>
              <div>
                <label className="label"><T>Payment Mode *</T></label>
                <Select value={payMode} onChange={(e) => setPayMode(e.target.value)} className="input">
                  <option value="Cash">{tr("Cash")}</option>
                  <option value="UPI/QR Code">{tr("UPI/QR Code")}</option>
                </Select>
              </div>
              <div>
                <label className="label"><T>Transaction Reference</T></label>
                <input value={payRef} onChange={(e) => setPayRef(e.target.value)} className="input" placeholder={tr("UPI transaction ID / UTR")} />
                <div className="text-[0.6875rem] text-gray-400 mt-1"><T>Required for UPI payments</T></div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => setPaymentModal(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button type="submit" className="btn-maroon flex-1 justify-center"><Banknote size={16} className="mr-1" /><T>Collect</T></button>
            </div>
          </form>
        </div>
      )}

      {/* ── Simple Receipt Modal (for printing) ── */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setReceipt(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Auction Receipt</T></h3>
              <button onClick={() => setReceipt(null)} className="text-gray-400 hover:text-maroon-700"><X size={18} /></button>
            </div>
            <div id="auction-receipt" className="px-6 py-5 bg-white">
              {/* Simple receipt - no temple branding as per client request */}
              <div className="text-center border-b border-dashed border-gray-300 pb-4 mb-4">
                <div className="text-lg font-bold text-gray-800"><T>Auction Payment Receipt</T></div>
                <div className="text-[0.75rem] text-gray-500 mt-1">{fmtDate(receipt.paid_at)}</div>
              </div>
              <div className="space-y-3 text-[0.875rem]">
                <div className="flex justify-between"><span className="text-gray-500"><T>Receipt No</T>:</span><span className="font-mono font-semibold">{receipt.receipt_no}</span></div>
                <div className="flex justify-between"><span className="text-gray-500"><T>Auction ID</T>:</span><span className="font-mono">{receipt.code}</span></div>
                <div className="flex justify-between"><span className="text-gray-500"><T>Item</T>:</span><span className="font-semibold">{tr(receipt.item)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500"><T>Winner</T>:</span><span className="font-semibold">{personName({ name: receipt.winner }, lang)}</span></div>
                <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-3 mt-3">
                  <span><T>Amount Paid</T>:</span><span className="text-maroon-700">{inr(receipt.current_amount)}</span>
                </div>
                <div className="flex justify-between text-[0.8125rem]"><span className="text-gray-500"><T>Mode</T>:</span><span>{receipt.payment_mode}</span></div>
                {receipt.payment_ref && <div className="flex justify-between text-[0.8125rem]"><span className="text-gray-500"><T>Ref</T>:</span><span className="font-mono text-[0.75rem]">{receipt.payment_ref}</span></div>}
              </div>
              <div className="border-t border-dashed border-gray-300 pt-4 mt-4 text-center text-[0.6875rem] text-gray-400">
                <T>This is a computer-generated receipt</T>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setReceipt(null)} className="btn-outline flex-1 justify-center"><T>Close</T></button>
              <button onClick={() => { window.print() }} className="btn-maroon flex-1 justify-center"><Printer size={16} className="mr-1" /><T>Print</T></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function VField({ label, value, wide }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[0.6875rem] text-gray-400 mb-0.5">{label}</div>
      <div className="text-[0.8125rem] text-gray-800 font-medium break-words">{value ?? '—'}</div>
    </div>
  )
}
