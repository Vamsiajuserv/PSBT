// English → Telugu dictionary for temple receipts/tickets.
// Offline domain vocabulary (labels, plans, categories, funds, statuses, methods),
// so bilingual receipts render without any external translation service.

export const TE = {
  // ── Labels ──
  Receipt: 'రసీదు',
  Ticket: 'టికెట్',
  'Receipt No': 'రసీదు నం.',
  'Booking No': 'బుకింగ్ నం.',
  'Booking ID': 'బుకింగ్ నం.',
  Devotee: 'భక్తుడు',
  'Devotee Name': 'భక్తుని పేరు',
  Mobile: 'మొబైల్',
  Pooja: 'పూజ',
  Service: 'సేవ',
  Plan: 'ప్లాన్',
  Category: 'విభాగం',
  Date: 'తేదీ',
  Time: 'సమయం',
  'Time Slot': 'సమయం',
  Amount: 'మొత్తం',
  'Amount Paid': 'చెల్లించిన మొత్తం',
  Total: 'మొత్తం',
  'Total Amount': 'మొత్తం సొమ్ము',
  'Payment Mode': 'చెల్లింపు విధానం',
  'Paid via': 'చెల్లింపు విధానం',
  Status: 'స్థితి',
  Gothram: 'గోత్రం',
  Nakshatram: 'నక్షత్రం',
  Donor: 'విరాళదారు',
  Donation: 'విరాళం',
  Fund: 'నిధి',
  Counter: 'కౌంటర్',
  Quantity: 'పరిమాణం',
  Plates: 'ప్లేట్లు',
  Occasion: 'సందర్భం',
  Valid: 'చెల్లుబాటు',
  'Valid Until': 'చెల్లుబాటు వరకు',

  // ── Pooja categories ──
  Daily: 'రోజువారీ',
  Monthly: 'నెలవారీ',
  'Long-Term': 'దీర్ఘకాలిక',
  Vehicle: 'వాహన',

  // ── Plan names ──
  'One-Time': 'ఒకసారి',
  'Life Long': 'జీవితకాలం',
  'Yearly Once': 'సంవత్సరానికి ఒకసారి',
  'Yearly Thrice': 'సంవత్సరానికి మూడుసార్లు',
  'Full Month': 'పూర్తి నెల',

  // ── Statuses ──
  Confirmed: 'నిర్ధారించబడింది',
  Paid: 'చెల్లించబడింది',
  Pending: 'పెండింగ్',
  Cancelled: 'రద్దు చేయబడింది',
  Completed: 'పూర్తయింది',

  // ── Payment methods ──
  Cash: 'నగదు',
  UPI: 'యూపీఐ',
  Card: 'కార్డు',
  Online: 'ఆన్‌లైన్',
  Cheque: 'చెక్',
  DD: 'డీడీ',

  // ── Donation categories / funds ──
  'General Donation (Hundi)': 'సాధారణ విరాళం (హుండీ)',
  'Medical Donation': 'వైద్య విరాళం',
  'Annadanam Donation': 'అన్నదాన విరాళం',
  'Temple Development Donation': 'ఆలయ అభివృద్ధి విరాళం',
  'Corpus / Endowment Donation': 'కార్పస్ / ఎండోమెంట్ విరాళం',
  'Festival Sponsorship': 'ఉత్సవ ప్రాయోజకత్వం',
  'Annadanam Sponsorship': 'అన్నదాన ప్రాయోజకత్వం',
  'Pooja Sponsorship': 'పూజ ప్రాయోజకత్వం',
  'Aarti Sponsorship': 'హారతి ప్రాయోజకత్వం',
  Gold: 'బంగారం',
  Silver: 'వెండి',
  'Rice Bags': 'బియ్యం బస్తాలు',

  // ── Donation types ──
  Material: 'వస్తు రూపం',
  Sponsorship: 'ప్రాయోజకత్వం',

  // ── Time slots ──
  Morning: 'ఉదయం',
  Afternoon: 'మధ్యాహ్నం',
  Evening: 'సాయంత్రం',
  'All day': 'రోజంతా',
}

const dayPlan = (s) => /^(\d+)-Day$/.exec(s)

/** Telugu for a known term, or '' if unknown (caller falls back to English). */
export function te(text) {
  if (text == null) return ''
  const s = String(text).trim()
  if (TE[s]) return TE[s]
  const m = dayPlan(s)
  if (m) return `${m[1]}-రోజులు`
  return ''
}

/** "English (Telugu)" when a translation exists, else just English. */
export function bi(text) {
  const t = te(text)
  return t ? `${text} (${t})` : String(text ?? '')
}
