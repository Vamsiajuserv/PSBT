import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  Landmark, Settings as SettingsIcon, Users as UsersIcon, FileText, Shield,
  ChevronDown, ChevronRight, Save, Upload, CheckCircle2, Info, AlertTriangle, CalendarClock, Plus, X, Bell, HandHeart,
} from 'lucide-react'
import { PageTitle } from '../../components/admin/ui.jsx'
import { LoadingBlock, ErrorBlock } from '../../components/common/states.jsx'
import { SettingsAPI, getErrorMessage } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Select } from '../../components/common/Field.jsx'
import { T, tr, trLocal, stamp, personName, useLang, teText } from '../../i18n/LanguageContext.jsx'

const CATS = [
  {
    key: 'temple', title: tr('Temple Information'), desc: tr('Manage temple details, address and contact information.'),
    icon: Landmark, color: '#8a1c1c', bg: 'bg-maroon-50',
    subs: [
      { key: 'basic', label: tr('Basic Information'), subtitle: tr('Manage basic information about the temple.'),
        fields: [
          { k: 'temple_name', label: tr('Temple Name'), req: true }, { k: 'short_name', label: tr('Short Name'), req: true },
          { k: 'established_year', label: tr('Established Year') }, { k: 'registration_number', label: tr('Registration Number') },
          { k: 'trust_name', label: tr('Trust / Organization Name') }, { k: 'gst_number', label: tr('GST Number') },
          { k: 'about', label: tr('About Temple'), type: 'textarea', full: true, max: 250 },
        ] },
      { key: 'address', label: tr('Address Details'), subtitle: tr('Manage the temple address.'),
        fields: [{ k: 'address_line', label: tr('Address'), full: true }, { k: 'city', label: tr('City') }, { k: 'state', label: tr('State') }, { k: 'pincode', label: tr('Pincode') },
          { k: 'address_te', label: tr('Address (Telugu)'), full: true, telugu: true,
            hint: tr('Shown on the public site when a visitor selects తెలుగు. Leave blank to fall back to the English address.') }] },
      { key: 'contact', label: tr('Contact Details'), subtitle: tr('Manage contact information.'),
        fields: [{ k: 'phone', label: tr('Phone') }, { k: 'email', label: tr('Email') }, { k: 'website', label: tr('Website') }] },
      { key: 'bank', label: tr('Bank Details'), subtitle: tr('Manage bank account for deposits.'),
        fields: [{ k: 'bank_name', label: tr('Bank Name') }, { k: 'account_number', label: tr('Account Number') }, { k: 'ifsc', label: tr('IFSC Code') }, { k: 'account_name', label: tr('Account Holder Name') }] },
      { key: 'timings', label: tr('Temple Timings'), subtitle: tr('Manage darshan timings.'),
        fields: [{ k: 'timings_morning', label: tr('Morning Timings') }, { k: 'timings_evening', label: tr('Evening Timings') }] },
    ],
  },
  {
    key: 'general', title: tr('General Settings'), desc: tr('Configure general system settings and preferences.'),
    icon: SettingsIcon, color: '#059669', bg: 'bg-emerald-50',
    subs: [{ key: 'prefs', label: tr('Preferences'), subtitle: tr('Configure general preferences.'),
      fields: [{ k: 'currency', label: tr('Currency') },
        { k: 'default_language', label: tr('Default Language'), type: 'select', options: ['English', 'Telugu'] }] }],
  },
  {
    key: 'userrole', title: tr('User & Role Settings'), desc: tr('Manage users, roles and permissions.'),
    icon: UsersIcon, color: '#7c3aed', bg: 'bg-violet-50',
    subs: [{ key: 'roles', label: tr('Roles & Permissions'), subtitle: tr('Manage default role for new users.'),
      fields: [{ k: 'default_role', label: tr('Default New-User Role'), type: 'select', options: ['Administrator', 'Counter Staff', 'Poojari', 'Accountant', 'Committee'] }] }],
  },
  {
    key: 'receipt', title: tr('Receipt Settings'), desc: tr('Configure the receipt footer note.'),
    icon: FileText, color: '#d97706', bg: 'bg-amber-50',
    subs: [{ key: 'config', label: tr('Receipt Configuration'), subtitle: tr('Configure the note printed at the bottom of every receipt.'),
      fields: [{ k: 'receipt_footer_note', label: tr('Footer Note'), type: 'textarea', full: true }] }],
  },
  {
    key: 'alerts', title: tr('Staff Alerts'), desc: tr('Configure when the bell alerts the Administrator about a donation.'),
    icon: Bell, color: '#b45309', bg: 'bg-orange-50',
    subs: [{ key: 'donations', label: tr('Donation Alerts'), subtitle: tr('Medical, gold / silver, material, sponsorship and annadanam donations always alert.'),
      fields: [{ k: 'alert_big_donation_amount', label: tr('Big Donation Alert (₹)'), type: 'number',
        hint: tr('A cash donation of this amount or more alerts the Administrator. 0 = no alert.') }] }],
  },
  {
    // 2026-11-15: values the temple may need to change, with plain explanations (no IT team to edit code)
    key: 'donations', title: tr('Donations & Payments'), desc: tr('UPI, banks, the annadanam rate and the rules the counter follows for donations.'),
    icon: HandHeart, color: '#047857', bg: 'bg-emerald-50',
    subs: [
      { key: 'upi', label: tr('UPI Payments'), subtitle: tr('The QR code shown at Counter Billing and Advance Booking.'),
        fields: [
          { k: 'upi_id', label: tr('UPI ID'), hint: tr('Like templename@sbi — devotees pay to this ID when they scan the QR code.') },
          { k: 'upi_payee_name', label: tr('Payee Name'), hint: tr("The name devotees see in their UPI app before paying.") },
        ] },
      { key: 'rules', label: tr('Donation Rules'), subtitle: tr('How the counter records donations and annadanam.'),
        fields: [
          { k: 'annadanam_rate', label: tr('Annadanam Rate per Person (₹)'), type: 'number', placeholder: '50',
            hint: tr('Charged for each person in an annadanam. The counter cannot change it — anything extra is recorded as a separate donation.') },
          { k: 'donation_backdate_days', label: tr('Days Back for Late Entries'), type: 'number', placeholder: '7',
            hint: tr("Counter Staff record today's donations only. The Administrator may enter a missed donation up to this many days back. 0 = today only.") },
          { k: 'donation_confirm_amount', label: tr('Confirm Donations Above (₹)'), type: 'number', placeholder: '100000',
            hint: tr('A donation above this amount asks the counter "Is the amount right?" before saving — it catches typing mistakes. 0 = never asks.') },
        ] },
      { key: 'banks', label: tr('Banks'), subtitle: tr('Banks offered when Hundi cash is deposited.'),
        fields: [{ k: 'bank_list', label: tr('Bank Names'), type: 'textarea', hint: tr('One bank per line (or separated by commas).') }] },
    ],
  },
  {
    key: 'booking', title: tr('Pooja Booking Settings'), desc: tr('Configure pooja time slots and how far ahead poojas can be booked.'),
    icon: CalendarClock, color: '#be185d', bg: 'bg-pink-50',
    subs: [{ key: 'rules', label: tr('Booking Rules'), subtitle: tr('Time slots offered in Advance Booking and the advance booking window.'),
      fields: [
        { k: 'pooja_time_slots', label: tr('Pooja Time Slots'), type: 'slots', full: true,
          hint: tr("Offered in Advance Booking. Today's slots are hidden once they end.") },
        { k: 'advance_booking_max_days', label: tr('Maximum Days Ahead'), type: 'number', placeholder: '90',
          hint: tr('How many days ahead a pooja can be booked. Leave blank for the default of 90 days.') },
      ] }],
  },
  {
    key: 'security', title: tr('Security Settings'), desc: tr('Manage login policy and security preferences.'),
    icon: Shield, color: '#2563eb', bg: 'bg-blue-50',
    subs: [{ key: 'login', label: tr('Login Policy'), subtitle: tr('Lock an account after too many failed sign-in attempts.'),
      fields: [{ k: 'max_login_attempts', label: tr('Max Login Attempts') }] }],
  },
]

