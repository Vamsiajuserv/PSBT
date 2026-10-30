import React, { useCallback, useEffect, useState } from 'react'
import { Plus, X, CheckCircle2, XCircle, Tag, Search, RotateCcw } from 'lucide-react'
import { PageTitle, Pill, Pager, fmtStamp, fmtDate } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { Select, NumberField, DateField } from '../../../components/common/Field.jsx'
import { confirmDialog, promptDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang } from '../../../i18n/LanguageContext.jsx'
import { TagItemsDrawer, canWriteStores, useStoresMeta, staffName } from './shared.jsx'

const SOURCES = ['Opening balance (physical count)', 'Old stock in store', 'Temple purchase', 'Received without receipt', 'Other']
const SIZE = 25
const NO_FILTER = { status: '', q: '', category_id: '', source: '', date_from: '', date_to: '' }
const STATUS_TONE = { 'Pending Verification': 'amber', Verified: 'green', Rejected: 'red' }
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const empty = () => ({ category_id: '', quantity: '', source: SOURCES[0], donor_name: '', donor_mobile: '', location_id: '', reason: '', expiry_date: '' })

export default function ManualEntries() {
  const { user } = useAuth()
  const { lang } = useLang()
  const canWrite = canWriteStores(user)
  const isCommittee = user?.role === 'Committee' || ['Admin', 'Administrator'].includes(user?.role)
  const { categories, activeLocations } = useStoresMeta()
  // Tagged items are then tagged piece by piece; Quantity items just add to the Consumables balance
  const material = categories.filter((c) => c.tracking === 'Tagged' || c.tracking === 'Quantity')
  const trackingOf = (cid) => categories.find((c) => c.id === cid)?.tracking
  const [f, setF] = useState(NO_FILTER)
  const [applied, setApplied] = useState(NO_FILTER)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [drawer, setDrawer] = useState(null)
  const [saving, setSaving] = useState(false)
  const [tagging, setTagging] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setLoadErr('')
    const params = Object.fromEntries(Object.entries(applied).filter(([, v]) => v !== ''))
    return StoresAPI.manual({ ...params, page, size: SIZE }).then((r) => { setRows(r.items || []); setTotal(r.total ?? (r.items || []).length) })
      .catch((ex) => { setLoadErr(errText(ex, "Couldn't load — check your connection and retry.")); setRows([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [applied, page])
  const apply = (z) => { setF(z); setPage(1); setApplied(z) }
  const filtered = Object.values(applied).some((v) => v !== '')
  useEffect(() => { load() }, [load])

  const cat = material.find((c) => String(c.id) === String(drawer?.category_id))
  const isQty = cat?.tracking === 'Quantity'
  async function save(e) {
    e.preventDefault()
    if (drawer.reason.trim().length < 5) { toast(tr('Enter the reason (at least 5 characters).'), 'error'); return }
    setSaving(true)
    try {
      const m = await StoresAPI.createManual({
        category_id: Number(drawer.category_id), quantity: Number(drawer.quantity), source: drawer.source,
        donor_name: drawer.donor_name.trim() || null, donor_mobile: drawer.donor_mobile.trim() || null,
        location_id: isQty ? null : Number(drawer.location_id), reason: drawer.reason.trim(),
        expiry_date: isQty && drawer.expiry_date ? drawer.expiry_date : null,
      })
      toast(`${m.code} ${tr('sent to the committee for verification.')}`)
      setDrawer(null); load()
    } catch (ex) { toast(errText(ex, 'Could not save the entry.'), 'error') }
    finally { setSaving(false) }
  }

  async function verify(m) {
    const ok = await confirmDialog({ title: `${tr('Verify')} ${m.code}`, confirmLabel: tr('Verify'),
      message: `${tr(m.item_name)} · ${m.quantity} ${tr(m.unit || '')} — ${tr(m.reason)}. ${tr('After verification the pieces can be tagged and counted in stock.')}` })
    if (!ok) return
    try { await StoresAPI.verifyManual(m.id); toast(tr('Verified.')); load() }
    catch (ex) { toast(errText(ex, 'Could not verify.'), 'error') }
  }
  async function reject(m) {
    const res = await promptDialog({ title: `${tr('Reject')} ${m.code}`, tone: 'danger', confirmLabel: tr('Reject'),
      fields: [{ k: 'reason', label: tr('Reason'), required: true }] })
    if (!res) return
    try { await StoresAPI.rejectManual(m.id, res.reason.trim()); toast(tr('Rejected.')); load() }
    catch (ex) { toast(errText(ex, 'Could not reject.'), 'error') }
  }

  return (
    <div>
      <PageTitle title={tr('Manual Entries')} subtitle={tr('Stock that came in without a donation receipt. It counts only after a committee member verifies it.')}
        actions={canWrite && <button onClick={() => setDrawer(empty())} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Manual Stock Entry</T></button>} />
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <form onSubmit={(e) => { e.preventDefault(); apply(f) }} className="px-5 py-4 flex flex-wrap items-end gap-3 border-b border-gray-100">
          <div className="flex-1 min-w-[12rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search entry, item, donor or reason</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input !pl-9" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder={tr('MSE-0004, pancha, shop…')} /></div></div>
          <div className="w-[11rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label>
            <Select className="input" value={f.status} onChange={(e) => apply({ ...f, status: e.target.value })}>
              <option value="">{tr('All')}</option>{Object.keys(STATUS_TONE).map((x) => <option key={x} value={x}>{tr(x)}</option>)}</Select></div>
          <div className="w-[10rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Item</T></label>
            <Select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">{tr('All')}</option>
              {material.map((c) => <option key={c.id} value={c.id}>{tr(c.name)}</option>)}</Select></div>
          <div className="w-[12rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Source</T></label>
            <Select className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="">{tr('All')}</option>
              {SOURCES.map((x) => <option key={x} value={x}>{tr(x)}</option>)}</Select></div>
          <div className="w-[9.5rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Entered from</T></label>
            <DateField value={f.date_from} max={f.date_to || undefined} onChange={(e) => setF({ ...f, date_from: e.target.value })} className="input" /></div>
          <div className="w-[9.5rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
            <DateField value={f.date_to} min={f.date_from || undefined} onChange={(e) => setF({ ...f, date_to: e.target.value })} className="input" /></div>
          <button className="btn-maroon !py-2.5 shrink-0"><Search size={14} />{' '}<T>Apply</T></button>
          <button type="button" onClick={() => apply(NO_FILTER)} className="btn-outline !py-2.5 shrink-0"><RotateCcw size={14} />{' '}<T>Clear</T></button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              <th className="px-4 py-3 font-semibold">{tr('Entry')}</th><th className="px-4 py-3 font-semibold">{tr('Item')}</th>
              <th className="px-4 py-3 font-semibold">{tr('Source')}</th><th className="px-4 py-3 font-semibold">{tr('Reason')}</th>
              <th className="px-4 py-3 font-semibold">{tr('Status')}</th><th className="px-4 py-3 font-semibold">{tr('Actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50/60 align-top">
                  <td className="px-4 py-3"><div className="font-mono text-[0.78rem]">{m.code}</div><div className="text-[0.6875rem] text-gray-400">{staffName(m.created_by)} · {fmtStamp(m.created_at)}</div></td>
                  <td className="px-4 py-3"><div className="font-semibold text-gray-800">{tr(m.item_name)}</div><div className="text-[0.75rem] text-gray-500">{m.quantity} {tr(m.unit || '')} · {tr(m.location || '—')}</div>
                    {m.expiry_date && <div className="text-[0.6875rem] text-amber-700">{tr('Expiry date')} {fmtDate(m.expiry_date)}</div>}</td>
                  <td className="px-4 py-3 text-gray-700">{tr(m.source)}{m.donor_name && <div className="text-[0.75rem] text-gray-500">{personName({ name: m.donor_name }, lang)}</div>}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-[18rem]">{tr(m.reason)}</td>
                  <td className="px-4 py-3"><Pill tone={STATUS_TONE[m.status]}>{tr(m.status)}</Pill>
                    {m.verified_by && <div className="text-[0.6875rem] text-gray-500 mt-1">{staffName(m.verified_by)}</div>}
                    {m.rejection_reason && <div className="text-[0.6875rem] text-red-600 mt-1">{tr(m.rejection_reason)}</div>}</td>
                  <td className="px-4 py-3"><div className="flex gap-1.5 flex-nowrap">
                    {isCommittee && m.status === 'Pending Verification' && m.created_by !== user?.username && (<>
                      <button onClick={() => verify(m)} title={tr('Verify')} aria-label={tr('Verify')} className="w-8 h-8 grid place-items-center rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50"><CheckCircle2 size={15} /></button>
                      <button onClick={() => reject(m)} title={tr('Reject')} aria-label={tr('Reject')} className="w-8 h-8 grid place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><XCircle size={15} /></button>
                    </>)}
                    {canWrite && m.status === 'Verified' && trackingOf(m.category_id) === 'Tagged' && <button onClick={() => setTagging({ type: 'Manual', id: m.id })} title={tr('Tag items')} aria-label={tr('Tag items')} className="w-8 h-8 grid place-items-center rounded-lg border border-maroon-200 text-maroon-700 hover:bg-maroon-50"><Tag size={15} /></button>}
                  </div></td>
                </tr>
              ))}
              {rows.length === 0 && <TableStates colSpan={6} loading={loading} error={loadErr} onRetry={load}
                empty={filtered ? tr('No entries match these filters.') : tr('No manual entries.')} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit={tr('entries')} />
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Manual Stock Entry</T></h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>For items with no donation receipt. A committee member verifies it before it counts.</T></p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4 flex-1">
              <div><label className="label"><T>Item type *</T></label>
                <Select required className="input" value={drawer.category_id} onChange={(e) => setDrawer({ ...drawer, category_id: e.target.value })}>
                  <option value="">{tr('Select')}</option>{material.map((c) => <option key={c.id} value={c.id}>{tr(c.name)} ({c.tracking === 'Tagged' ? c.id_prefix : tr('Quantity')})</option>)}
                </Select></div>
              <div><label className="label">{isQty ? `${tr('Quantity')} (${tr(cat.unit || '')}) *` : cat?.weight ? <T>Total weight (g) *</T> : <T>Number of pieces *</T>}</label>
                <NumberField required min="0" step={cat?.weight || isQty ? '0.001' : '1'} value={drawer.quantity} onChange={(e) => setDrawer({ ...drawer, quantity: e.target.value })} /></div>
              <div><label className="label"><T>Source *</T></label>
                <Select className="input" value={drawer.source} onChange={(e) => setDrawer({ ...drawer, source: e.target.value })}>{SOURCES.map((s) => <option key={s} value={s}>{tr(s)}</option>)}</Select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label"><T>Donor (optional)</T></label><input className="input" value={drawer.donor_name} onChange={(e) => setDrawer({ ...drawer, donor_name: e.target.value })} /></div>
                <div><label className="label"><T>Mobile (optional)</T></label><input className="input" inputMode="numeric" maxLength={10} value={drawer.donor_mobile} onChange={(e) => setDrawer({ ...drawer, donor_mobile: e.target.value.replace(/\D/g, '') })} /></div>
              </div>
              {isQty && cat?.track_expiry && <div><label className="label">{tr('Expiry date (optional)')}</label>
                <DateField min={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })} value={drawer.expiry_date} onChange={(e) => setDrawer({ ...drawer, expiry_date: e.target.value })} /></div>}
              {!isQty && <div><label className="label"><T>Store location *</T></label>
                <Select required className="input" value={drawer.location_id} onChange={(e) => setDrawer({ ...drawer, location_id: e.target.value })}>
                  <option value="">{tr('Select')}</option>{activeLocations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}
                </Select></div>}
              <div><label className="label"><T>Reason *</T></label>
                <textarea required minLength={5} maxLength={500} rows={3} className="input" value={drawer.reason} onChange={(e) => setDrawer({ ...drawer, reason: e.target.value })} placeholder={tr('e.g. Found in store during October audit, not on record')} /></div>
              <div className="text-[0.75rem] text-gray-600 bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2"><T>For oil, ghee, rice and other quantity items, choose "Opening balance (physical count)" to enter what is already in the store. After verification it adds to Consumables Stock.</T></div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60">{saving ? tr('Saving…') : <T>Send for verification</T>}</button>
            </div>
          </form>
        </div>
      )}
      {tagging && <TagItemsDrawer source={tagging} onClose={() => { setTagging(null); load() }} />}
    </div>
  )
}
