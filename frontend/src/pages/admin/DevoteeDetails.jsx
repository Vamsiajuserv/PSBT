import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Plus, Phone, Mail, MapPin, Calendar, RotateCw, Layers, Languages,
  Flame, HeartHandshake, UtensilsCrossed, Gavel, Sparkles, FileText, User, X, Cake,
  Star, Save, Trash2, Clock,
} from 'lucide-react'
import { DevoteesAPI } from '../../api/client.js'
import { LoadingBlock, ErrorBlock } from '../../components/common/states.jsx'
import { Select, Combobox, DateField } from '../../components/common/Field.jsx'
import { confirmDialog, promptDialog, toast } from '../../components/common/Dialog.jsx'
import { T, tr, personName, useLang, stamp, teText } from '../../i18n/LanguageContext.jsx'
import { sanitizePhone, sanitizeName, validatePhone } from '../../lib/validation.js'

const inr = (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN')
const num = (n) => Number(n || 0).toLocaleString('en-IN')
const fmtDate = (s) => (s ? stamp(new Date(s).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })) : '—')
// Parse datetime as UTC (server returns naive ISO without 'Z')
const parseUTC = (s) => (s && String(s).includes('T')) ? new Date(String(s) + (String(s).endsWith('Z') ? '' : 'Z')) : null
const fmtStamp = (s) => {
  const d = parseUTC(s)
  if (!d || isNaN(d.getTime())) return '—'
  return stamp(d.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }))
}
const PLAN_TONE = { Daily: 'bg-blue-50 text-blue-700', Monthly: 'bg-emerald-50 text-emerald-700', 'One-Time': 'bg-violet-50 text-violet-700' }
const STATUS_TONE = { Confirmed: 'bg-emerald-50 text-emerald-700', Completed: 'bg-emerald-50 text-emerald-700', Pending: 'bg-amber-50 text-amber-700', Cancelled: 'bg-red-50 text-red-700', Live: 'bg-emerald-50 text-emerald-700', Closed: 'bg-gray-100 text-gray-500' }

// Complete list of Hindu Gotras (52 Gotras from across India)
const GOTHRAMS = [
  'Agastya', 'Alambayana', 'Angirasa', 'Atri', 'Babhravya', 'Bharadwaja', 'Bhargava',
  'Bhrigu', 'Daksha', 'Dhananjaya', 'Garga', 'Gautama', 'Harita', 'Jamadagni',
  'Jamadagnya', 'Kanva', 'Kapi', 'Kapisthala', 'Kashyapa', 'Katyayana', 'Kaundinya',
  'Kaushika', 'Kousika', 'Kratu', 'Kutsa', 'Lohita', 'Mandavya', 'Marichi', 'Matanga',
  'Moudgalya', 'Mudgala', 'Nidruva', 'Parashara', 'Pulaha', 'Pulastya', 'Rouhitya',
  'Salihotra', 'Sandilya', 'Sankritya', 'Saunaka', 'Savarni', 'Shandilya', 'Srivatsa',
  'Upamanyu', 'Vadula', 'Vashishtha', 'Vatsa', 'Vatsya', 'Vishnu', 'Vishnuvriddha',
  'Vishwamitra', 'Yaska',
]

// 27 Nakshatras (Lunar Mansions) in order
const NAKSHATRAMS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta',
  'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Moola', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
]

// 12 Rashis (Zodiac Signs)
const RASHIS = [
  { value: 'Mesha', label: 'Mesha (Aries)' },
  { value: 'Vrishabha', label: 'Vrishabha (Taurus)' },
  { value: 'Mithuna', label: 'Mithuna (Gemini)' },
  { value: 'Karka', label: 'Karka (Cancer)' },
  { value: 'Simha', label: 'Simha (Leo)' },
  { value: 'Kanya', label: 'Kanya (Virgo)' },
  { value: 'Tula', label: 'Tula (Libra)' },
  { value: 'Vrishchika', label: 'Vrishchika (Scorpio)' },
  { value: 'Dhanu', label: 'Dhanu (Sagittarius)' },
  { value: 'Makara', label: 'Makara (Capricorn)' },
  { value: 'Kumbha', label: 'Kumbha (Aquarius)' },
  { value: 'Meena', label: 'Meena (Pisces)' },
]

