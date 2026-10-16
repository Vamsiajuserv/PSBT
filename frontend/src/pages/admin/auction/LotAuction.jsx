import React, { useEffect, useMemo, useState } from 'react'
import { X, Plus, Trash2, Search, Banknote, Receipt as ReceiptIcon, Gavel } from 'lucide-react'
import { AuctionAPI, StoresAPI, getErrorMessage } from '../../../api/client.js'
import { Pill, inr } from '../../../components/admin/ui.jsx'
import { Select, NumberField, DateField, TimeField, Checkbox } from '../../../components/common/Field.jsx'
import { toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang } from '../../../i18n/LanguageContext.jsx'

// Lot auctions: a set of tagged pieces from the Stock Register, sold to one or more buyers.
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const to12h = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
const sortTags = (tags) => [...tags].sort()
export const tagRange = (tags) => {
  const t = sortTags(tags)
  return !t.length ? '' : t.length === 1 ? t[0] : `${t[0]} … ${t[t.length - 1]} (${t.length})`
}
/** What a lot buyer pays — shaped like an auction so the existing payment modal and receipt work. */
export const saleAsPayable = (au, sale) => ({
  id: au.id, saleId: sale.id, code: au.code,
  item: `${au.item} — ${tagRange(au.pieces.filter((p) => p.sale_id === sale.id).map((p) => p.tag_id))}`,
  winner: sale.buyer_name, current_amount: sale.amount, receipt_no: sale.receipt_no, payment_mode: sale.payment_mode,
  payment_ref: sale.payment_ref, paid_at: sale.paid_at, payment_status: sale.payment_status,
})
export const lotPaidCount = (au) => (au.sales || []).filter((s) => s.payment_status === 'Paid').length

