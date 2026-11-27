import React, { useCallback, useEffect, useState } from 'react'
import { Tag, PackageCheck, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { PageTitle, Pill, Pager, inr, fmtDate, fmtStamp } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { Select } from '../../../components/common/Field.jsx'
import { promptDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { TagItemsDrawer, canWriteStores, canReceiveStock, canCloseShortage, progressText, staffName, sourceRef, useStoresMeta } from './shared.jsx'
import ResetButton from '../../../components/common/ResetButton.jsx'

const SOURCE_TONE = { Donation: 'blue', Hundi: 'violet', Manual: 'amber' }
const SHORT_REASONS = ['Not handed over yet by counter', 'Counted wrong at counter', 'Other']
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const changed = () => window.dispatchEvent(new Event('stores:changed'))
const amount = (n, weight) => `${qty(n)} ${weight ? gramUnit() : tr('piece(s)')}`
// One hundi line: grams, pieces, or (a line counted only by value) ✔ / ✘
const lineAmt = (l, n) => (l.mode === 'value' ? (n > 0 ? `✔ ${tr('Received')}` : `✘ ${tr('Not received')}`) : amount(n, l.mode === 'weight'))
const counted = (l) => (l.mode === 'value' ? inr(l.value) : amount(l.counted, l.mode === 'weight'))
const isHundi = (r) => r.source_type === 'Hundi'
// Consumables (oil, rice…) are received at the store with no IDs or stickers (2026-11-27)
const isConsumable = (r) => !!r.consumable || r.mode === 'quantity'
// An amount in the receipt's own terms: litres / kg for a consumable, grams or pieces otherwise
const amountOf = (r, n) => (isConsumable(r) ? `${qty(n)} ${tr(r.unit || '')}` : amount(n, r.mode === 'weight' || !!r.weight))
const PAGE = 20

// Receive & Tag: every counter receipt, hundi custody, bought item and verified manual entry is
// tagged straight away (the separate "To receive" count was merged in on 2026-11-15). If fewer
// pieces arrived than the receipt says, "Fewer arrived" opens a Shortage that the rest arriving
// settles, or the Committee closes.
export default function PendingTagging() {
  const { user } = useAuth()
  const { lang } = useLang()
  const canWrite = canWriteStores(user)
  const canReceive = canReceiveStock(user)
  const canClose = canCloseShortage(user)
  const [rows, setRows] = useState([])
  const [shorts, setShorts] = useState([])
  const [openShorts, setOpenShorts] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  // Receive at store merged into tagging (2026-11-15): receipts are tagged straight away; when fewer
  // pieces arrived, "Fewer arrived" on the row records it (a shortage the Committee closes)
  const [tab, setTab] = useState('tag')
  const [closedShorts, setClosedShorts] = useState(false)
  const [type, setType] = useState('')
  const [tagging, setTagging] = useState(null)
  const [receiving, setReceiving] = useState(null)   // { row, rest } — rest: the short part arrived later
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [tab, type, closedShorts])

  const load = useCallback(() => {
    setLoading(true); setLoadErr('')
    return Promise.all([StoresAPI.pending(), StoresAPI.shortages({ status: closedShorts ? 'closed' : 'open' }), StoresAPI.pendingCount().catch(() => null)])
      .then(([p, s, c]) => { setRows(p.items || []); setShorts(s.items || []); setOpenShorts(c?.shortages || 0) })
      .catch((ex) => { setLoadErr(errText(ex, "Couldn't load — check your connection and retry.")); setRows([]); setShorts([]) })
      .finally(() => setLoading(false))
  }, [closedShorts])
  useEffect(() => { load() }, [load])
  const done = (msg) => { toast(msg); changed(); load() }

  const state = (r) => r.progress?.receive?.state
  const toTag = rows.filter((r) => !r.progress.complete)
  const tagShown = type === 'Consumable' ? toTag.filter(isConsumable)
    : type ? toTag.filter((r) => r.source_type === type && !isConsumable(r)) : toTag
  // 20 rows a page on every tab; the page stays the same height while switching tabs
  const listed = tab === 'tag' ? tagShown : shorts
  const pages = Math.max(1, Math.ceil(listed.length / PAGE))
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])
  const cut = (list) => list.slice((page - 1) * PAGE, page * PAGE)

  async function closeShortage(s) {
    const what = s.lines
      ? s.lines.filter((l) => l.short > 0).map((l) => `${tr(l.item_name)}: ${tr('counted')} ${counted(l)}, ${tr('received')} ${lineAmt(l, l.received)}`).join(' · ')
      : `${tr(s.item_name)}: ${tr('billed')} ${amountOf(s, s.billed)}, ${tr('received')} ${amountOf(s, s.received)}`
    const res = await promptDialog({ title: `${tr('Close shortage')} — ${s.short_code}`, confirmLabel: tr('Close shortage'),
      message: `${s.receipt_no} · ${what}. ${tr('The receipt is settled at what the store received.')}`,
      fields: [{ k: 'note', label: tr('Reason'), required: true, placeholder: tr('e.g. Receipt corrected at counter') }] })
    if (!res) return
    try { await StoresAPI.closeShortage(s.id, res.note.trim()); done(`${s.short_code}: ${tr('shortage closed.')}`) }
    catch (ex) { toast(errText(ex, 'Could not close the shortage.'), 'error') }
  }

  const tabBtn = (k, label, n, red) => (
    <button onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-[0.8125rem] font-semibold inline-flex items-center gap-1.5 ${tab === k ? 'bg-maroon-700 text-cream' : 'text-gray-600 hover:bg-gray-100'}`}>
      {tr(label)}{n > 0 && <span className={`min-w-[1.25rem] h-5 px-1.5 rounded-full text-[0.6875rem] font-bold grid place-items-center ${red ? 'bg-red-500 text-white' : tab === k ? 'bg-cream text-maroon-800' : 'bg-gray-200 text-gray-700'}`}>{n}</span>}
    </button>
  )
  const th = (h) => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{tr(h)}</th>

  return (
    <div>
      <PageTitle title={tr('Receive & Tag')} subtitle={tr('Counter receipts, hundi valuables and purchased items waiting to be received and given their IDs.')} />
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[36rem]">
        {/* One fixed-height bar for every tab (filters sit beside their label), and every tab has
            its one-line hint below — so neither the tabs nor the table move when switching tabs */}
        <div className="px-5 py-3 flex flex-wrap items-center gap-3 justify-between border-b border-gray-100 min-h-[4.25rem]">
          <div className="flex flex-wrap gap-1">
            {tabBtn('tag', 'To tag', toTag.length)}{tabBtn('short', 'Shortages', openShorts, true)}
          </div>
          {tab === 'tag' && (
            <div className="flex items-center gap-2"><span className="text-[0.75rem] text-gray-500"><T>Source</T></span>
              <div className="w-[11rem]"><Select className="input !py-1.5" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">{tr('All')}</option><option value="Donation">{tr('Donation')}</option><option value="Hundi">{tr('Hundi')}</option><option value="Manual">{tr('Purchased item')}</option><option value="Consumable">{tr('Consumables')}</option>
              </Select></div></div>)}
          {tab === 'short' && (
            <label className="inline-flex items-center gap-2 text-[0.8125rem] text-gray-600">
              <input type="checkbox" checked={closedShorts} onChange={(e) => setClosedShorts(e.target.checked)} /><T>Show closed</T></label>)}
        </div>

        <div className="px-5 py-3 text-[0.75rem] text-gray-500 bg-gray-50/60 border-b border-gray-100 truncate">
          {tab === 'tag' ? tr('Give every piece its ID, sticker and shelf. If fewer arrived than the receipt says, use "Fewer arrived".')
              : tr('Less arrived than billed or counted. When the rest arrives, receive it; otherwise the committee closes it.')}</div>

        {tab === 'tag' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
                {['Source', 'Donor', 'Item', 'Quantity', 'Tagged / received', 'Date', 'Actions'].map(th)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {cut(tagShown).map((r) => {
                  const rc = r.progress?.receive
                  return (
                    <tr key={`${r.source_type}-${r.source_id}`} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3"><div className="font-mono text-[0.78rem] text-gray-700">{sourceRef(r)}</div><Pill tone={SOURCE_TONE[r.source_type]}>{tr(r.source_type === 'Manual' ? 'Purchased item' : r.source_type)}</Pill></td>
                      <td className="px-4 py-3 text-gray-800">{personName({ name: r.donor_name }, lang)}{r.donor_mobile && <div className="text-[0.6875rem] text-gray-400">{r.donor_mobile}</div>}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{tr(r.item_name)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.quantity != null ? `${Number(r.quantity).toLocaleString('en-IN')} ${tr(r.unit || '')}` : '—'}
                        {rc && <div className={`text-[0.6875rem] ${rc.state === 'Received' ? 'text-emerald-700' : rc.state === 'Short' ? 'text-red-600' : 'text-gray-500'}`}>
                          {rc.state === 'Received' ? `✔ ${tr('Received at store')}`
                            : isHundi(r) ? `${rc.state === 'Short' ? `⚠ ${tr('Short at store')}` : tr('Shortage closed')}${rc.short_code ? ` · ${rc.short_code}` : ''}`
                            : `⚠ ${tr('Received at store')}: ${qty(rc.received)} / ${qty(rc.billed)}${rc.short_code ? ` · ${rc.short_code}` : ''}`}</div>}</td>
                      <td className="px-4 py-3 text-[0.8125rem]"><Pill tone="amber">{isConsumable(r) ? `${qty(r.progress.done)} / ${qty(r.progress.needed)} ${tr(r.unit || '')}` : progressText(r.progress)}</Pill>
                        {isConsumable(r) && <div className="text-[0.6875rem] text-gray-500 mt-0.5">{tr('No stickers — consumable')}</div>}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-[0.8125rem]">{fmtDate(r.date)}</td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-1.5">{isConsumable(r)
                        ? (rc?.state === 'Short' ? <span className="text-[0.75rem] text-red-600">{tr('Short — see Shortages')}</span>
                          : canReceive ? <button onClick={() => setReceiving({ row: r })} className="btn-maroon !py-1.5 !px-3 text-[0.78rem]"><PackageCheck size={14} />{' '}<T>Receive</T></button>
                          : <span className="text-[0.75rem] text-gray-400"><T>The Stores Officer receives</T></span>)
                        : canWrite
                        ? <button onClick={() => setTagging({ type: r.source_type, id: r.source_id })} className="btn-maroon !py-1.5 !px-3 text-[0.78rem]"><Tag size={14} />{' '}<T>Tag now</T></button>
                        : <span className="text-[0.75rem] text-gray-400"><T>The Stores Officer tags</T></span>}
                        {canReceive && r.source_type === 'Donation' && !rc && !isConsumable(r) && (
                          <button onClick={() => setReceiving({ row: r, fewer: true })} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-[0.75rem] font-semibold whitespace-nowrap"><AlertTriangle size={14} />{tr('Fewer arrived')}</button>)}</div></td>
                    </tr>)
                })}
                {tagShown.length === 0 && <TableStates colSpan={7} loading={loading} error={loadErr} onRetry={load} empty={tr('Everything is tagged.')} />}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'short' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
                {['Shortage', 'Item', 'Billed / counted', 'Received', 'Short', 'Billed by → Received by', 'Reason', 'Status', 'Actions'].map(th)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {cut(shorts).map((s) => {
                  const w = s.mode === 'weight'
                  const open = s.status === 'Short'
                  return (
                    <tr key={s.id} className={open ? 'bg-red-50/40' : 'hover:bg-gray-50/60'}>
                      <td className="px-4 py-3"><div className="font-mono text-[0.78rem] font-semibold text-red-700">{s.short_code}</div><div className="font-mono text-[0.6875rem] text-gray-500">{s.receipt_no}{s.voided && ` · ${tr('Voided')}`}</div></td>
                      <td className="px-4 py-3 text-gray-800"><b>{tr(s.item_name)}</b><div className="text-[0.6875rem] text-gray-500">{personName({ name: s.donor_name }, lang)}</div></td>
                      {s.lines ? (<>
                        <td className="px-4 py-3 whitespace-nowrap">{s.lines.map((l) => <div key={l.line_id}>{tr(l.item_name)} · {counted(l)}</div>)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{s.lines.map((l) => <div key={l.line_id}>{lineAmt(l, l.received)}</div>)}</td>
                        <td className={`px-4 py-3 whitespace-nowrap font-semibold ${open ? 'text-red-700' : 'text-gray-500'}`}>{s.lines.map((l) => <div key={l.line_id}>{l.short > 0 ? (l.mode === 'value' ? tr('Not received') : amount(l.short, l.mode === 'weight')) : '—'}</div>)}</td>
                      </>) : (<>
                        <td className="px-4 py-3 whitespace-nowrap">{amountOf(s, s.billed)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{amountOf(s, s.received)}</td>
                        <td className={`px-4 py-3 whitespace-nowrap font-semibold ${open ? 'text-red-700' : 'text-gray-500'}`}>{s.short > 0 ? amountOf(s, s.short) : '—'}</td>
                      </>)}
                      <td className="px-4 py-3 text-[0.8125rem] text-gray-700">{s.lines ? `${tr('Custody')}: ${staffName(s.custodian || '—')}` : staffName(s.billed_by || '—')} → {staffName(s.received_by || '—')}<div className="text-[0.6875rem] text-gray-400">{fmtStamp(s.received_at)}</div></td>
                      <td className="px-4 py-3 text-[0.8125rem] text-gray-700 max-w-[14rem]">{tr(s.short_reason || '')}{s.short_note && <div className="text-[0.6875rem] text-gray-500">{s.short_note}</div>}</td>
                      <td className="px-4 py-3"><Pill tone={open ? 'red' : 'green'}>{tr(open ? 'Open' : s.status === 'Received' ? 'Rest received' : 'Closed')}</Pill>
                        {!open && <div className="text-[0.6875rem] text-gray-500 mt-1">{s.close_note} — {staffName(s.closed_by || '')} · {fmtStamp(s.closed_at)}</div>}</td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-1.5">
                        {open && canReceive && !s.voided && <button onClick={() => setReceiving({ row: s, rest: true })} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-[0.75rem] font-semibold whitespace-nowrap"><PackageCheck size={14} />{tr('Received the rest')}</button>}
                        {open && canClose && s.received_by_user !== user?.username && <button onClick={() => closeShortage(s)} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-[0.75rem] font-semibold whitespace-nowrap"><CheckCircle2 size={14} />{tr('Close shortage')}</button>}
                      </div></td>
                    </tr>)
                })}
                {shorts.length === 0 && <TableStates colSpan={9} loading={loading} error={loadErr} onRetry={load} empty={closedShorts ? tr('No closed shortages yet.') : tr('No open shortages.')} />}
              </tbody>
            </table>
          </div>
        )}
        {listed.length > PAGE && (
          <div className="mt-auto px-5 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <Pager page={page} size={PAGE} total={listed.length} onPage={setPage} />
          </div>)}
      </div>
      {tagging && <TagItemsDrawer source={tagging} onClose={() => { setTagging(null); load() }} />}
      {receiving && (receiving.row.source_type === 'Hundi'
        ? <HundiReceiveDialog {...receiving} onClose={() => setReceiving(null)} onDone={(msg) => { setReceiving(null); done(msg) }} />
        : <ReceiveDialog {...receiving} onClose={() => setReceiving(null)} onDone={(msg) => { setReceiving(null); done(msg) }} />)}
    </div>
  )
}

// Count a receipt in (rest = false), or the short part that arrived later (rest = true).
function ReceiveDialog({ row, rest, fewer, onClose, onDone }) {
  const cons = isConsumable(row)                   // a consumable: litres / kg, kept in a location, best before
  const weight = !cons && (rest ? row.mode === 'weight' : !!row.weight)
  const unitLabel = cons ? tr(row.unit || '') : weight ? gramUnit() : tr('piece(s)')
  const amt = (v) => (cons ? `${qty(v)} ${unitLabel}` : amount(v, weight))
  const { activeLocations } = useStoresMeta()
  const [loc, setLoc] = useState('')
  const [expiry, setExpiry] = useState(row.expiry_date || '')
  const billed = rest ? row.billed : row.quantity
  const already = rest ? row.received : 0
  const left = billed - already
  const ref = rest ? row.receipt_no : sourceRef(row)
  const tagged = fewer ? Number(row.progress?.done || 0) : 0          // never below what is already tagged
  const startN = fewer ? '' : String(rest ? left : billed)
  const [n, setN] = useState(startN)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const got = Number(n)
  const valid = n !== '' && Number.isFinite(got) && got >= tagged && (!fewer || got < billed) && (!cons || rest || !!loc)
  const short = !rest && valid && got < billed - (weight ? 0.01 : 0)

  async function submit(e) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    try {
      if (rest) {
        const r = await StoresAPI.receiveRest(row.donation_id, { quantity: got, note: note.trim() || null })
        onDone(r.status === 'Received' ? `${ref}: ${tr('rest received — shortage settled.')}` : `${ref}: ${tr('received')} ${amt(got)}.`)
      } else {
        const r = await StoresAPI.receive(row.source_id, { quantity: got, reason: short ? reason : null, note: note.trim() || null,
          ...(cons ? { location_id: Number(loc), expiry_date: expiry || null } : {}) })
        onDone(r.short_code ? `${ref}: ${tr('received')} ${amt(got)} — ${r.short_code} ${tr('opened for the rest.')}`
          : cons ? `${ref}: ${tr('received')} ${amt(got)} — ${tr('now in Consumable Stock Management.')}` : `${ref}: ${tr('received — ready to tag.')}`)
      }
    } catch (ex) { toast(errText(ex, 'Could not record the receipt.'), 'error') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form onSubmit={submit} className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-serif text-lg font-bold text-maroon-800">{rest ? tr('Received the rest') : fewer ? tr('Fewer arrived') : tr('Receive')} — <span className="font-mono">{ref}</span></h3>
          <div className="text-[0.75rem] text-gray-500">{tr(row.item_name)} · {personName({ name: row.donor_name })}{row.billed_by ? ` · ${tr('billed by')} ${staffName(row.billed_by)}` : ''}</div>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-[0.8125rem]">
            <div className="rounded-lg bg-gray-50 px-3 py-2"><div className="text-gray-500">{tr('Counter receipt says')}</div><div className="font-bold text-gray-800">{amt(billed)}</div>{row.item_desc && <div className="text-[0.6875rem] text-gray-500">{row.item_desc}</div>}</div>
            <div className="rounded-lg bg-gray-50 px-3 py-2"><div className="text-gray-500">{rest ? tr('Still short') : fewer ? tr('Already tagged') : tr('Already received')}</div><div className="font-bold text-gray-800">{amt(rest ? left : fewer ? tagged : already)}</div></div>
          </div>
          <div><label className="label">{rest ? tr('Received now *') : fewer ? tr('How many actually arrived *') : tr('Received at store *')} ({unitLabel})</label>
            <input required type="number" min={tagged} step={cons ? 'any' : weight ? '0.001' : '1'} max={rest ? left : billed} className="input" value={n} onChange={(e) => setN(e.target.value)} /></div>
          {cons && !rest && (<>
            <div><label className="label">{tr('Location *')}</label>
              <Select required className="input" value={loc} onChange={(e) => setLoc(e.target.value)}>
                <option value="">{tr('Select')}</option>{activeLocations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}
              </Select></div>
            <div><label className="label">{tr('Best before')} ({tr('optional')})</label>
              <input type="date" className="input" min={row.date || undefined} value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
            <div className="text-[0.75rem] text-gray-500">{tr('No stickers for consumables.')}</div>
          </>)}
          {short && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 space-y-2">
              <div className="text-[0.8125rem] font-semibold text-red-700"><AlertTriangle size={14} className="inline mr-1" />{amt(billed - got)} {tr('short — a shortage will open for the Committee.')}</div>
              <div className="text-[0.75rem] text-gray-600"><T>Reason *</T></div>
              {SHORT_REASONS.map((x) => (
                <label key={x} className="flex items-center gap-2 text-[0.8125rem] text-gray-800">
                  <input type="radio" name="reason" required checked={reason === x} onChange={() => setReason(x)} />{tr(x)}</label>))}
            </div>)}
          <div><label className="label">{short && reason === 'Other' ? tr('Note *') : tr('Note')}</label>
            <input className="input" maxLength={300} required={short && reason === 'Other'} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={tr('e.g. 1 pancha still at the counter')} /></div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
          {/* Reset (client, 2026-11-20): back to the values shown when this receipt's form opened */}
          <ResetButton onReset={() => { setN(startN); setReason(''); setNote(''); setLoc(''); setExpiry(row.expiry_date || '') }} disabled={saving} className="justify-center !px-3 shrink-0" />
          <button disabled={saving || !valid} className="btn-maroon flex-1 justify-center disabled:opacity-60"><PackageCheck size={15} className="mr-1" />{saving ? tr('Saving…') : tr('Confirm received')}</button>
        </div>
      </form>
    </div>
  )
}

// Hundi valuables: one row per counted line — grams / pieces, or a Received tick for a line
// counted only by value. rest = only the short lines, for what arrived later.
function HundiReceiveDialog({ row, rest, onClose, onDone }) {
  const ref = rest ? row.receipt_no : row.source_ref
  const hid = rest ? row.hundi_id : row.source_id
  const base = rest ? row.lines.filter((l) => l.short > 0)
    : row.progress.lines.map((l) => ({ line_id: l.line_id, item_name: l.item_name, mode: l.mode, counted: l.counted, value: l.value, received: 0 }))
  const startVals = () => Object.fromEntries(base.map((l) => [l.line_id,
    l.mode === 'value' ? true : String(rest ? l.short : l.counted)]))
  const [vals, setVals] = useState(startVals)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const left = (l) => (rest ? l.short : l.counted)
  const got = (l) => (l.mode === 'value' ? (vals[l.line_id] ? 1 : 0) : Number(vals[l.line_id]))
  const valid = base.every((l) => l.mode === 'value' || (vals[l.line_id] !== '' && Number.isFinite(got(l)) && got(l) >= 0))
  const shortOf = (l) => Math.max(0, left(l) - got(l))
  const shortLines = !rest && valid ? base.filter((l) => shortOf(l) > (l.mode === 'weight' ? 0.01 : 0)) : []
  const set = (id, v) => setVals((x) => ({ ...x, [id]: v }))

  async function submit(e) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    const lines = base.map((l) => (l.mode === 'value' ? { line_id: l.line_id, received: !!vals[l.line_id] } : { line_id: l.line_id, quantity: got(l) }))
    try {
      if (rest) {
        const r = await StoresAPI.receiveHundiRest(hid, { lines, note: note.trim() || null })
        onDone(r.status === 'Received' ? `${ref}: ${tr('rest received — shortage settled.')}` : `${ref}: ${tr('received — shortage still open for the rest.')}`)
      } else {
        const r = await StoresAPI.receiveHundi(hid, { lines, reason: shortLines.length ? reason : null, note: note.trim() || null })
        onDone(r.short_code ? `${ref}: ${tr('received')} — ${r.short_code} ${tr('opened for the rest.')}` : `${ref}: ${tr('received — ready to tag.')}`)
      }
    } catch (ex) { toast(errText(ex, 'Could not record the receipt.'), 'error') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form onSubmit={submit} className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-serif text-lg font-bold text-maroon-800">{rest ? tr('Received the rest') : tr('Receive')} — <span className="font-mono">{ref}</span></h3>
          <div className="text-[0.75rem] text-gray-500">{tr('Committee verified')}{row.verified_by ? ` · ${staffName(row.verified_by)}` : ''} · {tr('Custody')}: {tr(row.store_location || '—')}{row.custodian ? ` · ${staffName(row.custodian)}` : ''}</div>
        </div>
        <div className="px-5 py-4 space-y-4">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
              <th className="pb-2 font-semibold">{tr('Item')}</th><th className="pb-2 font-semibold">{rest ? tr('Still short') : tr('Committee counted')}</th><th className="pb-2 font-semibold">{rest ? tr('Received now *') : tr('Received at store *')}</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {base.map((l) => (
                <tr key={l.line_id}>
                  <td className="py-2 font-semibold text-gray-800">{tr(l.item_name)}</td>
                  <td className="py-2 text-gray-700 whitespace-nowrap">{l.mode === 'value' ? inr(l.value) : amount(left(l), l.mode === 'weight')}</td>
                  <td className="py-2">{l.mode === 'value'
                    ? <label className="inline-flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" checked={!!vals[l.line_id]} onChange={(e) => set(l.line_id, e.target.checked)} />{tr('Received')}</label>
                    : <div className="flex items-center gap-2"><input required type="number" min="0" max={left(l)} step={l.mode === 'weight' ? '0.001' : '1'} className="input !py-1.5 w-28"
                        value={vals[l.line_id]} onChange={(e) => set(l.line_id, e.target.value)} /><span className="text-[0.75rem] text-gray-500">{l.mode === 'weight' ? gramUnit() : tr('piece(s)')}</span></div>}
                    {!rest && valid && shortOf(l) > (l.mode === 'weight' ? 0.01 : 0) && <div className="text-[0.6875rem] text-red-600 mt-0.5">⚠ {l.mode === 'value' ? tr('Not received') : `${amount(shortOf(l), l.mode === 'weight')} ${tr('short')}`}</div>}</td>
                </tr>))}
            </tbody>
          </table>
          {shortLines.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 space-y-2">
              <div className="text-[0.8125rem] font-semibold text-red-700"><AlertTriangle size={14} className="inline mr-1" />{tr('Less than the committee counted — a shortage will open for the Committee.')}</div>
              <div className="text-[0.75rem] text-gray-600"><T>Reason *</T></div>
              {SHORT_REASONS.map((x) => (
                <label key={x} className="flex items-center gap-2 text-[0.8125rem] text-gray-800">
                  <input type="radio" name="reason" required checked={reason === x} onChange={() => setReason(x)} />{tr(x)}</label>))}
            </div>)}
          <div><label className="label">{shortLines.length && reason === 'Other' ? tr('Note *') : tr('Note')}</label>
            <input className="input" maxLength={300} required={!!shortLines.length && reason === 'Other'} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={tr('e.g. Silver lamp still with the counting team')} /></div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
          {/* Reset (client, 2026-11-20): back to the values shown when this receipt's form opened */}
          <ResetButton onReset={() => { setVals(startVals()); setReason(''); setNote('') }} disabled={saving} className="justify-center !px-3 shrink-0" />
          <button disabled={saving || !valid} className="btn-maroon flex-1 justify-center disabled:opacity-60"><PackageCheck size={15} className="mr-1" />{saving ? tr('Saving…') : tr('Confirm received')}</button>
        </div>
      </form>
    </div>
  )
}
