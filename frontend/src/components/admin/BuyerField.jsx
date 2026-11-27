import React, { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { DevoteesAPI } from '../../api/client.js'
import { T, tr, personName, useLang } from '../../i18n/LanguageContext.jsx'
import { Pill } from './ui.jsx'

// A mobile number: 10 digits, starting 6–9 (same rule as the server)
export const MOBILE_OK = /^[6-9]\d{9}$/
// A name needs letters — digits only means a mobile was typed into the name box
export const NAME_OK = (s) => /\p{L}/u.test(s || '')

/**
 * Auction / Open Sale buyer (client, 2026-11-27). Typing a name or mobile shows, at once, matching devotees
 * and outsiders who bought before. Picking a devotee links the buyer to them; picking an earlier outsider
 * fills the name and mobile. Anyone else is a new outsider: name (for the receipt) + mobile, never added
 * to Devotees. (The server also links a full mobile that belongs to exactly one devotee.)
 *
 * value: { buyer_name, buyer_mobile, devotee_id, devotee_code }; onChange(patch)
 */
export default function BuyerField({ value, onChange, mobileRequired = true }) {
  const { lang } = useLang()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([])
  const [touched, setTouched] = useState({ name: false, mobile: false })
  const linked = !!value.devotee_id
  const name = value.buyer_name || ''
  const mobile = value.buyer_mobile || ''

  useEffect(() => {
    const t = q.trim()
    if (linked || t.length < 3) { setHits([]); return undefined }
    const h = setTimeout(() => DevoteesAPI.buyerLookup({ q: t })
      .then((r) => setHits(r.items || [])).catch(() => setHits([])), 250)
    return () => clearTimeout(h)
  }, [q, linked])

  const pick = (d) => {
    onChange(d.kind === 'devotee'
      ? { devotee_id: d.id, devotee_code: d.code, buyer_name: d.name, buyer_mobile: d.mobile || '' }
      : { devotee_id: null, devotee_code: null, buyer_name: d.name, buyer_mobile: d.mobile || '' })
    setHits([]); setQ('')
  }
  const change = () => { onChange({ devotee_id: null, devotee_code: null, buyer_name: '', buyer_mobile: '' }); setTouched({ name: false, mobile: false }) }
  // The name box also searches by mobile. Digits typed there stay in it while typing (the suggestions search
  // by them); once all 10 are in — or on leaving the box — they move to the mobile box. Moving them on every
  // key replaced the previous digit each time (2026-11-27).
  const isDigits = (v) => /^[\d\s+-]+$/.test(v) && /\d/.test(v)
  const toMobile = (v) => v.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '').slice(0, 10)
  const setName = (v) => {
    if (isDigits(v)) {
      const raw = v.replace(/\D/g, '')
      const m = toMobile(v)
      if (raw.length >= 10) { onChange({ buyer_name: '', buyer_mobile: m }); setQ(m); return }   // a full number
      onChange({ buyer_name: raw }); setQ(raw); return                                         // still typing
    }
    onChange({ buyer_name: v }); setQ(v)
  }
  const leaveName = () => {
    if (isDigits(name)) onChange({ buyer_name: '', buyer_mobile: toMobile(name) })
    setTouched((t) => ({ ...t, name: true }))
  }
  const setMobile = (v) => { const m = v.replace(/\D/g, '').slice(0, 10); onChange({ buyer_mobile: m }); setQ(m) }

  // a full mobile that is exactly one devotee's: the server links it — say so before saving
  const sameMobile = mobile.length === 10 ? hits.filter((d) => d.kind === 'devotee' && d.mobile === mobile) : []
  const mobileErr = mobile && !MOBILE_OK.test(mobile) ? tr('Enter a valid 10-digit mobile number (starts with 6, 7, 8 or 9).')
    : touched.mobile && mobileRequired && !mobile ? tr("Enter the buyer's 10-digit mobile number.") : ''
  const nameErr = (touched.name || MOBILE_OK.test(mobile)) && !NAME_OK(name) ? tr("Enter the buyer's name — it goes on the receipt.") : ''

  if (linked) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[0.8125rem]">
        <CheckCircle2 size={15} className="text-emerald-700" />
        <b className="text-gray-800">{personName({ name }, lang)}</b>
        <span className="text-gray-600">{mobile}</span>
        <Pill tone="green">{tr('Devotee')} {value.devotee_code}</Pill>
        <button type="button" onClick={change} className="ml-auto text-maroon-700 font-semibold hover:underline"><T>Change</T></button>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label"><T>Buyer name *</T></label>
          <input className={`input ${nameErr ? '!border-red-400' : ''}`} maxLength={120} value={name} placeholder={tr('Type name or mobile to find a devotee')}
            onChange={(e) => setName(e.target.value)} onBlur={leaveName} aria-invalid={!!nameErr} /></div>
        <div><label className="label">{mobileRequired ? tr('Mobile *') : tr('Mobile')}</label>
          <input className={`input ${mobileErr ? '!border-red-400' : ''}`} type="tel" inputMode="numeric" maxLength={10} placeholder={tr('10-digit mobile')} value={mobile}
            onChange={(e) => setMobile(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, mobile: true }))} aria-invalid={!!mobileErr} /></div>
      </div>
      {(nameErr || mobileErr) && <div className="text-[0.75rem] text-red-600">{[nameErr, mobileErr].filter(Boolean).join(' · ')}</div>}
      {hits.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm divide-y divide-gray-100" role="listbox" aria-label={tr('Matching devotees')}>
          {hits.map((d) => (
            <button type="button" key={`${d.kind}-${d.id || d.mobile}`} role="option" aria-selected="false" onClick={() => pick(d)}
              className="w-full flex items-center gap-3 px-3 py-2 text-left text-[0.8125rem] hover:bg-maroon-50/50">
              <span className="font-semibold text-gray-800">{personName(d, lang)}</span>
              <span className="text-gray-600">{d.mobile}</span>
              <span className="ml-auto">{d.kind === 'devotee'
                ? <span className="font-mono text-[0.72rem] text-gray-500">{d.code}</span>
                : <Pill tone="gray">{tr('Bought before')}</Pill>}</span>
            </button>))}
        </div>)}
      <div className="text-[0.6875rem] text-gray-500">
        {sameMobile.length === 1
          ? <span className="text-emerald-700">{tr('This mobile belongs to devotee')} {sameMobile[0].code} — {tr('it will be linked to them.')}</span>
          : NAME_OK(name)
            ? <><Pill tone="gray">{tr('Outsider')}</Pill> {tr('Not in Devotees — saved with name and mobile only.')}</>
            : tr('Pick a devotee from the list, or type an outsider’s name and mobile.')}
      </div>
    </div>
  )
}
