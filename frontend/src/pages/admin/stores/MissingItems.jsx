import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SearchX, Hourglass, CheckCircle2, XCircle, Info, Search, RotateCcw } from 'lucide-react'
import { PageTitle, StatTile, KpiGrid, Pill, Pager, inr, fmtDate, fmtStamp, num } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { Select, DateField } from '../../../components/common/Field.jsx'
import { promptDialog, confirmDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { canFollowMissing, canDecideLost, staffName, useStoresMeta } from './shared.jsx'

const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const changed = () => window.dispatchEvent(new Event('stores:changed'))
const SIZE = 25
const NO_FILTER = { q: '', category_id: '', location_id: '', date_from: '', date_to: '' }
const CASE_TONE = { Missing: 'red', 'Write-off requested': 'amber', Found: 'green', Lost: 'gray' }

// Missing Items: pieces a stock check did not find. Found → back In Store; or a lost
// write-off asked for with a reason, which the Committee approves (never whoever asked).
export default function MissingItems() {
  const { user } = useAuth()
  const { lang } = useLang()
  const canFollow = canFollowMissing(user)
  const canDecide = canDecideLost(user)
  const { categories, locations, activeLocations } = useStoresMeta()
  const tagged = categories.filter((c) => c.tracking === 'Tagged')
  const [tab, setTab] = useState('open')
  const [f, setF] = useState(NO_FILTER)
  const [applied, setApplied] = useState(NO_FILTER)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState([])
  const [sum, setSum] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [foundFor, setFoundFor] = useState(null)   // { case, location_id, note }

  const load = useCallback(() => {
    setLoading(true); setLoadErr('')
    const params = Object.fromEntries(Object.entries(applied).filter(([, v]) => v !== ''))
    Promise.all([StoresAPI.missing({ ...params, status: tab, page, size: SIZE }), StoresAPI.missingSummary()])
      .then(([d, s]) => { setRows(d.items || []); setTotal(d.total ?? (d.items || []).length); setSum(s) })
      .catch((ex) => { setRows([]); setTotal(0); setLoadErr(errText(ex, 'Could not load missing items.')) })
      .finally(() => setLoading(false))
  }, [tab, applied, page])
  useEffect(() => { load() }, [load])
  const apply = (z) => { setF(z); setPage(1); setApplied(z) }
  const filtered = Object.values(applied).some((v) => v !== '')
  const done = (msg) => { toast(msg); changed(); load() }

  async function found(e) {
    e.preventDefault()
    try {
      await StoresAPI.markFound(foundFor.case.id, { location_id: Number(foundFor.location_id), note: foundFor.note.trim() || null })
      setFoundFor(null); done(`${foundFor.case.tag_id}: ${tr('found — back in store.')}`)
    } catch (ex) { toast(errText(ex, 'Could not mark this piece found.'), 'error') }
  }
  async function reportLost(c) {
    const res = await promptDialog({ title: `${tr('Report lost')} — ${c.tag_id}`, tone: 'danger', confirmLabel: tr('Send to committee'),
      message: tr('The committee decides. The piece stays Missing until they approve the write-off.'),
      fields: [{ k: 'reason', label: tr('Reason'), required: true, placeholder: tr('e.g. Not found after 2 checks') }] })
    if (!res) return
    try { await StoresAPI.reportLost(c.id, res.reason.trim()); done(`${c.tag_id}: ${tr('write-off sent to the committee.')}`) }
    catch (ex) { toast(errText(ex, 'Could not send the write-off.'), 'error') }
  }
  async function approve(c) {
    const ok = await confirmDialog({ title: `${tr('Approve write-off')} — ${c.tag_id}`, tone: 'danger', confirmLabel: tr('Approve'),
      message: `${tr(c.item_name)}${c.weight_g != null ? ` · ${qty(c.weight_g)} ${gramUnit()}` : ''} · ${inr(c.est_value || 0)} — ${c.report_reason}. ${tr('The piece is written off as lost.')}` })
    if (!ok) return
    try { await StoresAPI.approveLost(c.id); done(`${c.tag_id}: ${tr('written off as lost.')}`) }
    catch (ex) { toast(errText(ex, 'Could not approve.'), 'error') }
  }
  async function reject(c) {
    const res = await promptDialog({ title: `${tr('Reject write-off')} — ${c.tag_id}`, confirmLabel: tr('Reject'),
      message: tr('The piece stays Missing and the search goes on.'),
      fields: [{ k: 'reason', label: tr('Reason'), required: true, placeholder: tr('e.g. Search the old shed first') }] })
    if (!res) return
    try { await StoresAPI.rejectLost(c.id, res.reason.trim()); done(`${c.tag_id}: ${tr('write-off rejected — still missing.')}`) }
    catch (ex) { toast(errText(ex, 'Could not reject.'), 'error') }
  }

  const tabBtn = (k, label) => (
    <button onClick={() => { setTab(k); setPage(1) }} className={`px-4 py-2 rounded-lg text-[0.8125rem] font-semibold ${tab === k ? 'bg-maroon-700 text-cream' : 'text-gray-600 hover:bg-gray-100'}`}>{tr(label)}</button>
  )

  return (
    <div>
      <PageTitle title={tr('Missing Items')} subtitle={tr('Pieces a stock check did not find — found again, or written off as lost with committee approval.')} />
      <KpiGrid>
        <StatTile icon={SearchX} color="#dc2626" bg="bg-red-50" title={tr('Missing now')} value={sum ? num(sum.missing_now) : '—'} sub={tr('Open cases')} />
        <StatTile icon={Hourglass} color="#b45309" bg="bg-amber-50" title={tr('Awaiting committee')} value={sum ? num(sum.awaiting_committee) : '—'} sub={tr('Lost write-off asked for')} />
        <StatTile icon={CheckCircle2} color="#059669" bg="bg-emerald-50" title={tr('Found this month')} value={sum ? num(sum.found_month) : '—'} sub={tr('Back in store')} />
        <StatTile icon={XCircle} color="#6b7280" bg="bg-gray-100" title={tr('Lost this month')} value={sum ? num(sum.lost_month) : '—'} sub={tr('Written off')} />
      </KpiGrid>

      <div className="mb-4 flex items-start gap-2 text-[0.8125rem] text-gray-700 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-3">
        <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
        <span>{tr('A piece becomes Missing when a Stock Check does not find it.')} <b>{tr('Stores Officer / Counter Staff')}:</b> {tr('mark it found, or report it lost.')} <b>{tr('Committee')}:</b> {tr('approves or rejects a lost write-off.')}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex gap-1 border-b border-gray-100">{tabBtn('open', 'Open')}{tabBtn('closed', 'Closed')}</div>
        <form onSubmit={(e) => { e.preventDefault(); apply(f) }} className="px-5 py-4 flex flex-wrap items-end gap-3 border-b border-gray-100">
          <div className="flex-1 min-w-[12rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search ID, item or stock check</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input !pl-9" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder={tr('SLV-00003, CHK-0001, donor…')} /></div></div>
          <div className="w-[10rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Item type</T></label>
            <Select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">{tr('All')}</option>{tagged.map((x) => <option key={x.id} value={x.id}>{tr(x.name)}</option>)}</Select></div>
          <div className="w-[10rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Last place</T></label>
            <Select className="input" value={f.location_id} onChange={(e) => setF({ ...f, location_id: e.target.value })}><option value="">{tr('All')}</option>{locations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}</Select></div>
          <div className="w-[9.5rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Missing from</T></label>
            <DateField value={f.date_from} max={f.date_to || undefined} onChange={(e) => setF({ ...f, date_from: e.target.value })} className="input" /></div>
          <div className="w-[9.5rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
            <DateField value={f.date_to} min={f.date_from || undefined} onChange={(e) => setF({ ...f, date_to: e.target.value })} className="input" /></div>
          <button className="btn-maroon !py-2.5 shrink-0"><Search size={14} />{' '}<T>Apply</T></button>
          <button type="button" onClick={() => apply(NO_FILTER)} className="btn-outline !py-2.5 shrink-0"><RotateCcw size={14} />{' '}<T>Clear</T></button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              {['ID', 'Item', 'Last place', 'Missing since', 'Days', 'Value', 'Status', 'Actions'].map((h) => <th key={h} className="px-3 py-3 font-semibold whitespace-nowrap">{tr(h)}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/60 align-top">
                  <td className="px-3 py-3 font-mono text-[0.78rem] whitespace-nowrap"><Link className="text-maroon-700 font-semibold hover:underline" to={`/admin/stores/item/${c.tag_id}`}>{c.tag_id}</Link></td>
                  <td className="px-3 py-3"><div className="font-semibold text-gray-800">{tr(c.description || c.item_name)}</div>
                    <div className="text-[0.6875rem] text-gray-500">{[tr(c.item_name), c.weight_g != null ? `${qty(c.weight_g)} ${gramUnit()}` : '', personName({ name: c.donor_name }, lang)].filter(Boolean).join(' · ')}</div></td>
                  <td className="px-3 py-3 text-gray-700">{tr(c.location || '—')}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-[0.8125rem]"><span className="font-mono">{c.check_code}</span>, {fmtDate(c.missing_since)}</td>
                  <td className="px-3 py-3 tabular-nums">{c.days ?? '—'}</td>
                  <td className="px-3 py-3 tabular-nums">{c.est_value != null ? inr(c.est_value) : '—'}</td>
                  <td className="px-3 py-3"><Pill tone={CASE_TONE[c.status] || 'gray'}>{tr(c.status)}</Pill>
                    {c.status === 'Write-off requested' && <div className="text-[0.6875rem] text-gray-600 mt-1">{c.report_reason} — {staffName(c.reported_by)}</div>}
                    {c.status === 'Missing' && c.decision_note && <div className="text-[0.6875rem] text-amber-700 mt-1">{tr('Write-off rejected')}: {c.decision_note} — {staffName(c.decided_by)}</div>}
                    {c.status === 'Found' && <div className="text-[0.6875rem] text-gray-600 mt-1">{tr(c.found_location || '')} · {staffName(c.found_by)} · {fmtStamp(c.found_at)}{c.found_note ? ` · ${c.found_note}` : ''}</div>}
                    {c.status === 'Lost' && <div className="text-[0.6875rem] text-gray-600 mt-1">{c.report_reason} — {tr('Approved by')} {staffName(c.decided_by)}</div>}</td>
                  <td className="px-3 py-3"><div className="flex flex-wrap items-center gap-1.5">
                    {canFollow && (c.status === 'Missing' || c.status === 'Write-off requested') && (
                      <button onClick={() => setFoundFor({ case: c, location_id: c.location_id ? String(c.location_id) : '', note: '' })} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-[0.75rem] font-semibold whitespace-nowrap"><CheckCircle2 size={14} />{tr('Found')}</button>)}
                    {canFollow && c.status === 'Missing' && (
                      <button onClick={() => reportLost(c)} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-[0.75rem] font-semibold whitespace-nowrap"><XCircle size={14} />{tr('Report lost')}</button>)}
                    {canDecide && c.status === 'Write-off requested' && c.reported_by_user !== user?.username && (<>
                      <button onClick={() => approve(c)} className="h-8 px-2.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-[0.75rem] font-semibold">{tr('Approve')}</button>
                      <button onClick={() => reject(c)} className="h-8 px-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-[0.75rem] font-semibold">{tr('Reject')}</button>
                    </>)}
                  </div></td>
                </tr>))}
              {rows.length === 0 && <TableStates colSpan={8} loading={loading} error={loadErr} onRetry={load}
                empty={filtered ? tr('No pieces match these filters.') : tab === 'open' ? tr('No missing pieces.') : tr('No closed cases yet.')} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit={tr('pieces')} />
        </div>
      </div>

      {foundFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFoundFor(null)} />
          <form onSubmit={found} className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-serif text-lg font-bold text-maroon-800"><T>Mark found</T> — {foundFor.case.tag_id}</h3>
              <div className="text-[0.75rem] text-gray-500">{tr('Last place')}: {tr(foundFor.case.location || '—')}</div></div>
            <div className="px-5 py-4 space-y-4">
              <div><label className="label"><T>Put back in *</T></label>
                <Select required className="input" value={foundFor.location_id} onChange={(e) => setFoundFor({ ...foundFor, location_id: e.target.value })}>
                  <option value="">{tr('Select')}</option>{activeLocations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}
                </Select></div>
              <div><label className="label"><T>Note</T></label>
                <input className="input" maxLength={200} value={foundFor.note} onChange={(e) => setFoundFor({ ...foundFor, note: e.target.value })} placeholder={tr('e.g. Found behind the cupboard')} /></div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => setFoundFor(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button className="btn-maroon flex-1 justify-center"><CheckCircle2 size={15} className="mr-1" /><T>Mark found</T></button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
