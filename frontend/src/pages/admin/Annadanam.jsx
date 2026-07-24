import React, { useEffect, useState, useCallback } from 'react'
import {
  Plus, X, Eye, Printer, Search, RotateCcw, Minus, Check, User,
  UtensilsCrossed, Users, IndianRupee, HeartHandshake,
} from 'lucide-react'
import { PageTitle, StatTile, Pill, Pager, inr, num, fmtDate } from '../../components/admin/ui.jsx'
import { Receipt } from '../../components/common/Receipt.jsx'
import { te } from '../../lib/telugu.js'
import { AnnadanamAPI, DevoteesAPI, SettingsAPI, FestivalsAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { TableStates } from '../../components/common/states.jsx'
import ExportButtons from '../../components/common/ExportButtons.jsx'
import { Select, DateField, DateTimeField, NumberField } from '../../components/common/Field.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const RATE = 50
const OCCASIONS = ['General', 'Birthday', 'Wedding Anniversary', 'Thanksgiving', 'In Memory', 'Festival Offering']
const nowLocal = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const fmtTime = (s) => (s ? new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '')
const modeLabel = (m) => (m === 'UPI/QR Code' ? 'UPI (QR)' : m)

function toWords(n) {
  n = Math.round(Number(n) || 0)
  if (n === 0) return 'Zero Rupees Only'
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const two = (x) => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''))
  const three = (x) => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x))
  let out = ''
  const crore = Math.floor(n / 10000000); n %= 10000000
  const lakh = Math.floor(n / 100000); n %= 100000
  const thou = Math.floor(n / 1000); n %= 1000
  if (crore) out += three(crore) + ' Crore '
  if (lakh) out += two(lakh) + ' Lakh '
  if (thou) out += two(thou) + ' Thousand '
  if (n) out += three(n) + ' '
  return out.trim() + ' Rupees Only'
}

const emptyForm = (rate = RATE) => ({ devotee: null, persons: 1, rate, occasionChoice: 'General', occasion: 'General', scheduled_on: '', mode: 'Cash', txn_ref: '', paid_at: nowLocal() })

