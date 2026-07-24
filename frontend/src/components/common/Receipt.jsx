import React from 'react'
import { te } from '../../lib/telugu.js'
import { useTemple } from '../../lib/SiteContext.jsx'
import { useLang } from '../../i18n/LanguageContext.jsx'

// Printable ticket / receipt that follows the selected language:
//   English mode → clean English-only receipt.
//   Telugu mode  → bilingual (Telugu-led) via the verified glossary; values may
//                  carry their own Telugu (e.g. Sanskrit pooja name_te) via `valueTe`.
export function Receipt({ title = 'Pooja Ticket', titleTe = 'పూజ టికెట్', no, subNo, subNoLabel = 'Booking No', rows = [], amount, footerNote }) {
  const temple = useTemple()
  const { lang } = useLang()
  const bi = lang === 'te'
  return (
    <div className="receipt font-sans">
      {/* Temple header */}
      <div className="text-center">
        <div className="text-2xl">🛕</div>
        <div className="font-display font-bold text-maroon-800 text-[0.9375rem] leading-tight tracking-wide">{temple?.name || 'Sri Shirdi Sai Baba Temple'}</div>
        {bi && <div className="font-telugu text-maroon-700 text-[0.8125rem] leading-tight">{temple?.nameTelugu || ''}</div>}
        <div className="text-[0.625rem] text-gray-500 mt-0.5">{temple?.address || ''}</div>
        <div className="text-[0.625rem] text-gray-500">☎ {temple?.phone || ''}</div>
      </div>

      <div className="my-2 border-t border-dashed border-gray-400" />

      <div className="text-center">
        <span className="font-bold text-maroon-700 uppercase tracking-wide text-sm">{title}</span>
        {bi && <span className="font-telugu text-maroon-700 text-sm"> / {titleTe}</span>}
      </div>
      {no && <div className="text-center text-xs text-gray-500 font-mono mt-0.5">{(bi && te('Receipt No')) || 'Receipt No'} {no}</div>}
      {subNo && <div className="text-center text-[0.6875rem] text-gray-400 font-mono">{(bi && te(subNoLabel)) || subNoLabel}: {subNo}</div>}

      <div className="my-2 border-t border-dashed border-gray-400" />

      {/* Detail rows */}
      <table className="w-full text-[0.8125rem]">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              <td className="py-1 pr-2 text-gray-500 whitespace-nowrap">
                {r.en}
                {bi && te(r.en) && <span className="block font-telugu text-[0.625rem] text-gray-400 leading-none">{te(r.en)}</span>}
              </td>
              <td className="py-1 text-right font-semibold text-gray-800">
                {r.value}
                {bi && r.valueTe && <span className="block font-telugu text-[0.6875rem] text-maroon-600 font-medium leading-tight">{r.valueTe}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-2 border-t-2 border-gray-500" />

      {/* Amount */}
      <div className="flex justify-between items-center">
        <span className="font-bold text-maroon-800">Amount {bi && <span className="font-telugu">/ {te('Amount')}</span>}</span>
        <span className="font-extrabold text-maroon-800 text-lg">₹ {Number(amount || 0).toLocaleString('en-IN')}</span>
      </div>

      <div className="my-2 border-t border-dashed border-gray-400" />

      <div className="text-center text-[0.625rem] text-gray-500 leading-relaxed">
        <div className={bi ? 'font-telugu text-maroon-700 text-xs' : 'font-display text-maroon-700 text-xs tracking-wide'}>{bi ? '|| ఓం శ్రీ సాయి రామ్ ||' : '|| Om Sri Sai Ram ||'}</div>
        {footerNote && <div className="mt-1">{footerNote}</div>}
        <div className="mt-1">This is a computer-generated receipt.</div>
        {bi && <div className="font-telugu">ఇది కంప్యూటర్ ద్వారా రూపొందించబడిన రసీదు.</div>}
      </div>
    </div>
  )
}
