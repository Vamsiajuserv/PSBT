import React, { useEffect, useState, useCallback } from 'react'
import {
  Landmark, Settings as SettingsIcon, Users as UsersIcon, FileText, Shield, Database,
  ChevronDown, ChevronRight, Save, Upload, CheckCircle2, Info, AlertTriangle,
} from 'lucide-react'
import { PageTitle } from '../../components/admin/ui.jsx'
import { LoadingBlock, ErrorBlock } from '../../components/common/states.jsx'
import { SettingsAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Select } from '../../components/common/Field.jsx'

const CATS = [
  {
    key: 'temple', title: 'Temple Information', desc: 'Manage temple details, address and contact information.',
    icon: Landmark, color: '#8a1c1c', bg: 'bg-maroon-50',
    subs: [
      { key: 'basic', label: 'Basic Information', subtitle: 'Manage basic information about the temple.', logos: true,
        fields: [
          { k: 'temple_name', label: 'Temple Name', req: true }, { k: 'short_name', label: 'Short Name', req: true },
          { k: 'established_year', label: 'Established Year' }, { k: 'registration_number', label: 'Registration Number' },
          { k: 'trust_name', label: 'Trust / Organization Name' }, { k: 'gst_number', label: 'GST Number' },
          { k: 'about', label: 'About Temple', type: 'textarea', full: true, max: 250 },
        ] },
      { key: 'address', label: 'Address Details', subtitle: 'Manage the temple address.',
        fields: [{ k: 'address_line', label: 'Address', full: true }, { k: 'city', label: 'City' }, { k: 'state', label: 'State' }, { k: 'pincode', label: 'Pincode' }] },
      { key: 'contact', label: 'Contact Details', subtitle: 'Manage contact information.',
        fields: [{ k: 'phone', label: 'Phone' }, { k: 'email', label: 'Email' }, { k: 'website', label: 'Website' }] },
      { key: 'bank', label: 'Bank Details', subtitle: 'Manage bank account for deposits.',
        fields: [{ k: 'bank_name', label: 'Bank Name' }, { k: 'account_number', label: 'Account Number' }, { k: 'ifsc', label: 'IFSC Code' }, { k: 'account_name', label: 'Account Holder Name' }] },
      { key: 'timings', label: 'Temple Timings', subtitle: 'Manage darshan timings.',
        fields: [{ k: 'timings_morning', label: 'Morning Timings' }, { k: 'timings_evening', label: 'Evening Timings' }] },
    ],
  },
  {
    key: 'general', title: 'General Settings', desc: 'Configure general system settings and preferences.',
    icon: SettingsIcon, color: '#059669', bg: 'bg-emerald-50',
    subs: [{ key: 'prefs', label: 'Preferences', subtitle: 'Configure general preferences.',
      fields: [{ k: 'currency', label: 'Currency' }, { k: 'date_format', label: 'Date Format' },
        { k: 'default_language', label: 'Default Language', type: 'select', options: ['English', 'Telugu'] },
        { k: 'financial_year_start', label: 'Financial Year Start' }] }],
  },
  {
    key: 'userrole', title: 'User & Role Settings', desc: 'Manage users, roles and permissions.',
    icon: UsersIcon, color: '#7c3aed', bg: 'bg-violet-50',
    subs: [{ key: 'roles', label: 'Roles & Permissions', subtitle: 'Manage default role for new users.',
      fields: [{ k: 'default_role', label: 'Default New-User Role', type: 'select', options: ['Administrator', 'Counter Staff', 'Poojari', 'Accountant', 'Committee'] }] }],
  },
  {
    key: 'receipt', title: 'Receipt Settings', desc: 'Configure receipt template, numbering and logo.',
    icon: FileText, color: '#d97706', bg: 'bg-amber-50',
    subs: [{ key: 'config', label: 'Receipt Configuration', subtitle: 'Configure receipt numbering and template.',
      fields: [{ k: 'receipt_prefix', label: 'Receipt Prefix' }, { k: 'receipt_start_number', label: 'Start Number' },
        { k: 'receipt_footer_note', label: 'Footer Note', type: 'textarea', full: true }] }],
  },
  {
    key: 'security', title: 'Security Settings', desc: 'Manage login policy and security preferences.',
    icon: Shield, color: '#2563eb', bg: 'bg-blue-50',
    subs: [{ key: 'login', label: 'Login Policy', subtitle: 'Manage login and security preferences.',
      fields: [{ k: 'session_timeout_minutes', label: 'Session Timeout (minutes)' }, { k: 'max_login_attempts', label: 'Max Login Attempts' },
        ] }],
  },
  {
    key: 'backup', title: 'Backup Settings', desc: 'Configure automatic backup and data retention.',
    icon: Database, color: '#8a1c1c', bg: 'bg-maroon-50',
    subs: [{ key: 'config', label: 'Backup Configuration', subtitle: 'Configure automatic backup and retention.',
      fields: [{ k: 'auto_backup', label: 'Automatic Backup', type: 'select', options: ['Enabled', 'Disabled'] },
        { k: 'backup_frequency', label: 'Backup Frequency', type: 'select', options: ['Daily', 'Weekly', 'Monthly'] },
        { k: 'retention_days', label: 'Retention (days)' }] }],
  },
]

