import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, X, Printer, CheckCircle2, XCircle, PenLine, Ban, UserCheck, Save, Circle } from 'lucide-react'
import { PageTitle, Pill, Section, fmtStamp } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { Select } from '../../../components/common/Field.jsx'
import { confirmDialog, promptDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, getLang, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { useTemple } from '../../../lib/SiteContext.jsx'
import { canManageStores, isAdminUser, staffName } from './shared.jsx'

const q3 = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }))
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const TONE = { Open: 'amber', Completed: 'green', Cancelled: 'gray' }
const unitOf = (u) => (u === 'g' ? gramUnit() : tr(u || ''))
const nameOf = (u) => (getLang() === 'te' && u?.name_te ? u.name_te : u?.name)

// Handover: the store's charge passes from one Stores Officer to the next. A snapshot of
// what the store holds, counted line by line by the incoming officer, signed by both
// officers and a Committee witness — printed as the charge report.
export default function Handover() {
  const { user } = useAuth()
  const canStart = canManageStores(user)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [open, setOpen] = useState(null)        // the handover shown
  const [starting, setStarting] = useState(false)

  const load = useCallback(() => {
    setLoading(true); setLoadErr('')
    return StoresAPI.handovers().then((d) => {
      const items = d.items || []
      setRows(items)
      setOpen((cur) => (cur ? items.find((h) => h.id === cur.id) || null : items.find((h) => h.status === 'Open') || null))
    }).catch((ex) => setLoadErr(errText(ex, 'Could not load the handovers.'))).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])
  const inProgress = rows.some((h) => h.status === 'Open')

  return (
    <div>
      <PageTitle title={tr('Handover')} subtitle={tr('When the Stores Officer changes: what the store holds, counted by the incoming officer and signed by both and a committee witness.')}
        actions={canStart && !inProgress && <button onClick={() => setStarting(true)} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Start handover</T></button>} />

      {open && <HandoverDetail h={open} user={user} onChanged={(h) => { setOpen(h); load() }} onClose={() => setOpen(null)} />}

      <Section title={tr('History')} bodyClass="p-0" className="mt-5">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
            {['Handover', 'From', 'To', 'Witness', 'Started', 'Count', 'Status', ''].map((h) => <th key={h} className="px-3 py-3 font-semibold whitespace-nowrap">{tr(h)}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((h) => (
              <tr key={h.id} className={open?.id === h.id ? 'bg-cream/50' : 'hover:bg-gray-50/60'}>
                <td className="px-3 py-3 font-mono text-[0.78rem] font-semibold text-maroon-700">{h.code}</td>
                <td className="px-3 py-3">{staffName(h.from_name)}</td>
                <td className="px-3 py-3">{staffName(h.to_name)}</td>
                <td className="px-3 py-3">{staffName(h.witness_name)}</td>
                <td className="px-3 py-3 text-[0.8125rem] text-gray-600 whitespace-nowrap">{fmtStamp(h.started_at)}</td>
                <td className="px-3 py-3 whitespace-nowrap">{h.counted}/{h.total}{h.differs > 0 && <span className="text-red-700 font-semibold"> · {h.differs} {tr('differ')}</span>}</td>
                <td className="px-3 py-3"><Pill tone={TONE[h.status]}>{tr(h.status === 'Open' ? 'In progress' : h.status)}</Pill></td>
                <td className="px-3 py-3"><button onClick={() => setOpen(h)} className="text-[0.8125rem] font-semibold text-maroon-700 hover:underline">{tr('Open')}</button></td>
              </tr>))}
            {!rows.length && <TableStates colSpan={8} loading={loading} error={loadErr} onRetry={load} empty={tr('No handover yet.')} />}
          </tbody></table></div>
      </Section>

      {starting && <StartDialog user={user} onClose={() => setStarting(false)} onStarted={(h) => { setStarting(false); setOpen(h); load() }} />}
    </div>
  )
}

function StartDialog({ user, onClose, onStarted }) {
  const admin = isAdminUser(user)
  const [meta, setMeta] = useState({ officers: [], witnesses: [] })
  const [preview, setPreview] = useState(null)
  const [f, setF] = useState({ from_user: admin ? '' : user.username, to_user: '', witness_user: '', notes: '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    StoresAPI.handoverMeta().then(setMeta).catch(() => {})
    StoresAPI.handoverPreview().then((d) => setPreview(d.lines || [])).catch(() => setPreview([]))
  }, [])
  const from = f.from_user || user.username
  async function save(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const h = await StoresAPI.startHandover({ from_user: admin ? (f.from_user || null) : null, to_user: f.to_user, witness_user: f.witness_user, notes: f.notes.trim() || null })
      toast(`${h.code} ${tr('started. The incoming officer now counts each line.')}`); onStarted(h)
    } catch (ex) { toast(errText(ex, 'Could not start the handover.'), 'error') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !saving && onClose()} />
      <form onSubmit={save} className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
          <div><h3 className="font-serif text-lg font-bold text-maroon-800"><UserCheck size={17} className="inline mr-1.5 -mt-0.5" /><T>Start handover</T></h3>
            <div className="text-[0.75rem] text-gray-500">{tr('The list below is taken as it is now. The incoming officer counts it.')}</div></div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={18} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div><label className="label"><T>From (outgoing) *</T></label>
              {admin ? (
                <Select required className="input" value={f.from_user} onChange={(e) => setF({ ...f, from_user: e.target.value })}>
                  <option value="">{tr('Select')}</option>
                  {meta.officers.map((u) => <option key={u.username} value={u.username}>{nameOf(u)}</option>)}
                </Select>) : <div className="input bg-gray-50">{staffName(user.name || user.username)}</div>}</div>
            <div><label className="label"><T>To (incoming) *</T></label>
              <Select required className="input" value={f.to_user} onChange={(e) => setF({ ...f, to_user: e.target.value })}>
                <option value="">{tr('Select')}</option>
                {meta.officers.filter((u) => u.username !== from).map((u) => <option key={u.username} value={u.username}>{nameOf(u)}</option>)}
              </Select></div>
            <div><label className="label"><T>Witness (committee) *</T></label>
              <Select required className="input" value={f.witness_user} onChange={(e) => setF({ ...f, witness_user: e.target.value })}>
                <option value="">{tr('Select')}</option>
                {meta.witnesses.filter((u) => u.username !== from && u.username !== f.to_user).map((u) => <option key={u.username} value={u.username}>{nameOf(u)}</option>)}
              </Select></div>
          </div>
          <div><label className="label"><T>Notes</T></label>
            <input className="input" maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={tr('e.g. Transfer to another temple duty')} /></div>
          <div className="rounded-lg border border-gray-200">
            <div className="px-3 py-2 text-[0.75rem] font-semibold text-gray-600 border-b border-gray-100">{tr('What will be handed over')}</div>
            {preview == null ? <div className="px-3 py-3 text-[0.8125rem] text-gray-400">{tr('Loading…')}</div> : <LinesTable lines={preview} />}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" disabled={saving} onClick={onClose} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
          <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60">{saving ? tr('Saving…') : tr('Start handover')}</button>
        </div>
      </form>
    </div>
  )
}

