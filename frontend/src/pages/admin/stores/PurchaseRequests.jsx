import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, X, CheckCircle2, XCircle, Ban, PackageCheck, ShoppingCart } from 'lucide-react'
import { PageTitle, Pill, fmtDate, fmtStamp, inr } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { Select, NumberField, DateField } from '../../../components/common/Field.jsx'
import { promptDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr } from '../../../i18n/LanguageContext.jsx'
import { canManageStores, canApprovePurchase, staffName } from './shared.jsx'

const TABS = [['Waiting', 'Waiting'], ['Approved', 'Approved – to buy'], ['Received', 'Received'], ['Rejected', 'Rejected'], ['Cancelled', 'Cancelled']]
const TONE = { Waiting: 'amber', Approved: 'blue', Received: 'green', Rejected: 'red', Cancelled: 'gray' }
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const q3 = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }))
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const changed = () => window.dispatchEvent(new Event('stores:changed'))   // sidebar badges

// Purchase Requests: a consumable running low is bought only after the Committee approves.
// "Mark received" adds what was bought to the Consumables balance, with the bill.
export default function PurchaseRequests() {
  const { user } = useAuth()
  const canRaise = canManageStores(user)
  const canDecide = canApprovePurchase(user)
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('Waiting')
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [items, setItems] = useState([])        // consumables with their balance
  const [form, setForm] = useState(null)
  const [receiving, setReceiving] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true); setLoadErr('')
    StoresAPI.purchases({ status: tab }).then((d) => { setRows(d.items || []); setCounts(d.counts || {}) })
      .catch((ex) => { setRows([]); setLoadErr(errText(ex, 'Could not load the purchase requests.')) })
      .finally(() => setLoading(false))
  }, [tab])
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
      message: `${tr(p.item_name)} · ${q3(p.quantity)} ${tr(p.unit || '')}${p.approx_cost != null ? ` · ${tr('approx.')} ${inr(p.approx_cost)}` : ''} — ${p.reason}`,
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
        bill_amount: Number(receiving.bill_amount), expiry_date: receiving.expiry_date || null, note: receiving.note.trim() || null })
      toast(`${r.code}: ${tr('received')} · ${r.manual_code} · ${q3(r.remaining)} ${tr(r.unit || '')} ${tr('in stock now')}`)
      setReceiving(null); setTab('Received'); changed(); load()
    } catch (ex) { toast(errText(ex, 'Could not mark it received.'), 'error') } finally { setSaving(false) }
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              {['PR No', 'Item', 'Balance', 'Asked', 'Approx. cost', 'Reason', 'Raised by', tab === 'Received' ? 'Received' : tab === 'Waiting' ? 'Status' : 'Decision', 'Actions'].map((h) =>
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
                    <td className="px-3 py-3 tabular-nums whitespace-nowrap">{p.approx_cost != null ? inr(p.approx_cost) : '—'}</td>
                    <td className="px-3 py-3 text-[0.8125rem] text-gray-700 max-w-[16rem]">{p.reason}</td>
                    <td className="px-3 py-3 text-[0.8125rem] whitespace-nowrap">{staffName(p.raised_by)}<div className="text-[0.6875rem] text-gray-400">{fmtStamp(p.raised_at)}</div></td>
                    <td className="px-3 py-3 text-[0.8125rem]">
                      {p.status === 'Waiting' && <Pill tone="amber">{tr('Waiting for approval')}</Pill>}
                      {['Approved', 'Rejected'].includes(p.status) && <><Pill tone={TONE[p.status]}>{tr(p.status)}</Pill>
                        <div className="text-[0.6875rem] text-gray-500 mt-0.5">{staffName(p.decided_by)} · {fmtStamp(p.decided_at)}</div>
                        {p.decision_note && <div className="text-[0.75rem] text-gray-600">{p.decision_note}</div>}</>}
                      {p.status === 'Received' && <><b className="tabular-nums">{q3(p.received_qty)} {tr(p.unit || '')}</b>
                        <div className="text-[0.75rem] text-gray-600">{tr('Bill')} {p.bill_no} · {inr(p.bill_amount)}</div>
                        {p.expiry_date && <div className="text-[0.6875rem] text-gray-500">{tr('Best before')} {fmtDate(p.expiry_date)}</div>}
                        <div className="text-[0.6875rem] text-gray-400">{staffName(p.received_by)} · {fmtStamp(p.received_at)}</div></>}
                      {p.status === 'Cancelled' && <><Pill tone="gray">{tr('Cancelled')}</Pill><div className="text-[0.75rem] text-gray-600">{p.cancel_reason}</div></>}
                    </td>
                    <td className="px-3 py-3"><div className="flex gap-1.5 flex-wrap">
                      {p.status === 'Waiting' && canDecide && p.raised_by_user !== user?.username && <>
                        <button onClick={() => approve(p)} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-[0.75rem] font-semibold"><CheckCircle2 size={14} />{tr('Approve')}</button>
                        <button onClick={() => decline(p, 'reject')} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-[0.75rem] font-semibold"><XCircle size={14} />{tr('Reject')}</button></>}
                      {p.status === 'Waiting' && canDecide && p.raised_by_user === user?.username && <span className="text-[0.6875rem] text-gray-500">{tr('Another committee member approves')}</span>}
                      {p.status === 'Approved' && canRaise && <button onClick={() => setReceiving({ p, quantity: String(p.quantity), bill_no: '', bill_amount: '', expiry_date: '', note: '' })}
                        className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-[0.75rem] font-semibold whitespace-nowrap"><PackageCheck size={14} />{tr('Mark received')}</button>}
                      {['Waiting', 'Approved'].includes(p.status) && canRaise && <button onClick={() => decline(p, 'cancel')} title={tr('Cancel request')} aria-label={tr('Cancel request')}
                        className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-red-500 hover:border-red-300"><Ban size={14} /></button>}
                    </div></td>
                  </tr>)
              })}
              {rows.length === 0 && <TableStates colSpan={9} loading={loading} error={loadErr} onRetry={load} empty={tr('No requests here.')} />}
            </tbody>
          </table>
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
              <div><label className="label"><T>Best before</T></label>
                <DateField min={today()} value={receiving.expiry_date} onChange={(e) => setReceiving({ ...receiving, expiry_date: e.target.value })} /></div>
              <div><label className="label"><T>Bill no *</T></label>
                <input required className="input" maxLength={60} value={receiving.bill_no} onChange={(e) => setReceiving({ ...receiving, bill_no: e.target.value })} /></div>
              <div><label className="label"><T>Bill amount *</T></label>
                <NumberField required min="0" max="100000000" step="0.01" prefix="₹" value={receiving.bill_amount} onChange={(e) => setReceiving({ ...receiving, bill_amount: e.target.value })} /></div>
              <div className="col-span-2"><label className="label"><T>Note</T></label>
                <input className="input" maxLength={500} value={receiving.note} onChange={(e) => setReceiving({ ...receiving, note: e.target.value })} placeholder={tr('e.g. Bought at Sri Lakshmi Traders')} /></div>
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
    </div>
  )
}
