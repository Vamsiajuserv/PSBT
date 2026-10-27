import React from 'react'
import { useTemple } from '../../lib/SiteContext.jsx'
import { useLang, tr } from '../../i18n/LanguageContext.jsx'

// Number to words converter for Indian currency - supports English and Telugu
function numberToWords(num, isTelugu = false) {
  if (num === 0) return isTelugu ? 'సున్నా' : 'Zero'

  // English number words
  const onesEn = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tensEn = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  // Telugu number words
  const onesTe = ['', 'ఒకటి', 'రెండు', 'మూడు', 'నాలుగు', 'ఐదు', 'ఆరు', 'ఏడు', 'ఎనిమిది', 'తొమ్మిది',
    'పది', 'పదకొండు', 'పన్నెండు', 'పదమూడు', 'పద్నాలుగు', 'పదిహేను', 'పదహారు', 'పదిహేడు', 'పద్దెనిమిది', 'పంతొమ్మిది']
  const tensTe = ['', '', 'ఇరవై', 'ముప్పై', 'నలభై', 'యాభై', 'అరవై', 'డెబ్బై', 'ఎనభై', 'తొంభై']

  const ones = isTelugu ? onesTe : onesEn
  const tens = isTelugu ? tensTe : tensEn
  const hundred = isTelugu ? ' వంద' : ' Hundred'
  const thousand = isTelugu ? ' వేల' : ' Thousand'
  const lakh = isTelugu ? ' లక్షల' : ' Lakh'
  const crore = isTelugu ? ' కోట్ల' : ' Crore'
  const only = isTelugu ? ' మాత్రమే' : ' Only'

  const convert = (n) => {
    if (n < 20) return ones[n]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
    if (n < 1000) return ones[Math.floor(n / 100)] + hundred + (n % 100 ? ' ' + convert(n % 100) : '')
    if (n < 100000) return convert(Math.floor(n / 1000)) + thousand + (n % 1000 ? ' ' + convert(n % 1000) : '')
    if (n < 10000000) return convert(Math.floor(n / 100000)) + lakh + (n % 100000 ? ' ' + convert(n % 100000) : '')
    return convert(Math.floor(n / 10000000)) + crore + (n % 10000000 ? ' ' + convert(n % 10000000) : '')
  }
  // Telugu inflects the place words: వంద / నూట / రెండు వందలు, వెయ్యి / రెండు వేలు,
  // and takes the joining form (వందల, వేల, లక్షల, కోట్ల) when more follows.
  const place = (count, rest, one, many, joined) => {
    if (count === 1) return one(rest)
    return convertTe(count) + (rest ? joined : many)
  }
  const convertTe = (n) => {
    if (n < 100) return convert(n)
    const tail = (r) => (r ? ' ' + convertTe(r) : '')
    if (n < 1000) { const r = n % 100; return place(Math.floor(n / 100), r, (x) => (x ? 'నూట' : 'వంద'), ' వందలు', ' వందల') + tail(r) }
    if (n < 100000) { const r = n % 1000; return place(Math.floor(n / 1000), r, () => 'వెయ్యి', ' వేలు', ' వేల') + tail(r) }
    if (n < 10000000) { const r = n % 100000; return place(Math.floor(n / 100000), r, () => 'ఒక లక్ష', ' లక్షలు', ' లక్షల') + tail(r) }
    const r = n % 10000000
    return place(Math.floor(n / 10000000), r, () => 'ఒక కోటి', ' కోట్లు', ' కోట్ల') + tail(r)
  }
  return (isTelugu ? convertTe : convert)(Math.floor(num)) + only
}

// The amount line every receipt prints: "Rupees Two Hundred Fifty Only" /
// "రూపాయలు రెండు వందల యాభై మాత్రమే".
export function amountInWords(amount, isTelugu = false) {
  return `${isTelugu ? 'రూపాయలు' : 'Rupees'} ${numberToWords(Math.round(Number(amount) || 0), isTelugu)}`
}

