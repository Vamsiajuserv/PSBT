import React, { useEffect, useState, useCallback } from 'react'
import {
  Plus, X, Eye, Printer, Search, RotateCcw, Calendar, Minus, Check,
  IndianRupee, CalendarDays, ShoppingCart, FileText, Calculator,
} from 'lucide-react'
import { PageTitle, StatTile, Pager, inr, num, fmtDate } from '../../components/admin/ui.jsx'
import { Receipt } from '../../components/common/Receipt.jsx'
import { te } from '../../lib/telugu.js'
import { WasteAPI, VendorsAPI, CommitteeAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'

const DEFAULT_MATERIALS = ['Coconut Shells', 'Flowers', 'Banana Leaves', 'Cardboard', 'Plastic', 'Waste Oil', 'Metal Scrap', 'Old Cloth']
const UNITS = ['Kilogram (kg)', 'Tonne', 'Piece', 'Bundle']
const nowLocal = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const fmtTime = (s) => (s ? new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '')
const modeLabel = (m) => (m === 'UPI/QR Code' ? 'UPI (QR)' : m)
const unitShort = (u) => { const m = /\(([^)]+)\)/.exec(u || ''); return m ? m[1] : (u || '').toLowerCase() }
const money2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

const emptyForm = () => ({ vendor_id: '', vendor_name: '', buyer_name: '', mobile: '', material: DEFAULT_MATERIALS[0], materialCustom: false, unit: 'Kilogram (kg)', quantity: 1, rate: '', mode: 'Cash', txn_ref: '', paid_at: nowLocal(), verified_by: '' })

