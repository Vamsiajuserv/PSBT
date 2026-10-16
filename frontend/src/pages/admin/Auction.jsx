import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  Plus, X, Eye, Search, RotateCcw, Info, Trash2,
  Gavel, CalendarClock, Users, CheckCircle2, User, ShieldCheck,
  XCircle, Banknote, Receipt, Printer, ArrowUp, ArrowDown, ChevronsUpDown, Pencil, PackageX, Boxes,
} from 'lucide-react'
import { StockAuctionDrawer, LotResultModal, LotBuyersModal, saleAsPayable, tagRange, lotPaidCount } from './auction/LotAuction.jsx'
import { PageTitle, StatTile, KpiGrid, Pill, Pager, inr, num, fmtDate, fmtStamp } from '../../components/admin/ui.jsx'
import { AuctionAPI, AuctionItemsAPI, DevoteesAPI, getErrorMessage } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { TableStates } from '../../components/common/states.jsx'
import { useFilterableSortableTable, SortFilterPanel, SortableFilterableTh, filtersToParam } from '../../components/common/SortableTable.jsx'
import ExportButtons from '../../components/common/ExportButtons.jsx'
import { Select, DateField, TimeField, NumberField, Combobox } from '../../components/common/Field.jsx'
import { confirmDialog, promptDialog, toast } from '../../components/common/Dialog.jsx'
import { T, tr, clock12, personName, useLang } from '../../i18n/LanguageContext.jsx'
import { sanitizeName } from '../../lib/validation.js'
import { useFilterParams } from '../../hooks/useUrlState.js'

const STATUS_TONE = { Scheduled: 'blue', 'In Progress': 'amber', Completed: 'green', Unsold: 'orange', Void: 'gray' }
// "Completed" is stored for a sold auction (reports and daily closing count it); shown as "Sold".
const statusLabel = (s) => (s === 'Completed' ? 'Sold' : s)
const RESULT_STATES = ['Completed', 'Unsold']
// Stored payment mode → what staff call it
const modeLabel = (m) => (m === 'UPI/QR Code' ? 'Online' : m || '')
const VERIFY_TONE = { Pending: 'gray', Verified: 'green', Rejected: 'red' }
const PAYMENT_TONE = { Pending: 'amber', 'Partially Paid': 'blue', Paid: 'green' }

