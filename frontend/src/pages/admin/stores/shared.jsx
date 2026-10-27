import React, { useEffect, useMemo, useState } from 'react'
import { X, Plus, Trash2, Printer, Tag } from 'lucide-react'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { Pill, inr, fmtDate } from '../../../components/admin/ui.jsx'
import { Select, NumberField } from '../../../components/common/Field.jsx'
import { toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, getLang, useLang, gramUnit, staffName } from '../../../i18n/LanguageContext.jsx'
export { staffName }
import { teScript } from '../../../lib/teScript.js'
import { estValue, pct, factorOf, metalOf, useMetalDay } from '../../../lib/metal.js'

// Awaiting Placement: tagged (ID + sticker) but not yet put on a shelf — Place makes it In Store
export const AWAITING = 'Awaiting Placement'
// Issued: lent out on an issue slip (still stock). Missing: not found at a stock check.
export const ISSUED = 'Issued'
export const MISSING = 'Missing'
export const STATUS_TONE = { [AWAITING]: 'orange', 'In Store': 'green', [ISSUED]: 'maroon', 'In Auction': 'amber', 'In Open Sale': 'violet',
  [MISSING]: 'red', Sold: 'blue', 'Written Off': 'gray' }
export const STATUSES = [AWAITING, 'In Store', ISSUED, 'In Auction', 'In Open Sale', MISSING, 'Sold', 'Written Off']

// Tagging, moving and manual entries: Counter Staff, Stores Officer and Administrator (backend WRITE_MATRIX).
// Committee and Accountant see the registers; the Committee verifies manual entries.
export const canWriteStores = (user) => ['Admin', 'Administrator', 'Counter Staff', 'Stores Officer'].includes(user?.role)
export const isAdminUser = (user) => ['Admin', 'Administrator'].includes(user?.role)
export const isStoresOfficer = (user) => user?.role === 'Stores Officer'
// Cancel a consumable use, change the consumables start date: Administrator or Stores Officer
export const canManageStores = (user) => isAdminUser(user) || isStoresOfficer(user)
// Open Sale: the Committee alone fixes the price; Counter Staff / Administrator sell (money).
export const isCommitteeUser = (user) => user?.role === 'Committee'
export const canSellOrDamage = (user) => ['Admin', 'Administrator', 'Counter Staff'].includes(user?.role)
// Mark damaged / write off: the sellers plus the Stores Officer (no money involved)
export const canDamageStock = (user) => canSellOrDamage(user) || isStoresOfficer(user)
// Issue & Return: custody of the store — Stores Officer and Administrator only
export const canIssueStock = (user) => canManageStores(user)
// Missing Items: mark found / report lost — Stores Officer, Counter Staff, Administrator;
// approve or reject a lost write-off — Committee and Administrator (never who reported it)
export const canFollowMissing = (user) => ['Admin', 'Administrator', 'Stores Officer'].includes(user?.role)
export const canDecideLost = (user) => isAdminUser(user) || user?.role === 'Committee'
// Receive at store: the Stores Officer (or Admin) counts a counter receipt in; the Committee
// (or Admin) closes a shortage — never whoever counted it
export const canReceiveStock = (user) => canManageStores(user)
export const canCloseShortage = (user) => isAdminUser(user) || user?.role === 'Committee'
// Place an Awaiting Placement piece in a location: Stores Officer, Counter Staff, Administrator
export const canPlaceStock = (user) => ['Admin', 'Administrator', 'Counter Staff', 'Stores Officer'].includes(user?.role)
// Purchase requests: the Stores Officer (or Admin) raises / marks received; the Committee (or
// Admin) approves — never whoever raised it. Festival kits and handover: Stores Officer + Admin.
export const canApprovePurchase = (user) => isAdminUser(user) || user?.role === 'Committee'

const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')


const place = (s) => tr(s || '—')
/** Telugu for the sentences the backend writes into an item's history and the
 *  consumables ledger ("price ₹20 set by the committee; stays at Store Room").
 *  Free text staff typed (a write-off reason) is shown as written. */
