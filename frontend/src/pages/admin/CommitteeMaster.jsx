import React, { useEffect, useState, useCallback } from 'react'
import { Users, UserCog, ShieldCheck, Pencil, X, IndianRupee, Flame, Search, RotateCcw, Plus, Trash2, Save, ArrowUp, ArrowDown } from 'lucide-react'
import { PageTitle, StatTile, Pill, num, inr } from '../../components/admin/ui.jsx'
import { TableStates, LOAD_ERROR } from '../../components/common/states.jsx'
import { useSortableTable, SortPanel } from '../../components/common/SortableTable.jsx'
import { CommitteeAPI, PoojasAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Select, NumberField, CountryCodeSelect, getCountryDigits } from '../../components/common/Field.jsx'
import { confirmDialog, toast } from '../../components/common/Dialog.jsx'
import { T, tr, personName, useLang } from '../../i18n/LanguageContext.jsx'
import { sanitizeName, sanitizePhone, validateName, validatePhone, validateEmail } from '../../lib/validation.js'

const DESIG_TONE = { Chairman: 'maroon', Secretary: 'blue', Treasurer: 'violet', Member: 'gray' }

// Sortable columns configuration for Members tab
const SORT_COLUMNS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'designation', label: 'Designation', type: 'text' },
  { key: 'active', label: 'Status', type: 'text' },
]

export default function CommitteeMaster() {
  const { user } = useAuth()
  const { lang } = useLang()
  const [tab, setTab] = useState('members')
  const isCommittee = user?.role === 'Committee' || ['Admin', 'Administrator'].includes(user?.role)

  return (
    <div>
      <PageTitle
        title={tr("Committee Member Master")}
        subtitle={tr("Maintain temple committee members and manage festival pooja pricing.")}
      />

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab('members')}
          className={`pb-3 text-[0.875rem] font-semibold border-b-2 -mb-px transition-colors ${
            tab === 'members' ? 'border-maroon-600 text-maroon-700' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <T>Members</T>
        </button>
        {isCommittee && (
          <button
            onClick={() => setTab('pricing')}
            className={`pb-3 text-[0.875rem] font-semibold border-b-2 -mb-px transition-colors ${
              tab === 'pricing' ? 'border-maroon-600 text-maroon-700' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <T>Festival Pricing</T>
          </button>
        )}
      </div>

      {tab === 'members' && <MembersTab />}
      {tab === 'pricing' && isCommittee && <FestivalPricingTab />}
    </div>
  )
}

