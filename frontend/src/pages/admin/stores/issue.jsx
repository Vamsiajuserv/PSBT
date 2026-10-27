import React, { useEffect, useMemo, useState } from 'react'
import { X, Printer, Search, Plus, Trash2, Undo2, Send } from 'lucide-react'
import { fmtDate, fmtStamp, Pill } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { Select, DateField, Combobox } from '../../../components/common/Field.jsx'
import { toast } from '../../../components/common/Dialog.jsx'
import { T, tr, getLang, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { useTemple } from '../../../lib/SiteContext.jsx'
import { staffName } from './shared.jsx'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const changed = () => window.dispatchEvent(new Event('stores:changed'))   // sidebar badges

/** Issue In Store pieces on one slip. `preset` = pieces already picked (from the Stock Register). */
export function IssueDrawer({ preset = [], onClose, onDone }) {
  const [meta, setMeta] = useState({ purposes: [], poojaris: [] })
  const [picked, setPicked] = useState(preset)
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [f, setF] = useState({ issued_to: '', poojari_id: '', purpose: '', return_by: today(), notes: '' })
  const [saving, setSaving] = useState(false)
  const [slip, setSlip] = useState(null)

  useEffect(() => { StoresAPI.issueMeta().then(setMeta).catch(() => {}) }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setFound([]); return }
      StoresAPI.items({ q: q.trim(), status: 'In Store', size: 20 }).then((r) => setFound(r.items || [])).catch(() => setFound([]))
    }, 300)
    return () => clearTimeout(t)
  }, [q])
  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked])

  // The "Issued to" box lists the Poojari Master; any other name can be typed
  const poojariOptions = meta.poojaris.map((p) => ({ value: p.name, label: getLang() === 'te' && p.name_te ? p.name_te : p.name }))
  const setIssuedTo = (name) => {
    const pj = meta.poojaris.find((p) => p.name === name)
    setF({ ...f, issued_to: name, poojari_id: pj ? pj.id : '' })
  }

  async function save(e) {
    e.preventDefault()
    if (!picked.length) { toast(tr('Pick at least one piece.'), 'error'); return }
    setSaving(true)
    try {
      const s = await StoresAPI.issue({ ids: picked.map((p) => p.id), issued_to: f.issued_to.trim(), poojari_id: f.poojari_id || null,
        purpose: f.purpose.trim(), return_by: f.return_by, notes: f.notes.trim() || null })
      toast(`${s.code}: ${s.lines.length} ${tr('piece(s) issued to')} ${staffName(s.issued_to)}`)
      changed(); setSlip(s); onDone?.(s)
    } catch (ex) { toast(errText(ex, 'Could not issue these pieces.'), 'error') }
    finally { setSaving(false) }
  }

  if (slip) return <PieceIssueSlip slip={slip} onClose={onClose} />
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form onSubmit={save} className="relative w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
          <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Issue items</T></h3>
            <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Lend pieces out of the store. They stay the temple's stock and must come back by the return date.</T></p></div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={20} /></button>
        </div>
        <div className="px-6 py-5 space-y-4 flex-1">
          <div><label className="label"><T>Pieces *</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search In Store pieces: SLV-…, PAN-…, description')} /></div>
            {found.length > 0 && (
              <div className="mt-1 border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                {found.filter((i) => !pickedIds.has(i.id)).map((i) => (
                  <button type="button" key={i.id} onClick={() => { setPicked([...picked, i]); setQ('') }}
                    className="w-full text-left px-3 py-2 text-[0.8125rem] hover:bg-cream/60 flex items-center gap-2">
                    <Plus size={13} className="text-maroon-700" /><span className="font-mono font-semibold text-maroon-700">{i.tag_id}</span>
                    <span>{tr(i.description || i.item_name)}</span>
                    {i.weight_g != null && <span className="text-gray-500">· {qty(i.weight_g)} {gramUnit()}</span>}
                    <span className="ml-auto text-gray-400">{tr(i.location || '')}</span>
                  </button>))}
              </div>)}
            <div className="mt-2 flex flex-wrap gap-2">
              {picked.map((i) => (
                <span key={i.id} className="inline-flex items-center gap-1.5 rounded-full bg-maroon-50 text-maroon-800 px-3 py-1 text-[0.78rem]">
                  <span className="font-mono font-semibold">{i.tag_id}</span> {tr(i.description || i.item_name)}
                  {i.weight_g != null && <span className="text-maroon-700/70">· {qty(i.weight_g)} {gramUnit()}</span>}
                  <button type="button" onClick={() => setPicked(picked.filter((x) => x.id !== i.id))} aria-label={tr('Remove')}><Trash2 size={12} /></button>
                </span>))}
              {!picked.length && <span className="text-[0.75rem] text-gray-400"><T>No pieces picked yet.</T></span>}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label"><T>Issued to *</T></label>
              <Combobox required value={f.issued_to} onChange={(e) => setIssuedTo(e.target.value)} options={poojariOptions}
                placeholder={tr('Poojari, or type a name')} className="input" /></div>
            <div><label className="label"><T>Purpose *</T></label>
              <Combobox required value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}
                options={meta.purposes.map((p) => ({ value: p, label: tr(p) }))} placeholder={tr('Select or type')} className="input" /></div>
            <div><label className="label"><T>Return by *</T></label>
              <DateField required value={f.return_by} min={today()} onChange={(e) => setF({ ...f, return_by: e.target.value })} className="input" /></div>
            <div><label className="label"><T>Notes</T></label>
              <input className="input" maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={tr('e.g. For Karthika deepotsavam')} /></div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
          <button type="button" onClick={onClose} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
          <button disabled={saving || !picked.length} className="btn-maroon flex-1 justify-center disabled:opacity-60">
            <Send size={15} className="mr-1" />{saving ? tr('Saving…') : `${tr('Issue')} ${picked.length} ${tr('piece(s)')}`}</button>
        </div>
      </form>
    </div>
  )
}

