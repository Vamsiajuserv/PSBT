// Telugu for report/register cells — shared by the Reports screen and the PDF /
// Excel exporters, so a file says exactly what the screen says.
import { tr, trLocal, personName, stamp, getLang } from '../i18n/LanguageContext.jsx'

// Columns holding a person's or firm's name: transliterated, never machine-translated.
const NAME_COLS = new Set([
  'devotee', 'donor', 'poojari', 'sponsor', 'bidder', 'party', 'vendor', 'by', 'verified_by', 'cancelled_by',
  'donor_name', 'devotee_name', 'buyer_name', 'vendor_name', 'winner',
])
// Columns holding identifiers (payment refs, receipt/ticket numbers, phone, PAN)
// — shown exactly as stored and never sent for translation.
const CODE_COLS = new Set([
  'code', 'receipt', 'ticket', 'ref', 'txn_ref', 'utr', 'mobile', 'pan',
  'receipt_no', 'payment_ref', 'booking_code', 'ticket_no',
])
// Server-formatted dates: '01 Jul 2026', '01 Jul 2026 05:12 PM', 'Jul 2026'.
const DATE_TEXT = /^(\d{1,2} )?[A-Za-z]{3,9} \d{4}\b/

// One text cell in the active language. Phrases are translated whole ("Yearly
// Once", "Car Pooja") — never word by word, which leaves half-English text.
export function reportText(col, v) {
  if (typeof v !== 'string' || !v || CODE_COLS.has(col.key)) return v
  if (NAME_COLS.has(col.key)) return trLocal(v) || personName({ name: v }, getLang())
  if (DATE_TEXT.test(v)) return stamp(v)
  return tr(v)
}

const isText = (c) => c.type !== 'money' && c.type !== 'num'

// A report result ({ title, subtitle, columns, rows, total }) with every label
// and text cell in the active language. English returns it untouched.
export function localiseReport(result, { keepDates = false } = {}) {
  if (!result || getLang() !== 'te') return result
  const cols = result.columns || []
  const cellRow = (row, isTotal) => {
    if (!row) return row
    const out = { ...row }
    for (const c of cols) {
      if (!isText(c)) continue
      const v = row[c.key]
      if (isTotal && v === 'Total') { out[c.key] = tr('Total'); continue }
      if (keepDates && typeof v === 'string' && DATE_TEXT.test(v)) continue
      out[c.key] = reportText(c, v)
    }
    return out
  }
  return {
    ...result,
    title: result.title ? tr(result.title) : result.title,
    subtitle: result.subtitle ? tr(result.subtitle) : result.subtitle,
    columns: cols.map((c) => ({ ...c, label: tr(c.label ?? c.key) })),
    rows: (result.rows || []).map((r) => cellRow(r, false)),
    total: cellRow(result.total, true),
  }
}
