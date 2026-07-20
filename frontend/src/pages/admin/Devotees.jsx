import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, X, Eye, Search, RotateCcw, Phone, Mail, Printer, ChevronRight,
  Users, CalendarPlus, HeartHandshake, HandHeart,
  Flame, UtensilsCrossed, Gavel,
} from 'lucide-react'
import { PageTitle, StatTile, Pill, Pager, inr, num, fmtDate, fmtStamp } from '../../components/admin/ui.jsx'
import { TableStates, LOAD_ERROR } from '../../components/common/states.jsx'
import { DevoteesAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'

const EMPTY = { name: '', mobile: '', email: '', city: '', gothram: '', nakshatram: '', address: '', preferred_language: 'English', dob: '', status: 'Active', notes: '' }
const PAGE_SIZE = 20
const PLAN_TONE = { Daily: 'blue', Monthly: 'green', 'One-Time': 'violet', 'Life Long': 'orange', 'Full Month': 'violet' }
const STATUS_TONE = { Confirmed: 'green', Completed: 'green', Pending: 'amber', Cancelled: 'red', Ongoing: 'amber', Live: 'green', Closed: 'gray' }

const TABS = ['Overview', 'Pooja History', 'Donation History', 'Other Activities']

export default function Devotees() {
  const { user } = useAuth()
  const canWrite = user?.role !== 'Accountant'
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState(null)
  const [modal, setModal] = useState(null)
  const [detail, setDetail] = useState(null)
  const [tab, setTab] = useState('Overview')

  const [q, setQ] = useState('')
  const [city, setCity] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('')
    try {
      const [s, list] = await Promise.all([
        DevoteesAPI.stats().catch(() => null),
        DevoteesAPI.list({ q, city, status, page, size: PAGE_SIZE }),
      ])
      if (s) setStats(s)
      setRows(Array.isArray(list?.items) ? list.items : [])
      setTotal(list?.total ?? 0)
    } catch (ex) {
      setLoadErr(ex?.detail || LOAD_ERROR); setRows([]); setTotal(0)
    } finally { setLoading(false) }
  }, [q, city, status, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  // Reset to the first page whenever the search / filters change.
  useEffect(() => { setPage(1) }, [q, city, status])

  const [allCities, setAllCities] = useState([])
  useEffect(() => { DevoteesAPI.list({ size: 500 }).then((r) => setAllCities([...new Set((r?.items || []).map((d) => d.city).filter(Boolean))].sort())).catch(() => {}) }, [])

  async function save(e) {
    e.preventDefault()
    if (modal.mode === 'create') await DevoteesAPI.create(modal.data)
    else await DevoteesAPI.update(modal.data.id, modal.data)
    setModal(null); load()
  }
  function openDetail(id) { setTab('Overview'); DevoteesAPI.detail(id).then(setDetail) }

  return (
    <div>
      <PageTitle title="Devotee Management" subtitle="Maintain devotee master and view their activity history across temple services."
        actions={canWrite && <button onClick={() => setModal({ mode: 'create', data: { ...EMPTY } })} className="btn-maroon !py-2.5"><Plus size={16} /> Add New Devotee</button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={Users} color="#ea580c" bg="bg-orange-50" title="Total Devotees"
          value={stats ? num(stats.total) : '—'} sub="All registered devotees" />
        <StatTile icon={CalendarPlus} color="#059669" bg="bg-emerald-50" title="Recent Registrations"
          value={stats ? num(stats.recent_registrations) : '—'} sub="Registered in last 30 days" />
        <StatTile icon={HeartHandshake} color="#7c3aed" bg="bg-violet-50" title="Devotees with Donations"
          value={stats ? num(stats.with_donations) : '—'} sub="Devotees who donated" />
        <StatTile icon={HandHeart} color="#2563eb" bg="bg-blue-50" title="Total Annadanam Beneficiaries"
          value={stats ? num(stats.annadanam_beneficiaries) : '—'} sub="Through devotee sponsorships" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Search by Devotee Name / Mobile Number</label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or mobile number…" className="input !pl-9" /></div>
          </div>
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">City / Location</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="input"><option value="">All Cities</option>{allCities.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input"><option value="">All Status</option><option>Active</option><option>Inactive</option></select>
          </div>
          <div className="md:col-span-3 flex gap-2 justify-end">
            <button onClick={() => { setQ(''); setCity(''); setStatus('') }} className="btn-outline !py-2.5"><RotateCcw size={14} /> Reset</button>
            <button onClick={() => load()} className="btn-maroon !py-2.5"><Search size={14} /> Search</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[11px] uppercase tracking-wide text-gray-500">
              {['Devotee ID', 'Devotee Name', 'Mobile Number', 'City / Location', 'Registered On', 'Status', 'Actions'].map((c) => <th key={c} className="px-4 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3.5 font-mono text-[12px] text-gray-500">{d.code}</td>
                  <td className="px-4 py-3.5 font-semibold text-gray-800">{d.name}</td>
                  <td className="px-4 py-3.5 text-gray-600">{d.mobile}</td>
                  <td className="px-4 py-3.5 text-gray-600">{d.city || '—'}</td>
                  <td className="px-4 py-3.5 text-gray-500 text-[13px]">{fmtDate(d.registered_on)}</td>
                  <td className="px-4 py-3.5"><Pill tone={d.status === 'Active' ? 'green' : 'gray'}>{d.status}</Pill></td>
                  <td className="px-4 py-3.5">
                    <button onClick={() => openDetail(d.id)} title="View details" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <TableStates colSpan={7} loading={loading} error={loadErr} onRetry={load} empty="No devotees found." />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={PAGE_SIZE} total={total} onPage={setPage} unit="devotees" />
        </div>
      </div>

      {detail && <DevoteeDrawer d={detail} tab={tab} setTab={setTab} onClose={() => setDetail(null)} />}

      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={() => setModal(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-xl font-bold text-maroon-800">{modal.mode === 'create' ? 'Add New Devotee' : 'Edit Devotee'}</h3>
              <button type="button" onClick={() => setModal(null)} className="text-gray-400 hover:text-maroon-700"><X size={18} /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {[['name', 'Full Name *', true], ['mobile', 'Mobile *', true], ['email', 'Email', false], ['city', 'City', false], ['gothram', 'Gothram', false], ['nakshatram', 'Nakshatram', false]].map(([k, label, req]) => (
                <div key={k}>
                  <label className="label">{label}</label>
                  <input required={req} className="input" value={modal.data[k] || ''} onChange={(e) => setModal({ ...modal, data: { ...modal.data, [k]: e.target.value } })} />
                </div>
              ))}
              <div><label className="label">Date of Birth</label>
                <input type="date" className="input" value={modal.data.dob || ''} onChange={(e) => setModal({ ...modal, data: { ...modal.data, dob: e.target.value } })} />
              </div>
              <div><label className="label">Status</label>
                <select className="input" value={modal.data.status || 'Active'} onChange={(e) => setModal({ ...modal, data: { ...modal.data, status: e.target.value } })}><option>Active</option><option>Inactive</option></select>
              </div>
              <div className="sm:col-span-2"><label className="label">Address</label><input className="input" value={modal.data.address || ''} onChange={(e) => setModal({ ...modal, data: { ...modal.data, address: e.target.value } })} /></div>
              <div><label className="label">Preferred Language</label>
                <select className="input" value={modal.data.preferred_language || 'English'} onChange={(e) => setModal({ ...modal, data: { ...modal.data, preferred_language: e.target.value } })}><option>English</option><option>Telugu</option></select>
              </div>
              <div className="sm:col-span-2"><label className="label">Notes</label>
                <textarea rows={3} className="input" value={modal.data.notes || ''} onChange={(e) => setModal({ ...modal, data: { ...modal.data, notes: e.target.value } })} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setModal(null)} className="btn-outline">Cancel</button>
              <button className="btn-maroon">{modal.mode === 'create' ? 'Create Devotee' : 'Save Changes'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function DevoteeDrawer({ d, tab, setTab, onClose }) {
  const dev = d.devotee
  const initials = (dev.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  const recent = useMemo(() => {
    const items = [
      ...d.bookings.map((b) => ({ icon: Flame, tone: 'bg-blue-50 text-blue-600', title: 'Pooja Booking', sub: `${b.pooja}${b.plan ? ` (${b.plan})` : ''}`, date: b.scheduled_date || b.booked_on, amount: b.amount })),
      ...d.donations.map((x) => ({ icon: HandHeart, tone: 'bg-emerald-50 text-emerald-600', title: 'Donation', sub: x.fund, date: x.date, amount: x.amount })),
      ...d.annadanam.map((a) => ({ icon: UtensilsCrossed, tone: 'bg-orange-50 text-orange-600', title: 'Annadanam Sponsorship', sub: `${a.plates} Beneficiaries`, date: a.date, amount: a.amount })),
      ...d.auction.map((a) => ({ icon: Gavel, tone: 'bg-violet-50 text-violet-600', title: 'Auction Purchase', sub: a.item, date: a.date, amount: a.amount })),
    ].filter((x) => x.date)
    items.sort((a, b) => new Date(b.date) - new Date(a.date))
    return items.slice(0, 6)
  }, [d])

  const SUMMARY = [
    { icon: Flame, tone: 'bg-orange-50 text-orange-600', label: 'Pooja Bookings', value: num(d.stats.bookings.count) },
    { icon: HandHeart, tone: 'bg-emerald-50 text-emerald-600', label: 'Donations', value: inr(d.stats.donations.amount) },
    { icon: UtensilsCrossed, tone: 'bg-amber-50 text-amber-600', label: 'Annadanam', value: num(d.stats.annadanam.persons), sub: 'Beneficiaries' },
    { icon: Gavel, tone: 'bg-violet-50 text-violet-600', label: 'Auction Purchases', value: num(d.stats.auction.count) },
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
          <div><h3 className="font-serif text-xl font-bold text-maroon-800">Devotee Details</h3>
            <p className="text-[13px] text-gray-500 mt-0.5">View devotee profile and activity history.</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 flex-1">
          {/* Identity */}
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-amber-50 grid place-items-center text-amber-700 text-xl font-bold shrink-0">{initials}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap"><span className="font-bold text-lg text-gray-800">{dev.name}</span>
                <Pill tone={dev.status === 'Active' ? 'green' : 'gray'}>{dev.status}</Pill></div>
              <div className="mt-1.5 space-y-1 text-[13px] text-gray-600">
                <div className="flex items-center gap-2"><Phone size={13} className="text-maroon-500" /> {dev.mobile}</div>
                {dev.email && <div className="flex items-center gap-2"><Mail size={13} className="text-maroon-500" /> {dev.email}</div>}
              </div>
            </div>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 mt-5 pt-5 border-t border-gray-100">
            <Meta label="Devotee ID" value={dev.code} />
            <Meta label="City / Location" value={dev.city || '—'} />
            <Meta label="Address" value={dev.address || '—'} wide />
            <Meta label="Email" value={dev.email || '—'} />
            <Meta label="Registered On" value={fmtDate(dev.registered_on)} />
            <Meta label="Status" value={<Pill tone={dev.status === 'Active' ? 'green' : 'gray'}>{dev.status}</Pill>} />
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-5 mt-5 border-b border-gray-100 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`pb-2.5 text-[13px] font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === t ? 'border-maroon-600 text-maroon-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>{t}</button>
            ))}
          </div>

          {tab === 'Overview' && (
            <div className="mt-5">
              <div className="text-[13px] font-bold text-gray-700 mb-3">Activity Summary</div>
              <div className="grid grid-cols-4 gap-3">
                {SUMMARY.map((s) => {
                  const Icon = s.icon
                  return (
                    <div key={s.label} className="border border-gray-100 rounded-xl p-3 text-center">
                      <div className={`w-9 h-9 rounded-full grid place-items-center mx-auto ${s.tone}`}><Icon size={16} /></div>
                      <div className="text-[9.5px] uppercase tracking-wide text-gray-400 font-semibold mt-2 leading-tight">{s.label}</div>
                      <div className="text-[15px] font-extrabold text-gray-800 mt-1 leading-none">{s.value}</div>
                      {s.sub && <div className="text-[9px] text-gray-400 mt-0.5">{s.sub}</div>}
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between mt-6 mb-2">
                <div className="text-[13px] font-bold text-gray-700">Recent Activities</div>
                <Link to={`/admin/devotees/${dev.id}`} className="text-[12px] font-semibold text-maroon-600 hover:underline">View full profile →</Link>
              </div>
              <div className="divide-y divide-gray-100">
                {recent.map((r, i) => {
                  const Icon = r.icon
                  return (
                    <div key={i} className="flex items-center gap-3 py-2.5">
                      <div className={`w-8 h-8 rounded-full grid place-items-center shrink-0 ${r.tone}`}><Icon size={15} /></div>
                      <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold text-gray-800 leading-tight">{r.title}</div><div className="text-[11.5px] text-gray-400 truncate">{r.sub}</div></div>
                      <div className="text-right shrink-0"><div className="text-[12px] text-gray-500 whitespace-nowrap">{fmtDate(r.date)}</div><div className="text-[12.5px] font-bold text-gray-700">{inr(r.amount)}</div></div>
                      <ChevronRight size={15} className="text-gray-300 shrink-0" />
                    </div>
                  )
                })}
                {recent.length === 0 && <div className="py-8 text-center text-gray-400 text-sm">No recent activities.</div>}
              </div>
            </div>
          )}

          {tab === 'Pooja History' && (
            <DrawerTable cols={['Booking ID', 'Pooja', 'Plan', 'Date', 'Amount', 'Status']} empty="No pooja bookings.">
              {d.bookings.map((b) => (
                <tr key={b.booking_code} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-gray-500">{b.booking_code}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{b.pooja}</td>
                  <td className="px-3 py-2.5"><Pill tone={PLAN_TONE[b.plan] || 'gray'}>{b.plan || '—'}</Pill></td>
                  <td className="px-3 py-2.5 text-gray-500 text-[12px]">{fmtDate(b.scheduled_date)}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{inr(b.amount)}</td>
                  <td className="px-3 py-2.5"><Pill tone={STATUS_TONE[b.status] || 'gray'}>{b.status}</Pill></td>
                </tr>
              ))}
            </DrawerTable>
          )}

          {tab === 'Donation History' && (
            <DrawerTable cols={['Receipt', 'Category', 'Type', 'Amount', 'Date']} empty="No donations.">
              {d.donations.map((x) => (
                <tr key={x.receipt_no} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-maroon-600">{x.receipt_no}</td>
                  <td className="px-3 py-2.5 text-gray-700">{x.fund}</td>
                  <td className="px-3 py-2.5 text-gray-500">{x.type}</td>
                  <td className="px-3 py-2.5 font-semibold text-emerald-700">{inr(x.amount)}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-[12px]">{fmtDate(x.date)}</td>
                </tr>
              ))}
            </DrawerTable>
          )}

          {tab === 'Other Activities' && (
            <DrawerTable cols={['Type', 'Detail', 'Amount', 'Date']} empty="No other activities.">
              {[...d.annadanam.map((a) => ({ k: 'an' + a.code, type: 'Annadanam', detail: `${a.plates} Beneficiaries · ${a.occasion || ''}`, amount: a.amount, date: a.date })),
                ...d.auction.map((a) => ({ k: 'au' + a.code, type: 'Auction', detail: a.item, amount: a.amount, date: a.date }))].map((r) => (
                <tr key={r.k} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{r.type}</td>
                  <td className="px-3 py-2.5 text-gray-600">{r.detail}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{inr(r.amount)}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-[12px]">{fmtDate(r.date)}</td>
                </tr>
              ))}
            </DrawerTable>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
          <button onClick={() => window.print()} className="btn-outline flex-1 justify-center"><Printer size={15} /> Print Devotee Summary</button>
          <button onClick={onClose} className="btn-maroon flex-1 justify-center">Close</button>
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value, wide }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[11px] text-gray-400 mb-0.5">{label}</div>
      <div className="text-[13px] text-gray-800 font-medium">{value ?? '—'}</div>
    </div>
  )
}
function DrawerTable({ cols, children, empty }) {
  const body = React.Children.toArray(children)
  return (
    <div className="mt-5 border border-gray-100 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className="bg-gray-50/70 text-left text-[10.5px] uppercase tracking-wide text-gray-500">{cols.map((c) => <th key={c} className="px-3 py-2.5 font-semibold whitespace-nowrap">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">{body.length ? body : <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-gray-400">{empty}</td></tr>}</tbody>
      </table>
    </div>
  )
}
