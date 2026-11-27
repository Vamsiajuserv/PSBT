import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Pencil, Undo2, XCircle, Printer, X, Receipt as ReceiptIcon, Info, Search, RotateCcw } from 'lucide-react'
import { PageTitle, Pill, Pager, inr, fmtDate, fmtStamp, FilterPanel } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { Select, DateField } from '../../../components/common/Field.jsx'
import { confirmDialog, promptDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang } from '../../../i18n/LanguageContext.jsx'
import { isCommitteeUser, canSellOrDamage, isStoresOfficer, staffName, useStoresMeta, sourceRef, DeityBadge, BundleBadge, StoresTabs } from './shared.jsx'
import { useTemple } from '../../../lib/SiteContext.jsx'
import BuyerField, { MOBILE_OK, NAME_OK } from '../../../components/admin/BuyerField.jsx'

const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const modeLabel = (m) => (m === 'UPI/QR Code' ? 'Online' : m || '')
const SALES_SIZE = 25
const NO_ON = { q: '', category_id: '', location_id: '' }
const NO_SOLD = { q: '', mode: '', date_from: '', date_to: '' }
const onlySet = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ''))
const changed = () => window.dispatchEvent(new Event('stores:changed'))   // sidebar badges

export default function OpenSale() {
  const { user } = useAuth()
  const { lang } = useLang()
  const temple = useTemple()
  const committee = isCommitteeUser(user)
  const canSell = canSellOrDamage(user)
  const { categories, locations } = useStoresMeta()
  const tagged = categories.filter((c) => c.tracking === 'Tagged')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [fOn, setFOn] = useState(NO_ON)
  const [onApplied, setOnApplied] = useState(NO_ON)
  const [fSold, setFSold] = useState(NO_SOLD)
  const [soldApplied, setSoldApplied] = useState(NO_SOLD)
  const [salePage, setSalePage] = useState(1)
  const [sales, setSales] = useState(null)   // { items, total, amount }
  const [salesErr, setSalesErr] = useState('')
  const [selling, setSelling] = useState(null)
  const [receipt, setReceipt] = useState(null)

  const loadOn = useCallback(() => {
    setLoading(true); setLoadErr('')
    return StoresAPI.openSale(onlySet(onApplied)).then(setData)
      .catch((ex) => { setLoadErr(errText(ex, "Couldn't load — check your connection and retry.")); setData(null) })
      .finally(() => setLoading(false))
  }, [onApplied])
  const loadSales = useCallback(() => {
    setSalesErr('')
    return StoresAPI.openSaleSales({ ...onlySet(soldApplied), page: salePage, size: SALES_SIZE }).then(setSales)
      .catch((ex) => { setSalesErr(errText(ex, "Couldn't load the sales — check your connection and retry.")); setSales(null) })
  }, [soldApplied, salePage])
  useEffect(() => { loadOn() }, [loadOn])
  useEffect(() => { loadSales() }, [loadSales])
  const load = () => { loadOn(); loadSales() }
  const applyOn = (z) => { setFOn(z); setOnApplied(z) }
  const applySold = (z) => { setFSold(z); setSalePage(1); setSoldApplied(z) }
  const onFiltered = Object.values(onApplied).some((v) => v !== '')
  const soldFiltered = Object.values(soldApplied).some((v) => v !== '')

  async function changePrice(i) {
    const res = await promptDialog({ title: `${tr('Change Open Sale price')} — ${i.tag_id}`, confirmLabel: tr('Save'),
      fields: [{ k: 'price', label: i.pieces > 1 ? tr('Open Sale price per piece (₹)') : tr('Open Sale price (₹)'), type: 'number', required: true, defaultValue: String(i.open_sale_price) }] })
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
  async function sell(e) {
    e.preventDefault()
    const f = selling
    if (!NAME_OK(f.buyer_name)) { toast(tr("Enter the buyer's name — it goes on the receipt."), 'error'); return }
    if (f.buyer_mobile.trim() && !MOBILE_OK.test(f.buyer_mobile.trim())) { toast(tr('Enter a valid 10-digit mobile number (starts with 6, 7, 8 or 9).'), 'error'); return }
    const n = sellCount(f)
    if (!(n >= 1 && n <= (f.item.pieces || 1))) { toast(`${f.item.tag_id}: ${tr('enter how many pieces — 1 to')} ${f.item.pieces}.`, 'error'); return }
    try {
      const s = await StoresAPI.openSaleSell(f.item.id, { buyer_name: f.buyer_name.trim(), buyer_mobile: f.buyer_mobile.trim() || null,
        devotee_id: f.devotee_id || null,
        mode: f.mode, txn_ref: f.mode === 'UPI/QR Code' ? f.txn_ref.trim() : null, ...(f.item.pieces > 1 ? { pieces: n } : {}) })
      toast(`${s.receipt_no}: ${tr('sold')} ${s.tag_id} ${inr(s.amount)}`)
      setSelling(null); setReceipt(s); changed(); load()
    } catch (ex) { toast(errText(ex, 'Could not record the sale.'), 'error') }
  }

  const items = data?.items || []
  // several pieces of a bundle on sale: the buyer takes some or all, at the price per piece (2026-11-27)
  const sellCount = (f) => (f?.item?.pieces > 1 ? Math.round(Number(f.pieces)) || 0 : 1)
  return (
    <div>
      <StoresTabs group="sales" />
      <PageTitle title={tr('Open Sale')} subtitle={tr('Pieces still unsold after auction, sold at the counter at the price the committee fixed. Unsold pieces stay in stock here.')}
        help={<span><b>{tr('Committee')}:</b> {tr('moves unsold pieces here (Unsold Items), fixes the price, or takes a piece back to store.')} <b>{tr('Counter Staff / Admin')}:</b> {tr('sell at that price.')} <b>{tr('Stores Officer')}:</b> {tr('a damaged piece goes back to store first, then "Ask to write off" in the Stock Register.')}</span>} />
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between"><h3 className="font-serif text-lg font-bold text-maroon-800"><T>On sale now</T></h3>
          <span className="text-[0.8125rem] text-gray-600">{items.length} {tr('pieces')}</span></div>
        <FilterPanel>
        <form onSubmit={(e) => { e.preventDefault(); applyOn(fOn) }} className="px-5 py-4 flex flex-wrap items-end gap-3 border-b border-gray-100">
          <div className="flex-1 min-w-[12rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search ID, item or donor</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input !pl-9" value={fOn.q} onChange={(e) => setFOn({ ...fOn, q: e.target.value })} placeholder={tr('PAN-00003, donor name, DON-… or RCPT-…')} /></div></div>
          <div className="w-[10rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Item type</T></label>
            <Select className="input" value={fOn.category_id} onChange={(e) => setFOn({ ...fOn, category_id: e.target.value })}><option value="">{tr('All')}</option>{tagged.map((x) => <option key={x.id} value={x.id}>{tr(x.name)}</option>)}</Select></div>
          <div className="w-[10rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Location</T></label>
            <Select className="input" value={fOn.location_id} onChange={(e) => setFOn({ ...fOn, location_id: e.target.value })}><option value="">{tr('All')}</option>{locations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}</Select></div>
          <button className="btn-maroon !py-2.5 shrink-0"><Search size={14} />{' '}<T>Apply</T></button>
          <button type="button" onClick={() => applyOn(NO_ON)} className="btn-outline !py-2.5 shrink-0"><RotateCcw size={14} />{' '}<T>Clear</T></button>
        </form>
        </FilterPanel>
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
                  <td className="pl-5 pr-4 py-3 font-mono text-[0.78rem] whitespace-nowrap"><Link className="text-maroon-700 font-semibold hover:underline" to={`/admin/stores/item/${i.tag_id}`}>{i.tag_id}</Link>{i.pieces > 1 && <div className="mt-1"><BundleBadge item={i} /></div>}{i.deity_used && <div className="mt-1"><DeityBadge item={i} /></div>}</td>
                  <td className="px-4 py-3"><div className="font-semibold text-gray-800">{tr(i.description || i.item_name)}</div><div className="text-[0.6875rem] text-gray-500">{[tr(i.item_name), tr(i.details)].filter(Boolean).join(' · ')}</div></td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-maroon-800 whitespace-nowrap">{inr(i.open_sale_price)}{i.pieces > 1 && <div className="text-[0.6875rem] font-normal text-gray-500">{tr('per piece')}</div>}</td>
                  <td className="px-4 py-3 text-[0.8125rem]">{staffName(i.open_sale_by)}<div className="text-[0.6875rem] text-gray-400">{fmtStamp(i.open_sale_at)}</div></td>
                  <td className="px-4 py-3 text-center"><Pill tone={i.unsold_count >= 2 ? 'red' : 'orange'}>×{i.unsold_count}</Pill></td>
                  <td className="px-4 py-3">{tr(i.location || '—')}</td>
                  <td className="px-4 py-3"><div>{personName({ name: i.donor_name }, lang)}</div><div className="text-[0.6875rem] font-mono text-gray-400">{sourceRef(i)}</div></td>
                  <td className="pl-4 pr-5 py-3"><div className="flex gap-1.5 flex-nowrap">
                    {canSell && <button onClick={() => setSelling({ item: i, buyer_name: '', buyer_mobile: '', devotee_id: null, devotee_code: null, mode: 'Cash', txn_ref: '', pieces: String(i.pieces || 1) })} title={tr('Sell')} aria-label={tr('Sell')} className="w-8 h-8 grid place-items-center rounded-lg border border-green-200 text-green-700 hover:bg-green-50"><Banknote size={15} /></button>}
                    {committee && <button onClick={() => changePrice(i)} title={tr('Change price')} aria-label={tr('Change price')} className="w-8 h-8 grid place-items-center rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50"><Pencil size={15} /></button>}
                    {committee && <button onClick={() => back(i)} title={tr('Back to store')} aria-label={tr('Back to store')} className="w-8 h-8 grid place-items-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"><Undo2 size={15} /></button>}
                  </div></td>
                </tr>
              ))}
              {!items.length && <TableStates colSpan={8} loading={loading} error={loadErr} onRetry={load} empty={onFiltered ? tr('No pieces match these filters.') : tr('Nothing on Open Sale. The committee moves unsold pieces here from Unsold Items.')} />}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between"><h3 className="font-serif text-lg font-bold text-maroon-800"><T>Sold in Open Sale</T></h3>
          {sales && <span className="text-[0.8125rem] text-gray-600">{sales.total} {tr('sold')} · <b>{inr(sales.amount)}</b></span>}</div>
        <FilterPanel>
        <form onSubmit={(e) => { e.preventDefault(); applySold(fSold) }} className="px-5 py-4 flex flex-wrap items-end gap-3 border-b border-gray-100">
          <div className="flex-1 min-w-[12rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search receipt, ID or buyer</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input !pl-9" value={fSold.q} onChange={(e) => setFSold({ ...fSold, q: e.target.value })} placeholder={tr('OSR-2026-0001, PAN-00003, name, mobile…')} /></div></div>
          <div className="w-[9rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Payment</T></label>
            <Select className="input" value={fSold.mode} onChange={(e) => setFSold({ ...fSold, mode: e.target.value })}><option value="">{tr('All')}</option><option value="Cash">{tr('Cash')}</option><option value="UPI/QR Code">{tr('Online')}</option></Select></div>
          <div className="w-[9.5rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Sold from</T></label>
            <DateField value={fSold.date_from} max={fSold.date_to || undefined} onChange={(e) => setFSold({ ...fSold, date_from: e.target.value })} className="input" /></div>
          <div className="w-[9.5rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
            <DateField value={fSold.date_to} min={fSold.date_from || undefined} onChange={(e) => setFSold({ ...fSold, date_to: e.target.value })} className="input" /></div>
          <button className="btn-maroon !py-2.5 shrink-0"><Search size={14} />{' '}<T>Apply</T></button>
          <button type="button" onClick={() => applySold(NO_SOLD)} className="btn-outline !py-2.5 shrink-0"><RotateCcw size={14} />{' '}<T>Clear</T></button>
        </form>
        </FilterPanel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              <th className="pl-5 pr-4 py-3 font-semibold">{tr('Receipt')}</th><th className="px-4 py-3 font-semibold">{tr('Piece')}</th>
              <th className="px-4 py-3 font-semibold">{tr('Buyer')}</th><th className="px-4 py-3 font-semibold text-right">{tr('Amount')}</th>
              <th className="px-4 py-3 font-semibold">{tr('Payment')}</th><th className="px-4 py-3 font-semibold">{tr('Sold on')}</th><th className="pl-4 pr-5 py-3"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {(sales?.items || []).map((s) => (
                <tr key={s.id}>
                  <td className="pl-5 pr-4 py-3 font-mono text-[0.78rem]">{s.receipt_no}</td>
                  <td className="px-4 py-3"><Link className="font-mono text-[0.78rem] text-maroon-700 font-semibold hover:underline" to={`/admin/stores/item/${s.tag_id}`}>{s.tag_id}</Link> · {tr(s.item_name)}</td>
                  <td className="px-4 py-3">{personName({ name: s.buyer_name }, lang)}{' '}
                    {s.devotee_code ? <Pill tone="green">{tr('Devotee')} {s.devotee_code}</Pill> : <Pill tone="gray">{tr('Outsider')}</Pill>}
                    {s.buyer_mobile && <div className="text-[0.6875rem] text-gray-400">{s.buyer_mobile}</div>}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{inr(s.amount)}</td>
                  <td className="px-4 py-3"><Pill tone="green">{tr(modeLabel(s.payment_mode))}</Pill>{s.payment_ref && <div className="text-[0.6875rem] text-gray-400 font-mono">{s.payment_ref}</div>}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[0.8125rem]">{fmtStamp(s.sold_at)}<div className="text-[0.6875rem] text-gray-400">{staffName(s.sold_by)}</div></td>
                  <td className="pl-4 pr-5 py-3"><button onClick={() => setReceipt(s)} title={tr('Print receipt')} aria-label={tr('Print receipt')} className="w-8 h-8 grid place-items-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"><ReceiptIcon size={15} /></button></td>
                </tr>
              ))}
              {!(sales?.items || []).length && <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-500">{salesErr ? <span className="text-red-700">{salesErr} <button onClick={loadSales} className="underline font-semibold">{tr('Retry')}</button></span> : !sales ? <T>Loading...</T> : soldFiltered ? <T>No sales match these filters.</T> : <T>No Open Sale yet.</T>}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={salePage} size={SALES_SIZE} total={sales?.total || 0} onPage={setSalePage} unit={tr('sales')} />
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
                <div className="text-lg font-bold text-maroon-700">{inr(selling.item.open_sale_price)}{selling.item.pieces > 1 && <span className="text-[0.75rem] font-normal text-gray-500"> {tr('per piece')}</span>}</div>
                <div className="text-[0.6875rem] text-gray-500">{tr('Price fixed by')} {staffName(selling.item.open_sale_by)}</div>
              </div>
              {selling.item.pieces > 1 && (
                <div><label className="label">{tr('How many?')} (1 – {selling.item.pieces}) *</label>
                  <input type="number" required min="1" max={selling.item.pieces} step="1" className="input" value={selling.pieces} onChange={(e) => setSelling({ ...selling, pieces: e.target.value })} /></div>
              )}
              {/* one box: a devotee picked from the suggestions, or an outsider (2026-11-27) */}
              <BuyerField value={selling} mobileRequired={false} onChange={(patch) => setSelling((x) => ({ ...x, ...patch }))} />
              <div><label className="label"><T>Payment Mode *</T></label>
                <Select className="input" value={selling.mode} onChange={(e) => setSelling({ ...selling, mode: e.target.value })}>
                  <option value="Cash">{tr('Cash')}</option><option value="UPI/QR Code">{tr('Online')}</option></Select></div>
              {selling.mode === 'UPI/QR Code' && <div><label className="label"><T>UTR / Transaction Reference *</T></label><input required minLength={6} maxLength={40} pattern="[A-Za-z0-9]{6,40}" className="input font-mono" value={selling.txn_ref} onChange={(e) => setSelling({ ...selling, txn_ref: e.target.value.replace(/[^A-Za-z0-9]/g, '') })} placeholder={tr('Online transaction ID / UTR')} />
                <div className="text-[0.6875rem] text-gray-400 mt-1"><T>6–40 letters and digits, as on the payment.</T></div></div>}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => setSelling(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button type="submit" className="btn-maroon flex-1 justify-center"><Banknote size={15} className="mr-1" />{tr('Sell for')} {inr(Number(selling.item.open_sale_price) * sellCount(selling))}</button>
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
                <div className="font-serif text-lg font-bold text-maroon-800">{lang === 'te' ? (temple?.nameTelugu || 'శ్రీ షిర్డీ సాయిబాబా దేవస్థానం') : (temple?.name || 'Shri Shirdi Sai Baba Temple')}</div>
                {lang !== 'te' && <div className="text-sm text-gray-600">{temple?.nameTelugu || 'శ్రీ షిర్డీ సాయిబాబా దేవస్థానం'}</div>}
                <div className="font-semibold text-gray-800 mt-2"><T>Open Sale Receipt</T></div>
                <div className="text-[0.75rem] text-gray-500">{fmtDate(receipt.sold_at)}</div>
              </div>
              <div className="space-y-2 text-[0.875rem]">
                {[[tr('Receipt No'), receipt.receipt_no], [tr('Item'), `${receipt.tag_id} · ${tr(receipt.item_name)}`], [tr('Buyer'), personName({ name: receipt.buyer_name }, lang) + (receipt.devotee_code ? ` (${receipt.devotee_code})` : '')],
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
