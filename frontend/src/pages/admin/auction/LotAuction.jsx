import React, { useEffect, useMemo, useState } from 'react'
import { X, Plus, Trash2, Search, Banknote, Receipt as ReceiptIcon, Gavel, PackageX } from 'lucide-react'
import { AuctionAPI, StoresAPI, SettingsAPI, getErrorMessage } from '../../../api/client.js'
import { Pill, inr } from '../../../components/admin/ui.jsx'
import { Select, NumberField, DateField, TimeField, Checkbox } from '../../../components/common/Field.jsx'
import { toast, confirmDialog, promptDialog } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang, gramUnit, teTerm } from '../../../i18n/LanguageContext.jsx'
import { DeityBadge, BundleBadge, HowMany } from '../stores/shared.jsx'
// a lot line from a bundle carries several pieces: "PAN-00041/2 ×5" (2026-11-27)
const lineTag = (p) => (p.pieces > 1 ? `${p.tag_id} ×${p.pieces}` : p.tag_id)
const piecesOf = (list) => list.reduce((n, p) => n + (p.pieces || 1), 0)
import ResetButton from '../../../components/common/ResetButton.jsx'
import BuyerField, { MOBILE_OK, NAME_OK } from '../../../components/admin/BuyerField.jsx'

// Lot auctions: a set of tagged pieces from the Stock Register, sold to one or more buyers.
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const addDaysISO = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
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
  winner: sale.devotee_code ? `${sale.buyer_name} (${sale.devotee_code})` : sale.buyer_name, current_amount: sale.amount, receipt_no: sale.receipt_no, payment_mode: sale.payment_mode,
  payment_ref: sale.payment_ref, paid_at: sale.paid_at, payment_status: sale.payment_status,
})
export const lotPaidCount = (au) => (au.sales || []).filter((s) => s.payment_status === 'Paid').length