// The audit fields hold either a role ("Administrator") or a real person's name.
// A role belongs in the dictionary; a name is transliterated. tr() echoes its
// input on a miss, so that echo is what tells the two apart.
function roleOrName(value, lang) {
  if (!value) return '—'
  const asTerm = tr(value)
  return asTerm !== value ? asTerm : personName({ name: value }, lang)
}

// Slots are stored as "06:00 AM - 07:00 AM" lines; edited here with 24h time pickers.
const to24 = (t) => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((t || '').trim())
  if (!m) return ''
  let h = Number(m[1]) % 12
  if (m[3].toUpperCase() === 'PM') h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}
const to12 = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function SlotsEditor({ value, onChange }) {
  const rows = value.split('\n').filter((l) => l.trim()).map((l) => {
    const [a = '', b = ''] = l.split(' - ')
    return { start: to24(a), end: to24(b) }
  })
  const emit = (next) => onChange(next.map((r) => `${to12(r.start)} - ${to12(r.end)}`).join('\n'))
  const update = (i, k, v) => emit(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const bad = !r.start || !r.end || r.end <= r.start
        return (
          <div key={i} className="flex items-center gap-2">
            <input type="time" className={`input !w-36 ${bad ? 'border-red-400' : ''}`} value={r.start} onChange={(e) => update(i, 'start', e.target.value)} aria-label={tr('Start time')} />
            <span className="text-gray-400">–</span>
            <input type="time" className={`input !w-36 ${bad ? 'border-red-400' : ''}`} value={r.end} onChange={(e) => update(i, 'end', e.target.value)} aria-label={tr('End time')} />
            <button type="button" onClick={() => emit(rows.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600 p-1" aria-label={tr('Remove slot')}><X size={16} /></button>
            {bad && <span className="text-[0.6875rem] text-red-600"><T>End time must be after start time</T></span>}
          </div>
        )
      })}
      <button type="button" onClick={() => emit([...rows, { start: '09:00', end: '10:00' }])} className="btn-outline !py-1.5 text-sm"><Plus size={14} /> <T>Add Slot</T></button>
    </div>
  )
}

