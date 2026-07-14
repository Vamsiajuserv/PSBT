import React, { useEffect, useState, useCallback } from 'react'
import { ScrollText, Activity, LogIn, Users, Search, RotateCcw } from 'lucide-react'
import { PageTitle, StatTile, Pill, num, fmtStamp } from '../../components/admin/ui.jsx'
import { AuditAPI } from '../../api/client.js'

const ACTION_TONE = { LOGIN: 'blue', CREATE: 'green', UPDATE: 'amber', DELETE: 'red', DENIED: 'red', LOGOUT: 'gray' }
const ACTIONS = ['LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'DENIED']

export default function AuditTrail() {
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
  const size = 20

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([
      AuditAPI.search({ q, action, entity, start, end, page, size }),
      AuditAPI.stats().catch(() => null),
    ])
    setRows(d.items); setTotal(d.total); if (d.entities) setEntities(d.entities); if (s) setStats(s)
  }, [q, action, entity, start, end, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useEffect(() => { setPage(1) }, [q, action, entity, start, end])

  const pages = Math.max(1, Math.ceil(total / size))
  const from = total ? (page - 1) * size + 1 : 0
  const to = Math.min(page * size, total)

  return (
    <div>
      <PageTitle title="Audit Trail" subtitle="Immutable log of every action performed in the system." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={ScrollText} color="#8a1c1c" bg="bg-maroon-50" title="Total Events" value={stats ? num(stats.total) : '—'} sub="All logged actions" />
        <StatTile icon={Activity} color="#2563eb" bg="bg-blue-50" title="Today" value={stats ? num(stats.today) : '—'} sub="Events today" />
        <StatTile icon={LogIn} color="#059669" bg="bg-emerald-50" title="Logins" value={stats ? num(stats.logins) : '—'} sub="Total sign-ins" />
        <StatTile icon={Users} color="#7c3aed" bg="bg-violet-50" title="Active Users" value={stats ? num(stats.users) : '—'} sub="Distinct actors" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Search</label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="User, entity or detail…" className="input !pl-9" /></div>
          </div>
          <div><label className="block text-[12px] text-gray-500 mb-1.5">Action</label>
            <select value={action} onChange={(e) => setAction(e.target.value)} className="input"><option value="">All</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select></div>
          <div><label className="block text-[12px] text-gray-500 mb-1.5">Entity</label>
            <select value={entity} onChange={(e) => setEntity(e.target.value)} className="input"><option value="">All</option>{entities.map((e) => <option key={e}>{e}</option>)}</select></div>
          <div><label className="block text-[12px] text-gray-500 mb-1.5">From</label><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input" /></div>
          <div className="flex gap-2 items-end">
            <div className="flex-1"><label className="block text-[12px] text-gray-500 mb-1.5">To</label><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input" /></div>
            <button onClick={() => { setQ(''); setAction(''); setEntity(''); setStart(''); setEnd('') }} className="btn-outline !py-2.5"><RotateCcw size={14} /></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[11px] uppercase tracking-wide text-gray-500">
              {['Timestamp', 'User', 'Action', 'Entity', 'Detail', 'Status', 'IP Address'].map((c) => <th key={c} className="px-4 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 text-gray-500 text-[13px] whitespace-nowrap">{fmtStamp(r.ts)}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{r.username || '—'}</td>
                  <td className="px-4 py-3"><Pill tone={ACTION_TONE[r.action] || 'gray'}>{r.action}</Pill></td>
                  <td className="px-4 py-3 text-gray-600">{r.entity || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-md truncate">{r.detail || '—'}</td>
                  <td className="px-4 py-3"><Pill tone={r.status === 'SUCCESS' ? 'green' : 'red'}>{r.status}</Pill></td>
                  <td className="px-4 py-3 font-mono text-[12px] text-gray-400">{r.ip || '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No audit events found.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[13px] text-gray-500">Showing {from} to {to} of {num(total)} events</span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-2.5 h-8 rounded-lg border border-gray-200 text-[13px] text-gray-500 disabled:opacity-40">‹</button>
            <span className="w-8 h-8 grid place-items-center rounded-lg bg-maroon-700 text-cream text-[13px] font-semibold">{page}</span>
            <button onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages} className="px-2.5 h-8 rounded-lg border border-gray-200 text-[13px] text-gray-500 disabled:opacity-40">›</button>
          </div>
        </div>
      </div>
    </div>
  )
}