// ── Members Tab ──────────────────────────────────────────────────────────────
function MembersTab() {
  const { user } = useAuth()
  const { lang } = useLang()
  const canWrite = ['Admin', 'Administrator'].includes(user?.role)

  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [drawer, setDrawer] = useState(null)
  const [err, setErr] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')

  // Sorting
  const { sortedRows, sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection } = useSortableTable(items, SORT_COLUMNS, [{ key: 'name', direction: 'asc' }])

  const load = useCallback(() => {
    setLoading(true); setLoadErr('')
    return Promise.all([CommitteeAPI.list({ q, status }), CommitteeAPI.stats().catch(() => null)])
      .then(([d, s]) => { setItems(d.items || d); if (s) setStats(s) })
      .catch((ex) => { setLoadErr(ex?.detail || LOAD_ERROR); setItems([]) })
      .finally(() => setLoading(false))
  }, [q, status])

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  const empty = { name: '', name_te: '', designation: '', phone: '', email: '', active: true }

  async function save(e) {
    e.preventDefault(); setErr('')
    const errors = {}
    const nameResult = validateName(drawer.data.name)
    if (!nameResult.valid) errors.name = nameResult.error
    if (drawer.data.phone) {
      const phoneResult = validatePhone(drawer.data.phone)
      if (!phoneResult.valid) errors.phone = phoneResult.error
    }
    if (drawer.data.email) {
      const emailResult = validateEmail(drawer.data.email)
      if (!emailResult.valid) errors.email = emailResult.error
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setErr(tr('Please fix the errors above.'))
      return
    }
    setFieldErrors({})
    try {
      if (drawer.mode === 'create') await CommitteeAPI.create(drawer.data)
      else await CommitteeAPI.update(drawer.data.id, drawer.data)
      setDrawer(null); load()
    } catch (ex) { setErr(ex.detail || ex.message || 'Failed to save.') }
  }

  async function remove(row) {
    if (await confirmDialog({ title: tr('Delete this member?'), message: tr('This cannot be undone.'), tone: 'danger', confirmLabel: tr('Delete') })) {
      try { await CommitteeAPI.remove(row.id); toast(tr('Member deleted.')); load() }
      catch (ex) { toast(ex.detail || tr('Failed'), 'error') }
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatTile icon={Users} color="#8a1c1c" bg="bg-maroon-50" title={tr("Total Members")} value={stats ? num(stats.total) : '—'} sub={tr("All committee members")} />
        <StatTile icon={ShieldCheck} color="#059669" bg="bg-emerald-50" title={tr("Active")} value={stats ? num(stats.active) : '—'} sub={tr("Currently serving")} />
        <StatTile icon={UserCog} color="#dc2626" bg="bg-red-50" title={tr("Inactive")} value={stats ? num(stats.inactive) : '—'} sub={tr("Not serving")} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search by name, code or phone…")} className="input !pl-9 w-full" />
          </div>
          <div className="flex items-center gap-2">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-auto">
              <option value="">{tr("All Status")}</option>
              <option value="Active">{tr("Active")}</option>
              <option value="Inactive">{tr("Inactive")}</option>
            </Select>
            {canWrite && (
              <button onClick={() => { setErr(''); setFieldErrors({}); setDrawer({ mode: 'create', data: { ...empty } }) }} className="btn-maroon !py-2.5">
                <Plus size={16} /> <T>Add New Member</T>
              </button>
            )}
          </div>
        </div>
        <SortPanel sorts={sorts} columns={SORT_COLUMNS} onToggle={handleColumnClick} onRemove={removeSort} onClear={clearSorts} />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
                <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Member ID')}</th>
                {['name', 'designation'].map((key) => {
                  const col = SORT_COLUMNS.find(c => c.key === key)
                  const sortIdx = getSortIndex(col.key)
                  const sortDir = getSortDirection(col.key)
                  const isSorted = sortIdx >= 0
                  return (
                    <th key={col.key} onClick={(e) => handleColumnClick(col.key, e)}
                      className={`px-4 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-blue-700 bg-blue-50/50' : ''}`}
                      title={tr("Click to sort, Shift+Click to add secondary sort")}>
                      <span className="inline-flex items-center gap-1">
                        {tr(col.label)}
                        {isSorted && (
                          <span className="inline-flex items-center gap-0.5 text-blue-600">
                            {sorts.length > 1 && <span className="text-[0.5625rem] font-bold">{sortIdx + 1}</span>}
                            {sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                          </span>
                        )}
                      </span>
                    </th>
                  )
                })}
                <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Phone')}</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Email')}</th>
                {(() => {
                  const col = SORT_COLUMNS.find(c => c.key === 'active')
                  const sortIdx = getSortIndex(col.key)
                  const sortDir = getSortDirection(col.key)
                  const isSorted = sortIdx >= 0
                  return (
                    <th onClick={(e) => handleColumnClick(col.key, e)}
                      className={`px-4 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-blue-700 bg-blue-50/50' : ''}`}
                      title={tr("Click to sort, Shift+Click to add secondary sort")}>
                      <span className="inline-flex items-center gap-1">
                        {tr('Status')}
                        {isSorted && (
                          <span className="inline-flex items-center gap-0.5 text-blue-600">
                            {sorts.length > 1 && <span className="text-[0.5625rem] font-bold">{sortIdx + 1}</span>}
                            {sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                          </span>
                        )}
                      </span>
                    </th>
                  )
                })()}
                <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3.5 font-mono text-[0.75rem] text-gray-500">{r.code}</td>
                  <td className="px-4 py-3.5 font-semibold text-gray-800">{personName(r, lang)}</td>
                  <td className="px-4 py-3.5">{r.designation ? <Pill tone={DESIG_TONE[r.designation] || 'gray'}>{r.designation}</Pill> : '—'}</td>
                  <td className="px-4 py-3.5 text-gray-600">{r.phone || '—'}</td>
                  <td className="px-4 py-3.5 text-gray-600">{r.email || '—'}</td>
                  <td className="px-4 py-3.5"><Pill tone={r.active ? 'green' : 'gray'}>{r.active ? tr('Active') : tr('Inactive')}</Pill></td>
                  <td className="px-4 py-3.5">
                    {canWrite && (
                      <div className="flex gap-1">
                        <button onClick={() => { setErr(''); setFieldErrors({}); setDrawer({ mode: 'edit', data: { ...r } }) }} title={tr("Edit")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700 hover:border-maroon-300"><Pencil size={15} /></button>
                        <button onClick={() => remove(r)} title={tr("Delete")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-red-600 hover:border-red-300"><Trash2 size={15} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {sortedRows.length === 0 && <TableStates colSpan={7} loading={loading} error={loadErr} onRetry={load} empty={tr("No committee members found.")} />}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer */}
      {drawer && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setDrawer(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-serif text-xl font-bold text-maroon-800">{drawer.mode === 'create' ? tr('Add New Member') : tr('Edit Member')}</h3>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="flex-1 px-6 py-5 space-y-4">
              <div>
                <label className="label"><T>Full Name</T> *</label>
                <input required className={`input ${fieldErrors.name ? 'border-red-400' : ''}`} placeholder={tr("Full Name")} value={drawer.data.name || ''}
                  onChange={(e) => { setFieldErrors((p) => ({ ...p, name: null })); setDrawer({ ...drawer, data: { ...drawer.data, name: sanitizeName(e.target.value) } }) }} />
                {fieldErrors.name && <div className="text-[0.7rem] text-red-500 mt-0.5">{fieldErrors.name}</div>}
              </div>
              <div>
                <label className="label"><T>Full Name (Telugu)</T></label>
                <input className="input" placeholder={tr("Full Name (Telugu)")} value={drawer.data.name_te || ''} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, name_te: sanitizeName(e.target.value) } })} />
              </div>
              <div>
                <label className="label"><T>Designation</T></label>
                <Select className="input" value={drawer.data.designation || ''} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, designation: e.target.value } })}>
                  <option value="">{tr("Select…")}</option>
                  <option value="Chairman">{tr("Chairman")}</option>
                  <option value="Secretary">{tr("Secretary")}</option>
                  <option value="Treasurer">{tr("Treasurer")}</option>
                  <option value="Member">{tr("Member")}</option>
                </Select>
              </div>
              <div>
                <label className="label"><T>Phone</T></label>
                <div className="flex">
                  <CountryCodeSelect value={drawer.data.country_code || '+91'} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, country_code: e.target.value } })} />
                  <input className={`input flex-1 !rounded-l-none ${fieldErrors.phone ? 'border-red-400' : ''}`} placeholder={tr("Enter Mobile Number")} value={drawer.data.phone || ''}
                    onChange={(e) => { setFieldErrors((p) => ({ ...p, phone: null })); setDrawer({ ...drawer, data: { ...drawer.data, phone: sanitizePhone(e.target.value) } }) }} maxLength={getCountryDigits(drawer.data.country_code || '+91')} />
                </div>
                {fieldErrors.phone && <div className="text-[0.7rem] text-red-500 mt-0.5">{fieldErrors.phone}</div>}
              </div>
              <div>
                <label className="label"><T>Email</T></label>
                <input type="email" className={`input ${fieldErrors.email ? 'border-red-400' : ''}`} placeholder={tr("Enter Email Address")} value={drawer.data.email || ''}
                  onChange={(e) => { setFieldErrors((p) => ({ ...p, email: null })); setDrawer({ ...drawer, data: { ...drawer.data, email: e.target.value } }) }} />
                {fieldErrors.email && <div className="text-[0.7rem] text-red-500 mt-0.5">{fieldErrors.email}</div>}
              </div>
              <div className="flex items-center gap-3">
                <label className="label mb-0"><T>Status</T></label>
                <button type="button" onClick={() => setDrawer({ ...drawer, data: { ...drawer.data, active: !drawer.data.active } })}
                  className={`relative w-10 h-[1.375rem] rounded-full transition-colors ${drawer.data.active ? 'bg-maroon-800' : 'bg-gray-300'}`}>
                  <span className={`absolute top-[0.1875rem] left-[0.1875rem] h-4 w-4 rounded-full bg-white shadow transition-transform ${drawer.data.active ? 'translate-x-[1.125rem]' : ''}`} />
                </button>
                <span className="text-sm text-gray-600">{drawer.data.active ? tr('Active') : tr('Inactive')}</span>
              </div>
            </div>
            {err && <div className="px-6 text-[0.75rem] text-red-600">{err}</div>}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline"><T>Cancel</T></button>
              <button type="submit" className="btn-maroon"><Save size={15} /> <T>Save</T></button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

