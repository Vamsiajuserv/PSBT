import React from 'react'
import { Landmark } from 'lucide-react'

// Honest ticket reference. A real scannable QR + server-side verification is a
// planned feature (see gap register SYS-01); until it exists we show the booking
// code as a plain reference rather than a decorative graphic that looks scannable
// but encodes nothing.
export function TicketRef({ code }) {
  return (
    <div className="text-right shrink-0">
      <div className="text-[9px] uppercase tracking-wider text-gray-400">Ref No.</div>
      <div className="font-mono text-[13px] font-bold text-maroon-800 leading-tight">{code}</div>
      <div className="text-[9px] text-gray-400 mt-0.5">Verify at counter</div>
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
            <div className="font-display font-bold text-maroon-800 text-[16px] leading-tight tracking-wide">SRI SHIRDI SAI BABA TEMPLE</div>
            <div className="text-[10px] text-gray-500">Endowments Department, Government of Telangana</div>
          </div>
        </div>
        <TicketRef code={code} />
      </div>
      <div className="text-center my-4"><span className="inline-block bg-maroon-800 text-cream text-[12px] font-bold tracking-wider rounded px-4 py-1.5">POOJA BOOKING TICKET</span></div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-dashed border-amber-200 pt-4">{children}</div>
      <div className="text-center mt-4 pt-3 border-t border-dashed border-amber-200">
        <div className="font-display text-maroon-700 tracking-wide text-sm">✦ Om Sai Ram ✦</div>
        <div className="text-[11px] text-gray-500 mt-0.5">Thank you for your devotion. May Sai Baba bless you.</div>
      </div>
    </div>
  )
}

// One field in the ticket grid.
export function TF({ icon: Icon, label, value, sub, wide, mono }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">{Icon && <Icon size={12} className="text-maroon-500" />}{label}</div>
      <div className={`text-[13px] text-gray-800 font-semibold ${mono ? 'font-mono' : ''}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  )
}
