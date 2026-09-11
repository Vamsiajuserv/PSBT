import React, { useEffect, useState, useCallback } from 'react'
import {
  Plus, X, Eye, Printer, Search, Minus, Check, User,
  IndianRupee, CalendarDays, ShoppingCart, FileText, Calculator,
  CheckCircle, XCircle, Clock, Ban,
} from 'lucide-react'
import { toast } from '../../components/common/Dialog.jsx'
import { useFilterableSortableTable, SortFilterPanel, SortableFilterableTh } from '../../components/common/SortableTable.jsx'
import { PageTitle, StatTile, Pager, inr, num, fmtDate } from '../../components/admin/ui.jsx'
import { Receipt } from '../../components/common/Receipt.jsx'
import { te } from '../../lib/telugu.js'
import { WasteAPI, VendorsAPI, CommitteeAPI, DevoteesAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { TableStates } from '../../components/common/states.jsx'
import ExportButtons from '../../components/common/ExportButtons.jsx'
import { Select, DateField, DateTimeField, NumberField, CountryCodeSelect, getCountryDigits, Combobox } from '../../components/common/Field.jsx'
import { T, tr, clock12, personName, useLang } from '../../i18n/LanguageContext.jsx'
import { sanitizeName, sanitizePhone, validateName, validatePhone } from '../../lib/validation.js'

const DEFAULT_MATERIALS = ['Coconut Shells', 'Flowers', 'Banana Leaves', 'Cardboard', 'Plastic', 'Waste Oil', 'Metal Scrap', 'Old Cloth', 'Waste Papers']
const UNITS = ['Kilogram (kg)', 'Tonne', 'Piece', 'Bundle']
const nowLocal = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const fmtTime = (s) => (s ? clock12(new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })) : '')
const modeLabel = (m) => tr(m === 'UPI/QR Code' ? 'UPI (QR)' : m)
const unitShort = (u) => { const m = /\(([^)]+)\)/.exec(u || ''); return m ? m[1] : (u || '').toLowerCase() }
const money2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function toWords(n) {
  n = Math.round(Number(n) || 0)
  if (n === 0) return tr('Zero Rupees Only')
  const a = ['', tr('One'), tr('Two'), tr('Three'), tr('Four'), tr('Five'), tr('Six'), tr('Seven'), tr('Eight'), tr('Nine'), tr('Ten'), tr('Eleven'), tr('Twelve'), tr('Thirteen'), tr('Fourteen'), tr('Fifteen'), tr('Sixteen'), tr('Seventeen'), tr('Eighteen'), tr('Nineteen')]
  const b = ['', '', tr('Twenty'), tr('Thirty'), tr('Forty'), tr('Fifty'), tr('Sixty'), tr('Seventy'), tr('Eighty'), tr('Ninety')]
  const two = (x) => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''))
  const three = (x) => (x >= 100 ? a[Math.floor(x / 100)] + ' ' + tr('Hundred') + (x % 100 ? ' ' + two(x % 100) : '') : two(x))
  let out = ''
  const crore = Math.floor(n / 10000000); n %= 10000000
  const lakh = Math.floor(n / 100000); n %= 100000
  const thou = Math.floor(n / 1000); n %= 1000
  if (crore) out += three(crore) + ' ' + tr('Crore') + ' '
  if (lakh) out += two(lakh) + ' ' + tr('Lakh') + ' '
  if (thou) out += two(thou) + ' ' + tr('Thousand') + ' '
  if (n) out += three(n) + ' '
  return out.trim() + ' ' + tr('Rupees Only')
}

const emptyForm = () => ({ vendor_id: '', vendor_name: '', devotee_id: null, buyer_name: '', mobile: '', material: DEFAULT_MATERIALS[0], materialCustom: false, unit: 'Kilogram (kg)', quantity: 1, rate: '', mode: 'Cash', txn_ref: '', paid_at: nowLocal(), verified_by: '' })

