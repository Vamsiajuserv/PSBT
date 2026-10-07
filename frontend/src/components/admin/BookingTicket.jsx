import React from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { tr, teText } from '../../i18n/LanguageContext.jsx'

// Real scannable ticket QR (closes gap SYS-01). The QR encodes the ticket /
// booking code itself, so any scanner (USB gun or phone camera) reads the exact
// string the Verify Ticket screen expects — server-side validation then runs
// the full entitlement checks (expiry, quota, once-per-day) on lookup.
export function TicketRef({ code, className = '' }) {
  return (
    <div className={`text-right shrink-0 flex flex-col items-end ${className}`}>
      {/* ~42mm on screen and paper — large enough for phone cameras and printed tickets */}
      <QRCodeSVG value={code || ''} size={160} level="M" marginSize={0}
                 className="border border-amber-200 rounded-lg p-2.5 bg-white" />
      <div className="font-mono text-[0.875rem] font-bold text-maroon-800 leading-tight mt-1.5">{code}</div>
      <div className="text-[0.6875rem] text-gray-500 mt-0.5">{tr("Scan to verify")}</div>
    </div>
  )
}

// How many ticket fields sit beside the QR (two rows of two); the rest run full width below it.
const FIELDS_BESIDE_QR = 4

// Children as a flat list of fields — <>…</> groups are unwrapped so each field counts once.
// Only real elements are kept: `{x && <TF/>}` with x === '' leaves an empty string behind,
// and cloning a string would create an element with an undefined type (crashes the ticket).
const flattenFields = (children, prefix = '') => React.Children.toArray(children).flatMap((c) => {
  if (!React.isValidElement(c)) return []
  if (c.type === React.Fragment) return flattenFields(c.props.children, prefix + c.key)
  return [prefix ? React.cloneElement(c, { key: prefix + c.key }) : c]
})

// Ornate temple ticket shell — pass the fields as children. Logo, title badge and the
// first fields stack on the left while the large QR runs down the right, so the QR's
// height is used instead of leaving a gap under the logo. `after` renders below the
// fields (e.g. terms & conditions).
export function TicketShell({ code, children, after }) {
  const fields = flattenFields(children)
  const beside = fields.slice(0, FIELDS_BESIDE_QR)
  const below = fields.slice(FIELDS_BESIDE_QR)
  return (
    <div className="bg-[#fdf7ee] border-2 border-dashed border-amber-300 rounded-2xl p-5 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <img src="/images/temple-logo.png" alt="Sai Baba Temple" className="w-12 h-12 object-contain shrink-0" />
            <div>
              <div className="font-display font-bold text-maroon-800 text-[1rem] leading-tight tracking-wide">{tr("SRI SHIRDI SAI BABA TEMPLE")}</div>
              <div className="text-[0.625rem] text-gray-700">{tr("Endowments Department, Government of Telangana")}</div>
            </div>
          </div>
          <div className="mt-3"><span className="inline-block bg-maroon-800 text-cream text-[0.75rem] font-bold tracking-wider rounded px-4 py-1.5">{tr("POOJA BOOKING TICKET")}</span></div>
          {beside.length > 0 && <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-dashed border-amber-200 pt-4 mt-4">{beside}</div>}
        </div>
        <TicketRef code={code} className="self-center sm:self-start" />
      </div>
      {below.length > 0 && <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-4">{below}</div>}
      {after}
      <div className="text-center mt-4 pt-3 border-t border-dashed border-amber-200">
        <div className="font-display text-maroon-700 tracking-wide text-sm">{tr("✦ Om Sai Ram ✦")}</div>
        <div className="text-[0.6875rem] text-gray-500 mt-0.5">{tr("Thank you for your devotion. May Sai Baba bless you.")}</div>
      </div>
    </div>
  )
}

// One field in the ticket grid.
export function TF({ icon: Icon, label, value, sub, wide, mono }) {
  value = typeof value === 'string' ? teText(value) : value

  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="flex items-center gap-1.5 text-[0.6875rem] text-gray-500">{Icon && <Icon size={12} className="text-maroon-500" />}{label}</div>
      <div className={`text-[0.8125rem] text-gray-800 font-semibold ${mono ? 'font-mono' : ''}`}>{value}</div>
      {sub && <div className="text-[0.625rem] text-gray-400">{sub}</div>}
    </div>
  )
}
