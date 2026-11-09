import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Store, Gavel, BadgeIndianRupee, Search, RotateCcw, Plus, XCircle, Info } from 'lucide-react'
import { PageTitle, StatTile, KpiGrid, Pill, Pager, inr, num } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { Select, Checkbox } from '../../../components/common/Field.jsx'
import { promptDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { STATUS_TONE, STATUSES, AWAITING, ISSUED, MISSING, canManageStores, useStoresMeta, sourceRef } from './shared.jsx'
import { StockAuctionDrawer } from '../auction/LotAuction.jsx'

// Deity-Used Items: pieces worn / used by the deity (alankaram, festival). They are offered first
// at auction; gold and silver are tracked only and never auctioned. Marked automatically when a
// piece comes back from an Alankaram / Festival issue slip, or by the Stores Officer here.
const SIZE = 25
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
// Creating an auction needs Auction write: Counter Staff, Committee, Administrator
const canAuction = (user) => ['Admin', 'Administrator', 'Counter Staff', 'Committee'].includes(user?.role)
const EMPTY = { q: '', category_id: '', status: 'In Store', location_id: '' }

export default function DeityUsedItems() {
  const { user } = useAuth()
  const { lang } = useLang()
  const canMark = canManageStores(user)          // Stores Officer + Administrator
  const { categories, locations } = useStoresMeta()
  const tagged = categories.filter((c) => c.tracking === 'Tagged')
  const auctionable = new Set(tagged.filter((c) => c.auctionable !== false).map((c) => c.id))
  const [f, setF] = useState(EMPTY)
  const [applied, setApplied] = useState(EMPTY)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [sum, setSum] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [picked, setPicked] = useState({})
  const [preset, setPreset] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setLoadErr(''); setPicked({})
    const params = Object.fromEntries(Object.entries(applied).filter(([, v]) => v !== ''))
    try {
      const [d, s] = await Promise.all([
        StoresAPI.items({ ...params, deity_used: true, order: 'deity_first', page, size: SIZE }),
        StoresAPI.deityUsedSummary(applied.category_id ? { category_id: applied.category_id } : {}),
      ])
      setRows(d.items); setTotal(d.total); setSum(s)
    } catch (ex) {
      setLoadErr(errText(ex, "Couldn't load — check your connection and retry.")); setRows([])
    } finally { setLoading(false) }
  }, [applied, page])
  useEffect(() => { load() }, [load])

  const by = sum?.by_status || {}
  const c = (s) => by[s]?.count || 0
  const show = (status) => { const z = { ...f, status }; setF(z); setPage(1); setApplied(z) }
  // Send to auction: In Store pieces of one auctionable item type
  const chosen = rows.filter((r) => picked[r.id])
  const oneType = new Set(chosen.map((r) => r.category_id)).size <= 1
  const sendable = chosen.length > 0 && oneType && chosen.every((r) => r.status === 'In Store' && auctionable.has(r.category_id))

  async function markOne() {
    const res = await promptDialog({ title: tr('Mark as Deity-Used'), confirmLabel: tr('Mark as Deity-Used'),
      message: tr('Deity-Used items are offered first at auction.'),
      fields: [{ k: 'tag', label: tr('Item ID'), placeholder: 'PAN-00003', required: true },
        { k: 'note', label: tr('Occasion *'), placeholder: tr('e.g. Dasara 2025 alankaram'), required: true }] })
    if (!res) return
    try {
      const item = await StoresAPI.item(res.tag.trim().toUpperCase())
      await StoresAPI.setDeityUsed(item.id, { used: true, note: res.note.trim() })
      toast(`${item.tag_id}: ${tr('marked as Deity-Used.')}`); load()
    } catch (ex) { toast(errText(ex, 'Could not save.'), 'error') }
  }
  async function unmark(r) {
    const res = await promptDialog({ title: `${tr('Remove Deity-Used mark')} — ${r.tag_id}`, confirmLabel: tr('Remove Deity-Used mark'),
      message: tr('The piece will be auctioned like any other piece.'),
      fields: [{ k: 'note', label: tr('Reason *'), placeholder: tr('e.g. Marked by mistake'), required: true }] })
    if (!res) return
    try {
      await StoresAPI.setDeityUsed(r.id, { used: false, note: res.note.trim() })
      toast(`${r.tag_id}: ${tr('Deity-Used mark removed.')}`); load()
    } catch (ex) { toast(errText(ex, 'Could not save.'), 'error') }
  }

  return (
    <div>
      <PageTitle title={tr('Deity-Used Items')} subtitle={tr('Pieces worn or used by the deity for alankaram and festivals — offered first at auction.')}
        actions={<span className="inline-flex flex-wrap gap-2">
          {canAuction(user) && <button disabled={!sendable} onClick={() => setPreset({ category_id: chosen[0].category_id, piece_ids: chosen.map((r) => r.id), base_price: '',
            title: tr('Auction Deity-Used Items'), notes: tr('Deity-Used items') })}
            title={sendable ? undefined : tr('Tick In Store pieces of one item type that can be auctioned')} className="btn-outline !py-2.5 disabled:opacity-50 disabled:cursor-not-allowed">
            <Gavel size={16} />{' '}{tr('Send to auction')} ({chosen.length})</button>}
          {canMark && <button onClick={markOne} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Mark an item</T></button>}
        </span>} />

      <KpiGrid data-n={4}>
        <StatTile icon={Sparkles} color="#b45309" bg="bg-amber-50" title={tr('Deity-Used Items')} value={sum ? num(sum.total) : '—'} sub={tr('All marked pieces')} onClick={() => show('')} />
        <StatTile icon={Store} color="#059669" bg="bg-emerald-50" title={tr('In Store')} value={sum ? num(c('In Store')) : '—'} sub={sum ? `${inr(by['In Store']?.est_value || 0)} ${tr('est.')}` : ''} onClick={() => show('In Store')} />
        <StatTile icon={Gavel} color="#d97706" bg="bg-amber-50" title={tr('In Auction')} value={sum ? num(c('In Auction')) : '—'} sub={tr('Awaiting result')} onClick={() => show('In Auction')} />
        <StatTile icon={BadgeIndianRupee} color="#2563eb" bg="bg-blue-50" title={tr('Sold')} value={sum ? num(c('Sold')) : '—'} sub={sum ? `${inr(by.Sold?.sold_amount || 0)} ${tr('realised')}` : ''} onClick={() => show('Sold')} />
      </KpiGrid>

      {!oneType && <div className="mb-3 text-[0.8125rem] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2"><T>An auction holds one item type — pick pieces of the same type.</T></div>}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[12rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search ID, donor or receipt</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input !pl-9" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (setPage(1), setApplied(f))} placeholder={tr('PAN-00003, donor name, DON-… or RCPT-…')} /></div></div>
          <div className="w-[11rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Item type</T></label>
            <Select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">{tr('All')}</option>{tagged.map((x) => <option key={x.id} value={x.id}>{tr(x.name)}</option>)}</Select></div>
          <div className="w-[9rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label>
            <Select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">{tr('All')}</option>{STATUSES.map((s) => <option key={s} value={s}>{tr(s)}</option>)}</Select></div>
          <div className="w-[11rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Location</T></label>
            <Select className="input" value={f.location_id} onChange={(e) => setF({ ...f, location_id: e.target.value })}><option value="">{tr('All')}</option>{locations.map((l) => <option key={l.id} value={l.id}>{tr(l.name)}</option>)}</Select></div>
          <button onClick={() => { setPage(1); setApplied(f) }} className="btn-maroon !py-2.5 shrink-0"><Search size={14} />{' '}<T>Apply</T></button>
          <button onClick={() => { setF(EMPTY); setPage(1); setApplied(EMPTY) }} className="btn-outline !py-2.5 shrink-0"><RotateCcw size={14} />{' '}<T>Clear</T></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              <th className="px-3 py-3 w-8"><Checkbox checked={rows.length > 0 && rows.every((r) => picked[r.id])} onChange={() => { const all = rows.every((r) => picked[r.id]); setPicked(all ? {} : Object.fromEntries(rows.map((r) => [r.id, true]))) }} /></th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">{tr('ID')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Item')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Used for')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Donor / Source')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Location')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Status')}</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap text-center">{tr('Times unsold')}</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">{tr('Est. ₹')}</th>
              {canMark && <th className="px-3 py-3 font-semibold">{tr('Actions')}</th>}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-3"><Checkbox checked={!!picked[r.id]} onChange={() => setPicked((p) => ({ ...p, [r.id]: !p[r.id] }))} /></td>
                  <td className="px-3 py-3 font-mono text-[0.78rem] whitespace-nowrap"><Link className="text-maroon-700 font-semibold hover:underline" to={`/admin/stores/item/${r.tag_id}`}>{r.tag_id}</Link></td>
                  <td className="px-3 py-3"><div className="font-semibold text-gray-800">{tr(r.description || r.item_name)}</div>
                    <div className="text-[0.6875rem] text-gray-500">{[tr(r.item_name), tr(r.details), r.weight_g ? `${num(r.weight_g)} ${gramUnit()}` : '', r.purity].filter(Boolean).join(' · ')}</div>
                    {!auctionable.has(r.category_id) && <div className="text-[0.6875rem] text-gray-500 italic">{tr('Tracked only — never auctioned')}</div>}</td>
                  <td className="px-3 py-3 text-[0.8125rem] text-amber-800">{r.deity_used_note || '—'}</td>
                  <td className="px-3 py-3"><div className="text-gray-800">{personName({ name: r.donor_name }, lang)}</div><div className="text-[0.6875rem] font-mono text-gray-400">{sourceRef(r)}</div></td>
                  <td className="px-3 py-3 text-gray-700">{['In Store', 'In Open Sale', ISSUED, MISSING].includes(r.status) ? tr(r.location || '—') : r.status === AWAITING ? tr('Not placed yet') : '—'}</td>
                  <td className="px-3 py-3"><Pill tone={STATUS_TONE[r.status] || 'gray'}>{tr(r.status)}</Pill></td>
                  <td className="px-3 py-3 text-center">{r.unsold_count ? <Pill tone={r.unsold_count >= 2 ? 'red' : 'orange'}>×{r.unsold_count}</Pill> : '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{r.sold_amount != null ? inr(r.sold_amount) : r.est_value != null ? inr(r.est_value) : '—'}</td>
                  {canMark && <td className="px-3 py-3">{!['Sold', 'Written Off'].includes(r.status) && (
                    <button onClick={() => unmark(r)} title={tr('Remove Deity-Used mark')} aria-label={tr('Remove Deity-Used mark')} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><XCircle size={15} /></button>)}</td>}
                </tr>
              ))}
              {rows.length === 0 && <TableStates colSpan={canMark ? 10 : 9} loading={loading} error={loadErr} onRetry={load}
                empty={tr('No Deity-Used items here. A piece is marked when it comes back from an Alankaram or Festival issue slip.')} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit={tr('pieces')} />
        </div>
      </div>
      <div className="mt-4 flex items-start gap-2 text-[0.8125rem] text-gray-600 bg-amber-50/60 border border-amber-100 rounded-lg px-4 py-3">
        <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <T>Deity-Used pieces are listed first when an auction is created from stock. Gold and silver are tracked only and are never auctioned.</T>
      </div>
      {preset && <StockAuctionDrawer preset={preset} onClose={() => setPreset(null)}
        onCreated={() => { setPreset(null); window.dispatchEvent(new Event('stores:changed')); load() }} />}
    </div>
  )
}
