import React, { useEffect, useState, useCallback } from 'react'
import {
  Plus, Pencil, X, Save, RotateCcw, Search, Clock, Info, CalendarDays, List,
  CalendarCheck, UserCheck, CalendarClock, UserX,
} from 'lucide-react'
import { PageTitle, Pill, num } from '../../components/admin/ui.jsx'
import { SchedulesAPI, PoojasAPI, PoojarisAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Select, DateField } from '../../components/common/Field.jsx'

const PLAN_TONE = { Daily: 'blue', Monthly: 'green', 'Life Long': 'amber', 'One-Time': 'violet' }
const STATUS_TONE = { Scheduled: 'green', 'In Progress': 'blue', Completed: 'gray', Cancelled: 'red' }
const planTone = (n) => PLAN_TONE[n] || (/\d+-Day/.test(n || '') ? 'violet' : 'gray')
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const weekday = (s) => (s ? new Date(s).toLocaleDateString('en-US', { weekday: 'short' }) : '')

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

const emptyForm = () => ({ pooja_id: '', plan_id: '', poojari_id: '', schedule_type: 'One-Time', schedule_date: new Date().toISOString().slice(0, 10), start_time: '07:30 AM', end_time: '08:30 AM', notes: '', status: 'Scheduled' })

export default function PoojariSchedule() {
  const { user } = useAuth()
  const canWrite = user?.role !== 'Accountant'
  const [tab, setTab] = useState('list')
  const [stats, setStats] = useState(null)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [poojas, setPoojas] = useState([])
  const [poojaris, setPoojaris] = useState([])
  const [q, setQ] = useState(''); const [pooja, setPooja] = useState(''); const [poojari, setPoojari] = useState('')
  const [status, setStatus] = useState(''); const [start, setStart] = useState(''); const [end, setEnd] = useState('')
  const [page, setPage] = useState(1)
  const [applied, setApplied] = useState({})
  const [drawer, setDrawer] = useState(null)
  const SIZE = 8

  const loadStats = useCallback(() => SchedulesAPI.stats().then(setStats).catch(() => {}), [])
  const loadList = useCallback(async (f, pg) => {
    const d = await SchedulesAPI.list({ ...f, page: pg, size: SIZE })
    setRows(d.items); setTotal(d.total)
  }, [])
  useEffect(() => {
    loadStats()
    PoojasAPI.admin().then((d) => setPoojas(d.items)).catch(() => {})
    PoojarisAPI.list().then(setPoojaris).catch(() => {})
  }, [loadStats])
  useEffect(() => { loadList(applied, page) }, [applied, page, loadList])

  const search = () => { setPage(1); setApplied({ q, pooja, poojari, status, start, end }) }
  const clear = () => { setQ(''); setPooja(''); setPoojari(''); setStatus(''); setStart(''); setEnd(''); setPage(1); setApplied({}) }
  const pageCount = Math.max(1, Math.ceil(total / SIZE))

  async function save(e) {
    e.preventDefault()
    const d = drawer.data
    await SchedulesAPI.create({
      pooja_id: d.pooja_id ? Number(d.pooja_id) : null, plan_id: d.plan_id ? Number(d.plan_id) : null,
      poojari_id: d.poojari_id ? Number(d.poojari_id) : null, schedule_type: d.schedule_type,
      schedule_date: d.schedule_date || null, start_time: d.start_time, end_time: d.end_time, notes: d.notes,
    })
    setDrawer(null); loadList(applied, page); loadStats()
  }

  const selectedPooja = poojas.find((p) => String(p.id) === String(drawer?.data.pooja_id))
  const planOptions = selectedPooja?.plans || []
  const uniquePoojaNames = [...new Set(poojas.map((p) => p.name))]

  return (
    <div>
      <PageTitle title="Poojari Schedule" subtitle="Manage and view poojari assignments for scheduled temple poojas."
        actions={canWrite && <button onClick={() => setDrawer({ data: emptyForm() })} className="btn-maroon !py-2.5"><Plus size={16} /> Assign Schedule</button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={CalendarCheck} color="#ea580c" bg="bg-orange-50" title="Today's Schedules" value={stats ? num(stats.today) : '—'} sub="Poojas scheduled today" />
        <StatTile icon={UserCheck} color="#059669" bg="bg-emerald-50" title="Assigned Poojaris" value={stats ? num(stats.assigned_poojaris) : '—'} sub="Poojaris with active schedules" />
        <StatTile icon={CalendarClock} color="#d97706" bg="bg-amber-50" title="Upcoming Schedules" value={stats ? num(stats.upcoming) : '—'} sub="Next 7 days schedules" />
        <StatTile icon={UserX} color="#7c3aed" bg="bg-violet-50" title="Unassigned Schedules" value={stats ? num(stats.unassigned) : '—'} sub="Require poojari assignment" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-6 px-5 border-b border-gray-100">
          {[['list', 'List View', List], ['calendar', 'Calendar View', CalendarDays]].map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-2 py-3.5 text-[0.84375rem] font-semibold border-b-2 -mb-px ${tab === k ? 'border-maroon-600 text-maroon-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {tab === 'list' ? (
          <>
            <div className="px-5 py-5">
              <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-4">
                <div><label className="block text-[0.75rem] text-gray-500 mb-1.5">Search by Poojari or Pooja Name</label>
                  <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Search…" className="input !pl-9" /></div></div>
                <div className="sm:col-span-2"><label className="block text-[0.75rem] text-gray-500 mb-1.5">Date Range</label>
                  <div className="flex items-center gap-1"><DateField value={start} onChange={(e) => setStart(e.target.value)} className="input !px-2 !text-[0.75rem]" /><span className="text-gray-300">–</span><DateField value={end} onChange={(e) => setEnd(e.target.value)} className="input !px-2 !text-[0.75rem]" /></div></div>
                <div><label className="block text-[0.75rem] text-gray-500 mb-1.5">Pooja</label>
                  <Select value={pooja} onChange={(e) => setPooja(e.target.value)} className="input"><option value="">All Poojas</option>{uniquePoojaNames.map((n) => <option key={n}>{n}</option>)}</Select></div>
                <div><label className="block text-[0.75rem] text-gray-500 mb-1.5">Poojari</label>
                  <Select value={poojari} onChange={(e) => setPoojari(e.target.value)} className="input"><option value="">All Poojaris</option>{poojaris.map((p) => <option key={p.id}>{p.name}</option>)}</Select></div>
                <div><label className="block text-[0.75rem] text-gray-500 mb-1.5">Schedule Status</label>
                  <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input"><option value="">All Status</option><option>Scheduled</option><option>In Progress</option><option>Completed</option></Select></div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={clear} className="btn-outline !py-2"><RotateCcw size={14} /> Clear</button>
                <button onClick={search} className="btn-maroon !py-2"><Search size={14} /> Search</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
                  {['Schedule ID', 'Poojari Name', 'Pooja Name', 'Plan', 'Schedule Date', 'Time', 'Execution Frequency', 'Status', 'Actions'].map((c) => <th key={c} className="px-5 py-3 font-semibold whitespace-nowrap">{c}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/60">
                      <td className="px-5 py-3.5 font-mono text-[0.75rem] text-gray-500">{s.code}</td>
                      <td className="px-5 py-3.5 font-semibold text-gray-800">{s.poojari_name || <span className="text-amber-600 font-normal">Unassigned</span>}</td>
                      <td className="px-5 py-3.5 text-gray-700">{s.pooja_name}</td>
                      <td className="px-5 py-3.5"><Pill tone={planTone(s.plan_name)}>{s.plan_name || '—'}</Pill></td>
                      <td className="px-5 py-3.5 text-[0.8125rem] text-gray-600 whitespace-nowrap">{fmtDate(s.schedule_date)}<span className="block text-[0.6875rem] text-gray-400">{weekday(s.schedule_date)}</span></td>
                      <td className="px-5 py-3.5 text-[0.8125rem] text-gray-600 whitespace-nowrap">{s.start_time} –<span className="block">{s.end_time}</span></td>
                      <td className="px-5 py-3.5 text-gray-600 text-[0.8125rem]">{s.execution_frequency}</td>
                      <td className="px-5 py-3.5"><Pill tone={STATUS_TONE[s.status] || 'gray'}>{s.status}</Pill></td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {canWrite && <button onClick={() => setDrawer({ data: { ...emptyForm(), ...s, pooja_id: s.pooja_id || '', plan_id: s.plan_id || '', poojari_id: s.poojari_id || '' }, id: s.id })} title="Edit" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-500 hover:text-maroon-700 hover:border-maroon-300"><Pencil size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={9} className="px-5 py-12 text-center text-gray-400">No schedules found.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[0.8125rem] text-gray-500">Showing {total === 0 ? 0 : (page - 1) * SIZE + 1} to {Math.min(page * SIZE, total)} of {total} schedules</span>
              <div className="flex items-center gap-1.5">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 h-8 rounded-lg border border-gray-200 text-[0.8125rem] text-gray-500 disabled:opacity-40">Previous</button>
                {Array.from({ length: Math.min(pageCount, 4) }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setPage(n)} className={`w-8 h-8 grid place-items-center rounded-lg text-[0.8125rem] font-semibold ${n === page ? 'bg-maroon-700 text-cream' : 'border border-gray-200 text-gray-600'}`}>{n}</button>
                ))}
                <button disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="px-3 h-8 rounded-lg border border-gray-200 text-[0.8125rem] text-gray-500 disabled:opacity-40">Next</button>
              </div>
            </div>
          </>
        ) : (
          <CalendarView rows={rows} />
        )}
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800">{drawer.id ? 'Edit Schedule' : 'Assign Poojari Schedule'}</h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5">Assign poojari to a pooja for specific date and time.</p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>

            <div className="px-6 py-5 space-y-5 flex-1">
              <div className="text-[0.8125rem] font-bold text-maroon-700">1. Assignment Details</div>
              <div><label className="label">Pooja *</label>
                <Select required className="input" value={drawer.data.pooja_id} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, pooja_id: e.target.value, plan_id: '' } })}>
                  <option value="">Select Pooja</option>{poojas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
              <div><label className="label">Plan *</label>
                <Select required className="input" value={drawer.data.plan_id} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, plan_id: e.target.value } })}>
                  <option value="">Select Plan</option>{planOptions.map((pl) => <option key={pl.id} value={pl.id}>{pl.plan_name} - {pl.committee_decided ? 'Committee' : '₹' + num(pl.fee)}</option>)}</Select></div>
              <div><label className="label">Poojari *</label>
                <Select required className="input" value={drawer.data.poojari_id} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, poojari_id: e.target.value } })}>
                  <option value="">Select Poojari</option>{poojaris.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
              <div><label className="label">Schedule Type *</label>
                <div className="flex gap-6 mt-1">
                  {['One-Time', 'Recurring'].map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm text-gray-700"><input type="radio" name="stype" className="accent-maroon-700" checked={drawer.data.schedule_type === t} onChange={() => setDrawer({ ...drawer, data: { ...drawer.data, schedule_type: t } })} /> {t}</label>
                  ))}
                </div></div>
              <div><label className="label">Schedule Date *</label><DateField required className="input" value={drawer.data.schedule_date} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, schedule_date: e.target.value } })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Start Time *</label><div className="relative"><input required className="input !pr-8" value={drawer.data.start_time} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, start_time: e.target.value } })} /><Clock size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" /></div></div>
                <div><label className="label">End Time *</label><div className="relative"><input required className="input !pr-8" value={drawer.data.end_time} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, end_time: e.target.value } })} /><Clock size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" /></div></div>
              </div>

              <div className="text-[0.8125rem] font-bold text-maroon-700 pt-1">2. Additional Information</div>
              <div><label className="label">Notes (Optional)</label><textarea className="input min-h-[4.5rem]" placeholder="Enter any notes or special instructions…" value={drawer.data.notes} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, notes: e.target.value } })} /></div>
              <div className="bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2.5 text-[0.75rem] text-gray-600 flex items-start gap-2"><Info size={15} className="text-amber-500 shrink-0 mt-0.5" /> Selecting a Pooja will load only the plans configured in Pooja Master.</div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center">Cancel</button>
              <button className="btn-maroon flex-1 justify-center"><Save size={15} /> Save Schedule</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function CalendarView({ rows }) {
  const byDate = rows.reduce((acc, s) => { (acc[s.schedule_date] ||= []).push(s); return acc }, {})
  const dates = Object.keys(byDate).sort()
  return (
    <div className="p-5">
      {dates.length === 0 && <div className="text-center text-gray-400 py-12">No schedules for the current filter.</div>}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {dates.map((d) => (
          <div key={d} className="border border-gray-100 rounded-xl p-4">
            <div className="font-semibold text-maroon-700 text-sm mb-3">{fmtDate(d)} <span className="text-gray-400 font-normal">· {weekday(d)}</span></div>
            <div className="space-y-2">
              {byDate[d].map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-[0.8125rem] border-b border-dashed border-gray-100 pb-2">
                  <span className="text-gray-400 text-[0.6875rem] w-16">{s.start_time}</span>
                  <span className="flex-1"><span className="font-semibold text-gray-800">{s.pooja_name}</span><span className="block text-[0.6875rem] text-gray-400">{s.poojari_name || 'Unassigned'}</span></span>
                  <Pill tone={STATUS_TONE[s.status] || 'gray'}>{s.status}</Pill>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