export function storeDetail(text) {
  if (!text || getLang() !== 'te') return text
  const s = String(text)
  let m
  // Gold / silver value: tagged at another value, or a piece corrected later
  if ((m = s.match(/^(₹\S+) instead of (₹\S+) \(receipt value\) — (.*)$/))) return `${m[1]} (${tr('receipt value')} ${m[2]}) — ${teScript(m[3])}`
  if (/^(Description|Size \/ colour|Weight|Purity|Value) .* → /.test(s)) {
    const cut = s.lastIndexOf(' — ')
    const parts = (cut > 0 ? s.slice(0, cut) : s).split(' · ').map((x) => x.replace(/^(Description|Size \/ colour|Weight|Purity|Value) /, (w, k) => `${tr(k)} `))
    return parts.join(' · ') + (cut > 0 ? ` — ${teScript(s.slice(cut + 3))}` : '')
  }
  if ((m = s.match(/^(\S+) on (\d{4}-\d{2}-\d{2}) — base (.+)$/))) return `${m[1]} · ${fmtDate(m[2])} · ${tr('Base price')} ${m[3]}`
  if ((m = s.match(/^to (.+) for (\S+) in (\S+) \(approved\)$/))) return `${tr('Buyer')}: ${staffName(m[1])} · ${m[2]} · ${m[3]} (${tr('Approved')})`
  if ((m = s.match(/^to (.+) for (\S+) — (\S+), (\w+)$/))) return `${tr('Buyer')}: ${staffName(m[1])} · ${m[2]} — ${m[3]}, ${tr(m[4])}`
  if ((m = s.match(/^in (\S+), back to (.+) \(approved\)$/))) return `${m[1]} · ${tr('Back to store')}: ${place(m[2])} (${tr('Approved')})`
  if ((m = s.match(/^price (\S+) set by the committee; stays at (.+)$/))) return `${tr('Price')} ${m[1]} — ${tr('fixed by the committee')}; ${tr('Location')}: ${place(m[2])}`
  if ((m = s.match(/^(\S+) → (\S+) \(committee\)$/))) return `${m[1]} → ${m[2]} (${tr('Committee')})`
  if ((m = s.match(/^taken off Open Sale by the committee; at (.+)$/))) return `${tr('Taken off Open Sale by the committee')}; ${tr('Location')}: ${place(m[1])}`
  if ((m = s.match(/^From (\S+) \((.+)\) — placed in (.+)$/))) return `${m[1]} (${staffName(m[2])}) — ${tr('Placed in')}: ${place(m[3])}`
  // Tagged without a location, then placed: "From RCPT-12 (Ravi K)" · "in Rack 2 · top shelf"
  if ((m = s.match(/^From (\S+) \((.+)\)$/))) return `${m[1]} (${staffName(m[2])})`
  if ((m = s.match(/^in ([^·]+?)( · .*)?$/)) && !/^in \S+-\d/.test(s)) return `${tr('Placed in')}: ${place(m[1])}${m[2] || ''}`
  // Issue & Return, Missing Items
  if ((m = s.match(/^to (.+) for (.+?)( · [\d.]+ g)? — (ISS-\d+), return by (\d{4}-\d{2}-\d{2})$/)))
    return `${staffName(m[1])} — ${tr(m[2])}${m[3] ? ` ·${m[3].slice(2)} ${gramUnit()}` : ''} · ${m[4]} · ${tr('Return by')} ${fmtDate(m[5])}`
  if ((m = s.match(/^(ISS-\d+) · (Good|Damaged on return)( · .*)? — back to (.+)$/)))
    return `${m[1]} · ${tr(m[2])}${m[3] || ''} — ${tr('Back to store')}: ${place(m[4])}`
  if ((m = s.match(/^Lost — (.+) \(approved by (.+)\)$/))) return `${tr('Lost')} — ${tr(m[1])} (${tr('Approved by')} ${staffName(m[2])})`
  if ((m = s.match(/^Found at (.+) \((\S+)\)$/))) return `${tr('Found at')}: ${place(m[1])} (${m[2]})`
  if ((m = s.match(/^MISSING at (.+) \((\S+)\) — to be followed up$/))) return `${tr('Missing at')}: ${place(m[1])} (${m[2]}) — ${tr('to be followed up')}`
  if ((m = s.match(/^(.+) — (\S+); back to (.+)$/))) return `${tr(m[1])} — ${m[2]}; ${tr('Back to store')}: ${place(m[3])}`
  // Consumables ledger: "<purpose> — issued to <name> · <notes>" and "<source> — <reason> (verified by <name>)"
  if ((m = s.match(/^(.+) — (.+) \(verified by (.+)\)$/))) return `${tr(m[1])} — ${m[2]} (${tr('Verified by')} ${staffName(m[3])})`
  if ((m = s.match(/^(.+?)(?: — issued to (.+?))?( · .*)?$/)) && (m[2] || tr(m[1]) !== m[1])) return `${tr(m[1])}${m[2] ? ` — ${tr('Issued to')}: ${staffName(m[2])}` : ''}${m[3] || ''}`
  // Moved: "<from> → <to>"
  if ((m = s.match(/^(.+) → (.+)$/))) return `${place(m[1])} → ${place(m[2])}`
  return teScript(s)
}
const qty =(n) => (n == null ? '' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }))