export default function WasteSales() {
  const { lang } = useLang()
  const { user } = useAuth()
  const canWrite = user?.role !== 'Accountant'
  const SIZE = 15
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [stats, setStats] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [printDoc, setPrintDoc] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [vendors, setVendors] = useState([])
  const [committee, setCommittee] = useState([])
  const [verifyModal, setVerifyModal] = useState(null)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [saving, setSaving] = useState(false)

  // Committee role check for verification
  const isCommittee = user?.role === 'Committee' || user?.role === 'Admin'

  const [q, setQ] = useState('')
  const [material, setMaterial] = useState('')
  const [mode, setMode] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  // Sortable table columns with filtering support
  const sortColumns = [
    { key: 'code', label: 'Receipt No.', type: 'text' },
    { key: 'paid_at', label: 'Date & Time', type: 'date' },
    { key: 'buyer_name', label: 'Buyer Name', type: 'text' },
    { key: 'material', label: 'Material Type', type: 'text' },
    { key: 'weight_kg', label: 'Quantity', type: 'num' },
    { key: 'amount', label: 'Amount (₹)', type: 'money' },
    { key: 'mode', label: 'Payment Mode', type: 'text', filterable: true, filterOptions: ['Cash', 'UPI/QR Code'] },
    { key: 'verification_status', label: 'Verification', type: 'text', filterable: true, filterOptions: ['Verified', 'Pending', 'Rejected'] },
  ]

  // Verification status badge
  const statusBadge = (status) => {
    const s = status || 'Pending'
    if (s === 'Verified') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-semibold bg-emerald-50 text-emerald-700"><CheckCircle size={12} /> {tr('Verified')}</span>
    if (s === 'Rejected') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-semibold bg-red-50 text-red-700"><XCircle size={12} /> {tr('Rejected')}</span>
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-semibold bg-amber-50 text-amber-700"><Clock size={12} /> {tr('Pending')}</span>
  }

  // Verify sale handler
  const handleVerify = async () => {
    if (!verifyModal) return
    try {
      await WasteAPI.verify(verifyModal.id, {})
      setVerifyModal(null)
      load()
    } catch (ex) {
      alert(ex?.detail || 'Verification failed')
    }
  }

  // Reject sale handler
  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return
    try {
      await WasteAPI.reject(rejectModal.id, { reason: rejectReason.trim() })
      setRejectModal(null); setRejectReason('')
      load()
    } catch (ex) {
      alert(ex?.detail || 'Rejection failed')
    }
  }

  // Check if user can verify a sale (not creator)
  const canVerifySale = (sale) => {
    if (!isCommittee) return false
    if (sale.status === 'Void') return false
    if (sale.verification_status === 'Verified') return false
    if (sale.created_by?.toLowerCase() === user?.username?.toLowerCase()) return false
    return true
  }
  const {
    filteredSortedRows,
    sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection,
    filters, toggleFilterValue, clearFilter, clearAllFilters, getFilterValues,
  } = useFilterableSortableTable(rows, sortColumns, [{ key: 'paid_at', direction: 'desc' }])

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('')
    try {
      const [d, s] = await Promise.all([
        WasteAPI.sales({ q, material, mode, start, end, page, size: SIZE }),
        WasteAPI.stats().catch(() => null),
      ])
      setRows(d.items); setTotal(d.total); if (s) setStats(s)
    } catch (ex) {
      setLoadErr(ex?.detail || "Couldn't load sales — check your connection and retry.")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q, material, mode, start, end, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useEffect(() => { setPage(1) }, [q, material, mode, start, end])

  useEffect(() => {
    VendorsAPI.list()
      .then((r) => { const arr = Array.isArray(r) ? r : (r.items || []); setVendors(arr) })
      .catch(() => toast('Failed to load vendors', 'error'))
    CommitteeAPI.list()
      .then((r) => { const arr = Array.isArray(r) ? r : (r.items || []); setCommittee(arr.filter((c) => c.active)) })
      .catch(() => toast('Failed to load committee members', 'error'))
  }, [])

  // Devotee search for registered devotees who can also buy waste materials (Item 33)
  const [devQ, setDevQ] = useState('')
  const [devResults, setDevResults] = useState([])
  useEffect(() => {
    if (!drawer || drawer.devotee_id || devQ.trim().length < 4) { setDevResults([]); return }
    const t = setTimeout(() => {
      DevoteesAPI.list({ q: devQ.trim(), size: 8 })
        .then((r) => setDevResults(Array.isArray(r) ? r : (r.items || [])))
        .catch(() => setDevResults([]))
    }, 200)
    return () => clearTimeout(t)
  }, [devQ, drawer])
  const onPickDevotee = (d) => {
    setM({ devotee_id: d.id, buyer_name: d.name, mobile: d.mobile || '', vendor_id: '', vendor_name: '' })
    setDevQ(''); setDevResults([])
  }
  const clearDevotee = () => {
    setM({ devotee_id: null, buyer_name: '', mobile: '' })
  }

  const setM = (patch) => setDrawer((d) => ({ ...d, ...patch }))
  const amount = drawer ? (Number(drawer.quantity) || 0) * (Number(drawer.rate) || 0) : 0
  // DEF-009: Use language-aware names for committee members
  const committeeNames = committee.map((c) => personName(c, lang))
  const selectedVendor = drawer && drawer.vendor_id ? vendors.find((v) => String(v.id) === String(drawer.vendor_id)) : null
  const materialOptions = selectedVendor && selectedVendor.material_types
    ? selectedVendor.material_types.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_MATERIALS
  const onVendor = (id) => {
    if (!id) { setM({ vendor_id: '', vendor_name: '', devotee_id: null }); return }
    const v = vendors.find((x) => String(x.id) === String(id))
    if (!v) return
    const mats = (v.material_types || '').split(',').map((s) => s.trim()).filter(Boolean)
    setM({ vendor_id: v.id, vendor_name: v.name, buyer_name: v.name, mobile: v.phone || '', material: mats[0] || DEFAULT_MATERIALS[0], materialCustom: false, devotee_id: null })
  }

  async function save(e) {
    e.preventDefault()
    if (saving) return
    const m = drawer

    // Validate fields only for walk-in buyers (not vendor or devotee selected)
    if (!m.vendor_id && !m.devotee_id) {
      const errors = {}
      const nameResult = validateName(m.buyer_name)
      if (!nameResult.valid) errors.buyer_name = nameResult.error

      const phoneResult = validatePhone(m.mobile)
      if (!phoneResult.valid) errors.mobile = phoneResult.error

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors)
        return
      }
    }
    setFieldErrors({})

    setSaving(true)
    try {
      const created = await WasteAPI.createSale({
        vendor_id: m.vendor_id || null,
        vendor_name: m.vendor_name || m.buyer_name || null,
        devotee_id: m.devotee_id || null,
        buyer_name: m.buyer_name, mobile: m.mobile, material: m.material, unit: m.unit,
        weight_kg: Number(m.quantity), rate: Number(m.rate), amount,
        mode: m.mode, txn_ref: m.mode === 'UPI/QR Code' ? (m.txn_ref || null) : null, paid_at: m.paid_at || null,
        verified_by: m.verified_by || null,
      })
      setDrawer(null); setDevQ(''); load(); setPrintDoc(created)
    } catch (ex) {
      // Error is already handled by API client with toast
    } finally { setSaving(false) }
  }

  const EXPORT_COLS = [{ key: 'code', label: tr('Sale ID') }, { key: 'vendor_name', label: tr('Buyer / Vendor') }, { key: 'material', label: tr('Material') },
    { key: 'weight_kg', label: tr('Weight (kg)') }, { key: 'rate', label: tr('Rate (₹)'), type: 'money' },
    { key: 'amount', label: tr('Amount (₹)'), type: 'money' }, { key: 'mode', label: tr('Mode') }]
  const exportRows = rows
  const exportTotal = { code: 'Total', amount: rows.reduce((s, r) => s + Number(r.amount || 0), 0) }
  return (
    <div>
      <PageTitle title={tr("Waste Material Sales Management")} subtitle={tr("Record waste material sales, accept payments and generate receipt.")}
        actions={<span className="inline-flex items-center gap-2"><ExportButtons title={tr("Waste Material Sales Register")} columns={EXPORT_COLS} rows={exportRows} total={exportTotal} />{canWrite ? <button onClick={() => setDrawer(emptyForm())} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Record Waste Material Sale</T></button> : <span className="px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-blue-50 text-blue-700"><T>View only</T></span>}</span>} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatTile icon={IndianRupee} color="#8a1c1c" bg="bg-maroon-50" title={tr("Total Sales Amount")} value={stats ? inr(stats.total_amount) : '—'} sub={tr("All Time")} />
        <StatTile icon={CalendarDays} color="#059669" bg="bg-emerald-50" title={tr("Today's Sales Amount")} value={stats ? inr(stats.today_amount) : '—'} sub={`${tr('Today')} (${fmtDate(new Date().toISOString())})`} />
        <StatTile icon={Clock} color="#d97706" bg="bg-amber-50" title={tr("Pending Verification")} value={stats ? num(stats.pending) : '—'} sub={tr("Awaiting committee review")} />
        <StatTile icon={CheckCircle} color="#059669" bg="bg-emerald-50" title={tr("Verified")} value={stats ? num(stats.verified) : '—'} sub={tr("Committee approved")} />
        <StatTile icon={Ban} color="#6b7280" bg="bg-gray-50" title={tr("Voided / Rejected")} value={stats ? num((stats.voided || 0) + (stats.rejected || 0)) : '—'} sub={tr("Cancelled records")} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search by Buyer Name / Mobile / Receipt No.</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search here…")} className="input !pl-9" /></div>
          </div>
          <div className="min-w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>From</T></label>
            <DateField value={start} onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd('') }} className="input" />
          </div>
          <div className="min-w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
            <DateField value={end} onChange={(e) => setEnd(e.target.value)} min={start} className="input" />
          </div>
          <div className="min-w-[9rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Material Type</T></label>
            <Select value={material} onChange={(e) => setMaterial(e.target.value)} className="input"><option value="">{tr("All")}</option>{DEFAULT_MATERIALS.map((m) => <option key={m}>{m}</option>)}</Select>
          </div>
          <div className="min-w-[9rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Payment Mode</T></label>
            <Select value={mode} onChange={(e) => setMode(e.target.value)} className="input"><option value="">{tr("All")}</option><option value="Cash">{tr("Cash")}</option><option value="UPI/QR Code">{tr("UPI / QR Code")}</option></Select>
          </div>
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
              {filteredSortedRows.map((s) => (
                <tr key={s.id} className={`hover:bg-gray-50/60 ${s.status === 'Void' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-[0.75rem] text-gray-500 whitespace-nowrap">{s.code}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="text-gray-700 text-[0.8125rem]">{fmtDate(s.paid_at || s.created_at)}</div><div className="text-[0.6875rem] text-gray-400">{fmtTime(s.paid_at || s.created_at)}</div></td>
                  <td className="px-4 py-3"><div className="font-semibold text-gray-800">{tr(s.buyer_name)}</div><div className="text-[0.6875rem] text-gray-400">{s.mobile || ''}</div></td>
                  <td className="px-4 py-3 text-gray-600">{tr(s.material)}</td>
                  <td className="px-4 py-3 text-gray-700">{money2(s.weight_kg)} {tr(unitShort(s.unit))}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">₹{money2(s.amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{modeLabel(s.mode)}</td>
                  <td className="px-4 py-3">{s.status === 'Void' ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-semibold bg-gray-100 text-gray-500"><Ban size={12} /> {tr('Voided')}</span> : statusBadge(s.verification_status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-gray-800">
                      <button onClick={() => setPrintDoc(s)} title={tr("View")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                      {canVerifySale(s) && (
                        <>
                          <button onClick={() => setVerifyModal(s)} title={tr("Verify")} className="w-8 h-8 grid place-items-center rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-400"><CheckCircle size={15} /></button>
                          <button onClick={() => { setRejectModal(s); setRejectReason('') }} title={tr("Reject")} className="w-8 h-8 grid place-items-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-400"><XCircle size={15} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <TableStates colSpan={9} loading={loading} error={loadErr} onRetry={load} empty={tr("No sales records found.")} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit={tr("records")} />
        </div>
      </div>

      {/* ── Record Waste Material Sale drawer ── */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Record Waste Material Sale</T></h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Enter sale details, accept payment and generate receipt.</T></p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-6 flex-1">
              {/* 1. Buyer Details */}
              <div>
                <div className="text-maroon-700 font-semibold text-[0.875rem] mb-3"><T>1. Buyer Details</T></div>
                <div className="mb-4">
                  <label className="label"><T>Vendor</T></label>
                  <Select className="input" value={drawer.vendor_id} onChange={(e) => onVendor(e.target.value)}>
                    <option value="">{tr("Other / walk-in buyer / devotee")}</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.phone ? ` — ${v.phone}` : ''}</option>)}
                  </Select>
                </div>
                {drawer.vendor_id ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="label"><T>Buyer Name</T></label><input disabled className="input bg-gray-50" value={drawer.buyer_name} /></div>
                    <div><label className="label"><T>Mobile Number</T></label><input disabled className="input bg-gray-50" value={drawer.mobile} /></div>
                  </div>
                ) : drawer.devotee_id ? (
                  /* Devotee selected - show as linked devotee */
                  <div className="flex items-center gap-3 border border-emerald-200 rounded-xl px-3.5 py-3 bg-emerald-50/50">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white grid place-items-center"><User size={18} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 truncate">{drawer.buyer_name}</div>
                      <div className="text-[0.75rem] text-emerald-600">{drawer.mobile || tr('Registered Devotee')}</div>
                    </div>
                    <button type="button" onClick={clearDevotee} className="text-emerald-600 hover:text-emerald-900"><X size={18} /></button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Devotee search option (Item 33) */}
                    <div>
                      <label className="label"><T>Search Registered Devotee</T></label>
                      <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input className="input !pl-9" placeholder={tr("Search by name or mobile (min 2 chars)…")} value={devQ} onChange={(e) => setDevQ(e.target.value)} />
                        {devResults.length > 0 && (
                          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-100 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
                            {devResults.map((d) => (
                              <button type="button" key={d.id} onClick={() => onPickDevotee(d)} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
                                <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center text-[0.75rem] font-bold">{d.name[0]}</span>
                                <span><span className="font-semibold text-gray-800 text-[0.8125rem]">{personName(d, lang)}</span><span className="block text-[0.6875rem] text-gray-400">{d.code} · {d.mobile}</span></span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-[0.6875rem] text-gray-400 mt-1"><T>Or enter details manually below</T></p>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="label"><T>Buyer Name *</T></label>
                        <input required className={`input ${fieldErrors.buyer_name ? 'border-red-400' : ''}`} placeholder={tr("Buyer Name")} value={drawer.buyer_name} onChange={(e) => { setFieldErrors((p) => ({ ...p, buyer_name: null })); setM({ buyer_name: sanitizeName(e.target.value) }) }} />
                        {fieldErrors.buyer_name && <div className="text-[0.7rem] text-red-500 mt-0.5">{fieldErrors.buyer_name}</div>}
                      </div>
                      <div>
                        <label className="label"><T>Mobile Number *</T></label>
                        <div className="flex">
                          <CountryCodeSelect value={drawer.country_code || '+91'} onChange={(e) => setM({ country_code: e.target.value })} />
                          <input required className={`input flex-1 !rounded-l-none ${fieldErrors.mobile ? 'border-red-400' : ''}`} placeholder={tr("Mobile Number")} maxLength={getCountryDigits(drawer.country_code || '+91')} value={drawer.mobile} onChange={(e) => { setFieldErrors((p) => ({ ...p, mobile: null })); setM({ mobile: sanitizePhone(e.target.value) }) }} />
                        </div>
                        {fieldErrors.mobile && <div className="text-[0.7rem] text-red-500 mt-0.5">{fieldErrors.mobile}</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Material Details */}
              <div>
                <div className="text-maroon-700 font-semibold text-[0.875rem] mb-3"><T>2. Material Details</T></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="label"><T>Material Type *</T></label>
                    <Combobox
                      value={drawer.material}
                      onChange={(e) => setM({ material: e.target.value, materialCustom: false })}
                      options={materialOptions}
                      placeholder={tr("Select or type material")}
                      className="input"
                    />
                  </div>
                  <div><label className="label"><T>Unit *</T></label><Select className="input" value={drawer.unit} onChange={(e) => setM({ unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</Select></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div><label className="label"><T>Quantity *</T></label>
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                      <button type="button" onClick={() => setM({ quantity: Math.max(0, (Number(drawer.quantity) || 0) - 1) })} className="w-10 h-11 grid place-items-center text-gray-500 hover:bg-gray-50 border-r border-gray-200"><Minus size={15} /></button>
                      <input type="number" step="0.01" min="0" value={drawer.quantity} onChange={(e) => setM({ quantity: e.target.value })} className="no-spin flex-1 w-full text-center font-semibold text-gray-800 outline-none h-11" />
                      <button type="button" onClick={() => setM({ quantity: (Number(drawer.quantity) || 0) + 1 })} className="w-10 h-11 grid place-items-center text-gray-500 hover:bg-gray-50 border-l border-gray-200"><Plus size={15} /></button>
                    </div>
                  </div>
                  <div><label className="label"><T>Rate per Unit (₹) *</T></label><NumberField required step="0.01" min="0" prefix="₹" placeholder={tr("0.00")} value={drawer.rate} onChange={(e) => setM({ rate: e.target.value })} /></div>
                </div>
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl px-4 py-3.5 mt-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 grid place-items-center shrink-0"><Calculator size={18} /></div>
                  <div>
                    <div className="text-[0.75rem] text-gray-500"><T>Calculated Amount</T></div>
                    <div className="text-2xl font-extrabold text-gray-800 leading-none mt-0.5">₹ {money2(amount)}</div>
                    <div className="text-[0.6875rem] text-gray-400 mt-1">{money2(drawer.quantity)} {unitShort(drawer.unit)} × ₹{money2(drawer.rate)} per {unitShort(drawer.unit)}</div>
                  </div>
                </div>
              </div>

              {/* 3. Payment Details */}
              <div>
                <div className="text-maroon-700 font-semibold text-[0.875rem] mb-3"><T>3. Payment Details</T></div>
                <label className="label"><T>Payment Mode *</T></label>
                <div className="flex gap-6 mt-1 mb-4">
                  {['Cash', 'UPI/QR Code'].map((mo) => (
                    <label key={mo} className="flex items-center gap-2 text-sm text-gray-700"><input type="radio" name="pmode" className="accent-maroon-700" checked={drawer.mode === mo} onChange={() => setM({ mode: mo })} /> {tr(mo === 'UPI/QR Code' ? 'UPI / QR Code' : mo)}</label>
                  ))}
                </div>
                {drawer.mode === 'UPI/QR Code' && (
                  <div className="mb-4"><label className="label"><T>UPI Transaction ID / UTR *</T></label>
                    <div className="relative"><input required className="input pr-9" placeholder={tr("Enter UPI transaction ID / UTR")} value={drawer.txn_ref} onChange={(e) => setM({ txn_ref: e.target.value })} />
                      {drawer.txn_ref && <span className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-emerald-500 text-white grid place-items-center"><Check size={12} /></span>}</div>
                  </div>
                )}
                <div className="mb-4"><label className="label"><T>Sale / Payment Date & Time *</T></label>
                  <DateTimeField required value={drawer.paid_at} onChange={(e) => setM({ paid_at: e.target.value })} /></div>
                <div className="mb-4"><label className="label"><T>Verified By</T></label>
                  <Combobox
                    value={drawer.verified_by || ''}
                    onChange={(e) => setM({ verified_by: e.target.value })}
                    options={committeeNames}
                    placeholder={tr("Select or type name")}
                    className="input"
                  /></div>
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl px-4 py-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center shrink-0"><IndianRupee size={17} /></div>
                  <div className="flex-1">
                    <div className="text-[0.75rem] text-gray-500"><T>Total Amount</T></div>
                    <div className="text-xl font-extrabold text-gray-800 leading-none">₹ {money2(amount)}</div>
                  </div>
                  <div className="text-right max-w-[52%]">
                    <div className="text-[0.6875rem] text-gray-400"><T>Amount In Words</T></div>
                    <div className="text-[0.71875rem] text-gray-600 font-medium leading-tight">{toWords(amount)}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60">{saving ? tr('Saving…') : <>{tr('Save Payment & Generate Receipt')} <Printer size={15} /></>}</button>
            </div>
          </form>
        </div>
      )}

      {printDoc && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto print-modal" onClick={() => setPrintDoc(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg my-auto">
            <div id="print-area">
              <Receipt title={tr("Waste Material Sale Receipt")} titleTe="వ్యర్థ పదార్థ విక్రయ రసీదు" no={printDoc.code} subNo={fmtDate(printDoc.paid_at || printDoc.created_at)} subNoLabel="Date" amount={printDoc.amount}
                rows={[
                  { en: 'Buyer', value: printDoc.buyer_name },
                  { en: 'Mobile', value: printDoc.mobile || '—' },
                  { en: 'Material', value: printDoc.material, valueTe: te(printDoc.material) },
                  { en: 'Quantity', value: `${money2(printDoc.weight_kg)} ${unitShort(printDoc.unit)}` },
                  { en: 'Rate', value: `₹${money2(printDoc.rate)} / ${unitShort(printDoc.unit)}` },
                  { en: 'Payment Mode', value: modeLabel(printDoc.mode) },
                  ...(printDoc.txn_ref ? [{ en: 'Transaction', value: printDoc.txn_ref }] : []),
                  { en: 'Verification', value: printDoc.verification_status || 'Pending' },
                  ...(printDoc.verified_by ? [{ en: 'Verified By', value: `${printDoc.verified_by} on ${fmtDate(printDoc.verified_at)}` }] : []),
                  ...(printDoc.rejection_reason ? [{ en: 'Rejection Reason', value: printDoc.rejection_reason }] : []),
                ]}
                footerNote={toWords(printDoc.amount)} />
            </div>
            <div className="flex gap-2 justify-center mt-4 no-print">
              <button onClick={() => window.print()} className="btn-maroon"><Printer size={15} />{' '}<T>Print Receipt</T></button>
              <button onClick={() => setPrintDoc(null)} className="btn-outline"><T>Close</T></button>
            </div>
          </div>
        </div>
      )}

      {/* ── Verify Modal ── */}
      {verifyModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center"><CheckCircle size={20} /></div>
              <div>
                <h3 className="font-serif text-lg font-bold text-gray-800"><T>Verify Waste Sale</T></h3>
                <p className="text-[0.8125rem] text-gray-500">{verifyModal.code}</p>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-[0.8125rem]">
                <div className="flex justify-between"><span className="text-gray-500"><T>Buyer</T>:</span><span className="font-semibold text-gray-800">{verifyModal.buyer_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500"><T>Material</T>:</span><span className="text-gray-700">{verifyModal.material} — {money2(verifyModal.weight_kg)} {unitShort(verifyModal.unit)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500"><T>Amount</T>:</span><span className="font-semibold text-gray-800">₹{money2(verifyModal.amount)} ({verifyModal.mode})</span></div>
                <div className="flex justify-between"><span className="text-gray-500"><T>Recorded by</T>:</span><span className="text-gray-700">{verifyModal.created_by || '—'}</span></div>
              </div>
              <p className="text-[0.8125rem] text-gray-600 mt-4"><T>By verifying, you confirm that this sale transaction is accurate and complete.</T></p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setVerifyModal(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button onClick={handleVerify} className="btn-maroon flex-1 justify-center !bg-emerald-600 hover:!bg-emerald-700"><CheckCircle size={15} /> <T>Verify Sale</T></button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ── */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 grid place-items-center"><XCircle size={20} /></div>
              <div>
                <h3 className="font-serif text-lg font-bold text-gray-800"><T>Reject Waste Sale</T></h3>
                <p className="text-[0.8125rem] text-gray-500">{rejectModal.code}</p>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-[0.8125rem] mb-4">
                <div className="flex justify-between"><span className="text-gray-500"><T>Buyer</T>:</span><span className="font-semibold text-gray-800">{rejectModal.buyer_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500"><T>Material</T>:</span><span className="text-gray-700">{rejectModal.material} — {money2(rejectModal.weight_kg)} {unitShort(rejectModal.unit)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500"><T>Amount</T>:</span><span className="font-semibold text-gray-800">₹{money2(rejectModal.amount)}</span></div>
              </div>
              <label className="label"><T>Rejection Reason *</T></label>
              <textarea className="input min-h-[80px]" placeholder={tr("Enter reason for rejection…")} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => { setRejectModal(null); setRejectReason('') }} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button onClick={handleReject} disabled={!rejectReason.trim()} className="btn-maroon flex-1 justify-center !bg-red-600 hover:!bg-red-700 disabled:opacity-50"><XCircle size={15} /> <T>Reject Sale</T></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
