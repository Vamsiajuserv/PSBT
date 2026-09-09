import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, X, Eye, Pencil, Search, RotateCcw, Phone, Mail, Printer, ChevronRight,
  Users, CalendarPlus, HeartHandshake, HandHeart,
  Flame, UtensilsCrossed, Gavel, ArrowUp, ArrowDown,
} from 'lucide-react'
import { useSortableTable, SortPanel } from '../../components/common/SortableTable.jsx'
import { PageTitle, StatTile, Pill, Pager, inr, num, fmtDate, fmtStamp } from '../../components/admin/ui.jsx'
import { TableStates, LOAD_ERROR } from '../../components/common/states.jsx'
import { DevoteesAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { isAdminRole } from '../../auth/access.js'
import { Select, DateField, CountryCodeSelect, Combobox, getCountryDigits } from '../../components/common/Field.jsx'
import { T, tr, personName, useLang, teText } from '../../i18n/LanguageContext.jsx'
import { sanitizeName, sanitizePhone, validateName, validatePhone, validateEmail } from '../../lib/validation.js'
import { useTemple } from '../../lib/SiteContext.jsx'

const EMPTY = { name: '', mobile: '', email: '', city: '', gothram: '', nakshatram: '', address: '', preferred_language: 'English', dob: '', status: 'Active', notes: '' }
const PAGE_SIZE = 20
const PLAN_TONE = { Daily: 'blue', Monthly: 'green', 'One-Time': 'violet', 'Life Long': 'orange', 'Full Month': 'violet' }
const STATUS_TONE = { Confirmed: 'green', Completed: 'green', Pending: 'amber', Cancelled: 'red', Ongoing: 'amber', Live: 'green', Closed: 'gray' }

const TABS = ['Overview', 'Pooja History', 'Donation History', 'Other Activities']

// Gothram (Gotra) names - ancient sage lineages (52 Gotras - All India)
const GOTHRAMS = [
  'Agastya', 'Alambayana', 'Angirasa', 'Atri', 'Babhravya', 'Bharadwaja', 'Bhargava',
  'Bhrigu', 'Daksha', 'Dhananjaya', 'Garga', 'Gautama', 'Harita', 'Jamadagni',
  'Jamadagnya', 'Kanva', 'Kapi', 'Kapisthala', 'Kashyapa', 'Katyayana', 'Kaundinya',
  'Kaushika', 'Kousika', 'Kratu', 'Kutsa', 'Lohita', 'Mandavya', 'Marichi', 'Matanga',
  'Moudgalya', 'Mudgala', 'Nidruva', 'Parashara', 'Pulaha', 'Pulastya', 'Rouhitya',
  'Salihotra', 'Sandilya', 'Sankritya', 'Saunaka', 'Savarni', 'Shandilya', 'Srivatsa',
  'Upamanyu', 'Vadula', 'Vashishtha', 'Vatsa', 'Vatsya', 'Vishnu', 'Vishnuvriddha',
  'Vishwamitra', 'Yaska'
]

// Nakshatram (Birth Star) names
const NAKSHATRAMS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta',
  'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati'
]

// Major cities in India
const CITIES = [
  'Hyderabad', 'Secunderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam',
  'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Medak', 'Rangareddy', 'Sangareddy',
  'Siddipet', 'Mancherial', 'Ramagundam', 'Suryapet', 'Miryalaguda', 'Jagtial',
  'Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati', 'Nellore', 'Kakinada',
  'Rajahmundry', 'Kadapa', 'Kurnool', 'Anantapur', 'Eluru', 'Ongole',
  'Chennai', 'Bangalore', 'Mumbai', 'Pune', 'Delhi', 'Kolkata', 'Ahmedabad',
  'Jaipur', 'Lucknow', 'Indore', 'Bhopal', 'Nagpur', 'Surat', 'Coimbatore',
  'Madurai', 'Mysore', 'Mangalore', 'Kochi', 'Thiruvananthapuram', 'Other'
]