export default function WasteSales() {
  const { user } = useAuth()
  const canWrite = user?.role !== 'Accountant'
  const SIZE = 15
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [stats, setStats] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [printDoc, setPrintDoc] = useState(null)
  const [vendors, setVendors] = useState([])
  const [committee, setCommittee] = useState([])

  const [q, setQ] = useState('')
  const [material, setMaterial] = useState('')
  const [mode, setMode] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([
      WasteAPI.sales({ q, material, mode, start, end, page, size: SIZE }),
      WasteAPI.stats().catch(() => null),
    ])
    setRows(d.items); setTotal(d.total); if (s) setStats(s)
  }, [q, material, mode, start, end, page])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useEffect(() => { setPage(1) }, [q, material, mode, start, end])

  useEffect(() => {
    VendorsAPI.list()
      .then((r) => { const arr = Array.isArray(r) ? r : (r.items || []); setVendors(arr) })
      .catch(() => {})
    CommitteeAPI.list()
      .then((r) => { const arr = Array.isArray(r) ? r : (r.items || []); setCommittee(arr.filter((c) => c.active)) })
      .catch(() => {})
  }, [])

  const setM = (patch) => setDrawer((d) => ({ ...d, ...patch }))
  const amount = drawer ? (Number(drawer.quantity) || 0) * (Number(drawer.rate) || 0) : 0
  const committeeNames = committee.map((c) => c.name)
  const selectedVendor = drawer && drawer.vendor_id ? vendors.find((v) => String(v.id) === String(drawer.vendor_id)) : null
  const materialOptions = selectedVendor && selectedVendor.material_types
    ? selectedVendor.material_types.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_MATERIALS
  const onVendor = (id) => {
    if (!id) { setM({ vendor_id: '', vendor_name: '' }); return }
    const v = vendors.find((x) => String(x.id) === String(id))
    if (!v) return
    const mats = (v.material_types || '').split(',').map((s) => s.trim()).filter(Boolean)
    setM({ vendor_id: v.id, vendor_name: v.name, buyer_name: v.name, mobile: v.phone || '', material: mats[0] || DEFAULT_MATERIALS[0], materialCustom: false })
  }

  async function save(e) {
    e.preventDefault()
    const m = drawer
    const created = await WasteAPI.createSale({
      vendor_id: m.vendor_id || null,
      vendor_name: m.vendor_name || m.buyer_name || null,
      buyer_name: m.buyer_name, mobile: m.mobile, material: m.material, unit: m.unit,
      weight_kg: Number(m.quantity), rate: Number(m.rate), amount,
      mode: m.mode, txn_ref: m.mode === 'UPI/QR Code' ? (m.txn_ref || null) : null, paid_at: m.paid_at || null,
      verified_by: m.verified_by || null,
    })
    setDrawer(null); load(); setPrintDoc(created)
  }

  return (
    <div>
      <PageTitle title="Waste Material Sales Management" subtitle="Record waste material sales, accept payments and generate receipt."
        actions={canWrite && <button onClick={() => setDrawer(emptyForm())} className="btn-maroon !py-2.5"><Plus size={16} /> Record Waste Material Sale</button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={IndianRupee} color="#8a1c1c" bg="bg-maroon-50" title="Total Sales Amount" value={stats ? inr(stats.total_amount) : '—'} sub="All Time" />
        <StatTile icon={CalendarDays} color="#059669" bg="bg-emerald-50" title="Today's Sales Amount" value={stats ? inr(stats.today_amount) : '—'} sub={`Today (${fmtDate(new Date().toISOString())})`} />
        <StatTile icon={ShoppingCart} color="#7c3aed" bg="bg-violet-50" title="Today's Transactions" value={stats ? num(stats.today_transactions) : '—'} sub="Sales recorded today" />
        <StatTile icon={FileText} color="#2563eb" bg="bg-blue-50" title="Total Sale Records" value={stats ? num(stats.total_records) : '—'} sub="All Time" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Search by Buyer Name / Mobile / Receipt No.</label>
            <div className="relative"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search here…" className="input pr-9" /></div>
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
            <label className="block text-[12px] text-gray-500 mb-1.5">Material Type</label>
            <select value={material} onChange={(e) => setMaterial(e.target.value)} className="input"><option value="">All</option>{DEFAULT_MATERIALS.map((m) => <option key={m}>{m}</option>)}</select>
          </div>
          <div>
            <label className="block text-[12px] text-gray-500 mb-1.5">Payment Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="input"><option value="">All</option><option value="Cash">Cash</option><option value="UPI/QR Code">UPI / QR Code</option></select>
          </div>
          <div className="xl:col-span-4 flex gap-2 justify-end">
            <button onClick={() => { setQ(''); setMaterial(''); setMode(''); setStart(''); setEnd('') }} className="btn-outline !py-2.5"><RotateCcw size={14} /> Reset</button>
            <button onClick={() => load()} className="btn-maroon !py-2.5"><Search size={14} /> Search</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[11px] uppercase tracking-wide text-gray-500">
              {['Receipt No.', 'Date & Time', 'Buyer Name', 'Mobile Number', 'Material Type', 'Quantity / Unit', 'Rate (₹/Unit)', 'Amount (₹)', 'Payment Mode', 'Actions'].map((c) => <th key={c} className="px-4 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[12px] text-gray-500 whitespace-nowrap">{s.code}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="text-gray-700 text-[13px]">{fmtDate(s.paid_at || s.created_at)}</div><div className="text-[11px] text-gray-400">{fmtTime(s.paid_at || s.created_at)}</div></td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{s.buyer_name}</td>
                  <td className="px-4 py-3 text-gray-600">{s.mobile || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.material}</td>
                  <td className="px-4 py-3 text-gray-700">{money2(s.weight_kg)} {unitShort(s.unit)}</td>
                  <td className="px-4 py-3 text-gray-700">{money2(s.rate)}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{money2(s.amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{modeLabel(s.mode)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-gray-400">
                      <button onClick={() => setPrintDoc(s)} title="View" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                      <button onClick={() => setPrintDoc(s)} title="Print receipt" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 hover:text-maroon-700 hover:border-maroon-300"><Printer size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">No sales records found.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit="records" />
        </div>
      </div>

      {/* ── Record Waste Material Sale drawer ── */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800">Record Waste Material Sale</h3>
                <p className="text-[13px] text-gray-500 mt-0.5">Enter sale details, accept payment and generate receipt.</p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-6 flex-1">
              {/* 1. Buyer Details */}
              <div>
                <div className="text-maroon-700 font-semibold text-[14px] mb-3">1. Buyer Details</div>
                <div className="mb-4">
                  <label className="label">Vendor</label>
                  <select className="input" value={drawer.vendor_id} onChange={(e) => onVendor(e.target.value)}>
                    <option value="">Other / walk-in buyer</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.phone ? ` — ${v.phone}` : ''}</option>)}
                  </select>
                </div>
                {drawer.vendor_id ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="label">Buyer Name</label><input disabled className="input bg-gray-50" value={drawer.buyer_name} /></div>
                    <div><label className="label">Mobile Number</label><input disabled className="input bg-gray-50" value={drawer.mobile} /></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="label">Buyer Name *</label><input required className="input" placeholder="Enter buyer name" value={drawer.buyer_name} onChange={(e) => setM({ buyer_name: e.target.value })} /></div>
                    <div><label className="label">Mobile Number *</label><input required className="input" placeholder="Enter mobile number" value={drawer.mobile} onChange={(e) => setM({ mobile: e.target.value })} /></div>
                  </div>
                )}
              </div>

              {/* 2. Material Details */}
              <div>
                <div className="text-maroon-700 font-semibold text-[14px] mb-3">2. Material Details</div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="label">Material Type *</label>
                    <select className="input" value={drawer.materialCustom ? '__other__' : drawer.material} onChange={(e) => { const v = e.target.value; if (v === '__other__') setM({ materialCustom: true, material: '' }); else setM({ materialCustom: false, material: v }) }}>
                      {materialOptions.map((m) => <option key={m}>{m}</option>)}
                      <option value="__other__">Other</option>
                    </select>
                    {drawer.materialCustom && <input required className="input mt-2" placeholder="Enter material" value={drawer.material} onChange={(e) => setM({ material: e.target.value })} />}
                  </div>
                  <div><label className="label">Unit *</label><select className="input" value={drawer.unit} onChange={(e) => setM({ unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div><label className="label">Quantity *</label>
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                      <button type="button" onClick={() => setM({ quantity: Math.max(0, (Number(drawer.quantity) || 0) - 1) })} className="w-10 h-11 grid place-items-center text-gray-500 hover:bg-gray-50 border-r border-gray-200"><Minus size={15} /></button>
                      <input type="number" step="0.01" min="0" value={drawer.quantity} onChange={(e) => setM({ quantity: e.target.value })} className="flex-1 w-full text-center font-semibold text-gray-800 outline-none h-11" />
                      <button type="button" onClick={() => setM({ quantity: (Number(drawer.quantity) || 0) + 1 })} className="w-10 h-11 grid place-items-center text-gray-500 hover:bg-gray-50 border-l border-gray-200"><Plus size={15} /></button>
                    </div>
                  </div>
                  <div><label className="label">Rate per Unit (₹) *</label><input required type="number" step="0.01" min="0" className="input" placeholder="0.00" value={drawer.rate} onChange={(e) => setM({ rate: e.target.value })} /></div>
                </div>
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl px-4 py-3.5 mt-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 grid place-items-center shrink-0"><Calculator size={18} /></div>
                  <div>
                    <div className="text-[12px] text-gray-500">Calculated Amount</div>
                    <div className="text-2xl font-extrabold text-gray-800 leading-none mt-0.5">₹ {money2(amount)}</div>
                    <div className="text-[11px] text-gray-400 mt-1">{money2(drawer.quantity)} {unitShort(drawer.unit)} × ₹{money2(drawer.rate)} per {unitShort(drawer.unit)}</div>
                  </div>
                </div>
              </div>

              {/* 3. Payment Details */}
              <div>
                <div className="text-maroon-700 font-semibold text-[14px] mb-3">3. Payment Details</div>
                <label className="label">Payment Mode *</label>
                <div className="flex gap-6 mt-1 mb-4">
                  {['Cash', 'UPI/QR Code'].map((mo) => (
                    <label key={mo} className="flex items-center gap-2 text-sm text-gray-700"><input type="radio" name="pmode" className="accent-maroon-700" checked={drawer.mode === mo} onChange={() => setM({ mode: mo })} /> {mo === 'UPI/QR Code' ? 'UPI / QR Code' : mo}</label>
                  ))}
                </div>
                {drawer.mode === 'UPI/QR Code' && (
                  <div className="mb-4"><label className="label">UPI Transaction ID / UTR *</label>
                    <div className="relative"><input required className="input pr-9" placeholder="Enter UPI transaction ID / UTR" value={drawer.txn_ref} onChange={(e) => setM({ txn_ref: e.target.value })} />
                      {drawer.txn_ref && <span className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-emerald-500 text-white grid place-items-center"><Check size={12} /></span>}</div>
                  </div>
                )}
                <div className="mb-4"><label className="label">Sale / Payment Date & Time *</label>
                  <div className="relative"><input required type="datetime-local" className="input pr-9" value={drawer.paid_at} onChange={(e) => setM({ paid_at: e.target.value })} /><Calendar size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /></div></div>
                <div className="mb-4"><label className="label">Verified By</label>
                  <select className="input" value={drawer.verified_by} onChange={(e) => setM({ verified_by: e.target.value })}>
                    <option value="">Select…</option>{committeeNames.map((n) => <option key={n}>{n}</option>)}
                  </select></div>
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl px-4 py-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center shrink-0"><IndianRupee size={17} /></div>
                  <div className="flex-1">
                    <div className="text-[12px] text-gray-500">Total Amount</div>
                    <div className="text-xl font-extrabold text-gray-800 leading-none">₹ {money2(amount)}</div>
                  </div>
                  <div className="text-right max-w-[52%]">
                    <div className="text-[11px] text-gray-400">Amount In Words</div>
                    <div className="text-[11.5px] text-gray-600 font-medium leading-tight">{toWords(amount)}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center">Cancel</button>
              <button className="btn-maroon flex-1 justify-center">Save Payment &amp; Generate Receipt <Printer size={15} /></button>
            </div>
          </form>
        </div>
      )}

      {printDoc && (
        <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4 no-print" onClick={() => setPrintDoc(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
            <div id="print-area">
              <Receipt title="Waste Material Sale Receipt" titleTe="వ్యర్థ పదార్థ విక్రయ రసీదు" no={printDoc.code} subNo={fmtDate(printDoc.paid_at || printDoc.created_at)} subNoLabel="Date" amount={printDoc.amount}
                rows={[
                  { en: 'Buyer', value: printDoc.buyer_name },
                  { en: 'Mobile', value: printDoc.mobile || '—' },
                  { en: 'Material', value: printDoc.material, valueTe: te(printDoc.material) },
                  { en: 'Quantity', value: `${money2(printDoc.weight_kg)} ${unitShort(printDoc.unit)}` },
                  { en: 'Rate', value: `₹${money2(printDoc.rate)} / ${unitShort(printDoc.unit)}` },
                  { en: 'Payment Mode', value: modeLabel(printDoc.mode) },
                  ...(printDoc.txn_ref ? [{ en: 'Transaction', value: printDoc.txn_ref }] : []),
                ]}
                footerNote={toWords(printDoc.amount)} />
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