// Sortable columns configuration with filtering support
const SORT_COLUMNS = [
  { key: 'item', label: 'Item Name', type: 'text' },
  { key: 'auction_date', label: 'Auction Date', type: 'date' },
  { key: 'current_amount', label: 'Highest Bid', type: 'number' },
  { key: 'status', label: 'Status', type: 'text', filterable: true, filterOptions: ['Scheduled', 'In Progress', 'Completed', 'Unsold'] },
]
const todayISO = () => new Date().toISOString().slice(0, 10)
// Stored form ("09:00 AM") — always English, whatever the screen language;
// clock12() localises it for display.
const to12h = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 || 12
  return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`
}
// "09:00 AM" → "09:00" for the time picker
const to24h = (t) => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((t || '').trim())
  if (!m) return ''
  let h = Number(m[1]) % 12
  if (m[3].toUpperCase() === 'PM') h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const emptyForm = () => ({ mode: 'create', itemChoice: '', item: '', base_amount: '', devotee: null, winner: '', description: '', auction_date: '', start_time: '', notes: '' })

export default function Auction() {
  const { lang } = useLang()
  const { user } = useAuth()
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)
  const isCommittee = user?.role === 'Committee'
  // Matches the backend (WRITE_MATRIX): Counter Staff and Committee run auctions — create,
  // record result, re-auction. Payment is Counter Staff only. Only the Committee approves or rejects a
  // result, and only the Administrator edits details.
  const canWrite = ['Admin', 'Administrator', 'Committee', 'Counter Staff'].includes(user?.role)
  const canSeeAmounts = ['Admin', 'Administrator', 'Committee', 'Accountant', 'Counter Staff'].includes(user?.role)
  // Payment is collected at the counter — not by the Committee, which approves the result
  const canCollect = isAdmin || user?.role === 'Counter Staff'
  // The person who created the auction or recorded its result cannot approve it (maker-checker)
  const canDecide = (a) => isCommittee && RESULT_STATES.includes(a.status) && a.verification_status === 'Pending'
    && a.payment_status !== 'Paid' && ![a.created_by, a.result_by].includes(user?.username)
  const SIZE = 15
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [loadErr, setLoadErr] = useState('')
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [view, setView] = useState(null)
  const [receipt, setReceipt] = useState(null) // for printing receipt
  const [paymentModal, setPaymentModal] = useState(null) // for payment collection
  const [resultModal, setResultModal] = useState(null) // Record Result: { a, outcome, amount, bids, winner }
  // Lot auctions from stock: create drawer, per-buyer result, buyers & payments
  const [stockDrawer, setStockDrawer] = useState(false)
  const [lotResult, setLotResult] = useState(null)
  const [lotBuyers, setLotBuyers] = useState(null)

  // filters - persisted in URL for state preservation across navigation
  const {
    q, setQ, status, setStatus, verification, setVerification,
    payment, setPayment, start, setStart, end, setEnd, page, setPage, setFilters,
  } = useFilterParams({
    q: '', status: '', verification: '', payment: '', start: '', end: '', page: 1,
  })
  const [saving, setSaving] = useState(false)

  // State for all filtered records (for export when date filter applied)
  const [allFilteredData, setAllFilteredData] = useState([])
  const [loadingExport, setLoadingExport] = useState(false)

  // Sorting with filtering
  const {
    filteredSortedRows,
    sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection,
    filters, toggleFilterValue, clearFilter, clearAllFilters, getFilterValues,
  } = useFilterableSortableTable(rows, SORT_COLUMNS, [], {}, { manualSort: true, manualFilter: true })

  // Sorting and column filters run on the server so they cover every record, not just the
  // visible page; changing either reloads from page 1. With no column chosen the date
  // column is used — oldest first when a date filter is applied, newest first otherwise.
  const [listTrigger, setListTrigger] = useState(0)
  const prevSortsRef = useRef(sorts)
  const prevFiltersRef = useRef(filters)
  useEffect(() => {
    const filtersChanged = prevFiltersRef.current !== filters
    if (prevSortsRef.current === sorts && !filtersChanged) return
    prevSortsRef.current = sorts
    prevFiltersRef.current = filters
    setPage(1)
    // A filter change also refreshes the export data; a sort change only reloads the list
    if (filtersChanged) setReloadTrigger((t) => t + 1)
    else setListTrigger((t) => t + 1)
  }, [sorts, filters]) // eslint-disable-line react-hooks/exhaustive-deps
  const displayRows = filteredSortedRows

  // Fetch ALL filtered records for export when date filter is applied
  const fetchAllFiltered = useCallback(async () => {
    if (!start && !end) {
      setAllFilteredData([])
      return
    }
    setLoadingExport(true)
    try {
      const d = await AuctionAPI.list({ q, status, verification, payment, start, end, page: 1, size: 10000, col_filters: filtersToParam(filters) })
      const items = d.items || []
      // Sort by date ascending (oldest first)
      items.sort((a, b) => (a.auction_date || '').localeCompare(b.auction_date || ''))
      setAllFilteredData(items)
    } catch (err) {
      toast(tr('Failed to fetch all records'), 'error')
      setAllFilteredData([])
    } finally {
      setLoadingExport(false)
    }
  }, [q, status, verification, payment, start, end])

  // Fetch all data for export ONLY when Apply button is clicked (reloadTrigger changes)
  // User must click Apply to filter - no auto-fetch on date change
  useEffect(() => {
    if (start || end) {
      setLoadingExport(true)
      AuctionAPI.list({ q, status, verification, payment, start, end, page: 1, size: 10000, col_filters: filtersToParam(filters) })
        .then((d) => {
          const items = d.items || []
          items.sort((a, b) => (a.auction_date || '').localeCompare(b.auction_date || ''))
          setAllFilteredData(items)
        })
        .catch(() => {
          toast(tr('Failed to fetch all records'), 'error')
          setAllFilteredData([])
        })
        .finally(() => setLoadingExport(false))
    } else {
      setAllFilteredData([])
    }
  }, [reloadTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // Require at least 1 character for search (consistent with Annadanam/Donations)
    if (!drawer || picked || dq.trim().length < 1) { setResults([]); return }
    const t = setTimeout(() => {
      // Use lookup endpoint - available to all authenticated users (no module restriction)
      DevoteesAPI.lookup({ q: dq.trim(), size: 8 })
        .then((r) => setResults(r.items || []))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [dq, picked, drawer])

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('')
    try {
      const [d, s] = await Promise.all([
        AuctionAPI.list({ q, status, verification, payment, start, end, page, size: SIZE, sort_by: sorts[0]?.key || 'auction_date', sort_dir: sorts[0]?.direction || ((start || end) ? 'asc' : 'desc'), col_filters: filtersToParam(filters) }),
        AuctionAPI.stats().catch(() => null),
      ])
      setRows(d.items); setTotal(d.total); if (s) setStats(s)
    } catch (ex) {
      setLoadErr(ex?.detail || tr("Couldn't load auctions — check your connection and retry."))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q, status, verification, payment, start, end, page, sorts, filters])
  // Load on initial mount, page changes, or reload trigger
  useEffect(() => { load() }, [page, reloadTrigger, listTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e) {
    e.preventDefault()
    if (saving) return
    const d = drawer
    // Prevent scheduling auctions for past dates (an edit may keep an existing past date)
    if (d.mode !== 'edit' && d.auction_date && d.auction_date < todayISO()) {
      toast(tr('Auction date cannot be in the past. Please select today or a future date.'), 'error')
      return
    }
    if (d.mode === 'edit' && (d.reason || '').trim().length < 5) {
      document.getElementById('auction-reason')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      toast(tr('Enter the reason for the change (at least 5 characters).'), 'error')
      return
    }
    setSaving(true)
    try {
      if (d.mode === 'reauction') {
        const r = await AuctionAPI.reauction(d.orig.id, {
          auction_date: d.auction_date, start_time: to12h(d.start_time),
          base_amount: Number(d.base_amount) || null, notes: d.notes || null,
        })
        toast(`${tr('Re-auction scheduled')}: ${r.code}`)
      } else if (d.mode === 'edit') {
        // Send only what changed; the server records old → new with the reason
        const o = d.orig
        const next = {
          item: d.item.trim(), description: d.description || '', base_amount: Number(d.base_amount) || 0,
          auction_date: d.auction_date || null, start_time: to12h(d.start_time) || null, notes: d.notes || '',
        }
        if (o.from_stock) delete next.base_amount   // per-piece base is fixed; results go through Record Result
        if (RESULT_STATES.includes(o.status) && !o.from_stock) {
          next.bids = Number(d.bids) || 0
          if (o.status === 'Completed') { next.winner = d.winner.trim(); next.current_amount = Number(d.current_amount) || 0 }
        }
        const prev = { item: o.item, description: o.description || '', base_amount: Number(o.base_amount), auction_date: o.auction_date,
          start_time: o.start_time || null, notes: o.notes || '', bids: o.bids, winner: o.winner || '', current_amount: Number(o.current_amount) }
        const body = Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== prev[k]))
        if (!Object.keys(body).length) { toast(tr('Nothing was changed.'), 'error'); return }
        const r = await AuctionAPI.edit(o.id, { ...body, reason: d.reason.trim() })
        toast(r.verification_status === 'Pending' && o.verification_status === 'Verified'
          ? tr('Auction updated — sent back for committee approval.') : tr('Auction updated.'))
      } else {
        await AuctionAPI.create({
          devotee_id: d.devotee?.id || null,
          item: d.item, description: d.description || null,
          base_amount: Number(d.base_amount) || 0,
          winner: d.winner || null,
          auction_date: d.auction_date || null, start_time: to12h(d.start_time) || null,
          notes: d.notes || null, status: 'Scheduled',
        })
      }
      setDrawer(null); setDq(''); load()
    } catch (ex) {
      toast(errText(ex, d.mode === 'create' ? 'Could not save the auction — check the base amount and details.' : 'Could not save the changes.'), 'error')
    } finally { setSaving(false) }
  }

  // Administrator: correct details before payment (reason mandatory)
  const openEdit = (a) => setDrawer({
    ...emptyForm(), mode: 'edit', orig: a, item: a.item, base_amount: String(Number(a.base_amount)),
    description: a.description || '', auction_date: a.auction_date || '', start_time: to24h(a.start_time),
    notes: a.notes || '', winner: a.winner || '', current_amount: String(Number(a.current_amount || 0)),
    bids: String(a.bids ?? 0), reason: '',
  })
  // Counter / Committee: schedule a new auction for an approved Unsold item
  const openReauction = (a) => setDrawer({
    ...emptyForm(), mode: 'reauction', orig: a, item: a.item,
    base_amount: String(Number(a.from_stock ? a.pieces[0]?.base_price : a.base_amount)),
    description: a.description || '', notes: `${tr('Re-auction of')} ${a.code}`,
    auction_date: todayISO(), start_time: to24h(a.start_time),   // pre-filled; staff adjust as needed
  })

  // Record the result: bids so far, Sold (winner + amount) or Unsold. Sold / Unsold go to the committee.
  function recordResult(a) {
    if (a.from_stock) { setLotResult(a); return }
    setResultModal({ a, outcome: a.status === 'Unsold' ? 'Unsold' : 'Completed',
      amount: String(Number(a.current_amount || a.base_amount || 0)), bids: String(a.bids ?? 0), winner: a.winner || '' })
  }
  async function submitResult(e) {
    e.preventDefault()
    const m = resultModal, a = m.a
    if (RESULT_STATES.includes(m.outcome) && a.auction_date && a.auction_date > todayISO()) {
      toast(tr('Cannot record results for future auctions. Please wait until the auction date.'), 'error')
      return
    }
    try {
      await AuctionAPI.update(a.id, m.outcome === 'Unsold'
        ? { status: 'Unsold', bids: Number(m.bids) || 0 }
        : { status: m.outcome, bids: Number(m.bids) || 0, current_amount: Number(m.amount) || 0, winner: m.winner.trim() || null })
      toast(m.outcome === 'In Progress' ? tr('Bid recorded.') : tr('Result recorded — sent to the committee for approval.'))
      setResultModal(null); load()
    } catch (ex) {
      toast(errText(ex, 'Could not record the auction result.'), 'error')
    }
  }
  async function remove(a) { if (await confirmDialog({ title: `${tr('Delete auction')} "${tr(a.item)}"?`, message: tr('It will be marked Void and excluded from totals.'), tone: 'danger', confirmLabel: tr('Delete') })) { await AuctionAPI.remove(a.id); toast(tr('Auction voided.')); load() } }
  const setM = (patch) => setDrawer((d) => ({ ...d, ...patch }))

  // Committee verify auction
  async function verifyAuction(a) {
    const ok = await confirmDialog({
      title: `${tr('Approve Result')} — ${tr(a.item)}`,
      message: a.from_stock
        ? `${tr('Approve')}: ${a.pieces.filter((p) => p.result === 'Sold').length} ${tr('sold to')} ${a.sales.length} ${tr('buyer(s) for')} ${inr(a.current_amount)}; ${a.pieces.filter((p) => p.result !== 'Sold').length} ${tr('unsold go back to store.')}`
        : a.status === 'Unsold'
        ? tr('Approve that this item was not sold? It can then be re-auctioned.')
        : `${tr('Verify that')} ${personName({ name: a.winner }, lang)} ${tr('won the auction for')} ${inr(a.current_amount)}?`,
      confirmLabel: tr('Approve'),
    })
    if (!ok) return
    try {
      await AuctionAPI.verify(a.id)
      toast(tr('Result approved.'))
      load()
    } catch (ex) {
      toast(errText(ex, 'Could not verify the auction.'), 'error')
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
      toast(errText(ex, 'Could not reject the auction.'), 'error')
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
      toast(tr('Transaction reference is required for online payments.'), 'error')
      return
    }
    try {
      const body = { mode: payMode, txn_ref: payRef.trim() }
      if (paymentModal.saleId) {
        // Lot auction: this buyer only; the receipt shows their pieces
        const au = await AuctionAPI.salePayment(paymentModal.id, paymentModal.saleId, body)
        setReceipt(saleAsPayable(au, au.sales.find((x) => x.id === paymentModal.saleId)))
        setLotBuyers(null)
      } else {
        setReceipt(await AuctionAPI.payment(paymentModal.id, body)) // show receipt
      }
      toast(tr('Payment collected successfully.'))
      setPaymentModal(null)
      load()
    } catch (ex) {
      toast(errText(ex, 'Could not collect payment.'), 'error')
    }
  }

  // item selection → sets item name + prefills base amount from master if matched
  const onItemSelect = (val) => {
    const it = items.find((x) => x.name === val)
    if (it) setM({ itemChoice: String(it.id), item: it.name, base_amount: it.base_price ?? '' })
    else setM({ itemChoice: '__custom__', item: val })
  }

  const ALL_EXPORT_COLS = [{ key: 'code', label: tr('Auction ID') }, { key: 'item', label: tr('Item') }, { key: 'auction_date', label: tr('Date') },
    { key: 'base_amount', label: tr('Base (₹)'), type: 'money' }, { key: 'current_amount', label: tr('Highest Bid (₹)'), type: 'money' },
    { key: 'winner', label: tr('Winner') }, { key: 'status', label: tr('Status') },
    { key: 'verification_status', label: tr('Verification') }, { key: 'verified_by', label: tr('Verified By') },
    { key: 'payment_status', label: tr('Payment') }, { key: 'payment_mode_label', label: tr('Payment Mode') },
    { key: 'payment_ref', label: tr('Transaction Ref') }, { key: 'receipt_no', label: tr('Receipt No') }]
  // Hide money columns for non-finance roles
  const EXPORT_COLS = canSeeAmounts ? ALL_EXPORT_COLS : ALL_EXPORT_COLS.filter(c => c.type !== 'money')
  // Use allFilteredData when date filter applied (ALL records), otherwise use current page
  const dataForExport = ((start || end) ? allFilteredData : displayRows)
    .map((r) => ({ ...r, payment_mode_label: r.from_stock
      // a lot: each buyer pays on their own — list the modes used
      ? [...new Set((r.sales || []).filter((x) => x.payment_status === 'Paid').map((x) => tr(modeLabel(x.payment_mode))))].join(', ')
      : r.payment_status === 'Paid' ? tr(modeLabel(r.payment_mode)) : '' }))
  const exportRows = canSeeAmounts ? dataForExport : dataForExport.map(r => ({ ...r, base_amount: null, current_amount: null }))
  const exportTotal = canSeeAmounts ? { code: 'Total', current_amount: dataForExport.reduce((s, a) => s + Number(a.current_amount || 0), 0) } : null
  return (
    <div>
      <PageTitle title={tr("Auction Management")} subtitle={tr("Record temple auctions and their winning devotees.")}
        actions={<span className="inline-flex items-center gap-2"><ExportButtons title={tr("Auction Register")} columns={EXPORT_COLS} rows={exportRows} total={exportTotal} />{canWrite ? <><button onClick={() => setStockDrawer(true)} className="btn-outline !py-2.5"><Boxes size={16} />{' '}<T>Auction from Stock</T></button><button onClick={() => { setDrawer(emptyForm()); setDq('') }} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Create New Auction</T></button></> : <span className="px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-blue-50 text-blue-700"><T>View only</T></span>}</span>} />

      {(
        <KpiGrid>
          <StatTile icon={Gavel} color="#d97706" bg="bg-amber-50" title={tr("Total Auctions")} value={stats ? num(stats.total) : '—'} sub={tr("All Time")} />
          <StatTile icon={CalendarClock} color="#ea580c" bg="bg-orange-50" title={tr("Scheduled")} value={stats ? num(stats.scheduled) : '—'} sub={tr("Yet to Start")} />
          <StatTile icon={Users} color="#7c3aed" bg="bg-violet-50" title={tr("In Progress")} value={stats ? num(stats.in_progress) : '—'} sub={tr("Active Now")} />
          <StatTile icon={CheckCircle2} color="#3b82f6" bg="bg-blue-50" title={tr("Sold")} value={stats ? num(stats.completed) : '—'} sub={tr("Result Recorded")} />
          <StatTile icon={PackageX} color="#ea580c" bg="bg-orange-50" title={tr("Unsold")} value={stats ? num(stats.unsold) : '—'} sub={tr("No valid bid")} />
          <StatTile icon={ShieldCheck} color="#059669" bg="bg-emerald-50" title={tr("Verified")} value={stats ? num(stats.verified) : '—'} sub={tr("Committee Approved")} />
          <StatTile icon={Banknote} color="#16a34a" bg="bg-green-50" title={tr("Payment Collected")} value={stats ? num(stats.paid) : '—'} sub={tr("Receipts Issued")} />
        </KpiGrid>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[10rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search by Auction ID / Item / Winner</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search auction ID, item, winner or piece ID…")} className="input !pl-9" /></div>
          </div>
          <div className="w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>From</T></label>
            <DateField value={start} onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd('') }} className="input" />
          </div>
          <div className="w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
            <DateField value={end} onChange={(e) => setEnd(e.target.value)} min={start} className="input" />
          </div>
          <div className="w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input"><option value="">{tr("All")}</option><option value="Scheduled">{tr("Scheduled")}</option><option value="In Progress">{tr("In Progress")}</option><option value="Completed">{tr("Sold")}</option><option value="Unsold">{tr("Unsold")}</option></Select>
          </div>
          <div className="w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Verification</T></label>
            <Select value={verification} onChange={(e) => setVerification(e.target.value)} className="input"><option value="">{tr("All")}</option><option value="Pending">{tr("Pending")}</option><option value="Verified">{tr("Verified")}</option><option value="Rejected">{tr("Rejected")}</option></Select>
          </div>
          <div className="w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Payment</T></label>
            <Select value={payment} onChange={(e) => setPayment(e.target.value)} className="input"><option value="">{tr("All")}</option><option value="Pending">{tr("Pending")}</option><option value="Partially Paid">{tr("Partially Paid")}</option><option value="Paid">{tr("Paid")}</option></Select>
          </div>
          <button onClick={() => { setPage(1); setReloadTrigger(t => t + 1) }} className="btn-maroon !py-2.5 shrink-0"><Search size={14} />{' '}<T>Apply</T></button>
          <button onClick={() => { setFilters({ q: '', status: '', verification: '', payment: '', start: '', end: '', page: 1 }); setReloadTrigger(t => t + 1) }} className="btn-outline !py-2.5 shrink-0"><RotateCcw size={14} />{' '}<T>Clear</T></button>
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
              <th className="px-2.5 py-3 font-semibold whitespace-nowrap">{tr('Auction ID')}</th>
              {SORT_COLUMNS.slice(0, 2).map((col) => {
                const sortIdx = getSortIndex(col.key)
                const sortDir = getSortDirection(col.key)
                const isSorted = sortIdx >= 0
                return (
                  <th key={col.key} onClick={(e) => handleColumnClick(col.key, e)}
                    className={`group px-2.5 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-maroon-700 bg-maroon-50/50' : ''}`}
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
                    className={`group px-2.5 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-maroon-700 bg-maroon-50/50' : ''}`}
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
              <th className="px-2.5 py-3 font-semibold whitespace-nowrap">{tr('Winner')}</th>
              {(() => {
                const col = SORT_COLUMNS.find(c => c.key === 'status')
                const sortIdx = getSortIndex(col.key)
                const sortDir = getSortDirection(col.key)
                const isSorted = sortIdx >= 0
                return (
                  <th onClick={(e) => handleColumnClick(col.key, e)}
                    className={`group px-2.5 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-maroon-700 bg-maroon-50/50' : ''}`}
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
              <th className="px-2.5 py-3 font-semibold whitespace-nowrap">{tr('Verification')}</th>
              <th className="px-2.5 py-3 font-semibold whitespace-nowrap">{tr('Payment')}</th>
              <th className="px-2.5 py-3 font-semibold whitespace-nowrap">{tr('Actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {displayRows.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50/60">
                  <td className="px-2.5 py-3 font-mono text-[0.75rem] text-gray-500 whitespace-nowrap">{a.code}</td>
                  <td className="px-2.5 py-3 font-semibold text-gray-800">{tr(a.item)}
                    {a.from_stock && <div className="text-[0.6875rem] font-normal font-mono text-violet-700">{tagRange(a.pieces.map((p) => p.tag_id))}</div>}
                    {a.reauction_of && <div className="text-[0.6875rem] font-normal text-orange-700">{tr('Re-auction of')} {a.reauction_of}</div>}
                    {a.reauctioned_to && <div className="text-[0.6875rem] font-normal text-orange-700">{tr('Re-auctioned as')} {a.reauctioned_to}</div>}
                  </td>
                  <td className="px-2.5 py-3 whitespace-nowrap"><div className="text-gray-700 text-[0.8125rem]">{fmtDate(a.auction_date)}</div><div className="text-[0.6875rem] text-gray-400">{clock12(a.start_time || '')}</div></td>
                  <td className="px-2.5 py-3 font-semibold text-gray-800">{canSeeAmounts ? (Number(a.current_amount) > 0 ? inr(a.current_amount) : <span className="text-gray-300">—</span>) : '—'}</td>
                  <td className="px-2.5 py-3 text-gray-600">{a.winner ? personName({ name: a.winner }, lang) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2.5 py-3"><Pill tone={STATUS_TONE[a.status] || 'gray'}>{tr(statusLabel(a.status))}</Pill></td>
                  <td className="px-2.5 py-3">
                    {RESULT_STATES.includes(a.status)
                      ? <Pill tone={VERIFY_TONE[a.verification_status] || 'gray'}>{tr(a.verification_status)}</Pill>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2.5 py-3">
                    {a.from_stock && a.status === 'Completed' && a.verification_status === 'Verified' ? (
                      <><Pill tone={PAYMENT_TONE[a.payment_status] || 'amber'}>{tr(a.payment_status)}</Pill>
                        <div className="text-[0.6875rem] text-gray-600 mt-1 whitespace-nowrap">{lotPaidCount(a)}/{a.sales.length} {tr('buyers paid')}</div></>
                    ) : a.status === 'Completed' && a.verification_status === 'Verified' ? (
                      <>
                        <Pill tone={PAYMENT_TONE[a.payment_status] || 'gray'}>{tr(a.payment_status)}</Pill>
                        {a.payment_status === 'Paid' && a.payment_mode && (
                          <div className="text-[0.6875rem] text-gray-600 mt-1 whitespace-nowrap" title={a.payment_ref || undefined}>
                            {tr(modeLabel(a.payment_mode))}{a.payment_ref && <span className="text-gray-400"> · {a.payment_ref.length > 8 ? `${a.payment_ref.slice(0, 8)}…` : a.payment_ref}</span>}
                          </div>
                        )}
                      </>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2.5 py-3">
                    {/* Icon-only actions (tooltip names each one) so the column stays narrow */}
                    <div className="flex items-center gap-1.5 flex-nowrap">
                      <IconAction onClick={() => setView(a)} label={tr("View details")} icon={Eye} tone="border-gray-200 text-gray-800 hover:text-maroon-700 hover:border-maroon-300" />
                      {canWrite && a.payment_status !== 'Paid' && (['Scheduled', 'In Progress'].includes(a.status)
                        || (RESULT_STATES.includes(a.status) && a.verification_status !== 'Verified')) && (
                        <IconAction onClick={() => recordResult(a)} label={RESULT_STATES.includes(a.status) ? tr("Correct result") : tr("Record result")} icon={Gavel} tone="border-violet-200 text-violet-700 hover:bg-violet-50" />
                      )}
                      {canDecide(a) && (<>
                        <IconAction onClick={() => verifyAuction(a)} label={tr("Approve result")} icon={CheckCircle2} tone="border-emerald-200 text-emerald-700 hover:bg-emerald-50" />
                        <IconAction onClick={() => rejectAuction(a)} label={tr("Reject result")} icon={XCircle} tone="border-red-200 text-red-600 hover:bg-red-50" />
                      </>)}
                      {a.from_stock && a.status === 'Completed' && (
                        <IconAction onClick={() => setLotBuyers(a)} label={tr("Buyers & payments")} icon={Users} tone="border-green-200 text-green-700 hover:bg-green-50" />
                      )}
                      {!a.from_stock && canCollect && a.status === 'Completed' && a.verification_status === 'Verified' && a.payment_status === 'Pending' && (
                        <IconAction onClick={() => collectPayment(a)} label={tr("Collect payment from winner")} icon={Banknote} tone="border-green-200 text-green-700 hover:bg-green-50" />
                      )}
                      {!a.from_stock && a.payment_status === 'Paid' && (
                        <IconAction onClick={() => setReceipt(a)} label={tr("Print receipt")} icon={Receipt} tone="border-blue-200 text-blue-700 hover:bg-blue-50" />
                      )}
                      {canWrite && a.status === 'Unsold' && a.verification_status === 'Verified' && !a.reauctioned_to && (
                        <IconAction onClick={() => openReauction(a)} label={tr("Re-auction this item")} icon={RotateCcw} tone="border-orange-200 text-orange-700 hover:bg-orange-50" />
                      )}
                      {isAdmin && a.status !== 'Void' && a.payment_status !== 'Paid' && (<>
                        <IconAction onClick={() => openEdit(a)} label={tr("Edit details")} icon={Pencil} tone="border-amber-300 text-amber-700 hover:bg-amber-50" />
                        <IconAction onClick={() => remove(a)} label={tr("Delete")} icon={Trash2} tone="border-gray-200 text-red-500 hover:text-red-700 hover:border-red-300" />
                      </>)}
                    </div>
                  </td>
                </tr>
              ))}
              {displayRows.length === 0 && <TableStates colSpan={9} loading={loading} error={loadErr} onRetry={load} empty={tr("No auctions found.")} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit={tr("auctions")} />
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 text-[0.8125rem] text-gray-600 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-3">
        <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />{' '}<T>Auction workflow: Create auction → Record result (Sold or Unsold) → Committee approves or rejects → Sold: collect payment and print receipt · Unsold: re-auction the item. Only the administrator can edit details, before payment.</T>
      </div>

      {/* ── Create New Auction drawer ── */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800">
                  {drawer.mode === 'edit' ? <T>Edit Auction</T> : drawer.mode === 'reauction' ? <T>Re-auction Item</T> : <T>Create New Auction</T>}</h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5">
                  {drawer.mode === 'create' ? <T>Create a new auction for items, materials or rights.</T>
                    : <span className="font-mono">{drawer.orig.code}{drawer.mode === 'reauction' && <span className="font-sans"> — {tr('Unsold')}</span>}</span>}</p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-5 flex-1">
              <div className="flex items-center gap-2 text-maroon-700 font-semibold text-[0.875rem]"><T>1. Auction Details</T></div>
              <div><label className="label"><T>Auction Item *</T></label>
                <Combobox
                  disabled={drawer.mode === 'reauction'}
                  value={drawer.item}
                  onChange={(e) => (drawer.mode === 'create' ? onItemSelect(e.target.value) : setM({ item: e.target.value }))}
                  options={items.map((it) => it.name)}
                  placeholder={tr("Select or type item name")}
                  className="input"
                />
              </div>
              <div><label className="label">{drawer.orig?.from_stock && drawer.mode === 'reauction' ? <T>Base price per piece (₹) *</T> : <T>Base Amount (₹) *</T>}</label>
                <NumberField required min="0" step="1" prefix="₹" placeholder={tr("0")} value={drawer.base_amount} disabled={drawer.mode === 'edit' && drawer.orig?.from_stock} onChange={(e) => setM({ base_amount: e.target.value })} />
                {drawer.orig?.from_stock && <div className="text-[0.6875rem] text-gray-500 mt-1">{drawer.mode === 'reauction' ? `${drawer.orig.pieces.length} ${tr('pieces')}: ${tagRange(drawer.orig.pieces.map((p) => p.tag_id))}` : tr('Lot base is fixed per piece. To change it, void and create a new auction from stock.')}</div>}
              </div>
              {drawer.mode === 'create' && (<>
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
                      <div className="text-[0.75rem] text-gray-500">{tr('Mobile:')} {drawer.devotee.mobile}</div>
                    </div>
                    <button type="button" onClick={() => { setM({ devotee: null }); setDq('') }} className="text-gray-400 hover:text-red-600"><X size={17} /></button>
                  </div>
                )}
              </div>
              <div><label className="label"><T>Winner / Highest Bidder (Optional)</T></label><input className="input" placeholder={tr("Enter Winner / Highest Bidder Name")} value={personName({ name: drawer.winner }, lang)} onChange={(e) => setM({ winner: sanitizeName(e.target.value) })} /></div>
              </>)}
              {drawer.mode === 'edit' && RESULT_STATES.includes(drawer.orig.status) && !drawer.orig.from_stock && (
                <div className="border border-violet-100 bg-violet-50/40 rounded-lg p-3 space-y-3">
                  <div className="text-[0.75rem] font-semibold text-violet-800">{tr('Result')}: {tr(statusLabel(drawer.orig.status))}</div>
                  {drawer.orig.status === 'Completed' && (<>
                    <div><label className="label"><T>Winning Bidder *</T></label>
                      <input required className="input" value={drawer.winner} onChange={(e) => setM({ winner: sanitizeName(e.target.value) })} /></div>
                    <div><label className="label"><T>Winning Bid (₹) *</T></label>
                      <NumberField required min="0" step="1" prefix="₹" value={drawer.current_amount} onChange={(e) => setM({ current_amount: e.target.value })} /></div>
                  </>)}
                  <div><label className="label"><T>No. of Bidders</T></label>
                    <NumberField min="0" step="1" value={drawer.bids} onChange={(e) => setM({ bids: e.target.value })} /></div>
                  {drawer.orig.verification_status === 'Verified' && (
                    <div className="text-[0.6875rem] text-violet-800"><T>Changing the winner, amount or bidders sends the result back to the committee for approval.</T></div>
                  )}
                </div>
              )}
              <div><label className="label"><T>Description (Optional)</T></label>
                <textarea className="input min-h-[5.625rem]" maxLength={250} placeholder={tr("Enter description…")} value={drawer.description} onChange={(e) => setM({ description: e.target.value })} />
                <div className="text-right text-[0.6875rem] text-gray-400 mt-0.5">{drawer.description.length} / 250</div></div>
              <div><label className="label"><T>Auction Date *</T></label>
                <DateField required min={drawer.mode === 'edit' ? undefined : todayISO()} value={drawer.auction_date} onChange={(e) => setM({ auction_date: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label"><T>Start Time *</T></label>
                  <TimeField required value={drawer.start_time} onChange={(e) => setM({ start_time: e.target.value })} /></div>
                <div><label className="label"><T>Notes (Optional)</T></label>
                  <textarea className="input min-h-[2.75rem]" maxLength={250} placeholder={tr("Enter notes…")} value={drawer.notes} onChange={(e) => setM({ notes: e.target.value })} />
                  <div className="text-right text-[0.6875rem] text-gray-400 mt-0.5">{drawer.notes.length} / 250</div></div>
              </div>
              {drawer.mode === 'edit' && (
                <div id="auction-reason"><label className="label"><T>Reason for Change *</T></label>
                  <textarea required minLength={5} maxLength={500} rows={2} className="input" value={drawer.reason} onChange={(e) => setM({ reason: e.target.value })} placeholder={tr('e.g. Item name spelt wrongly')} />
                  <div className="text-[0.6875rem] text-gray-500 mt-1"><T>Saved in the auction history with the old and new values.</T></div></div>
              )}
              {drawer.mode === 'reauction' && (
                <div className="bg-orange-50/60 border border-orange-100 rounded-lg px-4 py-3 text-[0.78125rem] text-gray-600">
                  <T>A new auction is created for the same item. You can lower the base amount. The unsold auction stays in history, linked to the new one.</T>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60">{saving ? tr('Saving…') : drawer.mode === 'edit' ? <T>Save Changes</T> : drawer.mode === 'reauction' ? <T>Schedule Re-auction</T> : <T>Create Auction</T>}</button>
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
                <VField label={tr("Start Time")} value={view.start_time ? clock12(view.start_time) : '—'} />
                <VField label={tr("No. of Bidders")} value={view.bids} />
                <VField label={tr("Status")} value={<Pill tone={STATUS_TONE[view.status] || 'gray'}>{tr(statusLabel(view.status))}</Pill>} />
                <VField label={tr("Highest Bid")} value={canSeeAmounts ? (Number(view.current_amount) > 0 ? inr(view.current_amount) : '—') : '—'} />
                <VField label={tr("Winner")} value={view.winner ? personName({ name: view.winner }, lang) : '—'} />
                <VField label={tr("Notes")} value={view.notes || '—'} wide />
                {view.reauction_of && <VField label={tr("Re-auction of")} value={view.reauction_of} />}
                {view.reauctioned_to && <VField label={tr("Re-auctioned as")} value={view.reauctioned_to} />}
                {view.from_stock && <VField label={`${tr('Pieces')} (${view.pieces.length})`} wide value={
                  <span className="flex flex-wrap gap-1">{view.pieces.map((p) => (
                    <span key={p.id} className={`font-mono text-[0.7rem] px-1.5 py-0.5 rounded ${p.result === 'Sold' ? 'bg-emerald-50 text-emerald-700' : p.result === 'Unsold' ? 'bg-orange-50 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{p.tag_id}</span>
                  ))}</span>} />}
                {view.from_stock && view.sales.length > 0 && <VField label={tr('Buyers')} wide value={view.sales.map((x) => `${x.buyer_name}: ${inr(x.amount)} (${tr(x.payment_status)})`).join(' · ')} />}
              </div>
              {/* Verification Section */}
              {RESULT_STATES.includes(view.status) && (
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
              {view.status === 'Completed' && view.verification_status === 'Verified' && (
                <div className="border-t border-gray-100 pt-4 mt-4">
                  <h4 className="text-[0.8125rem] font-semibold text-gray-700 mb-3"><T>Payment Details</T></h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                    <VField label={tr("Payment Status")} value={<Pill tone={PAYMENT_TONE[view.payment_status] || 'gray'}>{tr(view.payment_status)}</Pill>} />
                    {view.payment_mode && <VField label={tr("Payment Mode")} value={tr(view.payment_mode)} />}
                    {view.payment_ref && <VField label={tr("Transaction Ref")} value={view.payment_ref} />}
                    {view.receipt_no && <VField label={tr("Receipt No")} value={view.receipt_no} />}
                    {view.paid_at && <VField label={tr("Paid At")} value={fmtStamp(view.paid_at)} />}
                    {view.paid_by && <VField label={tr("Collected By")} value={view.paid_by} />}
                  </div>
                </div>
              )}
            </div>
            {(view.history || []).length > 0 && (
              <div className="px-6 pb-5">
                <h4 className="text-[0.8125rem] font-semibold text-gray-700 mb-2 border-t border-gray-100 pt-4"><T>History</T></h4>
                <ol className="space-y-2">
                  {view.history.map((h, i) => (
                    <li key={i} className="text-[0.75rem] border-l-2 border-maroon-200 pl-3">
                      <div className="font-semibold text-gray-800">{tr(h.action)} <span className="font-normal text-gray-500">· {h.by} · {fmtStamp(h.at)}</span></div>
                      {h.detail && <div className="text-gray-600">{h.detail}</div>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white flex gap-3">
              {view.payment_status === 'Paid' && (
                <button onClick={() => { setReceipt(view); setView(null) }} className="btn-outline flex-1 justify-center"><Receipt size={16} className="mr-1" /><T>Print Receipt</T></button>
              )}
              <button onClick={() => setView(null)} className="btn-maroon flex-1 justify-center"><T>Close</T></button>
            </div>
          </div>
        </div>
      )}

      {stockDrawer && <StockAuctionDrawer onClose={() => setStockDrawer(false)} onCreated={() => { setStockDrawer(false); load() }} />}
      {lotResult && <LotResultModal auction={lotResult} onClose={() => setLotResult(null)} onSaved={() => { setLotResult(null); load() }} />}
      {lotBuyers && <LotBuyersModal auction={lotBuyers} canCollect={canCollect} onClose={() => setLotBuyers(null)}
        onCollect={(p) => { setPayMode('Cash'); setPayRef(''); setPaymentModal(p) }} onReceipt={(p) => { setLotBuyers(null); setReceipt(p) }} />}

      {/* ── Record Result Modal ── */}
      {resultModal && (() => {
        const m = resultModal, set = (p) => setResultModal((x) => ({ ...x, ...p }))
        const OUTCOMES = [
          ['Completed', tr('Sold'), tr('Winner and winning bid')],
          ['Unsold', tr('Unsold'), tr('No valid bid — can be re-auctioned after approval')],
          ['In Progress', tr('Still in progress'), tr('Save bids so far')],
        ]
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setResultModal(null)} />
            <form onSubmit={submitResult} className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div><h3 className="font-serif text-lg font-bold text-maroon-800"><T>Record Result</T></h3>
                  <div className="text-[0.75rem] text-gray-500">{m.a.code} · {tr(m.a.item)} · {tr('Base')} {inr(m.a.base_amount)}</div></div>
                <button type="button" onClick={() => setResultModal(null)} className="text-gray-400 hover:text-maroon-700"><X size={18} /></button>
              </div>
              <div className="px-5 py-4 space-y-4">
                {m.a.verification_status === 'Rejected' && m.a.rejection_reason && (
                  <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-[0.75rem] text-red-700"><b><T>Rejected</T>:</b> {m.a.rejection_reason}</div>
                )}
                <div className="grid gap-2">
                  {OUTCOMES.map(([v, label, hint]) => (
                    <label key={v} className={`flex items-start gap-2.5 border rounded-lg px-3 py-2 cursor-pointer ${m.outcome === v ? 'border-maroon-400 bg-maroon-50/40' : 'border-gray-200'}`}>
                      <input type="radio" name="outcome" className="mt-1 accent-maroon-700" checked={m.outcome === v} onChange={() => set({ outcome: v })} />
                      <span><span className="font-semibold text-[0.8125rem] text-gray-800">{label}</span><span className="block text-[0.6875rem] text-gray-500">{hint}</span></span>
                    </label>
                  ))}
                </div>
                {m.outcome !== 'Unsold' && (<>
                  <div><label className="label">{m.outcome === 'Completed' ? <T>Winning Bid (₹) *</T> : <T>Highest Bid So Far (₹)</T>}</label>
                    <NumberField required={m.outcome === 'Completed'} min={String(Number(m.a.base_amount) || 0)} step="1" prefix="₹" value={m.amount} onChange={(e) => set({ amount: e.target.value })} />
                    <div className="text-[0.6875rem] text-gray-500 mt-1">{tr('Base amount ₹{amount} — the bid cannot be below it.').replace('{amount}', Number(m.a.base_amount).toLocaleString('en-IN'))}</div></div>
                  <div><label className="label">{m.outcome === 'Completed' ? <T>Winning Bidder *</T> : <T>Highest Bidder</T>}</label>
                    <input required={m.outcome === 'Completed'} className="input" value={m.winner} onChange={(e) => set({ winner: sanitizeName(e.target.value) })} placeholder={tr("Enter Winner / Highest Bidder Name")} /></div>
                </>)}
                <div><label className="label"><T>No. of Bidders</T></label>
                  <NumberField min="0" step="1" value={m.bids} onChange={(e) => set({ bids: e.target.value })} /></div>
                {m.outcome !== 'In Progress' && (
                  <div className="text-[0.75rem] text-gray-600 bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2"><T>This result goes to the committee for approval.</T></div>
                )}
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
                <button type="button" onClick={() => setResultModal(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
                <button type="submit" className="btn-maroon flex-1 justify-center"><Gavel size={16} className="mr-1" /><T>Save Result</T></button>
              </div>
            </form>
          </div>
        )
      })()}

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
                  <option value="UPI/QR Code">{tr("Online")}</option>
                </Select>
              </div>
              <div>
                <label className="label"><T>Transaction Reference</T></label>
                <input value={payRef} onChange={(e) => setPayRef(e.target.value)} className="input" placeholder={tr("Online transaction ID / UTR")} />
                <div className="text-[0.6875rem] text-gray-400 mt-1"><T>Required for online payments</T></div>
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
              {/* Temple header */}
              <div className="text-center border-b border-dashed border-gray-300 pb-4 mb-4">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <img src="/images/temple-logo.png" alt={tr("Shri Shirdi Sai Baba Temple")} className="w-12 h-12 rounded-full object-cover" onError={(e) => e.target.style.display = 'none'} />
                  <div>
                    <div className="font-serif text-lg font-bold text-maroon-800">{tr('Shri Shirdi Sai Baba Temple')}</div>
                    <div className="text-sm text-gray-600">శ్రీ షిర్డీ సాయిబాబా దేవస్థానం</div>
                  </div>
                </div>
                <div className="text-base font-semibold text-gray-800 mt-3"><T>Auction Payment Receipt</T></div>
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
                <div className="flex justify-between text-[0.8125rem]"><span className="text-gray-500"><T>Mode</T>:</span><span>{tr(receipt.payment_mode)}</span></div>
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

// Square icon button for a row action; the label shows as a tooltip and is read by screen readers.
function IconAction({ onClick, label, icon: Icon, tone }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className={`w-8 h-8 shrink-0 grid place-items-center rounded-lg border ${tone}`}><Icon size={15} /></button>
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
