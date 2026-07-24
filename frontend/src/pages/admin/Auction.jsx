import React, { useEffect, useState, useCallback } from 'react'
import {
  Plus, X, Eye, MoreVertical, Search, RotateCcw, Info, Trash2,
  Gavel, CalendarClock, Users, CheckCircle2, User,
} from 'lucide-react'
import { PageTitle, StatTile, Pill, Pager, inr, num, fmtDate } from '../../components/admin/ui.jsx'
import { AuctionAPI, AuctionItemsAPI, DevoteesAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { TableStates } from '../../components/common/states.jsx'
import ExportButtons from '../../components/common/ExportButtons.jsx'
import { Select, DateField, TimeField, NumberField } from '../../components/common/Field.jsx'
import { confirmDialog, promptDialog, toast } from '../../components/common/Dialog.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const STATUS_TONE = { Scheduled: 'blue', 'In Progress': 'amber', Completed: 'green' }
const to12h = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 || 12
  return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`
}
const emptyForm = () => ({ itemChoice: '', item: '', base_amount: '', devotee: null, winner: '', description: '', auction_date: '', start_time: '', notes: '' })

export default function Auction() {
  const { user } = useAuth()
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)
  const canWrite = user?.role !== 'Accountant'
  const SIZE = 15
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [stats, setStats] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [view, setView] = useState(null)
  const [menu, setMenu] = useState(null)

  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  // master auction items for the item dropdown
  const [items, setItems] = useState([])
  useEffect(() => {
    AuctionItemsAPI.list({ status: 'Active' })
      .then((r) => setItems(Array.isArray(r) ? r : (r.items || [])))
      .catch(() => setItems([]))
  }, [])

  // devotee type-ahead inside the drawer
  const [dq, setDq] = useState('')
  const [results, setResults] = useState([])
  const picked = drawer?.devotee
  useEffect(() => {
    if (!drawer || picked || dq.trim().length < 1) { setResults([]); return }
    const t = setTimeout(() => DevoteesAPI.list({ q: dq, size: 6 })
      .then((r) => setResults(Array.isArray(r) ? r : (r.items || [])))
      .catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [dq, picked, drawer])

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('')
    try {
      const [d, s] = await Promise.all([
        AuctionAPI.list({ q, status, start, end, page, size: SIZE }),
        AuctionAPI.stats().catch(() => null),
      ])
      setRows(d.items); setTotal(d.total); if (s) setStats(s)
    } catch (ex) {
      setLoadErr(ex?.detail || "Couldn't load auctions — check your connection and retry.")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q, status, start, end, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useEffect(() => { setPage(1) }, [q, status, start, end])

  async function save(e) {
    e.preventDefault()
    try {
      await AuctionAPI.create({
        devotee_id: drawer.devotee?.id || null,
        item: drawer.item, description: drawer.description || null,
        base_amount: Number(drawer.base_amount) || 0,
        winner: drawer.winner || null,
        auction_date: drawer.auction_date || null, start_time: to12h(drawer.start_time) || null,
        notes: drawer.notes || null, status: 'Scheduled',
      })
      setDrawer(null); setDq(''); load()
    } catch (ex) {
      toast(ex?.detail || 'Could not save the auction — check the base amount and details.', 'error')
    }
  }

  // Committee decision: record the highest bid + winner, optionally close the auction.
  async function recordResult(a) {
    const res = await promptDialog({
      title: `Record result — ${a.item}`,
      confirmLabel: 'Record Result',
      fields: [
        { k: 'amount', label: 'Highest bid (₹)', type: 'number', required: true,
          defaultValue: String(a.current_amount || a.base_amount || ''),
          note: `Base amount ₹${Number(a.base_amount).toLocaleString('en-IN')} — the bid cannot be below it.` },
        { k: 'winner', label: 'Winning bidder name', defaultValue: a.winner || '' },
        { k: 'close', label: 'Mark as Completed (winner finalised)', type: 'checkbox' },
      ],
    })
    if (!res) return
    try {
      await AuctionAPI.update(a.id, {
        current_amount: Number(res.amount) || 0,
        winner: res.winner.trim() || null,
        status: res.close ? 'Completed' : 'In Progress',
      })
      toast(res.close ? 'Auction completed.' : 'Bid recorded.')
      load()
    } catch (ex) {
      toast(ex?.detail || 'Could not record the auction result.', 'error')
    }
  }
  async function remove(a) { setMenu(null); if (await confirmDialog({ title: `Delete auction "${a.item}"?`, message: 'It will be marked Void and excluded from totals.', tone: 'danger', confirmLabel: 'Delete' })) { await AuctionAPI.remove(a.id); toast('Auction voided.'); load() } }
  const setM = (patch) => setDrawer((d) => ({ ...d, ...patch }))

  // item dropdown → sets item name + prefills base amount from master base_price
  const onItemSelect = (val) => {
    if (val === '__other__') { setM({ itemChoice: '__other__', item: '' }); return }
    const it = items.find((x) => String(x.id) === String(val))
    if (it) setM({ itemChoice: val, item: it.name, base_amount: it.base_price ?? '' })
    else setM({ itemChoice: '', item: '' })
  }

  const EXPORT_COLS = [{ key: 'code', label: 'Auction ID' }, { key: 'item', label: 'Item' }, { key: 'auction_date', label: 'Date' },
    { key: 'base_amount', label: 'Base (₹)', type: 'money' }, { key: 'current_amount', label: 'Highest Bid (₹)', type: 'money' },
    { key: 'bids', label: 'Bids' }, { key: 'winner', label: 'Winner' }, { key: 'status', label: 'Status' }]
  const exportRows = rows
  const exportTotal = { code: 'Total', current_amount: rows.reduce((s, a) => s + Number(a.current_amount || 0), 0) }
  return (
    <div>
      <PageTitle title={tr("Auction Management")} subtitle="Record temple auctions and their winning devotees."
        actions={<span className="inline-flex items-center gap-2"><ExportButtons title={tr("Auction Register")} columns={EXPORT_COLS} rows={exportRows} total={exportTotal} />{canWrite ? <button onClick={() => { setDrawer(emptyForm()); setDq('') }} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Create New Auction</T></button> : <span className="px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-blue-50 text-blue-700"><T>View only</T></span>}</span>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={Gavel} color="#d97706" bg="bg-amber-50" title={tr("Total Auctions")} value={stats ? num(stats.total) : '—'} sub="All Time" />
        <StatTile icon={CalendarClock} color="#ea580c" bg="bg-orange-50" title={tr("Scheduled Auctions")} value={stats ? num(stats.scheduled) : '—'} sub="Yet to Start" />
        <StatTile icon={Users} color="#7c3aed" bg="bg-violet-50" title={tr("Auctions in Progress")} value={stats ? num(stats.in_progress) : '—'} sub="Active Now" />
        <StatTile icon={CheckCircle2} color="#059669" bg="bg-emerald-50" title={tr("Completed Auctions")} value={stats ? num(stats.completed) : '—'} sub="Completed Successfully" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search by Auction ID / Item Name</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search auction ID or item name…")} className="input !pl-9" /></div>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Date Range</T></label>
            <div className="flex items-center gap-1.5">
              <DateField value={start} onChange={(e) => setStart(e.target.value)} className="input !px-2.5 text-[0.78125rem]" />
              <span className="text-gray-400">–</span>
              <DateField value={end} onChange={(e) => setEnd(e.target.value)} className="input !px-2.5 text-[0.78125rem]" />
            </div>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input"><option value="">All</option><option>Scheduled</option><option>In Progress</option><option>Completed</option></Select>
          </div>
          <div className="md:col-span-3 flex gap-2 justify-end">
            <button onClick={() => { setQ(''); setStatus(''); setStart(''); setEnd('') }} className="btn-outline !py-2.5"><RotateCcw size={14} />{' '}<T>Reset</T></button>
            <button onClick={() => load()} className="btn-maroon !py-2.5"><Search size={14} />{' '}<T>Search</T></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
              {['Auction ID', 'Item Name', 'Auction Date', 'No. of Bidders', 'Highest Bid (₹)', 'Highest Bidder', 'Status', 'Actions'].map((c) => <th key={c} className="px-4 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[0.75rem] text-gray-500">{a.code}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{a.item}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="text-gray-700 text-[0.8125rem]">{fmtDate(a.auction_date)}</div><div className="text-[0.6875rem] text-gray-400">{a.start_time || ''}</div></td>
                  <td className="px-4 py-3 text-gray-700">{a.bids}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{Number(a.current_amount) > 0 ? inr(a.current_amount) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-gray-600">{a.winner || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3"><Pill tone={STATUS_TONE[a.status] || 'gray'}>{a.status}</Pill></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 relative">
                      <button onClick={() => setView(a)} title={tr("View details")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                      {canWrite && a.status !== 'Completed' && a.status !== 'Void' && (
                        <button onClick={() => recordResult(a)} title={tr("Record bid / winner / close")} className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-violet-200 text-violet-700 text-[0.78125rem] font-semibold hover:bg-violet-50"><T>Record Result</T></button>
                      )}
                      <button onClick={() => setMenu(menu === a.id ? null : a.id)} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-maroon-700 hover:border-maroon-300"><MoreVertical size={15} /></button>
                      {menu === a.id && (
                        <div className="absolute right-0 top-9 z-20 bg-white border border-gray-100 rounded-lg shadow-lg py-1 w-36 text-sm">
                          <button onClick={() => { setView(a); setMenu(null) }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-600"><Eye size={14} />{' '}<T>View</T></button>
                          {isAdmin && <button onClick={() => remove(a)} className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600"><Trash2 size={14} />{' '}<T>Delete</T></button>}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <TableStates colSpan={8} loading={loading} error={loadErr} onRetry={load} empty="No auctions found." />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit="auctions" />
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 text-[0.8125rem] text-gray-600 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-3">
        <Info size={16} className="text-blue-500 shrink-0 mt-0.5" /> Record each auction with its item, base amount and the winning devotee. Live bid tracking and auction payment receipts are planned; for now, collect payment at the counter.
      </div>

      {/* ── Create New Auction drawer ── */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Create New Auction</T></h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Create a new auction for items, materials or rights.</T></p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-5 flex-1">
              <div className="flex items-center gap-2 text-maroon-700 font-semibold text-[0.875rem]"><T>1. Auction Details</T></div>
              <div><label className="label"><T>Auction Item *</T></label>
                <Select required={drawer.itemChoice !== '__other__'} className="input" value={drawer.itemChoice} onChange={(e) => onItemSelect(e.target.value)}>
                  <option value="">Select an item…</option>
                  {items.map((it) => <option key={it.id} value={it.id}>{it.name}{it.category ? ` · ${it.category}` : ''}</option>)}
                  <option value="__other__">Other (enter manually)</option>
                </Select>
                {drawer.itemChoice === '__other__' && (
                  <input required className="input mt-2" placeholder={tr("Enter auction item name")} value={drawer.item} onChange={(e) => setM({ item: e.target.value })} />
                )}
              </div>
              <div><label className="label">Base Amount (₹) *</label>
                <NumberField required min="0" step="1" prefix="₹" placeholder="0" value={drawer.base_amount} onChange={(e) => setM({ base_amount: e.target.value })} />
              </div>
              <div><label className="label">Devotee (Optional)</label>
                {!drawer.devotee ? (
                  <div className="relative">
                    <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input className="input pr-9" placeholder={tr("Search name or mobile number…")} value={dq} onChange={(e) => setDq(e.target.value)} />
                    {results.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-gray-100 rounded-lg shadow-lg py-1">
                        {results.map((d) => (
                          <button type="button" key={d.id} onClick={() => { setM({ devotee: d, winner: d.name }); setResults([]); setDq('') }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-amber-50 text-amber-700 grid place-items-center text-[0.75rem] font-bold">{d.name[0]}</span>
                            <span><span className="font-semibold text-gray-800 text-[0.8125rem]">{d.name}</span><span className="block text-[0.6875rem] text-gray-400">{d.code} · {d.mobile}</span></span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-3.5 py-3 bg-gray-50/50">
                    <div className="w-10 h-10 rounded-full bg-maroon-700 text-cream grid place-items-center"><User size={18} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className="font-semibold text-gray-800">{drawer.devotee.name}</span><Pill tone="green"><T>Registered</T></Pill></div>
                      <div className="text-[0.75rem] text-gray-500">Mobile: {drawer.devotee.mobile}</div>
                    </div>
                    <button type="button" onClick={() => { setM({ devotee: null }); setDq('') }} className="text-gray-400 hover:text-red-600"><X size={17} /></button>
                  </div>
                )}
              </div>
              <div><label className="label">Winner / Highest Bidder (Optional)</label><input className="input" placeholder={tr("Enter winner name")} value={drawer.winner} onChange={(e) => setM({ winner: e.target.value })} /></div>
              <div><label className="label">Description (Optional)</label>
                <textarea className="input min-h-[5.625rem]" maxLength={250} placeholder={tr("Enter description…")} value={drawer.description} onChange={(e) => setM({ description: e.target.value })} />
                <div className="text-right text-[0.6875rem] text-gray-400 mt-0.5">{drawer.description.length} / 250</div></div>
              <div><label className="label"><T>Auction Date *</T></label>
                <DateField required value={drawer.auction_date} onChange={(e) => setM({ auction_date: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label"><T>Start Time *</T></label>
                  <TimeField required value={drawer.start_time} onChange={(e) => setM({ start_time: e.target.value })} /></div>
                <div><label className="label">Notes (Optional)</label>
                  <textarea className="input min-h-[2.75rem]" maxLength={250} placeholder={tr("Enter notes…")} value={drawer.notes} onChange={(e) => setM({ notes: e.target.value })} />
                  <div className="text-right text-[0.6875rem] text-gray-400 mt-0.5">{drawer.notes.length} / 250</div></div>
              </div>
              <div className="bg-amber-50/60 border border-amber-100 rounded-lg px-4 py-3.5">
                <div className="flex items-center gap-2 text-[0.8125rem] font-semibold text-amber-700 mb-2"><Info size={15} />{' '}<T>Note</T></div>
                <p className="text-[0.78125rem] text-gray-600"><T>This records the auction and its winning devotee. Live bid-by-bid tracking and on-system payment receipts are not yet available — settle the winning payment at the counter and record it there.</T></p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button className="btn-maroon flex-1 justify-center"><T>Create Auction</T></button>
            </div>
          </form>
        </div>
      )}

      {/* ── View drawer (read-only) ── */}
      {view && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setView(null)} />
          <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Auction Details</T></h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5 font-mono">{view.code}</p></div>
              <button onClick={() => setView(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <VField label="Item Name" value={view.item} wide />
                <VField label="Description" value={view.description || '—'} wide />
                <VField label="Auction Date" value={fmtDate(view.auction_date)} />
                <VField label="Start Time" value={view.start_time || '—'} />
                <VField label="No. of Bidders" value={view.bids} />
                <VField label="Status" value={<Pill tone={STATUS_TONE[view.status] || 'gray'}>{view.status}</Pill>} />
                <VField label="Highest Bid" value={Number(view.current_amount) > 0 ? inr(view.current_amount) : '—'} />
                <VField label="Highest Bidder" value={view.winner || '—'} />
                <VField label="Notes" value={view.notes || '—'} wide />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={() => setView(null)} className="btn-maroon w-full justify-center"><T>Close</T></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function VField({ label, value, wide }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[0.6875rem] text-gray-400 mb-0.5">{label}</div>
      <div className="text-[0.8125rem] text-gray-800 font-medium break-words">{value ?? '—'}</div>
    </div>
  )
}
