import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, Search, ChevronRight, Crown, Users as UsersIcon, ShieldCheck, UserCog, Lock,
  CheckCircle2, XCircle, Info, X, Save, LayoutDashboard, Flame, HeartHandshake, Landmark,
  Gavel, UtensilsCrossed, Recycle, FileBarChart, Settings as SettingsIcon, RefreshCw,
} from 'lucide-react'
import { PageTitle, StatTile, Pill, num } from '../../components/admin/ui.jsx'
import { LOAD_ERROR } from '../../components/common/states.jsx'
import { RolesAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Select } from '../../components/common/Field.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const MOD_ICON = {
  Devotees: UsersIcon, Sevas: Flame, Bookings: Flame, Donations: HeartHandshake,
  Hundi: Landmark, Auction: Gavel, Annadanam: UtensilsCrossed, Counter: Recycle,
  Reports: FileBarChart, Users: UserCog, Audit: ShieldCheck,
}

export default function RoleAccess() {
  const { user } = useAuth()
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)
  const [roles, setRoles] = useState([])
  const [stats, setStats] = useState(null)
  const [catalog, setCatalog] = useState([])
  const [sel, setSel] = useState(null)          // full role detail
  const [mods, setMods] = useState([])          // editable module set
  const [q, setQ] = useState(''); const [status, setStatus] = useState('')
  const [saved, setSaved] = useState(false)
  const [creating, setCreating] = useState(null)   // { name, description } while the Add-Role modal is open
  const [createErr, setCreateErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')

  const reloadRoles = (selectId) =>
    Promise.all([RolesAPI.list(), RolesAPI.stats().catch(() => null)])
      .then(([l, s]) => { setRoles(l.items); if (s) setStats(s); if (selectId) pick(selectId) })

  const loadAll = useCallback(() => {
    setLoading(true); setLoadErr('')
    Promise.all([RolesAPI.list(), RolesAPI.stats().catch(() => null), RolesAPI.catalog().catch(() => null)])
      .then(([l, s, c]) => { setRoles(l.items); if (s) setStats(s); if (c) setCatalog(c.modules); if (l.items[0]) pick(l.items[0].id) })
      .catch((ex) => { setLoadErr(ex?.detail || LOAD_ERROR); setRoles([]) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function createRole(e) {
    e.preventDefault()
    setCreateErr('')
    if (!creating.name.trim()) { setCreateErr('Role name is required.'); return }
    try {
      const r = await RolesAPI.create({ name: creating.name.trim(), description: creating.description.trim(), modules: [] })
      setCreating(null)
      await reloadRoles(r.id)
    } catch (ex) { setCreateErr(ex.detail || 'Could not create role.') }
  }

  function pick(id) { RolesAPI.get(id).then((r) => { setSel(r); setMods(r.modules || []); setSaved(false) }) }
  const toggle = (k) => setMods((m) => (m.includes(k) ? m.filter((x) => x !== k) : [...m, k]))
  async function save() { const r = await RolesAPI.update(sel.id, { modules: mods }); setSel(r); setRoles((rs) => rs.map((x) => (x.id === r.id ? { ...x, modules: r.modules, assigned_users: r.assigned_users } : x))); setSaved(true); setTimeout(() => setSaved(false), 2500) }

  const filtered = roles.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q.toLowerCase())) return false
    if (status === 'Active' && !r.active) return false
    if (status === 'Inactive' && r.active) return false
    return true
  })
  const dirty = sel && JSON.stringify([...mods].sort()) !== JSON.stringify([...(sel.modules || [])].sort())

  return (
    <div>
      <div className="mb-1 text-[0.75rem] text-gray-400"><Link to="/admin/settings" className="hover:text-maroon-600"><T>Settings</T></Link> › <span className="text-gray-500">Role &amp; Access Management</span></div>
      <PageTitle title={tr("Role & Access Management")} subtitle="Manage roles and configure module-level permissions." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={UsersIcon} color="#7c3aed" bg="bg-violet-50" title={tr("Total Roles")} value={stats ? num(stats.total) : '—'} sub="All defined roles" />
        <StatTile icon={ShieldCheck} color="#059669" bg="bg-emerald-50" title={tr("Active Roles")} value={stats ? num(stats.active) : '—'} sub="Currently active roles" />
        <StatTile icon={UserCog} color="#d97706" bg="bg-amber-50" title={tr("Assigned Users")} value={stats ? num(stats.assigned_users) : '—'} sub="Users mapped to roles" />
        <StatTile icon={Lock} color="#2563eb" bg="bg-blue-50" title={tr("Inactive Roles")} value={stats ? num(stats.inactive) : '—'} sub="Currently inactive roles" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(280px,1fr)_minmax(300px,1fr)_minmax(380px,1.3fr)] gap-5">
        {/* Roles List */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 h-max">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Roles List</T></h3>
            {isAdmin && <button onClick={() => { setCreating({ name: '', description: '' }); setCreateErr('') }} className="btn-maroon !py-1.5 !px-3 text-[0.75rem]"><Plus size={13} />{' '}<T>Add New Role</T></button>}
          </div>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search roles by name…")} className="input !pl-9 text-[0.8125rem]" /></div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-28 text-[0.8125rem]"><option value="">All Status</option><option>Active</option><option>Inactive</option></Select>
          </div>
          <div className="space-y-2">
            {loading && <div className="py-8 text-center text-gray-400 text-sm"><T>Loading…</T></div>}
            {!loading && loadErr && (
              <div className="py-8 text-center">
                <div className="text-sm text-red-600 mb-3">{loadErr}</div>
                <button onClick={loadAll} className="btn-outline !py-1.5 mx-auto"><RefreshCw size={14} />{' '}<T>Retry</T></button>
              </div>
            )}
            {!loading && !loadErr && filtered.length === 0 && <div className="py-8 text-center text-gray-400 text-sm"><T>No roles found.</T></div>}
            {!loading && !loadErr && filtered.map((r) => {
              const on = sel?.id === r.id; const Icon = r.code === 'ADMINISTRATOR' ? Crown : UsersIcon
              return (
                <button key={r.id} onClick={() => pick(r.id)} className={`w-full flex items-center gap-3 text-left px-3 py-3 rounded-xl border transition-colors ${on ? 'border-maroon-300 bg-amber-50/60 ring-1 ring-maroon-100' : 'border-gray-100 hover:border-maroon-200'}`}>
                  <div className={`w-9 h-9 rounded-full grid place-items-center shrink-0 ${r.code === 'ADMINISTRATOR' ? 'bg-amber-100 text-amber-700' : 'bg-violet-50 text-violet-600'}`}><Icon size={17} /></div>
                  <div className="flex-1 min-w-0"><div className="font-semibold text-gray-800 text-[0.84375rem]">{r.name}</div><div className="text-[0.71875rem] text-gray-400 truncate">{r.description}</div></div>
                  <Pill tone={r.active ? 'green' : 'red'}>{r.active ? 'Active' : 'Inactive'}</Pill>
                  <ChevronRight size={15} className="text-gray-300 shrink-0" />
                </button>
              )
            })}
          </div>
          <div className="text-[0.75rem] text-gray-400 mt-3">Showing 1 to {filtered.length} of {roles.length} roles</div>
        </div>

        {/* Role Details */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 h-max">
          <h3 className="font-serif text-lg font-bold text-maroon-800 mb-4"><T>Role Details</T></h3>
          {sel && (
            <>
              <div className="bg-amber-50/60 border border-amber-100 rounded-xl px-4 py-3.5 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-amber-100 text-amber-700 grid place-items-center shrink-0">{sel.code === 'ADMINISTRATOR' ? <Crown size={20} /> : <UsersIcon size={20} />}</div>
                <div className="flex-1"><div className="flex items-center gap-2"><span className="font-bold text-gray-800">{sel.name}</span><Pill tone={sel.active ? 'green' : 'red'}>{sel.active ? 'Active' : 'Inactive'}</Pill></div>
                  <div className="text-[0.75rem] text-gray-500">{sel.description}</div></div>
              </div>
              <dl className="mt-4 space-y-3 text-[0.8125rem]">
                <Row label="Role Code" value={<span className="font-mono text-gray-700">{sel.code}</span>} />
                <div className="grid grid-cols-2 gap-3"><Row label="Created On" value={sel.created_at} /><Row label="Created By" value={sel.created_by} /></div>
                <div className="grid grid-cols-2 gap-3"><Row label="Last Updated On" value={sel.updated_at} /><Row label="Last Updated By" value={sel.updated_by} /></div>
              </dl>
              <div className="mt-4"><div className="text-[0.6875rem] text-gray-400 mb-1"><T>Role Description</T></div><div className="text-[0.8125rem] text-gray-600 leading-relaxed">{sel.description}</div></div>

              <div className="mt-5 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2"><span className="font-bold text-gray-700 text-[0.84375rem]">Assigned Users ({sel.users?.length || 0})</span><Link to="/admin/users" className="text-[0.75rem] font-semibold text-maroon-600 underline"><T>View All</T></Link></div>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[0.65625rem] uppercase tracking-wide text-gray-400"><th className="py-1.5 pr-2">#</th><th className="py-1.5 pr-2"><T>User Name</T></th><th className="py-1.5 pr-2"><T>Email / Mobile</T></th><th className="py-1.5"><T>Status</T></th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {(sel.users || []).slice(0, 6).map((u, i) => (
                      <tr key={u.id}><td className="py-2 pr-2 text-gray-400">{i + 1}</td><td className="py-2 pr-2 font-medium text-gray-800">{u.name}</td><td className="py-2 pr-2 text-gray-500 text-[0.75rem]">{u.email}</td><td className="py-2"><span className={`text-[0.75rem] font-semibold ${u.status === 'Active' ? 'text-emerald-600' : 'text-red-500'}`}>{u.status}</span></td></tr>
                    ))}
                    {(!sel.users || sel.users.length === 0) && <tr><td colSpan={4} className="py-4 text-center text-gray-400 text-[0.8125rem]"><T>No users assigned.</T></td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Module Access */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 h-max flex flex-col">
          <div className="flex items-start justify-between">
            <div><h3 className="font-serif text-lg font-bold text-maroon-800"><T>Module Access</T></h3><p className="text-[0.78125rem] text-gray-500 mt-0.5"><T>Configure module level access for this role.</T></p></div>
            <div className="flex items-center gap-3 text-[0.75rem]"><span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={14} />{' '}<T>Allowed</T></span><span className="flex items-center gap-1 text-red-500"><XCircle size={14} />{' '}<T>Denied</T></span></div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[0.65625rem] uppercase tracking-wide text-gray-400 border-b border-gray-100"><th className="py-2 pr-2"><T>Modules</T></th><th className="py-2 px-2 text-center"><T>Access</T></th><th className="py-2 pl-2"><T>Description</T></th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {catalog.map((m) => {
                  const Icon = MOD_ICON[m.key] || LayoutDashboard; const allowed = mods.includes(m.key)
                  return (
                    <tr key={m.key}>
                      <td className="py-2.5 pr-2"><span className="flex items-center gap-2 text-[0.8125rem] font-medium text-gray-700"><Icon size={16} className="text-gray-400" /> {m.label}</span></td>
                      <td className="py-2.5 px-2 text-center">
                        <button type="button" disabled={!isAdmin} onClick={() => toggle(m.key)} className={`relative w-10 h-5.5 rounded-full transition-colors inline-flex items-center ${allowed ? 'bg-emerald-500' : 'bg-gray-300'} ${!isAdmin ? 'opacity-60' : ''}`} style={{ height: 22 }}>
                          <span className={`absolute top-0.5 w-[1.125rem] h-[1.125rem] rounded-full bg-white shadow transition-all ${allowed ? 'left-[1.25rem]' : 'left-0.5'}`} />
                        </button>
                      </td>
                      <td className="py-2.5 pl-2 text-[0.75rem] text-gray-500">{m.description}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-start gap-2 text-[0.75rem] text-gray-600 bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2.5"><Info size={14} className="text-amber-600 shrink-0 mt-0.5" />{' '}<T>Changes in module access will be applied for users the next time they login.</T></div>
          {saved && <div className="mt-3 text-[0.8125rem] text-emerald-700 flex items-center gap-2"><CheckCircle2 size={15} />{' '}<T>Module access saved.</T></div>}
          {isAdmin && (
            <div className="flex gap-3 justify-end mt-5 pt-4 border-t border-gray-100">
              <button onClick={() => setMods(sel?.modules || [])} className="btn-outline"><X size={15} />{' '}<T>Cancel</T></button>
              <button onClick={save} disabled={!dirty} className="btn-maroon disabled:opacity-50"><Save size={15} />{' '}<T>Save Changes</T></button>
            </div>
          )}
        </div>
      </div>

      {creating && (
        <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={() => setCreating(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={createRole} className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-xl font-bold text-maroon-800"><T>Add New Role</T></h3>
              <button type="button" onClick={() => setCreating(null)} className="text-gray-400 hover:text-maroon-700"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label"><T>Role Name *</T></label>
                <input autoFocus required className="input" value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} placeholder={tr("e.g. Temple Manager")} />
              </div>
              <div>
                <label className="label"><T>Description</T></label>
                <input className="input" value={creating.description} onChange={(e) => setCreating({ ...creating, description: e.target.value })} placeholder={tr("Short description of the role")} />
              </div>
              <p className="text-[0.75rem] text-gray-500 flex items-start gap-2"><Info size={14} className="text-amber-600 shrink-0 mt-0.5" />{' '}<T>The role is created with no module access. Select it and toggle modules, then Save Changes.</T></p>
              {createErr && <p className="text-[0.8125rem] text-red-600">{createErr}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setCreating(null)} className="btn-outline"><T>Cancel</T></button>
              <button className="btn-maroon"><Plus size={15} />{' '}<T>Create Role</T></button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return <div><dt className="text-[0.6875rem] text-gray-400">{label}</dt><dd className="text-[0.8125rem] text-gray-800 font-medium mt-0.5">{value || '—'}</dd></div>
}