/** "3 / 5 pieces" or "30 / 50 g" or, for hundi, per counted line. */
export function progressText(p) {
  if (!p) return '—'
  if (p.mode === 'lines') return p.lines.map((l) => `${tr(l.item_name)}: ${l.mode === 'weight' ? `${qty(l.done)} / ${qty(l.needed)} ${gramUnit()}` : l.mode === 'value' ? `${l.pieces} ${tr('pcs')}` : `${qty(l.done)} / ${qty(l.needed)}`}`).join(' · ')
  return p.mode === 'weight' ? `${qty(p.done)} / ${qty(p.needed)} ${gramUnit()}` : `${qty(p.done)} / ${qty(p.needed)}`
}

/** Tagged categories and active locations, loaded once per screen. */
export function useStoresMeta() {
  const [categories, setCategories] = useState([])
  const [locations, setLocations] = useState([])
  useEffect(() => {
    StoresAPI.categories().then((r) => setCategories(r.items || [])).catch(() => setCategories([]))
    StoresAPI.locations().then((r) => setLocations(r.items || [])).catch(() => setLocations([]))
  }, [])
  const activeLocations = useMemo(() => locations.filter((l) => l.active), [locations])
  return { categories, locations, activeLocations }
}

// ── Sticker sheet (written by hand for now; prints on A4) ───────────────────
export function StickerSheet({ items, title, onClose }) {
  const { lang } = useLang()
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 no-print" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between no-print">
          <div><h3 className="font-serif text-lg font-bold text-maroon-800"><T>Sticker List</T></h3>
            <div className="text-[0.75rem] text-gray-500">{title} · {items.length} {tr('pieces')} · <T>Copy each ID onto its sticker</T></div></div>
          <button onClick={onClose} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-5">
          <div id="print-area">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((i) => (
                <div key={i.tag_id} className="border-2 border-dashed border-gray-400 rounded-lg p-3 text-[0.75rem] leading-snug break-inside-avoid">
                  <div className="font-mono font-bold text-[1.05rem] text-maroon-800">{i.tag_id}</div>
                  <div className="font-semibold text-gray-800">{tr(i.description || i.item_name)}</div>
                  {(i.details || i.weight_g) && <div className="text-gray-600">{[tr(i.details), i.weight_g ? `${qty(i.weight_g)} ${gramUnit()}` : '', i.purity].filter(Boolean).join(' · ')}</div>}
                  <div className="text-gray-700"><T>Donor</T>: <b>{personName({ name: i.donor_name }, lang)}</b></div>
                  <div className="text-gray-500">{i.source_ref} · {fmtDate(i.received_on)}</div>
                  <div className="text-gray-500">{i.location ? tr(i.location) : i.status === AWAITING ? tr('Awaiting placement') : '—'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 no-print">
          <button onClick={onClose} className="btn-outline flex-1 justify-center"><T>Close</T></button>
          <button onClick={() => window.print()} className="btn-maroon flex-1 justify-center"><Printer size={16} className="mr-1" /><T>Print</T></button>
        </div>
      </div>
    </div>
  )
}

// ── Tag Items drawer: one row per piece, IDs are created on save ────────────
const blankRow = (extra = {}) => ({ description: '', details: '', weight_g: '', purity: '', est_value: '', location_id: '', category_id: '', ...extra })

/**
 * source: { type: 'Donation' | 'Hundi' | 'Manual', id }
 * onDone(items) is called after pieces are tagged (the drawer then shows their stickers).
 */
export function TagItemsDrawer({ source, onClose, onDone }) {
  const { lang } = useLang()
  const { categories, activeLocations } = useStoresMeta()
  const tagged = useMemo(() => categories.filter((c) => c.tracking === 'Tagged'), [categories])
  const [src, setSrc] = useState(null)
  const [rows, setRows] = useState([])
  const [bulk, setBulk] = useState({ description: '', details: '', est_value: '', location_id: '' })
  const [saving, setSaving] = useState(false)
  const [stickers, setStickers] = useState(null)
  const [loadErr, setLoadErr] = useState('')

  const isHundi = source.type === 'Hundi'
  useEffect(() => {
    StoresAPI.source(source.type, source.id).then((s) => {
      setSrc(s)
      const p = s.progress
      if (isHundi) {
        // One starter row for every counted valuables line that is not fully tagged
        setRows(p.lines.filter((l) => !l.complete).map((l) => {
          const left = l.mode === 'weight' ? Math.max(0, +(l.needed - l.done).toFixed(3)) : 0
          const v = left && l.rate_per_g ? estValue(left, l.rate_per_g, l.purity_factor) : null
          return blankRow({ hundi_line_id: l.line_id, purity: l.purity || '', ...(left ? { weight_g: String(left) } : {}), ...(v != null ? { est_value: String(v) } : {}) })
        }))
      } else if (p.mode === 'weight') {
        // Gold / silver from the counter: purity and what it is carry over from the receipt
        // …and the piece starts at the weight still to tag, valued like the receipt (grams × rate × purity)
        const left = Math.max(0, +(p.needed - p.done).toFixed(3))
        const v = left && s.rate_per_g ? estValue(left, s.rate_per_g, s.purity_factor) : null
        setRows(p.complete ? [] : [blankRow({ purity: s.purity || '', description: s.item_desc || '',
          ...(left ? { weight_g: String(left) } : {}), ...(v != null ? { est_value: String(v) } : {}) })])
      } else {
        // cloth, utensils…: the devotee's description and value (÷ pieces) carry over from the receipt
        const left = Math.max(0, Math.round(p.needed - p.done))
        setRows(Array.from({ length: Math.min(left, 200) }, () => blankRow({ description: s.item_desc || '',
          ...(s.piece_value != null ? { est_value: String(s.piece_value) } : {}) })))
      }
    }).catch((ex) => setLoadErr(errText(ex, 'Could not load this source.')))
  }, [source.type, source.id, isHundi])

  // Hundi: suggest the tagged category named like the counted item type (Gold → Gold, Silver → Silver)
  useEffect(() => {
    if (!isHundi || !src || !tagged.length) return
    setRows((rs) => rs.map((r) => {
      if (r.category_id) return r
      const line = src.progress.lines.find((l) => l.line_id === r.hundi_line_id)
      const match = tagged.find((c) => c.name.toLowerCase() === (line?.item_type || '').toLowerCase())
      return match ? { ...r, category_id: String(match.id) } : r
    }))
  }, [isHundi, src, tagged])

  // Start every row at the place the goods already are: the hundi custody location or the
  // manual entry's location (staff can still change it per piece)
  useEffect(() => {
    if (!src || !activeLocations.length) return
    const home = src.location_id ? activeLocations.find((l) => l.id === src.location_id)
      : activeLocations.find((l) => l.name.toLowerCase() === (src.store_location || '').trim().toLowerCase())
    if (!home) return
    setBulk((b) => (b.location_id ? b : { ...b, location_id: String(home.id) }))
    setRows((rs) => (rs.some((r) => !r.location_id) ? rs.map((r) => (r.location_id ? r : { ...r, location_id: String(home.id) })) : rs))
  }, [src, activeLocations])

  // Gold / silver valued at the counter / hundi count: typing a piece's weight fills its value
  // (grams × that day's rate × purity) until someone types a value by hand
  const { purities } = useMetalDay()
  const valuationOf = (r) => (isHundi ? src?.progress?.lines?.find((l) => l.line_id === r.hundi_line_id) : src)
  // The receipt value of a piece: its grams × the rate used then × its purity (the receipt's
  // purity when the piece's own is not in the table) — the server checks the same
  const expectedOf = (r) => {
    const v = valuationOf(r)
    if (!v?.rate_per_g) return !isHundi && src?.piece_value != null && !src?.weight ? src.piece_value : null
    const metal = metalOf(isHundi ? v.item_type : src?.item_name)
    return estValue(r.weight_g, v.rate_per_g, factorOf(purities, metal, (r.purity || '').trim()) ?? v.purity_factor)
  }
  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => {
    if (j !== i) return r
    const n = { ...r, ...patch }
    if ('est_value' in patch) n.autoValue = patch.autoValue ?? false
    else if (('weight_g' in patch || 'purity' in patch) && r.autoValue !== false) {
      const e = expectedOf(n)
      if (e != null) n.est_value = String(e)
    }
    return n
  }))
  const removeRow = (i) => setRows((rs) => rs.filter((_, j) => j !== i))
  const addRow = (extra = {}) => setRows((rs) => [...rs, blankRow({ location_id: bulk.location_id, ...extra })])
  const applyAll = () => setRows((rs) => rs.map((r) => ({
    ...r,
    ...(bulk.description ? { description: bulk.description } : {}),
    ...(bulk.details ? { details: bulk.details } : {}),
    ...(bulk.est_value !== '' ? { est_value: bulk.est_value } : {}),
    ...(bulk.location_id ? { location_id: bulk.location_id } : {}),
  })))

  const lineOf = (r) => src?.progress.lines?.find((l) => l.line_id === r.hundi_line_id)
  const isWeightRow = (r) => (isHundi ? lineOf(r)?.mode === 'weight' || !!tagged.find((c) => String(c.id) === String(r.category_id))?.weight : !!src?.weight)
  const weightAdding = rows.reduce((s, r) => s + Number(r.weight_g || 0), 0)

  const differs = (r) => { const e = expectedOf(r); return e != null && r.est_value !== '' && Math.abs(Number(r.est_value) - e) >= 1 }

  async function save() {
    if (!rows.length) return
    // Location is optional: a blank one leaves the piece Awaiting Placement (placed later)
    const missing = rows.findIndex((r) => (isHundi && !r.category_id) || (isWeightRow(r) && !(Number(r.weight_g) > 0)))
    if (missing >= 0) {
      toast(`${tr('Row')} ${missing + 1}: ${tr('fill in the category and weight (g) where asked.')}`, 'error')
      return
    }
    const noReason = rows.findIndex((r) => differs(r) && !(r.value_note || '').trim())
    if (noReason >= 0) {
      toast(`${tr('Row')} ${noReason + 1}: ${tr('the value differs from the receipt value — write why, or use the receipt value.')}`, 'error')
      return
    }
    setSaving(true)
    try {
      const res = await StoresAPI.tag({
        source_type: source.type, source_id: source.id,
        rows: rows.map((r) => ({
          category_id: r.category_id ? Number(r.category_id) : null, hundi_line_id: r.hundi_line_id || null,
          description: r.description || null, details: r.details || null,
          weight_g: r.weight_g !== '' ? Number(r.weight_g) : null, purity: r.purity || null,
          est_value: r.est_value !== '' ? Number(r.est_value) : null, location_id: r.location_id ? Number(r.location_id) : null,
          value_note: differs(r) ? (r.value_note || '').trim() : null,
        })),
      })
      toast(`${res.items.length} ${tr('piece(s) tagged')}: ${res.items[0].tag_id}${res.items.length > 1 ? ` … ${res.items[res.items.length - 1].tag_id}` : ''}`)
      window.dispatchEvent(new Event('stores:changed'))   // sidebar badge
      setStickers(res.items)
      onDone?.(res.items)
    } catch (ex) {
      toast(errText(ex, 'Could not tag these pieces.'), 'error')
    } finally { setSaving(false) }
  }

  if (stickers) return <StickerSheet items={stickers} title={src?.source_ref} onClose={onClose} />

  const p = src?.progress
  // Closing without tagging everything: say where the pieces wait, so nothing is forgotten
  const close = () => {
    if (src && p && !p.complete) {
      const left = p.mode === 'lines' ? progressText(p) : p.mode === 'weight' ? `${qty(p.needed - p.done)} ${gramUnit()}` : `${Math.round(p.needed - p.done)} ${tr('piece(s)')}`
      toast(`${src.source_ref}: ${left} ${tr('waiting in Stores → Pending Tagging')}`, 'info')
      window.dispatchEvent(new Event('stores:changed'))
    }
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={close} />
      <div className="relative w-full max-w-3xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
          <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Tag Items</T></h3>
            <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Each piece gets its own ID. Write the ID on a sticker and keep the piece at the location chosen.</T>{' '}<T>Leave the location blank to place it later from the Stock Register.</T></p></div>
          <button onClick={close} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={20} /></button>
        </div>
        {loadErr && <div className="m-6 text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm">{loadErr}</div>}
        {src && (
          <div className="px-6 py-5 space-y-5 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 rounded-lg px-4 py-3 text-[0.8125rem]">
              <div><b>{personName({ name: src.donor_name }, lang)}</b>{src.donor_mobile ? ` · ${src.donor_mobile}` : ''} · {tr(src.item_name)}
                {src.quantity != null && <> · <b>{qty(src.quantity)} {tr(src.unit || '')}</b></>}{src.purity && <> · <b>{src.purity}</b></>} · <span className="font-mono">{src.source_ref}</span>
                {src.rate_per_g == null && src.piece_value != null && <div className="text-[0.6875rem] text-gray-500 mt-0.5">{tr('Value per piece')} = {inr(src.piece_value)} ({tr('value stated by the devotee')} {inr(src.est_value)} ÷ {qty(src.quantity)})</div>}
                {src.rate_per_g != null && <div className="text-[0.6875rem] text-gray-500 mt-0.5">{tr('Value per piece')} = {tr('grams')} × ₹{Number(src.rate_per_g).toLocaleString('en-IN')}{src.purity_factor ? ` × ${pct(src.purity_factor)}` : ''} ({tr('rate on the receipt day')})</div>}</div>
              <Pill tone={p.complete ? 'green' : 'amber'}>{p.complete ? tr('All tagged') : `${tr('Tagged')} ${progressText(p)}`}</Pill>
            </div>
            {p.receive && p.receive.state !== 'Received' && (
              <div className="text-[0.75rem] rounded-lg px-3 py-2 bg-red-50 border border-red-100 text-red-700">
                {p.mode === 'lines'
                  ? <>{tr('Short at store')}{p.receive.short_code ? ` · ${p.receive.short_code}` : ''}</>
                  : <>{tr('Counter receipt')}: {qty(p.receive.billed)} · {tr('received at store')}: {qty(p.receive.received)}{p.receive.short_code ? ` · ${p.receive.short_code}` : ''}</>}
                {' '}— {tr('only what the store received can be tagged.')}</div>
            )}
            {!isHundi && src.id_prefix && !p.complete && (
              <div className="text-[0.75rem] text-gray-500"><T>New IDs will start with</T> <span className="font-mono font-semibold text-maroon-700">{src.id_prefix}-</span> <T>and continue the running number.</T></div>
            )}

            {p.complete && (src.items || []).length > 0 && (
              <div className="text-sm text-gray-700"><T>Every piece from this source is already tagged.</T>{' '}
                <button className="text-maroon-700 font-semibold hover:underline" onClick={() => setStickers(src.items)}><T>Show sticker list</T></button></div>
            )}

            {!p.complete && rows.length > 0 && !isHundi && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end border border-gold-200 bg-cream/50 rounded-lg p-3">
                <div className="col-span-2 sm:col-span-1"><label className="label"><T>Description for all</T></label><input className="input" value={bulk.description} onChange={(e) => setBulk({ ...bulk, description: e.target.value })} placeholder={tr('e.g. Pancha, silk border')} /></div>
                <div><label className="label"><T>Size / colour</T></label><input className="input" value={bulk.details} onChange={(e) => setBulk({ ...bulk, details: e.target.value })} /></div>
                <div><label className="label"><T>Value ₹</T></label><NumberField min="0" step="1" value={bulk.est_value} onChange={(e) => setBulk({ ...bulk, est_value: e.target.value })} placeholder={src.default_value != null ? String(src.default_value) : ''} /></div>
                <div><label className="label"><T>Location</T></label><Select className="input" value={bulk.location_id} onChange={(e) => setBulk({ ...bulk, location_id: e.target.value })}><option value="">{tr('Place later')}</option>{activeLocations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}</Select></div>
                <button type="button" onClick={applyAll} className="btn-outline justify-center !py-2"><T>Apply to all rows</T></button>
              </div>
            )}

            {isHundi ? p.lines.filter((l) => !l.complete).map((l) => (
              <div key={l.line_id} className="border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100 text-[0.8125rem]">
                  <span><b>{tr(l.item_name)}</b> · {tr(l.item_type)} · {l.quantity != null ? `${qty(l.quantity)} ${tr(l.unit || '')}` : inr(l.value)}</span>
                  <span className="text-gray-500">{progressText({ mode: 'lines', lines: [l] })}</span>
                </div>
                <div className="p-3 space-y-2">
                  {rows.map((r, i) => r.hundi_line_id === l.line_id && (
                    <TagRow key={i} r={r} i={i} weight={l.mode === 'weight'} categories={tagged} hundi locations={activeLocations} setRow={setRow} removeRow={removeRow} expected={expectedOf(r)} />
                  ))}
                  <button type="button" onClick={() => addRow({ hundi_line_id: l.line_id, category_id: rows.find((x) => x.hundi_line_id === l.line_id)?.category_id || '' })} className="text-[0.78rem] font-semibold text-maroon-700 inline-flex items-center gap-1"><Plus size={13} /><T>Add piece</T></button>
                </div>
              </div>
            )) : !p.complete && (
              <div className="space-y-2">
                {rows.map((r, i) => <TagRow key={i} r={r} i={i} weight={!!src.weight} locations={activeLocations} setRow={setRow} removeRow={removeRow} defaultValue={src.default_value} expected={expectedOf(r)} />)}
                {src.weight && (
                  <div className="flex items-center justify-between text-[0.78rem]">
                    <button type="button" onClick={() => addRow()} className="font-semibold text-maroon-700 inline-flex items-center gap-1"><Plus size={13} /><T>Add piece</T></button>
                    <span className={weightAdding > p.needed - p.done + 0.01 ? 'text-red-600 font-semibold' : 'text-gray-500'}>{tr('These pieces')}: {qty(weightAdding)} g · {tr('left to tag')}: {qty(p.needed - p.done)} g</span>
                  </div>
                )}
              </div>
            )}
            {!activeLocations.length && <div className="text-[0.8125rem] text-red-700 bg-red-50 rounded-lg px-3 py-2"><T>No store locations yet. Ask the administrator to add them under Store Locations.</T></div>}
          </div>
        )}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
          <button onClick={close} className="btn-outline flex-1 justify-center">{p?.complete ? <T>Close</T> : <T>Tag later</T>}</button>
          {p && !p.complete && (
            <button disabled={saving || !rows.length} onClick={save} className="btn-maroon flex-1 justify-center disabled:opacity-60">
              <Tag size={15} className="mr-1" />{saving ? tr('Saving…') : `${tr('Tag')} ${rows.length} ${tr('piece(s)')}`}</button>
          )}
        </div>
      </div>
    </div>
  )
}