// Same rules as the server's _TEMPLE_FORMATS (routers/settings.py)
const TEMPLE_FORMATS = [
  ['phone', /^\+?[\d\s\-()]{10,20}$/, 'The temple phone number looks wrong — like +91 040 2335 3589 or 9876543210.'],
  ['email', /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/, 'The temple email looks wrong — like name@gmail.com.'],
  ['website', /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/, 'The website looks wrong — like www.saibabatemple.org.'],
  ['pincode', /^[1-9]\d{5}$/, 'The pincode must be 6 digits.'],
  ['ifsc', /^[A-Z]{4}0[A-Z0-9]{6}$/, 'The IFSC code looks wrong — 11 characters like SBIN0001234.'],
  ['gst_number', /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'The GST number looks wrong — 15 characters like 36AAAAA0000A1Z5.'],
  ['account_number', /^\d{9,18}$/, 'The bank account number must be 9 to 18 digits.'],
]

export default function Settings() {
  const { lang } = useLang()
  const { user } = useAuth()
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)
  const [data, setData] = useState(null)
  const [cat, setCat] = useState('temple')
  const [sub, setSub] = useState('basic')
  const [open, setOpen] = useState({ temple: true })
  const [saved, setSaved] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [saveErr, setSaveErr] = useState('')
  const [fieldErrs, setFieldErrs] = useState({})   // each wrong Temple Information field, all at once (2026-11-26)
  // What the server last returned — Save sends only the fields changed since,
  // never the records other modules keep in the same settings table.
  const loaded = useRef({})
  const receive = useCallback((d) => { loaded.current = d || {}; setData(d) }, [])

  const loadSettings = useCallback(() => {
    setLoadErr('')
    SettingsAPI.get().then(receive).catch((ex) => {
      setLoadErr(getErrorMessage(ex, tr("Couldn't load settings — check your connection and retry.")))
    })
  }, [receive])
  useEffect(() => { loadSettings() }, [loadSettings])

  const category = CATS.find((c) => c.key === cat)
  const section = category?.subs.find((s) => s.key === sub) || category?.subs[0]
  const set = (k, v) => setData((d) => ({ ...d, [k]: v }))

  async function save() {
    setSaveErr('')
    const changed = Object.fromEntries(Object.entries(data).filter(([k, v]) => v !== loaded.current[k]))
    // Temple Information formats (client, 2026-11-26) — the server checks the same; blank is allowed.
    // Every wrong field is marked together, each with its own message.
    const errs = {}
    for (const [k, re, msg] of TEMPLE_FORMATS) {
      const v = String(changed[k] ?? '').trim()
      if (k in changed && v && (!re.test(k === 'ifsc' || k === 'gst_number' ? v.toUpperCase() : v) || (k === 'phone' && v.replace(/\D/g, '').length < 10))) {
        errs[k] = tr(msg)
      }
    }
    setFieldErrs(errs)
    const wrong = Object.keys(errs)
    if (wrong.length === 1) { setSaveErr(errs[wrong[0]]); return }
    if (wrong.length > 1) {
      const labelOf = (k) => CATS.flatMap((c) => c.subs).flatMap((x) => x.fields || []).find((f) => f.k === k)?.label || k
      setSaveErr(`${tr('Please fix the errors above.')} (${wrong.map((k) => tr(labelOf(k))).join(', ')})`); return
    }
    try {
      const res = await SettingsAPI.update(changed)
      receive(res); setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (ex) {
      setSaveErr(getErrorMessage(ex, tr('Could not save settings — check your connection and try again.')))
    }
  }

  function selectCat(c) { setCat(c.key); setSub(c.subs[0].key); setOpen((o) => ({ ...o, [c.key]: true })) }

  if (loadErr) return <ErrorBlock message={loadErr} onRetry={loadSettings} />
  if (!data) return <LoadingBlock />

  return (
    <div>
      <PageTitle title={tr("Settings")} subtitle={tr("Manage temple system settings and configurations.")} />

      {/* Settings Categories */}
      <div className="text-[0.9375rem] font-bold text-maroon-800 mb-3"><T>Settings Categories</T></div>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {CATS.map((c) => {
          const Icon = c.icon; const on = cat === c.key
          return (
            <button key={c.key} onClick={() => selectCat(c)}
              className={`relative bg-white rounded-xl border p-4 text-left transition-colors ${on ? 'border-maroon-400 ring-1 ring-maroon-200' : 'border-gray-100 hover:border-maroon-200'}`}>
              {on && <CheckCircle2 size={16} className="absolute top-3 right-3 text-maroon-600" />}
              <div className={`w-11 h-11 rounded-full grid place-items-center ${c.bg}`} style={{ color: c.color }}><Icon size={20} /></div>
              <div className="text-[0.8125rem] font-bold text-gray-800 mt-2.5">{tr(c.title)}</div>
              <div className="text-[0.71875rem] text-gray-400 mt-1 leading-snug">{tr(c.desc)}</div>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        {/* Left accordion */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-2.5 h-max">
          {CATS.map((c) => {
            const Icon = c.icon; const isOpen = open[c.key]
            return (
              <div key={c.key}>
                <button onClick={() => { setOpen((o) => ({ ...o, [c.key]: !isOpen })); if (!isOpen) selectCat(c) }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[0.84375rem] font-semibold ${cat === c.key ? 'text-maroon-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <Icon size={17} style={{ color: c.color }} /> <span className="flex-1 text-left">{tr(c.title)}</span>
                  {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
                {isOpen && (
                  <div className="ml-3 pl-3 border-l border-gray-100 mb-1 space-y-0.5">
                    {c.subs.map((s) => (
                      <button key={s.key} onClick={() => { setCat(c.key); setSub(s.key) }}
                        className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-[0.8125rem] transition-colors ${cat === c.key && sub === s.key ? 'bg-maroon-50 text-maroon-700 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <span className="w-1 h-1 rounded-full bg-current opacity-60" /> {tr(s.label)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Right panel */}
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="font-serif text-lg font-bold text-maroon-800">{tr(section.label)}</h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5">{tr(section.subtitle)}</p>
              </div>
              {isAdmin && <button onClick={save} className="btn-maroon !py-2.5"><Save size={15} />{' '}<T>Save Changes</T></button>}
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
              {section.fields.map((f) => (
                <div key={f.k} className={f.full || f.type === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : ''}>
                  <label className="block text-[0.78125rem] font-medium text-gray-600 mb-1.5">{tr(f.label)} {f.req && <span className="text-red-500">*</span>}</label>
                  {f.type === 'textarea' ? (
                    <>
                      <textarea className="input min-h-[5rem]" maxLength={f.max} value={data[f.k] || ''} onChange={(e) => set(f.k, e.target.value)} />
                      {f.max && <div className="text-right text-[0.6875rem] text-gray-400 mt-0.5">{(data[f.k] || '').length} / {f.max}</div>}
                      {/* The box holds the saved (English) text; show its Telugu reading beneath it. */}
                      {lang === 'te' && trLocal(data[f.k]) && (
                        <p className="text-[0.75rem] text-gray-500 mt-1"><T>Shown in Telugu as</T>: {trLocal(data[f.k])}</p>
                      )}
                    </>
                  ) : f.type === 'slots' ? (
                    <SlotsEditor value={data[f.k] || ''} onChange={(v) => set(f.k, v)} />
                  ) : f.type === 'number' ? (
                    <input className="input" inputMode="numeric" placeholder={f.placeholder || tr('No limit')} value={data[f.k] || ''} onChange={(e) => set(f.k, e.target.value.replace(/\D/g, ''))} />
                  ) : f.type === 'select' ? (
                    <Select className="input" value={data[f.k] || ''} onChange={(e) => set(f.k, e.target.value)}>{f.options.map((o) => <option key={o} value={o}>{tr(o)}</option>)}</Select>
                  ) : (
                    <input className={`input ${f.telugu ? 'font-telugu' : ''} ${fieldErrs[f.k] ? 'border-red-400 ring-1 ring-red-300' : ''}`} value={data[f.k] || ''}
                      onChange={(e) => { set(f.k, e.target.value); if (fieldErrs[f.k]) setFieldErrs(({ [f.k]: _, ...rest }) => rest) }} />
                  )}
                  {fieldErrs[f.k] && <div className="text-[0.71875rem] text-red-600 mt-1">{fieldErrs[f.k]}</div>}
                  {f.hint && <div className="text-[0.6875rem] text-gray-400 mt-1"><T>{f.hint}</T></div>}
                </div>
              ))}
            </div>

            {saved &&<div className="mt-4 text-[0.8125rem] text-emerald-700 flex items-center gap-2"><CheckCircle2 size={15} />{' '}<T>Settings saved successfully.</T></div>}
            {saveErr && <div className="mt-4 text-[0.8125rem] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-2"><AlertTriangle size={15} /> {saveErr}</div>}
          </div>

          {/* Audit Information */}
          <div className="bg-gray-50/70 rounded-xl border border-gray-100 px-5 py-4">
            <div className="flex items-center gap-2 text-maroon-700 font-semibold text-[0.84375rem] mb-3"><Info size={15} />{' '}<T>Audit Information</T></div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-[0.8125rem]">
              <Meta label={tr("Created By")} value={roleOrName(data.created_by, lang)} />
              <Meta label={tr("Created On")} value={stamp(data.created_on)} />
              <Meta label={tr("Last Updated By")} value={roleOrName(data.updated_by, lang)} />
              <Meta label={tr("Last Updated On")} value={stamp(data.updated_at) || '—'} />
            </div>
          </div>
          <div className="flex items-center gap-2 text-[0.8125rem] text-gray-500 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-2.5">
            <Info size={15} className="text-blue-500" />{' '}<T>Changes will be applied to the system settings.</T>{' '}</div>
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value }) {
  value = typeof value === 'string' ? teText(value) : value

  return (
    <div>
      <div className="text-[0.6875rem] text-gray-400">{label}</div>
      <div className="text-[0.8125rem] text-gray-800 font-medium mt-0.5">{value || '—'}</div>
    </div>
  )
}
