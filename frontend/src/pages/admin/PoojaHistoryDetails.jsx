import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Printer, Download, User, Landmark, IndianRupee, CreditCard, ClipboardList,
  Ticket, Calendar, CalendarDays, Tag, CheckCircle2, UserCog,
} from 'lucide-react'
import { PageTitle, fmtDate, fmtStamp } from '../../components/admin/ui.jsx'
import { LoadingBlock, ErrorBlock } from '../../components/common/states.jsx'
import { TicketShell, TF } from '../../components/admin/BookingTicket.jsx'
import { PoojaHistoryAPI } from '../../api/client.js'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const money2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const shortPooja = (name) => (name || '').replace(/^Sri Shirdi Sai Baba\s+/i, '').split(' ').slice(-1)[0]
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const weekday = (d) => (d ? new Date(d).toLocaleDateString('en-US', { weekday: 'long' }) : '')
const modeLabel = (m) => (m === 'UPI' || m === 'UPI/QR Code' || m === 'Online' ? 'UPI / QR Code' : (m || 'Cash'))
function durDays(pl) { const n = (pl?.plan_name || '').toLowerCase(); if (n.includes('life')) return null; if (pl?.duration_days) return pl.duration_days; if (n.includes('monthly')) return 30; if (n.includes('year')) return 365; return 1 }
function validityRange(pl, from) { const d = durDays(pl); if (d === null || !from) return 'Lifetime'; const to = addDays(from, d - 1); return `${d} Day${d > 1 ? 's' : ''} (${fmtDate(from)}${d > 1 ? ` to ${fmtDate(to)}` : ''})` }
const validityShort = (pl) => { const n = (pl?.plan_name || '').toLowerCase(); if (n.includes('daily')) return '1 Day'; if (n.includes('monthly')) return '1 Month'; if (n.includes('life')) return 'Lifetime'; if (n.includes('one')) return 'One-Time'; if (n.includes('year')) return '1 Year'; return pl?.frequency || 'Selected Date' }

