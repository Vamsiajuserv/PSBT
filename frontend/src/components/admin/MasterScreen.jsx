import React, { useEffect, useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, X, Save, RotateCcw, Search } from 'lucide-react'
import { PageTitle, StatTile, Pill, num } from './ui.jsx'
import { TableStates, LOAD_ERROR } from '../common/states.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Select, DateField, Checkbox, NumberField } from '../common/Field.jsx'
import { confirmDialog, toast } from '../common/Dialog.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

// Generic list + drawer master screen.
// config: { title, subtitle, api, statCards, columns, fields, searchPlaceholder, addLabel, entity }
export default function MasterScreen({ config }) {
  const { title, subtitle, api, statCards = [], columns, fields, searchPlaceholder = 'Search…', addLabel = 'Add New', entity = 'record' } = config
  const { user } = useAuth()
  const canWrite = user?.role !== 'Accountant'
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)

  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [drawer, setDrawer] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')

  const load = () => {
    setLoading(true); setLoadErr('')
    // The primary list call must be caught: if it throws, we surface a distinct
    // error state (not the "no records" empty state) so staff don't think the
    // records were deleted. Stats stay best-effort.
    return Promise.all([api.list({ q, status }), api.stats().catch(() => null)])
      .then(([d, s]) => { setItems(d.items || d); if (s) setStats(s) })
      .catch((ex) => { setLoadErr(ex?.detail || LOAD_ERROR); setItems([]) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [q, status]) // eslint-disable-line

  const empty = useMemo(() => {
    const o = {}
    fields.forEach((f) => { o[f.k] = f.type === 'active' ? true : f.type === 'multiselect' ? [] : f.type === 'custom' ? (f.default ?? {}) : f.type === 'number' ? '' : (f.default ?? '') })
    return o
  }, [fields])

  const setD = (patch) => setDrawer((d) => ({ ...d, data: { ...d.data, ...patch } }))
  async function save(e) {
    e.preventDefault(); setErr('')
    const d = { ...drawer.data }
    fields.forEach((f) => { if (f.type === 'number') d[f.k] = d[f.k] === '' ? 0 : Number(d[f.k]) })
    try {
      if (drawer.mode === 'create') await api.create(d)
      else await api.update(d.id, d)
      setDrawer(null); load()
    } catch (ex) { setErr(ex.detail || ex.message || 'Failed to save.') }
  }
  async function remove(row) { if (await confirmDialog({ title: `Delete this ${entity}?`, message: 'This cannot be undone.', tone: 'danger', confirmLabel: 'Delete' })) { try { await api.remove(row.id); toast(`${entity} deleted.`); load() } catch (ex) { toast(ex.detail || 'Failed', 'error') } } }

  const statusOf = (row) => (row.active !== undefined ? (row.active ? 'Active' : 'Inactive') : row.status)

  return (
    <div>
      <PageTitle title={title} subtitle={subtitle}
        actions={canWrite && <button onClick={() => { setErr(''); setDrawer({ mode: 'create', data: { ...empty } }) }} className="btn-maroon !py-2.5"><Plus size={16} /> {addLabel}</button>} />

      {statCards.length > 0 && (
        /* Column count follows the number of tiles so the row always fills the
           width evenly (a fixed 4-col grid left a gap after 3 tiles). */
        <div className={`grid grid-cols-2 gap-4 mb-6 ${
          { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }[statCards.length] || 'lg:grid-cols-4'
        }`}>
          {statCards.map((c) => (
            <StatTile key={c.key} icon={c.icon} color={c.color} bg={c.bg} title={c.title}
              value={stats ? num(stats[c.key]) : '—'} sub={c.sub} />
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1 max-w-sm relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="input !pl-9" /></div>
          <div><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-40"><option value="">All</option><option>Active</option><option>Inactive</option></Select></div>
          <div className="lg:ml-auto flex gap-2"><button onClick={() => { setQ(''); setStatus('') }} className="btn-outline !py-2.5"><RotateCcw size={14} />{' '}<T>Reset</T></button></div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
              {columns.map((c) => <th key={c.key} className="px-4 py-3 font-semibold whitespace-nowrap">{c.label}</th>)}
              <th className="px-4 py-3 font-semibold"><T>Status</T></th>
              <th className="px-4 py-3 font-semibold"><T>Actions</T></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/60">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3.5 ${c.mono ? 'font-mono text-[0.75rem] text-gray-500' : c.strong ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                      {c.render ? c.render(row) : (row[c.key] ?? '—')}
                    </td>
                  ))}
                  <td className="px-4 py-3.5"><Pill tone={statusOf(row) === 'Active' ? 'green' : 'gray'}>{statusOf(row)}</Pill></td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      {canWrite && <button onClick={() => { setErr(''); setDrawer({ mode: 'edit', data: { ...empty, ...row } }) }} title={tr("Edit")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-maroon-600 hover:bg-maroon-50"><Pencil size={15} /></button>}
                      {isAdmin && <button onClick={() => remove(row)} title={tr("Delete")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300"><Trash2 size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && <TableStates colSpan={columns.length + 2} loading={loading} error={loadErr} onRetry={load} empty={`No ${entity}s found.`} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 text-[0.8125rem] text-gray-500">Showing 1 to {items.length} of {items.length} {entity}s</div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <h3 className="font-serif text-xl font-bold text-maroon-800">{drawer.mode === 'create' ? addLabel : `Edit ${entity}`}</h3>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4 flex-1">
              {fields.map((f) => (
                <div key={f.k} className={f.full ? '' : ''}>
                  <label className="label">{f.label}{f.required && ' *'}</label>
                  {f.type === 'select' ? (
                    <Select required={f.required} className="input" value={drawer.data[f.k] || ''} onChange={(e) => setD({ [f.k]: e.target.value })}>
                      <option value="">Select…</option>{f.options.map((o) => <option key={o}>{o}</option>)}
                    </Select>
                  ) : f.type === 'active' ? (
                    <Select className="input" value={drawer.data.active ? 'Active' : 'Inactive'} onChange={(e) => setD({ active: e.target.value === 'Active' })}><option>Active</option><option>Inactive</option></Select>
                  ) : f.type === 'textarea' ? (
                    <textarea className="input min-h-[4.5rem]" value={drawer.data[f.k] || ''} onChange={(e) => setD({ [f.k]: e.target.value })} />
                  ) : f.type === 'date' ? (
                    <DateField required={f.required} className="input" value={drawer.data[f.k] || ''} onChange={(e) => setD({ [f.k]: e.target.value })} />
                  ) : f.type === 'number' ? (
                    <NumberField step="0.01" min="0" required={f.required} prefix={f.prefix} value={drawer.data[f.k]} onChange={(e) => setD({ [f.k]: e.target.value })} />
                  ) : f.type === 'custom' ? (
                    f.render ? f.render(drawer.data, setD) : null
                  ) : f.type === 'multiselect' ? (
                    <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
                      {(f.options || []).map((o) => {
                        const on = (drawer.data[f.k] || []).includes(o.value)
                        return (
                          <label key={o.value} className="flex items-center gap-2 text-[0.8125rem] text-gray-700 px-1 py-0.5">
                            <Checkbox checked={on} onChange={() => setD({ [f.k]: on ? drawer.data[f.k].filter((x) => x !== o.value) : [...(drawer.data[f.k] || []), o.value] })} /> {o.label}
                          </label>
                        )
                      })}
                      {(f.options || []).length === 0 && <div className="text-[0.75rem] text-gray-400 px-1"><T>No options.</T></div>}
                    </div>
                  ) : (
                    <input required={f.required} className="input" placeholder={f.placeholder} value={drawer.data[f.k] || ''} onChange={(e) => setD({ [f.k]: e.target.value })} />
                  )}
                </div>
              ))}
              {err && <div className="text-[0.8125rem] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button className="btn-maroon flex-1 justify-center"><Save size={15} />{' '}<T>Save</T></button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