export default function Annadanam() {
  const { user } = useAuth()
  const canWrite = user?.role !== 'Accountant'
  const SIZE = 15
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [stats, setStats] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [printDoc, setPrintDoc] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  const [q, setQ] = useState('')
  const [mode, setMode] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  // configurable rate + festival names for the occasion dropdown
  const [defaultRate, setDefaultRate] = useState(RATE)
  const [festivals, setFestivals] = useState([])
  useEffect(() => {
    SettingsAPI.config()
      .then((c) => setDefaultRate(Number(c?.annadanam_rate) || RATE))
      .catch(() => setDefaultRate(RATE))
    FestivalsAPI.list()
      .then((r) => setFestivals(Array.isArray(r) ? r : (r.items || [])))
      .catch(() => setFestivals([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('')
    try {
      const [d, s] = await Promise.all([
        AnnadanamAPI.list({ q, mode, start, end, page, size: SIZE }),
        AnnadanamAPI.stats().catch(() => null),
      ])
      setRows(d.items); setTotal(d.total); if (s) setStats(s)
    } catch (ex) {
      setLoadErr(ex?.detail || "Couldn't load records — check your connection and retry.")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q, mode, start, end, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useEffect(() => { setPage(1) }, [q, mode, start, end])

  // devotee search inside drawer
  const [dq, setDq] = useState('')
  const [results, setResults] = useState([])
  const picked = drawer?.devotee
  useEffect(() => {
    if (!drawer || picked || dq.trim().length < 1) { setResults([]); return }
    const t = setTimeout(() => DevoteesAPI.list({ q: dq, size: 6 }).then((r) => setResults(r.items)).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [dq, picked, drawer])

  const setM = (patch) => setDrawer((d) => ({ ...d, ...patch }))
  const amount = drawer ? Number(drawer.persons) * (Number(drawer.rate) || 0) : 0

  // occasion dropdown → common occasions + festival names, with a custom "Other"
  const onOccasionSelect = (val) => {
    if (val === '__other__') setM({ occasionChoice: '__other__', occasion: '' })
    else setM({ occasionChoice: val, occasion: val })
  }

  async function save(e) {
    e.preventDefault()
    if (saving) return
    const m = drawer
    if (!m.devotee) return
    setSaving(true); setSaveErr('')
    const rate = Number(m.rate) || 0
    try {
      const created = await AnnadanamAPI.create({
        devotee_id: m.devotee.id, donor: m.devotee.name, mobile: m.devotee.mobile,
        plates: Number(m.persons), rate, amount: Number(m.persons) * rate,
        mode: m.mode, txn_ref: m.mode === 'UPI/QR Code' ? (m.txn_ref || null) : null,
        paid_at: m.paid_at || null, scheduled_on: m.scheduled_on || null,
        occasion: m.occasion || 'General',
      })
      setDrawer(null); setDq(''); load(); setPrintDoc(created)
    } catch (err) {
      setSaveErr(err?.detail || 'Could not save the annadanam receipt. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const EXPORT_COLS = [{ key: 'code', label: 'Receipt' }, { key: 'donor', label: 'Donor' }, { key: 'plates', label: 'Persons' },
    { key: 'amount', label: 'Amount (₹)', type: 'money' }, { key: 'mode', label: 'Mode' },
    { key: 'scheduled_on', label: 'Scheduled On' }, { key: 'occasion', label: 'Occasion' }]
  const exportRows = rows
  const exportTotal = { code: 'Total', amount: rows.reduce((s, r) => s + Number(r.amount || 0), 0) }
  return (
    <div>
      <PageTitle title={tr("Annadanam Management")} subtitle="Record annadanam donations, accept payments and generate receipt for devotees."
        actions={<span className="inline-flex items-center gap-2"><ExportButtons title={tr("Annadanam Register")} columns={EXPORT_COLS} rows={exportRows} total={exportTotal} />{canWrite ? <button onClick={() => { setDrawer(emptyForm(defaultRate)); setDq('') }} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Record Annadanam Donation</T></button> : <span className="px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-blue-50 text-blue-700"><T>View only</T></span>}</span>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={UtensilsCrossed} color="#ea580c" bg="bg-orange-50" title={tr("Total Annadanam Records")} value={stats ? num(stats.total_records) : '—'} sub="All Time" />
        <StatTile icon={Users} color="#059669" bg="bg-emerald-50" title={tr("Today's Sponsorships")} value={stats ? num(stats.today_sponsorships) : '—'} sub={`Today (${fmtDate(new Date().toISOString())})`} />
        <StatTile icon={IndianRupee} color="#7c3aed" bg="bg-violet-50" title={tr("Today's Collection")} value={stats ? inr(stats.today_collection) : '—'} sub={`Today (${fmtDate(new Date().toISOString())})`} />
        <StatTile icon={HeartHandshake} color="#d97706" bg="bg-amber-50" title={tr("Total Persons Sponsored")} value={stats ? num(stats.total_persons) : '—'} sub="Across all Annadanam records" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search by Devotee Name / Mobile / Receipt No.</T></label>
            <div className="relative"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search here…")} className="input pr-9" /></div>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Date Range</T></label>
            <div className="flex items-center gap-1.5">
              <DateField value={start} onChange={(e) => setStart(e.target.value)} className="input !px-2.5 text-[0.78125rem]" />
              <span className="text-gray-400">–</span>
              <DateField value={end} onChange={(e) => setEnd(e.target.value)} className="input !px-2.5 text-[0.78125rem]" />
            </div>
          </div>
          <div>
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Payment Mode</T></label>
            <Select value={mode} onChange={(e) => setMode(e.target.value)} className="input"><option value="">All</option><option value="Cash">Cash</option><option value="UPI/QR Code">UPI / QR Code</option></Select>
          </div>
          <div className="md:col-span-3 flex gap-2 justify-end">
            <button onClick={() => { setQ(''); setMode(''); setStart(''); setEnd('') }} className="btn-outline !py-2.5"><RotateCcw size={14} />{' '}<T>Reset</T></button>
            <button onClick={() => load()} className="btn-maroon !py-2.5"><Search size={14} />{' '}<T>Search</T></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
              {['Receipt No.', 'Date & Time', 'Devotee Name', 'Mobile Number', 'No. of Persons', 'Donation Amount (₹)', 'Payment Mode', 'Actions'].map((c) => <th key={c} className="px-4 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[0.75rem] text-gray-500 whitespace-nowrap">{a.code}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="text-gray-700 text-[0.8125rem]">{fmtDate(a.paid_at || a.created_at)}</div><div className="text-[0.6875rem] text-gray-400">{fmtTime(a.paid_at || a.created_at)}</div></td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{a.donor}</td>
                  <td className="px-4 py-3 text-gray-600">{a.mobile || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{a.plates}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{num(a.amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{modeLabel(a.mode)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-gray-400">
                      <button onClick={() => setPrintDoc(a)} title={tr("View")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                      <button onClick={() => setPrintDoc(a)} title={tr("Print receipt")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 hover:text-maroon-700 hover:border-maroon-300"><Printer size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <TableStates colSpan={8} loading={loading} error={loadErr} onRetry={load} empty="No annadanam records found." />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit="records" />
        </div>
      </div>

      {/* ── Record Annadanam Donation drawer ── */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Record Annadanam Donation</T></h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Select devotee, enter number of persons, record payment and generate receipt.</T></p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-6 flex-1">
              {/* 1. Devotee Details */}
              <div>
                <div className="text-maroon-700 font-semibold text-[0.875rem] mb-3"><T>1. Devotee Details</T></div>
                <label className="label">Search Devotee (Name / Mobile Number) *</label>
                <div className="relative">
                  <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className="input pr-9" placeholder={tr("Search name or mobile number…")}
                    readOnly={!!drawer.devotee}
                    value={drawer.devotee ? `${drawer.devotee.name} / ${drawer.devotee.mobile}` : dq}
                    onChange={(e) => !drawer.devotee && setDq(e.target.value)} />
                  {!drawer.devotee && results.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-100 rounded-lg shadow-lg py-1">
                      {results.map((d) => (
                        <button type="button" key={d.id} onClick={() => { setM({ devotee: d }); setResults([]) }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-amber-50 text-amber-700 grid place-items-center text-[0.75rem] font-bold">{d.name[0]}</span>
                          <span><span className="font-semibold text-gray-800 text-[0.8125rem]">{d.name}</span><span className="block text-[0.6875rem] text-gray-400">{d.code} · {d.mobile}</span></span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {drawer.devotee && (
                  <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-3.5 py-3 bg-gray-50/50 mt-3">
                    <div className="w-10 h-10 rounded-full bg-maroon-700 text-cream grid place-items-center"><User size={18} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className="font-semibold text-gray-800">{drawer.devotee.name}</span><Pill tone="green"><T>Registered</T></Pill></div>
                      <div className="text-[0.75rem] text-gray-500">Mobile: {drawer.devotee.mobile}</div>
                    </div>
                    <button type="button" onClick={() => { setM({ devotee: null }); setDq('') }} className="text-gray-400 hover:text-red-600"><X size={17} /></button>
                  </div>
                )}
              </div>

              {/* 2. Annadanam Details */}
              <div>
                <div className="text-maroon-700 font-semibold text-[0.875rem] mb-3"><T>2. Annadanam Details</T></div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label"><T>Number of Persons *</T></label>
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden w-full">
                      <button type="button" onClick={() => setM({ persons: Math.max(1, drawer.persons - 1) })} className="w-10 h-11 grid place-items-center text-gray-500 hover:bg-gray-50 border-r border-gray-200"><Minus size={16} /></button>
                      <input type="number" min="1" value={drawer.persons} onChange={(e) => setM({ persons: Math.max(1, Number(e.target.value) || 1) })} className="no-spin flex-1 w-full text-center font-semibold text-gray-800 outline-none h-11" />
                      <button type="button" onClick={() => setM({ persons: drawer.persons + 1 })} className="w-10 h-11 grid place-items-center text-gray-500 hover:bg-gray-50 border-l border-gray-200"><Plus size={16} /></button>
                    </div>
                  </div>
                  <div>
                    <label className="label">Rate per plate (₹) *</label>
                    <NumberField required min="0" step="1" prefix="₹" className="h-11" value={drawer.rate} onChange={(e) => setM({ rate: e.target.value })} />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="label"><T>Occasion *</T></label>
                  <Select className="input" value={drawer.occasionChoice} onChange={(e) => onOccasionSelect(e.target.value)}>
                    {OCCASIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    {festivals.length > 0 && <optgroup label="Festivals">{festivals.map((f) => <option key={f.id ?? f.name} value={f.name}>{f.name}</option>)}</optgroup>}
                    <option value="__other__">Other (enter manually)</option>
                  </Select>
                  {drawer.occasionChoice === '__other__' && (
                    <input required className="input mt-2" placeholder={tr("Enter occasion")} value={drawer.occasion} onChange={(e) => setM({ occasion: e.target.value })} />
                  )}
                </div>
                <div className="mt-4">
                  <label className="label">Scheduled On (Optional)</label>
                  <DateField value={drawer.scheduled_on} onChange={(e) => setM({ scheduled_on: e.target.value })} />
                </div>
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl px-4 py-3.5 mt-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 grid place-items-center shrink-0"><UtensilsCrossed size={18} /></div>
                  <div>
                    <div className="text-[0.75rem] text-gray-500"><T>Calculated Donation Amount</T></div>
                    <div className="text-2xl font-extrabold text-gray-800 leading-none mt-0.5">{inr(amount)}</div>
                    <div className="text-[0.6875rem] text-gray-400 mt-1">Current Rate: ₹{num(drawer.rate)} per person</div>
                  </div>
                </div>
              </div>

              {/* 3. Payment Details */}
              <div>
                <div className="text-maroon-700 font-semibold text-[0.875rem] mb-3"><T>3. Payment Details</T></div>
                <label className="label"><T>Payment Mode *</T></label>
                <div className="flex gap-6 mt-1 mb-4">
                  {['Cash', 'UPI/QR Code'].map((mo) => (
                    <label key={mo} className="flex items-center gap-2 text-sm text-gray-700"><input type="radio" name="pmode" className="accent-maroon-700" checked={drawer.mode === mo} onChange={() => setM({ mode: mo })} /> {mo === 'UPI/QR Code' ? 'UPI / QR Code' : mo}</label>
                  ))}
                </div>
                {drawer.mode === 'UPI/QR Code' && (
                  <div className="mb-4"><label className="label"><T>UPI Transaction ID / UTR *</T></label>
                    <div className="relative"><input required className="input pr-9" placeholder={tr("Enter UPI transaction ID / UTR")} value={drawer.txn_ref} onChange={(e) => setM({ txn_ref: e.target.value })} />
                      {drawer.txn_ref && <span className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-emerald-500 text-white grid place-items-center"><Check size={12} /></span>}</div>
                  </div>
                )}
                <div className="mb-4"><label className="label"><T>Payment Date & Time *</T></label>
                  <DateTimeField required value={drawer.paid_at} onChange={(e) => setM({ paid_at: e.target.value })} /></div>
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl px-4 py-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center shrink-0"><IndianRupee size={17} /></div>
                  <div className="flex-1">
                    <div className="text-[0.75rem] text-gray-500"><T>Total Amount</T></div>
                    <div className="text-xl font-extrabold text-gray-800 leading-none">{inr(amount)}</div>
                  </div>
                  <div className="text-right max-w-[52%]">
                    <div className="text-[0.6875rem] text-gray-400"><T>Amount In Words</T></div>
                    <div className="text-[0.71875rem] text-gray-600 font-medium leading-tight">{toWords(amount)}</div>
                  </div>
                </div>
              </div>
            </div>
            {saveErr && <div className="px-6 pt-3 text-[0.75rem] text-red-600">{saveErr}</div>}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button disabled={!drawer.devotee || saving} className="btn-maroon flex-1 justify-center disabled:opacity-50">{saving ? 'Saving…' : <>Save Payment &amp; Generate Receipt <Printer size={15} /></>}</button>
            </div>
          </form>
        </div>
      )}

      {printDoc && (
        <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4 no-print" onClick={() => setPrintDoc(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
            <div id="print-area">
              <Receipt title={tr("Annadanam Receipt")} titleTe="అన్నదానం రసీదు" no={printDoc.code} subNo={fmtDate(printDoc.paid_at || printDoc.created_at)} subNoLabel="Date" amount={printDoc.amount}
                rows={[
                  { en: 'Devotee', value: printDoc.donor },
                  { en: 'Mobile', value: printDoc.mobile || '—' },
                  { en: 'No. of Persons', value: printDoc.plates },
                  { en: 'Rate', value: `₹${num(printDoc.rate || RATE)} / person` },
                  { en: 'Payment Mode', value: modeLabel(printDoc.mode) },
                  ...(printDoc.txn_ref ? [{ en: 'Transaction', value: printDoc.txn_ref }] : []),
                ]}
                footerNote={toWords(printDoc.amount)} />
            </div>
            <div className="flex gap-2 justify-center mt-4 no-print">
              <button onClick={() => window.print()} className="btn-maroon"><Printer size={15} />{' '}<T>Print Receipt</T></button>
              <button onClick={() => setPrintDoc(null)} className="btn-outline"><T>Close</T></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