// ── Create an auction from stock ─────────────────────────────────────────────
// preset: { category_id, piece_ids, base_price } — opened from Unsold Items to re-auction them
export function StockAuctionDrawer({ onClose, onCreated, preset }) {
  const [cats, setCats] = useState([])
  const [catId, setCatId] = useState(preset ? String(preset.category_id) : '')
  const [pieces, setPieces] = useState([])
  const [picked, setPicked] = useState({})
  const [q, setQ] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })
  const [f, setF] = useState({ base_price: preset?.base_price ? String(preset.base_price) : '', auction_date: todayISO(), start_time: '', description: '',
    notes: preset ? tr('Re-auction of unsold items') : '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => { StoresAPI.categories().then((r) => setCats((r.items || []).filter((c) => c.tracking === 'Tagged' && c.auctionable !== false))).catch(() => setCats([])) }, [])
  useEffect(() => {
    setPicked({}); setPieces([])
    if (!catId) return
    StoresAPI.items({ category_id: catId, status: 'In Store', size: 200 })
      .then((r) => {
        const list = (r.items || []).sort((a, b) => a.tag_id.localeCompare(b.tag_id))
        setPieces(list)
        if (preset && String(preset.category_id) === String(catId)) {
          setPicked(Object.fromEntries(preset.piece_ids.filter((id) => list.some((p) => p.id === id)).map((id) => [id, true])))
        }
      }).catch(() => setPieces([]))
  }, [catId])
  const needle = q.trim().toLowerCase()
  const shown = needle ? pieces.filter((p) => `${p.tag_id} ${p.description || ''} ${p.donor_name || ''} ${p.location || ''}`.toLowerCase().includes(needle)) : pieces
  const chosen = pieces.filter((p) => picked[p.id])
  const pickRange = () => {
    const a = range.from.trim().toUpperCase(), b = range.to.trim().toUpperCase() || a
    const hit = pieces.filter((p) => p.tag_id >= a && p.tag_id <= b)
    if (!hit.length) { toast(tr('No pieces in store between those IDs.'), 'error'); return }
    setPicked((x) => ({ ...x, ...Object.fromEntries(hit.map((p) => [p.id, true])) }))
  }
  async function save(e) {
    e.preventDefault()
    if (!chosen.length) { toast(tr('Pick at least one piece.'), 'error'); return }
    setSaving(true)
    try {
      const au = await AuctionAPI.createStock({
        category_id: Number(catId), piece_ids: chosen.map((p) => p.id), base_price: Number(f.base_price),
        auction_date: f.auction_date, start_time: to12h(f.start_time), description: f.description || null, notes: f.notes || null,
      })
      toast(`${au.code}: ${chosen.length} ${tr('pieces put in auction')}`)
      onCreated?.(au)
    } catch (ex) { toast(errText(ex, 'Could not create the auction.'), 'error') }
    finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form onSubmit={save} className="relative w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
          <div><h3 className="font-serif text-xl font-bold text-maroon-800">{preset ? <T>Re-auction Unsold Items</T> : <T>Auction from Stock</T>}</h3>
            <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Pick tagged pieces from the store. They show as In Auction until the result is approved.</T></p></div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={20} /></button>
        </div>
        <div className="px-6 py-5 space-y-4 flex-1">
          <div><label className="label"><T>Item type *</T></label>
            <Select required className="input" value={catId} onChange={(e) => setCatId(e.target.value)}>
              <option value="">{tr('Select')}</option>{cats.map((c) => <option key={c.id} value={c.id}>{tr(c.name)} ({c.id_prefix})</option>)}
            </Select></div>
          {catId && (
            <div className="border border-gray-200 rounded-lg">
              <div className="flex flex-wrap items-end gap-2 p-3 border-b border-gray-100 bg-gray-50/60">
                <div className="flex-1 min-w-[10rem] relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className="input !pl-8 !py-1.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search ID, description, donor…')} /></div>
                <input className="input !py-1.5 !w-[8rem] font-mono uppercase" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} placeholder="PAN-00001" aria-label={tr('From ID')} />
                <input className="input !py-1.5 !w-[8rem] font-mono uppercase" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} placeholder="PAN-00010" aria-label={tr('To ID')} />
                <button type="button" onClick={pickRange} className="btn-outline !py-1.5 !px-3 text-[0.78rem]"><T>Pick range</T></button>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                {shown.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-[0.8125rem] cursor-pointer hover:bg-gray-50">
                    <Checkbox checked={!!picked[p.id]} onChange={() => setPicked((x) => ({ ...x, [p.id]: !x[p.id] }))} />
                    <span className="font-mono font-semibold text-maroon-700 w-24 shrink-0">{p.tag_id}</span>
                    <span className="flex-1 min-w-0 truncate">{tr(p.description || p.item_name)}{p.weight_g ? ` · ${p.weight_g} g` : ''}</span>
                    <span className="text-[0.75rem] text-gray-500 shrink-0">{p.location}{p.est_value != null ? ` · ${inr(p.est_value)}` : ''}</span>
                  </label>
                ))}
                {!pieces.length && <div className="px-3 py-6 text-center text-[0.8125rem] text-gray-500"><T>No pieces of this type are in store.</T></div>}
              </div>
              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 text-[0.78rem]">
                <span><b>{chosen.length}</b> {tr('picked')}{chosen.length ? `: ${tagRange(chosen.map((p) => p.tag_id))}` : ''}</span>
                <span className="flex gap-3">
                  <button type="button" className="text-maroon-700 font-semibold" onClick={() => setPicked(Object.fromEntries(shown.map((p) => [p.id, true])))}><T>Pick all shown</T></button>
                  <button type="button" className="text-gray-500" onClick={() => setPicked({})}><T>Clear</T></button>
                </span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label"><T>Base price per piece (₹) *</T></label>
              <NumberField required min="1" step="1" prefix="₹" value={f.base_price} onChange={(e) => setF({ ...f, base_price: e.target.value })} />
              {chosen.length > 0 && f.base_price && <div className="text-[0.6875rem] text-gray-500 mt-1">{tr('Lot base')}: {inr(Number(f.base_price) * chosen.length)}</div>}</div>
            <div><label className="label"><T>Auction Date *</T></label>
              <DateField required min={todayISO()} value={f.auction_date} onChange={(e) => setF({ ...f, auction_date: e.target.value })} /></div>
            <div><label className="label"><T>Start Time *</T></label>
              <TimeField required value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></div>
            <div><label className="label"><T>Notes (Optional)</T></label>
              <input className="input" maxLength={250} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            <div className="col-span-2"><label className="label"><T>Description (Optional)</T></label>
              <input className="input" maxLength={250} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={tr('e.g. Silk border panchas, white')} /></div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
          <button type="button" onClick={onClose} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
          <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60">{saving ? tr('Saving…') : `${tr('Create Auction')} (${chosen.length})`}</button>
        </div>
      </form>
    </div>
  )
}

// ── Record the result of a lot: one line per buyer ───────────────────────────
const blankLine = () => ({ buyer_name: '', buyer_mobile: '', piece_ids: [], amount: '' })