// ── Create an auction from stock ─────────────────────────────────────────────
// preset: { category_id, piece_ids, base_price, title?, notes? } — opened from Unsold Items to re-auction them,
// or from Deity-Used Items to auction those pieces first
export function StockAuctionDrawer({ onClose, onCreated, preset }) {
  // Auctions are planned up to the Advance Booking window ahead (Settings, 90 days by default)
  const [maxDate, setMaxDate] = useState(() => addDaysISO(todayISO(), 90))
  useEffect(() => { SettingsAPI.config().then((c) => { if (Number.isInteger(c?.advance_booking_max_days)) setMaxDate(addDaysISO(todayISO(), c.advance_booking_max_days)) }).catch(() => {}) }, [])
  const [cats, setCats] = useState([])
  // starting values (also used by Reset)
  const startCat = preset ? String(preset.category_id) : ''
  const startF = () => ({ base_price: preset?.base_price ? String(preset.base_price) : '', auction_date: todayISO(), start_time: '', description: '',
    notes: preset ? (preset.notes ?? tr('Re-auction of unsold items')) : '' })
  const presetPicks = (list) => Object.fromEntries(preset.piece_ids.filter((id) => list.some((p) => p.id === id)).map((id) => [id, true]))
  const [catId, setCatId] = useState(startCat)
  const [pieces, setPieces] = useState([])
  const [picked, setPicked] = useState({})
  const [howMany, setHowMany] = useState({})     // bundles: how many of their pieces go in the lot
  const [q, setQ] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })
  const [count, setCount] = useState('')
  const [f, setF] = useState(startF)
  const [saving, setSaving] = useState(false)
  useEffect(() => { StoresAPI.categories().then((r) => setCats((r.items || []).filter((c) => c.tracking === 'Tagged' && c.auctionable !== false))).catch(() => setCats([])) }, [])
  useEffect(() => {
    setPicked({}); setPieces([])
    if (!catId) return
    // Deity-Used pieces come first: they are offered at auction before the others
    StoresAPI.items({ category_id: catId, status: 'In Store', size: 200, order: 'deity_first' })
      .then((r) => {
        const list = (r.items || []).filter((p) => !(p.bundle && p.pieces < 1)).sort((a, b) => (b.deity_used ? 1 : 0) - (a.deity_used ? 1 : 0) || a.tag_id.localeCompare(b.tag_id))
        setPieces(list)
        if (preset && String(preset.category_id) === String(catId)) {
          setPicked(presetPicks(list))
        }
      }).catch(() => setPieces([]))
  }, [catId])
  const needle = q.trim().toLowerCase()
  const shown = needle ? pieces.filter((p) => `${p.tag_id} ${p.description || ''} ${p.donor_name || ''} ${p.location || ''}`.toLowerCase().includes(needle)) : pieces
  const chosen = pieces.filter((p) => picked[p.id])
  const nOf = (p) => (p.bundle ? Math.round(Number(howMany[p.id] ?? p.pieces)) || 0 : 1)
  const chosenPieces = chosen.reduce((n, p) => n + nOf(p), 0)
  const pickRange = () => {
    const a = range.from.trim().toUpperCase(), b = range.to.trim().toUpperCase() || a
    const hit = pieces.filter((p) => p.tag_id >= a && p.tag_id <= b)
    if (!hit.length) { toast(tr('No pieces in store between those IDs.'), 'error'); return }
    setPicked((x) => ({ ...x, ...Object.fromEntries(hit.map((p) => [p.id, true])) }))
  }
  // Pick N: Deity-Used pieces first; if there are not enough, the rest from the other pieces
  const deityCount = pieces.filter((p) => p.deity_used).length
  const pickCount = () => {
    const n = Math.floor(Number(count))
    if (!(n > 0)) { toast(tr('Enter how many pieces to pick.'), 'error'); return }
    const hit = pieces.slice(0, n)
    setPicked(Object.fromEntries(hit.map((p) => [p.id, true])))
    const d = hit.filter((p) => p.deity_used).length
    toast(`${hit.length} ${tr('picked')}: ${d} ${tr('Deity-Used')} + ${hit.length - d} ${tr('other')}${n > pieces.length ? ` — ${tr('only these are in store')}` : ''}`)
  }
  // Reset (client, 2026-11-20): back to the drawer's opening values (picked pieces too; a changed type reloads its pieces)
  const reset = () => {
    setQ(''); setRange({ from: '', to: '' }); setCount(''); setF(startF()); setHowMany({})
    if (catId === startCat) setPicked(preset && startCat ? presetPicks(pieces) : {})
    else setCatId(startCat)
  }
  async function save(e) {
    e.preventDefault()
    if (!chosen.length) { toast(tr('Pick at least one piece.'), 'error'); return }
    const badN = chosen.find((p) => p.bundle && !(nOf(p) >= 1 && nOf(p) <= p.pieces))
    if (badN) { toast(`${badN.tag_id}: ${tr('enter how many pieces — 1 to')} ${badN.pieces}.`, 'error'); return }
    if (maxDate && f.auction_date > maxDate) { toast(tr('The auction date is too far ahead.'), 'error'); return }
    setSaving(true)
    try {
      const au = await AuctionAPI.createStock({
        category_id: Number(catId), piece_ids: chosen.map((p) => p.id), base_price: Number(f.base_price),
        pieces: Object.fromEntries(chosen.filter((p) => p.bundle).map((p) => [p.id, nOf(p)])),
        auction_date: f.auction_date, start_time: to12h(f.start_time), description: f.description || null, notes: f.notes || null,
      })
      toast(`${au.code}: ${chosenPieces} ${tr('pieces put in auction')}`)
      onCreated?.(au)
    } catch (ex) { toast(errText(ex, 'Could not create the auction.'), 'error') }
    finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form onSubmit={save} className="relative w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
          <div><h3 className="font-serif text-xl font-bold text-maroon-800">{preset ? (preset.title || <T>Re-auction Unsold Items</T>) : <T>Auction from Stock</T>}</h3>
            <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Pick tagged pieces from the store. They show as In Auction until the result is recorded. The committee approves the auction first.</T></p></div>
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
                <input type="number" min="1" className="input !py-1.5 !w-[5rem]" value={count} onChange={(e) => setCount(e.target.value)} placeholder="10" aria-label={tr('How many')} />
                <button type="button" onClick={pickCount} title={tr('Deity-Used pieces first, then the others')} className="btn-outline !py-1.5 !px-3 text-[0.78rem]"><T>Pick count</T></button>
              </div>
              {deityCount > 0 && <div className="px-3 py-1.5 text-[0.75rem] bg-amber-50 text-amber-800 border-b border-amber-100">{deityCount} {tr('Deity-Used piece(s) are listed first — offer them first.')}</div>}
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                {shown.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-[0.8125rem] cursor-pointer hover:bg-gray-50">
                    <Checkbox checked={!!picked[p.id]} onChange={() => setPicked((x) => ({ ...x, [p.id]: !x[p.id] }))} />
                    <span className="font-mono font-semibold text-maroon-700 w-24 shrink-0">{p.tag_id}</span>
                    <span className="flex-1 min-w-0 truncate">{tr(p.description || p.item_name)}{p.weight_g ? ` · ${p.weight_g} ${gramUnit()}` : ''}</span>
                    {picked[p.id] && p.bundle ? <HowMany item={p} value={howMany[p.id] ?? String(p.pieces)} onChange={(v) => setHowMany((h) => ({ ...h, [p.id]: v }))} /> : <BundleBadge item={p} />}
                    <DeityBadge item={p} />
                    <span className="text-[0.75rem] text-gray-500 shrink-0">{teTerm(p.location)}{p.est_value != null ? ` · ${inr(p.est_value)}` : ''}</span>
                  </label>
                ))}
                {!pieces.length && <div className="px-3 py-6 text-center text-[0.8125rem] text-gray-500"><T>No pieces of this type are in store.</T></div>}
              </div>
              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 text-[0.78rem]">
                <span><b>{chosenPieces}</b> {tr('picked')}{chosen.length ? `: ${tagRange(chosen.map((p) => p.tag_id))}` : ''}</span>
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
              {chosen.length > 0 && f.base_price && <div className="text-[0.6875rem] text-gray-500 mt-1">{tr('Lot base')}: {inr(Number(f.base_price) * chosenPieces)}</div>}</div>
            <div><label className="label"><T>Auction Date *</T></label>
              <DateField required min={todayISO()} max={maxDate} value={f.auction_date} onChange={(e) => setF({ ...f, auction_date: e.target.value })} /></div>
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
          <ResetButton onReset={reset} disabled={saving} className="justify-center !px-3 shrink-0" />
          <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60">{saving ? tr('Saving…') : `${tr('Create Auction')} (${chosenPieces})`}</button>
        </div>
      </form>
    </div>
  )
}