/** The printed issue slip: pieces (with weights), issued to, purpose, return by, two signatures. */
export function PieceIssueSlip({ slip, onClose }) {
  const temple = useTemple()
  const row = (k, v) => v ? <div className="flex justify-between gap-3"><span className="text-gray-500">{k}:</span><span className="font-semibold text-right">{v}</span></div> : null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 no-print" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">
        <div id="print-area" className="px-6 py-5 relative overflow-y-auto">
          <div className="text-center border-b border-dashed border-gray-300 pb-3 mb-3">
            <div className="font-serif text-lg font-bold text-maroon-800">{getLang() === 'te' ? (temple?.nameTelugu || 'శ్రీ షిర్డీ సాయిబాబా దేవస్థానం') : (temple?.name || 'Shri Shirdi Sai Baba Temple')}</div>
            {getLang() !== 'te' && <div className="text-sm text-gray-600">{temple?.nameTelugu || 'శ్రీ షిర్డీ సాయిబాబా దేవస్థానం'}</div>}
            <div className="font-semibold text-gray-800 mt-2"><T>Store Issue Slip — Items</T></div>
          </div>
          <div className="space-y-2 text-[0.875rem]">
            {row(tr('Slip No'), slip.code)}
            {row(tr('Issued on'), fmtStamp(slip.issued_at))}
            {row(tr('Issued to'), staffName(slip.issued_to))}
            {row(tr('Purpose'), tr(slip.purpose))}
            <div className="flex justify-between text-base font-bold border-y border-gray-200 py-2"><span><T>Return by</T>:</span><span className="text-maroon-700">{fmtDate(slip.return_by)}</span></div>
          </div>
          <table className="w-full text-[0.8125rem] mt-3">
            <thead><tr className="text-left text-[0.6875rem] uppercase text-gray-500 border-b border-gray-200">
              <th className="py-1.5">{tr('ID')}</th><th className="py-1.5">{tr('Item')}</th><th className="py-1.5 text-right">{tr('Weight')}</th><th className="py-1.5 text-right">{tr('Returned')}</th></tr></thead>
            <tbody>{slip.lines.map((l) => (
              <tr key={l.id} className="border-b border-gray-100">
                <td className="py-1.5 font-mono font-semibold">{l.tag_id}</td>
                <td className="py-1.5">{tr(l.description || l.item_name)}{l.purity ? ` · ${l.purity}` : ''}</td>
                <td className="py-1.5 text-right">{l.weight_g != null ? `${qty(l.weight_g)} ${gramUnit()}` : '—'}</td>
                <td className="py-1.5 text-right text-[0.75rem]">{l.returned_at ? `${fmtDate(l.returned_at)}${l.condition === 'Damaged' ? ` · ${tr('Damaged')}` : ''}` : '☐'}</td>
              </tr>))}</tbody>
          </table>
          <div className="mt-3 space-y-2 text-[0.875rem]">
            {row(tr('Issued by'), staffName(slip.issued_by))}
            {row(tr('Notes'), slip.notes)}
          </div>
          <div className="grid grid-cols-2 gap-6 mt-10 text-center text-[0.75rem] text-gray-600">
            <div className="border-t border-gray-400 pt-1"><T>Issued by (signature)</T></div>
            <div className="border-t border-gray-400 pt-1"><T>Received by (signature)</T></div>
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

/** Take pieces back from a slip: tick, condition, note; back to their own shelf or another. */
export function ReturnDialog({ slip, locations, onClose, onDone }) {
  const open = slip.lines.filter((l) => !l.returned_at)
  const [rows, setRows] = useState(() => Object.fromEntries(open.map((l) => [l.id, { tick: true, condition: 'Good', note: '' }])))
  const [locationId, setLocationId] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (id, patch) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }))
  const ticked = open.filter((l) => rows[l.id]?.tick)

  async function save(e) {
    e.preventDefault()
    if (!ticked.length) { toast(tr('Tick the pieces that came back.'), 'error'); return }
    setSaving(true)
    try {
      const s = await StoresAPI.returnIssue(slip.id, { location_id: locationId ? Number(locationId) : null,
        lines: ticked.map((l) => ({ line_id: l.id, condition: rows[l.id].condition, note: rows[l.id].note.trim() || null })) })
      toast(`${s.code}: ${ticked.length} ${tr('piece(s) returned')}${s.out ? ` · ${s.out} ${tr('still out')}` : ''}`)
      changed(); onDone?.(s)
    } catch (ex) { toast(errText(ex, 'Could not record the return.'), 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !saving && onClose()} />
      <form onSubmit={save} className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-serif text-lg font-bold text-maroon-800"><T>Return items</T> — {slip.code}</h3>
          <div className="text-[0.75rem] text-gray-500">{staffName(slip.issued_to)} · {tr(slip.purpose)} · {tr('Return by')} {fmtDate(slip.return_by)}</div></div>
        <div className="px-5 py-4 overflow-y-auto space-y-2">
          {open.map((l) => (
            <div key={l.id} className={`grid grid-cols-12 gap-2 items-center rounded-lg border p-2 ${rows[l.id].tick ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <label className="col-span-12 sm:col-span-5 flex items-center gap-2 text-[0.8125rem]">
                <input type="checkbox" checked={rows[l.id].tick} onChange={(e) => set(l.id, { tick: e.target.checked })} className="accent-maroon-700 w-4 h-4" />
                <span className="font-mono font-semibold text-maroon-700">{l.tag_id}</span>
                <span className="truncate">{tr(l.description || l.item_name)}{l.weight_g != null ? ` · ${qty(l.weight_g)} ${gramUnit()}` : ''}</span>
              </label>
              <div className="col-span-5 sm:col-span-3">
                <Select className="input !py-1.5" value={rows[l.id].condition} onChange={(e) => set(l.id, { condition: e.target.value })}>
                  <option value="Good">{tr('Good')}</option><option value="Damaged">{tr('Damaged')}</option>
                </Select></div>
              <input className="input !py-1.5 col-span-7 sm:col-span-4" maxLength={200} value={rows[l.id].note} onChange={(e) => set(l.id, { note: e.target.value })} placeholder={tr('Note')} />
              <div className="col-span-12 text-[0.6875rem] text-gray-500 pl-6">{tr('Back to')}: {tr(l.from_location || '—')}</div>
            </div>))}
          <div className="pt-2"><label className="label"><T>Put back in</T></label>
            <Select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">{tr('Each to the shelf it came from')}</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}
            </Select></div>
          {ticked.some((l) => rows[l.id].condition === 'Damaged') && (
            <div className="text-[0.75rem] text-amber-800 bg-amber-50 rounded-lg px-3 py-2"><T>Damaged pieces come back In Store with a note in their history. Write them off from the Stock Register if they cannot be used.</T></div>)}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" disabled={saving} onClick={onClose} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
          <button disabled={saving || !ticked.length} className="btn-maroon flex-1 justify-center disabled:opacity-60"><Undo2 size={15} className="mr-1" />{saving ? tr('Saving…') : `${tr('Return')} ${ticked.length} ${tr('piece(s)')}`}</button>
        </div>
      </form>
    </div>
  )
}

export function SlipStatus({ s }) {
  if (s.overdue) return <Pill tone="red">{tr('Overdue')}</Pill>
  return <Pill tone={s.status === 'Returned' ? 'green' : s.status === 'Open' ? 'maroon' : 'amber'}>{tr(s.status)}</Pill>
}
