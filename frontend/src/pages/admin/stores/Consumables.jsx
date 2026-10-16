import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, MinusCircle, BookOpen, Plus, CalendarDays, Ban, Printer, Receipt as ReceiptIcon } from 'lucide-react'
import { PageTitle, Pill, fmtDate, fmtStamp } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { NumberField, DateField, Combobox } from '../../../components/common/Field.jsx'
import { promptDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang } from '../../../i18n/LanguageContext.jsx'
import { canWriteStores, isAdminUser } from './shared.jsx'
import { useTemple } from '../../../lib/SiteContext.jsx'

const PURPOSES = ['Nithya Pooja – Deepam', 'Abhishekam', 'Annadanam', 'Prasadam', 'Festival', 'Homam', 'Other']
const KIND_TONE = { Donation: 'blue', 'Manual entry': 'amber', Use: 'red' }
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const q3 = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }))

export default function Consumables() {
  const { user } = useAuth()
  const { lang } = useLang()
  const canWrite = canWriteStores(user)
  const isAdmin = isAdminUser(user)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [useFor, setUseFor] = useState(null)
  const [ledger, setLedger] = useState(null)
  const [startEdit, setStartEdit] = useState(null)
  const [slip, setSlip] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setLoadErr('')
    return StoresAPI.consumables().then(setData)
      .catch((ex) => { setLoadErr(errText(ex, "Couldn't load — check your connection and retry.")); setData(null) })
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])
  const openLedger = (cid) => StoresAPI.ledger(cid).then(setLedger).catch((ex) => toast(errText(ex, 'Could not load the ledger.'), 'error'))

  async function saveUse(e) {
    e.preventDefault()
    try {
      const r = await StoresAPI.recordUse({
        category_id: useFor.item.category_id, quantity: Number(useFor.quantity), purpose: useFor.purpose.trim(),
        issued_to: useFor.issued_to.trim() || null, used_on: useFor.used_on, notes: useFor.notes.trim() || null,
      })
      toast(`${r.code}: ${tr('recorded')} · ${q3(r.remaining)} ${tr(r.unit || '')} ${tr('left')}`)
      setUseFor(null); setSlip(r.slip); load()
    } catch (ex) { toast(errText(ex, 'Could not record the use.'), 'error') }
  }
  const openSlip = (id) => StoresAPI.useSlip(id).then(setSlip).catch((ex) => toast(errText(ex, 'Could not load the issue slip.'), 'error'))
  async function cancelUse(entry) {
    const res = await promptDialog({ title: `${tr('Cancel use')} ${entry.ref}`, tone: 'danger', confirmLabel: tr('Cancel entry'),
      message: tr('The entry stays in the ledger, marked cancelled, and its quantity goes back into stock.'),
      fields: [{ k: 'reason', label: tr('Reason'), required: true, placeholder: tr('e.g. Entered twice by mistake') }] })
    if (!res) return
    try { await StoresAPI.cancelUse(entry.id, res.reason.trim()); toast(tr('Cancelled.')); load(); openLedger(ledger.category_id) }
    catch (ex) { toast(errText(ex, 'Could not cancel the entry.'), 'error') }
  }
  async function saveStart(e) {
    e.preventDefault()
    try { await StoresAPI.setConsumablesStart(startEdit); toast(tr('Start date saved.')); setStartEdit(null); load() }
    catch (ex) { toast(errText(ex, 'Could not change the start date.'), 'error') }
  }

  const items = data?.items || []
  return (
    <div>
      <PageTitle title={tr('Consumables Stock')} subtitle={tr('Oil, ghee, rice and other items used in the temple — received, used and what is left.')}
        actions={canWrite && <Link to="/admin/stores/manual" className="btn-outline !py-2.5"><Plus size={16} />{' '}<T>Opening balance / manual entry</T></Link>} />

      {data && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.8125rem] bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-2.5 text-gray-700">
          <CalendarDays size={15} className="text-blue-600" />
          <span>{tr('Donations are counted from')} <b>{fmtDate(data.start_date)}</b>. {tr('Stock already in the store is entered once as an opening balance (Manual Entries), verified by the committee.')}</span>
          {isAdmin && startEdit === null && <button onClick={() => setStartEdit(data.start_date)} className="text-maroon-700 font-semibold hover:underline"><T>Change</T></button>}
          {isAdmin && startEdit !== null && (
            <form onSubmit={saveStart} className="flex items-center gap-2">
              <div className="w-[10rem]"><DateField required max={todayISO()} value={startEdit} onChange={(e) => setStartEdit(e.target.value)} className="input !py-1.5" /></div>
              <button className="btn-maroon !py-1.5 !px-3 text-[0.78rem]"><T>Save</T></button>
              <button type="button" onClick={() => setStartEdit(null)} className="btn-outline !py-1.5 !px-3 text-[0.78rem]"><T>Cancel</T></button>
            </form>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
            <th className="px-4 py-3 font-semibold">{tr('Item')}</th><th className="px-4 py-3 font-semibold">{tr('Unit')}</th>
            <th className="px-4 py-3 font-semibold text-right">{tr('Received')}</th><th className="px-4 py-3 font-semibold text-right">{tr('Used')}</th>
            <th className="px-4 py-3 font-semibold text-right">{tr('Remaining')}</th><th className="px-4 py-3 font-semibold">{tr('Actions')}</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((i) => (
              <tr key={i.category_id} className="hover:bg-gray-50/60">
                <td className="px-4 py-3"><div className="font-semibold text-gray-800">{tr(i.name)}</div>
                  {i.pending_manual > 0 && <div className="text-[0.6875rem] text-amber-700">{i.pending_manual} {tr('manual entry(s) waiting for committee')}</div>}</td>
                <td className="px-4 py-3 text-gray-600">{tr(i.unit || '—')}</td>
                <td className="px-4 py-3 text-right tabular-nums" title={`${tr('Donations')} ${q3(i.received_donations)} + ${tr('Manual entries')} ${q3(i.received_manual)}`}>{q3(i.received)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{q3(i.used)}</td>
                <td className="px-4 py-3 text-right tabular-nums"><b>{q3(i.remaining)}</b>{i.low && <span className="ml-2"><Pill tone="red">{tr('Low')}</Pill></span>}</td>
                <td className="px-4 py-3"><div className="flex gap-1.5 flex-nowrap">
                  <button onClick={() => openLedger(i.category_id)} title={tr('Ledger')} aria-label={tr('Ledger')} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700"><BookOpen size={15} /></button>
                  {canWrite && i.remaining > 0 && <button onClick={() => setUseFor({ item: i, quantity: '', purpose: '', issued_to: '', used_on: todayISO(), notes: '' })} title={tr('Record use')} aria-label={tr('Record use')} className="w-8 h-8 grid place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><MinusCircle size={15} /></button>}
                </div></td>
              </tr>
            ))}
            {items.length === 0 && <TableStates colSpan={6} loading={loading} error={loadErr} onRetry={load} empty={tr('No quantity items. Set Tracking = Quantity in Donation Master.')} />}
          </tbody>
        </table>
      </div>

      {useFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setUseFor(null)} />
          <form onSubmit={saveUse} className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-lg font-bold text-maroon-800"><T>Record use</T></h3>
                <div className="text-[0.75rem] text-gray-500">{tr(useFor.item.name)} · {q3(useFor.item.remaining)} {tr(useFor.item.unit || '')} {tr('left')}</div></div>
              <button type="button" onClick={() => setUseFor(null)} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={18} /></button>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-3">
              <div><label className="label">{tr('Quantity used')} ({tr(useFor.item.unit || '')}) *</label>
                <NumberField required min="0" max={String(useFor.item.remaining)} step="0.001" value={useFor.quantity} onChange={(e) => setUseFor({ ...useFor, quantity: e.target.value })} /></div>
              <div><label className="label"><T>Date *</T></label>
                <DateField required min={data.start_date} max={todayISO()} value={useFor.used_on} onChange={(e) => setUseFor({ ...useFor, used_on: e.target.value })} /></div>
              <div className="col-span-2"><label className="label"><T>Used for *</T></label>
                <Combobox required value={useFor.purpose} onChange={(e) => setUseFor({ ...useFor, purpose: e.target.value })} options={PURPOSES.map((p) => ({ value: p, label: tr(p) }))} placeholder={tr('Select or type')} className="input" /></div>
              <div className="col-span-2"><label className="label"><T>Issued to</T></label>
                <input className="input" maxLength={120} value={useFor.issued_to} onChange={(e) => setUseFor({ ...useFor, issued_to: e.target.value })} placeholder={tr('e.g. Poojari Venkatesh')} /></div>
              <div className="col-span-2"><label className="label"><T>Notes</T></label>
                <input className="input" maxLength={500} value={useFor.notes} onChange={(e) => setUseFor({ ...useFor, notes: e.target.value })} /></div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => setUseFor(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button className="btn-maroon flex-1 justify-center"><MinusCircle size={15} className="mr-1" /><T>Record use</T></button>
            </div>
          </form>
        </div>
      )}

      {ledger && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setLedger(null)} />
          <div className="relative w-full max-w-3xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800">{tr(ledger.name)} — <T>Ledger</T></h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5">{tr('Received')} {q3(ledger.received)} · {tr('Used')} {q3(ledger.used)} · {tr('Remaining')} <b>{q3(ledger.remaining)} {tr(ledger.unit || '')}</b> · {tr('from')} {fmtDate(ledger.start_date)}</p></div>
              <button onClick={() => setLedger(null)} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={20} /></button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
                  <th className="px-4 py-3 font-semibold">{tr('Date')}</th><th className="px-4 py-3 font-semibold">{tr('Entry')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('Details')}</th><th className="px-4 py-3 font-semibold text-right">{tr('In')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{tr('Out')}</th><th className="px-4 py-3 font-semibold text-right">{tr('Balance')}</th><th className="px-2 py-3"></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {ledger.entries.map((e, k) => (
                    <tr key={k} className={e.status === 'Cancelled' ? 'text-gray-400 line-through' : ''}>
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="px-4 py-2.5"><Pill tone={KIND_TONE[e.kind] || 'gray'}>{tr(e.kind)}</Pill><div className="font-mono text-[0.7rem] text-gray-500 mt-0.5">{e.ref}</div></td>
                      <td className="px-4 py-2.5 text-[0.8125rem]">{e.kind === 'Donation' ? personName({ name: e.detail }, lang) : e.detail}<div className="text-[0.6875rem] text-gray-400">{e.by} · {fmtStamp(e.at)}</div></td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{e.in != null ? `+${q3(e.in)}` : ''}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{e.out != null ? `−${q3(e.out)}` : ''}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{q3(e.balance)}</td>
                      <td className="px-2 py-2.5"><div className="flex gap-1">
                        {e.kind === 'Use' && <button onClick={() => openSlip(e.id)} title={tr('Issue slip')} aria-label={tr('Issue slip')} className="w-7 h-7 grid place-items-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"><ReceiptIcon size={13} /></button>}
                        {isAdmin && e.kind === 'Use' && e.status === 'Active' && (
                        <button onClick={() => cancelUse(e)} title={tr('Cancel use')} aria-label={tr('Cancel use')} className="w-7 h-7 grid place-items-center rounded-lg border border-gray-200 text-red-500 hover:border-red-300"><Ban size={13} /></button>)}</div></td>
                    </tr>
                  ))}
                  {ledger.entries.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500"><T>Nothing received or used yet.</T></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {slip && <IssueSlip slip={slip} onClose={() => setSlip(null)} />}
    </div>
  )
}

// Printed when stock leaves the store: the issuer and the person who took it both sign
function IssueSlip({ slip, onClose }) {
  const temple = useTemple()
  const cancelled = slip.status === 'Cancelled'
  const row = (k, v) => v ? <div className="flex justify-between gap-3"><span className="text-gray-500">{k}:</span><span className="font-semibold text-right">{v}</span></div> : null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 no-print" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div id="print-area" className="px-6 py-5 relative">
          <div className="text-center border-b border-dashed border-gray-300 pb-3 mb-3">
            <div className="font-serif text-lg font-bold text-maroon-800">{temple?.name || 'Shri Shirdi Sai Baba Temple'}</div>
            <div className="text-sm text-gray-600">{temple?.nameTelugu || 'శ్రీ షిర్డీ సాయిబాబా దేవస్థానం'}</div>
            <div className="font-semibold text-gray-800 mt-2"><T>Store Issue Slip</T></div>
          </div>
          {cancelled && <div className="mb-3 text-center text-red-700 font-bold border-2 border-red-300 rounded-lg py-1"><T>CANCELLED</T>{slip.cancel_reason && <div className="text-[0.75rem] font-normal">{slip.cancel_reason} — {slip.cancelled_by}</div>}</div>}
          <div className="space-y-2 text-[0.875rem]">
            {row(tr('Slip No'), slip.code)}
            {row(tr('Date'), fmtDate(slip.used_on))}
            {row(tr('Item'), tr(slip.item))}
            <div className="flex justify-between text-lg font-bold border-y border-gray-200 py-2"><span><T>Quantity issued</T>:</span><span className="text-maroon-700">{q3(slip.quantity)} {tr(slip.unit || '')}</span></div>
            {row(tr('Purpose'), tr(slip.purpose))}
            {row(tr('Issued to'), slip.issued_to)}
            {row(tr('Issued by'), slip.issued_by)}
            {row(tr('Notes'), slip.notes)}
          </div>
          <div className="grid grid-cols-2 gap-6 mt-10 text-center text-[0.75rem] text-gray-600">
            <div className="border-t border-gray-400 pt-1"><T>Issued by (signature)</T></div>
            <div className="border-t border-gray-400 pt-1"><T>Received by (signature)</T></div>
          </div>
          <div className="mt-4 text-center text-[0.6875rem] text-gray-400">{fmtStamp(slip.created_at)}</div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 no-print">
          <button onClick={onClose} className="btn-outline flex-1 justify-center"><T>Close</T></button>
          <button onClick={() => window.print()} className="btn-maroon flex-1 justify-center"><Printer size={16} className="mr-1" /><T>Print</T></button>
        </div>
      </div>
    </div>
  )
}