// Professional A4-optimized temple receipt
export function Receipt({
  title = 'Pooja Ticket',
  titleTe = 'పూజ టికెట్',
  no,
  subNo,
  subNoLabel = 'Booking No',
  rows = [],
  amount,
  amountLabel = 'Total Amount',   // material gold / silver: "Estimated Value"
  amountNote,                     // e.g. "not cash received"
  hideAmount = false,             // goods with no value (pancha…): no "₹0 · Rupees Zero Only"
  footerNote,
  showTerms = true
}) {
  const temple = useTemple()
  const { lang, t } = useLang()
  const te = lang === 'te'
  const L = (s) => (te ? t(s) : s)
  const V = (v, vTe) => (te && vTe ? vTe : (te ? t(v) : v))
  const font = te ? 'font-telugu' : ''
  const amountNum = Number(amount || 0)

  return (
    <div className={`receipt-a4 ${font}`}>
      {/* ═══════════════ TEMPLE HEADER ═══════════════ */}
      <header className="receipt-header">
        <img src="/images/temple-logo.png" alt={tr("Shri Shirdi Sai Baba Temple")} className="temple-logo-img" />
        <h1 className="temple-name">
          {te ? (temple?.nameTelugu || t(temple?.name) || t('Shri Shirdi Sai Baba Temple')) : (temple?.name || 'Shri Shirdi Sai Baba Temple')}
        </h1>
        <p className="temple-address">
          {te ? (temple?.addressTe || t(temple?.address || '')) : (temple?.address || '')}
        </p>
        <p className="temple-contact">☎ {temple?.phone || '+91 040 2335 3589'}</p>
      </header>

      {/* ═══════════════ RECEIPT TITLE BAR ═══════════════ */}
      <div className="receipt-title-bar">
        <span className="receipt-type">{te ? (titleTe || t(title)) : title}</span>
      </div>

      {/* ═══════════════ RECEIPT NUMBERS ═══════════════ */}
      <div className="receipt-meta">
        {no && (
          <div className="meta-item">
            <span className="meta-label">{L('Receipt No')}</span>
            <span className="meta-value">{no}</span>
          </div>
        )}
        {subNo && (
          <div className="meta-item">
            <span className="meta-label">{L(subNoLabel)}</span>
            <span className="meta-value">{subNo}</span>
          </div>
        )}
      </div>

      {/* ═══════════════ TRANSACTION DETAILS ═══════════════ */}
      <section className="receipt-details">
        <table className="details-table">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="detail-label">{L(r.en)}</td>
                <td className="detail-value">{V(r.value, r.valueTe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ═══════════════ AMOUNT SECTION ═══════════════ */}
      {!hideAmount && (
        <section className="receipt-amount">
          <div className="amount-row">
            <span className="amount-label">{L(amountLabel)}</span>
            <span className="amount-value">₹ {amountNum.toLocaleString('en-IN')}</span>
          </div>
          <div className="amount-words">
            {L('Rupees')} {numberToWords(Math.round(amountNum), te)}
          </div>
          {amountNote && <div className="amount-words">({L(amountNote)})</div>}
        </section>
      )}

      {/* ═══════════════ TERMS & CONDITIONS ═══════════════ */}
      {showTerms && (
        <section className="receipt-terms">
          <h4 className="terms-title">{L('Terms & Conditions')}</h4>
          <ul className="terms-list">
            <li>{L('Please arrive 15 minutes before the scheduled pooja time.')}</li>
            <li>{L('This receipt is valid only for the date and service mentioned.')}</li>
            <li>{L('Refunds are subject to temple management approval.')}</li>
            <li>{L('Please retain this receipt for your records.')}</li>
          </ul>
        </section>
      )}

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="receipt-footer">
        <div className="blessing">
          {te ? '|| ఓం శ్రీ సాయి రామ్ ||' : '|| Om Shri Sai Ram ||'}
        </div>
        {footerNote && <p className="footer-note">{L(footerNote)}</p>}
        {temple?.receiptFooter && <p className="temple-message">{t(temple.receiptFooter)}</p>}
        <p className="computer-gen">{L('This is a computer-generated receipt and does not require a signature.')}</p>
      </footer>
    </div>
  )
}
