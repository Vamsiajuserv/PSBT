import React, { useState } from 'react'
import { Plus, Pencil, Trash2, Search, Boxes, CheckCircle2, XCircle, LayoutGrid } from 'lucide-react'
import { Table, Badge, Flourish } from '../../components/common/UI.jsx'
import { SEVAS, SEVA_CATEGORIES } from '../../data/mock.js'

const INACTIVE = new Set(['SV23']) // demo: one inactive service
const DURATION = { Daily: '20–30 mins', Monthly: '30 mins', 'Long-term': '—', Ceremony: '45 mins', Festival: '60 mins', Donation: '—', Vahana: '30 mins' }

function Stat({ icon: Icon, label, value, color, bg }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-full ${bg} grid place-items-center`} style={{ color }}><Icon size={20} /></div>
      <div>
        <div className="text-[11px] text-gray-500">{label}</div>
        <div className="text-xl font-extrabold text-maroon-700">{value}</div>
      </div>
    </div>
  )
}

export default function Sevas() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')

  const rows = SEVAS.filter(
    (s) => (cat === 'all' || s.category === cat) && s.name.toLowerCase().includes(q.toLowerCase())
  )
  const active = SEVAS.length - INACTIVE.size

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-maroon-700">All Services</h1>
          <p className="text-sm text-gray-500 mt-1">Manage all temple poojas, sevas and special services.</p>
        </div>
        <button className="btn-maroon !py-2 text-sm"><Plus size={15} /> Add New Service</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Stat icon={Boxes} label="Total Services" value={SEVAS.length} color="#8a1c1c" bg="bg-maroon-50" />
        <Stat icon={CheckCircle2} label="Active Services" value={active} color="#059669" bg="bg-emerald-50" />
        <Stat icon={XCircle} label="Inactive Services" value={INACTIVE.size} color="#ea580c" bg="bg-orange-50" />
        <Stat icon={LayoutGrid} label="Categories" value={SEVA_CATEGORIES.length} color="#7c3aed" bg="bg-violet-50" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search service name…" className="input !pl-9" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="input !w-auto !py-2">
          <option value="all">All Categories</option>
          {SEVA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <Table columns={['Service Name', 'Category', 'Duration', 'Amount (₹)', 'Status', 'Description', 'Action']}>
        {rows.map((s) => {
          const inactive = INACTIVE.has(s.id)
          return (
            <tr key={s.id} className="hover:bg-gold-50/50">
              <td className="px-4 py-3"><span className="font-semibold text-gray-800">{s.name}</span><span className="block text-[11px] text-gray-400 font-telugu">{s.nameTe}</span></td>
              <td className="px-4 py-3 text-gray-600 text-xs">{s.category}</td>
              <td className="px-4 py-3 text-gray-500 text-xs">{DURATION[s.category]}</td>
              <td className="px-4 py-3 font-bold text-maroon-700">{s.amount.toLocaleString('en-IN')}.00</td>
              <td className="px-4 py-3"><Badge tone={inactive ? 'red' : 'green'}>{inactive ? 'Inactive' : 'Active'}</Badge></td>
              <td className="px-4 py-3 text-gray-500 text-xs max-w-[220px] truncate">{s.desc}</td>
              <td className="px-4 py-3">
                <div className="flex gap-2 text-gray-400">
                  <button className="hover:text-maroon-600" title="Edit"><Pencil size={15} /></button>
                  <button className="hover:text-red-500" title="Delete (admin only)"><Trash2 size={15} /></button>
                </div>
              </td>
            </tr>
          )
        })}
      </Table>
      <p className="text-xs text-gray-400 mt-3">Showing {rows.length} of {SEVAS.length} services</p>
    </div>
  )
}
