import { Link } from 'react-router-dom'
import React, { useEffect, useState } from 'react'
import { Printer, ClipboardCheck, CheckCircle2, AlertTriangle } from 'lucide-react'
import { PageTitle, Pill, fmtStamp } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { Select, Checkbox } from '../../../components/common/Field.jsx'
import { confirmDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { useStoresMeta, staffName, sourceRef, StoresTabs } from './shared.jsx'
import { guardExport } from '../../../lib/exportGuard.js'

// Who may record a check (backend: Counter Staff, Committee, Stores Officer, Administrator)
const canCheck = (user) => ['Admin', 'Administrator', 'Stores Officer'].includes(user?.role)

export default function StockCheck() {
  const { user } = useAuth()
  const { lang } = useLang()
  const { locations } = useStoresMeta()
  const [lid, setLid] = useState('')
  const [expected, setExpected] = useState(null)
  const [found, setFound] = useState({})
  // Bundles (2026-11-27): pieces counted, by record id — blank means every piece is there
  const [counts, setCounts] = useState({})
  const [notes, setNotes] = useState('')
  const [checks, setChecks] = useState([])
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState(false)
  // Print first says which location and how many pieces; the sheet carries it; the Audit Trail records it (2026-11-26)
  const [printHeading, setPrintHeading] = useState('')
  async function printChecklist() {
    const heading = await guardExport({ screen: 'Stock Check', format: 'Print', noDates: true,
      filters: [['Location', expected?.location]], count: nExpected, user })
    if (heading == null) return
    setPrintHeading(heading)
    setTimeout(() => window.print(), 50)
  }

  const loadChecks = () => StoresAPI.checks().then((r) => setChecks(r.items || [])).catch(() => setChecks([]))
  useEffect(() => { loadChecks() }, [])
  useEffect(() => {
    setExpected(null); setFound({}); setCounts({}); setResult(null); setNotes('')
    if (!lid) return
    StoresAPI.expectedAt(lid).then(setExpected).catch((ex) => toast(tr(getErrorMessage(ex, 'Could not load the list.')), 'error'))
  }, [lid])

  const items = expected?.items || []
  const many = (i) => (i.pieces || 1) > 1
  // Pieces found: a ticked bundle counts what was entered (blank = all of them)
  const gotOf = (i) => {
    if (!found[i.id]) return 0
    if (!many(i) || counts[i.id] === undefined || counts[i.id] === '') return i.pieces || 1
    return Math.max(0, Math.min(i.pieces, Math.floor(Number(counts[i.id]) || 0)))
  }
  const nExpected = items.reduce((t, i) => t + (i.pieces || 1), 0)
  const nFound = items.reduce((t, i) => t + gotOf(i), 0)
  async function save() {
    const missing = nExpected - nFound
    if (missing && !(await confirmDialog({ title: tr('Save stock check'), confirmLabel: tr('Save'), tone: 'danger',
      message: `${missing} ${tr('piece(s) not found will be marked Missing and listed under Missing Items for follow-up. Nothing is written off.')}` }))) return
    setSaving(true)
    try {
      const r = await StoresAPI.recordCheck({ location_id: Number(lid), listed_ids: items.map((i) => i.id),
        found_ids: items.filter((i) => found[i.id]).map((i) => i.id),
        counts: Object.fromEntries(items.filter((i) => found[i.id] && many(i) && gotOf(i) !== i.pieces).map((i) => [i.id, gotOf(i)])),
        notes: notes.trim() || null })
      setResult(r); toast(`${r.code}: ${r.found}/${r.expected} ${tr('found')}`); loadChecks()
      if (r.missing.length) window.dispatchEvent(new Event('stores:changed'))   // Missing Items badge
    } catch (ex) {
      toast(tr(getErrorMessage(ex, 'Could not save the check.')).replace(/^Value error, /, ''), 'error')
      // The pieces at this location changed meanwhile: show the fresh list (ticks for pieces still there are kept)
      if (ex?.status === 409 || ex?.status === 422) StoresAPI.expectedAt(lid).then(setExpected).catch(() => {})
    }
    finally { setSaving(false) }
  }

  return (
    <div>
      <StoresTabs group="check" />
      <PageTitle title={tr('Stock Check')} subtitle={tr('Physically verify a store location: tick every sticker you find. Pieces not found are recorded as missing for follow-up.')} />
      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="p-5 flex flex-wrap items-end gap-3 border-b border-gray-100 no-print">
            <div className="w-[16rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Location</T></label>
              <Select className="input" value={lid} onChange={(e) => setLid(e.target.value)}>
                <option value="">{tr('Select')}</option>{locations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)} ({l.pieces})</option>)}
              </Select></div>
            {items.length > 0 && <>
              <button onClick={printChecklist} className="btn-outline !py-2.5"><Printer size={14} />{' '}<T>Print checklist</T></button>
              <button onClick={() => setFound(Object.fromEntries(items.map((i) => [i.id, true])))} className="text-[0.8125rem] font-semibold text-maroon-700"><T>Tick all</T></button>
            </>}
          </div>
          {expected && (
            <div id="print-area">
              <div className="px-5 pt-4 hidden print:block"><b>{tr('Stock Check')} — {tr(expected.location)}</b> · {printHeading}</div>
              <div className="divide-y divide-gray-100">
                {items.map((i) => (
                  <label key={i.id} className="flex items-center gap-3 px-5 py-2.5 text-[0.8125rem] cursor-pointer hover:bg-gray-50">
                    <Checkbox checked={!!found[i.id]} onChange={() => setFound((f) => ({ ...f, [i.id]: !f[i.id] }))} />
                    <span className="font-mono font-semibold text-maroon-700 w-24 shrink-0">{i.tag_id}</span>
                    <span className="flex-1 min-w-0"><span className="text-gray-800">{tr(i.description || i.item_name)}</span>{i.status === 'In Open Sale' && <> <Pill tone="violet">{tr('In Open Sale')}</Pill></>}
                      <span className="text-gray-500">{[tr(i.details), i.weight_g ? `${i.weight_g} ${gramUnit()}` : ''].filter(Boolean).map((x) => ` · ${x}`).join('')}</span>
                      {many(i) && (found[i.id]
                        ? <span className="block mt-1 text-[0.75rem] text-indigo-800" onClick={(e) => { if (e.target.tagName !== 'INPUT') e.preventDefault() }}>{tr('Counted')}{' '}
                            <input type="number" min="0" max={i.pieces} step="1" value={counts[i.id] ?? i.pieces} aria-label={tr('Counted')}
                              onChange={(e) => setCounts((c) => ({ ...c, [i.id]: e.target.value }))}
                              className="w-14 rounded border border-indigo-300 px-1.5 py-0.5 text-[0.78rem] bg-white no-print" />
                            <span className="hidden print:inline">____</span>{' '}{tr('of')} {i.pieces} {tr('pieces')}
                            {gotOf(i) < i.pieces && <span className="text-red-600"> · {i.pieces - gotOf(i)} {tr('short')}</span>}</span>
                        : <span className="block mt-1 text-[0.75rem] text-indigo-800">{i.bundle ? `${tr('Bundle')} · ` : ''}{i.pieces} {tr('pieces')} <span className="hidden print:inline">· {tr('Counted')} ____</span></span>)}</span>
                    <span className="text-[0.75rem] text-gray-500 shrink-0 text-right">{personName({ name: i.donor_name }, lang)}<br /><span className="font-mono">{sourceRef(i)}</span></span>
                  </label>
                ))}
                {!items.length && <div className="px-5 py-10 text-center text-gray-500"><T>No pieces are expected at this location.</T></div>}
              </div>
            </div>
          )}
          {items.length > 0 && (
            <div className="p-5 border-t border-gray-100 space-y-3 no-print">
              <div className="text-[0.875rem]"><b>{nFound}</b> / {nExpected} {tr('found')}{nExpected - nFound > 0 && <span className="text-red-600"> · {nExpected - nFound} {tr('not found')}</span>}</div>
              <input className="input" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr('Notes (optional), e.g. who was present')} />
              {canCheck(user)
                ? <button disabled={saving} onClick={save} className="btn-maroon !py-2.5 disabled:opacity-60"><ClipboardCheck size={15} />{' '}{saving ? tr('Saving…') : tr('Save stock check')}</button>
                : <div className="text-[0.75rem] text-gray-500"><T>The Stores Officer records the check.</T></div>}
              {result && (
                <div className={`rounded-lg px-4 py-3 text-[0.8125rem] border ${result.missing.length ? 'bg-red-50 border-red-100 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-800'}`}>
                  {result.missing.length ? <AlertTriangle size={15} className="inline mr-1" /> : <CheckCircle2 size={15} className="inline mr-1" />}
                  <b>{result.code}</b>: {result.found}/{result.expected} {tr('found')}{result.missing.length ? ` — ${tr('missing')}: ${result.missing.join(', ')}` : ` — ${tr('everything is in place.')}`}
                  {result.missing.length > 0 && <Link to="/admin/stores/missing" className="block mt-1 font-semibold underline">{result.missing.length} {tr('piece(s) marked Missing → see Missing Items')}</Link>}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm no-print">
          <h3 className="font-serif text-lg font-bold text-maroon-800 px-5 pt-4 pb-2"><T>Past checks</T></h3>
          <div className="divide-y divide-gray-100">
            {checks.map((c) => (
              <div key={c.id} className="px-5 py-3 text-[0.8125rem]">
                <div className="flex items-center justify-between gap-2"><span><b className="font-mono">{c.code}</b> · {tr(c.location)}</span>
                  <Pill tone={c.missing.length ? 'red' : 'green'}>{c.found}/{c.expected}</Pill></div>
                <div className="text-[0.6875rem] text-gray-500">{staffName(c.checked_by)} · {fmtStamp(c.created_at)}</div>
                {c.missing.length > 0 && <div className="text-[0.75rem] text-red-600 mt-0.5">{tr('missing')}: <span className="font-mono">{c.missing.join(', ')}</span></div>}
                {c.notes && <div className="text-[0.75rem] text-gray-600 mt-0.5">{tr(c.notes)}</div>}
              </div>
            ))}
            {!checks.length && <div className="px-5 py-8 text-center text-gray-500 text-[0.8125rem]"><T>No checks recorded yet.</T></div>}
          </div>
        </div>
      </div>
    </div>
  )
}
