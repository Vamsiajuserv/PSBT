import React, { useEffect, useState, useCallback } from 'react'
import { ScrollText, Activity, LogIn, Users, Search, RotateCcw } from 'lucide-react'
import { PageTitle, StatTile, Pill, num, fmtStamp } from '../../components/admin/ui.jsx'
import { TableStates, LOAD_ERROR } from '../../components/common/states.jsx'
import { AuditAPI } from '../../api/client.js'
import { Select, DateField } from '../../components/common/Field.jsx'
import { useFilterableSortableTable, SortFilterPanel, SortableFilterableTh } from '../../components/common/SortableTable.jsx'
import { T, tr, auditDetail, personName, useLang } from '../../i18n/LanguageContext.jsx'

const ACTION_TONE = { LOGIN: 'blue', CREATE: 'green', UPDATE: 'amber', DELETE: 'red', DENIED: 'red', LOGOUT: 'gray' }
const ACTIONS = ['LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'DENIED']

// Sortable columns configuration with filtering support
const SORT_COLUMNS = [
  { key: 'ts', label: 'Timestamp', type: 'date' },
  { key: 'username', label: 'User', type: 'text' },
  { key: 'action', label: 'Action', type: 'text', filterable: true, filterOptions: ['LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'DENIED', 'LOGOUT'] },
  { key: 'status', label: 'Status', type: 'text', filterable: true, filterOptions: ['SUCCESS', 'FAILED'] },
]

export default function AuditTrail() {
  const { lang } = useLang()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [entities, setEntities] = useState([])
  const [stats, setStats] = useState(null)
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const size = 20

  // Sorting with filtering
  const {
    filteredSortedRows,
    sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection,
    filters, toggleFilterValue, clearFilter, clearAllFilters, getFilterValues,
  } = useFilterableSortableTable(rows, SORT_COLUMNS, [{ key: 'ts', direction: 'desc' }])

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('')
    try {
      const [d, s] = await Promise.all([
        AuditAPI.search({ q, action, entity, start, end, page, size }),
        AuditAPI.stats().catch(() => null),
      ])
      setRows(d.items); setTotal(d.total); if (d.entities) setEntities(d.entities); if (s) setStats(s)
    } catch (ex) {
      setLoadErr(ex?.detail || LOAD_ERROR); setRows([]); setTotal(0)
    } finally { setLoading(false) }
  }, [q, action, entity, start, end, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useEffect(() => { setPage(1) }, [q, action, entity, start, end])

  const pages = Math.max(1, Math.ceil(total / size))
  const from = total ? (page - 1) * size + 1 : 0
  const to = Math.min(page * size, total)

  return (
    <div>
      <PageTitle title={tr("Audit Trail")} subtitle={tr("Immutable log of every action performed in the system.")} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={ScrollText} color="#8a1c1c" bg="bg-maroon-50" title={tr("Total Events")} value={stats ? num(stats.total) : '—'} sub={tr("All logged actions")} />
        <StatTile icon={Activity} color="#2563eb" bg="bg-blue-50" title={tr("Today")} value={stats ? num(stats.today) : '—'} sub={tr("Events today")} />
        <StatTile icon={LogIn} color="#059669" bg="bg-emerald-50" title={tr("Logins")} value={stats ? num(stats.logins) : '—'} sub={tr("Total sign-ins")} />
        <StatTile icon={Users} color="#7c3aed" bg="bg-violet-50" title={tr("Active Users")} value={stats ? num(stats.users) : '—'} sub={tr("Distinct actors")} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("User, entity or detail…")} className="input !pl-9" /></div>
          </div>
          <div><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Action</T></label>
            <Select value={action} onChange={(e) => setAction(e.target.value)} className="input"><option value="">{tr("All")}</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</Select></div>
          <div><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Entity</T></label>
            <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="input"><option value="">{tr("All")}</option>{entities.map((e) => <option key={e}>{e}</option>)}</Select></div>
          <div><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>From</T></label><DateField value={start} onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd('') }} className="input" /></div>
          <div className="flex gap-2 items-end">
            <div className="flex-1"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label><DateField value={end} onChange={(e) => setEnd(e.target.value)} min={start} className="input" /></div>
            <button type="button" onClick={() => { setQ(''); setAction(''); setEntity(''); setStart(''); setEnd(''); setPage(1) }} className="btn-outline !py-2.5"><RotateCcw size={14} />{' '}<T>Clear</T></button>
          </div>
        </div>
        <SortFilterPanel
          sorts={sorts}
          filters={filters}
          columns={SORT_COLUMNS}
          onToggleSort={handleColumnClick}
          onRemoveSort={removeSort}
          onClearSorts={clearSorts}
          onClearFilter={clearFilter}
          onClearAllFilters={clearAllFilters}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              {['ts', 'username', 'action'].map((key) => {
                const col = SORT_COLUMNS.find(c => c.key === key)
                const sortIdx = getSortIndex(col.key)
                const sortDir = getSortDirection(col.key)
                const isSorted = sortIdx >= 0
                return (
                  <th key={col.key} onClick={(e) => handleColumnClick(col.key, e)}
                    className={`group px-4 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-maroon-700 bg-maroon-50/50' : ''}`}
                    title={tr("Click to sort (↓→↑→clear). Shift+Click for multi-column sort.")}>
                    <span className="inline-flex items-center gap-0.5">
                      {tr(col.label)}
                      {isSorted ? (
                        <span className="inline-flex items-center gap-0.5 text-maroon-600 ml-1">
                          {sorts.length > 1 && sortIdx > 0 && <span className="text-[0.5625rem] font-bold">{sortIdx + 1}</span>}
                          {sortDir === 'desc' ? <ArrowDown size={13} strokeWidth={2.5} /> : <ArrowUp size={13} strokeWidth={2.5} />}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-gray-400 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronsUpDown size={14} strokeWidth={2} />
                        </span>
                      )}
                    </span>
                  </th>
                )
              })}
              <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Entity')}</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Detail')}</th>
              {(() => {
                const col = SORT_COLUMNS.find(c => c.key === 'status')
                const sortIdx = getSortIndex(col.key)
                const sortDir = getSortDirection(col.key)
                const isSorted = sortIdx >= 0
                return (
                  <th onClick={(e) => handleColumnClick(col.key, e)}
                    className={`group px-4 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-maroon-700 bg-maroon-50/50' : ''}`}
                    title={tr("Click to sort (↓→↑→clear). Shift+Click for multi-column sort.")}>
                    <span className="inline-flex items-center gap-0.5">
                      {tr('Status')}
                      {isSorted ? (
                        <span className="inline-flex items-center gap-0.5 text-maroon-600 ml-1">
                          {sorts.length > 1 && sortIdx > 0 && <span className="text-[0.5625rem] font-bold">{sortIdx + 1}</span>}
                          {sortDir === 'desc' ? <ArrowDown size={13} strokeWidth={2.5} /> : <ArrowUp size={13} strokeWidth={2.5} />}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-gray-400 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronsUpDown size={14} strokeWidth={2} />
                        </span>
                      )}
                    </span>
                  </th>
                )
              })()}
              <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('IP Address')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSortedRows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 text-gray-500 text-[0.8125rem] whitespace-nowrap">{fmtStamp(r.ts)}</td>
                  <td className="px-4 py-3">
                    {/* The person's name for readability; the username stays
                        visible because it is the identity the system authenticated. */}
                    <div className="font-semibold text-gray-800">
                      {personName({ name: r.actor_name, name_te: r.actor_name_te }, lang) || r.username || '—'}
                    </div>
                    {r.actor_name && <div className="text-[0.6875rem] text-gray-400 font-mono">{r.username}</div>}
                  </td>
                  <td className="px-4 py-3"><Pill tone={ACTION_TONE[r.action] || 'gray'}>{tr(r.action)}</Pill></td>
                  <td className="px-4 py-3 text-gray-600">{r.entity ? tr(r.entity) : '—'}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-md truncate">{r.detail ? auditDetail(r.detail) : '—'}</td>
                  <td className="px-4 py-3"><Pill tone={r.status === 'SUCCESS' ? 'green' : 'red'}>{tr(r.status)}</Pill></td>
                  <td className="px-4 py-3 font-mono text-[0.75rem] text-gray-400">{r.ip || '—'}</td>
                </tr>
              ))}
              {filteredSortedRows.length === 0 && <TableStates colSpan={7} loading={loading} error={loadErr} onRetry={load} empty={tr("No audit events found.")} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[0.8125rem] text-gray-500">{tr('Showing')} {from} {tr('to')} {to} {tr('of')} {num(total)} {tr('events')}</span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-2.5 h-8 rounded-lg border border-gray-200 text-[0.8125rem] text-gray-500 disabled:opacity-40">‹</button>
            <span className="w-8 h-8 grid place-items-center rounded-lg bg-maroon-700 text-cream text-[0.8125rem] font-semibold">{page}</span>
            <button onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages} className="px-2.5 h-8 rounded-lg border border-gray-200 text-[0.8125rem] text-gray-500 disabled:opacity-40">›</button>
          </div>
        </div>
      </div>
    </div>
  )
}
