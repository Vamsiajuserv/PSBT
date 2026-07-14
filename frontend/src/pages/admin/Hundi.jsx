import React, { useEffect, useState, useCallback } from 'react'
import {
  Plus, X, Eye, Search, RotateCcw, Calendar, Info, ChevronDown, Trash2, Upload,
  HandCoins, IndianRupee, Landmark, CalendarClock, FileText, Calculator, Users, ShieldCheck, Building2,
} from 'lucide-react'
import { PageTitle, StatTile, Pill, Pager, inr, num, fmtDate, fmtStamp } from '../../components/admin/ui.jsx'
import { HundiAPI, DevoteesAPI, CommitteeAPI, SettingsAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'

const DENOMINATIONS = ['Mixed', 'Notes', 'Coins', 'Foreign Currency', 'Jewellery']
const VER_TONE = { Verified: 'green', 'Pending Verification': 'blue' }
const DEP_TONE = { Deposited: 'green', 'Pending Deposit': 'amber' }
const nowLocal = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const today = () => nowLocal().slice(0, 10)
const memberCount = (s) => (s ? s.split(',').filter((x) => x.trim()).length : 0)

const emptyForm = () => ({
  collected_on: today(), counted_amount: '', counting_completed_on: nowLocal(),
  denomination: 'Mixed', officer: '',
  members: [], verified_by: '', verified_on: nowLocal(),
  deposit_status: 'Deposited', deposited_on: today(), bank_name: '', bank_ref: '', attachment: '',
})

export default function Hundi() {
  const { user } = useAuth()
  const canWrite = user?.role !== 'Accountant'
  const SIZE = 15
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [stats, setStats] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [view, setView] = useState(null)
  const [committee, setCommittee] = useState([])
  const [banks, setBanks] = useState([])

  const [q, setQ] = useState('')
  const [verification, setVerification] = useState('')
  const [deposit, setDeposit] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([
      HundiAPI.list({ q, verification, deposit, start, end, page, size: SIZE }),
      HundiAPI.stats().catch(() => null),
    ])
    setRows(d.items); setTotal(d.total); if (s) setStats(s)
  }, [q, verification, deposit, start, end, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useEffect(() => { setPage(1) }, [q, verification, deposit, start, end])

  useEffect(() => {
    CommitteeAPI.list()
      .then((r) => { const arr = Array.isArray(r) ? r : (r.items || []); setCommittee(arr.filter((c) => c.active)) })
      .catch(() => {})
    SettingsAPI.config()
      .then((c) => setBanks(Array.isArray(c?.banks) ? c.banks : []))
      .catch(() => {})
  }, [])

  const committeeNames = committee.map((c) => c.name)
  const openCreate = () => setDrawer({ ...emptyForm(), bank_name: banks[0] || '' })
  const toggleMember = (name) => setDrawer((d) => ({ ...d, members: d.members.includes(name) ? d.members.filter((x) => x !== name) : [...d.members, name] }))

  async function save(e) {
    e.preventDefault()
    const m = drawer
    const deposited = m.deposit_status === 'Deposited'
    const verified = !!m.verified_by
    await HundiAPI.create({
      collected_on: m.collected_on || null,
      counted_amount: Number(m.counted_amount || 0),
      counting_completed_on: m.counting_completed_on || null,
      denomination: m.denomination || null,
      officer: m.officer || null,
      committee_members: m.members.map((x) => x.trim()).filter(Boolean),
      verification_status: verified ? 'Verified' : 'Pending Verification',
      verified_by: verified ? m.verified_by : null,
      verified_on: verified ? (m.verified_on || null) : null,
      deposit_status: m.deposit_status,
      bank_name: deposited ? m.bank_name : null,
      bank_ref: deposited ? (m.bank_ref || null) : null,
      deposited_on: deposited ? (m.deposited_on || null) : null,
      attachment: m.attachment || null,
    })
    setDrawer(null); load()
  }
  const setM = (patch) => setDrawer((d) => ({ ...d, ...patch }))

  return (
    <div>
      <PageTitle title="Hundi Management" subtitle="Manage physical hundi collections from the temple, counting, verification and bank deposits."
        actions={canWrite && <button onClick={openCreate} className="btn-maroon !py-2.5"><Plus size={16} /> Record New Collection</button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={HandCoins} color="#059669" bg="bg-emerald-50" title="Latest Collection"
          value={stats ? inr(stats.latest_amount) : '—'} sub={stats?.latest_date ? fmtDate(stats.latest_date) : '—'} />
        <StatTile icon={IndianRupee} color="#7c3aed" bg="bg-violet-50" title="This Month Collections"
          value={stats ? inr(stats.month_amount) : '—'} sub={stats ? `${num(stats.month_count)} Collections` : ''} />
        <StatTile icon={Landmark} color="#d97706" bg="bg-amber-50" title="Deposited This Month"
          value={stats ? inr(stats.deposited_month_amount) : '—'} sub={stats ? `${num(stats.deposited_month_count)} Deposits` : ''} />
        <StatTile icon={CalendarClock} color="#2563eb" bg="bg-blue-50" title="Pending Deposit"
          value={stats ? inr(stats.pending_amount) : '—'} sub={stats ? `${num(stats.pending_count)} Collections` : ''} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Date Range</label>
            <div className="flex items-center gap-1.5">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input !px-2.5 text-[12.5px]" />
              <span className="text-gray-400">–</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input !px-2.5 text-[12.5px]" />
            </div>
          </div>
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Verification Status</label>
            <select value={verification} onChange={(e) => setVerification(e.target.value)} className="input"><option value="">All</option><option>Verified</option><option>Pending Verification</option></select>
          </div>
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Deposit Status</label>
            <select value={deposit} onChange={(e) => setDeposit(e.target.value)} className="input"><option value="">All</option><option>Deposited</option><option>Pending Deposit</option></select>
          </div>
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Search by Reference No.</label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference number…" className="input !pl-9" /></div>
          </div>
          <div className="xl:col-span-4 flex gap-2 justify-end">
            <button onClick={() => { setQ(''); setVerification(''); setDeposit(''); setStart(''); setEnd('') }} className="btn-outline !py-2.5"><RotateCcw size={14} /> Reset</button>
            <button onClick={() => load()} className="btn-maroon !py-2.5"><Search size={14} /> Search</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[11px] uppercase tracking-wide text-gray-500">
              {['Hundi ID', 'Collection Date', 'Total Amount (₹)', 'Committee Members', 'Verification Status', 'Deposit Status', 'Deposit Date', 'Bank Name', 'Actions'].map((c) => <th key={c} className="px-4 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((h) => (
                <tr key={h.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[12px] text-gray-500 whitespace-nowrap">{h.code}</td>
                  <td className="px-4 py-3 text-gray-600 text-[13px] whitespace-nowrap">{fmtDate(h.collected_on)}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{inr(h.counted_amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{memberCount(h.committee_members)} Members</td>
                  <td className="px-4 py-3"><Pill tone={VER_TONE[h.verification_status] || 'gray'}>{h.verification_status}</Pill></td>
                  <td className="px-4 py-3"><Pill tone={DEP_TONE[h.deposit_status] || 'gray'}>{h.deposit_status}</Pill></td>
                  <td className="px-4 py-3 text-gray-600 text-[13px]">{h.deposited_on ? fmtDate(h.deposited_on) : <span className="text-gray-300">-</span>}</td>
                  <td className="px-4 py-3 text-gray-600 text-[13px]">{h.bank_name || <span className="text-gray-300">-</span>}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setView(h)} title="View details" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No collections recorded.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit="collections" />
        </div>
      </div>

      {/* ── Record New Hundi Collection drawer ── */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800">Record New Hundi Collection</h3>
                <p className="text-[13px] text-gray-500 mt-0.5">Record hundi collection, counting, verification and deposit details.</p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-6 flex-1">
              <DSection n="1" icon={FileText} title="Collection Details">
                <div><label className="label">Collection Date *</label><input required type="date" className="input" value={drawer.collected_on} onChange={(e) => setM({ collected_on: e.target.value })} /></div>
                <div><label className="label">Reference No.</label><input disabled className="input bg-gray-50" value="Auto-generated on save" /><div className="text-[11px] text-gray-400 mt-1">Auto generated</div></div>
              </DSection>

              <DSection n="2" icon={Calculator} title="Counting Details">
                <div><label className="label">Total Amount Counted (₹) *</label><input required type="number" min="0" className="input" value={drawer.counted_amount} onChange={(e) => setM({ counted_amount: e.target.value })} /></div>
                <div><label className="label">Counting Completed On *</label><input required type="datetime-local" className="input" value={drawer.counting_completed_on} onChange={(e) => setM({ counting_completed_on: e.target.value })} /></div>
                <div><label className="label">Denomination *</label>
                  <select className="input" value={drawer.denomination} onChange={(e) => setM({ denomination: e.target.value })}>{DENOMINATIONS.map((d) => <option key={d}>{d}</option>)}</select></div>
                <div><label className="label">Officer</label>
                  <select className="input" value={drawer.officer} onChange={(e) => setM({ officer: e.target.value })}>
                    <option value="">Select…</option>{committeeNames.map((n) => <option key={n}>{n}</option>)}
                  </select></div>
              </DSection>

              <div>
                <div className="flex items-center gap-2 mb-3 text-maroon-700">
                  <span className="w-5 h-5 rounded-full bg-maroon-700 text-cream text-[11px] grid place-items-center font-bold">3</span>
                  <span className="font-semibold text-[13.5px]">Committee Members (Present During Counting)</span>
                </div>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
                  {committee.length === 0 && <div className="px-3 py-2.5 text-[12px] text-gray-400">No active committee members found.</div>}
                  {committee.map((c) => (
                    <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" className="accent-maroon-700" checked={drawer.members.includes(c.name)} onChange={() => toggleMember(c.name)} />
                      <span className="flex-1">{c.name}</span>
                      {c.designation && <span className="text-[11px] text-gray-400">{c.designation}</span>}
                    </label>
                  ))}
                </div>
                <div className="bg-blue-50/70 border border-blue-100 rounded-lg px-3 py-2.5 text-[12px] text-gray-600 flex items-start gap-2 mt-3"><Info size={15} className="text-blue-500 shrink-0 mt-0.5" /> Select committee members who were present during counting. {drawer.members.length} selected.</div>
              </div>

              <DSection n="4" icon={ShieldCheck} title="Verification Details">
                <div><label className="label">Verified By *</label>
                  <select className="input" value={drawer.verified_by} onChange={(e) => setM({ verified_by: e.target.value })}>
                    <option value="">Select…</option>{committeeNames.map((mo) => <option key={mo}>{mo}</option>)}
                  </select></div>
                <div><label className="label">Verified On *</label><input type="datetime-local" className="input" value={drawer.verified_on} onChange={(e) => setM({ verified_on: e.target.value })} /></div>
              </DSection>

              <DSection n="5" icon={Building2} title="Deposit Details">
                <div className="col-span-2"><label className="label">Deposit Status *</label>
                  <div className="flex gap-6 mt-1">{['Deposited', 'Pending Deposit'].map((v) => (
                    <label key={v} className="flex items-center gap-2 text-sm text-gray-700"><input type="radio" name="dstatus" className="accent-maroon-700" checked={drawer.deposit_status === v} onChange={() => setM({ deposit_status: v })} /> {v}</label>
                  ))}</div>
                </div>
                {drawer.deposit_status === 'Deposited' && <>
                  <div><label className="label">Deposit Date *</label><input type="date" className="input" value={drawer.deposited_on} onChange={(e) => setM({ deposited_on: e.target.value })} /></div>
                  <div><label className="label">Bank Name *</label><select className="input" value={drawer.bank_name} onChange={(e) => setM({ bank_name: e.target.value })}><option value="">Select…</option>{banks.map((b) => <option key={b}>{b}</option>)}</select></div>
                  <div className="col-span-2"><label className="label">Deposit Reference / Challan No.</label><input className="input" placeholder="e.g. SBI/CH/2026/000872" value={drawer.bank_ref} onChange={(e) => setM({ bank_ref: e.target.value })} /></div>
                  <div className="col-span-2"><label className="label">Deposit Slip / Receipt</label>
                    <label className="btn-outline !py-2 cursor-pointer inline-flex"><Upload size={14} /> Upload Attachment<input type="file" className="hidden" onChange={(e) => setM({ attachment: e.target.files?.[0]?.name || '' })} /></label>
                    {drawer.attachment && <span className="ml-2 text-[12px] text-gray-500 inline-flex items-center gap-1">{drawer.attachment}<button type="button" onClick={() => setM({ attachment: '' })} className="text-gray-400 hover:text-red-600"><X size={13} /></button></span>}
                  </div>
                </>}
              </DSection>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center">Cancel</button>
              <button className="btn-maroon flex-1 justify-center">Save Collection <ChevronDown size={14} /></button>
            </div>
          </form>
        </div>
      )}

      {/* ── View drawer (read-only) ── */}
      {view && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setView(null)} />
          <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800">Hundi Collection</h3>
                <p className="text-[13px] text-gray-500 mt-0.5 font-mono">{view.code}</p></div>
              <button onClick={() => setView(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-6 flex-1">
              <DSection n="1" icon={FileText} title="Collection Details">
                <VField label="Collection Date" value={fmtDate(view.collected_on)} />
                <VField label="Counting Completed" value={fmtStamp(view.counting_completed_on)} />
                <VField label="Total Amount Counted" value={inr(view.counted_amount)} />
                <VField label="Committee Members" value={`${memberCount(view.committee_members)} Members`} />
                <VField label="Members" value={view.committee_members || '—'} wide />
              </DSection>
              <DSection n="2" icon={ShieldCheck} title="Verification">
                <VField label="Status" value={<Pill tone={VER_TONE[view.verification_status]}>{view.verification_status}</Pill>} />
                <VField label="Verified By" value={view.verified_by || '—'} />
                <VField label="Verified On" value={view.verified_on ? fmtStamp(view.verified_on) : '—'} wide />
              </DSection>
              <DSection n="3" icon={Building2} title="Deposit">
                <VField label="Status" value={<Pill tone={DEP_TONE[view.deposit_status]}>{view.deposit_status}</Pill>} />
                <VField label="Deposit Date" value={view.deposited_on ? fmtDate(view.deposited_on) : '—'} />
                <VField label="Bank Name" value={view.bank_name || '—'} wide />
                <VField label="Challan / Reference" value={view.bank_ref || '—'} wide />
                <VField label="Attachment" value={view.attachment || '—'} wide />
              </DSection>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={() => setView(null)} className="btn-maroon w-full justify-center">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DSection({ n, icon: Icon, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-maroon-700">
        <span className="w-5 h-5 rounded-full bg-maroon-700 text-cream text-[11px] grid place-items-center font-bold">{n}</span>
        <span className="font-semibold text-[13.5px]">{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">{children}</div>
    </div>
  )
}
function VField({ label, value, wide }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[11px] text-gray-400 mb-0.5">{label}</div>
      <div className="text-[13px] text-gray-800 font-medium break-words">{value ?? '—'}</div>
    </div>
  )
}