export default function Settings() {
  const { user } = useAuth()
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)
  const [data, setData] = useState(null)
  const [cat, setCat] = useState('temple')
  const [sub, setSub] = useState('basic')
  const [open, setOpen] = useState({ temple: true })
  const [saved, setSaved] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [saveErr, setSaveErr] = useState('')

  const loadSettings = useCallback(() => {
    setLoadErr('')
    SettingsAPI.get().then(setData).catch((ex) => setLoadErr(ex?.detail || "Couldn't load settings — check your connection and retry."))
  }, [])
  useEffect(() => { loadSettings() }, [loadSettings])

  const category = CATS.find((c) => c.key === cat)
  const section = category?.subs.find((s) => s.key === sub) || category?.subs[0]
  const set = (k, v) => setData((d) => ({ ...d, [k]: v }))

  async function save() {
    setSaveErr('')
    try {
      const res = await SettingsAPI.update(data)
      setData(res); setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (ex) {
      setSaveErr(ex?.detail || 'Could not save settings — check your connection and try again.')
    }
  }

  function selectCat(c) { setCat(c.key); setSub(c.subs[0].key); setOpen((o) => ({ ...o, [c.key]: true })) }

  if (loadErr) return <ErrorBlock message={loadErr} onRetry={loadSettings} />
  if (!data) return <LoadingBlock />

  return (
    <div>
      <PageTitle title="Settings" subtitle="Manage temple system settings and configurations." />

      {/* Settings Categories */}
      <div className="text-[0.9375rem] font-bold text-maroon-800 mb-3">Settings Categories</div>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {CATS.map((c) => {
          const Icon = c.icon; const on = cat === c.key
          return (
            <button key={c.key} onClick={() => selectCat(c)}
              className={`relative bg-white rounded-xl border p-4 text-left transition-colors ${on ? 'border-maroon-400 ring-1 ring-maroon-200' : 'border-gray-100 hover:border-maroon-200'}`}>
              {on && <CheckCircle2 size={16} className="absolute top-3 right-3 text-maroon-600" />}
              <div className={`w-11 h-11 rounded-full grid place-items-center ${c.bg}`} style={{ color: c.color }}><Icon size={20} /></div>
              <div className="text-[0.8125rem] font-bold text-gray-800 mt-2.5">{c.title}</div>
              <div className="text-[0.71875rem] text-gray-400 mt-1 leading-snug">{c.desc}</div>
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
                  <Icon size={17} style={{ color: c.color }} /> <span className="flex-1 text-left">{c.title}</span>
                  {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
                {isOpen && (
                  <div className="ml-3 pl-3 border-l border-gray-100 mb-1 space-y-0.5">
                    {c.subs.map((s) => (
                      <button key={s.key} onClick={() => { setCat(c.key); setSub(s.key) }}
                        className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-[0.8125rem] transition-colors ${cat === c.key && sub === s.key ? 'bg-maroon-50 text-maroon-700 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <span className="w-1 h-1 rounded-full bg-current opacity-60" /> {s.label}
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
                <h3 className="font-serif text-lg font-bold text-maroon-800">{section.label}</h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5">{section.subtitle}</p>
              </div>
              {isAdmin && <button onClick={save} className="btn-maroon !py-2.5"><Save size={15} /> Save Changes</button>}
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
              {section.fields.map((f) => (
                <div key={f.k} className={f.full || f.type === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : ''}>
                  <label className="block text-[0.78125rem] font-medium text-gray-600 mb-1.5">{f.label} {f.req && <span className="text-red-500">*</span>}</label>
                  {f.type === 'textarea' ? (
                    <>
                      <textarea className="input min-h-[5rem]" maxLength={f.max} value={data[f.k] || ''} onChange={(e) => set(f.k, e.target.value)} />
                      {f.max && <div className="text-right text-[0.6875rem] text-gray-400 mt-0.5">{(data[f.k] || '').length} / {f.max}</div>}
                    </>
                  ) : f.type === 'select' ? (
                    <Select className="input" value={data[f.k] || ''} onChange={(e) => set(f.k, e.target.value)}>{f.options.map((o) => <option key={o}>{o}</option>)}</Select>
                  ) : (
                    <input className="input" value={data[f.k] || ''} onChange={(e) => set(f.k, e.target.value)} />
                  )}
                </div>
              ))}
            </div>

            {section.logos && (
              <div className="grid sm:grid-cols-2 gap-6 mt-7 pt-6 border-t border-gray-100">
                {[['temple_logo', 'Temple Logo', 'This logo will be used in the system and reports.'],
                  ['receipt_logo', 'Receipt Logo', 'This logo will be printed on all receipts.']].map(([k, title, note]) => (
                  <div key={k}>
                    <div className="text-[0.8125rem] font-bold text-maroon-700">{title}</div>
                    <div className="text-[0.75rem] text-gray-400 mb-3">{note}</div>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full border border-gray-200 grid place-items-center text-gray-300 bg-gray-50 overflow-hidden">
                        <Landmark size={26} />
                      </div>
                      <div>
                        {/* Honest input: file upload is not implemented server-side, so this
                            takes the logo image path/URL rather than pretending to upload. */}
                        <div className="text-[0.75rem] text-gray-500 mb-1">Logo image path / URL</div>
                        <input className="input !py-1.5 text-[0.8125rem]" placeholder="/babaimages/logo.png or https://…"
                               value={data[k] || ''} onChange={(e) => set(k, e.target.value)} />
                        <div className="text-[0.6875rem] text-gray-400 mt-1">Place the file in frontend/public and enter its path here.</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {saved && <div className="mt-4 text-[0.8125rem] text-emerald-700 flex items-center gap-2"><CheckCircle2 size={15} /> Settings saved successfully.</div>}
            {saveErr && <div className="mt-4 text-[0.8125rem] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-2"><AlertTriangle size={15} /> {saveErr}</div>}
          </div>

          {/* Audit Information */}
          <div className="bg-gray-50/70 rounded-xl border border-gray-100 px-5 py-4">
            <div className="flex items-center gap-2 text-maroon-700 font-semibold text-[0.84375rem] mb-3"><Info size={15} /> Audit Information</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-[0.8125rem]">
              <Meta label="Created By" value={data.created_by} />
              <Meta label="Created On" value={data.created_on} />
              <Meta label="Last Updated By" value={data.updated_by} />
              <Meta label="Last Updated On" value={data.updated_at || '—'} />
            </div>
          </div>
          <div className="flex items-center gap-2 text-[0.8125rem] text-gray-500 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-2.5">
            <Info size={15} className="text-blue-500" /> Changes will be applied to the system settings.
          </div>
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value }) {
  return (
    <div>
      <div className="text-[0.6875rem] text-gray-400">{label}</div>
      <div className="text-[0.8125rem] text-gray-800 font-medium mt-0.5">{value || '—'}</div>
    </div>
  )
}
