import React from 'react'
import { Landmark } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

// Real scannable ticket QR (closes gap SYS-01). The QR encodes the ticket /
// booking code itself, so any scanner (USB gun or phone camera) reads the exact
// string the Verify Ticket screen expects — server-side validation then runs
// the full entitlement checks (expiry, quota, once-per-day) on lookup.
export function TicketRef({ code }) {
  return (
    <div className="text-right shrink-0 flex flex-col items-end">
      <QRCodeSVG value={code || ''} size={68} level="M" marginSize={0}
                 className="border border-amber-200 rounded-md p-1 bg-white" />
      <div className="font-mono text-[0.75rem] font-bold text-maroon-800 leading-tight mt-1">{code}</div>
      <div className="text-[0.5625rem] text-gray-400 mt-0.5">Scan to verify</div>
    </div>
  )
}

// Ornate temple ticket shell — pass the field grid as children.
export function TicketShell({ code, children }) {
  return (
    <div className="bg-[#fdf7ee] border-2 border-dashed border-amber-300 rounded-2xl p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Landmark size={40} className="text-amber-600 shrink-0" />
          <div>
            <div className="font-display font-bold text-maroon-800 text-[1rem] leading-tight tracking-wide">SRI SHIRDI SAI BABA TEMPLE</div>
            <div className="text-[0.625rem] text-gray-500">Endowments Department, Government of Telangana</div>
          </div>
        </div>
        <TicketRef code={code} />
      </div>
      <div className="text-center my-4"><span className="inline-block bg-maroon-800 text-cream text-[0.75rem] font-bold tracking-wider rounded px-4 py-1.5">POOJA BOOKING TICKET</span></div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-dashed border-amber-200 pt-4">{children}</div>
      <div className="text-center mt-4 pt-3 border-t border-dashed border-amber-200">
        <div className="font-display text-maroon-700 tracking-wide text-sm">✦ Om Sai Ram ✦</div>
        <div className="text-[0.6875rem] text-gray-500 mt-0.5">Thank you for your devotion. May Sai Baba bless you.</div>
      </div>
    </div>
  )
}

// One field in the ticket grid.
export function TF({ icon: Icon, label, value, sub, wide, mono }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="flex items-center gap-1.5 text-[0.6875rem] text-gray-500">{Icon && <Icon size={12} className="text-maroon-500" />}{label}</div>
      <div className={`text-[0.8125rem] text-gray-800 font-semibold ${mono ? 'font-mono' : ''}`}>{value}</div>
      {sub && <div className="text-[0.625rem] text-gray-400">{sub}</div>}
    </div>
  )
}
