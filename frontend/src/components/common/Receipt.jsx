import React from 'react'
import { useTemple } from '../../lib/SiteContext.jsx'
import { useLang } from '../../i18n/LanguageContext.jsx'

// Number to words converter for Indian currency
function numberToWords(num) {
  if (num === 0) return 'Zero'
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  const convert = (n) => {
    if (n < 20) return ones[n]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '')
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '')
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '')
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '')
  }
  return convert(Math.floor(num)) + ' Only'
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
        <div className="temple-logo">🛕</div>
        <h1 className="temple-name">
          {te ? (temple?.nameTelugu || t(temple?.name) || t('Sri Shirdi Sai Baba Temple')) : (temple?.name || 'Sri Shirdi Sai Baba Temple')}
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
      <section className="receipt-amount">
        <div className="amount-row">
          <span className="amount-label">{L('Total Amount')}</span>
          <span className="amount-value">₹ {amountNum.toLocaleString('en-IN')}</span>
        </div>
        <div className="amount-words">
          {L('Rupees')} {numberToWords(amountNum)}
        </div>
      </section>

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
          {te ? '|| ఓం శ్రీ సాయి రామ్ ||' : '|| Om Sri Sai Ram ||'}
        </div>
        {footerNote && <p className="footer-note">{L(footerNote)}</p>}
        {temple?.receiptFooter && <p className="temple-message">{t(temple.receiptFooter)}</p>}
        <p className="computer-gen">{L('This is a computer-generated receipt and does not require a signature.')}</p>
      </footer>
    </div>
  )
}
