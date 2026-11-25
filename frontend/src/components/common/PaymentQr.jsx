import React from 'react'
import { tr } from '../../i18n/LanguageContext.jsx'

// The temple's own printed UPI QR ("SHRI SHIRDI SAI PREM SAMAJ"), shown on the billing screens
// for online payment (client, 2026-11-20 — replaces the QR generated from Settings › UPI ID).
// The image cannot carry the bill amount, so the amount to pay is shown under it.
// File: frontend/public/PSBT QR.jpeg
export const PAYMENT_QR_SRC = encodeURI('/PSBT QR.jpeg')

const money2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PaymentQr({ amount, size = 140, className = '' }) {
  return (
    <div className={`flex flex-col items-center bg-white border border-gray-100 rounded-lg p-3 ${className}`}>
      <img src={PAYMENT_QR_SRC} alt={tr('Scan to pay')} width={size} style={{ width: size, height: 'auto' }}
           className="rounded" loading="lazy" />
      <p className="text-[0.75rem] text-gray-600 mt-1.5">
        {tr('Scan to pay')} · <span className="font-bold text-maroon-800 tabular-nums">₹{money2(amount)}</span>
      </p>
    </div>
  )
}
