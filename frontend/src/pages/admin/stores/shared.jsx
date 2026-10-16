import React, { useEffect, useMemo, useState } from 'react'
import { X, Plus, Trash2, Printer, Tag } from 'lucide-react'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { Pill, inr, fmtDate } from '../../../components/admin/ui.jsx'
import { Select, NumberField } from '../../../components/common/Field.jsx'
import { toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang } from '../../../i18n/LanguageContext.jsx'

export const STATUS_TONE = { 'In Store': 'green', 'In Auction': 'amber', 'In Open Sale': 'violet', Sold: 'blue', 'Written Off': 'gray' }
export const STATUSES = ['In Store', 'In Auction', 'In Open Sale', 'Sold', 'Written Off']

// Tagging, moving and manual entries: Counter Staff and Administrator (backend WRITE_MATRIX).
// Committee and Accountant see the registers; the Committee verifies manual entries.
export const canWriteStores = (user) => ['Admin', 'Administrator', 'Counter Staff'].includes(user?.role)
export const isAdminUser = (user) => ['Admin', 'Administrator'].includes(user?.role)
// Open Sale: the Committee alone fixes the price; Counter Staff / Administrator sell and mark damaged
export const isCommitteeUser = (user) => user?.role === 'Committee'
export const canSellOrDamage = (user) => ['Admin', 'Administrator', 'Counter Staff'].includes(user?.role)

const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const qty = (n) => (n == null ? '' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }))