export default function PoojaHistoryDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const [d, setD] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const load = useCallback(() => {
    setLoadErr('')
    PoojaHistoryAPI.detail(id).then(setD).catch((ex) => { setD(null); setLoadErr(ex?.detail || "Couldn't load this pooja record — check your connection and retry.") })
  }, [id])
  useEffect(() => { load() }, [load])
  if (loadErr) return <ErrorBlock message={loadErr} onRetry={load} />
  if (!d) return <LoadingBlock />

  const dev = d.devotee || {}, plan = d.plan || {}, pr = d.poojari || {}
  const ticketNo = d.ticket_no || d.receipt_no
  const mode = modeLabel(d.payment_method)
  const isUpi = mode.includes('UPI')
  const validRange = validityRange(plan, d.scheduled_date)
  const completed = d.completion === 'Completed'

  return (
    <div>
      <div className="text-[0.75rem] text-gray-400 mb-1"><Link to="/admin/pooja-history" className="hover:text-maroon-600"><T>Pooja Management</T></Link> › <Link to="/admin/pooja-history" className="hover:text-maroon-600"><T>Pooja History</T></Link> › <span className="text-gray-500"><T>Pooja History Details</T></span></div>
      <PageTitle title={tr("Pooja History Details")} actions={<button onClick={() => nav('/admin/pooja-history')} className="btn-outline !py-2.5"><ArrowLeft size={15} />{' '}<T>Back to Pooja History List</T></button>} />

      {/* Summary strip */}
      <div className="bg-amber-50/40 border border-amber-100 rounded-xl px-5 py-4 mb-5 flex flex-wrap items-center gap-x-8 gap-y-4">
        <Meta icon={ClipboardList} label="Booking ID" value={<span className="font-mono">{d.booking_code}</span>} />
        <Meta icon={Ticket} label="Ticket Number" value={<span className="font-mono">{ticketNo}</span>} />
        <Meta icon={Calendar} label="Booking Date & Time" value={fmtStamp(d.created_at)} />
        <Meta icon={CalendarDays} label="Pooja Date" value={fmtDate(d.scheduled_date)} />
        <div className="ml-auto flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
          <CheckCircle2 size={26} className="text-emerald-600" />
          <div><div className="text-[0.6875rem] text-gray-500"><T>Final Status</T></div><div className="text-[0.9375rem] font-extrabold text-emerald-700 leading-none">{completed ? 'COMPLETED' : (d.completion || '').toUpperCase()}</div><div className="text-[0.625rem] text-gray-400 mt-0.5"><T>Pooja Completed Successfully</T></div></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left column */}
        <div className="space-y-5">
          <Section n="1" icon={User} title={tr("Devotee Details")}>
            <Row label="Devotee Name" value={dev.name} />
            <Row label="Mobile Number" value={dev.mobile} />
            <Row label="Email (if any)" value={dev.email || '—'} />
          </Section>
          <Section n="2" icon={Landmark} title={tr("Pooja & Plan Details")}>
            <Row label="Pooja Name" value={d.pooja_name} />
            <Row label="Plan" value={`${plan.plan_name || ''} ${shortPooja(d.pooja_name)}`} />
            <Row label="Plan Type" value={plan.plan_name} />
            <Row label="Rate Type" value={plan.rate_type} />
            <Row label="Plan Description" value={`${plan.description || ''} for ${validityShort(plan)}`.trim()} />
          </Section>
          <Section n="3" icon={CalendarDays} title={tr("Booking & Validity Details")}>
            <Row label="Pooja Date" value={`${fmtDate(d.scheduled_date)} (${weekday(d.scheduled_date)})`} />
            <Row label="Booking Date & Time" value={fmtStamp(d.created_at)} />
            <Row label="Validity" value={validRange} />
            <Row label="Completion Status" value={<span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold"><CheckCircle2 size={14} /> {d.completion}</span>} />
          </Section>
          {pr.name && (
            <Section n="4" icon={UserCog} title={tr("Poojari Details")}>
              <Row label="Poojari Name" value={pr.name} />
              <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg px-3.5 py-2.5 text-[0.78125rem] text-gray-600 flex items-center gap-2 mt-1"><CheckCircle2 size={15} className="text-emerald-600 shrink-0" />{' '}<T>Pooja was performed by the assigned Poojari.</T></div>
            </Section>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <div id="print-area">
            <TicketShell code={d.booking_code}>
              <TF icon={ClipboardList} label="Booking ID" value={d.booking_code} mono />
              <TF icon={Ticket} label="Ticket Number" value={ticketNo} mono />
              <TF icon={User} label="Devotee" value={dev.name} sub={dev.mobile} />
              <TF icon={Landmark} label="Pooja" value={d.pooja_name} />
              <TF icon={CalendarDays} label="Plan" value={`${plan.plan_name || ''} ${shortPooja(d.pooja_name)}`} />
              <TF icon={Tag} label="Plan Type" value={plan.plan_name} />
              <TF icon={Calendar} label="Pooja Date" value={fmtDate(d.scheduled_date)} />
              <TF icon={CheckCircle2} label="Status" value={<span className="text-emerald-700">{d.completion}</span>} />
              <TF icon={IndianRupee} label="Rate Type" value={plan.rate_type} />
              <TF icon={IndianRupee} label="Amount Paid (₹)" value={money2(d.amount)} />
            </TicketShell>
          </div>

          <Section n="5" icon={IndianRupee} title={tr("Amount Details")}>
            <Row label="Rate (₹)" value={money2(plan.rate_amount)} />
            <div className="flex text-[0.84375rem] pt-1"><span className="text-maroon-700 font-bold w-44 shrink-0">Total Amount Paid (₹)</span><span className="text-gray-400 mr-3">:</span><span className="text-maroon-700 font-extrabold">{money2(d.amount)}</span></div>
          </Section>
          <Section n="6" icon={CreditCard} title={tr("Payment Details")}>
            <Row label="Payment Mode" value={mode} />
            {isUpi && <Row label="UTR / Transaction ID" value={<span className="text-emerald-700 font-mono">{d.payment_ref}</span>} />}
            <Row label="Payment Date & Time" value={fmtStamp(d.created_at)} />
            <Row label="Payment Status" value={<span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold"><CheckCircle2 size={14} />{' '}<T>Payment Successful</T></span>} />
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg px-3.5 py-2.5 text-[0.78125rem] text-gray-600 flex items-center gap-2 mt-1"><CheckCircle2 size={15} className="text-emerald-600 shrink-0" /> Payment received successfully on {fmtStamp(d.created_at)}.</div>
          </Section>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 justify-center mt-6 no-print">
        <button onClick={() => window.print()} className="btn-outline"><Printer size={15} />{' '}<T>Print Ticket / Receipt</T></button>
        <button onClick={() => window.print()} className="btn-outline"><Download size={15} />{' '}<T>Download PDF</T></button>
        <button onClick={() => nav('/admin/pooja-history')} className="btn-maroon"><ArrowLeft size={15} />{' '}<T>Back to Pooja History List</T></button>
      </div>
    </div>
  )
}

function Meta({ icon: Icon, label, value }) {
  return <div className="flex items-center gap-2.5"><Icon size={18} className="text-maroon-500 shrink-0" /><div><div className="text-[0.6875rem] text-gray-400">{label}</div><div className="text-[0.8125rem] text-gray-800 font-semibold">{value}</div></div></div>
}
function Section({ n, icon: Icon, title, children }) {
  return <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"><div className="flex items-center gap-2 text-maroon-700 mb-4"><Icon size={18} /><h3 className="font-serif text-lg font-bold">{n}. {title}</h3></div><div className="space-y-3">{children}</div></div>
}
function Row({ label, value }) {
  return <div className="flex text-[0.84375rem]"><span className="text-gray-500 w-44 shrink-0">{label}</span><span className="text-gray-400 mr-3">:</span><span className="text-gray-800 font-medium">{value ?? '—'}</span></div>
}