// ── Festival Pricing Tab ─────────────────────────────────────────────────────
function FestivalPricingTab() {
  const { lang } = useLang()
  const { user } = useAuth()
  const canEdit = user?.role === 'Committee' || ['Admin', 'Administrator'].includes(user?.role)

  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [q, setQ] = useState('')
  const [editPlan, setEditPlan] = useState(null)
  const [editFee, setEditFee] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('')
    try {
      const res = await PoojasAPI.allPlans()
      setPlans(res.items || [])
    } catch (ex) {
      setLoadErr(ex?.detail || LOAD_ERROR)
      setPlans([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = plans.filter((p) => {
    if (!q) return true
    const search = q.toLowerCase()
    return p.pooja_name.toLowerCase().includes(search) || p.plan_name.toLowerCase().includes(search)
  })

  const openEdit = (plan) => {
    setEditPlan(plan)
    setEditFee(plan.fee || 0)
  }

  const saveEdit = async () => {
    if (!editPlan) return
    setSaving(true)
    try {
      await PoojasAPI.updateCommitteeFee(editPlan.id, Number(editFee) || 0)
      toast(tr('Price updated successfully.'))
      setEditPlan(null)
      load()
    } catch (ex) {
      toast(ex?.detail || tr('Failed to update price.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatTile icon={Flame} color="#ea580c" bg="bg-orange-50" title={tr("Total Plans")} value={num(plans.length)} sub={tr("All pooja plans")} />
        <StatTile icon={IndianRupee} color="#059669" bg="bg-emerald-50" title={tr("Fixed Price")} value={num(plans.filter((p) => !p.committee_decided).length)} sub={tr("Pre-defined amounts")} />
        <StatTile icon={Users} color="#7c3aed" bg="bg-violet-50" title={tr("Committee Decided")} value={num(plans.filter((p) => p.committee_decided).length)} sub={tr("Editable by committee")} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div>
            <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Festival & Pooja Pricing</T></h3>
            <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>View all pooja prices. Edit committee-decided prices.</T></p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search pooja or plan…")} className="input !pl-9 w-full" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
                <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Pooja Name')}</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Category')}</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Plan')}</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Amount')}</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Type')}</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3.5 font-semibold text-gray-800">{lang === 'te' && p.pooja_name_te ? p.pooja_name_te : p.pooja_name}</td>
                  <td className="px-4 py-3.5 text-gray-600">{tr(p.category)}</td>
                  <td className="px-4 py-3.5 text-gray-600">{tr(p.plan_name)}</td>
                  <td className="px-4 py-3.5 font-semibold text-gray-800">{inr(p.fee)}</td>
                  <td className="px-4 py-3.5">
                    <Pill tone={p.committee_decided ? 'violet' : 'green'}>
                      {p.committee_decided ? tr('Committee') : tr('Fixed')}
                    </Pill>
                  </td>
                  <td className="px-4 py-3.5">
                    {p.committee_decided && canEdit ? (
                      <button onClick={() => openEdit(p)} title={tr("Edit price")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-maroon-600 hover:bg-maroon-50 hover:border-maroon-300">
                        <Pencil size={15} />
                      </button>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <TableStates colSpan={6} loading={loading} error={loadErr} onRetry={load} empty={tr("No pooja plans found.")} />}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-amber-50/60 text-[0.8125rem] text-gray-600">
          <span className="text-amber-600">ℹ️</span> <T>Only committee-decided prices (marked as "Committee") can be edited here.</T>
        </div>
      </div>

      {/* Edit Modal */}
      {editPlan && (
        <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={() => setEditPlan(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-xl font-bold text-maroon-800"><T>Update Pooja Price</T></h3>
              <button onClick={() => setEditPlan(null)} className="text-gray-400 hover:text-maroon-700"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label"><T>Pooja</T></label>
                <div className="text-[0.9375rem] font-semibold text-gray-800">{editPlan.pooja_name}</div>
              </div>
              <div>
                <label className="label"><T>Plan</T></label>
                <div className="text-[0.9375rem] text-gray-600">{editPlan.plan_name}</div>
              </div>
              <div>
                <label className="label"><T>Amount (₹)</T></label>
                <NumberField
                  prefix="₹"
                  value={editFee}
                  onChange={(e) => setEditFee(e.target.value)}
                  min={0}
                  placeholder="0"
                  className="!text-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditPlan(null)} className="btn-outline"><T>Cancel</T></button>
              <button onClick={saveEdit} disabled={saving} className="btn-maroon disabled:opacity-60">
                {saving ? tr('Saving…') : tr('Update Price')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
