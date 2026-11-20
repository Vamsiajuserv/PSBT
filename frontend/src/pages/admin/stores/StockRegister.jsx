import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Boxes, Store, Gavel, BadgeIndianRupee, Archive, Search, RotateCcw, Eye, PackageOpen, XCircle, Plus, Tags, CheckCircle2, AlertTriangle, MapPin, Send, SearchX, MoreHorizontal, List, LayoutGrid } from 'lucide-react'
import { PageTitle, StatTile, KpiGrid, FilterPanel, Pill, Pager, inr, num, fmtDate } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { Select, Checkbox } from '../../../components/common/Field.jsx'
import { promptDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { STATUS_TONE, STATUSES, AWAITING, ISSUED, MISSING, KEPT, WRITEOFF_REQ, StickerSheet, canWriteStores, canDamageStock, canPlaceStock, canIssueStock, staffName, useStoresMeta, sourceRef, DeityBadge } from './shared.jsx'
import { IssueDrawer } from './issue.jsx'

const SIZE = 25
// Stock Register tabs (2026-11-16): what the temple holds / what has left for good
const IN_HAND = ['In Store', ISSUED, 'In Auction', 'In Open Sale', MISSING, WRITEOFF_REQ, AWAITING]
const GONE_OUT = ['Sold', 'Written Off', KEPT]
const CHIP = { 'In Store': [Store, '#059669'], [ISSUED]: [Send, '#8a1c1c'], 'In Auction': [Gavel, '#d97706'], 'In Open Sale': [BadgeIndianRupee, '#7c3aed'],
  [MISSING]: [SearchX, '#dc2626'], [WRITEOFF_REQ]: [AlertTriangle, '#b45309'], [AWAITING]: [MapPin, '#c2410c'],
  Sold: [BadgeIndianRupee, '#2563eb'], 'Written Off': [Archive, '#6b7280'], [KEPT]: [Send, '#6b7280'] }
const ALWAYS = ['In Store', ISSUED, MISSING, 'Sold', 'Written Off']

// Where a piece came from, with its proof — two short lines
function cameFrom(r, lang) {
  const c = r.came_from || {}
  const date = r.received_on ? fmtDate(r.received_on) : ''
  if (c.kind === 'Donated') return [`${tr('Donated')}${c.who ? ` · ${personName({ name: c.who }, lang)}` : ''}`, [sourceRef(r), date]]
  if (c.kind === 'Hundi') return [tr('Hundi'), [c.ref, date]]
  if (c.kind === 'Bought') return [`${tr('Bought')}${c.who ? ` · ${c.who}` : ''}`, [c.bill ? `${tr('Bill')} ${c.bill}` : c.ref, date]]
  return [tr(c.kind || 'Manual entry'), [c.ref, c.verified_by && `${tr('verified by')} ${staffName(c.verified_by)}`]]
}

// The ⋯ menu of a row: fixed position so the table's scroll box does not clip it
function RowMenu({ actions }) {
  const [at, setAt] = useState(null)
  const btn = useRef(null)
  useEffect(() => {
    if (!at) return undefined
    const close = () => setAt(null)
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [at])
  if (!actions.length) return null
  return (
    <>
      <button ref={btn} title={tr('More actions')} aria-label={tr('More actions')} aria-haspopup="menu" aria-expanded={!!at}
        onClick={() => { const b = btn.current.getBoundingClientRect(); setAt({ top: b.bottom + 4, right: window.innerWidth - b.right }) }}
        className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"><MoreHorizontal size={15} /></button>
      {at && <>
        <div className="fixed inset-0 z-40" onClick={() => setAt(null)} />
        <div role="menu" style={{ top: at.top, right: at.right }} className="fixed z-50 w-max min-w-[12rem] bg-white rounded-lg border border-gray-200 shadow-lg py-1">
          {actions.map(([label, Icon, run, tone]) => (
            <button key={label} role="menuitem" onClick={() => { setAt(null); run() }}
              className={`w-full text-left px-3 py-2 text-[0.8125rem] inline-flex items-center gap-2 hover:bg-gray-50 ${tone || 'text-gray-800'}`}><Icon size={14} />{label}</button>))}
        </div></>}
    </>
  )
}
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')

export default function StockRegister() {
  const { user } = useAuth()
  const { lang } = useLang()
  const canWrite = canWriteStores(user)
  const canDamage = canDamageStock(user)   // ask to write off: Stores Officer + Administrator (Committee approves)
  const canPlace = canPlaceStock(user)     // Stores Officer, Counter Staff + Administrator
  const canIssue = canIssueStock(user)     // Stores Officer + Administrator
  const { categories, locations, activeLocations } = useStoresMeta()
  const tagged = categories.filter((c) => c.tracking === 'Tagged')

  // ?status=In Store (from the Stores Overview), ?q=DON-… (a donation's items), ?deity_used=true (Used items) or
  // ?origin=Bought opens the register already filtered
  const [params] = useSearchParams()
  const initialStatus = STATUSES.includes(params.get('status')) ? params.get('status') : ''
  const initialDeity = ['true', 'false'].includes(params.get('deity_used')) ? params.get('deity_used') : ''
  const initialOrigin = ['Donated', 'Bought', 'Other'].includes(params.get('origin')) ? params.get('origin') : ''
  const NO_FILTER = { q: '', category_id: '', status: '', location_id: '', deity_used: '', origin: '', held: 'in' }
  // a link to a donation's pieces (?q=DON-…) shows them wherever they are now; ?status=Sold opens "Gone out"
  const initialHeld = GONE_OUT.includes(initialStatus) ? 'out' : params.get('q') ? '' : 'in'
  const [f, setF] = useState({ ...NO_FILTER, q: params.get('q') || '', status: initialStatus, deity_used: initialDeity, origin: initialOrigin, held: initialHeld })
  const [view, setView] = useState('pieces')     // pieces | byitem
  const [byItem, setByItem] = useState(null)
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
  useEffect(() => {
    if (view !== 'byitem') return
    setByItem(null)
    StoresAPI.itemsByType(Object.fromEntries(Object.entries({ location_id: applied.location_id, origin: applied.origin }).filter(([, v]) => v)))
      .then((d) => setByItem(d.items)).catch((ex) => { setByItem([]); toast(errText(ex, 'Could not load the summary.'), 'error') })
  }, [view, applied])
  useEffect(() => { StoresAPI.pending().then((r) => setPendingCount(r.total)).catch(() => setPendingCount(null)) }, [])

  const by = sum?.by_status || {}
  const c = (s) => by[s]?.count ?? 0
  const pickedRows = rows.filter((r) => picked[r.id])
  const pickedAwaiting = pickedRows.filter((r) => r.status === AWAITING)
  const pickedInStore = pickedRows.filter((r) => r.status === 'In Store')
  const showStatus = (s) => { const z = { ...f, status: s }; setF(z); setPage(1); setApplied(z) }
  const showTab = (held) => { const z = { ...f, held, status: '' }; setF(z); setPage(1); setApplied(z); setView('pieces') }
  const tabStatuses = applied.held === 'out' ? GONE_OUT : applied.held === 'in' ? IN_HAND : [...IN_HAND, ...GONE_OUT]
  const tabTotal = (list) => list.reduce((n, st) => n + c(st), 0)
  const apply = () => { setPage(1); setApplied(f) }
  const clear = () => { const z = { ...NO_FILTER, held: applied.held || 'in' }; setF(z); setPage(1); setApplied(z) }
  const rowActions = (r) => [
    canWrite && ['In Store', 'In Open Sale'].includes(r.status) && [tr('Move to another location'), PackageOpen, () => setMoveFor({ item: r, location_id: '' }), 'text-blue-700'],
    canIssue && r.status === 'In Store' && [tr('Issue'), Send, () => setIssueFor([r]), 'text-maroon-700'],
    canPlace && r.status === AWAITING && [tr('Place in a location'), MapPin, () => setPlaceFor({ items: [r], location_id: '', note: '' }), 'text-orange-700'],
    canDamage && ['In Store', AWAITING].includes(r.status) && [tr('Ask to write off'), XCircle, () => writeOff(r), 'text-red-600'],
  ].filter(Boolean)

  async function writeOff(item) {
    const res = await promptDialog({
      title: `${tr('Ask to write off')} — ${item.tag_id}`, tone: 'danger', confirmLabel: tr('Send to committee'),
      message: tr('A committee member approves it in Missing Items. Until then the piece stays in the register and cannot be issued or sold.'),
      fields: [{ k: 'reason', label: tr('Reason'), required: true, placeholder: tr('e.g. Torn, cannot be used') }],
    })
    if (!res) return
    try { await StoresAPI.writeOff(item.id, res.reason.trim()); toast(tr('Sent to the committee for approval.')); load(); window.dispatchEvent(new Event('stores:changed')) }
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
          {canIssue && <Link to="/admin/stores/manual" className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Manual Stock Entry</T></Link>}
        </span>} />

      {/* In hand / Gone out (2026-11-16); the chips are that tab's statuses — click one to list just those pieces */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div role="tablist" className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {[['in', tr('In hand'), IN_HAND], ['out', tr('Gone out'), GONE_OUT]].map(([k, label, list]) => (
            <button key={k} role="tab" aria-selected={view === 'pieces' && applied.held === k} onClick={() => showTab(k)}
              className={`px-3.5 py-1.5 rounded-md text-[0.8125rem] font-semibold ${view === 'pieces' && applied.held === k ? 'bg-maroon-700 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>
              {label} <span className={`ml-1 tabular-nums ${view === 'pieces' && applied.held === k ? 'text-white/85' : 'text-gray-500'}`}>{sum ? num(tabTotal(list)) : '—'}</span></button>))}
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 ml-auto">
          {[['pieces', tr('Pieces'), List], ['byitem', tr('By item'), LayoutGrid]].map(([k, label, Icon]) => (
            <button key={k} aria-pressed={view === k} aria-label={label} title={label} onClick={() => setView(k)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[0.8125rem] font-semibold inline-flex items-center gap-1.5 ${view === k ? 'bg-gray-800 text-white' : 'text-gray-700 hover:bg-gray-50'}`}><Icon size={14} /><span className="hidden sm:inline">{label}</span></button>))}
        </div>
      </div>
      {view === 'pieces' && <KpiGrid variant="chips" label={tr('Pieces by status')}>
        <StatTile icon={Boxes} color="#8a1c1c" title={tr('All')} value={sum ? num(tabTotal(tabStatuses)) : '—'} active={!applied.status} onClick={() => showStatus('')} />
        {tabStatuses.filter((st) => !sum || c(st) > 0 || ALWAYS.includes(st)).map((st) => (
          <StatTile key={st} icon={CHIP[st][0]} color={CHIP[st][1]} title={tr(st)} value={sum ? num(c(st)) : '—'}
            active={applied.status === st} onClick={() => showStatus(st)} />))}
      </KpiGrid>}

      {sum && (
        <div className={`mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] rounded-lg px-4 py-2 border ${sum.balanced ? 'bg-emerald-50/60 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {/* the chips above already show each status — the full sum only when it does not add up */}
          <span className="inline-flex items-center gap-1.5 font-semibold">{sum.balanced ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {sum.balanced ? tr('Register balances — every piece received is accounted for.')
              : <>{tr('Received')} {num(sum.received)} ≠ {STATUSES.map((st) => `${tr(st)} ${num(c(st))}`).join(' + ')}</>}</span>
          {pendingCount > 0 && <Link to="/admin/stores/pending" className="text-amber-800 font-semibold hover:underline">{num(pendingCount)} {tr('receipt(s) waiting to be tagged')} →</Link>}
          {sum.deity_used_in_store > 0 && <button onClick={() => { const z = { ...NO_FILTER, deity_used: 'true', status: 'In Store' }; setF(z); setPage(1); setApplied(z) }} className="text-amber-800 font-semibold hover:underline">{num(sum.deity_used_in_store)} {tr('used item(s) in store')} →</button>}
          {sum.pending_manual > 0 && <Link to="/admin/stores/manual" className="text-amber-800 font-semibold hover:underline">{num(sum.pending_manual)} {tr('manual entry(s) waiting for committee')} →</Link>}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <FilterPanel active={[applied.q, applied.category_id, applied.location_id, applied.deity_used, applied.origin].filter(Boolean).length}>
        <div className="px-5 py-4 flex flex-wrap items-end gap-3">
          {view === 'pieces' && <div className="flex-1 min-w-[12rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search ID, donor, receipt or bill</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input !pl-9" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder={tr('PAN-00003, donor name, DON-… or RCPT-…')} /></div></div>}
          {view === 'pieces' && <div className="w-[9rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Item type</T></label>
            <Select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">{tr('All')}</option>{tagged.map((x) => <option key={x.id} value={x.id}>{tr(x.name)}</option>)}</Select></div>}
          <div className="w-[9rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Location</T></label>
            <Select className="input" value={f.location_id} onChange={(e) => setF({ ...f, location_id: e.target.value })}><option value="">{tr('All')}</option>{locations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}</Select></div>
          <div className="w-[8.5rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Source</T></label>
            <Select className="input" value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })}><option value="">{tr('All')}</option>
              <option value="Donated">{tr('Donated')}</option><option value="Bought">{tr('Bought')}</option><option value="Other">{tr('Opening / old stock')}</option></Select></div>
          {view === 'pieces' && <div className="w-[7rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Used</T></label>
            <Select className="input" value={f.deity_used} onChange={(e) => setF({ ...f, deity_used: e.target.value })}><option value="">{tr('All')}</option>
              <option value="true">{tr('Used')}</option><option value="false">{tr('Not used')}</option></Select></div>}
          <div className="flex gap-2 shrink-0">
            <button onClick={apply} className="btn-maroon !py-2.5"><Search size={14} />{' '}<T>Apply</T></button>
            <button onClick={clear} className="btn-outline !py-2.5"><RotateCcw size={14} />{' '}<T>Clear</T></button>
          </div>
        </div>
        </FilterPanel>
        {view === 'byitem' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              <th className="px-4 py-3 font-semibold">{tr('Item type')}</th>
              {[tr('In Store'), tr('Issued'), tr('In auction / sale'), tr('Missing'), tr('In hand'), tr('Gone out')].map((h) => <th key={h} className="px-4 py-3 font-semibold text-right whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {(byItem || []).map((x) => (
                <tr key={x.category_id} className="hover:bg-gray-50/60 cursor-pointer" title={tr('Show these pieces')}
                  onClick={() => { const z = { ...NO_FILTER, category_id: String(x.category_id), location_id: applied.location_id, origin: applied.origin, held: 'in' }; setF(z); setPage(1); setApplied(z); setView('pieces') }}>
                  <td className="px-4 py-3 font-semibold text-maroon-800">{tr(x.name)}</td>
                  {[x.in_store, x.issued, x.on_sale, x.missing].map((n, i) => <td key={i} className={`px-4 py-3 text-right tabular-nums ${n ? (i === 3 ? 'text-red-700 font-semibold' : 'text-gray-800') : 'text-gray-300'}`}>{num(n)}</td>)}
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">{num(x.in_hand)}
                    {x.weighed && x.grams_in_hand > 0 && <span className="block text-[0.6875rem] font-normal text-gray-500">{num(x.grams_in_hand)} {gramUnit()}</span>}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${x.gone_out ? 'text-gray-600' : 'text-gray-300'}`}>{num(x.gone_out)}</td>
                </tr>))}
              {!(byItem || []).length && <TableStates colSpan={7} loading={byItem === null} empty={tr('No pieces found. Tag items from Receive & Tag.')} />}
            </tbody>
          </table>
        </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              <th className="px-3 py-3 w-8"><Checkbox checked={rows.length > 0 && rows.every((r) => picked[r.id])} onChange={() => { const all = rows.every((r) => picked[r.id]); setPicked(all ? {} : Object.fromEntries(rows.map((r) => [r.id, true]))) }} /></th>
              <th className="px-3 py-3 font-semibold">{tr('Piece')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Came from')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Where now')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Status')}</th>
              <th className="px-3 py-3 font-semibold text-right">{tr('Value')}</th>
              <th className="px-3 py-3 w-20" aria-label={tr('Actions')} />
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const [from, proof] = cameFrom(r, lang)
                return (
                <tr key={r.id} className="hover:bg-gray-50/60 align-top">
                  <td className="px-3 py-3"><Checkbox checked={!!picked[r.id]} onChange={() => setPicked((p) => ({ ...p, [r.id]: !p[r.id] }))} /></td>
                  <td className="px-3 py-3"><div className="flex items-center gap-2 flex-wrap"><Link className="font-mono text-[0.78rem] text-maroon-700 font-semibold hover:underline whitespace-nowrap" to={`/admin/stores/item/${r.tag_id}`}>{r.tag_id}</Link>
                    {r.deity_used && <DeityBadge item={r} />}</div>
                    <div className="text-[0.8125rem] font-semibold text-gray-800 mt-0.5">{tr(r.description || r.item_name)}</div>
                    <div className="text-[0.6875rem] text-gray-500">{[r.description && tr(r.item_name), tr(r.details), r.weight_g ? `${num(r.weight_g)} ${gramUnit()}` : '', r.purity].filter(Boolean).join(' · ')}</div></td>
                  <td className="px-3 py-3 min-w-[11rem]"><div className="text-[0.8125rem] text-gray-800">{from}</div>
                    <div className="text-[0.6875rem] text-gray-500">{proof.filter(Boolean).join(' · ')}</div></td>
                  <td className="px-3 py-3 min-w-[8rem] text-[0.8125rem] text-gray-700">{['In Store', 'In Open Sale'].includes(r.status) ? tr(r.location || '—')
                    : r.status === AWAITING ? <span className="text-orange-700">{tr('Not placed yet')}</span>
                    : r.status === ISSUED && r.issue ? <span className="text-maroon-800">{tr('With')} {staffName(r.issue.issued_to)}
                        <span className="block text-[0.6875rem] text-gray-500"><Link to="/admin/stores/issue" className="font-mono hover:underline">{r.issue.code}</Link>{r.issue.return_by ? <> · {tr('return by')} {fmtDate(r.issue.return_by)}</> : null}</span></span>
                    : r.status === 'In Auction' ? <span>{tr('In auction')}{r.last_auction_code && <span className="block text-[0.6875rem] font-mono text-gray-500">{r.last_auction_code}</span>}</span>
                    : [MISSING, WRITEOFF_REQ].includes(r.status) ? <span className="text-red-700">{tr('Last at')} {tr(r.location || '—')}
                        {r.missing && <span className="block text-[0.6875rem] text-gray-500"><Link to="/admin/stores/missing" className="font-mono hover:underline">{r.missing.check_code}</Link> · {tr(r.missing.status)}</span>}</span>
                    : r.status === 'Sold' && r.last_auction_code ? <span className="text-gray-500">{tr('Sold in')} <span className="font-mono text-[0.75rem]">{r.last_auction_code}</span></span>
                    : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-3"><Pill tone={STATUS_TONE[r.status] || 'gray'}>{tr(r.status)}</Pill>
                    {r.unsold_count > 0 && <div className="text-[0.6875rem] text-orange-700 mt-0.5">{tr('Unsold')} ×{r.unsold_count}</div>}</td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{r.sold_amount != null
                    ? <>{inr(r.sold_amount)}<span className="block text-[0.6875rem] text-gray-500">{tr('sold')}</span></>
                    : r.est_value ? <>{inr(r.est_value)}<span className="block text-[0.6875rem] text-gray-500">{tr('est.')}</span></>
                    : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-3"><div className="flex items-center gap-1.5 justify-end">
                    <Link to={`/admin/stores/item/${r.tag_id}`} title={tr('History')} aria-label={tr('History')} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700"><Eye size={15} /></Link>
                    <RowMenu actions={rowActions(r)} />
                  </div></td>
                </tr>)
              })}
              {rows.length === 0 && <TableStates colSpan={7} loading={loading} error={loadErr} onRetry={load} empty={applied.held === 'out' ? tr('Nothing has gone out yet.') : tr('No pieces found. Tag items from Receive & Tag.')} />}
            </tbody>
          </table>
        </div>
        )}
        {view === 'pieces' && <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit={tr('pieces')} />
        </div>}
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
