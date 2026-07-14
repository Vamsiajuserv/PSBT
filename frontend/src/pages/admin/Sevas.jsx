import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { Plus, Pencil, Trash2, X, Save, Search, Boxes, CheckCircle2, XCircle, LayoutGrid } from 'lucide-react'
import { PageTitle, StatTile, Pill, num } from '../../components/admin/ui.jsx'
import { SevasAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useSite } from '../../lib/SiteContext.jsx'

const DURATION = { Daily: '20–30 mins', Monthly: '30 mins', 'Long-term': '—', Ceremony: '45 mins', Festival: '60 mins', Donation: '—', Vahana: '30 mins' }

const EMPTY = { name: '', name_te: '', amount: '', category: '', slot: '', description: '', active: true }

export default function Sevas() {
  const { user } = useAuth()
  const canWrite = user?.role !== 'Accountant'
  const SEVA_CATEGORIES = useSite()?.seva_categories || []

  const [all, setAll] = useState([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [modal, setModal] = useState(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const list = await SevasAPI.list()
      setAll(Array.isArray(list) ? list : (list.items || []))
      setErr('')
    } catch (ex) {
      setErr(ex.detail || ex.message || 'Failed to load services.')
    }
  }, [])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  const rows = useMemo(
    () => all.filter((s) => (cat === 'all' || s.category === cat) && (s.name || '').toLowerCase().includes(q.toLowerCase())),
    [all, cat, q],
  )

  // KPI counts computed client-side from the full fetched list
  const total = all.length
  const activeCount = all.filter((s) => s.active).length
  const inactiveCount = all.filter((s) => !s.active).length
  const categories = useMemo(() => {
    const set = new Set([...SEVA_CATEGORIES, ...all.map((s) => s.category).filter(Boolean)])
    return [...set]
  }, [all, SEVA_CATEGORIES])

  async function save(e) {
    e.preventDefault(); setErr('')
    const d = modal.data
    const body = {
      name: d.name,
      name_te: d.name_te || null,
      amount: Number(d.amount || 0),
      slot: d.slot || null,
      category: d.category || null,
      description: d.description || null,
      active: !!d.active,
    }
    try {
      if (modal.mode === 'create') await SevasAPI.create(body)
      else await SevasAPI.update(modal.data.id, body)
      setModal(null); load()
    } catch (ex) {
      setErr(ex.detail || ex.message || 'Failed to save service.')
    }
  }

  async function remove(s) {
    if (!confirm(`Delete service "${s.name}"?`)) return
    try { await SevasAPI.remove(s.id); load() }
    catch (ex) { setErr(ex.detail || ex.message || 'Failed to delete service.') }
  }

  const setD = (patch) => setModal((m) => ({ ...m, data: { ...m.data, ...patch } }))

  return (
    <div>
      <PageTitle title="All Services" subtitle="Manage all temple poojas, sevas and special services."
        actions={canWrite && <button onClick={() => { setErr(''); setModal({ mode: 'create', data: { ...EMPTY } }) }} className="btn-maroon !py-2.5"><Plus size={16} /> Add New Service</button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={Boxes} color="#8a1c1c" bg="bg-maroon-50" title="Total Services" value={num(total)} sub="All temple services" />
        <StatTile icon={CheckCircle2} color="#059669" bg="bg-emerald-50" title="Active Services" value={num(activeCount)} sub="Currently offered" />
        <StatTile icon={XCircle} color="#ea580c" bg="bg-orange-50" title="Inactive Services" value={num(inactiveCount)} sub="Not currently offered" />
        <StatTile icon={LayoutGrid} color="#7c3aed" bg="bg-violet-50" title="Categories" value={num(categories.length)} sub="Service categories" />
      </div>

      {err && <div className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search service name…" className="input !pl-9" />
          </div>
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="input !w-auto !py-2">
            <option value="all">All Categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[11px] uppercase tracking-wide text-gray-500">
              {['Service Name', 'Category', 'Duration', 'Amount (₹)', 'Status', 'Description', 'Action'].map((c) => <th key={c} className="px-4 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3.5"><span className="font-semibold text-gray-800">{s.name}</span>{s.name_te && <span className="block text-[11px] text-gray-400 font-telugu">{s.name_te}</span>}</td>
                  <td className="px-4 py-3.5 text-gray-600 text-xs">{s.category || '—'}</td>
                  <td className="px-4 py-3.5 text-gray-500 text-xs">{DURATION[s.category] || '—'}</td>
                  <td className="px-4 py-3.5 font-bold text-maroon-700">{Number(s.amount || 0).toLocaleString('en-IN')}.00</td>
                  <td className="px-4 py-3.5"><Pill tone={s.active ? 'green' : 'red'}>{s.active ? 'Active' : 'Inactive'}</Pill></td>
                  <td className="px-4 py-3.5 text-gray-500 text-xs max-w-[220px] truncate">{s.description || '—'}</td>
                  <td className="px-4 py-3.5">
                    {canWrite ? (
                      <div className="flex gap-2">
                        <button onClick={() => { setErr(''); setModal({ mode: 'edit', data: { ...EMPTY, ...s } }) }} title="Edit" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-maroon-600 hover:bg-maroon-50"><Pencil size={15} /></button>
                        <button onClick={() => remove(s)} title="Delete (admin only)" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300"><Trash2 size={15} /></button>
                      </div>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No services found.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 text-[13px] text-gray-500">Showing {rows.length} of {total} services</div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setModal(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <h3 className="font-serif text-xl font-bold text-maroon-800">{modal.mode === 'create' ? 'Add New Service' : 'Edit Service'}</h3>
              <button type="button" onClick={() => setModal(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4 flex-1">
              <div><label className="label">Service Name *</label>
                <input required className="input" value={modal.data.name} onChange={(e) => setD({ name: e.target.value })} /></div>
              <div><label className="label">Telugu Name</label>
                <input className="input font-telugu" value={modal.data.name_te} onChange={(e) => setD({ name_te: e.target.value })} /></div>
              <div><label className="label">Amount (₹) *</label>
                <input required type="number" min="0" step="1" className="input" value={modal.data.amount} onChange={(e) => setD({ amount: e.target.value })} /></div>
              <div><label className="label">Category</label>
                <select className="input" value={modal.data.category} onChange={(e) => setD({ category: e.target.value })}>
                  <option value="">Select…</option>{categories.map((c) => <option key={c}>{c}</option>)}
                </select></div>
              <div><label className="label">Slot / Timing</label>
                <input className="input" placeholder="e.g. Morning, All day, Monthly" value={modal.data.slot} onChange={(e) => setD({ slot: e.target.value })} /></div>
              <div><label className="label">Description</label>
                <textarea className="input min-h-[72px]" value={modal.data.description} onChange={(e) => setD({ description: e.target.value })} /></div>
              <div><label className="label">Status</label>
                <select className="input" value={modal.data.active ? 'Active' : 'Inactive'} onChange={(e) => setD({ active: e.target.value === 'Active' })}><option>Active</option><option>Inactive</option></select></div>
              {err && <div className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setModal(null)} className="btn-outline flex-1 justify-center">Cancel</button>
              <button className="btn-maroon flex-1 justify-center"><Save size={15} /> {modal.mode === 'create' ? 'Create Service' : 'Save Changes'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