/** "3 / 5 pieces" or "30 / 50 g" or, for hundi, per counted line. */
export function progressText(p) {
  if (!p) return '—'
  if (p.mode === 'lines') return p.lines.map((l) => `${tr(l.item_name)}: ${l.mode === 'weight' ? `${qty(l.done)} / ${qty(l.needed)} g` : l.mode === 'value' ? `${l.pieces} ${tr('pcs')}` : `${qty(l.done)} / ${qty(l.needed)}`}`).join(' · ')
  return p.mode === 'weight' ? `${qty(p.done)} / ${qty(p.needed)} g` : `${qty(p.done)} / ${qty(p.needed)}`
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
                  {(i.details || i.weight_g) && <div className="text-gray-600">{[i.details, i.weight_g ? `${qty(i.weight_g)} g` : '', i.purity].filter(Boolean).join(' · ')}</div>}
                  <div className="text-gray-700"><T>Donor</T>: <b>{personName({ name: i.donor_name }, lang)}</b></div>
                  <div className="text-gray-500">{i.source_ref} · {fmtDate(i.received_on)}</div>
                  <div className="text-gray-500">{i.location || '—'}</div>
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
        setRows(p.lines.filter((l) => !l.complete).map((l) => blankRow({ hundi_line_id: l.line_id })))
      } else if (p.mode === 'weight') {
        setRows(p.complete ? [] : [blankRow()])
      } else {
        const left = Math.max(0, Math.round(p.needed - p.done))
        setRows(Array.from({ length: Math.min(left, 200) }, () => blankRow()))
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

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
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

  async function save() {
    if (!rows.length) return
    const missing = rows.findIndex((r) => !r.location_id || (isHundi && !r.category_id) || (isWeightRow(r) && !(Number(r.weight_g) > 0)))
    if (missing >= 0) {
      toast(`${tr('Row')} ${missing + 1}: ${tr('fill in the location, category and weight (g) where asked.')}`, 'error')
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
          est_value: r.est_value !== '' ? Number(r.est_value) : null, location_id: Number(r.location_id),
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
      const left = p.mode === 'lines' ? progressText(p) : p.mode === 'weight' ? `${qty(p.needed - p.done)} g` : `${Math.round(p.needed - p.done)} ${tr('piece(s)')}`
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
            <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Each piece gets its own ID. Write the ID on a sticker and keep the piece at the location chosen.</T></p></div>
          <button onClick={close} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={20} /></button>
        </div>
        {loadErr && <div className="m-6 text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm">{loadErr}</div>}
        {src && (
          <div className="px-6 py-5 space-y-5 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 rounded-lg px-4 py-3 text-[0.8125rem]">
              <div><b>{personName({ name: src.donor_name }, lang)}</b>{src.donor_mobile ? ` · ${src.donor_mobile}` : ''} · {tr(src.item_name)}
                {src.quantity != null && <> · <b>{qty(src.quantity)} {tr(src.unit || '')}</b></>} · <span className="font-mono">{src.source_ref}</span></div>
              <Pill tone={p.complete ? 'green' : 'amber'}>{p.complete ? tr('All tagged') : `${tr('Tagged')} ${progressText(p)}`}</Pill>
            </div>
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
                <div><label className="label"><T>Location</T></label><Select className="input" value={bulk.location_id} onChange={(e) => setBulk({ ...bulk, location_id: e.target.value })}><option value="">{tr('Select')}</option>{activeLocations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}</Select></div>
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
                    <TagRow key={i} r={r} i={i} weight={l.mode === 'weight'} categories={tagged} hundi locations={activeLocations} setRow={setRow} removeRow={removeRow} />
                  ))}
                  <button type="button" onClick={() => addRow({ hundi_line_id: l.line_id, category_id: rows.find((x) => x.hundi_line_id === l.line_id)?.category_id || '' })} className="text-[0.78rem] font-semibold text-maroon-700 inline-flex items-center gap-1"><Plus size={13} /><T>Add piece</T></button>
                </div>
              </div>
            )) : !p.complete && (
              <div className="space-y-2">
                {rows.map((r, i) => <TagRow key={i} r={r} i={i} weight={!!src.weight} locations={activeLocations} setRow={setRow} removeRow={removeRow} defaultValue={src.default_value} />)}
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

function TagRow({ r, i, weight, categories = [], hundi, locations, setRow, removeRow, defaultValue }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end border border-gray-100 rounded-lg p-2">
      <div className="col-span-2 sm:col-span-1 text-[0.75rem] text-gray-400 font-mono pb-2">#{i + 1}</div>
      {hundi && (
        <div className="col-span-2 sm:col-span-3"><label className="label"><T>Category *</T></label>
          <Select className="input" value={r.category_id} onChange={(e) => setRow(i, { category_id: e.target.value })}>
            <option value="">{tr('Select')}</option>{categories.map((c) => <option key={c.id} value={c.id}>{tr(c.name)} ({c.id_prefix})</option>)}
          </Select></div>
      )}
      <div className={`col-span-2 ${hundi ? 'sm:col-span-2' : 'sm:col-span-4'}`}><label className="label"><T>Description</T></label>
        <input className="input" value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} /></div>
      {weight ? (<>
        <div><label className="label"><T>Weight g *</T></label><NumberField min="0" step="0.001" value={r.weight_g} onChange={(e) => setRow(i, { weight_g: e.target.value })} /></div>
        <div><label className="label"><T>Purity</T></label><input className="input" value={r.purity} onChange={(e) => setRow(i, { purity: e.target.value })} placeholder="92.5%" /></div>
      </>) : !hundi && (
        <div className="col-span-2 sm:col-span-2"><label className="label"><T>Size / colour</T></label><input className="input" value={r.details} onChange={(e) => setRow(i, { details: e.target.value })} /></div>
      )}
      <div><label className="label"><T>Value ₹</T></label><NumberField min="0" step="1" value={r.est_value} onChange={(e) => setRow(i, { est_value: e.target.value })} placeholder={defaultValue != null ? String(defaultValue) : ''} /></div>
      <div className="col-span-2 sm:col-span-2"><label className="label"><T>Location *</T></label>
        <Select className="input" value={r.location_id} onChange={(e) => setRow(i, { location_id: e.target.value })}>
          <option value="">{tr('Select')}</option>{locations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}
        </Select></div>
      <button type="button" onClick={() => removeRow(i)} title={tr('Remove row')} aria-label={tr('Remove row')} className="justify-self-end mb-1 w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-red-500 hover:border-red-300"><Trash2 size={14} /></button>
    </div>
  )
}