// Print devotee summary in new window
function printDevoteeSummary(dev, stats, temple) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Devotee Summary - ${dev.code}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; color: #000; }
        .header { text-align: center; padding-bottom: 20px; margin-bottom: 25px; }
        .icon { font-size: 50px; margin-bottom: 10px; }
        .temple-name { font-size: 22px; font-weight: bold; margin-bottom: 5px; }
        .temple-address { font-size: 13px; color: #333; }
        .section { border: 2px solid #000; margin-bottom: 20px; }
        .section-title { background: #f5f5f5; border-bottom: 2px solid #000; padding: 12px 20px; text-align: center; font-weight: bold; font-size: 16px; text-transform: uppercase; letter-spacing: 2px; }
        .section-subtitle { font-size: 12px; color: #555; margin-top: 5px; font-weight: normal; letter-spacing: 0; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 12px 20px; border-bottom: 1px solid #ddd; font-size: 15px; }
        td:first-child { color: #555; width: 140px; }
        td:last-child { font-weight: 500; }
        tr:last-child td { border-bottom: none; }
        .stats-table th { border-bottom: 1px solid #ccc; padding: 12px 10px; font-size: 13px; font-weight: 600; }
        .stats-table th:not(:last-child) { border-right: 1px solid #ccc; }
        .stats-table td { text-align: center; padding: 20px 10px; font-size: 28px; font-weight: bold; border-bottom: none; }
        .stats-table td:not(:last-child) { border-right: 1px solid #ccc; }
        .footer { text-align: center; padding: 20px; }
        .blessing { font-weight: 600; font-size: 18px; margin-bottom: 10px; }
        .footer-text { font-size: 12px; color: #666; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="icon">🛕</div>
        <div class="temple-name">${temple?.name || 'Sri Shirdi Sai Baba Temple'}</div>
        <div class="temple-address">${temple?.address || 'Dwarkapuri Colony, Punjagutta, Hyderabad, Telangana'}</div>
      </div>

      <div class="section">
        <div class="section-title">Devotee Summary<div class="section-subtitle">ID: ${dev.code || 'N/A'}</div></div>
        <table>
          <tr><td>Name:</td><td>${dev.name || '—'}</td></tr>
          <tr><td>Phone:</td><td>${dev.mobile || '—'}</td></tr>
          <tr><td>Email:</td><td>${dev.email || '—'}</td></tr>
          <tr><td>City:</td><td>${dev.city || '—'}</td></tr>
          <tr><td>Registered On:</td><td>${dev.registered_on ? new Date(dev.registered_on).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}) : '—'}</td></tr>
          <tr><td>Status:</td><td>${dev.status || 'Active'}</td></tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Activity Summary</div>
        <table class="stats-table">
          <tr>
            <th>Pooja Bookings</th>
            <th>Donations</th>
            <th>Annadanam</th>
            <th>Auction</th>
          </tr>
          <tr>
            <td>${stats?.bookings?.count || 0}</td>
            <td>${stats?.donations?.count || 0}</td>
            <td>${stats?.annadanam?.persons || 0}</td>
            <td>${stats?.auction?.count || 0}</td>
          </tr>
        </table>
      </div>

      <div class="footer">
        <div class="blessing">|| Om Sri Sai Ram ||</div>
        <div class="footer-text">This is a computer-generated summary.</div>
        <div class="footer-text">Printed on: ${new Date().toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'})}</div>
      </div>
    </body>
    </html>
  `
  const win = window.open('', '_blank', 'width=650,height=750')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 300)
}

export default function Devotees() {
  const { lang } = useLang()
  const { user } = useAuth()
  const isAdmin = isAdminRole(user)
  const canWrite = isAdmin // Only Admin can add/edit devotees
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState(null)
  const [modal, setModal] = useState(null)
  const [detail, setDetail] = useState(null)
  const [tab, setTab] = useState('Overview')

  const [q, setQ] = useState('')
  const [city, setCity] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')

  // Sortable table columns
  const sortColumns = [
    { key: 'code', label: 'Devotee ID', type: 'text' },
    { key: 'name', label: 'Devotee Name', type: 'text' },
    { key: 'mobile', label: 'Mobile Number', type: 'text' },
    { key: 'city', label: 'City / Location', type: 'text' },
    { key: 'registered_on', label: 'Registered On', type: 'date' },
    { key: 'status', label: 'Status', type: 'text' },
  ]
  const { sortedRows, sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection } = useSortableTable(rows, sortColumns, [{ key: 'registered_on', direction: 'desc' }])

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
    if (saving) return

    // Validate fields
    const errors = {}
    const nameResult = validateName(modal.data.name)
    if (!nameResult.valid) errors.name = nameResult.error

    const phoneResult = validatePhone(modal.data.mobile)
    if (!phoneResult.valid) errors.mobile = phoneResult.error

    if (modal.data.email) {
      const emailResult = validateEmail(modal.data.email)
      if (!emailResult.valid) errors.email = emailResult.error
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setSaveErr(tr('Please fix the errors above.'))
      return
    }

    setFieldErrors({})
    setSaving(true); setSaveErr('')
    try {
      // Clean data before sending - convert empty strings to null for optional fields
      const cleanData = { ...modal.data }
      if (!cleanData.dob) cleanData.dob = null
      if (!cleanData.email) cleanData.email = null
      if (!cleanData.name_te) cleanData.name_te = null
      if (!cleanData.address) cleanData.address = null
      if (!cleanData.city) cleanData.city = null
      if (!cleanData.gothram) cleanData.gothram = null
      if (!cleanData.nakshatram) cleanData.nakshatram = null
      if (!cleanData.notes) cleanData.notes = null

      if (modal.mode === 'create') await DevoteesAPI.create(cleanData)
      else await DevoteesAPI.update(cleanData.id, cleanData)
      setModal(null); load()
    } catch (err) {
      setSaveErr(err?.detail || 'Could not save the devotee. A duplicate mobile number is the usual cause.')
    } finally {
      setSaving(false)
    }
  }
  function openDetail(id) {
    setTab('Overview')
    DevoteesAPI.detail(id)
      .then(setDetail)
      .catch((err) => {
        console.error('Failed to load devotee details:', err)
        setLoadErr(err?.detail || 'Could not load devotee details. Please try again.')
      })
  }

  return (
    <div>
      <PageTitle title={tr("Devotee Management")} subtitle={tr("Maintain devotee master and view their activity history across temple services.")}
        actions={canWrite && <button onClick={() => { setSaveErr(''); setModal({ mode: 'create', data: { ...EMPTY } }) }} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Add New Devotee</T></button>} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6" role="region" aria-label={tr("Devotee statistics")}>
        <StatTile icon={Users} color="#ea580c" bg="bg-orange-50" title={tr("Total Devotees")}
          value={stats ? num(stats.total) : '—'} sub={tr("All registered devotees")} />
        <StatTile icon={CalendarPlus} color="#059669" bg="bg-emerald-50" title={tr("Recent Registrations")}
          value={stats ? num(stats.recent_registrations) : '—'} sub={tr("Registered in last 30 days")} />
        <StatTile icon={HeartHandshake} color="#7c3aed" bg="bg-violet-50" title={tr("Devotees with Donations")}
          value={stats ? num(stats.with_donations) : '—'} sub={tr("Devotees who donated")} />
        <StatTile icon={HandHeart} color="#2563eb" bg="bg-blue-50" title={tr("Total Annadanam Beneficiaries")}
          value={stats ? num(stats.annadanam_beneficiaries) : '—'} sub={tr("Through devotee sponsorships")} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-4 sm:py-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 items-end">
          <div className="sm:col-span-2 md:col-span-1">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search by Devotee Name / Mobile Number</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search name or mobile number…")} aria-label={tr("Search devotees")} className="input !pl-9 focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent" /></div>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>City / Location</T></label>
            <Select value={city} onChange={(e) => setCity(e.target.value)} className="input" aria-label={tr("Filter by city")}><option value="">{tr("All Cities")}</option>{allCities.map((c) => <option key={c}>{c}</option>)}</Select>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input" aria-label={tr("Filter by status")}><option value="">{tr("All Status")}</option><option value="Active">{tr("Active")}</option><option value="Inactive">{tr("Inactive")}</option></Select>
          </div>
        </div>

        <SortPanel sorts={sorts} columns={sortColumns} onToggle={handleColumnClick} onRemove={removeSort} onClear={clearSorts} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              {sortColumns.map((col) => {
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
              <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRows.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3.5 font-mono text-[0.75rem] text-gray-500">{d.code}</td>
                  <td className="px-4 py-3.5 font-semibold text-gray-800">{personName(d, lang)}</td>
                  <td className="px-4 py-3.5 text-gray-600">{d.mobile}</td>
                  <td className="px-4 py-3.5 text-gray-600">{d.city ? tr(d.city.trim()) : '—'}</td>
                  <td className="px-4 py-3.5 text-gray-500 text-[0.8125rem]">{fmtDate(d.registered_on)}</td>
                  <td className="px-4 py-3.5"><Pill tone={d.status === 'Active' ? 'green' : 'gray'}>{d.status}</Pill></td>
                  <td className="px-4 py-3.5 flex gap-1">
                    <button onClick={() => openDetail(d.id)} title={tr("View details")} aria-label={`${tr("View details for")} ${personName(d, lang)}`} className="w-7 h-7 sm:w-8 sm:h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700 hover:border-maroon-300 focus:outline-none focus:ring-2 focus:ring-maroon-500"><Eye size={14} aria-hidden="true" /></button>
                    {isAdmin && <button onClick={() => { setSaveErr(''); setModal({ mode: 'edit', data: { ...d } }) }} title={tr("Edit devotee")} aria-label={`${tr("Edit")} ${personName(d, lang)}`} className="w-7 h-7 sm:w-8 sm:h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700 hover:border-maroon-300 focus:outline-none focus:ring-2 focus:ring-maroon-500"><Pencil size={14} aria-hidden="true" /></button>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <TableStates colSpan={7} loading={loading} error={loadErr} onRetry={load} empty={tr("No devotees found.")} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={PAGE_SIZE} total={total} onPage={setPage} unit={tr("devotees")} />
        </div>
      </div>

      {detail && <DevoteeDrawer d={detail} tab={tab} setTab={setTab} onClose={() => setDetail(null)} />}

      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-3 sm:p-4" onClick={() => setModal(null)} role="dialog" aria-modal="true" aria-labelledby="devotee-modal-title">
          <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="bg-white rounded-xl shadow-xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 id="devotee-modal-title" className="font-serif text-lg sm:text-xl font-bold text-maroon-800">{modal.mode === 'create' ? tr('Add New Devotee') : tr('Edit Devotee')}</h3>
              <button type="button" onClick={() => setModal(null)} aria-label={tr("Close")} className="text-gray-400 hover:text-maroon-700 focus:outline-none focus:ring-2 focus:ring-maroon-500 rounded-lg p-1"><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label"><T>Full Name</T> *</label>
                <input required className={`input ${fieldErrors.name ? 'border-red-400' : ''}`} value={modal.data.name || ''}
                  onChange={(e) => { setFieldErrors((p) => ({ ...p, name: null })); setModal({ ...modal, data: { ...modal.data, name: sanitizeName(e.target.value) } }) }}
                  placeholder={tr("Full Name")} />
                {fieldErrors.name && <div className="text-[0.7rem] text-red-500 mt-0.5">{fieldErrors.name}</div>}
              </div>
              <div>
                <label className="label"><T>Full Name (Telugu)</T></label>
                <input className="input" placeholder={tr("Full Name")} value={modal.data.name_te || ''}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, name_te: sanitizeName(e.target.value) } })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label"><T>Mobile</T> *</label>
                <div className="flex">
                  <CountryCodeSelect
                    value={modal.data.country_code || '+91'}
                    onChange={(e) => setModal({ ...modal, data: { ...modal.data, country_code: e.target.value } })}
                  />
                  <input required className={`input flex-1 !rounded-l-none ${fieldErrors.mobile ? 'border-red-400' : ''}`} value={modal.data.mobile || ''}
                    onChange={(e) => { setFieldErrors((p) => ({ ...p, mobile: null })); setModal({ ...modal, data: { ...modal.data, mobile: sanitizePhone(e.target.value) } }) }}
                    placeholder={tr("Mobile Number")} maxLength={getCountryDigits(modal.data.country_code || '+91')} />
                </div>
                {fieldErrors.mobile && <div className="text-[0.7rem] text-red-500 mt-0.5">{fieldErrors.mobile}</div>}
              </div>
              <div className="sm:col-span-2">
                <label className="label"><T>Email</T></label>
                <input type="email" className={`input ${fieldErrors.email ? 'border-red-400' : ''}`} value={modal.data.email || ''}
                  onChange={(e) => { setFieldErrors((p) => ({ ...p, email: null })); setModal({ ...modal, data: { ...modal.data, email: e.target.value } }) }} />
                {fieldErrors.email && <div className="text-[0.7rem] text-red-500 mt-0.5">{fieldErrors.email}</div>}
              </div>
              <div>
                <label className="label"><T>City</T></label>
                <Combobox
                  value={modal.data.city || ''}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, city: e.target.value } })}
                  options={CITIES}
                  placeholder={tr("Select or type City")}
                />
              </div>
              <div>
                <label className="label"><T>Gothram</T></label>
                <Combobox
                  value={modal.data.gothram || ''}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, gothram: e.target.value } })}
                  options={GOTHRAMS}
                  placeholder={tr("Select or type Gothram")}
                />
              </div>
              <div>
                <label className="label"><T>Nakshatram</T></label>
                <Combobox
                  value={modal.data.nakshatram || ''}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, nakshatram: e.target.value } })}
                  options={NAKSHATRAMS}
                  placeholder={tr("Select or type Nakshatram")}
                />
              </div>
              <div><label className="label"><T>Date of Birth</T></label>
                <DateField className="input" value={modal.data.dob || ''} onChange={(e) => setModal({ ...modal, data: { ...modal.data, dob: e.target.value } })} />
              </div>
              <div><label className="label"><T>Status</T></label>
                <Select className="input" value={modal.data.status || 'Active'} onChange={(e) => setModal({ ...modal, data: { ...modal.data, status: e.target.value } })}><option value="Active">{tr("Active")}</option><option value="Inactive">{tr("Inactive")}</option></Select>
              </div>
              <div><label className="label"><T>Preferred Language</T></label>
                <Select className="input" value={modal.data.preferred_language || 'English'} onChange={(e) => setModal({ ...modal, data: { ...modal.data, preferred_language: e.target.value } })}><option value="English">{tr("English")}</option><option value="Telugu">{tr("Telugu")}</option></Select>
              </div>
              <div className="sm:col-span-2"><label className="label"><T>Address</T></label><input className="input" value={modal.data.address || ''} onChange={(e) => setModal({ ...modal, data: { ...modal.data, address: e.target.value } })} /></div>
              <div className="sm:col-span-2"><label className="label"><T>Notes</T></label>
                <textarea rows={3} className="input" value={modal.data.notes || ''} onChange={(e) => setModal({ ...modal, data: { ...modal.data, notes: e.target.value } })} /></div>
            </div>
            {saveErr && <div className="mt-3 text-[0.75rem] text-red-600">{saveErr}</div>}
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => { setSaveErr(''); setModal(null) }} className="btn-outline"><T>Cancel</T></button>
              <button disabled={saving} className="btn-maroon disabled:opacity-60">{saving ? tr('Saving…') : (modal.mode === 'create' ? tr('Create Devotee') : tr('Save Changes'))}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function DevoteeDrawer({ d, tab, setTab, onClose }) {
  const { lang } = useLang()
  const temple = useTemple()
  const dev = d.devotee || {}
  const initials = (dev.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  const bookings = d.bookings || []
  const donations = d.donations || []
  const annadanam = d.annadanam || []
  const auction = d.auction || []
  const stats = d.stats || { bookings: { count: 0 }, donations: { amount: 0 }, annadanam: { persons: 0 }, auction: { count: 0 } }

  const recent = useMemo(() => {
    const items = [
      ...bookings.map((b) => ({ icon: Flame, tone: 'bg-blue-50 text-blue-600', title: 'Pooja Booking', sub: `${b.pooja}${b.plan ? ` (${b.plan})` : ''}`, date: b.scheduled_date || b.booked_on, amount: b.amount })),
      ...donations.map((x) => ({ icon: HandHeart, tone: 'bg-emerald-50 text-emerald-600', title: 'Donation', sub: x.fund, date: x.date, amount: x.amount })),
      ...annadanam.map((a) => ({ icon: UtensilsCrossed, tone: 'bg-orange-50 text-orange-600', title: 'Annadanam Sponsorship', sub: `${a.plates} Beneficiaries`, date: a.date, amount: a.amount })),
      ...auction.map((a) => ({ icon: Gavel, tone: 'bg-violet-50 text-violet-600', title: 'Auction Purchase', sub: a.item, date: a.date, amount: a.amount })),
    ].filter((x) => x.date)
    items.sort((a, b) => new Date(b.date) - new Date(a.date))
    return items.slice(0, 6)
  }, [bookings, donations, annadanam, auction])

  const SUMMARY = [
    { icon: Flame, tone: 'bg-orange-50 text-orange-600', label: 'Pooja Bookings', value: num(stats.bookings?.count || 0) },
    { icon: HandHeart, tone: 'bg-emerald-50 text-emerald-600', label: 'Donations', value: inr(stats.donations?.amount || 0) },
    { icon: UtensilsCrossed, tone: 'bg-amber-50 text-amber-600', label: 'Annadanam', value: num(stats.annadanam?.persons || 0), sub: 'Beneficiaries' },
    { icon: Gavel, tone: 'bg-violet-50 text-violet-600', label: 'Auction Purchases', value: num(stats.auction?.count || 0) },
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end print:static print:block">
      <div className="absolute inset-0 bg-black/30 print:hidden" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl flex flex-col print:max-w-none print:shadow-none print:overflow-visible">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between print:hidden">
          <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Devotee Details</T></h3>
            <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>View devotee profile and activity history.</T></p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 flex-1 print:hidden">
          {/* Identity */}
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-amber-50 grid place-items-center text-amber-700 text-xl font-bold shrink-0">{initials}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap"><span className="font-bold text-lg text-gray-800">{personName(dev, lang)}</span>
                <Pill tone={dev.status === 'Active' ? 'green' : 'gray'}>{dev.status}</Pill></div>
              <div className="mt-1.5 space-y-1 text-[0.8125rem] text-gray-600">
                <div className="flex items-center gap-2"><Phone size={13} className="text-maroon-500" /> {dev.mobile}</div>
                {dev.email && <div className="flex items-center gap-2"><Mail size={13} className="text-maroon-500" /> {dev.email}</div>}
              </div>
            </div>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 mt-5 pt-5 border-t border-gray-100">
            <Meta label={tr("Devotee ID")} value={dev.code} />
            <Meta label={tr("City / Location")} value={dev.city || '—'} />
            <Meta label={tr("Address")} value={dev.address || '—'} wide />
            <Meta label={tr("Email")} value={dev.email || '—'} />
            <Meta label={tr("Registered On")} value={fmtDate(dev.registered_on)} />
            <Meta label={tr("Status")} value={<Pill tone={dev.status === 'Active' ? 'green' : 'gray'}>{dev.status}</Pill>} />
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-5 mt-5 border-b border-gray-100 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`pb-2.5 text-[0.8125rem] font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === t ? 'border-maroon-600 text-maroon-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>{t}</button>
            ))}
          </div>

          {tab === 'Overview' && (
            <div className="mt-5">
              <div className="text-[0.8125rem] font-bold text-gray-700 mb-3"><T>Activity Summary</T></div>
              <div className="grid grid-cols-4 gap-3">
                {SUMMARY.map((s) => {
                  const Icon = s.icon
                  return (
                    <div key={s.label} className="border border-gray-100 rounded-xl p-3 text-center">
                      <div className={`w-9 h-9 rounded-full grid place-items-center mx-auto ${s.tone}`}><Icon size={16} /></div>
                      <div className="text-[0.59375rem] uppercase tracking-wide text-gray-400 font-semibold mt-2 leading-tight">{s.label}</div>
                      <div className="text-[0.9375rem] font-extrabold text-gray-800 mt-1 leading-none">{s.value}</div>
                      {s.sub && <div className="text-[0.5625rem] text-gray-400 mt-0.5">{s.sub}</div>}
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between mt-6 mb-2">
                <div className="text-[0.8125rem] font-bold text-gray-700"><T>Recent Activities</T></div>
                <Link to={`/admin/devotees/${dev.id}`} className="text-[0.75rem] font-semibold text-maroon-600 hover:underline"><T>View full profile →</T></Link>
              </div>
              <div className="divide-y divide-gray-100">
                {recent.map((r, i) => {
                  const Icon = r.icon
                  return (
                    <div key={i} className="flex items-center gap-3 py-2.5">
                      <div className={`w-8 h-8 rounded-full grid place-items-center shrink-0 ${r.tone}`}><Icon size={15} /></div>
                      <div className="min-w-0 flex-1"><div className="text-[0.8125rem] font-semibold text-gray-800 leading-tight">{r.title}</div><div className="text-[0.71875rem] text-gray-400 truncate">{r.sub}</div></div>
                      <div className="text-right shrink-0"><div className="text-[0.75rem] text-gray-500 whitespace-nowrap">{fmtDate(r.date)}</div><div className="text-[0.78125rem] font-bold text-gray-700">{inr(r.amount)}</div></div>
                      <ChevronRight size={15} className="text-gray-300 shrink-0" />
                    </div>
                  )
                })}
                {recent.length === 0 && <div className="py-8 text-center text-gray-600 text-sm"><T>No recent activities.</T></div>}
              </div>
            </div>
          )}

          {tab === 'Pooja History' && (
            <DrawerTable cols={['Booking ID', 'Pooja', 'Plan', 'Date', 'Amount', 'Status']} empty={tr("No pooja bookings.")}>
              {bookings.map((b) => (
                <tr key={b.booking_code} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 font-mono text-[0.71875rem] text-gray-500">{b.booking_code}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{b.pooja}</td>
                  <td className="px-3 py-2.5"><Pill tone={PLAN_TONE[b.plan] || 'gray'}>{b.plan || '—'}</Pill></td>
                  <td className="px-3 py-2.5 text-gray-500 text-[0.75rem]">{fmtDate(b.scheduled_date)}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{inr(b.amount)}</td>
                  <td className="px-3 py-2.5"><Pill tone={STATUS_TONE[b.status] || 'gray'}>{b.status}</Pill></td>
                </tr>
              ))}
            </DrawerTable>
          )}

          {tab === 'Donation History' && (
            <DrawerTable cols={['Receipt', 'Category', 'Type', 'Amount', 'Date']} empty={tr("No donations.")}>
              {donations.map((x) => (
                <tr key={x.receipt_no} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 font-mono text-[0.71875rem] text-maroon-600">{x.receipt_no}</td>
                  <td className="px-3 py-2.5 text-gray-700">{x.fund}</td>
                  <td className="px-3 py-2.5 text-gray-500">{x.type}</td>
                  <td className="px-3 py-2.5 font-semibold text-emerald-700">{inr(x.amount)}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-[0.75rem]">{fmtDate(x.date)}</td>
                </tr>
              ))}
            </DrawerTable>
          )}

          {tab === 'Other Activities' && (
            <DrawerTable cols={['Type', 'Detail', 'Amount', 'Date']} empty={tr("No other activities.")}>
              {[...annadanam.map((a) => ({ k: 'an' + a.code, type: 'Annadanam', detail: `${a.plates} Beneficiaries · ${a.occasion || ''}`, amount: a.amount, date: a.date })),
                ...auction.map((a) => ({ k: 'au' + a.code, type: 'Auction', detail: a.item, amount: a.amount, date: a.date }))].map((r) => (
                <tr key={r.k} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{r.type}</td>
                  <td className="px-3 py-2.5 text-gray-600">{r.detail}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{inr(r.amount)}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-[0.75rem]">{fmtDate(r.date)}</td>
                </tr>
              ))}
            </DrawerTable>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white print:hidden">
          <button onClick={() => printDevoteeSummary(dev, stats, temple)} className="btn-outline flex-1 justify-center"><Printer size={15} />{' '}<T>Print Devotee Summary</T></button>
          <button onClick={onClose} className="btn-maroon flex-1 justify-center"><T>Close</T></button>
        </div>

        {/* Print-only Devotee Summary - Hidden on screen via CSS, visible only when printing */}
        <div id="print-area">
          <div style={{ width: '170mm', margin: '0 auto', fontFamily: 'Arial, sans-serif', color: '#000', lineHeight: '1.8' }}>

            {/* Temple Header - No Border */}
            <div style={{ padding: '15px 20px', marginBottom: '25px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>🛕</div>
              <div style={{ fontWeight: 'bold', fontSize: '22px', marginBottom: '5px' }}>{temple?.name || 'Sri Shirdi Sai Baba Temple'}</div>
              <div style={{ fontSize: '14px', color: '#333' }}>{temple?.address || 'Dwarkapuri Colony, Punjagutta, Hyderabad, Telangana'}</div>
            </div>

            {/* Devotee Details - Bordered with Title */}
            <div style={{ border: '2px solid #000', marginBottom: '20px' }}>
              <div style={{ background: '#f5f5f5', borderBottom: '2px solid #000', padding: '12px 20px', textAlign: 'center' }}>
                <div style={{ fontWeight: 'bold', fontSize: '18px', textTransform: 'uppercase', letterSpacing: '2px' }}>Devotee Summary</div>
                <div style={{ fontSize: '13px', color: '#555', marginTop: '5px' }}>ID: {dev.code}</div>
              </div>
              <table style={{ width: '100%', fontSize: '16px', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={{ padding: '12px 20px', color: '#555', width: '150px', borderBottom: '1px solid #ddd' }}>Name:</td><td style={{ padding: '12px 20px', fontWeight: '600', borderBottom: '1px solid #ddd' }}>{personName(dev, lang)}</td></tr>
                  <tr><td style={{ padding: '12px 20px', color: '#555', borderBottom: '1px solid #ddd' }}>Phone:</td><td style={{ padding: '12px 20px', borderBottom: '1px solid #ddd' }}>{dev.mobile || '—'}</td></tr>
                  <tr><td style={{ padding: '12px 20px', color: '#555', borderBottom: '1px solid #ddd' }}>Email:</td><td style={{ padding: '12px 20px', borderBottom: '1px solid #ddd' }}>{dev.email || '—'}</td></tr>
                  <tr><td style={{ padding: '12px 20px', color: '#555', borderBottom: '1px solid #ddd' }}>City:</td><td style={{ padding: '12px 20px', borderBottom: '1px solid #ddd' }}>{dev.city || '—'}</td></tr>
                  <tr><td style={{ padding: '12px 20px', color: '#555', borderBottom: '1px solid #ddd' }}>Registered On:</td><td style={{ padding: '12px 20px', borderBottom: '1px solid #ddd' }}>{fmtDate(dev.registered_on)}</td></tr>
                  <tr><td style={{ padding: '12px 20px', color: '#555' }}>Status:</td><td style={{ padding: '12px 20px', fontWeight: '600' }}>{dev.status}</td></tr>
                </tbody>
              </table>
            </div>

            {/* Activity Summary - Bordered */}
            <div style={{ border: '2px solid #000', marginBottom: '25px' }}>
              <div style={{ background: '#f5f5f5', borderBottom: '2px solid #000', padding: '12px 20px', textAlign: 'center' }}>
                <div style={{ fontWeight: 'bold', fontSize: '18px', textTransform: 'uppercase', letterSpacing: '2px' }}>Activity Summary</div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ borderRight: '1px solid #ccc', borderBottom: '1px solid #ccc', padding: '15px 10px', fontSize: '14px', fontWeight: '600' }}>Pooja Bookings</th>
                    <th style={{ borderRight: '1px solid #ccc', borderBottom: '1px solid #ccc', padding: '15px 10px', fontSize: '14px', fontWeight: '600' }}>Donations</th>
                    <th style={{ borderRight: '1px solid #ccc', borderBottom: '1px solid #ccc', padding: '15px 10px', fontSize: '14px', fontWeight: '600' }}>Annadanam</th>
                    <th style={{ borderBottom: '1px solid #ccc', padding: '15px 10px', fontSize: '14px', fontWeight: '600' }}>Auction</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ borderRight: '1px solid #ccc', padding: '20px 10px', textAlign: 'center', fontWeight: 'bold', fontSize: '28px' }}>{stats.bookings?.count || 0}</td>
                    <td style={{ borderRight: '1px solid #ccc', padding: '20px 10px', textAlign: 'center', fontWeight: 'bold', fontSize: '28px' }}>{stats.donations?.count || 0}</td>
                    <td style={{ borderRight: '1px solid #ccc', padding: '20px 10px', textAlign: 'center', fontWeight: 'bold', fontSize: '28px' }}>{stats.annadanam?.persons || 0}</td>
                    <td style={{ padding: '20px 10px', textAlign: 'center', fontWeight: 'bold', fontSize: '28px' }}>{stats.auction?.count || 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer - No Border */}
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{ fontWeight: '600', fontSize: '18px', color: '#000' }}>|| Om Sri Sai Ram ||</div>
              <div style={{ fontSize: '13px', color: '#000', marginTop: '10px' }}>This is a computer-generated summary.</div>
              <div style={{ fontSize: '13px', color: '#000', marginTop: '5px' }}>Printed on: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value, wide }) {
  value = typeof value === 'string' ? teText(value) : value

  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[0.6875rem] text-gray-400 mb-0.5">{label}</div>
      <div className="text-[0.8125rem] text-gray-800 font-medium">{value ?? '—'}</div>
    </div>
  )
}
function DrawerTable({ cols, children, empty }) {
  const body = React.Children.toArray(children)
  return (
    <div className="mt-5 border border-gray-100 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className="bg-gray-50/70 text-left text-[0.65625rem] uppercase tracking-wide text-gray-700">{cols.map((c) => <th key={c} className="px-3 py-2.5 font-semibold whitespace-nowrap">{tr(c)}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">{body.length ? body : <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-gray-600">{empty}</td></tr>}</tbody>
      </table>
    </div>
  )
}
