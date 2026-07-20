import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Plus, Phone, Mail, MapPin, Calendar, RotateCw, Layers, Languages,
  Flame, HeartHandshake, UtensilsCrossed, Gavel, Sparkles, FileText, User, X,
} from 'lucide-react'
import { DevoteesAPI } from '../../api/client.js'
import { LoadingBlock, ErrorBlock } from '../../components/common/states.jsx'

const inr = (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN')
const num = (n) => Number(n || 0).toLocaleString('en-IN')
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const fmtStamp = (s) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const PLAN_TONE = { Daily: 'bg-blue-50 text-blue-700', Monthly: 'bg-emerald-50 text-emerald-700', 'One-Time': 'bg-violet-50 text-violet-700' }
const STATUS_TONE = { Confirmed: 'bg-emerald-50 text-emerald-700', Completed: 'bg-emerald-50 text-emerald-700', Pending: 'bg-amber-50 text-amber-700', Cancelled: 'bg-red-50 text-red-700', Live: 'bg-emerald-50 text-emerald-700', Closed: 'bg-gray-100 text-gray-500' }

const STAT_CARDS = [
  { key: 'bookings', label: 'Pooja Bookings', icon: Flame, c: '#2563eb', bg: 'bg-blue-50', main: (s) => num(s.count), foot: (s) => inr(s.amount) },
  { key: 'donations', label: 'Donations', icon: HeartHandshake, c: '#059669', bg: 'bg-emerald-50', main: (s) => num(s.count), foot: (s) => inr(s.amount) },
  { key: 'annadanam', label: 'Annadanam', icon: UtensilsCrossed, c: '#ea580c', bg: 'bg-orange-50', main: (s) => num(s.count), foot: (s) => `${num(s.persons)} persons` },
  { key: 'auction', label: 'Auction Purchases', icon: Gavel, c: '#7c3aed', bg: 'bg-violet-50', main: (s) => num(s.count), foot: (s) => inr(s.amount) },
]

const TABS = [
  { key: 'bookings', label: 'Pooja Bookings', icon: Flame },
  { key: 'donations', label: 'Donations', icon: HeartHandshake },
  { key: 'annadanam', label: 'Annadanam', icon: UtensilsCrossed },
  { key: 'auction', label: 'Auction Purchases', icon: Gavel },
  { key: 'notes', label: 'Notes & Remarks', icon: FileText },
]

function Th({ children }) { return <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wide text-gray-500 font-semibold whitespace-nowrap">{children}</th> }
function Table({ cols, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="bg-gray-50/70">{cols.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  )
}

export default function DevoteeDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const [d, setD] = useState(null)
  const [tab, setTab] = useState('bookings')
  const [edit, setEdit] = useState(null)   // editable copy of the devotee while the modal is open
  const [loadErr, setLoadErr] = useState('')

  const reload = () => {
    setLoadErr('')
    return DevoteesAPI.detail(id).then(setD).catch((ex) => { setD(null); setLoadErr(ex?.detail || "Couldn't load this devotee — check your connection and retry.") })
  }
  useEffect(() => { reload() }, [id])

  if (loadErr) return <ErrorBlock message={loadErr} onRetry={reload} />
  if (!d) return <LoadingBlock />
  const dev = d.devotee

  return (
    <div>
      {/* Breadcrumb + header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="text-[12px] text-gray-400 mb-1"><Link to="/admin" className="hover:text-maroon-600">Home</Link> › <Link to="/admin/devotees" className="hover:text-maroon-600">Devotees</Link> › <span className="text-gray-500">Devotee Details</span></div>
          <h1 className="font-serif text-[26px] font-bold text-maroon-800">Devotee Details</h1>
          <p className="text-sm text-gray-500 mt-0.5">View devotee profile and linked temple activities.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => nav('/admin/devotees')} className="btn-outline !py-2.5"><ArrowLeft size={15} /> Back to Devotees</button>
          <Link to="/admin/bookings/new" className="btn-maroon !py-2.5"><Plus size={15} /> New Booking</Link>
        </div>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5 relative">
        <button onClick={() => setEdit({ ...dev })} className="absolute top-4 right-4 flex items-center gap-1.5 text-[13px] font-semibold text-maroon-700 border border-maroon-200 rounded-lg px-3 py-1.5 hover:bg-maroon-50"><Pencil size={14} /> Edit Devotee</button>
        <div className="grid lg:grid-cols-[1.4fr_1fr_1.2fr] gap-6">
          {/* identity */}
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 rounded-full bg-gray-100 grid place-items-center text-gray-400 shrink-0"><User size={40} /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xl text-gray-800">{dev.name}</span>
                <span className="text-[11px] font-mono font-semibold text-blue-700 bg-blue-50 rounded px-2 py-0.5">{dev.code}</span>
              </div>
              <div className="mt-2 space-y-1 text-[13px] text-gray-600">
                <div className="flex items-center gap-2"><Phone size={13} className="text-maroon-500" /> {dev.mobile}</div>
                {dev.email && <div className="flex items-center gap-2"><Mail size={13} className="text-maroon-500" /> {dev.email}</div>}
                <div className="flex items-center gap-2"><MapPin size={13} className="text-maroon-500" /> {dev.city || '—'}</div>
              </div>
            </div>
          </div>
          {/* meta */}
          <div className="space-y-3 lg:border-l lg:border-gray-100 lg:pl-6">
            <Meta icon={Calendar} label="Registered On" value={fmtStamp(dev.registered_on)} />
            <Meta icon={RotateCw} label="Last Activity" value={fmtDate(dev.last_visit)} badge="Pooja Booking" />
            <Meta icon={Layers} label="Total Transactions" value={num(dev.total_transactions)} />
          </div>
          {/* address + language */}
          <div className="space-y-3 lg:border-l lg:border-gray-100 lg:pl-6">
            <Meta icon={MapPin} label="Address" value={dev.address || '—'} multiline />
            <Meta icon={Languages} label="Preferred Language" value={dev.preferred_language} />
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {STAT_CARDS.map((c) => {
          const Icon = c.icon; const s = d.stats[c.key]
          return (
            <div key={c.key} onClick={() => setTab(c.key)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab(c.key) } }}
              className={`bg-white rounded-xl border shadow-sm p-5 cursor-pointer transition hover:shadow-md ${tab === c.key ? 'border-maroon-300 ring-1 ring-maroon-200' : 'border-gray-100 hover:border-maroon-200'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-full grid place-items-center shrink-0 ${c.bg}`} style={{ color: c.c }}><Icon size={22} /></div>
                <div>
                  <div className="text-[13px] text-gray-500">{c.label}</div>
                  <div className="text-2xl font-extrabold text-gray-800 leading-none mt-1">{c.main(s)}</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-[12px] text-gray-400">{c.key === 'annadanam' ? 'Total Persons Sponsored' : c.key === 'bookings' ? 'Total Bookings' : c.key === 'donations' ? 'Total Donations' : 'Total Purchases'} <span className="font-semibold text-gray-700">{c.foot(s)}</span></div>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-1 px-3 border-b border-gray-100 overflow-x-auto">
          {TABS.map((tb) => {
            const Icon = tb.icon; const on = tab === tb.key
            const count = tb.key === 'notes' ? null : d[tb.key]?.length
            return (
              <button key={tb.key} onClick={() => setTab(tb.key)}
                className={`flex items-center gap-2 px-4 py-3.5 text-[13.5px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${on ? 'border-maroon-600 text-maroon-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Icon size={15} /> {tb.label}{count != null && <span className="text-gray-400 font-normal">({count})</span>}
              </button>
            )
          })}
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-maroon-800">{TABS.find((x) => x.key === tab).label}</h3>
            {tab === 'bookings' && <Link to="/admin/bookings" className="text-[12px] font-semibold text-maroon-600 border border-maroon-200 rounded-lg px-3 py-1.5">View All Pooja Bookings</Link>}
          </div>

          {tab === 'bookings' && (
            <Table cols={['Booking ID', 'Pooja Name', 'Plan', 'Date & Time', 'Amount (₹)', 'Status', 'Receipt / Ticket No.', 'Booked On']}>
              {d.bookings.map((b) => (
                <tr key={b.booking_code} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[12px] text-gray-500">{b.booking_code}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{b.pooja}</td>
                  <td className="px-4 py-3"><Badge tone={PLAN_TONE[b.plan]}>{b.plan || '—'}</Badge></td>
                  <td className="px-4 py-3 text-gray-600 text-[13px] whitespace-nowrap">{fmtDate(b.scheduled_date)}{b.time_slot ? `, ${b.time_slot}` : ''}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{num(b.amount)}</td>
                  <td className="px-4 py-3"><Badge tone={STATUS_TONE[b.status]}>{b.status}</Badge></td>
                  <td className="px-4 py-3 font-mono text-[12px] text-gray-500">{b.ticket_no || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-[13px] whitespace-nowrap">{fmtStamp(b.booked_on)}</td>
                </tr>
              ))}
              {d.bookings.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No pooja bookings.</td></tr>}
            </Table>
          )}

          {tab === 'donations' && (
            <Table cols={['Receipt No.', 'Fund', 'Type', 'Amount (₹)', 'Mode', '80G', 'Date']}>
              {d.donations.map((x) => (
                <tr key={x.receipt_no} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[12px] text-maroon-600">{x.receipt_no}</td>
                  <td className="px-4 py-3 text-gray-700">{x.fund}</td>
                  <td className="px-4 py-3"><Badge tone="bg-blue-50 text-blue-700">{x.type}</Badge></td>
                  <td className="px-4 py-3 font-semibold text-emerald-700">{num(x.amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{x.mode}</td>
                  <td className="px-4 py-3">{x.g80 ? <Badge tone="bg-emerald-50 text-emerald-700">Eligible</Badge> : '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-[13px]">{fmtDate(x.date)}</td>
                </tr>
              ))}
              {d.donations.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No donations.</td></tr>}
            </Table>
          )}

          {tab === 'annadanam' && (
            <Table cols={['ID', 'Beneficiaries (Plates)', 'Amount (₹)', 'Occasion', 'Date']}>
              {d.annadanam.map((a) => (
                <tr key={a.code} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[12px] text-gray-500">{a.code}</td>
                  <td className="px-4 py-3 text-gray-700">{a.plates}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{num(a.amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{a.occasion || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-[13px]">{fmtDate(a.date)}</td>
                </tr>
              ))}
              {d.annadanam.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">No annadanam sponsorships.</td></tr>}
            </Table>
          )}

          {tab === 'auction' && (
            <Table cols={['ID', 'Item', 'Winning Amount (₹)', 'Status', 'Date']}>
              {d.auction.map((a) => (
                <tr key={a.code} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[12px] text-gray-500">{a.code}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{a.item}</td>
                  <td className="px-4 py-3 font-semibold text-violet-700">{num(a.amount)}</td>
                  <td className="px-4 py-3"><Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge></td>
                  <td className="px-4 py-3 text-gray-500 text-[13px]">{fmtDate(a.date)}</td>
                </tr>
              ))}
              {d.auction.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">No auction purchases.</td></tr>}
            </Table>
          )}

          {tab === 'notes' && <div className="text-sm text-gray-400 py-8 text-center">No notes or remarks recorded.</div>}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-[13px] text-gray-500 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-2.5">
        <span className="text-blue-500">ⓘ</span> All transactions are linked to this devotee profile. Click on each tab to view detailed history.
      </div>

      {edit && <EditDevoteeModal data={edit} onChange={setEdit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function EditDevoteeModal({ data, onChange, onClose, onSaved }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e) {
    e.preventDefault()
    setErr('')
    if (!data.name?.trim() || !data.mobile?.trim()) { setErr('Name and mobile are required.'); return }
    setBusy(true)
    try {
      await DevoteesAPI.update(data.id, {
        name: data.name, mobile: data.mobile, email: data.email, city: data.city,
        gothram: data.gothram, nakshatram: data.nakshatram, address: data.address,
        preferred_language: data.preferred_language || 'English', status: data.status || 'Active',
      })
      onSaved()
    } catch (ex) { setErr(ex.detail || 'Could not save changes.') } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-xl font-bold text-maroon-800">Edit Devotee</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-maroon-700"><X size={18} /></button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[['name', 'Full Name *'], ['mobile', 'Mobile *'], ['email', 'Email'], ['city', 'City'], ['gothram', 'Gothram'], ['nakshatram', 'Nakshatram']].map(([k, label]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <input className="input" value={data[k] || ''} onChange={(e) => onChange({ ...data, [k]: e.target.value })} />
            </div>
          ))}
          <div className="sm:col-span-2"><label className="label">Address</label><input className="input" value={data.address || ''} onChange={(e) => onChange({ ...data, address: e.target.value })} /></div>
          <div><label className="label">Preferred Language</label>
            <select className="input" value={data.preferred_language || 'English'} onChange={(e) => onChange({ ...data, preferred_language: e.target.value })}><option>English</option><option>Telugu</option></select>
          </div>
          <div><label className="label">Status</label>
            <select className="input" value={data.status || 'Active'} onChange={(e) => onChange({ ...data, status: e.target.value })}><option>Active</option><option>Inactive</option></select>
          </div>
        </div>
        {err && <p className="text-[13px] text-red-600 mt-3">{err}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          <button disabled={busy} className="btn-maroon disabled:opacity-60">{busy ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </form>
    </div>
  )
}

function Meta({ icon: Icon, label, value, badge, multiline }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={15} className="text-gray-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] text-gray-400">{label}</div>
        <div className={`text-[13px] text-gray-700 font-medium ${multiline ? '' : 'whitespace-nowrap'}`}>{value}
          {badge && <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">{badge}</span>}
        </div>
      </div>
    </div>
  )
}

function Badge({ tone, children }) {
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${tone || 'bg-gray-100 text-gray-500'}`}>{children}</span>
}
