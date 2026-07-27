import React from 'react'
import { useTemple } from '../../lib/SiteContext.jsx'
import { useLang } from '../../i18n/LanguageContext.jsx'

// Printable ticket / receipt. It follows the selected language exactly like the
// rest of the app: English mode prints English, Telugu mode prints Telugu — not
// both. Labels resolve through t(), so the receipt shares the single dictionary
// rather than the small receipt-only glossary it used to depend on.
//
// A row may carry its own `valueTe` (a stored Telugu spelling — a pooja's
// `name_te`, a devotee's name) which is authoritative for that value; anything
// without one falls back to t() and then to the English text.
export function Receipt({ title = 'Pooja Ticket', titleTe = 'పూజ టికెట్', no, subNo, subNoLabel = 'Booking No', rows = [], amount, footerNote }) {
  const temple = useTemple()
  const { lang, t } = useLang()
  const te = lang === 'te'
  const L = (s) => (te ? t(s) : s)                      // label
  const V = (v, vTe) => (te && vTe ? vTe : (te ? t(v) : v))   // value, stored Telugu wins
  const font = te ? 'font-telugu' : ''

  return (
    <div className={`receipt font-sans ${font}`}>
      {/* Temple header */}
      <div className="text-center">
        <div className="text-2xl">🛕</div>
        <div className="font-display font-bold text-maroon-800 text-[0.9375rem] leading-tight tracking-wide">
          {te ? (temple?.nameTelugu || t(temple?.name) || t('Sri Shirdi Sai Baba Temple')) : (temple?.name || 'Sri Shirdi Sai Baba Temple')}
        </div>
        <div className="text-[0.625rem] text-gray-500 mt-0.5">
          {te ? (temple?.addressTe || t(temple?.address || '')) : (temple?.address || '')}
        </div>
        <div className="text-[0.625rem] text-gray-500">☎ {temple?.phone || ''}</div>
      </div>

      <div className="my-2 border-t border-dashed border-gray-400" />

      <div className="text-center">
        <span className="font-bold text-maroon-700 uppercase tracking-wide text-sm">{te ? (titleTe || t(title)) : title}</span>
      </div>
      {no && <div className="text-center text-xs text-gray-500 mt-0.5">{L('Receipt No')} <span className="font-mono">{no}</span></div>}
      {subNo && <div className="text-center text-[0.6875rem] text-gray-400">{L(subNoLabel)}: <span className="font-mono">{subNo}</span></div>}

      <div className="my-2 border-t border-dashed border-gray-400" />

      {/* Detail rows */}
      <table className="w-full text-[0.8125rem]">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              <td className="py-1 pr-2 text-gray-500 whitespace-nowrap">{L(r.en)}</td>
              <td className="py-1 text-right font-semibold text-gray-800">{V(r.value, r.valueTe)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-2 border-t-2 border-gray-500" />

      {/* Amount */}
      <div className="flex justify-between items-center">
        <span className="font-bold text-maroon-800">{L('Amount')}</span>
        <span className="font-extrabold text-maroon-800 text-lg">₹ {Number(amount || 0).toLocaleString('en-IN')}</span>
      </div>

      <div className="my-2 border-t border-dashed border-gray-400" />

      <div className="text-center text-[0.625rem] text-gray-500 leading-relaxed">
        <div className={te ? 'text-maroon-700 text-xs' : 'font-display text-maroon-700 text-xs tracking-wide'}>
          {te ? '|| ఓం శ్రీ సాయి రామ్ ||' : '|| Om Sri Sai Ram ||'}
        </div>
        {footerNote && <div className="mt-1">{L(footerNote)}</div>}
        {temple?.receiptFooter && <div className="mt-1 font-medium text-maroon-700">{t(temple.receiptFooter)}</div>}
        <div className="mt-1">{L('This is a computer-generated receipt.')}</div>
      </div>
    </div>
  )
}
