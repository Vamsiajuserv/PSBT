import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X, Search, Trash2, Pencil, Send, Undo2, PackageOpen, Receipt as ReceiptIcon, AlertTriangle } from 'lucide-react'
import { PageTitle, Pill, fmtDate, fmtStamp } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { Select, NumberField, DateField, Combobox, Checkbox } from '../../../components/common/Field.jsx'
import { confirmDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, getLang, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { canIssueStock, staffName, useStoresMeta, STATUS_TONE } from './shared.jsx'
import { PieceIssueSlip, ReturnDialog, SlipStatus } from './issue.jsx'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const changed = () => window.dispatchEvent(new Event('stores:changed'))
const GONE = ['Sold', 'Written Off']

// Festival Kits: a saved set of pieces (and consumables used up) issued together for an event.
// Issuing makes one ordinary issue slip; the pieces come back through it.
export default function FestivalKits() {
  const { user } = useAuth()
  const canEdit = canIssueStock(user)          // Stores Officer + Administrator
  const { activeLocations } = useStoresMeta()
  const [tab, setTab] = useState('kits')
  const [kits, setKits] = useState([])
  const [slips, setSlips] = useState([])
  const [slipTab, setSlipTab] = useState('out')
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [editing, setEditing] = useState(null)
  const [issuing, setIssuing] = useState(null)
  const [returning, setReturning] = useState(null)
  const [printing, setPrinting] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setLoadErr('')
    const p = tab === 'kits' ? StoresAPI.kits().then((d) => setKits(d.items || []))
      : StoresAPI.kitsIssued({ tab: slipTab }).then((d) => setSlips(d.items || []))
    p.catch((ex) => setLoadErr(errText(ex, 'Could not load the kits.'))).finally(() => setLoading(false))
  }, [tab, slipTab])
  useEffect(() => { load() }, [load])

  async function remove(k) {
    const ok = await confirmDialog({ title: `${tr('Remove kit')} ${k.name}`, tone: 'danger', confirmLabel: tr('Remove'),
      message: tr('The kit list is removed. Its pieces stay in the store and past issue slips are kept.') })
    if (!ok) return
    try { await StoresAPI.removeKit(k.id); toast(tr('Kit removed.')); load() } catch (ex) { toast(errText(ex, 'Could not remove the kit.'), 'error') }
  }
  const tabBtn = (k, label, cur, set) => (
    <button onClick={() => set(k)} className={`px-4 py-2 rounded-lg text-[0.8125rem] font-semibold ${cur === k ? 'bg-maroon-700 text-cream' : 'text-gray-600 hover:bg-gray-100'}`}>{tr(label)}</button>)

  return (
    <div>
      <PageTitle title={tr('Festival Kits')} subtitle={tr('Save the set of pieces an event needs, then issue it in one step. Pieces come back on the same issue slip.')}
        actions={canEdit && tab === 'kits' && <button onClick={() => setEditing({ name: '', notes: '', pieces: [], consumables: [] })} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>New kit</T></button>} />

      <div className="flex gap-1 mb-4">{tabBtn('kits', 'Kits', tab, setTab)}{tabBtn('issued', 'Issued kits', tab, setTab)}</div>

      {tab === 'kits' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {kits.map((k) => {
            const avail = k.pieces.filter((p) => p.available).length
            return (
              <div key={k.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="font-serif text-lg font-bold text-maroon-800">{tr(k.name)}</div>
                    <div className="text-[0.75rem] text-gray-500"><span className="font-mono">{k.code}</span> · {k.pieces.length} {tr('piece(s)')}{k.consumables.length ? ` + ${k.consumables.length} ${tr('consumable(s)')}` : ''}</div></div>
                  {k.out ? <Pill tone={k.out.overdue ? 'red' : 'maroon'}>{tr('Out')} · {tr('due')} {fmtDate(k.out.return_by)}</Pill>
                    : <Pill tone={avail === k.pieces.length ? 'green' : 'amber'}>{avail}/{k.pieces.length} {tr('in store')}</Pill>}
                </div>
                {k.notes && <div className="text-[0.8125rem] text-gray-600 mt-2">{k.notes}</div>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {k.pieces.map((p) => (
                    <Link key={p.id} to={`/admin/stores/item/${p.tag_id}`} title={tr(p.status)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.75rem] ${p.available ? 'bg-maroon-50 text-maroon-800' : 'bg-gray-100 text-gray-500'}`}>
                      <span className="font-mono font-semibold">{p.tag_id}</span> {tr(p.description || p.item_name)}
                      {p.weight_g != null && <span className="opacity-70">· {qty(p.weight_g)} {gramUnit()}</span>}
                      {!p.available && <span className="text-[0.6875rem]">({tr(p.status)})</span>}
                    </Link>))}
                </div>
                {k.consumables.length > 0 && (
                  <div className="mt-3 text-[0.8125rem] text-gray-700"><span className="text-gray-500">{tr('Consumables (used, not returned)')}:</span>{' '}
                    {k.consumables.map((c, n) => <span key={c.category_id} className={c.enough ? '' : 'text-red-700 font-semibold'}>{n ? ' · ' : ''}{tr(c.name)} {qty(c.quantity)} {tr(c.unit || '')}{!c.enough && ` (${qty(c.remaining)} ${tr('left')})`}</span>)}</div>)}
                {k.out && <div className="mt-3 text-[0.75rem] text-gray-600 bg-maroon-50/50 rounded-lg px-3 py-2">{k.out.code} · {staffName(k.out.issued_to)} · {tr(k.out.purpose)} · {k.out.out} {tr('still out')}
                  {canEdit && <button onClick={() => setReturning(k.out)} className="ml-2 font-semibold text-emerald-700 hover:underline">{tr('Return')}</button>}</div>}
                {canEdit && (
                  <div className="mt-4 flex gap-2">
                    {!k.out && <button onClick={() => setIssuing(k)} className="btn-maroon !py-2 text-[0.8125rem]"><Send size={14} />{' '}<T>Issue kit</T></button>}
                    <button onClick={() => setEditing({ id: k.id, name: k.name, notes: k.notes || '', pieces: k.pieces, consumables: k.consumables.map((c) => ({ category_id: String(c.category_id), quantity: String(c.quantity) })) })}
                      className="btn-outline !py-2 text-[0.8125rem]"><Pencil size={14} />{' '}<T>Edit</T></button>
                    {!k.out && <button onClick={() => remove(k)} className="btn-outline !py-2 text-[0.8125rem] !text-red-600" title={tr('Remove kit')} aria-label={tr('Remove kit')}><Trash2 size={14} /></button>}
                  </div>)}
              </div>)
          })}
          {!kits.length && (
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-10 text-center text-[0.8125rem] text-gray-500">
              {loading ? tr('Loading…') : loadErr || tr('No kits yet. Make one for an event you hold every year — Dasara, Karthika deepam, Sai Baba Jayanti.')}</div>)}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 flex gap-1 border-b border-gray-100">{tabBtn('out', 'Out now', slipTab, setSlipTab)}{tabBtn('history', 'History', slipTab, setSlipTab)}</div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              {['Kit', 'Slip', 'Pieces', 'Issued to', 'Issued', 'Return by', 'Status', 'Actions'].map((h) => <th key={h} className="px-3 py-3 font-semibold whitespace-nowrap">{tr(h)}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {slips.map((s) => (
                <tr key={s.id} className={s.overdue ? 'bg-red-50/60' : 'hover:bg-gray-50/60'}>
                  <td className="px-3 py-3 font-semibold text-gray-800">{tr(s.kit_name)}<div className="text-[0.75rem] text-gray-500 font-normal">{tr(s.purpose)}</div></td>
                  <td className="px-3 py-3 font-mono text-[0.78rem] font-semibold text-maroon-700">{s.code}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{s.lines.length - s.out}/{s.lines.length} {tr('back')}</td>
                  <td className="px-3 py-3">{staffName(s.issued_to)}</td>
                  <td className="px-3 py-3 text-[0.8125rem] text-gray-600 whitespace-nowrap">{fmtStamp(s.issued_at)}</td>
                  <td className={`px-3 py-3 whitespace-nowrap font-semibold ${s.overdue ? 'text-red-700' : ''}`}>{fmtDate(s.return_by)}{s.overdue && ' ⚠'}</td>
                  <td className="px-3 py-3"><SlipStatus s={s} /></td>
                  <td className="px-3 py-3"><div className="flex gap-1.5">
                    <button onClick={() => setPrinting(s)} title={tr('Issue slip')} aria-label={tr('Issue slip')} className="w-8 h-8 grid place-items-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"><ReceiptIcon size={15} /></button>
                    {canEdit && s.out > 0 && <button onClick={() => setReturning(s)} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-[0.75rem] font-semibold"><Undo2 size={14} />{tr('Return')}</button>}
                  </div></td>
                </tr>))}
              {!slips.length && <TableStates colSpan={8} loading={loading} error={loadErr} onRetry={load} empty={slipTab === 'out' ? tr('No kit is out now.') : tr('No kit has been issued yet.')} />}
            </tbody></table></div>
        </div>
      )}

      {editing && <KitEditor kit={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {issuing && <IssueKit kit={issuing} onClose={() => { setIssuing(null); load() }} />}
      {returning && <ReturnDialog slip={returning} locations={activeLocations} onClose={() => setReturning(null)} onDone={() => { setReturning(null); load() }} />}
      {printing && <PieceIssueSlip slip={printing} onClose={() => setPrinting(null)} />}
    </div>
  )
}

function KitEditor({ kit, onClose, onSaved }) {
  const [f, setF] = useState(kit)
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  useEffect(() => { StoresAPI.consumables().then((d) => setItems(d.items || [])).catch(() => setItems([])) }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setFound([]); return }
      StoresAPI.items({ q: q.trim(), size: 20 }).then((r) => setFound((r.items || []).filter((i) => !GONE.includes(i.status)))).catch(() => setFound([]))
    }, 300)
    return () => clearTimeout(t)
  }, [q])
  const picked = useMemo(() => new Set(f.pieces.map((p) => p.id)), [f.pieces])
  const setUse = (n, patch) => setF({ ...f, consumables: f.consumables.map((c, j) => (j === n ? { ...c, ...patch } : c)) })

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const body = { name: f.name.trim(), notes: f.notes.trim() || null, piece_ids: f.pieces.map((p) => p.id),
        consumables: f.consumables.filter((c) => c.category_id && Number(c.quantity) > 0).map((c) => ({ category_id: Number(c.category_id), quantity: Number(c.quantity) })) }
      const k = await (f.id ? StoresAPI.updateKit(f.id, body) : StoresAPI.createKit(body))
      toast(`${k.code} ${tr(k.name)} ${tr('saved.')}`); onSaved()
    } catch (ex) { toast(errText(ex, 'Could not save the kit.'), 'error') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form onSubmit={save} className="relative w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
          <div><h3 className="font-serif text-xl font-bold text-maroon-800">{f.id ? tr('Edit kit') : tr('New kit')}</h3>
            <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Pieces go out and come back. Consumables are used up when the kit is issued.</T></p></div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={20} /></button>
        </div>
        <div className="px-6 py-5 space-y-4 flex-1">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label"><T>Kit name *</T></label>
              <input required className="input" maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={tr('e.g. Dasara Alankaram')} /></div>
            <div><label className="label"><T>Notes</T></label>
              <input className="input" maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          </div>
          <div><label className="label"><T>Pieces</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search pieces: SLV-…, PAN-…, description')} /></div>
            {found.length > 0 && (
              <div className="mt-1 border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                {found.filter((i) => !picked.has(i.id)).map((i) => (
                  <button type="button" key={i.id} onClick={() => { setF({ ...f, pieces: [...f.pieces, i] }); setQ('') }}
                    className="w-full text-left px-3 py-2 text-[0.8125rem] hover:bg-cream/60 flex items-center gap-2">
                    <Plus size={13} className="text-maroon-700" /><span className="font-mono font-semibold text-maroon-700">{i.tag_id}</span>
                    <span>{tr(i.description || i.item_name)}</span>
                    {i.weight_g != null && <span className="text-gray-500">· {qty(i.weight_g)} {gramUnit()}</span>}
                    <span className="ml-auto"><Pill tone={STATUS_TONE[i.status] || 'gray'}>{tr(i.status)}</Pill></span>
                  </button>))}
              </div>)}
            <div className="mt-2 flex flex-wrap gap-2">
              {f.pieces.map((i) => (
                <span key={i.id} className="inline-flex items-center gap-1.5 rounded-full bg-maroon-50 text-maroon-800 px-3 py-1 text-[0.78rem]">
                  <span className="font-mono font-semibold">{i.tag_id}</span> {tr(i.description || i.item_name)}
                  <button type="button" onClick={() => setF({ ...f, pieces: f.pieces.filter((x) => x.id !== i.id) })} aria-label={tr('Remove')}><Trash2 size={12} /></button>
                </span>))}
              {!f.pieces.length && <span className="text-[0.75rem] text-gray-400"><T>No pieces picked yet.</T></span>}
            </div>
          </div>
          <div><label className="label"><T>Consumables used</T></label>
            <div className="space-y-2">
              {f.consumables.map((c, n) => (
                <div key={n} className="flex items-center gap-2">
                  <div className="flex-1"><Select className="input !py-1.5" value={c.category_id} onChange={(e) => setUse(n, { category_id: e.target.value })}>
                    <option value="">{tr('Select')}</option>
                    {items.map((i) => <option key={i.category_id} value={i.category_id}>{tr(i.name)} ({tr(i.unit || '')})</option>)}
                  </Select></div>
                  <div className="w-32"><NumberField min="0.001" step="0.001" className="!py-1.5" value={c.quantity} onChange={(e) => setUse(n, { quantity: e.target.value })} placeholder={tr('Qty')} /></div>
                  <button type="button" onClick={() => setF({ ...f, consumables: f.consumables.filter((_, j) => j !== n) })} aria-label={tr('Remove')}
                    className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-600 hover:text-red-600"><Trash2 size={14} /></button>
                </div>))}
            </div>
            <button type="button" onClick={() => setF({ ...f, consumables: [...f.consumables, { category_id: '', quantity: '' }] })} className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-maroon-700"><Plus size={14} />{tr('Add consumable')}</button>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
          <button type="button" onClick={onClose} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
          <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60">{saving ? tr('Saving…') : tr('Save kit')}</button>
        </div>
      </form>
    </div>
  )
}

function IssueKit({ kit, onClose }) {
  const [meta, setMeta] = useState({ purposes: [], poojaris: [] })
  const [tick, setTick] = useState(() => Object.fromEntries(kit.pieces.map((p) => [p.id, p.available])))
  const [useCons, setUseCons] = useState(kit.consumables.length > 0)
  const [f, setF] = useState({ issued_to: '', poojari_id: '', purpose: 'Festival', return_by: today(), notes: '' })
  const [saving, setSaving] = useState(false)
  const [slip, setSlip] = useState(null)
  useEffect(() => { StoresAPI.issueMeta().then(setMeta).catch(() => {}) }, [])
  const ids = kit.pieces.filter((p) => p.available && tick[p.id]).map((p) => p.id)
  const short = useCons && kit.consumables.some((c) => !c.enough)
  const poojariOptions = meta.poojaris.map((p) => ({ value: p.name, label: getLang() === 'te' ? (p.name_te || staffName(p.name)) : p.name }))

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await StoresAPI.issueKit(kit.id, { ids, issued_to: f.issued_to.trim(), poojari_id: f.poojari_id || null, purpose: f.purpose.trim(),
        return_by: f.return_by, notes: f.notes.trim() || null, use_consumables: useCons })
      toast(`${tr(kit.name)}: ${r.slip ? `${r.slip.code} · ${r.slip.lines.length} ${tr('piece(s)')}` : ''}${r.uses.length ? ` · ${r.uses.map((u) => u.code).join(', ')}` : ''}`)
      changed()
      if (r.slip) setSlip(r.slip); else onClose()
    } catch (ex) { toast(errText(ex, 'Could not issue the kit.'), 'error') } finally { setSaving(false) }
  }

  if (slip) return <PieceIssueSlip slip={slip} onClose={onClose} />
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !saving && onClose()} />
      <form onSubmit={save} className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-serif text-lg font-bold text-maroon-800"><PackageOpen size={17} className="inline mr-1.5 -mt-0.5" /><T>Issue kit</T> — {tr(kit.name)}</h3>
          <div className="text-[0.75rem] text-gray-500">{tr('One issue slip for the ticked pieces. Pieces not in store cannot go.')}</div></div>
        <div className="px-5 py-4 overflow-y-auto space-y-4">
          <div className="space-y-1.5">
            {kit.pieces.map((p) => (
              <div key={p.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[0.8125rem] ${p.available ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                <Checkbox checked={!!(p.available && tick[p.id])} disabled={!p.available} onChange={(e) => setTick({ ...tick, [p.id]: e.target.checked })} aria-label={p.tag_id} />
                <span className="font-mono font-semibold text-maroon-700">{p.tag_id}</span>
                <span>{tr(p.description || p.item_name)}{p.weight_g != null ? ` · ${qty(p.weight_g)} ${gramUnit()}` : ''}</span>
                <span className="ml-auto text-gray-500">{p.available ? tr(p.location || '') : <Pill tone={STATUS_TONE[p.status] || 'gray'}>{tr(p.status)}</Pill>}</span>
              </div>))}
          </div>
          {kit.consumables.length > 0 && (
            <div className="flex items-start gap-2 text-[0.8125rem] bg-gray-50 rounded-lg px-3 py-2">
              <Checkbox checked={useCons} onChange={(e) => setUseCons(e.target.checked)} aria-label={tr('Record consumables as used')} />
              <span>{tr('Record consumables as used')}: {kit.consumables.map((c) => `${tr(c.name)} ${qty(c.quantity)} ${tr(c.unit || '')}`).join(' · ')}
                {short && <span className="block text-red-700"><AlertTriangle size={13} className="inline mr-1" />{tr('Not enough in stock for some of them.')}</span>}</span>
            </div>)}
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label"><T>Issued to *</T></label>
              <Combobox required value={f.issued_to} onChange={(e) => { const pj = meta.poojaris.find((p) => p.name === e.target.value); setF({ ...f, issued_to: e.target.value, poojari_id: pj ? pj.id : '' }) }}
                options={poojariOptions} placeholder={tr('Poojari, or type a name')} className="input" /></div>
            <div><label className="label"><T>Purpose *</T></label>
              <Combobox required value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} options={meta.purposes.map((p) => ({ value: p, label: tr(p) }))} placeholder={tr('Select or type')} className="input" /></div>
            <div><label className="label"><T>Return by *</T></label>
              <DateField required value={f.return_by} min={today()} onChange={(e) => setF({ ...f, return_by: e.target.value })} className="input" /></div>
            <div><label className="label"><T>Notes</T></label>
              <input className="input" maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" disabled={saving} onClick={onClose} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
          <button disabled={saving || (!ids.length && !useCons) || short} className="btn-maroon flex-1 justify-center disabled:opacity-60">
            <Send size={15} className="mr-1" />{saving ? tr('Saving…') : `${tr('Issue')} ${ids.length} ${tr('piece(s)')}`}</button>
        </div>
      </form>
    </div>
  )
}