function TagRow({ r, i, weight, categories = [], hundi, locations, setRow, removeRow, defaultValue, expected }) {
  const off = expected != null && r.est_value !== '' && Math.abs(Number(r.est_value) - expected) >= 1
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-12 gap-2 items-end border rounded-lg p-2 ${off ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100'}`}>
      <div className="col-span-2 sm:col-span-1 text-[0.75rem] text-gray-400 font-mono pb-2">#{i + 1}</div>
      {hundi && (
        <div className={`col-span-2 ${weight ? 'sm:col-span-2' : 'sm:col-span-3'}`}><label className="label"><T>Category *</T></label>
          <Select className="input" value={r.category_id} onChange={(e) => setRow(i, { category_id: e.target.value })}>
            <option value="">{tr('Select')}</option>{categories.map((c) => <option key={c.id} value={c.id}>{tr(c.name)} ({c.id_prefix})</option>)}
          </Select></div>
      )}
      <div className={`col-span-2 ${hundi ? 'sm:col-span-2' : 'sm:col-span-3'}`}><label className="label"><T>Description</T></label>
        <input className="input" value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} /></div>
      {weight ? (<>
        <div><label className="label"><T>Weight g *</T></label><NumberField min="0" step="0.001" value={r.weight_g} onChange={(e) => setRow(i, { weight_g: e.target.value })} /></div>
        <div className={hundi ? '' : 'sm:col-span-2'}><label className="label"><T>Purity</T></label><input className="input" value={r.purity} onChange={(e) => setRow(i, { purity: e.target.value })} placeholder="22K" /></div>
      </>) : !hundi && (
        <div className="col-span-2 sm:col-span-2"><label className="label"><T>Size / colour</T></label><input className="input" value={r.details} onChange={(e) => setRow(i, { details: e.target.value })} /></div>
      )}
      <div className={weight || !hundi ? 'sm:col-span-2' : ''}><label className="label"><T>Value ₹</T></label><NumberField min="0" step="1" value={r.est_value} onChange={(e) => setRow(i, { est_value: e.target.value })} placeholder={defaultValue != null ? String(defaultValue) : ''} /></div>
      <div className={`col-span-2 ${hundi || weight ? 'sm:col-span-2' : 'sm:col-span-3'}`}><label className="label"><T>Location</T></label>
        <Select className="input" value={r.location_id} onChange={(e) => setRow(i, { location_id: e.target.value })}>
          <option value="">{tr('Place later')}</option>{locations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}
        </Select></div>
      <button type="button" onClick={() => removeRow(i)} title={tr('Remove row')} aria-label={tr('Remove row')} className="justify-self-end mb-1 w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-red-500 hover:border-red-300"><Trash2 size={14} /></button>
      {expected != null && (
        <div className="col-span-2 sm:col-span-12 text-[0.75rem] flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-gray-500">{tr('Receipt value')}: <b className="text-gray-800">{inr(expected)}</b>{weight ? ` (${tr('grams × rate × purity')})` : ''}</span>
          {off && <>
            <span className="text-amber-700 font-semibold">⚠ {tr('Differs from the receipt value')}</span>
            <button type="button" onClick={() => setRow(i, { est_value: String(expected), autoValue: true })} className="text-maroon-700 font-semibold hover:underline">{tr('Use receipt value')}</button>
            <input className="input !py-1 flex-1 min-w-[14rem]" maxLength={200} value={r.value_note || ''} onChange={(e) => setRow(i, { value_note: e.target.value })}
              placeholder={tr('Why is the value different? *')} />
          </>}
        </div>)}
    </div>
  )
}
