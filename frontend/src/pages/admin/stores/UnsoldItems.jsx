import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gavel, PackageX, ShoppingBag, Search } from 'lucide-react'
import { PageTitle, Pill, inr } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { Select, Checkbox } from '../../../components/common/Field.jsx'
import { promptDialog, toast } from '../../../components/common/Dialog.jsx'
import { T, tr, personName, useLang, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { useStoresMeta, isCommitteeUser } from './shared.jsx'
import { StockAuctionDrawer } from '../auction/LotAuction.jsx'

// Creating an auction needs Auction write: Counter Staff, Committee, Administrator
const canAuction = (user) => ['Admin', 'Administrator', 'Counter Staff', 'Committee'].includes(user?.role)

export default function UnsoldItems() {
  const { user } = useAuth()
  const { lang } = useLang()
  const { categories } = useStoresMeta()
  const tagged = categories.filter((c) => c.tracking === 'Tagged')
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')   // ID / description / donor search over the loaded pieces
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [picked, setPicked] = useState({})
  const [preset, setPreset] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setLoadErr(''); setPicked({})
    return StoresAPI.unsold(cat ? { category_id: cat } : {}).then((r) => setRows(r.items || []))
      .catch((ex) => { setLoadErr(tr(getErrorMessage(ex, "Couldn't load — check your connection and retry."))); setRows([]) })
      .finally(() => setLoading(false))
  }, [cat])
  useEffect(() => { load() }, [load])

  const view = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? rows.filter((r) => `${r.tag_id} ${r.description || ''} ${r.details || ''} ${r.donor_name || ''} ${r.source_ref || ''} ${r.last_auction_code || ''}`.toLowerCase().includes(t)) : rows
  }, [rows, q])
  const chosen = view.filter((r) => picked[r.id])   // only ticked pieces still on screen
  const oneType = useMemo(() => new Set(chosen.map((r) => r.category_id)).size <= 1, [chosen])
  const reauction = () => {
    // Suggest the lowest price these pieces were last offered at; staff can lower it further
    const bases = chosen.map((r) => r.last_base_price).filter((v) => v != null)
    setPreset({ category_id: chosen[0].category_id, piece_ids: chosen.map((r) => r.id), base_price: bases.length ? Math.min(...bases) : '' })
  }

  // Committee only: the Open Sale price is their decision (that price is the approval)
  async function toOpenSale() {
    const res = await promptDialog({ title: `${tr('Move to Open Sale')} (${chosen.length})`, confirmLabel: tr('Move to Open Sale'),
      message: `${chosen.map((r) => r.tag_id).join(', ')} — ${tr('Counter staff will sell each piece at this price.')}`,
      fields: [{ k: 'price', label: tr('Open Sale price per piece (₹)'), type: 'number', required: true }] })
    if (!res) return
    try {
      await StoresAPI.moveToOpenSale({ piece_ids: chosen.map((r) => r.id), price: Number(res.price) })
      toast(`${chosen.length} ${tr('piece(s) moved to Open Sale.')}`); window.dispatchEvent(new Event('stores:changed')); load()
    } catch (ex) { toast(tr(getErrorMessage(ex, 'Could not move to Open Sale.')).replace(/^Value error, /, ''), 'error') }
  }

  return (
    <div>
      <PageTitle title={tr('Unsold Items')} subtitle={tr('Pieces that came back unsold from an auction and are back in store. Tick them and re-auction in one step.')}
        actions={<span className="inline-flex flex-wrap gap-2">
          {isCommitteeUser(user) && <button disabled={!chosen.length} onClick={toOpenSale} className="btn-outline !py-2.5 disabled:opacity-50">
            <ShoppingBag size={16} />{' '}{tr('Move to Open Sale')} ({chosen.length})</button>}
          {canAuction(user) && <button disabled={!chosen.length || !oneType} onClick={reauction} className="btn-maroon !py-2.5 disabled:opacity-50">
            <Gavel size={16} />{' '}{tr('Re-auction selected')} ({chosen.length})</button>}
        </span>} />
      {!oneType && <div className="mb-3 text-[0.8125rem] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2"><T>An auction holds one item type — pick pieces of the same type.</T></div>}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-end justify-between gap-3">
          <div className="w-[13rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Item type</T></label>
            <Select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">{tr('All')}</option>{tagged.map((c) => <option key={c.id} value={c.id}>{tr(c.name)}</option>)}
            </Select></div>
          <div className="flex-1 min-w-[12rem] max-w-md"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search ID, item or donor</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('PAN-00012, silk, AUC-…')} /></div></div>
          <div className="text-[0.8125rem] text-gray-600">{view.length !== rows.length ? `${view.length} / ` : ''}{rows.length} {tr('unsold pieces in store')}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              <th className="pl-5 pr-2 py-3 w-10"><Checkbox checked={view.length > 0 && view.every((r) => picked[r.id])}
                onChange={() => { const all = view.every((r) => picked[r.id]); setPicked(all ? {} : Object.fromEntries(view.map((r) => [r.id, true]))) }} /></th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('ID')}</th><th className="px-4 py-3 font-semibold">{tr('Item')}</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">{tr('Times unsold')}</th><th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Last auction')}</th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">{tr('Last base ₹')}</th><th className="px-4 py-3 font-semibold">{tr('Location')}</th>
              <th className="px-4 py-3 font-semibold">{tr('Donor / Source')}</th><th className="pl-4 pr-5 py-3 font-semibold text-right whitespace-nowrap">{tr('Est. ₹')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {view.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/60">
                  <td className="pl-5 pr-2 py-3"><Checkbox checked={!!picked[r.id]} onChange={() => setPicked((p) => ({ ...p, [r.id]: !p[r.id] }))} /></td>
                  <td className="px-4 py-3 font-mono text-[0.78rem] whitespace-nowrap"><Link className="text-maroon-700 font-semibold hover:underline" to={`/admin/stores/item/${r.tag_id}`}>{r.tag_id}</Link></td>
                  <td className="px-4 py-3"><div className="font-semibold text-gray-800">{tr(r.description || r.item_name)}</div>
                    <div className="text-[0.6875rem] text-gray-500">{[tr(r.item_name), tr(r.details), r.weight_g ? `${r.weight_g} ${gramUnit()}` : ''].filter(Boolean).join(' · ')}</div></td>
                  <td className="px-4 py-3 text-center"><Pill tone={r.unsold_count >= 2 ? 'red' : 'orange'}>×{r.unsold_count}</Pill></td>
                  <td className="px-4 py-3 font-mono text-[0.75rem] whitespace-nowrap">{r.last_auction_code || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{r.last_base_price != null ? inr(r.last_base_price) : '—'}</td>
                  <td className="px-4 py-3">{tr(r.location || '—')}</td>
                  <td className="px-4 py-3"><div>{personName({ name: r.donor_name }, lang)}</div><div className="text-[0.6875rem] font-mono text-gray-400">{r.source_ref}</div></td>
                  <td className="pl-4 pr-5 py-3 text-right tabular-nums whitespace-nowrap">{r.est_value != null ? inr(r.est_value) : '—'}</td>
                </tr>
              ))}
              {view.length === 0 && <TableStates colSpan={9} loading={loading} error={loadErr} onRetry={load}
                empty={rows.length ? tr('No pieces match this search.') : tr('No unsold pieces — everything offered so far has sold.')} />}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-4 flex items-start gap-2 text-[0.8125rem] text-gray-600 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-3">
        <PackageX size={16} className="text-blue-500 shrink-0 mt-0.5" />
        <T>Pieces unsold two or more times are marked red — these are the candidates for Open Sale.</T>
      </div>
      {preset && <StockAuctionDrawer preset={preset} onClose={() => setPreset(null)}
        onCreated={() => { setPreset(null); window.dispatchEvent(new Event('stores:changed')); load() }} />}
    </div>
  )
}
