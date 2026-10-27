import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Search, ArrowLeft, Pencil, Save } from 'lucide-react'
import { PageTitle, Pill, inr, num, fmtDate, fmtStamp } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { T, tr, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { NumberField } from '../../../components/common/Field.jsx'
import { toast } from '../../../components/common/Dialog.jsx'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { STATUS_TONE, staffName, storeDetail, canManageStores } from './shared.jsx'

export default function ItemHistory() {
  const { tag } = useParams()
  const navigate = useNavigate()
  const [q, setQ] = useState(tag || '')
  const [item, setItem] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const [fixing, setFixing] = useState(null)   // the correction form

  useEffect(() => {
    setQ(tag || ''); setItem(null); setErr('')
    if (!tag) return
    setLoading(true)
    StoresAPI.item(tag).then(setItem).catch((ex) => setErr(tr(getErrorMessage(ex, 'Not found.')))).finally(() => setLoading(false))
  }, [tag])

  const go = (e) => { e.preventDefault(); const v = q.trim().toUpperCase(); if (v) navigate(`/admin/stores/item/${v}`) }
  const Row = ({ label, value }) => <div><div className="text-[0.6875rem] text-gray-400">{label}</div><div className="text-[0.8125rem] font-medium text-gray-800 break-words">{value ?? '—'}</div></div>

  return (
    <div>
      <PageTitle title={tr('Item History')} subtitle={tr('Type or scan the ID on a sticker to see the full life of that piece.')}
        actions={<button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/admin/stores/register'))} className="btn-outline !py-2.5"><ArrowLeft size={16} />{' '}<T>Back</T></button>} />
      <form onSubmit={go} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-wrap gap-3 items-end mb-5">
        <div className="flex-1 min-w-[14rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Item ID</T></label>
          <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus className="input !pl-9 font-mono uppercase" value={q} onChange={(e) => setQ(e.target.value)} placeholder="PAN-00003" /></div></div>
        <button className="btn-maroon !py-2.5"><Search size={14} />{' '}<T>Show history</T></button>
      </form>
      {loading && <div className="text-sm text-gray-500"><T>Loading...</T></div>}
      {err && <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{err}</div>}
      {item && (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div><div className="font-mono text-xl font-bold text-maroon-800">{item.tag_id}</div>
                <div className="font-semibold text-gray-800">{tr(item.description || item.item_name)}</div></div>
              <div className="flex flex-col items-end gap-2">
                <Pill tone={STATUS_TONE[item.status] || 'gray'}>{tr(item.status)}</Pill>
                {canManageStores(user) && !['Sold', 'Written Off'].includes(item.status) && (
                  <button onClick={() => setFixing({ description: item.description || '', details: item.details || '', weight_g: item.weight_g ?? '',
                    purity: item.purity || '', est_value: item.est_value ?? '', reason: '' })}
                    className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-[0.75rem] font-semibold"><Pencil size={13} />{tr('Correct details')}</button>)}
              </div>
            </div>
            {item.receipt_value != null && item.est_value != null && Math.abs(item.est_value - item.receipt_value) >= 1 && (
              <div className="text-[0.75rem] rounded-lg px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800">
                ⚠ {tr('Value')} {inr(item.est_value)} — {tr('receipt value')} {inr(item.receipt_value)}{item.rate_per_g != null
                  ? ` (${num(item.weight_g)} ${gramUnit()} × ₹${num(item.rate_per_g)} × ${item.purity})` : ` (${tr('value stated by the devotee')})`}</div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Row label={tr('Item type')} value={tr(item.item_name)} />
              <Row label={tr('Size / colour')} value={tr(item.details)} />
              {item.weight_g != null && <Row label={tr('Weight')} value={`${num(item.weight_g)} ${gramUnit()}`} />}
              {item.purity && <Row label={tr('Purity')} value={item.purity} />}
              <Row label={tr('Donor')} value={staffName(item.donor_name)} />
              <Row label={tr('Donor mobile')} value={item.donor_mobile} />
              <Row label={tr('Source')} value={`${tr(item.source_type)} · ${item.source_ref}`} />
              <Row label={tr('Received')} value={fmtDate(item.received_on)} />
              <Row label={tr('Location')} value={['In Store', 'In Open Sale'].includes(item.status) ? tr(item.location || '—') : item.status === 'Awaiting Placement' ? tr('Not placed yet')
                : ['Issued', 'Missing'].includes(item.status) ? `${tr(item.status)} — ${tr('last at')} ${tr(item.location || '—')}` : '—'} />
              <Row label={tr('Estimated value')} value={item.est_value != null ? inr(item.est_value) : '—'} />
              {item.sold_amount != null && <Row label={tr('Sold for')} value={inr(item.sold_amount)} />}
              {item.last_auction_code && <Row label={tr('Last auction')} value={item.last_auction_code} />}
              {item.unsold_count > 0 && <Row label={tr('Times unsold')} value={item.unsold_count} />}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-serif text-lg font-bold text-maroon-800 mb-3"><T>History</T></h3>
            <ol className="space-y-3">
              {item.store_receipt && (() => {
                const r = item.store_receipt
                const u = r.mode === 'weight' ? ` ${gramUnit()}` : ''
                return (
                  <li className="border-l-2 border-teal-500 pl-3">
                    <div className="text-[0.8125rem]"><b className="text-gray-800">{tr('Received at store')}</b>
                      <span className="text-gray-700"> — {r.receipt_no}{r.item_name ? ` · ${tr(r.item_name)}` : ''} · {r.mode === 'value'
                        ? (r.received > 0 ? tr('Received') : tr('Not received'))
                        : `${tr('received')} ${num(r.received)}${u} / ${tr(r.kind === 'Hundi' ? 'counted' : 'billed')} ${num(r.billed)}${u}`}{r.short_code ? ` · ${r.short_code}` : ''}</span></div>
                    <div className="text-[0.6875rem] text-gray-500">{fmtStamp(r.received_at)} · {staffName(r.received_by)}</div>
                  </li>)
              })()}
              {item.history.map((h, i) => (
                <li key={i} className="border-l-2 border-gold-400 pl-3">
                  <div className="text-[0.8125rem]"><b className="text-gray-800">{tr(h.action)}</b>{h.detail && <span className="text-gray-700"> — {h.action === 'Written off' && !/^Lost — /.test(h.detail) ? tr(h.detail) : storeDetail(h.detail)}</span>}</div>
                  <div className="text-[0.6875rem] text-gray-500">{fmtStamp(h.at)} · {staffName(h.by)}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      {fixing && item && <CorrectDialog item={item} form={fixing} setForm={setFixing} onDone={(d) => { setItem(d); setFixing(null) }} />}
    </div>
  )
}

// Correct a piece's details: the change and its reason go into the piece's history.
function CorrectDialog({ item, form, setForm, onDone }) {
  const [saving, setSaving] = useState(false)
  const set = (patch) => setForm({ ...form, ...patch })
  const weight = item.weight_g != null
  // gold / silver: the value the receipt gives this weight (grams × rate used × purity factor)
  const suggested = item.receipt_value == null ? null
    : item.weight_g ? Math.round(item.receipt_value * (Number(form.weight_g) || 0) / Number(item.weight_g)) : item.receipt_value
  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const d = await StoresAPI.correctItem(item.id, {
        description: form.description, details: form.details, purity: form.purity,
        weight_g: weight ? Number(form.weight_g) : null, est_value: form.est_value !== '' ? Number(form.est_value) : null,
        reason: form.reason.trim(),
      })
      toast(`${item.tag_id}: ${tr('details corrected.')}`); onDone(d)
    } catch (ex) { toast(tr(getErrorMessage(ex, 'Could not save the correction.')).replace(/^Value error, /, ''), 'error') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => setForm(null)} />
      <form onSubmit={submit} className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-serif text-lg font-bold text-maroon-800">{tr('Correct details')} — <span className="font-mono">{item.tag_id}</span></h3>
          <div className="text-[0.75rem] text-gray-500">{tr('The change and the reason are kept in the piece\'s history.')}</div></div>
        <div className="px-5 py-4 space-y-3">
          <div><label className="label"><T>Description</T></label><input className="input" maxLength={200} value={form.description} onChange={(e) => set({ description: e.target.value })} /></div>
          {!weight && <div><label className="label"><T>Size / colour</T></label><input className="input" maxLength={120} value={form.details} onChange={(e) => set({ details: e.target.value })} /></div>}
          {weight && <div className="grid grid-cols-2 gap-3">
            <div><label className="label"><T>Weight g *</T></label><NumberField required min="0.001" step="0.001" value={form.weight_g} onChange={(e) => set({ weight_g: e.target.value })} /></div>
            <div><label className="label"><T>Purity</T></label><input className="input" maxLength={20} value={form.purity} onChange={(e) => set({ purity: e.target.value })} /></div>
          </div>}
          <div><label className="label"><T>Value ₹</T></label><NumberField min="0" step="1" prefix="₹" value={form.est_value} onChange={(e) => set({ est_value: e.target.value })} />
            {suggested != null && <div className="text-[0.75rem] text-gray-500 mt-1">{tr('Receipt value')}: <b>{inr(suggested)}</b>{' '}
              {Number(form.est_value) !== suggested && <button type="button" onClick={() => set({ est_value: String(suggested) })} className="text-maroon-700 font-semibold hover:underline">{tr('Use receipt value')}</button>}</div>}</div>
          <div><label className="label"><T>Reason *</T></label><input required minLength={5} maxLength={300} className="input" value={form.reason} onChange={(e) => set({ reason: e.target.value })} placeholder={tr('e.g. Value typed wrong at tagging')} /></div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={() => setForm(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
          <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60"><Save size={15} className="mr-1" />{saving ? tr('Saving…') : tr('Save correction')}</button>
        </div>
      </form>
    </div>
  )
}