function groupLines(lines) {
  const out = []
  for (const l of lines) {
    const g = out.find((x) => x.group === l.group)
    if (g) g.lines.push(l); else out.push({ group: l.group, lines: [l] })
  }
  return out
}

function LinesTable({ lines, edit, onEdit }) {
  const groups = groupLines(lines)
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-[0.6875rem] uppercase tracking-wide text-gray-600">
        <th className="px-3 py-2 font-semibold">{tr('Item')}</th><th className="px-3 py-2 font-semibold text-right">{tr('As per records')}</th>
        {(edit || lines.some((l) => l.result)) && <><th className="px-3 py-2 font-semibold">{tr('Incoming count')}</th><th className="px-3 py-2 font-semibold">{tr('Note')}</th></>}
      </tr></thead>
      <tbody>
        {groups.map((g) => (
          <React.Fragment key={g.group}>
            <tr><td colSpan={4} className="px-3 pt-3 pb-1 text-[0.6875rem] uppercase tracking-wide font-semibold text-maroon-700">{tr(g.group)}</td></tr>
            {g.lines.map((l) => (
              <tr key={l.key} className={`border-t border-gray-100 ${l.result === 'Differs' ? 'bg-red-50/60' : ''}`}>
                <td className="px-3 py-2 text-gray-800">{tr(l.label)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap">{q3(l.expected)} {unitOf(l.unit)}</td>
                {edit ? (<>
                  <td className="px-3 py-2"><div className="flex gap-1">
                    {[['Matches', CheckCircle2, 'bg-emerald-600 border-emerald-600 text-white', 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'],
                      ['Differs', XCircle, 'bg-red-600 border-red-600 text-white', 'border-red-300 text-red-700 hover:bg-red-50']].map(([v, Icon, on, off]) => (
                      <button key={v} type="button" onClick={() => onEdit(l.key, { result: v })}
                        className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border text-[0.75rem] font-semibold ${l.result === v ? on : off}`}>
                        <Icon size={13} />{tr(v)}</button>))}
                    {l.result === 'Differs' && <input className="input !py-1 w-24" maxLength={40} value={l.counted || ''} onChange={(e) => onEdit(l.key, { counted: e.target.value })} placeholder={tr('Counted')} />}
                  </div></td>
                  <td className="px-3 py-2"><input className="input !py-1" maxLength={300} value={l.note || ''} onChange={(e) => onEdit(l.key, { note: e.target.value })}
                    placeholder={l.result === 'Differs' ? tr('What differs? *') : tr('Note')} /></td>
                </>) : lines.some((x) => x.result) && (<>
                  <td className="px-3 py-2 whitespace-nowrap">{l.result ? <span className={l.result === 'Differs' ? 'text-red-700 font-semibold' : 'text-emerald-700'}>{l.result === 'Differs' ? '✖' : '✔'} {tr(l.result)}{l.counted ? ` · ${l.counted}` : ''}</span> : <span className="text-gray-400">—</span>}</td>
                  <td className="px-3 py-2 text-[0.8125rem] text-gray-600">{l.note}</td>
                </>)}
              </tr>))}
          </React.Fragment>))}
        {!lines.length && <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400 text-[0.8125rem]">{tr('The store holds nothing yet.')}</td></tr>}
      </tbody>
    </table>
  )
}

function HandoverDetail({ h, user, onChanged, onClose }) {
  const temple = useTemple()
  const [lines, setLines] = useState(h.lines)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setLines(h.lines) }, [h])
  const signed = !!(h.from_signed_at || h.to_signed_at || h.witness_signed_at)
  const canCount = h.status === 'Open' && user?.username === h.to_user && !signed
  const dirty = useMemo(() => JSON.stringify(lines) !== JSON.stringify(h.lines), [lines, h.lines])
  const allCounted = h.lines.every((l) => l.result)
  const myRole = [['from', h.from_user], ['to', h.to_user], ['witness', h.witness_user]].find(([, u]) => u === user?.username)?.[0]
  const edit = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  async function saveCount() {
    const todo = lines.filter((l) => l.result)
    if (!todo.length) { toast(tr('Mark at least one line.'), 'error'); return }
    const missing = todo.find((l) => l.result === 'Differs' && !(l.note || '').trim())
    if (missing) { toast(`${tr(missing.label)}: ${tr('write what differs.')}`, 'error'); return }
    setSaving(true)
    try {
      const r = await StoresAPI.countHandover(h.id, todo.map((l) => ({ key: l.key, result: l.result, counted: l.counted || null, note: (l.note || '').trim() || null })))
      toast(r.counted === r.total ? tr('Count saved. Everyone can sign now.') : `${tr('Count saved')}: ${r.counted}/${r.total}`); onChanged(r)
    } catch (ex) { toast(errText(ex, 'Could not save the count.'), 'error') } finally { setSaving(false) }
  }
  async function sign() {
    const ok = await confirmDialog({ title: `${tr('Sign')} ${h.code}`, confirmLabel: tr('Sign'),
      message: h.differs ? `${h.differs} ${tr('line(s) differ. By signing you accept the handover with these notes.')}` : tr('By signing you accept the handover as counted.') })
    if (!ok) return
    try { const r = await StoresAPI.signHandover(h.id); toast(r.status === 'Completed' ? tr('Handover completed.') : tr('Signed.')); onChanged(r) }
    catch (ex) { toast(errText(ex, 'Could not sign.'), 'error') }
  }
  async function cancel() {
    const res = await promptDialog({ title: `${tr('Cancel handover')} ${h.code}`, tone: 'danger', confirmLabel: tr('Cancel handover'),
      fields: [{ k: 'reason', label: tr('Reason'), required: true }] })
    if (!res) return
    try { const r = await StoresAPI.cancelHandover(h.id, res.reason.trim()); toast(tr('Cancelled.')); onChanged(r) }
    catch (ex) { toast(errText(ex, 'Could not cancel.'), 'error') }
  }
  const canCancel = h.status === 'Open' && (isAdminUser(user) || [h.from_user, h.to_user].includes(user?.username))
  const step = h.status !== 'Open' ? 4 : !allCounted ? 2 : 3
  const sigs = [['from', tr('Outgoing officer'), h.from_name, h.from_signed_at], ['to', tr('Incoming officer'), h.to_name, h.to_signed_at], ['witness', tr('Witness (committee)'), h.witness_name, h.witness_signed_at]]

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3 no-print">
        <div><div className="font-serif text-lg font-bold text-maroon-800">{h.code} <Pill tone={TONE[h.status]}>{tr(h.status === 'Open' ? 'In progress' : h.status)}</Pill></div>
          <div className="text-[0.8125rem] text-gray-600">{staffName(h.from_name)} → {staffName(h.to_name)} · {tr('Witness')} {staffName(h.witness_name)} · {fmtStamp(h.started_at)}</div>
          {h.status === 'Cancelled' && <div className="text-[0.8125rem] text-gray-600">{tr('Cancelled')} — {staffName(h.cancelled_by)}: {h.cancel_reason}</div>}</div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="btn-outline !py-2"><Printer size={15} />{' '}<T>Print</T></button>
          {canCancel && <button onClick={cancel} className="btn-outline !py-2 !text-red-600"><Ban size={15} />{' '}<T>Cancel</T></button>}
          <button onClick={onClose} className="text-gray-400 hover:text-maroon-700 px-1" aria-label={tr('Close')}><X size={18} /></button>
        </div>
      </div>
      {h.status !== 'Cancelled' && (
        <div className="px-5 pt-4 flex flex-wrap gap-x-6 gap-y-1 text-[0.8125rem] no-print">
          {[[1, 'Snapshot taken'], [2, 'Incoming officer counts'], [3, 'Three signatures'], [4, 'Completed']].map(([n, label]) => (
            <span key={n} className={`inline-flex items-center gap-1.5 ${step > n || (n === 4 && step === 4) ? 'text-emerald-700' : step === n ? 'text-maroon-700 font-semibold' : 'text-gray-400'}`}>
              {step > n || (n === 4 && step === 4) ? <CheckCircle2 size={15} /> : <Circle size={15} />}{n}. {tr(label)}</span>))}
        </div>)}

      <div id="print-area" className="px-5 py-4">
        <div className="hidden print:block text-center mb-3">
          <div className="font-serif text-lg font-bold text-maroon-800">{getLang() === 'te' ? (temple?.nameTelugu || 'శ్రీ షిర్డీ సాయిబాబా దేవస్థానం') : (temple?.name || 'Shri Shirdi Sai Baba Temple')}</div>
          <div className="font-semibold">{tr('Store Handover Report')} — {h.code}</div>
          <div className="text-[0.8125rem]">{staffName(h.from_name)} → {staffName(h.to_name)} · {tr('Witness')} {staffName(h.witness_name)} · {fmtStamp(h.started_at)}</div>
          {h.notes && <div className="text-[0.8125rem]">{h.notes}</div>}
        </div>
        {canCount && <div className="mb-3 text-[0.8125rem] text-blue-800 bg-blue-50 rounded-lg px-3 py-2 no-print">{tr('Count each line in the store and mark it Matches or Differs. Write what differs. Save, then everyone signs.')}</div>}
        {h.status === 'Open' && !canCount && !allCounted && <div className="mb-3 text-[0.8125rem] text-gray-600 bg-gray-50 rounded-lg px-3 py-2 no-print">{tr('Waiting for the incoming officer to count')} ({staffName(h.to_name)}) · {h.counted}/{h.total}</div>}
        <LinesTable lines={canCount ? lines : h.lines} edit={canCount} onEdit={edit} />
        {canCount && (
          <div className="mt-3 flex justify-end no-print">
            <button onClick={saveCount} disabled={saving || !dirty} className="btn-maroon !py-2 disabled:opacity-50"><Save size={15} />{' '}{saving ? tr('Saving…') : tr('Save count')}</button>
          </div>)}

        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          {sigs.map(([role, label, name, at]) => (
            <div key={role} className="rounded-lg border border-gray-200 p-3 text-center">
              <div className="text-[0.6875rem] uppercase tracking-wide text-gray-500">{label}</div>
              <div className="font-semibold text-gray-800 mt-0.5">{staffName(name)}</div>
              {at ? <div className="text-[0.75rem] text-emerald-700 mt-1"><CheckCircle2 size={13} className="inline mr-1" />{tr('Signed')} · {fmtStamp(at)}</div>
                : h.status === 'Open' && myRole === role ? (
                  <button onClick={sign} disabled={!allCounted || dirty} title={!allCounted ? tr('The incoming officer must count every line first.') : ''}
                    className="mt-2 btn-maroon !py-1.5 text-[0.8125rem] disabled:opacity-50 no-print"><PenLine size={14} />{' '}<T>Sign</T></button>)
                  : <div className="text-[0.75rem] text-gray-400 mt-1">{h.status === 'Open' ? tr('Not signed yet') : '—'}</div>}
              <div className="hidden print:block border-t border-gray-400 mt-8 pt-1 text-[0.6875rem] text-gray-600">{tr('Signature')}</div>
            </div>))}
        </div>
      </div>
    </div>
  )
}
