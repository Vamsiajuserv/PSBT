import React, { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Boxes, Store, Gavel, BadgeIndianRupee, Archive, Search, RotateCcw, Eye, PackageOpen, XCircle, Plus, Tags, CheckCircle2, AlertTriangle, MapPin, Send, SearchX } from 'lucide-react'
import { PageTitle, StatTile, KpiGrid, Pill, Pager, inr, num, fmtDate } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { Select, Checkbox } from '../../../components/common/Field.jsx'
import { promptDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { STATUS_TONE, STATUSES, AWAITING, ISSUED, MISSING, StickerSheet, canWriteStores, canDamageStock, canPlaceStock, canIssueStock, staffName, useStoresMeta } from './shared.jsx'
import { IssueDrawer } from './issue.jsx'

const SIZE = 25
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')

export default function StockRegister() {
  const { user } = useAuth()
  const { lang } = useLang()
  const canWrite = canWriteStores(user)
  const canDamage = canDamageStock(user)   // Counter Staff, Stores Officer + Administrator
  const canPlace = canPlaceStock(user)     // Stores Officer, Counter Staff + Administrator
  const canIssue = canIssueStock(user)     // Stores Officer + Administrator
  const { categories, locations, activeLocations } = useStoresMeta()
  const tagged = categories.filter((c) => c.tracking === 'Tagged')

  // ?status=In Store (from the Stores Overview) opens the register already filtered
  const [params] = useSearchParams()
  const initialStatus = STATUSES.includes(params.get('status')) ? params.get('status') : ''
  const [f, setF] = useState({ q: '', category_id: '', status: initialStatus, location_id: '' })
  const [applied, setApplied] = useState(f)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [sum, setSum] = useState(null)
  const [pendingCount, setPendingCount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [picked, setPicked] = useState({})
  const [stickers, setStickers] = useState(null)
  const [moveFor, setMoveFor] = useState(null)
  const [placeFor, setPlaceFor] = useState(null)   // { items: [...], location_id, note }
  const [placing, setPlacing] = useState(false)
  const [issueFor, setIssueFor] = useState(null)   // pieces to issue

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('')
    const params = Object.fromEntries(Object.entries(applied).filter(([, v]) => v !== ''))
    try {
      const [d, s] = await Promise.all([
        StoresAPI.items({ ...params, page, size: SIZE }),
        StoresAPI.summary(applied.category_id ? { category_id: applied.category_id } : {}),
      ])
      setRows(d.items); setTotal(d.total); setSum(s)
    } catch (ex) {
      setLoadErr(errText(ex, "Couldn't load the stock register — check your connection and retry."))
      setRows([])
    } finally { setLoading(false) }
  }, [applied, page])
  useEffect(() => { load() }, [load])
  useEffect(() => { StoresAPI.pending().then((r) => setPendingCount(r.total)).catch(() => setPendingCount(null)) }, [])

  const by = sum?.by_status || {}
  const c = (s) => by[s]?.count ?? 0
  const pickedRows = rows.filter((r) => picked[r.id])
  const pickedAwaiting = pickedRows.filter((r) => r.status === AWAITING)
  const pickedInStore = pickedRows.filter((r) => r.status === 'In Store')
  const showStatus = (s) => { const z = { ...f, status: s }; setF(z); setPage(1); setApplied(z) }

  async function writeOff(item) {
    const res = await promptDialog({
      title: `${tr('Write off')} — ${item.tag_id}`, tone: 'danger', confirmLabel: tr('Write off'),
      message: tr('The piece leaves stock for good. Use this only for damaged or lost items.'),
      fields: [{ k: 'reason', label: tr('Reason'), required: true, placeholder: tr('e.g. Torn, cannot be used') }],
    })
    if (!res) return
    try { await StoresAPI.writeOff(item.id, res.reason.trim()); toast(tr('Written off.')); load() }
    catch (ex) { toast(errText(ex, 'Could not write off this piece.'), 'error') }
  }

  async function doPlace(e) {
    e.preventDefault()
    setPlacing(true)
    try {
      const res = await StoresAPI.place({ ids: placeFor.items.map((i) => i.id), location_id: Number(placeFor.location_id),
        note: placeFor.note.trim() || null })
      toast(`${res.items.length} ${tr('piece(s) placed in')} ${tr(res.items[0]?.location || '')}.`)
      setPlaceFor(null); setPicked({}); load()
      window.dispatchEvent(new Event('stores:changed'))   // sidebar badge
    } catch (ex) { toast(errText(ex, 'Could not place these pieces.'), 'error') }
    finally { setPlacing(false) }
  }

  async function doMove(e) {
    e.preventDefault()
    try {
      await StoresAPI.move(moveFor.item.id, { location_id: Number(moveFor.location_id) })
      toast(tr('Moved.')); setMoveFor(null); load()
    } catch (ex) { toast(errText(ex, 'Could not move this piece.'), 'error') }
  }

  return (
    <div>
      <PageTitle title={tr('Stock Register')} subtitle={tr('Every tagged piece the temple has received — where it is kept and where it went.')}
        actions={<span className="inline-flex items-center gap-2">
          {canIssue && pickedInStore.length > 0 && <button onClick={() => setIssueFor(pickedInStore)} className="btn-outline !py-2.5"><Send size={15} />{' '}{tr('Issue selected')} ({pickedInStore.length})</button>}
          {canPlace && pickedAwaiting.length > 0 && <button onClick={() => setPlaceFor({ items: pickedAwaiting, location_id: '', note: '' })} className="btn-outline !py-2.5 !border-orange-300 !text-orange-700"><MapPin size={15} />{' '}{tr('Place selected')} ({pickedAwaiting.length})</button>}
          <button disabled={!pickedRows.length} onClick={() => setStickers(pickedRows)} title={pickedRows.length ? undefined : tr('Tick the pieces to print stickers for')} className="btn-outline !py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"><Tags size={15} />{' '}{tr('Print stickers')}{pickedRows.length > 0 && ` (${pickedRows.length})`}</button>
          {canWrite && <Link to="/admin/stores/manual" className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Manual Stock Entry</T></Link>}
        </span>} />

      <KpiGrid data-n={8}>
        <StatTile icon={Boxes} color="#8a1c1c" bg="bg-maroon-50" title={tr('Received')} value={sum ? num(sum.received) : '—'} sub={tr('All pieces tagged')} />
        <StatTile icon={MapPin} color="#c2410c" bg="bg-orange-50" title={tr('Awaiting Placement')} value={sum ? num(c(AWAITING)) : '—'} sub={tr('Tagged, not yet on a shelf')} onClick={() => showStatus(AWAITING)} />
        <StatTile icon={Store} color="#059669" bg="bg-emerald-50" title={tr('In Store')} value={sum ? num(c('In Store')) : '—'} sub={sum ? `${inr(by['In Store']?.est_value || 0)} ${tr('est.')}` : ''} />
        <StatTile icon={Send} color="#8a1c1c" bg="bg-maroon-50" title={tr('Issued')} value={sum ? num(c(ISSUED)) : '—'} sub={tr('Out on an issue slip')} onClick={() => showStatus(ISSUED)} />
        <StatTile icon={Gavel} color="#d97706" bg="bg-amber-50" title={tr('In Auction')} value={sum ? num(c('In Auction')) : '—'} sub={tr('Awaiting result')} />
        <StatTile icon={SearchX} color="#dc2626" bg="bg-red-50" title={tr('Missing')} value={sum ? num(c(MISSING)) : '—'} sub={tr('Not found at a stock check')} onClick={() => showStatus(MISSING)} />
        <StatTile icon={BadgeIndianRupee} color="#2563eb" bg="bg-blue-50" title={tr('Sold')} value={sum ? num(c('Sold')) : '—'} sub={sum ? `${inr(by.Sold?.sold_amount || 0)} ${tr('realised')}` : ''} />
        <StatTile icon={Archive} color="#6b7280" bg="bg-gray-100" title={tr('Written Off')} value={sum ? num(c('Written Off')) : '—'} sub={tr('Damaged or lost')} />
      </KpiGrid>

      {sum && (
        <div className={`mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] rounded-lg px-4 py-2.5 border ${sum.balanced ? 'bg-emerald-50/60 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <span className="inline-flex items-center gap-1.5 font-semibold">{sum.balanced ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {tr('Received')} {num(sum.received)} = {tr('Awaiting Placement')} {num(c(AWAITING))} + {tr('In Store')} {num(c('In Store'))} + {tr('Issued')} {num(c(ISSUED))} + {tr('In Auction')} {num(c('In Auction'))} + {tr('In Open Sale')} {num(c('In Open Sale'))} + {tr('Missing')} {num(c(MISSING))} + {tr('Sold')} {num(c('Sold'))} + {tr('Written Off')} {num(c('Written Off'))}</span>
          {pendingCount > 0 && <Link to="/admin/stores/pending" className="text-amber-800 font-semibold hover:underline">{num(pendingCount)} {tr('receipt(s) waiting to be tagged')} →</Link>}
          {sum.pending_manual > 0 && <Link to="/admin/stores/manual" className="text-amber-800 font-semibold hover:underline">{num(sum.pending_manual)} {tr('manual entry(s) waiting for committee')} →</Link>}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[12rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search ID, donor or receipt</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input !pl-9" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (setPage(1), setApplied(f))} placeholder={tr('PAN-00003, donor name, RCPT-…')} /></div></div>
          <div className="w-[11rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Item type</T></label>
            <Select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">{tr('All')}</option>{tagged.map((x) => <option key={x.id} value={x.id}>{tr(x.name)}</option>)}</Select></div>
          <div className="w-[9rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label>
            <Select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">{tr('All')}</option>{STATUSES.map((s) => <option key={s} value={s}>{tr(s)}</option>)}</Select></div>
          <div className="w-[11rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Location</T></label>
            <Select className="input" value={f.location_id} onChange={(e) => setF({ ...f, location_id: e.target.value })}><option value="">{tr('All')}</option>{locations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}</Select></div>
          <button onClick={() => { setPage(1); setApplied(f) }} className="btn-maroon !py-2.5 shrink-0"><Search size={14} />{' '}<T>Apply</T></button>
          <button onClick={() => { const z = { q: '', category_id: '', status: '', location_id: '' }; setF(z); setPage(1); setApplied(z) }} className="btn-outline !py-2.5 shrink-0"><RotateCcw size={14} />{' '}<T>Clear</T></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              <th className="px-3 py-3 w-8"><Checkbox checked={rows.length > 0 && rows.every((r) => picked[r.id])} onChange={() => { const all = rows.every((r) => picked[r.id]); setPicked(all ? {} : Object.fromEntries(rows.map((r) => [r.id, true]))) }} /></th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">{tr('ID')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Item')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Donor / Source')}</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">{tr('Received')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Location')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Status')}</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">{tr('Est. ₹')}</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">{tr('Sold ₹')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-3"><Checkbox checked={!!picked[r.id]} onChange={() => setPicked((p) => ({ ...p, [r.id]: !p[r.id] }))} /></td>
                  <td className="px-3 py-3 font-mono text-[0.78rem] whitespace-nowrap"><Link className="text-maroon-700 font-semibold hover:underline" to={`/admin/stores/item/${r.tag_id}`}>{r.tag_id}</Link></td>
                  <td className="px-3 py-3"><div className="font-semibold text-gray-800">{tr(r.description || r.item_name)}</div>
                    <div className="text-[0.6875rem] text-gray-500">{[tr(r.item_name), tr(r.details), r.weight_g ? `${num(r.weight_g)} ${gramUnit()}` : '', r.purity].filter(Boolean).join(' · ')}</div></td>
                  <td className="px-3 py-3"><div className="text-gray-800">{personName({ name: r.donor_name }, lang)}</div><div className="text-[0.6875rem] font-mono text-gray-400">{r.source_ref}</div></td>
                  <td className="px-3 py-3 whitespace-nowrap text-gray-600 text-[0.8125rem]">{fmtDate(r.received_on)}</td>
                  <td className="px-3 py-3 text-gray-700">{['In Store', 'In Open Sale'].includes(r.status) ? tr(r.location || '—')
                    : r.status === AWAITING ? <span className="text-orange-700 text-[0.8125rem]">{tr('Not placed yet')}</span>
                    : r.status === ISSUED && r.issue ? <span className="text-[0.8125rem] text-maroon-800">{tr('With')} {staffName(r.issue.issued_to)}
                        <span className="block text-[0.6875rem] text-gray-500"><Link to="/admin/stores/issue" className="font-mono hover:underline">{r.issue.code}</Link> · {tr('return by')} {fmtDate(r.issue.return_by)}</span></span>
                    : r.status === MISSING ? <span className="text-[0.8125rem] text-red-700">{tr('Last at')} {tr(r.location || '—')}
                        {r.missing && <span className="block text-[0.6875rem] text-gray-500"><Link to="/admin/stores/missing" className="font-mono hover:underline">{r.missing.check_code}</Link> · {tr(r.missing.status)}</span>}</span>
                    : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-3"><Pill tone={STATUS_TONE[r.status] || 'gray'}>{tr(r.status)}</Pill>
                    {r.last_auction_code && r.status !== 'In Store' && <div className="text-[0.6875rem] font-mono text-gray-500 mt-0.5">{r.last_auction_code}</div>}
                    {r.unsold_count > 0 && <div className="text-[0.6875rem] text-orange-700 mt-0.5">{tr('Unsold')} ×{r.unsold_count}</div>}</td>
                  <td className="px-3 py-3 tabular-nums">{r.est_value != null ? inr(r.est_value) : '—'}</td>
                  <td className="px-3 py-3 tabular-nums">{r.sold_amount != null ? inr(r.sold_amount) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-3"><div className="flex items-center gap-1.5 flex-nowrap">
                    <Link to={`/admin/stores/item/${r.tag_id}`} title={tr('History')} aria-label={tr('History')} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700"><Eye size={15} /></Link>
                    {canWrite && ['In Store', 'In Open Sale'].includes(r.status) && <button onClick={() => setMoveFor({ item: r, location_id: '' })} title={tr('Move to another location')} aria-label={tr('Move to another location')} className="w-8 h-8 grid place-items-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"><PackageOpen size={15} /></button>}
                    {canIssue && r.status === 'In Store' && <button onClick={() => setIssueFor([r])} title={tr('Issue')} aria-label={tr('Issue')} className="w-8 h-8 grid place-items-center rounded-lg border border-maroon-200 text-maroon-700 hover:bg-maroon-50"><Send size={14} /></button>}
                    {canPlace && r.status === AWAITING && <button onClick={() => setPlaceFor({ items: [r], location_id: '', note: '' })} title={tr('Place in a location')} aria-label={tr('Place in a location')} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50 text-[0.75rem] font-semibold whitespace-nowrap"><MapPin size={14} />{tr('Place')}</button>}
                    {canDamage && ['In Store', 'In Open Sale', AWAITING].includes(r.status) && <button onClick={() => writeOff(r)} title={tr('Write off')} aria-label={tr('Write off')} className="w-8 h-8 grid place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><XCircle size={15} /></button>}
                  </div></td>
                </tr>
              ))}
              {rows.length === 0 && <TableStates colSpan={10} loading={loading} error={loadErr} onRetry={load} empty={tr('No pieces found. Tag items from Pending Tagging.')} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit={tr('pieces')} />
        </div>
      </div>

      {moveFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoveFor(null)} />
          <form onSubmit={doMove} className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-serif text-lg font-bold text-maroon-800"><T>Move piece</T></h3>
              <div className="text-[0.75rem] text-gray-500"><span className="font-mono">{moveFor.item.tag_id}</span> · {tr('now at')} {tr(moveFor.item.location || '—')}</div></div>
            <div className="px-5 py-4"><label className="label"><T>New location *</T></label>
              <Select required className="input" value={moveFor.location_id} onChange={(e) => setMoveFor({ ...moveFor, location_id: e.target.value })}>
                <option value="">{tr('Select')}</option>{activeLocations.filter((l) => l.id !== moveFor.item.location_id).map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}
              </Select></div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => setMoveFor(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button type="submit" className="btn-maroon flex-1 justify-center"><T>Move</T></button>
            </div>
          </form>
        </div>
      )}
      {issueFor && <IssueDrawer preset={issueFor} onClose={() => { setIssueFor(null); setPicked({}); load() }} />}
      {placeFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !placing && setPlaceFor(null)} />
          <form onSubmit={doPlace} className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-serif text-lg font-bold text-maroon-800"><T>Place in location</T></h3>
              <div className="text-[0.75rem] text-gray-500 mt-0.5">{placeFor.items.length} {tr('piece(s)')}: <span className="font-mono">{placeFor.items.slice(0, 8).map((i) => i.tag_id).join(', ')}{placeFor.items.length > 8 ? ' …' : ''}</span></div></div>
            <div className="px-5 py-4 space-y-4">
              <div><label className="label"><T>Location *</T></label>
                <Select required autoFocus className="input" value={placeFor.location_id} onChange={(e) => setPlaceFor({ ...placeFor, location_id: e.target.value })}>
                  <option value="">{tr('Select')}</option>{activeLocations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}
                </Select></div>
              <div><label className="label"><T>Note</T></label>
                <input className="input" maxLength={200} value={placeFor.note} onChange={(e) => setPlaceFor({ ...placeFor, note: e.target.value })} placeholder={tr('e.g. Top shelf, box 3')} /></div>
              <p className="text-[0.75rem] text-gray-500"><T>Each piece's history records who placed it, where and when.</T></p>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" disabled={placing} onClick={() => setPlaceFor(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button type="submit" disabled={placing} className="btn-maroon flex-1 justify-center disabled:opacity-60"><MapPin size={15} className="mr-1" />{placing ? tr('Saving…') : tr('Place')}</button>
            </div>
          </form>
        </div>
      )}
      {stickers && <StickerSheet items={stickers} title={tr('Selected pieces')} onClose={() => setStickers(null)} />}
    </div>
  )
}