export function LotResultModal({ auction, onClose, onSaved }) {
  const [lines, setLines] = useState(() => {
    const prev = (auction.sales || []).map((s) => ({ buyer_name: s.buyer_name, buyer_mobile: s.buyer_mobile || '',
      piece_ids: auction.pieces.filter((p) => p.sale_id === s.id).map((p) => p.id), amount: String(Number(s.amount)) }))
    return prev.length ? prev : [blankLine()]
  })
  const [bids, setBids] = useState(String(auction.bids ?? 0))
  const [saving, setSaving] = useState(false)
  const byId = useMemo(() => Object.fromEntries(auction.pieces.map((p) => [p.id, p])), [auction])
  const taken = (exceptLine) => new Set(lines.flatMap((l, i) => (i === exceptLine ? [] : l.piece_ids)))
  const unsold = auction.pieces.filter((p) => !lines.some((l) => l.piece_ids.includes(p.id)))
  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  // Functional update: quick taps on several chips must each count (no stale `lines`)
  const toggle = (i, pid) => setLines((ls) => ls.map((l, j) => (j !== i ? l
    : { ...l, piece_ids: l.piece_ids.includes(pid) ? l.piece_ids.filter((x) => x !== pid) : [...l.piece_ids, pid] })))
  const base = (l) => l.piece_ids.reduce((s, pid) => s + Number(byId[pid]?.base_price || 0), 0)
  const used = lines.filter((l) => l.buyer_name.trim() || l.piece_ids.length || l.amount)

  async function save(e) {
    e.preventDefault()
    const bad = used.findIndex((l) => !l.buyer_name.trim() || !l.piece_ids.length || !(Number(l.amount) > 0))
    if (bad >= 0) { toast(`${tr('Buyer')} ${bad + 1}: ${tr('enter the name, pick pieces and the amount.')}`, 'error'); return }
    setSaving(true)
    try {
      await AuctionAPI.lotResult(auction.id, {
        bids: Number(bids) || 0,
        lines: used.map((l) => ({ buyer_name: l.buyer_name.trim(), buyer_mobile: l.buyer_mobile.trim() || null, piece_ids: l.piece_ids, amount: Number(l.amount) })),
      })
      toast(used.length ? tr('Result recorded — sent to the committee for approval.') : tr('Recorded as unsold — sent to the committee for approval.'))
      onSaved?.()
    } catch (ex) { toast(errText(ex, 'Could not record the result.'), 'error') }
    finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form onSubmit={save} className="relative w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
          <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Record Result</T></h3>
            <p className="text-[0.8125rem] text-gray-500 mt-0.5">{auction.code} · {tr(auction.item)} · {tr('base')} {inr(auction.pieces[0]?.base_price)} {tr('each')}</p></div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={20} /></button>
        </div>
        <div className="px-6 py-5 space-y-4 flex-1">
          {auction.verification_status === 'Rejected' && auction.rejection_reason && (
            <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-[0.8125rem] text-red-700"><b><T>Rejected</T>:</b> {auction.rejection_reason}</div>
          )}
          {lines.map((l, i) => {
            const avail = auction.pieces.filter((p) => !taken(i).has(p.id)).sort((a, b) => a.tag_id.localeCompare(b.tag_id))
            const reserve = base(l)
            return (
              <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between"><span className="text-[0.8125rem] font-semibold text-maroon-700">{tr('Buyer')} {i + 1}</span>
                  {lines.length > 1 && <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-red-500" aria-label={tr('Remove buyer')} title={tr('Remove buyer')}><Trash2 size={15} /></button>}</div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="label"><T>Buyer name *</T></label><input className="input" maxLength={120} value={l.buyer_name} onChange={(e) => setLine(i, { buyer_name: e.target.value })} /></div>
                  <div><label className="label"><T>Mobile</T></label><input className="input" inputMode="numeric" maxLength={10} value={l.buyer_mobile} onChange={(e) => setLine(i, { buyer_mobile: e.target.value.replace(/\D/g, '') })} /></div>
                  <div><label className="label"><T>Amount (₹) *</T></label><NumberField min="0" step="1" prefix="₹" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} /></div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {avail.map((p) => (
                    <button type="button" key={p.id} onClick={() => toggle(i, p.id)}
                      className={`px-2 py-1 rounded-md border font-mono text-[0.72rem] ${l.piece_ids.includes(p.id) ? 'bg-maroon-700 text-cream border-maroon-700' : 'border-gray-200 text-gray-700 hover:border-maroon-300'}`}>{p.tag_id}</button>
                  ))}
                </div>
                <div className={`text-[0.72rem] ${l.amount && Number(l.amount) < reserve ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                  {l.piece_ids.length} {tr('piece(s)')} · {tr('base')} {inr(reserve)}{l.amount && Number(l.amount) < reserve ? ` — ${tr('amount is below the base')}` : ''}</div>
              </div>
            )
          })}
          <button type="button" onClick={() => setLines((ls) => [...ls, blankLine()])} disabled={!unsold.length} className="text-[0.8125rem] font-semibold text-maroon-700 inline-flex items-center gap-1 disabled:opacity-40"><Plus size={14} /><T>Add buyer</T></button>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label"><T>No. of Bidders</T></label><NumberField min="0" step="1" value={bids} onChange={(e) => setBids(e.target.value)} /></div>
          </div>
          <div className="bg-amber-50/70 border border-amber-100 rounded-lg px-3 py-2.5 text-[0.8125rem] text-gray-700">
            <b>{tr('Unsold')}: {unsold.length}</b>{unsold.length ? ` — ${tagRange(unsold.map((p) => p.tag_id))}` : ''}
            <div className="text-[0.75rem] text-gray-500 mt-0.5"><T>Unsold pieces go back to their store location when the committee approves this result.</T></div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
          <button type="button" onClick={onClose} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
          <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60"><Gavel size={15} className="mr-1" />{saving ? tr('Saving…') : <T>Save Result</T>}</button>
        </div>
      </form>
    </div>
  )
}

// ── Buyers & payments of a lot ───────────────────────────────────────────────
export function LotBuyersModal({ auction, canCollect, onCollect, onReceipt, onClose }) {
  const { lang } = useLang()
  const approved = auction.status === 'Completed' && auction.verification_status === 'Verified'
  const unsold = auction.pieces.filter((p) => p.result !== 'Sold')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
          <div><h3 className="font-serif text-lg font-bold text-maroon-800"><T>Buyers & Payments</T></h3>
            <div className="text-[0.75rem] text-gray-500">{auction.code} · {tr(auction.item)} · {lotPaidCount(auction)} / {auction.sales.length} {tr('paid')}</div></div>
          <button onClick={onClose} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={18} /></button>
        </div>
        <div className="overflow-y-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              <th className="px-4 py-2.5 font-semibold">{tr('Buyer')}</th><th className="px-4 py-2.5 font-semibold">{tr('Pieces')}</th>
              <th className="px-4 py-2.5 font-semibold text-right">{tr('Amount')}</th><th className="px-4 py-2.5 font-semibold">{tr('Payment')}</th><th className="px-4 py-2.5"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {auction.sales.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5"><div className="font-semibold text-gray-800">{personName({ name: s.buyer_name }, lang)}</div>{s.buyer_mobile && <div className="text-[0.6875rem] text-gray-400">{s.buyer_mobile}</div>}</td>
                  <td className="px-4 py-2.5 font-mono text-[0.72rem] text-gray-600">{auction.pieces.filter((p) => p.sale_id === s.id).map((p) => p.tag_id).sort().join(', ')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{inr(s.amount)}</td>
                  <td className="px-4 py-2.5"><Pill tone={s.payment_status === 'Paid' ? 'green' : 'amber'}>{tr(s.payment_status)}</Pill>
                    {s.payment_status === 'Paid' && <div className="text-[0.6875rem] text-gray-500 mt-0.5">{tr(s.payment_mode === 'UPI/QR Code' ? 'Online' : s.payment_mode)} · {s.receipt_no}</div>}</td>
                  <td className="px-4 py-2.5"><div className="flex gap-1.5 justify-end">
                    {canCollect && approved && s.payment_status !== 'Paid' && <button onClick={() => onCollect(saleAsPayable(auction, s))} title={tr('Collect payment')} aria-label={tr('Collect payment')} className="w-8 h-8 grid place-items-center rounded-lg border border-green-200 text-green-700 hover:bg-green-50"><Banknote size={15} /></button>}
                    {s.payment_status === 'Paid' && <button onClick={() => onReceipt(saleAsPayable(auction, s))} title={tr('Print receipt')} aria-label={tr('Print receipt')} className="w-8 h-8 grid place-items-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"><ReceiptIcon size={15} /></button>}
                  </div></td>
                </tr>
              ))}
              {!auction.sales.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500"><T>No buyers — the whole lot is unsold.</T></td></tr>}
            </tbody>
          </table>
          {unsold.length > 0 && auction.sales.length > 0 && (
            <div className="px-4 py-3 text-[0.8125rem] text-gray-600 border-t border-gray-100"><b>{tr('Unsold')}</b> ({unsold.length}): <span className="font-mono text-[0.72rem]">{unsold.map((p) => p.tag_id).sort().join(', ')}</span>
              {approved && <span className="text-gray-500"> — {tr('back in store; put them in a new auction from stock.')}</span>}</div>
          )}
          {!approved && <div className="px-4 py-3 text-[0.75rem] text-amber-700 border-t border-gray-100"><T>Payment can be collected after the committee approves the result.</T></div>}
        </div>
      </div>
    </div>
  )
}
