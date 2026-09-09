import React, { useEffect, useState, useCallback } from 'react'
import {
  Plus, X, Eye, Search, RotateCcw, Calendar, Info, ChevronDown, Trash2, Upload,
  HandCoins, IndianRupee, Landmark, CalendarClock, FileText, Calculator, Users, ShieldCheck, Building2,
  Package, CheckCircle2, ArrowUp, ArrowDown, Gem, Lock,
} from 'lucide-react'
import { useSortableTable, SortPanel } from '../../components/common/SortableTable.jsx'
import { PageTitle, StatTile, Pill, Pager, inr, num, fmtDate, fmtStamp } from '../../components/admin/ui.jsx'
import { HundiAPI, HundiItemsAPI, DevoteesAPI, CommitteeAPI, SettingsAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { TableStates } from '../../components/common/states.jsx'
import ExportButtons from '../../components/common/ExportButtons.jsx'
import { Select, DateField, DateTimeField, Checkbox, NumberField } from '../../components/common/Field.jsx'
import { promptDialog, toast } from '../../components/common/Dialog.jsx'
import { T, tr, personName, useLang } from '../../i18n/LanguageContext.jsx'
import { sanitizeItemName } from '../../lib/validation.js'

const DENOMINATIONS = ['Mixed', 'Notes', 'Coins', 'Foreign Currency', 'Jewellery']
const VER_TONE = { Verified: 'green', 'Pending Verification': 'blue', Rejected: 'red' }
const DEP_TONE = { Deposited: 'green', 'Pending Deposit': 'amber', 'N/A': 'gray' }
const VAL_TONE = { 'In Store': 'green', 'Pending Custody': 'violet' }
const nowLocal = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const today = () => nowLocal().slice(0, 10)
const memberCount = (s) => (s ? s.split(',').filter((x) => x.trim()).length : 0)

const emptyLine = () => ({ hundi_item_id: '', item_name: '', item_type: '', quantity: '', unit: '', value: '', remarks: '' })
const lineTotal = (lines) => lines.reduce((s, l) => s + Number(l.value || 0), 0)

const emptyForm = () => ({
  collected_on: today(), counting_completed_on: nowLocal(),
  denomination: 'Mixed', officer: '', lines: [emptyLine()],
  members: [], verified_by: '', verified_on: nowLocal(),
  deposit_status: 'Deposited', deposited_on: today(), bank_name: '', bank_ref: '', attachment: '',
})

export default function Hundi() {
  const { user } = useAuth()
  const { lang } = useLang()
  const canWrite = user?.role !== 'Accountant'
  const canVerify = ['Committee', 'Administrator', 'Admin'].includes(user?.role)
  const SIZE = 15
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [stats, setStats] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [view, setView] = useState(null)
  const [committee, setCommittee] = useState([])
  const [banks, setBanks] = useState([])
  const [itemMaster, setItemMaster] = useState([])

  const [q, setQ] = useState('')
  const [verification, setVerification] = useState('')
  const [deposit, setDeposit] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  // Sortable table columns
  const sortColumns = [
    { key: 'code', label: 'Hundi ID', type: 'text' },
    { key: 'collected_on', label: 'Date', type: 'date' },
    { key: 'cash_amount', label: 'Cash (₹)', type: 'money' },
    { key: 'valuables_amount', label: 'Valuables (₹)', type: 'money' },
    { key: 'verification_status', label: 'Verification', type: 'text' },
    { key: 'deposit_status', label: 'Cash Status', type: 'text' },
    { key: 'valuables_status', label: 'Valuables Status', type: 'text' },
  ]
  const { sortedRows, sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection } = useSortableTable(rows, sortColumns, [{ key: 'collected_on', direction: 'desc' }])

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('')
    try {
      const [d, s] = await Promise.all([
        HundiAPI.list({ q, verification, deposit, start, end, page, size: SIZE }),
        HundiAPI.stats().catch(() => null),
      ])
      setRows(d.items); setTotal(d.total); if (s) setStats(s)
    } catch (ex) {
      setLoadErr(ex?.detail || tr("Couldn't load collections — check your connection and retry."))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q, verification, deposit, start, end, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useEffect(() => { setPage(1) }, [q, verification, deposit, start, end])

  useEffect(() => {
    CommitteeAPI.list()
      .then((r) => { const arr = Array.isArray(r) ? r : (r.items || []); setCommittee(arr.filter((c) => c.active)) })
      .catch(() => {})
    SettingsAPI.config()
      .then((c) => setBanks(Array.isArray(c?.banks) ? c.banks : []))
      .catch(() => {})
    HundiItemsAPI.list()
      .then((r) => { const arr = Array.isArray(r) ? r : (r.items || []); setItemMaster(arr.filter((i) => i.active)) })
      .catch(() => {})
  }, [])

  const committeeNames = committee.map((c) => c.name)
  const openCreate = () => setDrawer({ ...emptyForm(), bank_name: banks[0] || '' })
  const toggleMember = (name) => setDrawer((d) => ({ ...d, members: d.members.includes(name) ? d.members.filter((x) => x !== name) : [...d.members, name] }))

  // ── Item-wise counting register helpers ──
  const setLine = (i, patch) => setDrawer((d) => ({ ...d, lines: d.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  // Add new item at the top so the form appears first (Item 24)
  const addLine = () => setDrawer((d) => ({ ...d, lines: [emptyLine(), ...d.lines] }))
  const removeLine = (i) => setDrawer((d) => ({ ...d, lines: d.lines.length > 1 ? d.lines.filter((_, idx) => idx !== i) : d.lines }))
  const pickItem = (i, id) => {
    const it = itemMaster.find((x) => String(x.id) === String(id))
    if (!it) { setLine(i, { hundi_item_id: '', item_name: '', item_type: '', unit: '' }); return }
    setLine(i, { hundi_item_id: it.id, item_name: it.name, item_type: it.item_type || '', unit: it.unit || '' })
  }

  async function depositCollection(h) {
    const cashAmt = h.cash_amount || 0
    const res = await promptDialog({
      title: `${tr('Record Cash Bank Deposit')} — ${h.code}`,
      message: `${tr('Cash amount')}: ${inr(cashAmt)}`,
      confirmLabel: tr('Record Deposit'),
      fields: [
        { k: 'bank_name', label: tr('Bank name'), defaultValue: h.bank_name || '', placeholder: tr('e.g. SBI Punjagutta') },
        { k: 'bank_ref', label: tr('Bank reference / challan no.'), note: tr('Optional') },
      ],
    })
    if (!res) return
    try { await HundiAPI.deposit(h.id, { bank_name: res.bank_name.trim() || null, bank_ref: res.bank_ref.trim() || null, deposited_on: today() }); toast(tr('Cash deposited to bank.')); load() }
    catch (ex) { toast(ex.detail || tr('Could not record the deposit.'), 'error') }
  }
  async function storeValuables(h) {
    const valAmt = h.valuables_amount || 0
    const res = await promptDialog({
      title: `${tr('Record Valuables Store Custody')} — ${h.code}`,
      message: `${tr('Valuables amount')}: ${inr(valAmt)}`,
      confirmLabel: tr('Record Custody'),
      fields: [
        { k: 'store_location', label: tr('Store Location'), defaultValue: '', placeholder: tr('e.g. Main Vault, Locker A') },
        { k: 'custodian', label: tr('Custodian Name'), defaultValue: '', placeholder: tr('Committee member holding custody') },
      ],
    })
    if (!res) return
    try { await HundiAPI.store(h.id, { store_location: res.store_location.trim() || null, custodian: res.custodian.trim() || null, stored_on: today() }); toast(tr('Valuables stored in custody.')); load() }
    catch (ex) { toast(ex.detail || tr('Could not record custody.'), 'error') }
  }
  async function rejectCollection(h) {
    const res = await promptDialog({
      title: `${tr('Flag a discrepancy')} — ${h.code}`,
      message: `Counted amount: ₹${h.counted_amount}. The collection will be marked Rejected.`,
      tone: 'danger', confirmLabel: tr('Reject Collection'),
      fields: [{ k: 'reason', label: tr('Reason'), required: true, placeholder: tr('What is wrong with this count?') }],
    })
    if (!res) return
    try { await HundiAPI.reject(h.id, { reason: res.reason.trim() }); toast(tr('Collection rejected.')); load() }
    catch (ex) { toast(ex.detail || tr('Could not reject this collection.'), 'error') }
  }
  async function verify(h) {
    try { await HundiAPI.verify(h.id); toast(tr('Collection verified.')); load() }
    catch (ex) { toast(ex.detail || tr('Could not verify this collection.'), 'error') }
  }

  async function save(e) {
    e.preventDefault()
    const m = drawer
    const items = m.lines
      .filter((l) => l.item_name.trim() && l.value !== '')
      .map((l) => ({
        hundi_item_id: (l.hundi_item_id && l.hundi_item_id !== 'custom') ? l.hundi_item_id : null,
        item_name: l.item_name.trim(),
        item_type: l.item_type || null,
        quantity: l.quantity !== '' ? Number(l.quantity) : null,
        unit: l.unit || null,
        value: Number(l.value || 0),
        remarks: l.remarks || null,
      }))
    if (items.length === 0) { toast(tr('Add at least one counted item line with a value.'), 'error'); return }
    try {
      // Verification/deposit fields are server-controlled (always born Pending) —
      // only the actual collection data is sent.
      await HundiAPI.create({
        collected_on: m.collected_on || null,
        counted_amount: lineTotal(m.lines),   // server recomputes from items; sent for the no-items fallback path
        counting_completed_on: m.counting_completed_on || null,
        denomination: m.denomination || null,
        officer: m.officer || null,
        items,
        committee_members: m.members.map((x) => x.trim()).filter(Boolean),
      })
      setDrawer(null); load()
    } catch (ex) { toast(ex.detail || tr('Could not save this collection.'), 'error') }
  }
  const setM = (patch) => setDrawer((d) => ({ ...d, ...patch }))

  const EXPORT_COLS = [
    { key: 'code', label: tr('Hundi ID') },
    { key: 'collected_on', label: tr('Collection Date') },
    { key: 'cash_amount', label: tr('Cash (₹)'), type: 'money' },
    { key: 'valuables_amount', label: tr('Valuables (₹)'), type: 'money' },
    { key: 'verification_status', label: tr('Verification') },
    { key: 'deposit_status', label: tr('Cash Status') },
    { key: 'bank_name', label: tr('Bank') },
    { key: 'valuables_status', label: tr('Valuables Status') },
    { key: 'store_location', label: tr('Store Location') },
  ]
  const exportRows = rows
  const exportTotal = {
    code: 'Total',
    cash_amount: rows.reduce((s, h) => s + Number(h.cash_amount || 0), 0),
    valuables_amount: rows.reduce((s, h) => s + Number(h.valuables_amount || 0), 0),
  }
  return (
    <div>
      <PageTitle title={tr("Hundi Management")} subtitle={tr("Manage physical hundi collections from the temple, counting, verification and bank deposits.")}
        actions={<span className="inline-flex items-center gap-2"><ExportButtons title={tr("Hundi Collection Register")} columns={EXPORT_COLS} rows={exportRows} total={exportTotal} />{canWrite ? <button onClick={openCreate} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Record New Collection</T></button> : <span className="px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-blue-50 text-blue-700"><T>View only</T></span>}</span>} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatTile icon={HandCoins} color="#059669" bg="bg-emerald-50" title={tr("This Month Total")}
          value={stats ? inr(stats.month_amount) : '—'} sub={stats ? `${num(stats.month_count)} ${tr("Collections")}` : ''} />
        <StatTile icon={IndianRupee} color="#2563eb" bg="bg-blue-50" title={tr("Cash (This Month)")}
          value={stats ? inr(stats.month_cash) : '—'} sub={stats?.pending_deposit_count ? `${num(stats.pending_deposit_count)} ${tr("Pending Deposit")}` : tr("For bank deposit")} />
        <StatTile icon={Gem} color="#7c3aed" bg="bg-violet-50" title={tr("Valuables (This Month)")}
          value={stats ? inr(stats.month_valuables) : '—'} sub={stats?.pending_custody_count ? `${num(stats.pending_custody_count)} ${tr("Pending Custody")}` : tr("Gold, Silver, Jewellery")} />
        <StatTile icon={Landmark} color="#d97706" bg="bg-amber-50" title={tr("Cash Deposited")}
          value={stats ? inr(stats.deposited_month_amount) : '—'} sub={stats ? `${num(stats.deposited_month_count)} ${tr("Bank Deposits")}` : ''} />
        <StatTile icon={Lock} color="#059669" bg="bg-emerald-50" title={tr("Valuables In Store")}
          value={stats ? `${num(stats.stored_month_count)}` : '—'} sub={tr("Collections in custody")} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 flex flex-wrap items-end gap-4">
          <div className="min-w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>From</T></label>
            <DateField value={start} onChange={(e) => setStart(e.target.value)} className="input" />
          </div>
          <div className="min-w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
            <DateField value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
          </div>
          <div className="min-w-[10rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Verification Status</T></label>
            <Select value={verification} onChange={(e) => setVerification(e.target.value)} className="input"><option value="">{tr("All")}</option><option value="Verified">{tr("Verified")}</option><option value="Pending Verification">{tr("Pending Verification")}</option></Select>
          </div>
          <div className="min-w-[10rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Deposit Status</T></label>
            <Select value={deposit} onChange={(e) => setDeposit(e.target.value)} className="input"><option value="">{tr("All")}</option><option value="Deposited">{tr("Deposited")}</option><option value="Pending Deposit">{tr("Pending Deposit")}</option></Select>
          </div>
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search by Reference No.</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search reference number…")} className="input !pl-9" /></div>
          </div>
        </div>

        <SortPanel sorts={sorts} columns={sortColumns} onToggle={handleColumnClick} onRemove={removeSort} onClear={clearSorts} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              {sortColumns.map((col) => {
                const sortIdx = getSortIndex(col.key)
                const sortDir = getSortDirection(col.key)
                const isSorted = sortIdx >= 0
                return (
                  <th key={col.key} onClick={(e) => handleColumnClick(col.key, e)}
                    className={`px-4 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-blue-700 bg-blue-50/50' : ''}`}
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
              <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRows.map((h) => (
                <tr key={h.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[0.75rem] text-gray-500 whitespace-nowrap">{h.code}</td>
                  <td className="px-4 py-3 text-gray-600 text-[0.8125rem] whitespace-nowrap">{fmtDate(h.collected_on)}</td>
                  <td className="px-4 py-3 font-semibold text-blue-700">{h.cash_amount > 0 ? inr(h.cash_amount) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 font-semibold text-violet-700">{h.valuables_amount > 0 ? inr(h.valuables_amount) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3"><Pill tone={VER_TONE[h.verification_status] || 'gray'}>{tr(h.verification_status)}</Pill></td>
                  <td className="px-4 py-3">{h.deposit_status && h.deposit_status !== 'N/A' ? <Pill tone={DEP_TONE[h.deposit_status] || 'gray'}>{tr(h.deposit_status)}</Pill> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">{h.valuables_status ? <Pill tone={VAL_TONE[h.valuables_status] || 'gray'}>{tr(h.valuables_status)}</Pill> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => setView(h)} title={tr("View details")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                      {canVerify && h.verification_status === 'Pending Verification' && (
                        <>
                          <button onClick={() => verify(h)} title={tr("Verify collection")} className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-emerald-200 text-emerald-700 text-[0.78125rem] font-semibold hover:bg-emerald-50"><CheckCircle2 size={15} />{' '}<T>Verify</T></button>
                          <button onClick={() => rejectCollection(h)} title={tr("Flag a discrepancy")} className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-red-200 text-red-600 text-[0.78125rem] font-semibold hover:bg-red-50"><T>Reject</T></button>
                        </>
                      )}
                      {canWrite && h.verification_status === 'Verified' && h.deposit_status === 'Pending Deposit' && h.cash_amount > 0 && (
                        <button onClick={() => depositCollection(h)} title={tr("Record cash bank deposit")} className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-blue-200 text-blue-700 text-[0.78125rem] font-semibold hover:bg-blue-50"><Landmark size={15} />{' '}<T>Bank Deposit</T></button>
                      )}
                      {canWrite && h.verification_status === 'Verified' && h.valuables_status === 'Pending Custody' && h.valuables_amount > 0 && (
                        <button onClick={() => storeValuables(h)} title={tr("Record valuables store custody")} className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-violet-200 text-violet-700 text-[0.78125rem] font-semibold hover:bg-violet-50"><Lock size={15} />{' '}<T>Store Custody</T></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <TableStates colSpan={8} loading={loading} error={loadErr} onRetry={load} empty={tr("No collections recorded.")} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit={tr("collections")} />
        </div>
      </div>

      {/* ── Record New Hundi Collection drawer ── */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Record New Hundi Collection</T></h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Record hundi collection, counting, verification and deposit details.</T></p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-6 flex-1">
              <DSection n="1" icon={FileText} title={tr("Collection Details")}>
                <div><label className="label"><T>Collection Date *</T></label><DateField required className="input" value={drawer.collected_on} onChange={(e) => setM({ collected_on: e.target.value })} /></div>
                <div><label className="label"><T>Reference No.</T></label><input disabled className="input bg-gray-50" value={tr("Auto-generated on save")} /><div className="text-[0.6875rem] text-gray-400 mt-1"><T>Auto generated</T></div></div>
              </DSection>

              <DSection n="2" icon={Calculator} title={tr("Counting Details")}>
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="label !mb-0 flex items-center gap-1.5"><Package size={13} />{' '}<T>Item-wise Counting Register *</T></label>
                    <button type="button" onClick={addLine} className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-maroon-700 hover:text-maroon-800"><Plus size={13} />{' '}<T>Add Item</T></button>
                  </div>
                  <div className="space-y-2.5">
                    {drawer.lines.map((l, i) => (
                      <div key={i} className="border border-gray-200 rounded-lg p-2.5 space-y-2 bg-gray-50/40">
                        <div className="flex items-center gap-2">
                          <Select className="input !py-1.5 text-[0.78125rem] flex-1" value={l.hundi_item_id} onChange={(e) => { if (e.target.value === 'custom') { setLine(i, { hundi_item_id: 'custom', item_name: '', item_type: '', unit: '' }) } else { pickItem(i, e.target.value) } }}>
                            <option value="">{tr("Select item…")}</option>
                            {itemMaster.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                            <option value="custom">{tr("Custom (Enter manually)")}</option>
                          </Select>
                          <button type="button" onClick={() => removeLine(i)} disabled={drawer.lines.length <= 1} title={tr("Remove line")}
                            className="w-8 h-8 shrink-0 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-red-600 hover:border-red-200 disabled:opacity-40"><Trash2 size={14} /></button>
                        </div>
                        {(l.hundi_item_id === 'custom' || (l.item_name && !l.hundi_item_id)) && (
                          <input className="input !py-1.5 text-[0.78125rem]" placeholder={tr("Enter custom item name")} value={l.item_name}
                            onChange={(e) => setLine(i, { item_name: sanitizeItemName(e.target.value) })} autoFocus />
                        )}
                        <div className="grid grid-cols-3 gap-2">
                          <NumberField min="0" step="any" className="!py-1.5 text-[0.78125rem]" placeholder={tr("Qty")} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                          <input className="input !py-1.5 text-[0.78125rem]" placeholder={tr("Unit")} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
                          <NumberField required min="0" step="any" prefix="₹" className="!py-1.5 text-[0.78125rem]" placeholder={tr("Value *")} value={l.value} onChange={(e) => setLine(i, { value: e.target.value })} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between bg-maroon-50 border border-maroon-100 rounded-lg px-3 py-2.5 mt-3">
                    <span className="text-[0.78125rem] font-semibold text-maroon-800"><T>Total Amount Counted</T></span>
                    <span className="text-[0.9375rem] font-extrabold text-maroon-800 tabular-nums">{inr(lineTotal(drawer.lines))}</span>
                  </div>
                </div>
                <div><label className="label"><T>Counting Completed On *</T></label><DateTimeField required value={drawer.counting_completed_on} onChange={(e) => setM({ counting_completed_on: e.target.value })} /></div>
                <div><label className="label"><T>Denomination *</T></label>
                  <Select className="input" value={drawer.denomination} onChange={(e) => setM({ denomination: e.target.value })}>{DENOMINATIONS.map((d) => <option key={d} value={d}>{tr(d)}</option>)}</Select></div>
                <div className="col-span-2"><label className="label"><T>Officer</T></label>
                  <Select className="input" value={drawer.officer} onChange={(e) => setM({ officer: e.target.value })}>
                    <option value="">{tr('Select…')}</option>{committeeNames.map((n) => <option key={n}>{n}</option>)}
                  </Select></div>
              </DSection>

              <div>
                <div className="flex items-center gap-2 mb-3 text-maroon-700">
                  <span className="w-5 h-5 rounded-full bg-maroon-700 text-cream text-[0.6875rem] grid place-items-center font-bold">3</span>
                  <span className="font-semibold text-[0.84375rem]"><T>Committee Members (Present During Counting)</T></span>
                </div>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
                  {committee.length === 0 && <div className="px-3 py-2.5 text-[0.75rem] text-gray-400"><T>No active committee members found.</T></div>}
                  {committee.map((c) => (
                    <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 text-[0.8125rem] text-gray-700 hover:bg-gray-50 cursor-pointer">
                      <Checkbox checked={drawer.members.includes(c.name)} onChange={() => toggleMember(c.name)} />
                      <span className="flex-1">{personName(c, lang)}</span>
                      {c.designation && <span className="text-[0.6875rem] text-gray-400">{tr(c.designation)}</span>}
                    </label>
                  ))}
                </div>
                <div className="bg-blue-50/70 border border-blue-100 rounded-lg px-3 py-2.5 text-[0.75rem] text-gray-600 flex items-start gap-2 mt-3"><Info size={15} className="text-blue-500 shrink-0 mt-0.5" />{' '}<T>Select committee members who were present during counting.</T>{' '}{drawer.members.length} {tr('selected.')}</div>
              </div>

              {/* Verification & deposit are deliberately NOT set here: the server records
                  every new collection as Pending Verification; a different committee member
                  verifies it from the list, and the bank deposit is recorded after
                  verification via the Deposit action. */}
              <div className="bg-amber-50/70 border border-amber-100 rounded-lg px-3 py-2.5 text-[0.75rem] text-gray-600 flex items-start gap-2">
                <Info size={15} className="text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <T>New collections are recorded as</T>{' '}<b>&nbsp;{tr('Pending Verification')}&nbsp;</b>.{' '}
                  <T>A different committee member verifies from the list; the bank deposit is recorded after verification (Deposit action).</T>
                </span>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button className="btn-maroon flex-1 justify-center"><T>Save Collection</T>{' '}<ChevronDown size={14} /></button>
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
              <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Hundi Collection</T></h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5 font-mono">{view.code}</p></div>
              <button onClick={() => setView(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-6 flex-1">
              <DSection n="1" icon={FileText} title={tr("Collection Details")}>
                <VField label={tr("Collection Date")} value={fmtDate(view.collected_on)} />
                <VField label={tr("Counting Completed")} value={fmtStamp(view.counting_completed_on)} />
                <VField label={tr("Total Amount Counted")} value={inr(view.counted_amount)} />
                <VField label={tr("Committee Members")} value={`${memberCount(view.committee_members)} ${tr("Members")}`} />
                <VField label={tr("Members")} value={view.committee_members ? view.committee_members.split(',').map((n) => personName({ name: n.trim() }, lang)).join(', ') : '—'} wide />
              </DSection>
              {Array.isArray(view.items) && view.items.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-maroon-700">
                    <span className="w-5 h-5 rounded-full bg-maroon-700 text-cream text-[0.6875rem] grid place-items-center font-bold"><Package size={12} /></span>
                    <span className="font-semibold text-[0.84375rem]"><T>Counted Items</T></span>
                  </div>
                  <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                    {view.items.map((it, i) => (
                      <div key={it.id ?? i} className="flex items-start justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="text-[0.8125rem] font-medium text-gray-800 truncate">{it.item_name}</div>
                          <div className="text-[0.6875rem] text-gray-400">
                            {it.item_type || '—'}
                            {it.quantity != null && ` · ${num(it.quantity)}${it.unit ? ` ${it.unit}` : ''}`}
                          </div>
                        </div>
                        <div className="text-[0.8125rem] font-semibold text-gray-800 tabular-nums shrink-0">{inr(it.value)}</div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50/70">
                      <span className="text-[0.75rem] font-semibold text-gray-500"><T>Total</T></span>
                      <span className="text-[0.8125rem] font-extrabold text-maroon-800 tabular-nums">{inr(view.counted_amount)}</span>
                    </div>
                  </div>
                </div>
              )}
              <DSection n="2" icon={ShieldCheck} title={tr("Verification")}>
                <VField label={tr("Status")} value={<Pill tone={VER_TONE[view.verification_status]}>{tr(view.verification_status)}</Pill>} />
                <VField label={tr("Verified By")} value={view.verified_by ? personName({ name: view.verified_by }, lang) : '—'} />
                <VField label={tr("Verified On")} value={view.verified_on ? fmtStamp(view.verified_on) : '—'} wide />
              </DSection>
              {/* Cash → Bank Deposit Section */}
              {view.cash_amount > 0 && (
                <DSection n="3" icon={Landmark} title={tr("Cash → Bank Deposit")}>
                  <VField label={tr("Cash Amount")} value={inr(view.cash_amount)} />
                  <VField label={tr("Status")} value={<Pill tone={DEP_TONE[view.deposit_status]}>{tr(view.deposit_status)}</Pill>} />
                  <VField label={tr("Deposit Date")} value={view.deposited_on ? fmtDate(view.deposited_on) : '—'} />
                  <VField label={tr("Bank Name")} value={view.bank_name ? tr(view.bank_name) : '—'} />
                  <VField label={tr("Challan / Reference")} value={view.bank_ref || '—'} wide />
                </DSection>
              )}
              {/* Valuables → Store Custody Section */}
              {view.valuables_amount > 0 && (
                <DSection n={view.cash_amount > 0 ? "4" : "3"} icon={Lock} title={tr("Valuables → Store Custody")}>
                  <VField label={tr("Valuables Amount")} value={inr(view.valuables_amount)} />
                  <VField label={tr("Status")} value={view.valuables_status ? <Pill tone={VAL_TONE[view.valuables_status]}>{tr(view.valuables_status)}</Pill> : '—'} />
                  <VField label={tr("Custody Date")} value={view.valuables_stored_on ? fmtDate(view.valuables_stored_on) : '—'} />
                  <VField label={tr("Store Location")} value={view.store_location || '—'} />
                  <VField label={tr("Custodian")} value={view.valuables_custodian ? personName({ name: view.valuables_custodian }, lang) : '—'} wide />
                </DSection>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={() => setView(null)} className="btn-maroon w-full justify-center"><T>Close</T></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DSection({ n, icon: Icon, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-maroon-700">
        <span className="w-5 h-5 rounded-full bg-maroon-700 text-cream text-[0.6875rem] grid place-items-center font-bold">{n}</span>
        <span className="font-semibold text-[0.84375rem]">{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">{children}</div>
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
