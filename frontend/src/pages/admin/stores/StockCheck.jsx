import React, { useEffect, useState } from 'react'
import { Printer, ClipboardCheck, CheckCircle2, AlertTriangle } from 'lucide-react'
import { PageTitle, Pill, fmtStamp } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { Select, Checkbox } from '../../../components/common/Field.jsx'
import { confirmDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang } from '../../../i18n/LanguageContext.jsx'
import { useStoresMeta } from './shared.jsx'

// Who may record a check (backend: Counter Staff, Committee, Administrator)
const canCheck = (user) => ['Admin', 'Administrator', 'Counter Staff', 'Committee'].includes(user?.role)

export default function StockCheck() {
  const { user } = useAuth()
  const { lang } = useLang()
  const { locations } = useStoresMeta()
  const [lid, setLid] = useState('')
  const [expected, setExpected] = useState(null)
  const [found, setFound] = useState({})
  const [notes, setNotes] = useState('')
  const [checks, setChecks] = useState([])
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadChecks = () => StoresAPI.checks().then((r) => setChecks(r.items || [])).catch(() => setChecks([]))
  useEffect(() => { loadChecks() }, [])
  useEffect(() => {
    setExpected(null); setFound({}); setResult(null); setNotes('')
    if (!lid) return
    StoresAPI.expectedAt(lid).then(setExpected).catch((ex) => toast(tr(getErrorMessage(ex, 'Could not load the list.')), 'error'))
  }, [lid])

  const items = expected?.items || []
  const nFound = items.filter((i) => found[i.id]).length
  async function save() {
    const missing = items.length - nFound
    if (missing && !(await confirmDialog({ title: tr('Save stock check'), confirmLabel: tr('Save'), tone: 'danger',
      message: `${missing} ${tr('piece(s) not ticked will be recorded as MISSING. Nothing is written off — the committee follows up.')}` }))) return
    setSaving(true)
    try {
      const r = await StoresAPI.recordCheck({ location_id: Number(lid), listed_ids: items.map((i) => i.id),
        found_ids: items.filter((i) => found[i.id]).map((i) => i.id), notes: notes.trim() || null })
      setResult(r); toast(`${r.code}: ${r.found}/${r.expected} ${tr('found')}`); loadChecks()
    } catch (ex) {
      toast(tr(getErrorMessage(ex, 'Could not save the check.')).replace(/^Value error, /, ''), 'error')
      // The pieces at this location changed meanwhile: show the fresh list (ticks for pieces still there are kept)
      if (ex?.status === 409 || ex?.status === 422) StoresAPI.expectedAt(lid).then(setExpected).catch(() => {})
    }
    finally { setSaving(false) }
  }

  return (
    <div>
      <PageTitle title={tr('Stock Check')} subtitle={tr('Physically verify a store location: tick every sticker you find. Pieces not found are recorded as missing for follow-up.')} />
      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="p-5 flex flex-wrap items-end gap-3 border-b border-gray-100 no-print">
            <div className="w-[16rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Location</T></label>
              <Select className="input" value={lid} onChange={(e) => setLid(e.target.value)}>
                <option value="">{tr('Select')}</option>{locations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)} ({l.pieces})</option>)}
              </Select></div>
            {items.length > 0 && <>
              <button onClick={() => window.print()} className="btn-outline !py-2.5"><Printer size={14} />{' '}<T>Print checklist</T></button>
              <button onClick={() => setFound(Object.fromEntries(items.map((i) => [i.id, true])))} className="text-[0.8125rem] font-semibold text-maroon-700"><T>Tick all</T></button>
            </>}
          </div>
          {expected && (
            <div id="print-area">
              <div className="px-5 pt-4 hidden print:block"><b>{tr('Stock Check')} — {tr(expected.location)}</b> · {new Date().toLocaleDateString('en-GB')}</div>
              <div className="divide-y divide-gray-100">
                {items.map((i) => (
                  <label key={i.id} className="flex items-center gap-3 px-5 py-2.5 text-[0.8125rem] cursor-pointer hover:bg-gray-50">
                    <Checkbox checked={!!found[i.id]} onChange={() => setFound((f) => ({ ...f, [i.id]: !f[i.id] }))} />
                    <span className="font-mono font-semibold text-maroon-700 w-24 shrink-0">{i.tag_id}</span>
                    <span className="flex-1 min-w-0"><span className="text-gray-800">{tr(i.description || i.item_name)}</span>{i.status === 'In Open Sale' && <> <Pill tone="violet">{tr('In Open Sale')}</Pill></>}
                      <span className="text-gray-500">{[i.details, i.weight_g ? `${i.weight_g} g` : ''].filter(Boolean).map((x) => ` · ${x}`).join('')}</span></span>
                    <span className="text-[0.75rem] text-gray-500 shrink-0 text-right">{personName({ name: i.donor_name }, lang)}<br /><span className="font-mono">{i.source_ref}</span></span>
                  </label>
                ))}
                {!items.length && <div className="px-5 py-10 text-center text-gray-500"><T>No pieces are expected at this location.</T></div>}
              </div>
            </div>
          )}
          {items.length > 0 && (
            <div className="p-5 border-t border-gray-100 space-y-3 no-print">
              <div className="text-[0.875rem]"><b>{nFound}</b> / {items.length} {tr('found')}{items.length - nFound > 0 && <span className="text-red-600"> · {items.length - nFound} {tr('not ticked')}</span>}</div>
              <input className="input" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr('Notes (optional), e.g. who was present')} />
              {canCheck(user)
                ? <button disabled={saving} onClick={save} className="btn-maroon !py-2.5 disabled:opacity-60"><ClipboardCheck size={15} />{' '}{saving ? tr('Saving…') : tr('Save stock check')}</button>
                : <div className="text-[0.75rem] text-gray-500"><T>Counter staff or a committee member records the check.</T></div>}
              {result && (
                <div className={`rounded-lg px-4 py-3 text-[0.8125rem] border ${result.missing.length ? 'bg-red-50 border-red-100 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-800'}`}>
                  {result.missing.length ? <AlertTriangle size={15} className="inline mr-1" /> : <CheckCircle2 size={15} className="inline mr-1" />}
                  <b>{result.code}</b>: {result.found}/{result.expected} {tr('found')}{result.missing.length ? ` — ${tr('missing')}: ${result.missing.join(', ')}` : ` — ${tr('everything is in place.')}`}
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
                <div className="text-[0.6875rem] text-gray-500">{c.checked_by} · {fmtStamp(c.created_at)}</div>
                {c.missing.length > 0 && <div className="text-[0.75rem] text-red-600 mt-0.5">{tr('missing')}: <span className="font-mono">{c.missing.join(', ')}</span></div>}
                {c.notes && <div className="text-[0.75rem] text-gray-600 mt-0.5">{c.notes}</div>}
              </div>
            ))}
            {!checks.length && <div className="px-5 py-8 text-center text-gray-500 text-[0.8125rem]"><T>No checks recorded yet.</T></div>}
          </div>
        </div>
      </div>
    </div>
  )
}
