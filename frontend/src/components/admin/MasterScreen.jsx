import React, { useEffect, useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, X, Save, RotateCcw, Search, Info, ArrowUp, ArrowDown } from 'lucide-react'
import { PageTitle, StatTile, Pill, num } from './ui.jsx'
import { useSortableTable, SortPanel } from '../common/SortableTable.jsx'
import { TableStates, LOAD_ERROR } from '../common/states.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Select, DateField, Checkbox, NumberField, CountryCodeSelect, getCountryDigits } from '../common/Field.jsx'
import { confirmDialog, toast } from '../common/Dialog.jsx'
import { T, tr, personName, useLang } from '../../i18n/LanguageContext.jsx'
import { sanitizeName, sanitizePhone, validateName, validatePhone, validateEmail } from '../../lib/validation.js'

// Generic list + drawer master screen.
// config: { title, subtitle, api, statCards, columns, fields, searchPlaceholder, addLabel, entity, sortColumns }
export default function MasterScreen({ config }) {
  const { title, subtitle, api, statCards = [], columns, fields, searchPlaceholder = 'Search…', addLabel = 'Add New', entity = 'record', sortColumns = [] } = config
  const { user } = useAuth()
  const { lang } = useLang()
  const canWrite = user?.role !== 'Accountant'
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)

  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [drawer, setDrawer] = useState(null)
  const [err, setErr] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')

  // Sorting - use first sortColumn as default if available
  const defaultSort = sortColumns.length > 0 ? [{ key: sortColumns[0].key, direction: 'asc' }] : []
  const { sortedRows, sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection } = useSortableTable(items, sortColumns, defaultSort)

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
  const clearFieldError = (k) => setFieldErrors((p) => ({ ...p, [k]: null }))

  async function save(e) {
    e.preventDefault(); setErr('')

    // Validate fields with validation types
    const errors = {}
    fields.forEach((f) => {
      if (f.type === 'name' && f.required) {
        const result = validateName(drawer.data[f.k])
        if (!result.valid) errors[f.k] = result.error
      }
      if (f.type === 'phone' && drawer.data[f.k]) {
        const result = validatePhone(drawer.data[f.k])
        if (!result.valid) errors[f.k] = result.error
      }
      if (f.type === 'email' && drawer.data[f.k]) {
        const result = validateEmail(drawer.data[f.k])
        if (!result.valid) errors[f.k] = result.error
      }
    })

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setErr(tr('Please fix the errors above.'))
      return
    }

    setFieldErrors({})
    const d = { ...drawer.data }
    fields.forEach((f) => {
      if (f.type === 'number') d[f.k] = d[f.k] === '' ? 0 : Number(d[f.k])
      // Convert empty optional strings to null for proper backend validation
      if (['email', 'phone', 'text'].includes(f.type) && !f.required && d[f.k] === '') d[f.k] = null
    })
    try {
      if (drawer.mode === 'create') await api.create(d)
      else await api.update(d.id, d)
      setDrawer(null); load()
    } catch (ex) { setErr(ex.detail || ex.message || 'Failed to save.') }
  }
  async function remove(row) { if (await confirmDialog({ title: tr(`Delete this ${entity}?`), message: tr('This cannot be undone.'), tone: 'danger', confirmLabel: tr('Delete') })) { try { await api.remove(row.id); toast(tr(`${entity} deleted.`)); load() } catch (ex) { toast(ex.detail || tr('Failed'), 'error') } } }

  const statusOf = (row) => (row.active !== undefined ? (row.active ? 'Active' : 'Inactive') : row.status)

  return (
    <div>
      <PageTitle title={tr(title)} subtitle={tr(subtitle)}
        actions={canWrite && <button onClick={() => { setErr(''); setDrawer({ mode: 'create', data: { ...empty } }) }} className="btn-maroon !py-2.5"><Plus size={16} /> {tr(addLabel)}</button>} />

      {statCards.length > 0 && (
        /* Column count follows the number of tiles so the row always fills the
           width evenly (a fixed 4-col grid left a gap after 3 tiles). */
        <div className={`grid grid-cols-2 gap-4 mb-6 ${
          { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }[statCards.length] || 'lg:grid-cols-4'
        }`}>
          {statCards.map((c) => (
            <StatTile key={c.key} icon={c.icon} color={c.color} bg={c.bg} title={tr(c.title)}
              value={stats ? num(stats[c.key]) : '—'} sub={tr(c.sub)} />
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1 max-w-sm relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(searchPlaceholder)} className="input !pl-9" /></div>
          <div><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-40"><option value="">{tr("All")}</option><option value="Active">{tr("Active")}</option><option value="Inactive">{tr("Inactive")}</option></Select></div>
          <button onClick={() => { setQ(''); setStatus('') }} className="btn-outline !py-2.5"><RotateCcw size={14} />{' '}<T>Clear</T></button>
        </div>

        {sortColumns.length > 0 && <SortPanel sorts={sorts} columns={sortColumns} onToggle={handleColumnClick} onRemove={removeSort} onClear={clearSorts} />}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              {columns.map((c) => {
                const sortCol = sortColumns.find((sc) => sc.key === c.key)
                if (sortCol) {
                  const sortIdx = getSortIndex(c.key)
                  const sortDir = getSortDirection(c.key)
                  const isSorted = sortIdx >= 0
                  return (
                    <th key={c.key} onClick={(e) => handleColumnClick(c.key, e)}
                      className={`px-4 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-blue-700 bg-blue-50/50' : ''}`}
                      title={tr("Click to sort, Shift+Click to add secondary sort")}>
                      <span className="inline-flex items-center gap-1">
                        {tr(c.label)}
                        {isSorted && (
                          <span className="inline-flex items-center gap-0.5 text-blue-600">
                            {sorts.length > 1 && <span className="text-[0.5625rem] font-bold">{sortIdx + 1}</span>}
                            {sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                          </span>
                        )}
                      </span>
                    </th>
                  )
                }
                return <th key={c.key} className="px-4 py-3 font-semibold whitespace-nowrap">{tr(c.label)}</th>
              })}
              {(() => {
                const sortCol = sortColumns.find((sc) => sc.key === 'active' || sc.key === 'status')
                if (sortCol) {
                  const sortIdx = getSortIndex(sortCol.key)
                  const sortDir = getSortDirection(sortCol.key)
                  const isSorted = sortIdx >= 0
                  return (
                    <th onClick={(e) => handleColumnClick(sortCol.key, e)}
                      className={`px-4 py-3 font-semibold cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-blue-700 bg-blue-50/50' : ''}`}
                      title={tr("Click to sort, Shift+Click to add secondary sort")}>
                      <span className="inline-flex items-center gap-1">
                        <T>Status</T>
                        {isSorted && (
                          <span className="inline-flex items-center gap-0.5 text-blue-600">
                            {sorts.length > 1 && <span className="text-[0.5625rem] font-bold">{sortIdx + 1}</span>}
                            {sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                          </span>
                        )}
                      </span>
                    </th>
                  )
                }
                return <th className="px-4 py-3 font-semibold"><T>Status</T></th>
              })()}
              <th className="px-4 py-3 font-semibold"><T>Actions</T></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/60">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3.5 ${c.mono ? 'font-mono text-[0.75rem] text-gray-500' : c.strong ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                      {c.render ? c.render(row)
                        : c.person ? personName({ name: row[c.key], name_te: row.name_te }, lang)
                        : (row[c.key] != null ? tr(String(row[c.key])) : '—')}
                    </td>
                  ))}
                  <td className="px-4 py-3.5"><Pill tone={statusOf(row) === 'Active' ? 'green' : 'gray'}>{statusOf(row)}</Pill></td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      {canWrite && <button onClick={() => { setErr(''); setDrawer({ mode: 'edit', data: { ...empty, ...row } }) }} title={tr("Edit")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-maroon-600 hover:bg-maroon-50"><Pencil size={15} /></button>}
                      {isAdmin && <button onClick={() => remove(row)} title={tr("Delete")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-red-600 hover:border-red-300"><Trash2 size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {sortedRows.length === 0 && <TableStates colSpan={columns.length + 2} loading={loading} error={loadErr} onRetry={load} empty={tr(`No ${entity}s found.`)} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 text-[0.8125rem] text-gray-500">{tr('Showing')} 1 {tr('to')} {items.length} {tr('of')} {items.length} {tr(entity + 's')}</div>
      </div>

      {/* Help note explaining Delete vs Inactive (Item 39) */}
      <div className="mt-4 flex items-start gap-2 text-[0.8125rem] text-gray-600 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-3">
        <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-gray-700"><T>Delete vs Inactive:</T></span>{' '}
          <T>Use</T> <span className="font-medium text-red-600"><T>Delete</T></span> <T>to permanently remove a record (only works if no transactions are linked).</T>{' '}
          <T>Use</T> <span className="font-medium text-amber-600"><T>Inactive</T></span> <T>status to hide from dropdowns while preserving history.</T>
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <h3 className="font-serif text-xl font-bold text-maroon-800">{drawer.mode === 'create' ? tr(addLabel) : tr(`Edit ${entity}`)}</h3>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4 flex-1">
              {fields.map((f) => (
                <div key={f.k} className={f.full ? '' : ''}>
                  <label className="label">{tr(f.label)}{f.required && ' *'}</label>
                  {f.type === 'select' ? (
                    <Select required={f.required} className="input" value={drawer.data[f.k] || ''} onChange={(e) => setD({ [f.k]: e.target.value })}>
                      <option value="">{tr("Select…")}</option>{f.options.map((o) => <option key={o}>{o}</option>)}
                    </Select>
                  ) : f.type === 'active' ? (
                    <Select className="input" value={drawer.data.active ? tr('Active') : tr('Inactive')} onChange={(e) => setD({ active: e.target.value === 'Active' })}><option value="Active">{tr("Active")}</option><option value="Inactive">{tr("Inactive")}</option></Select>
                  ) : f.type === 'textarea' ? (
                    <textarea className="input min-h-[4.5rem]" value={drawer.data[f.k] || ''} onChange={(e) => setD({ [f.k]: e.target.value })} />
                  ) : f.type === 'date' ? (
                    <DateField required={f.required} className="input" value={drawer.data[f.k] || ''} onChange={(e) => setD({ [f.k]: e.target.value })} />
                  ) : f.type === 'number' ? (
                    <NumberField step="0.01" min="0" required={f.required} prefix={f.prefix} value={drawer.data[f.k]} onChange={(e) => setD({ [f.k]: e.target.value })} />
                  ) : f.type === 'name' ? (
                    <>
                      <input required={f.required} className={`input ${fieldErrors[f.k] ? 'border-red-400' : ''}`}
                        placeholder={f.placeholder ? tr(f.placeholder) : tr(f.label)} value={drawer.data[f.k] || ''}
                        onChange={(e) => { clearFieldError(f.k); setD({ [f.k]: sanitizeName(e.target.value) }) }} />
                      {fieldErrors[f.k] && <div className="text-[0.7rem] text-red-500 mt-0.5">{fieldErrors[f.k]}</div>}
                    </>
                  ) : f.type === 'phone' ? (
                    <>
                      <div className="flex">
                        <CountryCodeSelect value={drawer.data[`${f.k}_country_code`] || '+91'} onChange={(e) => setD({ [`${f.k}_country_code`]: e.target.value })} />
                        <input className={`input flex-1 !rounded-l-none ${fieldErrors[f.k] ? 'border-red-400' : ''}`}
                          placeholder={tr("Enter Mobile Number")} maxLength={getCountryDigits(drawer.data[`${f.k}_country_code`] || '+91')} value={drawer.data[f.k] || ''}
                          onChange={(e) => { clearFieldError(f.k); setD({ [f.k]: sanitizePhone(e.target.value) }) }} />
                      </div>
                      {fieldErrors[f.k] && <div className="text-[0.7rem] text-red-500 mt-0.5">{fieldErrors[f.k]}</div>}
                    </>
                  ) : f.type === 'email' ? (
                    <>
                      <input type="email" className={`input ${fieldErrors[f.k] ? 'border-red-400' : ''}`}
                        placeholder={tr("Enter Email")} value={drawer.data[f.k] || ''} onChange={(e) => { clearFieldError(f.k); setD({ [f.k]: e.target.value }) }} />
                      {fieldErrors[f.k] && <div className="text-[0.7rem] text-red-500 mt-0.5">{fieldErrors[f.k]}</div>}
                    </>
                  ) : f.type === 'custom' ? (
                    f.render ? f.render(drawer.data, setD) : null
                  ) : f.type === 'multiselect' ? (
                    <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
                      {(f.options || []).map((o) => {
                        const on = (drawer.data[f.k] || []).includes(o.value)
                        return (
                          <label key={o.value} className="flex items-center gap-2 text-[0.8125rem] text-gray-700 px-1 py-0.5">
                            <Checkbox checked={on} onChange={() => setD({ [f.k]: on ? drawer.data[f.k].filter((x) => x !== o.value) : [...(drawer.data[f.k] || []), o.value] })} /> {tr(o.label)}
                          </label>
                        )
                      })}
                      {(f.options || []).length === 0 && <div className="text-[0.75rem] text-gray-400 px-1"><T>No options.</T></div>}
                    </div>
                  ) : (
                    <input required={f.required} className="input" placeholder={tr(f.placeholder)} value={drawer.data[f.k] || ''} onChange={(e) => setD({ [f.k]: e.target.value })} />
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
