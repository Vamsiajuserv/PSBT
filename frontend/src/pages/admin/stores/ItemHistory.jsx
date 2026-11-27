import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Search, ArrowLeft, Pencil, Save } from 'lucide-react'
import { PageTitle, Pill, inr, num, fmtDate, fmtStamp } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { T, tr, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { NumberField } from '../../../components/common/Field.jsx'
import { toast } from '../../../components/common/Dialog.jsx'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { STATUS_TONE, staffName, storeDetail, canManageStores, sourceRef, DeityBadge, BundleBadge } from './shared.jsx'
import { canAccessKey } from '../../../auth/access.js'

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

  // One piece by its ID. A donation / receipt / hundi / manual-entry number can cover many
  // pieces, so it opens the Stock Register filtered to them instead.
  const go = (e) => {
    e.preventDefault()
    const v = q.trim().toUpperCase()
    if (!v) return
    navigate(/^(DON|RCPT|HUN|MSE)-/.test(v) ? `/admin/stores/register?q=${encodeURIComponent(v)}` : `/admin/stores/item/${v}`)
  }
  const Row = ({ label, value }) => <div><div className="text-[0.6875rem] text-gray-400">{label}</div><div className="text-[0.8125rem] font-medium text-gray-800 break-words">{value ?? '—'}</div></div>

  return (
    <div>
      <PageTitle title={tr('Item Tracker')} subtitle={tr('Type or scan the ID on a sticker to see the full life of that piece.')}
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
              <div><div className="font-mono text-xl font-bold text-maroon-800 flex items-center gap-2">{item.tag_id} <BundleBadge item={item} /></div>
                <div className="font-semibold text-gray-800">{tr(item.description || item.item_name)}</div></div>
              <div className="flex flex-col items-end gap-2">
                <Pill tone={STATUS_TONE[item.status] || 'gray'}>{tr(item.status)}</Pill>
                <DeityBadge item={item} />
                {item.pending_change && <div className="max-w-[16rem] text-right text-[0.6875rem] text-amber-800 bg-amber-50 rounded px-2 py-1">{tr('Waiting for the committee')}: {tr(item.pending_change)}</div>}
                {canManageStores(user) && !['Sold', 'Written Off'].includes(item.status) && (
                  <button onClick={() => setFixing({ description: item.description || '', details: item.details || '', weight_g: item.weight_g ?? '',
                    reason: '', deity_used: !!item.deity_used, occasion: '' })}
                    className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-[0.75rem] font-semibold"><Pencil size={13} />{tr('Correct details')}</button>)}
              </div>
            </div>
            {item.receipt_value != null && item.est_value != null && Math.abs(item.est_value - item.receipt_value) >= 1 && (
              <div className="text-[0.75rem] rounded-lg px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800">
                ⚠ {tr('Value')} {inr(item.est_value)} — {tr('receipt value')} {inr(item.receipt_value)}{item.rate_per_g == null ? ` (${tr('value stated by the devotee')})` : ''}</div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Row label={tr('Item type')} value={tr(item.item_name)} />
              <Row label={tr('Size / colour')} value={tr(item.details)} />
              {item.weight_g != null && <Row label={tr('Weight')} value={`${num(item.weight_g)} ${gramUnit()}`} />}
              <Row label={tr('Donor')} value={staffName(item.donor_name)} />
              <Row label={tr('Donor mobile')} value={item.donor_mobile} />
              <Row label={tr('Source')} value={<SourceLink item={item} user={user} />} />
              <Row label={tr('Received')} value={fmtDate(item.received_on)} />
              <Row label={tr('Location')} value={['In Store', 'In Open Sale'].includes(item.status) ? tr(item.location || '—') : item.status === 'Awaiting Placement' ? tr('Not placed yet')
                : ['Issued', 'Missing'].includes(item.status) ? `${tr(item.status)} — ${tr('last at')} ${tr(item.location || '—')}` : '—'} />
              <Row label={tr('Estimated value')} value={item.est_value != null ? inr(item.est_value) : '—'} />
              {item.sold_amount != null && <Row label={tr('Sold for')} value={inr(item.sold_amount)} />}
              {item.last_auction_code && <Row label={tr('Last auction')} value={item.last_auction_code} />}
              {item.unsold_count > 0 && <Row label={tr('Times unsold')} value={item.unsold_count} />}
              {item.deity_used && <Row label={tr('Deity-Used')} value={item.deity_used_note || tr('Yes')} />}
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
      {fixing && item && <CorrectDialog item={item} form={fixing} setForm={setFixing}
        onDone={() => { setFixing(null); StoresAPI.item(item.tag_id).then(setItem).catch(() => {}) }} />}
    </div>
  )
}

// Correct a piece's details: the change and its reason go into the piece's history.
function CorrectDialog({ item, form, setForm, onDone }) {
  const [saving, setSaving] = useState(false)
  const set = (patch) => setForm({ ...form, ...patch })
  const weight = item.weight_g != null
  // "Used by the deity" lives here now (2026-11-27) — the mark is set by itself when a piece comes back from
  // an Alankaram / Festival issue; this is for older pieces or a mistake
  const same = (a, b) => String(a ?? '') === String(b ?? '')
  const detailsChanged = !same(form.description, item.description) || !same(form.details, item.details)
    || (weight && Number(form.weight_g) !== Number(item.weight_g))
  const deityChanged = !!form.deity_used !== !!item.deity_used
  async function submit(e) {
    e.preventDefault()
    if (!detailsChanged && !deityChanged) { toast(tr('Nothing was changed.'), 'error'); return }
    setSaving(true)
    try {
      let d = null
      if (detailsChanged) {
        d = await StoresAPI.correctItem(item.id, {
          description: form.description, details: form.details,
          weight_g: weight ? Number(form.weight_g) : null,      // the value comes from the receipt — not corrected here
          reason: form.reason.trim(),
        })
      }
      if (deityChanged) {
        await StoresAPI.setDeityUsed(item.id, { used: !!form.deity_used,
          note: (form.deity_used && form.occasion.trim()) || form.reason.trim() })
      }
      toast(d?.pending_change && !item.pending_change ? `${item.tag_id}: ${tr('a lower weight was sent to the committee.')}` : `${item.tag_id}: ${tr('details corrected.')}`)
      onDone(d)
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
          {/* gold / silver: weight only, no purity (client, 2026-11-20) */}
          {weight && <div><label className="label"><T>Weight g *</T></label><NumberField required min="0.001" step="0.001" value={form.weight_g} onChange={(e) => set({ weight_g: e.target.value })} /></div>}
          {weight && <div className="text-[0.75rem] text-amber-800 bg-amber-50 rounded-lg px-3 py-2"><T>Gold / silver: a lower weight goes to a committee member for approval; it changes only after that.</T></div>}
          <div className="text-[0.75rem] text-gray-500">{tr('Value')}: <b>{item.est_value != null ? inr(item.est_value) : '—'}</b> — {tr('comes from the receipt; it is not changed here.')}</div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 space-y-2">
            <label className="flex items-center gap-2 text-[0.8125rem] font-semibold text-amber-900">
              <input type="checkbox" className="accent-maroon-700 w-4 h-4" checked={!!form.deity_used} onChange={(e) => set({ deity_used: e.target.checked })} />
              {tr('Used by the deity')}</label>
            <div className="text-[0.6875rem] text-amber-800">{tr('Set by itself when it comes back from Alankaram or Festival. Change it only for older items or a mistake.')}</div>
            {form.deity_used && !item.deity_used && <input className="input" maxLength={200} value={form.occasion} onChange={(e) => set({ occasion: e.target.value })} placeholder={tr('Occasion, e.g. Dasara 2025 alankaram')} />}
          </div>
          <div><label className="label"><T>Reason *</T></label><input required minLength={5} maxLength={300} className="input" value={form.reason} onChange={(e) => set({ reason: e.target.value })} placeholder={tr('e.g. Description typed wrong at tagging')} /></div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={() => setForm(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
          <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60"><Save size={15} className="mr-1" />{saving ? tr('Saving…') : tr('Save correction')}</button>
        </div>
      </form>
    </div>
  )
}

// The piece's source, linked back to it: a counter donation opens the Donations list on its
// Donation ID, a hundi custody the Hundi list on its code — for staff who can open that screen.
function SourceLink({ item, user }) {
  const text = `${tr(item.source_type)} · ${sourceRef(item)}`
  const to = item.source_type === 'Donation' && canAccessKey(user, 'donations')
    ? `/admin/donations?q=${encodeURIComponent(item.donation_code || item.source_ref)}`
    : item.source_type === 'Hundi' && canAccessKey(user, 'hundi') ? `/admin/hundi?q=${encodeURIComponent(item.source_ref)}` : null
  return to ? <Link to={to} className="text-maroon-700 hover:underline">{text}</Link> : text
}
