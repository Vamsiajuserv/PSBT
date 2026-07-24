import React, { useEffect, useState, useMemo } from 'react'
import { Plus, Pencil, MoreVertical, X, Save, RotateCcw, Search, Info, HandHeart, Coins, Package, Users } from 'lucide-react'
import { PageTitle, Pill, num } from '../../components/admin/ui.jsx'
import { DonationCategoriesAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Select } from '../../components/common/Field.jsx'
import { confirmDialog, toast } from '../../components/common/Dialog.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const TYPE_TONE = { Cash: 'green', Material: 'blue', Sponsorship: 'violet' }
const CASH_UNITS = ['Amount']
const MATERIAL_UNITS = ['Grams', 'Bags / Kg', 'Kg', 'Liters', 'Packet', 'Nos', 'Units']
const emptyCat = () => ({ type: 'Cash', name: '', description: '', unit: 'Amount', quantity_required: false, active: true })

function StatTile({ icon: Icon, color, bg, title, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-full grid place-items-center shrink-0 ${bg}`} style={{ color }}><Icon size={20} /></div>
        <div><div className="text-[0.6875rem] uppercase tracking-wide text-gray-400 font-semibold">{title}</div>
          <div className="text-2xl font-extrabold text-gray-800 leading-none mt-0.5">{value}</div></div>
      </div>
      <div className="text-[0.75rem] text-gray-400 mt-3">{sub}</div>
    </div>
  )
}

export default function DonationMaster() {
  const { user } = useAuth()
  const canWrite = user?.role !== 'Accountant'
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [q, setQ] = useState(''); const [type, setType] = useState(''); const [status, setStatus] = useState('')
  const [drawer, setDrawer] = useState(null)

  const load = () => Promise.all([DonationCategoriesAPI.list(), DonationCategoriesAPI.stats().catch(() => null)])
    .then(([d, s]) => { setItems(d.items); if (s) setStats(s) })
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => items.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase()) && !c.code.toLowerCase().includes(q.toLowerCase())) return false
    if (type && c.type !== type) return false
    if (status === 'Active' && !c.active) return false
    if (status === 'Inactive' && c.active) return false
    return true
  }), [items, q, type, status])

  function setType2(t) {
    setDrawer((d) => ({ ...d, data: { ...d.data, type: t, unit: t === 'Cash' ? 'Amount' : t === 'Material' ? 'Grams' : null, quantity_required: t === 'Material' } }))
  }
  async function save(e) {
    e.preventDefault()
    const d = drawer.data
    if (drawer.mode === 'create') await DonationCategoriesAPI.create(d)
    else await DonationCategoriesAPI.update(d.id, d)
    setDrawer(null); load()
  }
  async function remove(c) { if (await confirmDialog({ title: `Delete category "${c.name}"?`, message: 'This cannot be undone.', tone: 'danger', confirmLabel: 'Delete' })) { await DonationCategoriesAPI.remove(c.id); toast('Category deleted.'); load() } }

  const dtype = drawer?.data.type

  return (
    <div>
      <PageTitle title={tr("Donation Master")} subtitle="Maintain and configure donation categories used for cash donations, material donations and sponsorships."
        actions={canWrite && <button onClick={() => setDrawer({ mode: 'create', data: emptyCat() })} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Add New Category</T></button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={HandHeart} color="#059669" bg="bg-emerald-50" title={tr("Total Categories")} value={stats ? num(stats.total) : '—'} sub="Active Donation Categories" />
        <StatTile icon={Coins} color="#d97706" bg="bg-amber-50" title={tr("Cash Categories")} value={stats ? num(stats.cash) : '—'} sub="Cash Donation Categories" />
        <StatTile icon={Package} color="#2563eb" bg="bg-blue-50" title={tr("Material Categories")} value={stats ? num(stats.material) : '—'} sub="Material Donation Categories" />
        <StatTile icon={Users} color="#7c3aed" bg="bg-violet-50" title={tr("Sponsorship Categories")} value={stats ? num(stats.sponsorship) : '—'} sub="Sponsorship Categories" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1 max-w-xs relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search by Category Name…")} className="input !pl-9" /></div>
          <div><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Type</T></label><Select value={type} onChange={(e) => setType(e.target.value)} className="input !w-40"><option value="">All</option><option>Cash</option><option>Material</option><option>Sponsorship</option></Select></div>
          <div><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label><Select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-40"><option value="">All</option><option>Active</option><option>Inactive</option></Select></div>
          <div className="flex gap-2 lg:ml-auto"><button onClick={() => { setQ(''); setType(''); setStatus('') }} className="btn-outline !py-2.5"><RotateCcw size={14} />{' '}<T>Reset</T></button><button className="btn-maroon !py-2.5"><Search size={14} />{' '}<T>Search</T></button></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
              {['Category ID', 'Category Name', 'Type', 'Unit / Measurement', 'Quantity Required', 'Status', 'Actions'].map((c) => <th key={c} className="px-5 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3.5 font-mono text-[0.75rem] text-gray-500">{c.code}</td>
                  <td className="px-5 py-3.5 font-semibold text-gray-800">{c.name}</td>
                  <td className="px-5 py-3.5"><Pill tone={TYPE_TONE[c.type]}>{c.type}</Pill></td>
                  <td className="px-5 py-3.5 text-gray-600">{c.unit || '-'}</td>
                  <td className="px-5 py-3.5"><Pill tone={c.quantity_required ? 'green' : 'red'}>{c.quantity_required ? 'Yes' : 'No'}</Pill></td>
                  <td className="px-5 py-3.5"><Pill tone={c.active ? 'green' : 'gray'}>{c.active ? 'Active' : 'Inactive'}</Pill></td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {canWrite && <button onClick={() => setDrawer({ mode: 'edit', data: { ...c } })} title={tr("Edit")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-maroon-600 hover:bg-maroon-50"><Pencil size={15} /></button>}
                      {isAdmin && <button onClick={() => remove(c)} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300"><MoreVertical size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400"><T>No categories found.</T></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[0.8125rem] text-gray-500">Showing 1 to {filtered.length} of {filtered.length} categories</span>
          <div className="flex items-center gap-1.5"><button disabled className="px-3 h-8 rounded-lg border border-gray-200 text-[0.8125rem] text-gray-400 opacity-40"><T>Previous</T></button><span className="w-8 h-8 grid place-items-center rounded-lg bg-maroon-700 text-cream text-[0.8125rem] font-semibold">1</span><button disabled className="px-3 h-8 rounded-lg border border-gray-200 text-[0.8125rem] text-gray-400 opacity-40"><T>Next</T></button></div>
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800">{drawer.mode === 'create' ? 'Add New Category' : 'Edit Category'}</h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Create a new donation category.</T></p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-5 flex-1">
              <div><label className="label"><T>Category Type *</T></label>
                <div className="flex gap-5 mt-1">{['Cash', 'Material', 'Sponsorship'].map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm text-gray-700"><input type="radio" name="ctype" className="accent-maroon-700" checked={dtype === t} onChange={() => setType2(t)} /> {t === 'Cash' ? 'Cash Donation' : t === 'Material' ? 'Material Donation' : 'Sponsorship'}</label>
                ))}</div></div>
              <div><label className="label"><T>Category Name *</T></label><input required className="input" placeholder={tr("Enter category name")} value={drawer.data.name} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, name: e.target.value } })} /></div>
              <div><label className="label">Description (Optional)</label><textarea className="input min-h-[4.5rem]" maxLength={250} placeholder={tr("Enter description…")} value={drawer.data.description || ''} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, description: e.target.value } })} /></div>
              <div className="bg-blue-50/70 border border-blue-100 rounded-lg px-3 py-2.5 text-[0.75rem] text-gray-600 flex items-start gap-2"><Info size={15} className="text-blue-500 shrink-0 mt-0.5" />{' '}<T>Fields below will change based on the category type selected.</T></div>
              {dtype !== 'Material' && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-lg px-3 py-3">
                  <div className="text-amber-700 font-semibold text-sm">{dtype} Selected</div>
                  <div className="text-[0.75rem] text-gray-600 mt-1"><T>Cash and Sponsorship categories do not require unit and quantity. They are recorded by amount only.</T></div>
                </div>
              )}
              <div><label className="label"><T>Unit / Measurement</T></label>
                {dtype === 'Material'
                  ? <Select className="input" value={drawer.data.unit || ''} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, unit: e.target.value } })}><option value="">Select…</option>{MATERIAL_UNITS.map((u) => <option key={u}>{u}</option>)}</Select>
                  : <input disabled className="input bg-gray-50" value={dtype === 'Cash' ? 'Not applicable for Cash Donation' : 'Not applicable for Sponsorship'} />}
              </div>
              <div><label className="label"><T>Quantity Required</T></label>
                <div className="flex gap-5 mt-1">{['Yes', 'No'].map((y) => (
                  <label key={y} className="flex items-center gap-2 text-sm text-gray-700"><input type="radio" name="qreq" disabled={dtype !== 'Material'} className="accent-maroon-700" checked={drawer.data.quantity_required === (y === 'Yes')} onChange={() => setDrawer({ ...drawer, data: { ...drawer.data, quantity_required: y === 'Yes' } })} /> {y}</label>
                ))}</div>
                {dtype !== 'Material' && <div className="text-[0.6875rem] text-gray-400 mt-1">Quantity is not required for {dtype.toLowerCase()} donation categories.</div>}
              </div>
              <div><label className="label"><T>Status *</T></label><Select className="input" value={drawer.data.active ? 'Active' : 'Inactive'} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, active: e.target.value === 'Active' } })}><option>Active</option><option>Inactive</option></Select></div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button className="btn-maroon flex-1 justify-center"><Save size={15} />{' '}<T>Save Category</T></button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
