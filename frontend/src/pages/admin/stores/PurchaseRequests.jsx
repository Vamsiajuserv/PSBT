import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, X, CheckCircle2, XCircle, Ban, PackageCheck, ShoppingCart, AlertTriangle, FileText, Paperclip, Search, RotateCcw } from 'lucide-react'
import { PageTitle, Pill, Pager, fmtDate, fmtStamp, inr } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { Select, NumberField, DateField } from '../../../components/common/Field.jsx'
import { promptDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, teText } from '../../../i18n/LanguageContext.jsx'
import { canManageStores, canApprovePurchase, staffName } from './shared.jsx'

const TABS = [['Waiting', 'Waiting'], ['Approved', 'Approved – to buy'], ['Review', 'Over budget – review'], ['Received', 'Received'], ['Rejected', 'Rejected'], ['Cancelled', 'Cancelled']]
const SIZE = 25
const NO_FILTER = { q: '', category_id: '', date_from: '', date_to: '', flag: '' }
const OVER_PCT = 10   // a bill more than this % over the approx. cost needs a reason and a Committee review (as the API)
const BILL_MAX = 3 * 1024 * 1024
const overPct = (approx, bill) => (approx > 0 && bill !== '' && bill != null ? Math.round(((Number(bill) - approx) * 1000) / approx) / 10 : null)
const pctText = (p) => `${p > 0 ? '+' : ''}${p}%`
const TONE = { Waiting: 'amber', Approved: 'blue', Received: 'green', Rejected: 'red', Cancelled: 'gray' }
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const q3 = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }))
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const changed = () => window.dispatchEvent(new Event('stores:changed'))   // sidebar badges

