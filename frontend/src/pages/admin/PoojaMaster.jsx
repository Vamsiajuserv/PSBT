import React, { useEffect, useState, useMemo } from 'react'
import {
  Plus, Pencil, Trash2, X, RotateCcw, Info, Save, Trash,
  Flame, Layers, CalendarCheck, Clock, LayoutGrid,
} from 'lucide-react'
import { PageTitle, SearchInput, Pill, num } from '../../components/admin/ui.jsx'
import { PoojasAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'

const CAT_OPTIONS = [
  { value: 'Daily', label: 'Daily Pooja' }, { value: 'Monthly', label: 'Monthly Pooja' },
  { value: 'Long-Term', label: 'Long-Term Pooja' }, { value: 'Occasion', label: 'Special Pooja' },
  { value: 'Vehicle', label: 'Vehicle Pooja' },
]
const CAT_LABEL = Object.fromEntries(CAT_OPTIONS.map((c) => [c.value, c.label]))
const VALIDITY_TYPES = ['Days', 'Months', 'One-Time', 'Life Long', 'Years']
const UNITS = ['Days', 'Months', 'Years']

// ── derivations (match the reference) ────────────────────────────────────────
function catsOf(p) {
  const cats = [CAT_LABEL[p.category] || p.category]
  if (p.category === 'Daily' && p.plans.some((pl) => pl.plan_name === 'Monthly')) cats.push('Monthly Pooja')
  return cats
}
function validityDisplay(p) {
  const types = [...new Set(p.plans.map((pl) => pl.validity_type).filter(Boolean))]
  const label = types.join(', ')
  return p.plans.length > 1 ? `${label} (Plan Based)` : label
}
function rateLines(p) {
  if (p.plans.length === 0) return ['—']
  if (p.plans.every((pl) => pl.committee_decided)) return ['Committee Decided']
  if (p.plans.length === 1) return [p.plans[0].committee_decided ? 'Committee Decided' : `₹${num(p.plans[0].fee)}`]
  return p.plans.map((pl) => `${pl.plan_name} ${pl.committee_decided ? '—' : '₹' + num(pl.fee)}`)
}
const emptyPlan = () => ({ plan_name: '', frequency: '', rate_type: 'Fixed', fee: '', validity_type: '', validity_value: '', validity_unit: '', active: true })

function StatTile({ icon: Icon, color, bg, title, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-full grid place-items-center shrink-0 ${bg}`} style={{ color }}><Icon size={20} /></div>
        <div><div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">{title}</div>
          <div className="text-2xl font-extrabold text-gray-800 leading-none mt-0.5">{value}</div></div>
      </div>
      <div className="text-[12px] text-gray-400 mt-3">{sub}</div>
    </div>
  )
}

export default function PoojaMaster() {
  const { user } = useAuth()
  const canWrite = user?.role !== 'Accountant'
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [drawer, setDrawer] = useState(null)
  const SIZE = 15

  const load = () => Promise.all([PoojasAPI.admin(), PoojasAPI.stats().catch(() => null)])
    .then(([d, s]) => { setItems(d.items); if (s) setStats(s) })
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => items.filter((p) => {
    if (q && !(p.name.toLowerCase().includes(q.toLowerCase()) || (p.code || '').toLowerCase().includes(q.toLowerCase()))) return false
    if (cat && !catsOf(p).includes(cat)) return false
    if (status === 'Active' && !p.active) return false
    if (status === 'Inactive' && p.active) return false
    return true
  }), [items, q, cat, status])
  const pageCount = Math.max(1, Math.ceil(filtered.length / SIZE))
  const rows = filtered.slice((page - 1) * SIZE, page * SIZE)

  function openCreate() { setDrawer({ mode: 'create', data: { name: '', code: '', category: 'Daily', description: '', active: true, plans: [emptyPlan()] } }) }
  function openEdit(p) {
    setDrawer({ mode: 'edit', data: {
      id: p.id, name: p.name, code: p.code, category: p.category, description: p.description || '', active: p.active,
      plans: p.plans.map((pl) => ({ plan_name: pl.plan_name, frequency: pl.frequency || '', rate_type: pl.committee_decided ? 'Committee' : 'Fixed', fee: pl.fee ?? '', validity_type: pl.validity_type || '', validity_value: pl.validity_value ?? '', validity_unit: pl.validity_unit || '', active: pl.active }))
    } })
  }
  async function remove(p) { if (confirm(`Delete pooja "${p.name}"?`)) { await PoojasAPI.remove(p.id); load() } }

  async function save(e) {
    e.preventDefault()
    const d = drawer.data
    const payload = {
      name: d.name, code: d.code || undefined, category: d.category, description: d.description, active: d.active,
      plans: d.plans.map((pl) => ({
        plan_name: pl.plan_name, frequency: pl.frequency,
        committee_decided: pl.rate_type === 'Committee',
        fee: pl.rate_type === 'Committee' ? null : (pl.fee === '' ? null : Number(pl.fee)),
        validity_type: pl.validity_type || null,
        validity_value: pl.validity_value === '' ? null : Number(pl.validity_value),
        validity_unit: pl.validity_unit || null, active: pl.active,
      })),
    }
    if (drawer.mode === 'create') await PoojasAPI.create(payload)
    else await PoojasAPI.update(d.id, payload)
    setDrawer(null); load()
  }
  const setPlan = (i, patch) => setDrawer((dr) => ({ ...dr, data: { ...dr.data, plans: dr.data.plans.map((pl, j) => j === i ? { ...pl, ...patch } : pl) } }))

  return (
    <div>
      <PageTitle title="Pooja Master" subtitle="Configure and manage temple poojas, available plans, rates, and validity"
        actions={canWrite && <button onClick={openCreate} className="btn-maroon !py-2.5"><Plus size={16} /> Add New Pooja</button>} />

      <div className="bg-amber-50/60 border border-amber-100 rounded-lg px-4 py-2.5 mb-5 text-[13px] text-gray-600 flex items-center gap-2">
        <Info size={16} className="text-amber-500 shrink-0" /> Category classifies the pooja type. Plans define how the pooja can be booked (e.g., Daily, Monthly, One-Time, Life Long).
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <StatTile icon={Flame} color="#ea580c" bg="bg-orange-50" title="Total Poojas" value={stats ? num(stats.total_poojas) : '—'} sub="Configured poojas" />
        <StatTile icon={Layers} color="#059669" bg="bg-emerald-50" title="Total Plans" value={stats ? num(stats.total_plans) : '—'} sub="Across all poojas" />
        <StatTile icon={CalendarCheck} color="#d97706" bg="bg-amber-50" title="Active Plans" value={stats ? num(stats.active_plans) : '—'} sub="Currently available" />
        <StatTile icon={Clock} color="#7c3aed" bg="bg-violet-50" title="Life Long Plans" value={stats ? num(stats.life_long_plans) : '—'} sub="Long-term poojas" />
        <StatTile icon={LayoutGrid} color="#2563eb" bg="bg-blue-50" title="Pooja Categories" value={stats ? num(stats.categories) : '—'} sub="Official categories" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 pt-5">
          <h3 className="font-serif text-lg font-bold text-maroon-800">Pooja Master List</h3>
          <p className="text-[13px] text-gray-500 mt-0.5">Manage poojas, rates, validity, and booking availability</p>
          <div className="flex flex-col lg:flex-row lg:items-end gap-3 mt-4 mb-4">
            <div className="flex-1 max-w-xs"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search by Pooja Name" /></div>
            <div><label className="block text-[12px] text-gray-500 mb-1.5">Category</label>
              <select value={cat} onChange={(e) => { setCat(e.target.value); setPage(1) }} className="input !w-48"><option value="">All Categories</option>{CAT_OPTIONS.map((c) => <option key={c.value} value={c.label}>{c.label}</option>)}</select></div>
            <div><label className="block text-[12px] text-gray-500 mb-1.5">Status</label>
              <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="input !w-40"><option value="">All Status</option><option>Active</option><option>Inactive</option></select></div>
            <button onClick={() => { setQ(''); setCat(''); setStatus(''); setPage(1) }} className="text-[13px] font-semibold text-maroon-600 flex items-center gap-1.5 lg:ml-auto pb-2.5"><RotateCcw size={14} /> Reset Filters</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[11px] uppercase tracking-wide text-gray-500">
              {['Pooja Name', 'Category', 'Available Plans', 'Rate', 'Validity Type', 'Status', 'Actions'].map((c) => <th key={c} className="px-5 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/60 align-top">
                  <td className="px-5 py-3.5"><div className="font-semibold text-gray-800">{p.name}</div><div className="text-[11px] font-mono text-gray-400">{p.code}</div></td>
                  <td className="px-5 py-3.5"><div className="flex flex-wrap gap-1">{catsOf(p).map((c) => <span key={c} className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-maroon-50 text-maroon-700">{c}</span>)}</div></td>
                  <td className="px-5 py-3.5"><div className="flex flex-wrap gap-1">
                    {p.plans.slice(0, 3).map((pl) => <span key={pl.id ?? pl.plan_name} className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700">{pl.plan_name}</span>)}
                    {p.plans.length > 3 && <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-500">+{p.plans.length - 3} More</span>}
                  </div></td>
                  <td className="px-5 py-3.5 text-[13px]">{rateLines(p).map((r, i) => <div key={i} className={r === 'Committee Decided' ? 'text-amber-600 text-[12px]' : 'text-gray-700'}>{r}</div>)}</td>
                  <td className="px-5 py-3.5 text-gray-500 text-[13px]">{validityDisplay(p)}</td>
                  <td className="px-5 py-3.5"><Pill tone={p.active ? 'green' : 'gray'}>{p.active ? 'Active' : 'Inactive'}</Pill></td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {canWrite && <button onClick={() => openEdit(p)} title="Edit" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-500 hover:text-maroon-700 hover:border-maroon-300"><Pencil size={15} /></button>}
                      {isAdmin && <button onClick={() => remove(p)} title="Delete" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300"><Trash2 size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">No poojas found.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[13px] text-gray-500">Showing {rows.length === 0 ? 0 : (page - 1) * SIZE + 1} to {Math.min(page * SIZE, filtered.length)} of {filtered.length} poojas</span>
          <div className="flex items-center gap-1.5">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 h-8 rounded-lg border border-gray-200 text-[13px] text-gray-500 disabled:opacity-40">Previous</button>
            <span className="w-8 h-8 grid place-items-center rounded-lg bg-maroon-700 text-cream text-[13px] font-semibold">{page}</span>
            <button disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="px-3 h-8 rounded-lg border border-gray-200 text-[13px] text-gray-500 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800">{drawer.mode === 'create' ? 'Add New Pooja' : 'Edit Pooja'}</h3>
                <p className="text-[13px] text-gray-500 mt-0.5">Configure pooja details and available booking plans</p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>

            <div className="px-6 py-5 space-y-5 flex-1">
              <div>
                <div className="text-[13px] font-bold text-maroon-700 mb-3">1. Basic Information</div>
                <div className="space-y-3">
                  <div><label className="label">Pooja Name *</label><input required className="input" placeholder="Enter pooja name" value={drawer.data.name} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, name: e.target.value } })} /></div>
                  <div><label className="label">Pooja Code</label><input className="input" placeholder="Auto-generated if blank" value={drawer.data.code} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, code: e.target.value } })} /></div>
                  <div><label className="label">Category *</label><select required className="input" value={drawer.data.category} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, category: e.target.value } })}>{CAT_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                  <div><label className="label">Description</label><textarea className="input min-h-[64px]" placeholder="Enter description (optional)" value={drawer.data.description} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, description: e.target.value } })} /></div>
                  <div><label className="label">Status</label>
                    <div className="flex gap-2">
                      {['Active', 'Inactive'].map((s) => { const on = drawer.data.active === (s === 'Active'); return (
                        <button type="button" key={s} onClick={() => setDrawer({ ...drawer, data: { ...drawer.data, active: s === 'Active' } })} className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${on ? 'bg-maroon-700 text-cream border-maroon-700' : 'border-gray-200 text-gray-500'}`}>{s}</button>) })}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[13px] font-bold text-maroon-700">2. Available Plans</div>
                <p className="text-[12px] text-gray-400 mb-3">Add one or more plans for this pooja</p>
                <div className="space-y-4">
                  {drawer.data.plans.map((pl, i) => (
                    <div key={i} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-semibold text-gray-700 text-sm">Plan {i + 1}</span>
                        {drawer.data.plans.length > 1 && <button type="button" onClick={() => setDrawer({ ...drawer, data: { ...drawer.data, plans: drawer.data.plans.filter((_, j) => j !== i) } })} className="text-gray-300 hover:text-red-600"><Trash size={15} /></button>}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="label">Plan Name *</label><input required className="input" placeholder="Daily / Monthly…" value={pl.plan_name} onChange={(e) => setPlan(i, { plan_name: e.target.value })} /></div>
                        <div><label className="label">Frequency / Type *</label><input className="input" placeholder="Per Day…" value={pl.frequency} onChange={(e) => setPlan(i, { frequency: e.target.value })} /></div>
                        <div><label className="label">Rate Type *</label><select className="input" value={pl.rate_type} onChange={(e) => setPlan(i, { rate_type: e.target.value })}><option value="Fixed">Fixed Rate</option><option value="Committee">Committee Decided</option></select></div>
                        <div><label className="label">Rate Amount (₹)</label><input type="number" className="input disabled:bg-gray-50" disabled={pl.rate_type === 'Committee'} placeholder={pl.rate_type === 'Committee' ? '—' : 'Amount'} value={pl.fee} onChange={(e) => setPlan(i, { fee: e.target.value })} /></div>
                        <div><label className="label">Validity Type *</label><select className="input" value={pl.validity_type} onChange={(e) => setPlan(i, { validity_type: e.target.value })}><option value="">Select</option>{VALIDITY_TYPES.map((v) => <option key={v}>{v}</option>)}</select></div>
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className="label">Value</label><input type="number" className="input" value={pl.validity_value} onChange={(e) => setPlan(i, { validity_value: e.target.value })} /></div>
                          <div><label className="label">Unit</label><select className="input !px-1" value={pl.validity_unit} onChange={(e) => setPlan(i, { validity_unit: e.target.value })}><option value="">—</option>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-[13px] text-gray-600 mt-3"><input type="checkbox" className="accent-emerald-600 w-4 h-4" checked={pl.active} onChange={(e) => setPlan(i, { active: e.target.checked })} /> Booking Availability</label>
                    </div>
                  ))}
                  <button type="button" onClick={() => setDrawer({ ...drawer, data: { ...drawer.data, plans: [...drawer.data.plans, emptyPlan()] } })} className="w-full border border-dashed border-maroon-300 text-maroon-600 rounded-xl py-2.5 text-[13px] font-semibold hover:bg-maroon-50 flex items-center justify-center gap-2"><Plus size={15} /> Add Another Plan</button>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center">Cancel</button>
              <button className="btn-maroon flex-1 justify-center"><Save size={15} /> Save Pooja</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
