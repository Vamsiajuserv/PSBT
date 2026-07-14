import React from 'react'
import { Landmark } from 'lucide-react'

// Deterministic decorative QR from a seed string (self-contained, no external dep).
export function QRCode({ seed = 'PSBT', px = 92 }) {
  const N = 25
  let h = 2166136261
  for (const ch of (seed + 'psbt')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  const bit = (i) => { h = Math.imul(h ^ i, 2246822519) >>> 0; return (h >>> 13) & 1 }
  const finderOn = (x, y) => {
    const local = (bx, by) => { const lx = x - bx, ly = y - by; return (lx === 0 || lx === 6 || ly === 0 || ly === 6) || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4) }
    if (x < 7 && y < 7) return local(0, 0)
    if (x >= N - 7 && y < 7) return local(N - 7, 0)
    if (x < 7 && y >= N - 7) return local(0, N - 7)
    return null
  }
  const rects = []
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const f = finderOn(x, y)
    const on = f === null ? bit(y * N + x) : f
    if (on) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)
  }
  return <svg viewBox={`0 0 ${N} ${N}`} width={px} height={px} shapeRendering="crispEdges" fill="#3a0909">{rects}</svg>
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
        <div className="bg-white p-1 rounded border border-gray-200"><QRCode seed={code} px={72} /></div>
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