// A bill photo is shrunk in the browser (longest side 1600 px, JPEG) so it stays small; a PDF goes as it is.
function readBill(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(tr('The bill file could not be read. Choose the photo again.')))
    reader.onload = () => {
      if (!file.type.startsWith('image/')) {
        if (file.size > BILL_MAX) reject(new Error(tr('The bill file is too large (3 MB at most).')))
        else resolve({ name: file.name, data: reader.result })
        return
      }
      const img = new Image()
      img.onerror = () => reject(new Error(tr('Keep the bill as a photo (JPG, PNG, WEBP) or a PDF.')))
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        const data = c.toDataURL('image/jpeg', 0.8)
        if (data.length * 0.75 > BILL_MAX) reject(new Error(tr('The bill file is too large (3 MB at most).')))
        else resolve({ name: file.name.replace(/\.[^.]+$/, '') + '.jpg', data })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

function BillPicker({ value, onChange, disabled }) {
  const [busy, setBusy] = useState(false)
  async function pick(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    try { onChange(await readBill(f)) } catch (ex) { toast(ex.message, 'error') } finally { setBusy(false) }
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className={`btn-outline !py-2 cursor-pointer ${disabled || busy ? 'opacity-60 pointer-events-none' : ''}`}>
        <Paperclip size={14} />{' '}{busy ? tr('Reading…') : value ? tr('Change photo') : tr('Add bill photo / PDF')}
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={pick} disabled={disabled || busy} />
      </label>
      {value && <span className="text-[0.75rem] text-gray-700 truncate max-w-[12rem]">{value.name}
        <button type="button" onClick={() => onChange(null)} className="ml-1.5 text-red-500 hover:text-red-700" aria-label={tr('Remove')}><X size={12} className="inline" /></button></span>}
    </div>)
}

// Purchase Requests: a consumable running low is bought only after the Committee approves.
// "Mark received" adds what was bought to the Consumables balance, with the bill.
export default function PurchaseRequests() {
  const { user } = useAuth()
  const canRaise = canManageStores(user)
  const canDecide = canApprovePurchase(user)
  const [params, setParams] = useSearchParams()
  const [tab, setTabRaw] = useState('Waiting')
  const [f, setF] = useState(NO_FILTER)
  const [applied, setApplied] = useState(NO_FILTER)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [billTotal, setBillTotal] = useState(0)
  const setTab = (k) => { setTabRaw(k); setPage(1) }
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [items, setItems] = useState([])        // consumables with their balance
  const [form, setForm] = useState(null)
  const [receiving, setReceiving] = useState(null)
  const [saving, setSaving] = useState(false)
  const [billView, setBillView] = useState(null)   // { code, name, type, url }
  const [addBill, setAddBill] = useState(null)     // { p, file }
  useEffect(() => () => { if (billView?.url) URL.revokeObjectURL(billView.url) }, [billView])

  // Saving switches the tab and reloads: only the latest request's answer may fill the table
  const lastLoad = useRef(0)
  const load = useCallback(() => {
    setLoading(true); setLoadErr('')
    const id = ++lastLoad.current
    const current = () => lastLoad.current === id
    const params = Object.fromEntries(Object.entries(applied).filter(([k, v]) => v !== '' && (k !== 'flag' || tab === 'Received')))
    StoresAPI.purchases({ ...params, status: tab, page, size: SIZE })
      .then((d) => { if (current()) { setRows(d.items || []); setCounts(d.counts || {}); setTotal(d.total ?? (d.items || []).length); setBillTotal(d.bill_total || 0) } })
      .catch((ex) => { if (current()) { setRows([]); setTotal(0); setLoadErr(errText(ex, 'Could not load the purchase requests.')) } })
      .finally(() => { if (current()) setLoading(false) })
  }, [tab, applied, page])
  const apply = (z) => { setF(z); setPage(1); setApplied(z) }
  const filtered = Object.entries(applied).some(([k, v]) => v !== '' && (k !== 'flag' || tab === 'Received'))
  const byReceipt = ['Received', 'Review'].includes(tab)
  useEffect(() => { load() }, [load])
  useEffect(() => { StoresAPI.consumables().then((d) => setItems(d.items || [])).catch(() => setItems([])) }, [])

  const newForm = (cid = '') => ({ category_id: String(cid), quantity: '', approx_cost: '', reason: '' })
  // "Raise request" from Consumables Stock opens the form for that item
  useEffect(() => {
    const cid = params.get('new')
    if (cid && canRaise) { setForm(newForm(cid)); params.delete('new'); setParams(params, { replace: true }) }
  }, [params, setParams, canRaise])

  const item = items.find((i) => String(i.category_id) === String(form?.category_id))
  async function raise(e) {
    e.preventDefault()
    if (form.reason.trim().length < 5) { toast(tr('Enter the reason (at least 5 characters).'), 'error'); return }
    setSaving(true)
    try {
      const p = await StoresAPI.raisePurchase({ category_id: Number(form.category_id), quantity: Number(form.quantity),
        approx_cost: form.approx_cost === '' ? null : Number(form.approx_cost), reason: form.reason.trim() })
      toast(`${p.code} ${tr('sent to the committee for approval.')}`)
      setForm(null); setTab('Waiting'); changed(); load()
    } catch (ex) { toast(errText(ex, 'Could not raise the request.'), 'error') } finally { setSaving(false) }
  }
  async function approve(p) {
    const res = await promptDialog({ title: `${tr('Approve')} ${p.code}`, confirmLabel: tr('Approve'),
      message: `${tr(p.item_name)} · ${q3(p.quantity)} ${tr(p.unit || '')}${p.approx_cost != null ? ` · ${tr('approx.')} ${inr(p.approx_cost)}` : ''} — ${teText(p.reason)}`,
      fields: [{ k: 'note', label: tr('Note (optional)') }] })
    if (!res) return
    try { await StoresAPI.approvePurchase(p.id, (res.note || '').trim() || null); toast(tr('Approved.')); changed(); load() }
    catch (ex) { toast(errText(ex, 'Could not approve.'), 'error') }
  }
  async function decline(p, kind) {
    const reject = kind === 'reject'
    const res = await promptDialog({ title: `${tr(reject ? 'Reject' : 'Cancel request')} ${p.code}`, tone: 'danger',
      confirmLabel: tr(reject ? 'Reject' : 'Cancel request'), fields: [{ k: 'reason', label: tr('Reason'), required: true }] })
    if (!res) return
    try {
      await (reject ? StoresAPI.rejectPurchase(p.id, res.reason.trim()) : StoresAPI.cancelPurchase(p.id, res.reason.trim()))
      toast(tr(reject ? 'Rejected.' : 'Cancelled.')); changed(); load()
    } catch (ex) { toast(errText(ex, reject ? 'Could not reject.' : 'Could not cancel.'), 'error') }
  }
  async function receive(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await StoresAPI.receivePurchase(receiving.p.id, { quantity: Number(receiving.quantity), bill_no: receiving.bill_no.trim(),
        bill_amount: Number(receiving.bill_amount), expiry_date: receiving.expiry_date || null, note: receiving.note.trim() || null,
        over_reason: receivingOver ? receiving.over_reason.trim() : null, bill_file: receiving.file || null })
      toast(`${r.code}: ${tr('received')} · ${r.manual_code} · ${q3(r.remaining)} ${tr(r.unit || '')} ${tr('in stock now')}`
        + (r.review_status === 'Pending' ? ` · ${tr('sent to the committee to review the bill')}` : ''))
      setReceiving(null); setTab(r.review_status === 'Pending' ? 'Review' : 'Received'); changed(); load()
    } catch (ex) { toast(errText(ex, 'Could not mark it received.'), 'error') } finally { setSaving(false) }
  }

  const receivingPct = receiving ? overPct(receiving.p.approx_cost, receiving.bill_amount) : null
  const receivingOver = receivingPct != null && receivingPct > OVER_PCT

  async function reviewBill(p) {
    const res = await promptDialog({ title: `${tr('Review bill')} ${p.code}`, confirmLabel: tr('Accept bill'),
      message: `${tr(p.item_name)} · ${tr('approx.')} ${inr(p.approx_cost)} → ${tr('bill')} ${inr(p.bill_amount)} (${pctText(p.over_pct)}) — ${tr('Reason')}: ${p.over_reason || '—'}`,
      fields: [{ k: 'note', label: tr('Note (optional)') }] })
    if (!res) return
    try { await StoresAPI.reviewPurchase(p.id, (res.note || '').trim() || null); toast(tr('Bill reviewed.')); changed(); load() }
    catch (ex) { toast(errText(ex, 'Could not review the bill.'), 'error') }
  }
  async function viewBill(p) {
    try {
      const b = await StoresAPI.purchaseBill(p.id)
      const bytes = Uint8Array.from(atob(b.data), (ch) => ch.charCodeAt(0))
      setBillView({ code: p.code, name: b.name, type: b.type, url: URL.createObjectURL(new Blob([bytes], { type: b.type })) })
    } catch (ex) { toast(errText(ex, 'Could not open the bill.'), 'error') }
  }
  async function saveBill(e) {
    e.preventDefault()
    if (!addBill.file) { toast(tr('Choose the bill photo or PDF.'), 'error'); return }
    setSaving(true)
    try { await StoresAPI.addPurchaseBill(addBill.p.id, addBill.file); toast(tr('Bill kept.')); setAddBill(null); load() }
    catch (ex) { toast(errText(ex, 'Could not keep the bill.'), 'error') } finally { setSaving(false) }
  }

  const tabBtn = ([k, label]) => (
    <button key={k} onClick={() => setTab(k)} className={`px-3.5 py-2 rounded-lg text-[0.8125rem] font-semibold whitespace-nowrap ${tab === k ? 'bg-maroon-700 text-cream' : 'text-gray-600 hover:bg-gray-100'}`}>
      {tr(label)}{counts[k] ? ` (${counts[k]})` : ''}</button>)

  return (
    <div>
      <PageTitle title={tr('Purchase Requests')} subtitle={tr('Consumables running low are bought only after the committee approves. What is bought is added to Consumables Stock with the bill.')}
        actions={canRaise && <button onClick={() => setForm(newForm())} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>New request</T></button>} />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap gap-1 border-b border-gray-100">{TABS.map(tabBtn)}</div>
        <form onSubmit={(e) => { e.preventDefault(); apply(f) }} className="px-5 py-4 flex flex-wrap items-end gap-3 border-b border-gray-100">
          <div className="flex-1 min-w-[12rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search PR no, bill no or item</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input !pl-9" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder={tr('PR-0006, bill no, ghee, shop…')} /></div></div>
          <div className="w-[10rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Item</T></label>
            <Select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">{tr('All')}</option>
              {items.map((i) => <option key={i.category_id} value={i.category_id}>{tr(i.name)}</option>)}</Select></div>
          <div className="w-[9.5rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5">{tr(byReceipt ? 'Received from' : 'Raised from')}</label>
            <DateField value={f.date_from} max={f.date_to || undefined} onChange={(e) => setF({ ...f, date_from: e.target.value })} className="input" /></div>
          <div className="w-[9.5rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
            <DateField value={f.date_to} min={f.date_from || undefined} onChange={(e) => setF({ ...f, date_to: e.target.value })} className="input" /></div>
          {tab === 'Received' && <div className="w-[10rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Show</T></label>
            <Select className="input" value={f.flag} onChange={(e) => setF({ ...f, flag: e.target.value })}><option value="">{tr('All')}</option>
              <option value="over">{tr('Over budget')}</option><option value="nobill">{tr('No bill photo')}</option></Select></div>}
          <button className="btn-maroon !py-2.5 shrink-0"><Search size={14} />{' '}<T>Apply</T></button>
          <button type="button" onClick={() => apply(NO_FILTER)} className="btn-outline !py-2.5 shrink-0"><RotateCcw size={14} />{' '}<T>Clear</T></button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              {['PR No', 'Item', 'Balance', 'Asked', ['Received', 'Review'].includes(tab) ? 'Approx. → Bill' : 'Approx. cost', 'Reason', 'Raised by', ['Received', 'Review'].includes(tab) ? 'Received' : tab === 'Waiting' ? 'Status' : 'Decision', 'Actions'].map((h) =>
                <th key={h} className="px-3 py-3 font-semibold whitespace-nowrap">{tr(h)}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((p) => {
                const low = p.balance_now != null && p.low_level != null && p.balance_now <= p.low_level
                return (
                  <tr key={p.id} className="hover:bg-gray-50/60 align-top">
                    <td className="px-3 py-3 font-mono text-[0.78rem] font-semibold text-maroon-700 whitespace-nowrap">{p.code}</td>
                    <td className="px-3 py-3 font-semibold text-gray-800">{tr(p.item_name)}</td>
                    <td className="px-3 py-3 tabular-nums whitespace-nowrap">
                      {p.balance_now != null ? <span className={low ? 'text-red-700 font-semibold' : ''}>{q3(p.balance_now)} {tr(p.unit || '')}{low && ' ⚠'}</span> : `${q3(p.balance_at)} ${tr(p.unit || '')}`}
                      {p.low_level != null && <div className="text-[0.6875rem] text-gray-500">{tr('Low level')} {q3(p.low_level)}</div>}</td>
                    <td className="px-3 py-3 tabular-nums whitespace-nowrap font-semibold">{q3(p.quantity)} {tr(p.unit || '')}</td>
                    <td className="px-3 py-3 tabular-nums whitespace-nowrap">{p.approx_cost != null ? inr(p.approx_cost) : '—'}
                      {p.status === 'Received' && <>
                        <div className={`font-semibold ${p.over_budget ? 'text-red-700' : 'text-gray-800'}`}>→ {inr(p.bill_amount)}</div>
                        {p.over_pct != null && <div className={`text-[0.6875rem] font-semibold ${p.over_budget ? 'text-red-700' : p.over_pct > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {pctText(p.over_pct)}{p.over_budget && ' ⚠'}</div>}</>}</td>
                    <td className="px-3 py-3 text-[0.8125rem] text-gray-700 max-w-[16rem]">{teText(p.reason)}</td>
                    <td className="px-3 py-3 text-[0.8125rem] whitespace-nowrap">{staffName(p.raised_by)}<div className="text-[0.6875rem] text-gray-400">{fmtStamp(p.raised_at)}</div></td>
                    <td className="px-3 py-3 text-[0.8125rem]">
                      {p.status === 'Waiting' && <Pill tone="amber">{tr('Waiting for approval')}</Pill>}
                      {['Approved', 'Rejected'].includes(p.status) && <><Pill tone={TONE[p.status]}>{tr(p.status)}</Pill>
                        <div className="text-[0.6875rem] text-gray-500 mt-0.5">{staffName(p.decided_by)} · {fmtStamp(p.decided_at)}</div>
                        {p.decision_note && <div className="text-[0.75rem] text-gray-600">{p.decision_note}</div>}</>}
                      {p.status === 'Received' && <><b className="tabular-nums">{q3(p.received_qty)} {tr(p.unit || '')}</b>
                        <div className="text-[0.75rem] text-gray-600">{tr('Bill')} {p.bill_no} · {inr(p.bill_amount)}</div>
                        {p.bill_file ? <button onClick={() => viewBill(p)} className="text-[0.75rem] text-maroon-700 hover:underline inline-flex items-center gap-1"><FileText size={12} />{tr('View bill')}</button>
                          : <div className="text-[0.6875rem] text-amber-700">{tr('No bill photo')}</div>}
                        {p.over_budget && <div className="mt-1">
                          <Pill tone={p.review_status === 'Reviewed' ? 'green' : 'red'}>{tr(p.review_status === 'Reviewed' ? 'Over budget – reviewed' : 'Over budget – committee review')}</Pill>
                          <div className="text-[0.75rem] text-gray-700 mt-0.5">{tr('Reason')}: {p.over_reason}</div>
                          {p.review_status === 'Reviewed' && <div className="text-[0.6875rem] text-gray-500">{staffName(p.reviewed_by)} · {fmtStamp(p.reviewed_at)}{p.review_note ? ` — ${p.review_note}` : ''}</div>}</div>}
                        {p.expiry_date && <div className="text-[0.6875rem] text-gray-500">{tr('Expiry date')} {fmtDate(p.expiry_date)}</div>}
                        <div className="text-[0.6875rem] text-gray-400">{staffName(p.received_by)} · {fmtStamp(p.received_at)}</div></>}
                      {p.status === 'Cancelled' && <><Pill tone="gray">{tr('Cancelled')}</Pill><div className="text-[0.75rem] text-gray-600">{p.cancel_reason}</div></>}
                    </td>
                    <td className="px-3 py-3"><div className="flex gap-1.5 flex-wrap">
                      {p.status === 'Waiting' && canDecide && p.raised_by_user !== user?.username && <>
                        <button onClick={() => approve(p)} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-[0.75rem] font-semibold"><CheckCircle2 size={14} />{tr('Approve')}</button>
                        <button onClick={() => decline(p, 'reject')} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-[0.75rem] font-semibold"><XCircle size={14} />{tr('Reject')}</button></>}
                      {p.status === 'Waiting' && canDecide && p.raised_by_user === user?.username && <span className="text-[0.6875rem] text-gray-500">{tr('Another committee member approves')}</span>}
                      {p.status === 'Approved' && canRaise && <button onClick={() => setReceiving({ p, quantity: String(p.quantity), bill_no: '', bill_amount: '', expiry_date: '', note: '', over_reason: '', file: null })}
                        className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-[0.75rem] font-semibold whitespace-nowrap"><PackageCheck size={14} />{tr('Mark received')}</button>}
                      {p.review_status === 'Pending' && canDecide && p.received_by_user !== user?.username &&
                        <button onClick={() => reviewBill(p)} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-[0.75rem] font-semibold whitespace-nowrap"><AlertTriangle size={14} />{tr('Review bill')}</button>}
                      {p.review_status === 'Pending' && canDecide && p.received_by_user === user?.username && <span className="text-[0.6875rem] text-gray-500">{tr('Another committee member reviews')}</span>}
                      {p.status === 'Received' && !p.bill_file && canRaise && <button onClick={() => setAddBill({ p, file: null })}
                        className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-gray-200 text-gray-700 hover:border-maroon-300 text-[0.75rem] font-semibold whitespace-nowrap"><Paperclip size={14} />{tr('Add bill')}</button>}
                      {['Waiting', 'Approved'].includes(p.status) && canRaise && <button onClick={() => decline(p, 'cancel')} title={tr('Cancel request')} aria-label={tr('Cancel request')}
                        className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-red-500 hover:border-red-300"><Ban size={14} /></button>}
                    </div></td>
                  </tr>)
              })}
              {rows.length === 0 && <TableStates colSpan={9} loading={loading} error={loadErr} onRetry={load}
                empty={filtered ? tr('No requests match these filters.') : tr('No requests here.')} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit={tr('requests')} />
          {byReceipt && total > 0 && <span className="text-[0.8125rem] text-gray-700">{tr('Total bills')}: <b className="tabular-nums">{inr(billTotal)}</b></span>}
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !saving && setForm(null)} />
          <form onSubmit={raise} className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
              <h3 className="font-serif text-lg font-bold text-maroon-800"><ShoppingCart size={17} className="inline mr-1.5 -mt-0.5" /><T>New purchase request</T></h3>
              <button type="button" onClick={() => setForm(null)} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={18} /></button>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label"><T>Item *</T></label>
                <Select required className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">{tr('Select')}</option>
                  {items.map((i) => <option key={i.category_id} value={i.category_id}>{tr(i.name)}{i.low ? ` — ${tr('Low')}` : ''}</option>)}
                </Select>
                {item && <div className={`text-[0.75rem] mt-1 ${item.low ? 'text-red-700' : 'text-gray-500'}`}>{tr('Balance')} {q3(item.remaining)} {tr(item.unit || '')}
                  {item.low_stock_level != null && ` · ${tr('low level')} ${q3(item.low_stock_level)}`}{item.low && ' ⚠'}</div>}</div>
              <div><label className="label">{tr('Quantity *')}{item?.unit ? ` (${tr(item.unit)})` : ''}</label>
                <NumberField required min="0.001" max="1000000" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
              <div><label className="label"><T>Approx. cost</T></label>
                <NumberField min="0" max="100000000" step="1" allowDecimal={false} prefix="₹" value={form.approx_cost} onChange={(e) => setForm({ ...form, approx_cost: e.target.value })} /></div>
              <div className="col-span-2"><label className="label"><T>Reason *</T></label>
                <input required className="input" maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={tr('e.g. Karthika deepam month')} /></div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" disabled={saving} onClick={() => setForm(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60">{saving ? tr('Saving…') : tr('Send for approval')}</button>
            </div>
          </form>
        </div>
      )}

      {receiving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !saving && setReceiving(null)} />
          <form onSubmit={receive} className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Mark received</T> — {receiving.p.code}</h3>
              <div className="text-[0.75rem] text-gray-500">{tr(receiving.p.item_name)} · {tr('approved')} {q3(receiving.p.quantity)} {tr(receiving.p.unit || '')} · {staffName(receiving.p.decided_by)}</div>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-3">
              <div><label className="label">{tr('Quantity received *')}{receiving.p.unit ? ` (${tr(receiving.p.unit)})` : ''}</label>
                <NumberField required min="0.001" max="1000000" step="0.001" value={receiving.quantity} onChange={(e) => setReceiving({ ...receiving, quantity: e.target.value })} /></div>
              <div><label className="label"><T>Expiry date</T></label>
                <DateField min={today()} value={receiving.expiry_date} onChange={(e) => setReceiving({ ...receiving, expiry_date: e.target.value })} /></div>
              <div><label className="label"><T>Bill no *</T></label>
                <input required className="input" maxLength={60} value={receiving.bill_no} onChange={(e) => setReceiving({ ...receiving, bill_no: e.target.value })} /></div>
              <div><label className="label"><T>Bill amount *</T></label>
                <NumberField required min="0" max="100000000" step="0.01" prefix="₹" value={receiving.bill_amount} onChange={(e) => setReceiving({ ...receiving, bill_amount: e.target.value })} /></div>
              <div className="col-span-2"><label className="label"><T>Note</T></label>
                <input className="input" maxLength={500} value={receiving.note} onChange={(e) => setReceiving({ ...receiving, note: e.target.value })} placeholder={tr('e.g. Bought at Sri Lakshmi Traders')} /></div>
              {receiving.p.approx_cost != null && receiving.bill_amount !== '' && (receivingOver ? (
                <div className="col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <div className="text-[0.8125rem] font-semibold text-red-700"><AlertTriangle size={14} className="inline mr-1 -mt-0.5" />
                    {tr('Bill is')} {pctText(receivingPct)} {tr('over the approved approx. cost')} ({inr(receiving.p.approx_cost)}).</div>
                  <div className="text-[0.75rem] text-red-700 mb-2">{tr('Enter why — the committee will review this bill.')}</div>
                  <input required minLength={5} className="input" maxLength={500} value={receiving.over_reason} onChange={(e) => setReceiving({ ...receiving, over_reason: e.target.value })}
                    placeholder={tr('e.g. Ghee price went up this week')} aria-label={tr('Reason for the higher bill')} />
                </div>) : (
                <div className="col-span-2 text-[0.75rem] text-gray-600">{tr('Approx. cost')} {inr(receiving.p.approx_cost)} → {tr('bill')} {inr(receiving.bill_amount)}
                  {receivingPct != null && <span className={receivingPct > 0 ? 'text-amber-700' : 'text-emerald-700'}> ({pctText(receivingPct)})</span>}</div>))}
              <div className="col-span-2"><label className="label"><T>Bill photo</T></label>
                <BillPicker value={receiving.file} disabled={saving} onChange={(file) => setReceiving({ ...receiving, file })} /></div>
              {Number(receiving.quantity) > 0 && Number(receiving.quantity) !== receiving.p.quantity && (
                <div className="col-span-2 text-[0.75rem] text-amber-800 bg-amber-50 rounded-lg px-3 py-2">{tr('Different from the approved quantity')} ({q3(receiving.p.quantity)}). {tr('Write why in the note.')}</div>)}
              <div className="col-span-2 text-[0.75rem] text-gray-500">{tr('This adds the quantity to Consumables Stock as a Temple purchase. Payment is handled outside this screen.')}</div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" disabled={saving} onClick={() => setReceiving(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60"><PackageCheck size={15} className="mr-1" />{saving ? tr('Saving…') : tr('Add to stock')}</button>
            </div>
          </form>
        </div>
      )}

      {addBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !saving && setAddBill(null)} />
          <form onSubmit={saveBill} className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Add bill</T> — {addBill.p.code}</h3>
              <div className="text-[0.75rem] text-gray-500">{tr('Bill')} {addBill.p.bill_no} · {inr(addBill.p.bill_amount)}</div>
            </div>
            <div className="px-5 py-4 space-y-2">
              <BillPicker value={addBill.file} disabled={saving} onChange={(file) => setAddBill({ ...addBill, file })} />
              <div className="text-[0.75rem] text-gray-500">{tr('Once kept, the bill cannot be replaced.')}</div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" disabled={saving} onClick={() => setAddBill(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button disabled={saving || !addBill.file} className="btn-maroon flex-1 justify-center disabled:opacity-60">{saving ? tr('Saving…') : tr('Keep bill')}</button>
            </div>
          </form>
        </div>
      )}

      {billView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setBillView(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
              <h3 className="font-serif text-lg font-bold text-maroon-800 truncate">{tr('Bill')} — {billView.code} <span className="text-[0.75rem] font-sans font-normal text-gray-500">{billView.name}</span></h3>
              <div className="flex items-center gap-3 shrink-0">
                <a href={billView.url} download={billView.name} className="text-[0.8125rem] text-maroon-700 hover:underline">{tr('Download')}</a>
                <button onClick={() => setBillView(null)} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={18} /></button>
              </div>
            </div>
            <div className="p-3 overflow-auto flex-1 bg-gray-50">
              {billView.type === 'application/pdf'
                ? <iframe title={billView.name} src={billView.url} className="w-full h-[75vh] rounded" />
                : <img src={billView.url} alt={billView.name} className="max-w-full mx-auto rounded" />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
