import React, { useEffect, useState, useMemo } from 'react'
import {
  Plus, Pencil, MoreVertical, X, Search, RotateCcw, Eye, EyeOff, Save, Info, Trash2,
  Users as UsersIcon, UserCheck, UserX, ShieldCheck,
} from 'lucide-react'
import { PageTitle, StatTile, Pill, num, fmtStamp } from '../../components/admin/ui.jsx'
import { TableStates, LOAD_ERROR } from '../../components/common/states.jsx'
import { UsersAPI, RolesAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'

const AVATAR_TONES = ['bg-maroon-700', 'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600']
const initials = (n) => (n || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
const tone = (n) => AVATAR_TONES[(n || '').length % AVATAR_TONES.length]
const emptyUser = () => ({ name: '', email: '', mobile: '', role: '', is_active: true, password: '', confirm: '', modules: [] })

export default function Users() {
  const { user } = useAuth()
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)
  const [rows, setRows] = useState([])
  const [stats, setStats] = useState(null)
  const [roles, setRoles] = useState([])
  const [catalog, setCatalog] = useState([])
  const [drawer, setDrawer] = useState(null)
  const [tab, setTab] = useState('details')
  const [showPw, setShowPw] = useState(false)
  const [menu, setMenu] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')

  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  useEffect(() => { setPage(1) }, [q, role, status])

  const load = () => {
    setLoading(true); setLoadErr('')
    return Promise.all([
      UsersAPI.list(), UsersAPI.stats().catch(() => null), UsersAPI.meta().catch(() => null), RolesAPI.catalog().catch(() => null),
    ]).then(([list, s, meta, cat]) => { setRows(list); if (s) setStats(s); if (meta) setRoles(meta.roles); if (cat) setCatalog(cat.modules) })
      .catch((ex) => { setLoadErr(ex?.detail || LOAD_ERROR); setRows([]) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const roleModules = useMemo(() => {
    const map = {}; return map // filled from roles list below
  }, [])

  const filtered = useMemo(() => rows.filter((u) => {
    if (q && !`${u.name} ${u.email} ${u.mobile || ''}`.toLowerCase().includes(q.toLowerCase())) return false
    if (role && u.role !== role) return false
    if (status === 'Active' && !u.is_active) return false
    if (status === 'Inactive' && u.is_active) return false
    return true
  }), [rows, q, role, status])
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const pageNum = Math.min(page, totalPages)
  const paged = filtered.slice((pageNum - 1) * perPage, pageNum * perPage)
  const from = filtered.length ? (pageNum - 1) * perPage + 1 : 0
  const to = Math.min(pageNum * perPage, filtered.length)

  async function openCreate() {
    setTab('details'); setErr(''); setDrawer({ mode: 'create', data: emptyUser() })
  }
  function openEdit(u) {
    setTab('details'); setErr('')
    setDrawer({ mode: 'edit', data: { id: u.id, name: u.name, email: u.email, mobile: u.mobile || '', role: u.role, is_active: u.is_active, password: '', confirm: '', modules: (u.modules || '').split(',').filter(Boolean) } })
    setMenu(null)
  }
  const setD = (patch) => setDrawer((d) => ({ ...d, data: { ...d.data, ...patch } }))
  const toggleMod = (k) => setDrawer((d) => { const has = d.data.modules.includes(k); return { ...d, data: { ...d.data, modules: has ? d.data.modules.filter((x) => x !== k) : [...d.data.modules, k] } } })

  async function save(e) {
    e.preventDefault()
    const d = drawer.data
    if (drawer.mode === 'create' && d.password !== d.confirm) { setErr('Passwords do not match.'); return }
    try {
      const payload = { name: d.name, email: d.email, mobile: d.mobile, role: d.role, is_active: d.is_active, modules: d.modules }
      if (drawer.mode === 'create') await UsersAPI.create({ ...payload, password: d.password })
      else await UsersAPI.update(d.id, { ...payload, ...(d.password ? { password: d.password } : {}) })
      setDrawer(null); load()
    } catch (ex) { setErr(ex.detail || ex.message || 'Failed to save user.') }
  }
  async function remove(u) { setMenu(null); if (confirm(`Delete user "${u.name}"?`)) { try { await UsersAPI.remove(u.id); load() } catch (ex) { alert(ex.detail || 'Failed') } } }

  return (
    <div>
      <PageTitle title="User Management" subtitle="Manage system users, roles and access." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={UsersIcon} color="#2563eb" bg="bg-blue-50" title="Total Users" value={stats ? num(stats.total) : '—'} sub="All registered users" />
        <StatTile icon={UserCheck} color="#059669" bg="bg-emerald-50" title="Active Users" value={stats ? num(stats.active) : '—'} sub="Currently active users" />
        <StatTile icon={UserX} color="#dc2626" bg="bg-red-50" title="Inactive Users" value={stats ? num(stats.inactive) : '—'} sub="Currently inactive users" />
        <StatTile icon={ShieldCheck} color="#7c3aed" bg="bg-violet-50" title="Roles" value={stats ? num(stats.roles) : '—'} sub="System roles defined" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1 max-w-xs relative"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or mobile…" className="input pr-9" /></div>
          <div><label className="block text-[12px] text-gray-500 mb-1.5">Select Role</label><select value={role} onChange={(e) => setRole(e.target.value)} className="input !w-48"><option value="">All Roles</option>{roles.map((r) => <option key={r}>{r}</option>)}</select></div>
          <div><label className="block text-[12px] text-gray-500 mb-1.5">Status</label><select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-40"><option value="">All Status</option><option>Active</option><option>Inactive</option></select></div>
          <div className="lg:ml-auto flex flex-col gap-2">
            {isAdmin && <button onClick={openCreate} className="btn-maroon !py-2.5"><Plus size={16} /> Add New User</button>}
            <button onClick={load} className="btn-outline !py-2 self-end"><RotateCcw size={14} /> Refresh</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-amber-50/40 text-left text-[11px] uppercase tracking-wide text-gray-500">
              {['#', 'User Name', 'Email / Mobile', 'Role', 'Status', 'Last Login', 'Actions'].map((c) => <th key={c} className="px-4 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {paged.map((u, i) => (
                <tr key={u.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 text-gray-400">{(pageNum - 1) * perPage + i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-full ${tone(u.name)} text-white grid place-items-center text-[11px] font-bold`}>{initials(u.name)}</div>
                      <span className="font-semibold text-gray-800">{u.name}</span>
                      {u.role === 'Administrator' && <span className="text-[10px] font-semibold text-maroon-700 bg-maroon-50 rounded px-1.5 py-0.5">Admin</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3"><div className="text-gray-700 text-[13px]">{u.email}</div><div className="text-[11px] text-gray-400">{u.mobile || '—'}</div></td>
                  <td className="px-4 py-3 text-gray-600">{u.role}</td>
                  <td className="px-4 py-3"><Pill tone={u.is_active ? 'green' : 'red'}>{u.is_active ? 'Active' : 'Inactive'}</Pill></td>
                  <td className="px-4 py-3 text-gray-500 text-[13px] whitespace-nowrap">{fmtStamp(u.last_login)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 relative">
                      {isAdmin && <button onClick={() => openEdit(u)} title="Edit" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-maroon-600 hover:bg-maroon-50"><Pencil size={15} /></button>}
                      <button onClick={() => setMenu(menu === u.id ? null : u.id)} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-maroon-700"><MoreVertical size={15} /></button>
                      {menu === u.id && (
                        <div className="absolute right-0 top-9 z-20 bg-white border border-gray-100 rounded-lg shadow-lg py-1 w-32 text-sm">
                          {isAdmin && <button onClick={() => openEdit(u)} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-600"><Pencil size={14} /> Edit</button>}
                          {isAdmin && <button onClick={() => remove(u)} className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600"><Trash2 size={14} /> Delete</button>}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <TableStates colSpan={7} loading={loading} error={loadErr} onRetry={load} empty="No users found." />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[13px] text-gray-500">Showing {from} to {to} of {num(filtered.length)} users</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(Math.max(1, pageNum - 1))} disabled={pageNum <= 1} className="px-2.5 h-8 rounded-lg border border-gray-200 text-[13px] text-gray-500 disabled:opacity-40">‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, pageNum - 2), Math.max(0, pageNum - 2) + 3).map((n) => (
                <button key={n} onClick={() => setPage(n)} className={`w-8 h-8 grid place-items-center rounded-lg text-[13px] font-semibold ${n === pageNum ? 'bg-maroon-700 text-cream' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{n}</button>
              ))}
              <button onClick={() => setPage(Math.min(totalPages, pageNum + 1))} disabled={pageNum >= totalPages} className="px-2.5 h-8 rounded-lg border border-gray-200 text-[13px] text-gray-500 disabled:opacity-40">›</button>
            </div>
            <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1) }} className="input !w-28 !py-1.5 text-[13px]">
              {[10, 25, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
          </div>
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <h3 className="font-serif text-xl font-bold text-maroon-800">{drawer.mode === 'create' ? 'Add New User' : 'Edit User'}</h3>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="flex items-center gap-6 px-6 border-b border-gray-100">
              {[['details', 'User Details'], ['access', 'Role & Access']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className={`py-3 text-[13.5px] font-semibold border-b-2 -mb-px ${tab === k ? 'border-maroon-600 text-maroon-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>{l}</button>
              ))}
            </div>

            <div className="px-6 py-5 space-y-4 flex-1">
              {tab === 'details' && (
                <>
                  <div><label className="label">Full Name *</label><input required className="input" placeholder="Enter full name" value={drawer.data.name} onChange={(e) => setD({ name: e.target.value })} /></div>
                  <div><label className="label">Email ID *</label><input required type="email" className="input" placeholder="Enter email address" value={drawer.data.email} onChange={(e) => setD({ email: e.target.value })} /></div>
                  <div><label className="label">Mobile Number *</label>
                    <div className="flex gap-2"><select className="input !w-24"><option>+91</option></select><input required className="input flex-1" placeholder="Enter mobile number" value={drawer.data.mobile} onChange={(e) => setD({ mobile: e.target.value })} /></div>
                  </div>
                  <div><label className="label">Role *</label><select required className="input" value={drawer.data.role} onChange={(e) => setD({ role: e.target.value })}><option value="">Select Role</option>{roles.map((r) => <option key={r}>{r}</option>)}</select></div>
                  <div><label className="label">Status *</label><select className="input" value={drawer.data.is_active ? 'Active' : 'Inactive'} onChange={(e) => setD({ is_active: e.target.value === 'Active' })}><option>Active</option><option>Inactive</option></select></div>
                  <div><label className="label">Password {drawer.mode === 'create' && '*'}</label>
                    <div className="relative"><input required={drawer.mode === 'create'} type={showPw ? 'text' : 'password'} className="input pr-9" placeholder={drawer.mode === 'edit' ? 'Leave blank to keep unchanged' : 'Enter password'} value={drawer.data.password} onChange={(e) => setD({ password: e.target.value })} />
                      <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
                  </div>
                  <div><label className="label">Confirm Password {drawer.mode === 'create' && '*'}</label>
                    <div className="relative"><input required={drawer.mode === 'create'} type={showPw ? 'text' : 'password'} className="input pr-9" placeholder="Confirm password" value={drawer.data.confirm} onChange={(e) => setD({ confirm: e.target.value })} />
                      <Eye size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300" /></div>
                  </div>
                </>
              )}
              {tab === 'access' && (
                <>
                  <p className="text-[12.5px] text-gray-500">Module access for this user. Defaults follow the selected role — customise as needed.</p>
                  <div className="space-y-1.5">
                    {catalog.map((m) => (
                      <label key={m.key} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-gray-50">
                        <span><span className="text-[13px] font-medium text-gray-700">{m.label}</span><span className="block text-[11px] text-gray-400">{m.description}</span></span>
                        <input type="checkbox" className="accent-maroon-700 w-4 h-4" checked={drawer.data.modules.includes(m.key)} onChange={() => toggleMod(m.key)} />
                      </label>
                    ))}
                  </div>
                </>
              )}
              {err && <div className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <div className="flex gap-3">
                <button type="button" onClick={() => setDrawer({ ...drawer, data: emptyUser() })} className="btn-outline flex-1 justify-center"><RotateCcw size={14} /> Reset</button>
                <button className="btn-maroon flex-1 justify-center"><Save size={15} /> Save User</button>
              </div>
              <div className="mt-3 flex items-start gap-2 text-[12px] text-gray-600 bg-blue-50/70 border border-blue-100 rounded-lg px-3 py-2.5"><Info size={14} className="text-blue-500 shrink-0 mt-0.5" /> User will receive login credentials on their registered email.</div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
