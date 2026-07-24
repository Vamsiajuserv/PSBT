import React, { useEffect, useState, useCallback } from 'react'
import {
  Plus, X, Eye, Search, RotateCcw, Calendar, Info, ChevronDown, Trash2, Upload,
  HandCoins, IndianRupee, Landmark, CalendarClock, FileText, Calculator, Users, ShieldCheck, Building2,
  Package, CheckCircle2,
} from 'lucide-react'
import { PageTitle, StatTile, Pill, Pager, inr, num, fmtDate, fmtStamp } from '../../components/admin/ui.jsx'
import { HundiAPI, HundiItemsAPI, DevoteesAPI, CommitteeAPI, SettingsAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { TableStates } from '../../components/common/states.jsx'
import ExportButtons from '../../components/common/ExportButtons.jsx'
import { Select, DateField, DateTimeField, Checkbox, NumberField } from '../../components/common/Field.jsx'
import { promptDialog, toast } from '../../components/common/Dialog.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const DENOMINATIONS = ['Mixed', 'Notes', 'Coins', 'Foreign Currency', 'Jewellery']
const VER_TONE = { Verified: 'green', 'Pending Verification': 'blue' }
const DEP_TONE = { Deposited: 'green', 'Pending Deposit': 'amber' }
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

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('')
    try {
      const [d, s] = await Promise.all([
        HundiAPI.list({ q, verification, deposit, start, end, page, size: SIZE }),
        HundiAPI.stats().catch(() => null),
      ])
      setRows(d.items); setTotal(d.total); if (s) setStats(s)
    } catch (ex) {
      setLoadErr(ex?.detail || "Couldn't load collections — check your connection and retry.")
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
  const addLine = () => setDrawer((d) => ({ ...d, lines: [...d.lines, emptyLine()] }))
  const removeLine = (i) => setDrawer((d) => ({ ...d, lines: d.lines.length > 1 ? d.lines.filter((_, idx) => idx !== i) : d.lines }))
  const pickItem = (i, id) => {
    const it = itemMaster.find((x) => String(x.id) === String(id))
    if (!it) { setLine(i, { hundi_item_id: '', item_name: '', item_type: '', unit: '' }); return }
    setLine(i, { hundi_item_id: it.id, item_name: it.name, item_type: it.item_type || '', unit: it.unit || '' })
  }

  async function depositCollection(h) {
    const res = await promptDialog({
      title: `Record bank deposit — ${h.code}`,
      message: `Counted amount: ₹${h.counted_amount}`,
      confirmLabel: 'Record Deposit',
      fields: [
        { k: 'bank_name', label: 'Bank name', defaultValue: h.bank_name || '', placeholder: 'e.g. SBI Punjagutta' },
        { k: 'bank_ref', label: 'Bank reference / challan no.', note: 'Optional' },
      ],
    })
    if (!res) return
    try { await HundiAPI.deposit(h.id, { bank_name: res.bank_name.trim() || null, bank_ref: res.bank_ref.trim() || null, deposited_on: today() }); toast('Deposit recorded.'); load() }
    catch (ex) { toast(ex.detail || 'Could not record the deposit.', 'error') }
  }
  async function rejectCollection(h) {
    const res = await promptDialog({
      title: `Flag a discrepancy — ${h.code}`,
      message: `Counted amount: ₹${h.counted_amount}. The collection will be marked Rejected.`,
      tone: 'danger', confirmLabel: 'Reject Collection',
      fields: [{ k: 'reason', label: 'Reason', required: true, placeholder: 'What is wrong with this count?' }],
    })
    if (!res) return
    try { await HundiAPI.reject(h.id, { reason: res.reason.trim() }); toast('Collection rejected.'); load() }
    catch (ex) { toast(ex.detail || 'Could not reject this collection.', 'error') }
  }
  async function verify(h) {
    try { await HundiAPI.verify(h.id); toast('Collection verified.'); load() }
    catch (ex) { toast(ex.detail || 'Could not verify this collection.', 'error') }
  }

  async function save(e) {
    e.preventDefault()
    const m = drawer
    const items = m.lines
      .filter((l) => l.item_name.trim() && l.value !== '')
      .map((l) => ({
        hundi_item_id: l.hundi_item_id || null,
        item_name: l.item_name.trim(),
        item_type: l.item_type || null,
        quantity: l.quantity !== '' ? Number(l.quantity) : null,
        unit: l.unit || null,
        value: Number(l.value || 0),
        remarks: l.remarks || null,
      }))
    if (items.length === 0) { toast('Add at least one counted item line with a value.', 'error'); return }
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
    } catch (ex) { toast(ex.detail || 'Could not save this collection.', 'error') }
  }
  const setM = (patch) => setDrawer((d) => ({ ...d, ...patch }))

  const EXPORT_COLS = [{ key: 'code', label: 'Hundi ID' }, { key: 'collected_on', label: 'Collection Date' },
    { key: 'counted_amount', label: 'Amount (₹)', type: 'money' }, { key: 'committee_members', label: 'Committee Members' },
    { key: 'verification_status', label: 'Verification' }, { key: 'deposit_status', label: 'Deposit' },
    { key: 'deposited_on', label: 'Deposit Date' }, { key: 'bank_name', label: 'Bank' }]
  const exportRows = rows
  const exportTotal = { code: 'Total', counted_amount: rows.reduce((s, h) => s + Number(h.counted_amount || 0), 0) }
  return (
    <div>
      <PageTitle title={tr("Hundi Management")} subtitle="Manage physical hundi collections from the temple, counting, verification and bank deposits."
        actions={<span className="inline-flex items-center gap-2"><ExportButtons title={tr("Hundi Collection Register")} columns={EXPORT_COLS} rows={exportRows} total={exportTotal} />{canWrite ? <button onClick={openCreate} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Record New Collection</T></button> : <span className="px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-blue-50 text-blue-700"><T>View only</T></span>}</span>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={HandCoins} color="#059669" bg="bg-emerald-50" title={tr("Latest Collection")}
          value={stats ? inr(stats.latest_amount) : '—'} sub={stats?.latest_date ? fmtDate(stats.latest_date) : '—'} />
        <StatTile icon={IndianRupee} color="#7c3aed" bg="bg-violet-50" title={tr("This Month Collections")}
          value={stats ? inr(stats.month_amount) : '—'} sub={stats ? `${num(stats.month_count)} Collections` : ''} />
        <StatTile icon={Landmark} color="#d97706" bg="bg-amber-50" title={tr("Deposited This Month")}
          value={stats ? inr(stats.deposited_month_amount) : '—'} sub={stats ? `${num(stats.deposited_month_count)} Deposits` : ''} />
        <StatTile icon={CalendarClock} color="#2563eb" bg="bg-blue-50" title={tr("Pending Deposit")}
          value={stats ? inr(stats.pending_amount) : '—'} sub={stats ? `${num(stats.pending_count)} Collections` : ''} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Date Range</T></label>
            <div className="flex items-center gap-1.5">
              <DateField value={start} onChange={(e) => setStart(e.target.value)} className="input !px-2.5 text-[0.78125rem]" />
              <span className="text-gray-400">–</span>
              <DateField value={end} onChange={(e) => setEnd(e.target.value)} className="input !px-2.5 text-[0.78125rem]" />
            </div>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Verification Status</T></label>
            <Select value={verification} onChange={(e) => setVerification(e.target.value)} className="input"><option value="">All</option><option>Verified</option><option>Pending Verification</option></Select>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Deposit Status</T></label>
            <Select value={deposit} onChange={(e) => setDeposit(e.target.value)} className="input"><option value="">All</option><option>Deposited</option><option>Pending Deposit</option></Select>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search by Reference No.</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search reference number…")} className="input !pl-9" /></div>
          </div>
          <div className="xl:col-span-4 flex gap-2 justify-end">
            <button onClick={() => { setQ(''); setVerification(''); setDeposit(''); setStart(''); setEnd('') }} className="btn-outline !py-2.5"><RotateCcw size={14} />{' '}<T>Reset</T></button>
            <button onClick={() => load()} className="btn-maroon !py-2.5"><Search size={14} />{' '}<T>Search</T></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
              {['Hundi ID', 'Collection Date', 'Total Amount (₹)', 'Committee Members', 'Verification Status', 'Deposit Status', 'Deposit Date', 'Bank Name', 'Actions'].map((c) => <th key={c} className="px-4 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((h) => (
                <tr key={h.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[0.75rem] text-gray-500 whitespace-nowrap">{h.code}</td>
                  <td className="px-4 py-3 text-gray-600 text-[0.8125rem] whitespace-nowrap">{fmtDate(h.collected_on)}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{inr(h.counted_amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{memberCount(h.committee_members)} Members</td>
                  <td className="px-4 py-3"><Pill tone={VER_TONE[h.verification_status] || 'gray'}>{h.verification_status}</Pill></td>
                  <td className="px-4 py-3"><Pill tone={DEP_TONE[h.deposit_status] || 'gray'}>{h.deposit_status}</Pill></td>
                  <td className="px-4 py-3 text-gray-600 text-[0.8125rem]">{h.deposited_on ? fmtDate(h.deposited_on) : <span className="text-gray-300">-</span>}</td>
                  <td className="px-4 py-3 text-gray-600 text-[0.8125rem]">{h.bank_name || <span className="text-gray-300">-</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setView(h)} title={tr("View details")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                      {canVerify && h.verification_status === 'Pending Verification' && (
                        <>
                          <button onClick={() => verify(h)} title={tr("Verify collection")} className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-emerald-200 text-emerald-700 text-[0.78125rem] font-semibold hover:bg-emerald-50"><CheckCircle2 size={15} />{' '}<T>Verify</T></button>
                          <button onClick={() => rejectCollection(h)} title={tr("Flag a discrepancy")} className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-red-200 text-red-600 text-[0.78125rem] font-semibold hover:bg-red-50"><T>Reject</T></button>
                        </>
                      )}
                      {canWrite && h.verification_status === 'Verified' && h.deposit_status !== 'Deposited' && (
                        <button onClick={() => depositCollection(h)} title={tr("Record bank deposit")} className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-blue-200 text-blue-700 text-[0.78125rem] font-semibold hover:bg-blue-50"><Landmark size={15} />{' '}<T>Deposit</T></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <TableStates colSpan={9} loading={loading} error={loadErr} onRetry={load} empty="No collections recorded." />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit="collections" />
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
                <div><label className="label"><T>Reference No.</T></label><input disabled className="input bg-gray-50" value="Auto-generated on save" /><div className="text-[0.6875rem] text-gray-400 mt-1"><T>Auto generated</T></div></div>
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
                          <Select className="input !py-1.5 text-[0.78125rem] flex-1" value={l.hundi_item_id} onChange={(e) => pickItem(i, e.target.value)}>
                            <option value="">Select item…</option>
                            {itemMaster.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                          </Select>
                          <button type="button" onClick={() => removeLine(i)} disabled={drawer.lines.length <= 1} title={tr("Remove line")}
                            className="w-8 h-8 shrink-0 grid place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 disabled:opacity-40"><Trash2 size={14} /></button>
                        </div>
                        <input className="input !py-1.5 text-[0.78125rem]" placeholder={tr("Item name (or free text)")} value={l.item_name}
                          onChange={(e) => setLine(i, { item_name: e.target.value, hundi_item_id: '' })} />
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
                  <Select className="input" value={drawer.denomination} onChange={(e) => setM({ denomination: e.target.value })}>{DENOMINATIONS.map((d) => <option key={d}>{d}</option>)}</Select></div>
                <div className="col-span-2"><label className="label"><T>Officer</T></label>
                  <Select className="input" value={drawer.officer} onChange={(e) => setM({ officer: e.target.value })}>
                    <option value="">Select…</option>{committeeNames.map((n) => <option key={n}>{n}</option>)}
                  </Select></div>
              </DSection>

              <div>
                <div className="flex items-center gap-2 mb-3 text-maroon-700">
                  <span className="w-5 h-5 rounded-full bg-maroon-700 text-cream text-[0.6875rem] grid place-items-center font-bold">3</span>
                  <span className="font-semibold text-[0.84375rem]">Committee Members (Present During Counting)</span>
                </div>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
                  {committee.length === 0 && <div className="px-3 py-2.5 text-[0.75rem] text-gray-400"><T>No active committee members found.</T></div>}
                  {committee.map((c) => (
                    <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 text-[0.8125rem] text-gray-700 hover:bg-gray-50 cursor-pointer">
                      <Checkbox checked={drawer.members.includes(c.name)} onChange={() => toggleMember(c.name)} />
                      <span className="flex-1">{c.name}</span>
                      {c.designation && <span className="text-[0.6875rem] text-gray-400">{c.designation}</span>}
                    </label>
                  ))}
                </div>
                <div className="bg-blue-50/70 border border-blue-100 rounded-lg px-3 py-2.5 text-[0.75rem] text-gray-600 flex items-start gap-2 mt-3"><Info size={15} className="text-blue-500 shrink-0 mt-0.5" /> Select committee members who were present during counting. {drawer.members.length} selected.</div>
              </div>

              {/* Verification & deposit are deliberately NOT set here: the server records
                  every new collection as Pending Verification; a different committee member
                  verifies it from the list, and the bank deposit is recorded after
                  verification via the Deposit action. */}
              <div className="bg-amber-50/70 border border-amber-100 rounded-lg px-3 py-2.5 text-[0.75rem] text-gray-600 flex items-start gap-2">
                <Info size={15} className="text-amber-600 shrink-0 mt-0.5" /><T>New collections are recorded as</T>{' '}<b>&nbsp;Pending Verification&nbsp;</b>. A different committee
                member verifies from the list; the bank deposit is recorded after verification (Deposit action).
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
                <VField label="Collection Date" value={fmtDate(view.collected_on)} />
                <VField label="Counting Completed" value={fmtStamp(view.counting_completed_on)} />
                <VField label="Total Amount Counted" value={inr(view.counted_amount)} />
                <VField label="Committee Members" value={`${memberCount(view.committee_members)} Members`} />
                <VField label="Members" value={view.committee_members || '—'} wide />
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
                <VField label="Status" value={<Pill tone={VER_TONE[view.verification_status]}>{view.verification_status}</Pill>} />
                <VField label="Verified By" value={view.verified_by || '—'} />
                <VField label="Verified On" value={view.verified_on ? fmtStamp(view.verified_on) : '—'} wide />
              </DSection>
              <DSection n="3" icon={Building2} title={tr("Deposit")}>
                <VField label="Status" value={<Pill tone={DEP_TONE[view.deposit_status]}>{view.deposit_status}</Pill>} />
                <VField label="Deposit Date" value={view.deposited_on ? fmtDate(view.deposited_on) : '—'} />
                <VField label="Bank Name" value={view.bank_name || '—'} wide />
                <VField label="Challan / Reference" value={view.bank_ref || '—'} wide />
                <VField label="Attachment" value={view.attachment || '—'} wide />
              </DSection>
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
