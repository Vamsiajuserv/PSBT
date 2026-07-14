import React, { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Plus, X, Printer, Eye, Search, RotateCcw, Calendar, Info, ChevronDown,
  Sprout, CalendarDays, Package, HandHeart, User,
} from 'lucide-react'
import { PageTitle, StatTile, Pill, Pager, inr, num, fmtDate } from '../../components/admin/ui.jsx'
import { Receipt } from '../../components/common/Receipt.jsx'
import { te } from '../../lib/telugu.js'
import { DonationsAPI, DonationCategoriesAPI, DevoteesAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'

const TYPE_LABEL = { Cash: 'Cash Donation', Material: 'Material Donation', Sponsorship: 'Sponsorship' }
const MODES = ['Cash', 'UPI/QR Code']
const todayStamp = () => {
  const d = new Date()
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const fmtTime = (s) => (s ? new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '')

const newDonation = () => ({
  donation_type: 'Cash', devotee_id: '', donor_name: '', mobile: '', pan: '', fund: '', amount: '',
  unit: '', quantity: '', mode: 'Cash', txn_ref: '', g80: false, notes: '',
})

export default function Donations() {
  const { user } = useAuth()
  const canWrite = user?.role !== 'Accountant'

  const SIZE = 15
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [stats, setStats] = useState(null)
  const [cats, setCats] = useState([])
  const [drawer, setDrawer] = useState(null)
  const [printDoc, setPrintDoc] = useState(null)

  // devotee type-ahead search inside the drawer
  const [dq, setDq] = useState('')
  const [devResults, setDevResults] = useState([])
  const [panErr, setPanErr] = useState('')

  // filters
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [category, setCategory] = useState('')
  const [mode, setMode] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([
      DonationsAPI.list({ q, type, category, mode, start, end, page, size: SIZE }),
      DonationsAPI.stats().catch(() => null),
    ])
    setRows(d.items); setTotal(d.total); if (s) setStats(s)
  }, [q, type, category, mode, start, end, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useEffect(() => { setPage(1) }, [q, type, category, mode, start, end])

  useEffect(() => {
    DonationCategoriesAPI.list().then((r) => setCats(r.items.filter((c) => c.active))).catch(() => {})
  }, [])

  // debounced devotee type-ahead (only while the drawer is open and none picked yet)
  useEffect(() => {
    if (!drawer || drawer.devotee_id || dq.trim().length < 1) { setDevResults([]); return }
    const t = setTimeout(
      () => DevoteesAPI.list({ q: dq, size: 6 }).then((r) => setDevResults(r.items || [])).catch(() => setDevResults([])),
      250,
    )
    return () => clearTimeout(t)
  }, [dq, drawer])

  const drawerCats = useMemo(
    () => cats.filter((c) => c.type === (drawer?.donation_type || 'Cash')),
    [cats, drawer?.donation_type],
  )

  function setDType(t) {
    const first = cats.find((c) => c.type === t)
    setDrawer((m) => ({
      ...m, donation_type: t, fund: first?.name || '',
      unit: t === 'Material' ? (first?.unit || '') : '', quantity: '', amount: t === 'Material' ? '' : m.amount,
      g80: t === 'Cash' ? m.g80 : false,
    }))
  }
  function setFund(name) {
    const c = cats.find((x) => x.name === name)
    setDrawer((m) => ({ ...m, fund: name, unit: m.donation_type === 'Material' ? (c?.unit || '') : m.unit,
      g80: name === 'Medical Donation' ? true : m.g80 }))
  }
  function pickDevotee(dv) {
    setDrawer((m) => ({ ...m, devotee_id: dv.id, donor_name: dv.name, mobile: dv.mobile || '' }))
    setDq(''); setDevResults([])
  }
  function clearDevotee() {
    setDrawer((m) => ({ ...m, devotee_id: '', donor_name: '', mobile: '' }))
    setDq(''); setDevResults([])
  }

  async function save(e, print) {
    e.preventDefault()
    const m = drawer
    // 80G receipts require a PAN — block submit when eligible but PAN is missing.
    if (m.g80 && !(m.pan || '').trim()) {
      setPanErr('PAN is required for tax-exemption (80G) receipts.')
      return
    }
    setPanErr('')
    const payload = {
      donation_type: m.donation_type,
      devotee_id: m.devotee_id ? Number(m.devotee_id) : null,
      donor_name: (m.donor_name || '').trim() || 'Anonymous',
      fund: m.fund, mode: m.donation_type === 'Material' ? '-' : m.mode,
      txn_ref: m.mode === 'UPI/QR Code' ? (m.txn_ref || null) : null,
      amount: m.donation_type === 'Material' ? 0 : Number(m.amount || 0),
      unit: m.donation_type === 'Material' ? (m.unit || null) : null,
      quantity: m.donation_type === 'Material' && m.quantity ? Number(m.quantity) : null,
      pan: (m.pan || '').trim() || null,
      g80: m.g80, notes: m.notes || null,
    }
    const created = await DonationsAPI.create(payload)
    setDrawer(null); setDq(''); setDevResults([]); setPanErr(''); load()
    if (print) setPrintDoc(created)
  }

  const amountCell = (d) => d.donation_type === 'Material'
    ? (d.quantity ? `${num(d.quantity)} ${d.unit || ''}`.trim() : '—')
    : inr(d.amount)

  return (
    <div>
      <PageTitle title="Donation Management" subtitle="Record, manage and view all donations."
        actions={canWrite && <button onClick={() => { setDrawer(newDonation()); setDq(''); setDevResults([]); setPanErr('') }} className="btn-maroon !py-2.5"><Plus size={16} /> Record Donation</button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={Sprout} color="#059669" bg="bg-emerald-50" title="Today's Donations"
          value={stats ? inr(stats.today.amount) : '—'} sub={stats ? `${num(stats.today.count)} Transactions` : ''} />
        <StatTile icon={CalendarDays} color="#7c3aed" bg="bg-violet-50" title="This Month Donations"
          value={stats ? inr(stats.month.amount) : '—'} sub={stats ? `${num(stats.month.count)} Transactions` : ''} />
        <StatTile icon={Package} color="#d97706" bg="bg-amber-50" title="Material Donations"
          value={stats ? num(stats.material) : '—'} sub="Material Donations" />
        <StatTile icon={HandHeart} color="#2563eb" bg="bg-blue-50" title="Sponsorships"
          value={stats ? num(stats.sponsorship) : '—'} sub="Recorded Sponsorships" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Search by Devotee Name / Mobile</label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or mobile number…" className="input !pl-9" /></div>
          </div>
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Date Range</label>
            <div className="flex items-center gap-1.5">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input !px-2.5 text-[12.5px]" />
              <span className="text-gray-400">–</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input !px-2.5 text-[12.5px]" />
            </div>
          </div>
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Donation Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="input"><option value="">All</option><option value="Cash">Cash Donation</option><option value="Material">Material Donation</option><option value="Sponsorship">Sponsorship</option></select>
          </div>
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input"><option value="">All</option>{cats.map((c) => <option key={c.id}>{c.name}</option>)}</select>
          </div>
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Payment Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="input"><option value="">All</option>{MODES.map((m) => <option key={m}>{m}</option>)}</select>
          </div>
          <div className="xl:col-span-4 flex gap-2 justify-end">
            <button onClick={() => { setQ(''); setType(''); setCategory(''); setMode(''); setStart(''); setEnd('') }} className="btn-outline !py-2.5"><RotateCcw size={14} /> Reset</button>
            <button onClick={() => load()} className="btn-maroon !py-2.5"><Search size={14} /> Search</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[11px] uppercase tracking-wide text-gray-500">
              {['Donation ID', 'Devotee', 'Donation Type', 'Category', 'Amount / Material', 'Payment Mode', 'Donated On', 'Receipt No.', 'Actions'].map((c) => <th key={c} className="px-4 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[12px] text-maroon-600">{d.donation_code || d.receipt_no}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{d.donor_name}</td>
                  <td className="px-4 py-3 text-gray-600">{TYPE_LABEL[d.donation_type] || d.donation_type}</td>
                  <td className="px-4 py-3 text-gray-600">{d.fund}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{amountCell(d)}</td>
                  <td className="px-4 py-3 text-gray-600">{d.mode && d.mode !== '-' ? d.mode : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="text-gray-700 text-[13px]">{fmtDate(d.donated_on)}</div><div className="text-[11px] text-gray-400">{fmtTime(d.created_at)}</div></td>
                  <td className="px-4 py-3 font-mono text-[12px] text-gray-500">{d.receipt_no}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-gray-400">
                      <button onClick={() => setPrintDoc(d)} title="Print receipt" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 hover:text-maroon-700 hover:border-maroon-300"><Printer size={15} /></button>
                      <button onClick={() => setPrintDoc(d)} title="View" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No donations found.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit="transactions" />
        </div>
      </div>

      {/* ── Record Donation drawer ── */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={(e) => save(e, true)} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800">Record Donation</h3>
                <p className="text-[13px] text-gray-500 mt-0.5">Enter donation details and issue receipt.</p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-5 flex-1">
              <div className="grid grid-cols-3 gap-2">
                {['Cash', 'Material', 'Sponsorship'].map((t) => (
                  <button type="button" key={t} onClick={() => setDType(t)} className={`border rounded-lg py-2 text-[12.5px] font-semibold ${drawer.donation_type === t ? 'border-maroon-500 bg-maroon-700 text-cream' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{TYPE_LABEL[t]}</button>
                ))}
              </div>

              <div>
                <label className="label">Devotee (optional — leave blank for walk-in)</label>
                {drawer.devotee_id ? (
                  <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-3.5 py-3 bg-gray-50/50">
                    <div className="w-10 h-10 rounded-full bg-maroon-700 text-cream grid place-items-center"><User size={18} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className="font-semibold text-gray-800">{drawer.donor_name}</span><Pill tone="green">Registered</Pill></div>
                      {drawer.mobile && <div className="text-[12px] text-gray-500">Mobile: {drawer.mobile}</div>}
                    </div>
                    <button type="button" onClick={clearDevotee} className="text-gray-400 hover:text-red-600"><X size={17} /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input className="input pr-9" placeholder="Search registered devotee by name / mobile…" value={dq} onChange={(e) => setDq(e.target.value)} />
                    {devResults.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-gray-100 rounded-lg shadow-lg py-1">
                        {devResults.map((d) => (
                          <button type="button" key={d.id} onClick={() => pickDevotee(d)} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-amber-50 text-amber-700 grid place-items-center text-[12px] font-bold">{d.name?.[0]}</span>
                            <span><span className="font-semibold text-gray-800 text-[13px]">{d.name}</span><span className="block text-[11px] text-gray-400">{d.code} · {d.mobile}</span></span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Donor Name *</label>
                  <input required className="input" placeholder="Walk-in / donor name" value={drawer.donor_name} onChange={(e) => setDrawer({ ...drawer, donor_name: e.target.value })} /></div>
                <div><label className="label">Mobile (Optional)</label>
                  <input className="input" placeholder="Mobile number" value={drawer.mobile} onChange={(e) => setDrawer({ ...drawer, mobile: e.target.value })} /></div>
              </div>

              <div><label className="label">Donation Category *</label>
                <select required value={drawer.fund} onChange={(e) => setFund(e.target.value)} className="input"><option value="">Select category…</option>{drawerCats.map((c) => <option key={c.id}>{c.name}</option>)}</select></div>

              {drawer.donation_type === 'Material' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Quantity *</label><input required type="number" step="0.01" min="0" className="input" value={drawer.quantity} onChange={(e) => setDrawer({ ...drawer, quantity: e.target.value })} /></div>
                  <div><label className="label">Unit</label><input className="input bg-gray-50" value={drawer.unit || ''} readOnly /></div>
                </div>
              ) : (
                <div><label className="label">Amount (₹) *</label><input required type="number" min="1" className="input" value={drawer.amount} onChange={(e) => setDrawer({ ...drawer, amount: e.target.value })} /></div>
              )}

              {drawer.donation_type !== 'Material' && (
                <>
                  <div><label className="label">Payment Mode *</label>
                    <div className="flex gap-6 mt-1">{MODES.map((mo) => (
                      <label key={mo} className="flex items-center gap-2 text-sm text-gray-700"><input type="radio" name="pmode" className="accent-maroon-700" checked={drawer.mode === mo} onChange={() => setDrawer({ ...drawer, mode: mo })} /> {mo === 'UPI/QR Code' ? 'UPI / QR Code' : mo}</label>
                    ))}</div>
                  </div>
                  {drawer.mode === 'UPI/QR Code'
                    ? <div><label className="label">UTR / Transaction ID</label><input className="input" placeholder="Enter UTR / transaction reference" value={drawer.txn_ref} onChange={(e) => setDrawer({ ...drawer, txn_ref: e.target.value })} /></div>
                    : <div className="bg-blue-50/70 border border-blue-100 rounded-lg px-3 py-2.5 text-[12px] text-gray-600 flex items-start gap-2"><Info size={15} className="text-blue-500 shrink-0 mt-0.5" /> UTR / Transaction ID is required only for UPI / QR Code payments.</div>}
                </>
              )}

              <div><label className="label">Donation Date *</label>
                <div className="relative"><input className="input bg-gray-50 pr-9" value={todayStamp()} readOnly /><Calendar size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" /></div></div>

              <div className="bg-blue-50/70 border border-blue-100 rounded-lg px-3 py-2.5 text-[12px] text-gray-600 flex items-start gap-2"><Info size={15} className="text-blue-500 shrink-0 mt-0.5" /> Tax exemption is applicable only for Medical Donations.</div>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="accent-maroon-700" checked={drawer.g80} disabled={drawer.donation_type !== 'Cash'} onChange={(e) => { setDrawer({ ...drawer, g80: e.target.checked }); if (!e.target.checked) setPanErr('') }} /> Eligible for Tax Exemption (Medical Donation)</label>

              <div><label className="label">PAN {drawer.g80 && <span className="text-red-500">*</span>}{drawer.g80 && <span className="text-[11px] text-gray-400 font-normal"> (required for 80G)</span>}</label>
                <input className={`input uppercase ${panErr ? 'border-red-400' : ''}`} placeholder="ABCDE1234F"
                  value={drawer.pan} onChange={(e) => { setDrawer({ ...drawer, pan: e.target.value.toUpperCase() }); if (panErr) setPanErr('') }} />
                {panErr && <div className="text-[11.5px] text-red-600 mt-1">{panErr}</div>}</div>

              <div><label className="label">Notes (Optional)</label>
                <textarea className="input min-h-[72px]" maxLength={250} placeholder="Enter any additional notes…" value={drawer.notes} onChange={(e) => setDrawer({ ...drawer, notes: e.target.value })} />
                <div className="text-right text-[11px] text-gray-400 mt-0.5">{(drawer.notes || '').length} / 250</div></div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={(e) => save(e, false)} className="btn-outline flex-1 justify-center"><Printer size={15} /> Save</button>
              <button className="btn-maroon flex-1 justify-center">Save &amp; Print Receipt <ChevronDown size={14} /></button>
            </div>
          </form>
        </div>
      )}

      {printDoc && (
        <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4 no-print" onClick={() => setPrintDoc(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
            <div id="print-area">
              <Receipt title="Donation Receipt" titleTe="విరాళం రసీదు" no={printDoc.receipt_no} subNo={fmtDate(printDoc.donated_on)} subNoLabel="Date" amount={printDoc.amount}
                rows={[
                  { en: 'Donor', value: printDoc.donor_name },
                  { en: 'Category', value: printDoc.fund, valueTe: te(printDoc.fund) },
                  { en: 'Type', value: TYPE_LABEL[printDoc.donation_type], valueTe: te(printDoc.donation_type) },
                  ...(printDoc.donation_type === 'Material' && printDoc.quantity ? [{ en: 'Quantity', value: `${num(printDoc.quantity)} ${printDoc.unit || ''}` }] : [{ en: 'Payment Mode', value: printDoc.mode }]),
                  ...(printDoc.txn_ref ? [{ en: 'Transaction', value: printDoc.txn_ref }] : []),
                  { en: 'Tax Exemption', value: printDoc.g80 ? 'Eligible (80G)' : '—' },
                ]}
                footerNote={printDoc.g80 ? 'Eligible for 80G tax exemption.' : undefined} />
            </div>
            <div className="flex gap-2 justify-center mt-4 no-print">
              <button onClick={() => window.print()} className="btn-maroon"><Printer size={15} /> Print Receipt</button>
              <button onClick={() => setPrintDoc(null)} className="btn-outline">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