// Common cities in Telangana/Andhra Pradesh region
const CITIES = [
  'Hyderabad', 'Secunderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam',
  'Ramagundam', 'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Suryapet', 'Miryalaguda',
  'Vijayawada', 'Visakhapatnam', 'Guntur', 'Nellore', 'Kurnool', 'Tirupati',
  'Rajahmundry', 'Kakinada', 'Eluru', 'Ongole', 'Anantapur', 'Kadapa',
  'Bangalore', 'Chennai', 'Mumbai', 'Pune', 'Delhi', 'Kolkata',
]

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

function Th({ children }) { return <th className="px-5 py-4 text-left text-xs uppercase tracking-wide text-gray-500 font-semibold whitespace-nowrap">{children}</th> }
function Table({ cols, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="bg-gray-50/80 border-b border-gray-100">{cols.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  )
}

// Calculate age from DOB
const calcAge = (dob) => {
  if (!dob) return null
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export default function DevoteeDetails() {
  const { lang } = useLang()
  const { id } = useParams()
  const nav = useNavigate()
  const [d, setD] = useState(null)
  const [tab, setTab] = useState('bookings')
  const [edit, setEdit] = useState(null)   // editable copy of the devotee while the modal is open
  const [loadErr, setLoadErr] = useState('')

  // Notes state
  const [notes, setNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesEdited, setNotesEdited] = useState(false)

  const reload = () => {
    setLoadErr('')
    return DevoteesAPI.detail(id).then((data) => {
      setD(data)
      setNotes(data.devotee?.notes || '')
      setNotesEdited(false)
    }).catch((ex) => { setD(null); setLoadErr(ex?.detail || tr("Couldn't load this devotee — check your connection and retry.")) })
  }
  useEffect(() => { reload() }, [id])

  // Determine last activity type dynamically
  const getLastActivityType = () => {
    if (!d) return null
    const activities = [
      ...(d.bookings || []).map(b => ({ type: 'Pooja Booking', date: b.booked_on })),
      ...(d.donations || []).map(x => ({ type: 'Donation', date: x.date })),
      ...(d.annadanam || []).map(a => ({ type: 'Annadanam', date: a.date })),
      ...(d.auction || []).map(a => ({ type: 'Auction', date: a.date })),
    ].filter(a => a.date)
    if (!activities.length) return null
    activities.sort((a, b) => new Date(b.date) - new Date(a.date))
    return activities[0].type
  }

  // Save notes
  const saveNotes = async () => {
    setNotesSaving(true)
    try {
      await DevoteesAPI.update(d.devotee.id, { notes: notes.trim() || null })
      toast(tr('Notes saved successfully'))
      setNotesEdited(false)
    } catch (ex) {
      toast(ex?.detail || tr('Could not save notes'), 'error')
    }
    setNotesSaving(false)
  }

  if (loadErr) return <ErrorBlock message={loadErr} onRetry={reload} />
  if (!d) return <LoadingBlock />
  const dev = d.devotee
  const lastActivityType = getLastActivityType()
  const age = calcAge(dev.dob)

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-400 mb-2">
            <Link to="/admin" className="hover:text-maroon-600"><T>Home</T></Link>
            {' › '}
            <Link to="/admin/devotees" className="hover:text-maroon-600"><T>Devotees</T></Link>
            {' › '}
            <span className="text-gray-600">{personName(dev, lang)}</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-maroon-700"><T>Devotee Profile</T></h1>
        </div>
        <div className="flex gap-3">
          <button onClick={() => nav('/admin/devotees')} className="btn-outline !py-2.5 !px-4"><ArrowLeft size={16} /> <T>Back</T></button>
          <Link to="/admin/bookings/new" className="btn-maroon !py-2.5 !px-4"><Plus size={16} /> <T>New Booking</T></Link>
        </div>
      </div>

      {/* Profile card - More spacious 2-column layout */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-5">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-maroon-100 to-amber-50 grid place-items-center text-maroon-300 shrink-0 border-2 border-maroon-100">
              <User size={48} />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-bold text-2xl text-gray-800">{personName(dev, lang)}</span>
                <span className="text-xs font-mono font-semibold text-blue-700 bg-blue-50 rounded-full px-3 py-1">{dev.code}</span>
                <span className={`text-xs font-semibold rounded-full px-3 py-1 ${dev.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {dev.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-2"><Phone size={15} className="text-maroon-500" /> {dev.mobile}</span>
                {dev.email && <span className="flex items-center gap-2"><Mail size={15} className="text-maroon-500" /> {dev.email}</span>}
                {dev.city && <span className="flex items-center gap-2"><MapPin size={15} className="text-maroon-500" /> {dev.city}</span>}
              </div>
            </div>
          </div>
          <button onClick={() => setEdit({ ...dev })} className="flex items-center gap-2 text-sm font-semibold text-maroon-700 border border-maroon-200 rounded-lg px-4 py-2 hover:bg-maroon-50 transition-colors">
            <Pencil size={15} /> <T>Edit Profile</T>
          </button>
        </div>

        {/* Two-column info grid */}
        <div className="grid lg:grid-cols-2 gap-8 pt-6 border-t border-gray-100">
          {/* Left column - Sankalpam & Personal */}
          <div className="space-y-5">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider"><T>Sankalpam Details</T></h4>
            <div className="grid grid-cols-3 gap-4">
              <InfoCard icon={Star} label={tr("Gothram")} value={dev.gothram} color="amber" />
              <InfoCard icon={Star} label={tr("Nakshatram")} value={dev.nakshatram} color="blue" />
              <InfoCard icon={Star} label={tr("Rasi")} value={dev.rasi} color="purple" />
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <InfoCard icon={Cake} label={tr("Date of Birth")} value={dev.dob ? `${fmtDate(dev.dob)}${age ? ` (${age} yrs)` : ''}` : null} color="pink" />
              <InfoCard icon={FileText} label={tr("PAN Number")} value={dev.pan_number} color="gray" mono />
            </div>
          </div>

          {/* Right column - Activity & Preferences */}
          <div className="space-y-5">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider"><T>Activity & Preferences</T></h4>
            <div className="grid grid-cols-2 gap-4">
              <InfoCard icon={Calendar} label={tr("Registered On")} value={fmtDate(dev.registered_on)} color="emerald" />
              <InfoCard icon={Clock} label={tr("Last Activity")} value={fmtDate(dev.last_visit)} badge={lastActivityType} color="blue" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <InfoCard icon={Languages} label={tr("Preferred Language")} value={dev.preferred_language || 'English'} color="indigo" />
              <InfoCard icon={Layers} label={tr("Total Transactions")} value={num(d.stats?.bookings?.count + d.stats?.donations?.count + d.stats?.annadanam?.count + d.stats?.auction?.count || 0)} color="maroon" />
            </div>
            {dev.address && (
              <div className="pt-2">
                <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-4">
                  <MapPin size={16} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs text-gray-400 mb-1"><T>Address</T></div>
                    <div className="text-sm text-gray-700">{dev.address}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Family members — used as the "in the name of" beneficiary for ceremonies */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Family Members</T></h3>
          <button onClick={async () => {
            const res = await promptDialog({
              title: tr('Add family member'),
              confirmLabel: tr('Add Member'),
              fields: [
                { k: 'name', label: tr('Name'), required: true },
                { k: 'relation', label: tr('Relation'), placeholder: 'e.g. Son, Daughter, Wife' },
              ],
            })
            if (!res) return
            try { await DevoteesAPI.addFamily(dev.id, { name: res.name.trim(), relation: res.relation.trim() }); toast(tr('Family member added.')); reload() }
            catch (ex) { toast(ex?.detail || tr('Could not add the family member.'), 'error') }
          }} className="btn-outline !py-2 text-sm"><Plus size={14} /> <T>Add Member</T></button>
        </div>
        {(dev.family || []).length === 0 ? (
          <p className="text-sm text-gray-400 py-2"><T>No family members recorded. Add family members to use as beneficiaries for poojas.</T></p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {dev.family.map((f) => (
              <span key={f.id} className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full pl-4 pr-2 py-2 text-sm text-gray-700">
                <User size={14} className="text-gray-400" />
                <span className="font-semibold">{personName(f, lang)}</span>
                {f.relation && <span className="text-gray-400 text-xs bg-white px-2 py-0.5 rounded-full">{f.relation}</span>}
                <button onClick={async () => {
                  if (!(await confirmDialog({ title: `${tr('Remove')} ${personName(f, lang)}?`, tone: 'danger', confirmLabel: tr('Remove') }))) return
                  try { await DevoteesAPI.removeFamily(dev.id, f.id); reload() }
                  catch (ex) { toast(ex?.detail || tr('Could not remove.'), 'error') }
                }} className="w-6 h-6 grid place-items-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-100 ml-1 transition-colors">
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {STAT_CARDS.map((c) => {
          const Icon = c.icon; const s = d.stats[c.key]
          return (
            <div key={c.key} onClick={() => setTab(c.key)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab(c.key) } }}
              className={`bg-white rounded-2xl border shadow-sm p-6 cursor-pointer transition-all duration-200 hover:shadow-md ${tab === c.key ? 'border-maroon-400 ring-2 ring-maroon-100' : 'border-gray-100 hover:border-maroon-200'}`}>
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-xl grid place-items-center shrink-0 ${c.bg}`} style={{ color: c.c }}><Icon size={26} /></div>
                <div>
                  <div className="text-sm text-gray-500 font-medium">{tr(c.label)}</div>
                  <div className="text-3xl font-extrabold text-gray-800 leading-none mt-1">{c.main(s)}</div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
                {c.key === 'annadanam' ? tr('Persons Sponsored') : c.key === 'bookings' ? tr('Amount Spent') : c.key === 'donations' ? tr('Total Donated') : tr('Total Won')}
                {' '}
                <span className="font-bold text-gray-800">{c.foot(s)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Activity History Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600"><T>Section</T>:</label>
            <Select
              value={tab}
              onChange={(e) => setTab(e.target.value)}
              className="!py-2 !px-3 !pr-8 min-w-[200px] font-semibold"
            >
              {TABS.map((tb) => {
                const count = tb.key === 'notes' ? (notes?.trim() ? '•' : '') : (d[tb.key]?.length || 0)
                return (
                  <option key={tb.key} value={tb.key}>
                    {tr(tb.label)} {count ? `(${count})` : ''}
                  </option>
                )
              })}
            </Select>
          </div>
          {tab === 'bookings' && <Link to="/admin/bookings" className="text-sm font-semibold text-maroon-600 border border-maroon-200 rounded-lg px-4 py-2 hover:bg-maroon-50 transition-colors"><T>View All Bookings</T></Link>}
        </div>

        <div className="p-6">

          {tab === 'bookings' && (
            <Table cols={['Booking ID', 'Pooja Name', 'Plan', 'Date & Time', 'Amount (₹)', 'Status', 'Receipt / Ticket', 'Booked On']}>
              {d.bookings.map((b) => (
                <tr key={b.booking_code} className="hover:bg-gray-50/60">
                  <td className="px-5 py-4 font-mono text-sm text-gray-500">{b.booking_code}</td>
                  <td className="px-5 py-4 font-semibold text-gray-800">{b.pooja}</td>
                  <td className="px-5 py-4"><Badge tone={PLAN_TONE[b.plan]}>{b.plan || '—'}</Badge></td>
                  <td className="px-5 py-4 text-gray-600 text-sm whitespace-nowrap">{fmtDate(b.scheduled_date)}{b.time_slot ? `, ${b.time_slot}` : ''}</td>
                  <td className="px-5 py-4 font-semibold text-gray-800">{num(b.amount)}</td>
                  <td className="px-5 py-4"><Badge tone={STATUS_TONE[b.status]}>{b.status}</Badge></td>
                  <td className="px-5 py-4 font-mono text-sm text-gray-500">{b.ticket_no || '—'}</td>
                  <td className="px-5 py-4 text-gray-500 text-sm whitespace-nowrap">{fmtStamp(b.booked_on)}</td>
                </tr>
              ))}
              {d.bookings.length === 0 && <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-500"><T>No pooja bookings yet.</T></td></tr>}
            </Table>
          )}

          {tab === 'donations' && (
            <Table cols={['Receipt No.', 'Fund', 'Type', 'Amount (₹)', 'Mode', '80G', 'Date']}>
              {d.donations.map((x) => (
                <tr key={x.receipt_no} className="hover:bg-gray-50/60">
                  <td className="px-5 py-4 font-mono text-sm text-maroon-600">{x.receipt_no}</td>
                  <td className="px-5 py-4 text-gray-700">{x.fund}</td>
                  <td className="px-5 py-4"><Badge tone="bg-blue-50 text-blue-700">{x.type}</Badge></td>
                  <td className="px-5 py-4 font-semibold text-emerald-700">{num(x.amount)}</td>
                  <td className="px-5 py-4 text-gray-600">{x.mode}</td>
                  <td className="px-5 py-4">{x.g80 ? <Badge tone="bg-emerald-50 text-emerald-700"><T>Eligible</T></Badge> : '—'}</td>
                  <td className="px-5 py-4 text-gray-500 text-sm">{fmtDate(x.date)}</td>
                </tr>
              ))}
              {d.donations.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-500"><T>No donations yet.</T></td></tr>}
            </Table>
          )}

          {tab === 'annadanam' && (
            <Table cols={['ID', 'Beneficiaries (Plates)', 'Amount (₹)', 'Occasion', 'Date']}>
              {d.annadanam.map((a) => (
                <tr key={a.code} className="hover:bg-gray-50/60">
                  <td className="px-5 py-4 font-mono text-sm text-gray-500">{a.code}</td>
                  <td className="px-5 py-4 text-gray-700">{a.plates}</td>
                  <td className="px-5 py-4 font-semibold text-gray-800">{num(a.amount)}</td>
                  <td className="px-5 py-4 text-gray-600">{a.occasion || '—'}</td>
                  <td className="px-5 py-4 text-gray-500 text-sm">{fmtDate(a.date)}</td>
                </tr>
              ))}
              {d.annadanam.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-500"><T>No annadanam sponsorships yet.</T></td></tr>}
            </Table>
          )}

          {tab === 'auction' && (
            <Table cols={['ID', 'Item', 'Winning Amount (₹)', 'Status', 'Date']}>
              {d.auction.map((a) => (
                <tr key={a.code} className="hover:bg-gray-50/60">
                  <td className="px-5 py-4 font-mono text-sm text-gray-500">{a.code}</td>
                  <td className="px-5 py-4 font-semibold text-gray-800">{a.item}</td>
                  <td className="px-5 py-4 font-semibold text-violet-700">{num(a.amount)}</td>
                  <td className="px-5 py-4"><Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge></td>
                  <td className="px-5 py-4 text-gray-500 text-sm">{fmtDate(a.date)}</td>
                </tr>
              ))}
              {d.auction.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-500"><T>No auction purchases yet.</T></td></tr>}
            </Table>
          )}

          {tab === 'notes' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500"><T>Add internal notes or remarks about this devotee. These are only visible to temple staff.</T></p>
              <textarea
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setNotesEdited(true) }}
                placeholder={tr("Enter notes about the devotee (e.g., special preferences, VIP status, communication history)...")}
                rows={6}
                className="input w-full resize-none text-sm"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {notesEdited && <span className="text-amber-600"><T>Unsaved changes</T></span>}
                </p>
                <button
                  onClick={saveNotes}
                  disabled={!notesEdited || notesSaving}
                  className="btn-maroon !py-2 !px-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {notesSaving ? (
                    <><RotateCw size={14} className="animate-spin" /> <T>Saving...</T></>
                  ) : (
                    <><Save size={14} /> <T>Save Notes</T></>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {edit && <EditDevoteeModal data={edit} onChange={setEdit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function EditDevoteeModal({ data, onChange, onClose, onSaved }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [mobileError, setMobileError] = useState('')
  async function save(e) {
    e.preventDefault()
    setErr('')
    if (!data.name?.trim() || !data.mobile?.trim()) { setErr(tr('Name and mobile are required.')); return }
    // Validate mobile number - must be exactly 10 digits for Indian numbers
    const mobileTrimmed = (data.mobile || '').trim()
    if (mobileTrimmed.length !== 10) {
      setErr(tr('Please Enter 10 digits Mobile Number'))
      setMobileError(tr('Please Enter 10 digits Mobile Number'))
      return
    }
    const mobileValidation = validatePhone(mobileTrimmed)
    if (!mobileValidation.valid) {
      setErr(mobileValidation.error)
      setMobileError(tr('Invalid Mobile Number'))
      return
    }
    setBusy(true)
    try {
      await DevoteesAPI.update(data.id, {
        name: data.name, mobile: data.mobile, email: data.email, city: data.city,
        gothram: data.gothram, nakshatram: data.nakshatram, rasi: data.rasi,
        dob: data.dob || null, pan_number: data.pan_number || null,
        address: data.address, preferred_language: data.preferred_language || 'English', status: data.status || 'Active',
      })
      onSaved()
    } catch (ex) { setErr(ex.detail || tr('Could not save changes.')) } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-serif text-2xl font-bold text-maroon-800"><T>Edit Devotee Profile</T></h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 grid place-items-center text-gray-400 hover:text-maroon-700 hover:bg-maroon-50 transition-colors"><X size={18} /></button>
        </div>

        {/* Basic Info */}
        <div className="mb-6">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4"><T>Basic Information</T></h4>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label"><T>Full Name</T> *</label>
              <input className="input" value={data.name || ''} onChange={(e) => onChange({ ...data, name: sanitizeName(e.target.value) })} />
            </div>
            <div>
              <label className="label"><T>Mobile</T> *</label>
              <input className={`input ${mobileError ? 'border-red-400' : ''}`} maxLength={10} value={data.mobile || ''} onChange={(e) => {
                const cleaned = sanitizePhone(e.target.value)
                onChange({ ...data, mobile: cleaned })
                if (cleaned.length === 10) {
                  const validation = validatePhone(cleaned)
                  setMobileError(validation.valid ? '' : tr('Invalid Mobile Number'))
                } else if (cleaned.length >= 1 && cleaned.length < 10) {
                  setMobileError(tr('Please Enter 10 digits Mobile Number'))
                } else {
                  setMobileError('')
                }
              }} />
              {mobileError && <div className="text-[0.7rem] text-red-500 mt-0.5">{mobileError}</div>}
            </div>
            <div>
              <label className="label"><T>Email</T></label>
              <input className="input" type="email" value={data.email || ''} onChange={(e) => onChange({ ...data, email: e.target.value })} />
            </div>
            <div>
              <label className="label"><T>City</T></label>
              <Combobox value={data.city || ''} onChange={(e) => onChange({ ...data, city: e.target.value })} options={CITIES} placeholder={tr("Select or type city")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label"><T>Address</T></label>
              <input className="input" value={data.address || ''} onChange={(e) => onChange({ ...data, address: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Sankalpam Details */}
        <div className="mb-6">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4"><T>Sankalpam Details</T></h4>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="label"><T>Gothram</T></label>
              <Combobox value={data.gothram || ''} onChange={(e) => onChange({ ...data, gothram: e.target.value })} options={GOTHRAMS} placeholder={tr("Select")} />
            </div>
            <div>
              <label className="label"><T>Nakshatram</T></label>
              <Combobox value={data.nakshatram || ''} onChange={(e) => onChange({ ...data, nakshatram: e.target.value })} options={NAKSHATRAMS} placeholder={tr("Select")} />
            </div>
            <div>
              <label className="label"><T>Rasi</T></label>
              <Select className="input" value={data.rasi || ''} onChange={(e) => onChange({ ...data, rasi: e.target.value })}>
                <option value="">{tr("Select Rasi")}</option>
                {RASHIS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </div>
          </div>
        </div>

        {/* Personal & Preferences */}
        <div className="mb-6">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4"><T>Personal & Preferences</T></h4>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label"><T>Date of Birth</T></label>
              <input type="date" className="input" max={new Date().toISOString().split('T')[0]} value={data.dob || ''} onChange={(e) => onChange({ ...data, dob: e.target.value })} />
            </div>
            <div>
              <label className="label"><T>PAN Number</T></label>
              <input className="input uppercase" maxLength={10} placeholder={tr("e.g. ABCDE1234F")} value={data.pan_number || ''} onChange={(e) => onChange({ ...data, pan_number: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
            </div>
            <div>
              <label className="label"><T>Preferred Language</T></label>
              <Select className="input" value={data.preferred_language || 'English'} onChange={(e) => onChange({ ...data, preferred_language: e.target.value })}>
                <option value="English">{tr("English")}</option>
                <option value="Telugu">{tr("Telugu")}</option>
              </Select>
            </div>
            <div>
              <label className="label"><T>Status</T></label>
              <Select className="input" value={data.status || 'Active'} onChange={(e) => onChange({ ...data, status: e.target.value })}>
                <option value="Active">{tr("Active")}</option>
                <option value="Inactive">{tr("Inactive")}</option>
              </Select>
            </div>
          </div>
        </div>

        {err && <p className="text-sm text-red-600 mb-4 bg-red-50 px-4 py-2 rounded-lg">{err}</p>}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-outline !py-2.5 !px-5"><T>Cancel</T></button>
          <button disabled={busy} className="btn-maroon !py-2.5 !px-5 disabled:opacity-60">{busy ? tr('Saving…') : tr('Save Changes')}</button>
        </div>
      </form>
    </div>
  )
}

// Compact info card for profile grid
const COLOR_MAP = {
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  purple: 'bg-purple-50 text-purple-700 border-purple-100',
  pink: 'bg-pink-50 text-pink-700 border-pink-100',
  gray: 'bg-gray-50 text-gray-600 border-gray-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  maroon: 'bg-maroon-50 text-maroon-700 border-maroon-100',
}

function InfoCard({ icon: Icon, label, value, color = 'gray', badge, mono }) {
  const colors = COLOR_MAP[color] || COLOR_MAP.gray
  return (
    <div className={`rounded-lg border p-3 ${colors}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="opacity-60" />
        <span className="text-xs font-medium opacity-70">{label}</span>
      </div>
      <div className={`text-sm font-semibold ${mono ? 'font-mono' : ''} ${!value ? 'opacity-40 italic' : ''}`}>
        {value || '—'}
        {badge && <span className="ml-2 text-xs font-normal bg-white/60 px-2 py-0.5 rounded">{badge}</span>}
      </div>
    </div>
  )
}

function Badge({ tone, children }) {
  children = typeof children === 'string' ? teText(children) : children

  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${tone || 'bg-gray-100 text-gray-500'}`}>{children}</span>
}
