import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Pencil, Undo2, XCircle, Printer, X, Receipt as ReceiptIcon, Info } from 'lucide-react'
import { PageTitle, Pill, inr, fmtDate, fmtStamp } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { Select } from '../../../components/common/Field.jsx'
import { confirmDialog, promptDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang } from '../../../i18n/LanguageContext.jsx'
import { isCommitteeUser, canSellOrDamage } from './shared.jsx'
import { useTemple } from '../../../lib/SiteContext.jsx'

const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const modeLabel = (m) => (m === 'UPI/QR Code' ? 'Online' : m || '')
const changed = () => window.dispatchEvent(new Event('stores:changed'))   // sidebar badges

export default function OpenSale() {
  const { user } = useAuth()
  const { lang } = useLang()
  const temple = useTemple()
  const committee = isCommitteeUser(user)
  const canSell = canSellOrDamage(user)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [selling, setSelling] = useState(null)
  const [receipt, setReceipt] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setLoadErr('')
    return StoresAPI.openSale().then(setData)
      .catch((ex) => { setLoadErr(errText(ex, "Couldn't load — check your connection and retry.")); setData(null) })
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function changePrice(i) {
    const res = await promptDialog({ title: `${tr('Change Open Sale price')} — ${i.tag_id}`, confirmLabel: tr('Save'),
      fields: [{ k: 'price', label: tr('Open Sale price (₹)'), type: 'number', required: true, defaultValue: String(i.open_sale_price) }] })
    if (!res) return
    try { await StoresAPI.openSalePrice(i.id, Number(res.price)); toast(tr('Price changed.')); load() }
    catch (ex) { toast(errText(ex, 'Could not change the price.'), 'error') }
  }
  async function back(i) {
    if (!(await confirmDialog({ title: `${tr('Take off Open Sale')} — ${i.tag_id}`, confirmLabel: tr('Back to store'),
      message: tr('The piece goes back to the store and can be auctioned again.') }))) return
    try { await StoresAPI.openSaleBack(i.id); toast(tr('Back in store.')); changed(); load() }
    catch (ex) { toast(errText(ex, 'Could not take it off sale.'), 'error') }
  }
  async function damaged(i) {
    const res = await promptDialog({ title: `${tr('Mark damaged')} — ${i.tag_id}`, tone: 'danger', confirmLabel: tr('Mark damaged'),
      message: tr('The piece leaves stock for good. Use this only for damaged or lost items.'),
      fields: [{ k: 'reason', label: tr('Reason'), required: true, placeholder: tr('e.g. Torn, cannot be used') }] })
    if (!res) return
    try { await StoresAPI.writeOff(i.id, res.reason.trim()); toast(tr('Marked damaged.')); changed(); load() }
    catch (ex) { toast(errText(ex, 'Could not mark it damaged.'), 'error') }
  }
  async function sell(e) {
    e.preventDefault()
    const f = selling
    try {
      const s = await StoresAPI.openSaleSell(f.item.id, { buyer_name: f.buyer_name.trim(), buyer_mobile: f.buyer_mobile.trim() || null,
        mode: f.mode, txn_ref: f.mode === 'UPI/QR Code' ? f.txn_ref.trim() : null })
      toast(`${s.receipt_no}: ${tr('sold')} ${s.tag_id} ${inr(s.amount)}`)
      setSelling(null); setReceipt(s); changed(); load()
    } catch (ex) { toast(errText(ex, 'Could not record the sale.'), 'error') }
  }

  const items = data?.items || []
  return (
    <div>
      <PageTitle title={tr('Open Sale')} subtitle={tr('Pieces still unsold after auction, sold at the counter at the price the committee fixed. Unsold pieces stay in stock here.')} />
      <div className="mb-4 flex items-start gap-2 text-[0.8125rem] text-gray-700 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-3">
        <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
        <span><b>{tr('Committee')}:</b> {tr('moves unsold pieces here (Unsold Items) and fixes the price.')} <b>{tr('Counter Staff / Admin')}:</b> {tr('sell at that price, or mark a piece damaged.')}</span>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between"><h3 className="font-serif text-lg font-bold text-maroon-800"><T>On sale now</T></h3>
          <span className="text-[0.8125rem] text-gray-600">{items.length} {tr('pieces')}</span></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              <th className="pl-5 pr-4 py-3 font-semibold">{tr('ID')}</th><th className="px-4 py-3 font-semibold">{tr('Item')}</th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">{tr('Open Sale price')}</th><th className="px-4 py-3 font-semibold">{tr('Price set by')}</th>
              <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">{tr('Times unsold')}</th><th className="px-4 py-3 font-semibold">{tr('Location')}</th>
              <th className="px-4 py-3 font-semibold">{tr('Donor / Source')}</th><th className="pl-4 pr-5 py-3 font-semibold">{tr('Actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50/60">
                  <td className="pl-5 pr-4 py-3 font-mono text-[0.78rem] whitespace-nowrap"><Link className="text-maroon-700 font-semibold hover:underline" to={`/admin/stores/item/${i.tag_id}`}>{i.tag_id}</Link></td>
                  <td className="px-4 py-3"><div className="font-semibold text-gray-800">{tr(i.description || i.item_name)}</div><div className="text-[0.6875rem] text-gray-500">{[tr(i.item_name), i.details].filter(Boolean).join(' · ')}</div></td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-maroon-800 whitespace-nowrap">{inr(i.open_sale_price)}</td>
                  <td className="px-4 py-3 text-[0.8125rem]">{i.open_sale_by}<div className="text-[0.6875rem] text-gray-400">{fmtStamp(i.open_sale_at)}</div></td>
                  <td className="px-4 py-3 text-center"><Pill tone={i.unsold_count >= 2 ? 'red' : 'orange'}>×{i.unsold_count}</Pill></td>
                  <td className="px-4 py-3">{tr(i.location || '—')}</td>
                  <td className="px-4 py-3"><div>{personName({ name: i.donor_name }, lang)}</div><div className="text-[0.6875rem] font-mono text-gray-400">{i.source_ref}</div></td>
                  <td className="pl-4 pr-5 py-3"><div className="flex gap-1.5 flex-nowrap">
                    {canSell && <button onClick={() => setSelling({ item: i, buyer_name: '', buyer_mobile: '', mode: 'Cash', txn_ref: '' })} title={tr('Sell')} aria-label={tr('Sell')} className="w-8 h-8 grid place-items-center rounded-lg border border-green-200 text-green-700 hover:bg-green-50"><Banknote size={15} /></button>}
                    {committee && <button onClick={() => changePrice(i)} title={tr('Change price')} aria-label={tr('Change price')} className="w-8 h-8 grid place-items-center rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50"><Pencil size={15} /></button>}
                    {committee && <button onClick={() => back(i)} title={tr('Back to store')} aria-label={tr('Back to store')} className="w-8 h-8 grid place-items-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"><Undo2 size={15} /></button>}
                    {canSell && <button onClick={() => damaged(i)} title={tr('Mark damaged')} aria-label={tr('Mark damaged')} className="w-8 h-8 grid place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><XCircle size={15} /></button>}
                  </div></td>
                </tr>
              ))}
              {!items.length && <TableStates colSpan={8} loading={loading} error={loadErr} onRetry={load} empty={tr('Nothing on Open Sale. The committee moves unsold pieces here from Unsold Items.')} />}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-serif text-lg font-bold text-maroon-800"><T>Sold in Open Sale</T></h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              <th className="pl-5 pr-4 py-3 font-semibold">{tr('Receipt')}</th><th className="px-4 py-3 font-semibold">{tr('Piece')}</th>
              <th className="px-4 py-3 font-semibold">{tr('Buyer')}</th><th className="px-4 py-3 font-semibold text-right">{tr('Amount')}</th>
              <th className="px-4 py-3 font-semibold">{tr('Payment')}</th><th className="px-4 py-3 font-semibold">{tr('Sold on')}</th><th className="pl-4 pr-5 py-3"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {(data?.sales || []).map((s) => (
                <tr key={s.id}>
                  <td className="pl-5 pr-4 py-3 font-mono text-[0.78rem]">{s.receipt_no}</td>
                  <td className="px-4 py-3"><span className="font-mono text-[0.78rem]">{s.tag_id}</span> · {tr(s.item_name)}</td>
                  <td className="px-4 py-3">{personName({ name: s.buyer_name }, lang)}{s.buyer_mobile && <div className="text-[0.6875rem] text-gray-400">{s.buyer_mobile}</div>}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{inr(s.amount)}</td>
                  <td className="px-4 py-3"><Pill tone="green">{tr(modeLabel(s.payment_mode))}</Pill>{s.payment_ref && <div className="text-[0.6875rem] text-gray-400 font-mono">{s.payment_ref}</div>}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[0.8125rem]">{fmtStamp(s.sold_at)}<div className="text-[0.6875rem] text-gray-400">{s.sold_by}</div></td>
                  <td className="pl-4 pr-5 py-3"><button onClick={() => setReceipt(s)} title={tr('Print receipt')} aria-label={tr('Print receipt')} className="w-8 h-8 grid place-items-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"><ReceiptIcon size={15} /></button></td>
                </tr>
              ))}
              {!(data?.sales || []).length && <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-500"><T>No Open Sale yet.</T></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelling(null)} />
          <form onSubmit={sell} className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Sell in Open Sale</T></h3>
              <button type="button" onClick={() => setSelling(null)} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="bg-gray-50 rounded-lg px-4 py-3">
                <div className="font-mono text-[0.78rem] text-gray-500">{selling.item.tag_id}</div>
                <div className="font-semibold text-gray-800">{tr(selling.item.description || selling.item.item_name)}</div>
                <div className="text-lg font-bold text-maroon-700">{inr(selling.item.open_sale_price)}</div>
                <div className="text-[0.6875rem] text-gray-500">{tr('Price fixed by')} {selling.item.open_sale_by}</div>
              </div>
              <div><label className="label"><T>Buyer name *</T></label><input required maxLength={120} className="input" value={selling.buyer_name} onChange={(e) => setSelling({ ...selling, buyer_name: e.target.value })} /></div>
              <div><label className="label"><T>Mobile</T></label><input className="input" inputMode="numeric" maxLength={10} value={selling.buyer_mobile} onChange={(e) => setSelling({ ...selling, buyer_mobile: e.target.value.replace(/\D/g, '') })} /></div>
              <div><label className="label"><T>Payment Mode *</T></label>
                <Select className="input" value={selling.mode} onChange={(e) => setSelling({ ...selling, mode: e.target.value })}>
                  <option value="Cash">{tr('Cash')}</option><option value="UPI/QR Code">{tr('Online')}</option></Select></div>
              {selling.mode === 'UPI/QR Code' && <div><label className="label"><T>Transaction Reference *</T></label><input required maxLength={60} className="input" value={selling.txn_ref} onChange={(e) => setSelling({ ...selling, txn_ref: e.target.value })} placeholder={tr('Online transaction ID / UTR')} /></div>}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => setSelling(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button type="submit" className="btn-maroon flex-1 justify-center"><Banknote size={15} className="mr-1" />{tr('Sell for')} {inr(selling.item.open_sale_price)}</button>
            </div>
          </form>
        </div>
      )}

      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 no-print" onClick={() => setReceipt(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div id="print-area" className="px-6 py-5">
              <div className="text-center border-b border-dashed border-gray-300 pb-3 mb-3">
                <div className="font-serif text-lg font-bold text-maroon-800">{temple?.name || 'Shri Shirdi Sai Baba Temple'}</div>
                <div className="text-sm text-gray-600">{temple?.nameTelugu || 'శ్రీ షిర్డీ సాయిబాబా దేవస్థానం'}</div>
                <div className="font-semibold text-gray-800 mt-2"><T>Open Sale Receipt</T></div>
                <div className="text-[0.75rem] text-gray-500">{fmtDate(receipt.sold_at)}</div>
              </div>
              <div className="space-y-2 text-[0.875rem]">
                {[[tr('Receipt No'), receipt.receipt_no], [tr('Item'), `${receipt.tag_id} · ${tr(receipt.item_name)}`], [tr('Buyer'), receipt.buyer_name],
                  [tr('Mode'), tr(modeLabel(receipt.payment_mode))], ...(receipt.payment_ref ? [[tr('Ref'), receipt.payment_ref]] : [])].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><span className="text-gray-500">{k}:</span><span className="font-semibold text-right">{v}</span></div>))}
                <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2"><span><T>Amount Paid</T>:</span><span className="text-maroon-700">{inr(receipt.amount)}</span></div>
              </div>
              <div className="border-t border-dashed border-gray-300 pt-3 mt-3 text-center text-[0.6875rem] text-gray-400"><T>This is a computer-generated receipt</T></div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 no-print">
              <button onClick={() => setReceipt(null)} className="btn-outline flex-1 justify-center"><T>Close</T></button>
              <button onClick={() => window.print()} className="btn-maroon flex-1 justify-center"><Printer size={16} className="mr-1" /><T>Print</T></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