// ── Record the result of a lot: one line per buyer ───────────────────────────
// piece_ids: the items this buyer takes — a new line starts with every item nobody has yet (2026-11-27)
const blankLine = (pieceIds = []) => ({ buyer_name: '', buyer_mobile: '', devotee_id: null, devotee_code: null, piece_ids: pieceIds, amount: '' })

export function LotResultModal({ auction, onClose, onSaved }) {
  // starting lines: the result saved so far, or one empty buyer line (also used by Reset)
  const startLines = () => {
    const prev = (auction.sales || []).map((s) => ({ buyer_name: s.buyer_name, buyer_mobile: s.buyer_mobile || '',
      devotee_id: s.devotee_id || null, devotee_code: s.devotee_code || null,
      piece_ids: auction.pieces.filter((p) => p.sale_id === s.id).map((p) => p.id), amount: String(Number(s.amount)) }))
    return prev.length ? prev : [blankLine(auction.pieces.map((p) => p.id))]      // one buyer: the whole lot, ticked
  }
  const [lines, setLines] = useState(startLines)
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
  // a line left completely empty is ignored; an item ticked on a line counts as filled in only with a buyer or amount
  const used = lines.filter((l) => l.buyer_name.trim() || l.buyer_mobile.trim() || l.amount || l.devotee_id)

  async function submit(sold) {
    setSaving(true)
    try {
      await AuctionAPI.lotResult(auction.id, {
        bids: Number(bids) || 0,
        lines: sold.map((l) => ({ buyer_name: l.buyer_name.trim(), buyer_mobile: l.buyer_mobile.trim() || null, devotee_id: l.devotee_id || null, piece_ids: l.piece_ids, amount: Number(l.amount) })),
      })
      toast(sold.length ? tr('Result recorded.') : tr('Recorded as unsold — the pieces are back in their store.'))
      onSaved?.()
    } catch (ex) { toast(errText(ex, 'Could not record the result.'), 'error') }
    finally { setSaving(false) }
  }

  async function save(e) {
    e.preventDefault()
    // A blank form is no longer saved silently as unsold — that is the Unsold button's job
    if (!used.length) { toast(tr('Enter the buyer for the pieces sold, or click Unsold if nothing was sold.'), 'error'); return }
    const no = (k) => `${tr('Buyer')} ${lines.indexOf(used[k]) + 1}`
    const noName = used.findIndex((l) => !NAME_OK(l.buyer_name))
    if (noName >= 0) { toast(`${no(noName)}: ${tr("enter the buyer's name — it goes on the receipt.")}`, 'error'); return }
    const noMob = used.findIndex((l) => !MOBILE_OK.test(l.buyer_mobile))
    if (noMob >= 0) { toast(`${no(noMob)}: ${tr("enter the buyer's 10-digit mobile number.")}`, 'error'); return }
    const noItems = used.findIndex((l) => !l.piece_ids.length)
    if (noItems >= 0) { toast(`${no(noItems)}: ${tr('no items — tick the items this buyer took.')}`, 'error'); return }
    const noAmt = used.findIndex((l) => !(Number(l.amount) > 0))
    if (noAmt >= 0) { toast(`${no(noAmt)}: ${tr('enter the amount.')}`, 'error'); return }
    await submit(used)
  }

  // Nothing sold: the whole lot goes back to the store at once
  async function markUnsold() {
    const n = piecesOf(auction.pieces)
    const ok = await confirmDialog({
      title: tr('Mark whole lot unsold?'), confirmLabel: tr('Mark Unsold'),
      message: `${n} ${tr('piece(s)')} (${tagRange(auction.pieces.map((p) => p.tag_id))}) ${tr('will go back to their store location and appear in Unsold Items.')}`
        + (used.length ? `\n\n${tr('The buyer details entered here will be cleared.')}` : ''),
    })
    if (ok) await submit([])
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
            <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-[0.8125rem] text-red-700"><b><T>Rejected</T>:</b> {tr(auction.rejection_reason)}</div>
          )}
          {lines.map((l, i) => {
            const avail = auction.pieces.filter((p) => !taken(i).has(p.id)).sort((a, b) => a.tag_id.localeCompare(b.tag_id))
            const reserve = base(l)
            return (
              <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between"><span className="text-[0.8125rem] font-semibold text-maroon-700">{tr('Buyer')} {i + 1}</span>
                  {lines.length > 1 && <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-red-500" aria-label={tr('Remove buyer')} title={tr('Remove buyer')}><Trash2 size={15} /></button>}</div>
                {/* one box: a devotee picked from the suggestions, or an outsider (2026-11-27) */}
                <BuyerField value={l} onChange={(patch) => setLine(i, patch)} />
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="label"><T>Amount (₹) *</T></label><NumberField min="0" step="1" prefix="₹" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} /></div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {avail.map((p) => (
                    <button type="button" key={p.id} onClick={() => toggle(i, p.id)}
                      className={`px-2 py-1 rounded-md border font-mono text-[0.72rem] ${l.piece_ids.includes(p.id) ? 'bg-maroon-700 text-cream border-maroon-700' : 'border-gray-200 text-gray-700 hover:border-maroon-300'}`}>{lineTag(p)}</button>
                  ))}
                </div>
                <div className={`text-[0.72rem] ${l.amount && Number(l.amount) < reserve ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                  {piecesOf(l.piece_ids.map((pid) => byId[pid] || {}))} {tr('piece(s)')} · {tr('base')} {inr(reserve)}{l.amount && Number(l.amount) < reserve ? ` — ${tr('amount is below the base')}` : ''}</div>
              </div>
            )
          })}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setLines((ls) => [...ls, blankLine(unsold.map((p) => p.id))])} disabled={!unsold.length}
              className="text-[0.8125rem] font-semibold text-maroon-700 inline-flex items-center gap-1 disabled:opacity-40"><Plus size={14} /><T>Add buyer</T></button>
            {!unsold.length && auction.pieces.length > 0 && <span className="text-[0.75rem] text-gray-500">{tr('All items are with a buyer — untick one first.')}</span>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label"><T>No. of Bidders</T></label><NumberField min="0" step="1" value={bids} onChange={(e) => setBids(e.target.value)} /></div>
          </div>
          <div className="bg-amber-50/70 border border-amber-100 rounded-lg px-3 py-2.5 text-[0.8125rem] text-gray-700">
            <b>{tr('Unsold')}: {piecesOf(unsold)}</b>{unsold.length ? ` — ${tagRange(unsold.map((p) => p.tag_id))}` : ''}
            <div className="text-[0.75rem] text-gray-500 mt-0.5"><T>Unsold pieces go back to their store location when you save. You can correct the result until a buyer pays.</T></div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
          <button type="button" onClick={onClose} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
          {/* Reset (client, 2026-11-20): back to this lot's opening values */}
          <ResetButton onReset={() => { setLines(startLines()); setBids(String(auction.bids ?? 0)) }} disabled={saving} className="justify-center !px-3 shrink-0" />
          <button type="button" onClick={markUnsold} disabled={saving} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 text-orange-700 font-semibold text-sm px-4 py-2 hover:bg-orange-100 disabled:opacity-60"><PackageX size={15} /><T>Unsold</T></button>
          <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60"><Gavel size={15} className="mr-1" />{saving ? tr('Saving…') : <T>Save Result</T>}</button>
        </div>
      </form>
    </div>
  )
}

// ── Buyers & payments of a lot ───────────────────────────────────────────────
export function LotBuyersModal({ auction, canCollect, isAdmin, onCollect, onReceipt, onChanged, onClose }) {
  const { lang } = useLang()
  // Administrator: this buyer never paid — their purchase is cancelled (kept on record), their
  // pieces go back to the store; the other buyers are untouched
  async function didNotPay(s) {
    const res = await promptDialog({
      title: `${tr('Buyer did not pay')} — ${personName({ name: s.buyer_name }, lang)}`, confirmLabel: tr('Mark not paid'), tone: 'danger',
      message: `${inr(s.amount)} · ${auction.pieces.filter((p) => p.sale_id === s.id).map((p) => p.tag_id).sort().join(', ')}. ${tr('Their pieces go back to the store; the other buyers are not affected.')}`,
      fields: [{ k: 'reason', label: tr('Reason'), required: true, note: tr('At least 5 characters. Kept in the auction history.') }],
    })
    if (!res) return
    try {
      const au = await AuctionAPI.saleNotPaid(auction.id, s.id, res.reason)
      toast(tr('Marked as not paid — the pieces are back in store.'))
      onChanged?.(au)
    } catch (ex) { toast(errText(ex, 'Could not mark the buyer as not paid.'), 'error') }
  }
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
                  <td className="px-4 py-2.5"><div className="font-semibold text-gray-800">{personName({ name: s.buyer_name }, lang)}{' '}
                    {s.devotee_code ? <Pill tone="green">{tr('Devotee')} {s.devotee_code}</Pill> : <Pill tone="gray">{tr('Outsider')}</Pill>}</div>
                    {s.buyer_mobile && <div className="text-[0.6875rem] text-gray-400">{s.buyer_mobile}</div>}</td>
                  <td className="px-4 py-2.5 font-mono text-[0.72rem] text-gray-600">{auction.pieces.filter((p) => p.sale_id === s.id).map(lineTag).sort().join(', ')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{inr(s.amount)}</td>
                  <td className="px-4 py-2.5"><Pill tone={s.payment_status === 'Paid' ? 'green' : s.payment_status === 'Not Paid' ? 'red' : 'amber'}>{tr(s.payment_status)}</Pill>
                    {s.payment_status === 'Paid' && <div className="text-[0.6875rem] text-gray-500 mt-0.5">{tr(s.payment_mode === 'UPI/QR Code' ? 'Online' : s.payment_mode)} · {s.receipt_no}</div>}</td>
                  <td className="px-4 py-2.5"><div className="flex gap-1.5 justify-end">
                    {isAdmin && s.payment_status === 'Pending' && <button onClick={() => didNotPay(s)} title={tr('Buyer did not pay')} aria-label={tr('Buyer did not pay')} className="w-8 h-8 grid place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><PackageX size={15} /></button>}
                    {canCollect && approved && s.payment_status === 'Pending' && <button onClick={() => onCollect(saleAsPayable(auction, s))} title={tr('Collect payment')} aria-label={tr('Collect payment')} className="w-8 h-8 grid place-items-center rounded-lg border border-green-200 text-green-700 hover:bg-green-50"><Banknote size={15} /></button>}
                    {s.payment_status === 'Paid' && <button onClick={() => onReceipt(saleAsPayable(auction, s))} title={tr('Print receipt')} aria-label={tr('Print receipt')} className="w-8 h-8 grid place-items-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"><ReceiptIcon size={15} /></button>}
                  </div></td>
                </tr>
              ))}
              {!auction.sales.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500"><T>No buyers — the whole lot is unsold.</T></td></tr>}
            </tbody>
          </table>
          {unsold.length > 0 && auction.sales.length > 0 && (
            <div className="px-4 py-3 text-[0.8125rem] text-gray-600 border-t border-gray-100"><b>{tr('Unsold')}</b> ({piecesOf(unsold)}): <span className="font-mono text-[0.72rem]">{unsold.map(lineTag).sort().join(', ')}</span>
              {approved && <span className="text-gray-500"> — {tr('back in store; put them in a new auction from stock.')}</span>}</div>
          )}
          {!approved && <div className="px-4 py-3 text-[0.75rem] text-amber-700 border-t border-gray-100"><T>Payment can be collected once the result is recorded.</T></div>}
        </div>
      </div>
    </div>
  )
}
