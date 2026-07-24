import React, { createContext, useContext, useState, useRef, useCallback } from 'react'
import { te as glossaryTe } from '../lib/telugu.js'
import { TranslateAPI } from '../api/client.js'

// Curated Telugu for the public devotee-facing UI (instant, offline). Anything
// not here falls back to the shared receipt glossary, then to the /translate
// API (Azure + cache), then to English. This is the fast path — the site reads
// correctly in Telugu without any network round-trip for the common chrome.
const UI_TE = {
  // Navigation
  'Home': 'హోమ్', 'About Temple': 'ఆలయం గురించి', 'Temple History': 'ఆలయ చరిత్ర',
  'Festivals & Events': 'పండుగలు & కార్యక్రమాలు', 'Poojas & Services': 'పూజలు & సేవలు',
  'All Poojas & Sevas': 'అన్ని పూజలు & సేవలు', 'Annadanam': 'అన్నదానం', 'Hundi': 'హుండీ',
  'Auction': 'వేలం', 'Darshan Timings': 'దర్శన సమయాలు', 'Donations': 'విరాళాలు',
  'Gallery': 'గ్యాలరీ', 'Contact Us': 'మమ్మల్ని సంప్రదించండి', 'Sevas': 'సేవలు',
  'Timings': 'సమయాలు',
  // Header / footer chrome
  'Temple Staff Login': 'ఆలయ సిబ్బంది లాగిన్', 'Staff Login': 'సిబ్బంది లాగిన్',
  'Follow Us :': 'మమ్మల్ని అనుసరించండి :', 'Quick Links': 'త్వరిత లింకులు',
  'Temple Information': 'ఆలయ సమాచారం', 'Temple Timings': 'ఆలయ సమయాలు',
  'Established': 'స్థాపించబడింది', 'Managed By': 'నిర్వహణ', 'Trust Reg. No': 'ట్రస్ట్ నమోదు నం.',
  'Pan No.': 'పాన్ నం.', 'Everyday': 'ప్రతిరోజు',
  'All Rights Reserved.': 'సర్వ హక్కులు కలివి.',
  'Website designed and developed for Sri Shirdi Sai Baba Temple.':
    'శ్రీ షిర్డీ సాయిబాబా ఆలయం కోసం రూపొందించి అభివృద్ధి చేయబడిన వెబ్‌సైట్.',
  'A sacred place dedicated to Sri Shirdi Sai Baba, spreading love, faith and seva.':
    'ప్రేమ, విశ్వాసం మరియు సేవను వ్యాప్తి చేస్తూ శ్రీ షిర్డీ సాయిబాబాకు అంకితమైన పవిత్ర స్థలం.',
  // Common actions / labels
  'Book a Seva': 'సేవను బుక్ చేయండి', 'Book Now': 'ఇప్పుడే బుక్ చేయండి',
  'Donate Now': 'ఇప్పుడే విరాళం ఇవ్వండి', 'Donate': 'విరాళం ఇవ్వండి',
  'Read More': 'మరింత చదవండి', 'View All': 'అన్నీ చూడండి', 'Learn More': 'మరింత తెలుసుకోండి',
  'Send Message': 'సందేశం పంపండి', 'Proceed to Pay': 'చెల్లింపుకు వెళ్లండి',
  'Place Bid': 'బిడ్ వేయండి', 'Offer Annadanam': 'అన్నదానం సమర్పించండి',
  'Number of plates': 'ప్లేట్ల సంఖ్య', 'Amount': 'మొత్తం', 'Name': 'పేరు',
  'Mobile Number': 'మొబైల్ నంబర్', 'Email': 'ఇమెయిల్', 'Message': 'సందేశం',
  'Welcome': 'స్వాగతం', 'About the Temple': 'ఆలయం గురించి',
  'Upcoming Festivals': 'రాబోయే పండుగలు', 'Our Services': 'మా సేవలు',
  'Temple Gallery': 'ఆలయ గ్యాలరీ', 'Get in Touch': 'సంప్రదించండి',
  // Home page
  'Welcome to': 'స్వాగతం', 'Sri Shirdi Sai Baba Temple': 'శ్రీ షిర్డీ సాయిబాబా ఆలయం',
  'A sacred place of faith, devotion and blessings of Sai Baba.':
    'సాయిబాబా విశ్వాసం, భక్తి మరియు అనుగ్రహాల పవిత్ర స్థలం.',
  'Temple Location': 'ఆలయ స్థానం', 'Contact': 'సంప్రదింపు',
  'Our Services & Offerings': 'మా సేవలు & నైవేద్యాలు', 'View Details': 'వివరాలు చూడండి',
  'About Our Temple': 'మా ఆలయం గురించి',
  'A Place of Faith, Devotion and Compassion': 'విశ్వాసం, భక్తి మరియు కరుణ యొక్క స్థలం',
  "Sri Shirdi Sai Baba Temple, Dwarakapuri Colony, Punjagutta, Hyderabad is dedicated to spreading the teachings of Shirdi Sai Baba. The temple serves as a spiritual center where devotees from all walks of life come together to seek Baba's blessings.":
    'పంజాగుట్ట, ద్వారకాపురి కాలనీ, హైదరాబాద్‌లోని శ్రీ షిర్డీ సాయిబాబా ఆలయం షిర్డీ సాయిబాబా బోధనలను వ్యాప్తి చేయడానికి అంకితమైంది. అన్ని వర్గాల భక్తులు బాబా అనుగ్రహం కోసం కలిసివచ్చే ఆధ్యాత్మిక కేంద్రంగా ఆలయం సేవలందిస్తుంది.',
  'Spiritual Environment': 'ఆధ్యాత్మిక వాతావరణం', 'Seva to Society': 'సమాజానికి సేవ',
  'Devotion for All': 'అందరికీ భక్తి',
  'Experience peace and positive energy': 'శాంతి మరియు సానుకూల శక్తిని అనుభవించండి',
  'Committed to service and welfare': 'సేవ మరియు సంక్షేమానికి అంకితం',
  "Baba's grace is for everyone": 'బాబా అనుగ్రహం అందరికీ',
  'View the list of available poojas, rituals and seva details.':
    'అందుబాటులో ఉన్న పూజలు, ఆచారాలు మరియు సేవ వివరాల జాబితాను చూడండి.',
  'Learn about donation options and how you can contribute.':
    'విరాళ ఎంపికలు మరియు మీరు ఎలా సహకరించవచ్చో తెలుసుకోండి.',
  'Information about Annadanam seva and sponsorship details.':
    'అన్నదాన సేవ మరియు ప్రాయోజకత్వ వివరాల గురించి సమాచారం.',
  'Learn about the temple hundi and its significance.':
    'ఆలయ హుండీ మరియు దాని ప్రాముఖ్యత గురించి తెలుసుకోండి.',
  'Information about temple auctions and participation.':
    'ఆలయ వేలం మరియు పాల్గొనడం గురించి సమాచారం.',
  'General temple information and daily rituals.':
    'సాధారణ ఆలయ సమాచారం మరియు రోజువారీ ఆచారాలు.',
  'View More Photos': 'మరిన్ని ఫోటోలు చూడండి',

  // ── Admin navigation ──
  'Dashboard': 'డాష్‌బోర్డ్', 'Counter Billing': 'కౌంటర్ బిల్లింగ్',
  'Advance Booking': 'ముందస్తు బుకింగ్', 'My Poojas': 'నా పూజలు',
  'Verify Ticket': 'టికెట్ ధృవీకరణ', 'Devotee Management': 'భక్తుల నిర్వహణ',
  'Pooja Management': 'పూజల నిర్వహణ', 'Bookings': 'బుకింగ్‌లు',
  'Pooja Master': 'పూజల మాస్టర్', 'Poojari Schedule': 'పూజారి షెడ్యూల్',
  'Poojari Master': 'పూజారి మాస్టర్', 'Pooja History': 'పూజల చరిత్ర',
  'Calendar': 'క్యాలెండర్', 'Donation Management': 'విరాళాల నిర్వహణ',
  'Donation Master': 'విరాళాల మాస్టర్', 'Hundi Management': 'హుండీ నిర్వహణ',
  'Hundi Collections': 'హుండీ వసూళ్లు', 'Hundi Item Master': 'హుండీ వస్తువుల మాస్టర్',
  'Auction Management': 'వేలం నిర్వహణ', 'Auctions': 'వేలాలు',
  'Auction Item Master': 'వేలం వస్తువుల మాస్టర్', 'Annadanam Management': 'అన్నదాన నిర్వహణ',
  'Waste Material Sales': 'వ్యర్థ పదార్థాల అమ్మకాలు', 'Waste Sales': 'వ్యర్థ అమ్మకాలు',
  'Vendor Master': 'విక్రేతల మాస్టర్', 'Reports': 'నివేదికలు',
  'Daily Closing': 'రోజువారీ ముగింపు', 'User Management': 'వినియోగదారుల నిర్వహణ',
  'Role & Access Management': 'పాత్రలు & యాక్సెస్ నిర్వహణ', 'Settings': 'సెట్టింగ్‌లు',
  'System Settings': 'సిస్టమ్ సెట్టింగ్‌లు', 'Committee Member Master': 'కమిటీ సభ్యుల మాస్టర్',
  'Festival Master': 'పండుగల మాస్టర్', 'Notifications': 'నోటిఫికేషన్‌లు',
  'Audit Trail': 'ఆడిట్ ట్రయల్', 'Backup & Restore': 'బ్యాకప్ & పునరుద్ధరణ',

  // ── Roles ──
  'Administrator': 'నిర్వాహకుడు', 'Counter Staff': 'కౌంటర్ సిబ్బంది',
  'Poojari': 'పూజారి', 'Accountant': 'అకౌంటెంట్', 'Committee': 'కమిటీ',

  // ── Common actions ──
  'Save': 'సేవ్ చేయండి', 'Cancel': 'రద్దు', 'Confirm': 'నిర్ధారించండి',
  'Delete': 'తొలగించండి', 'Edit': 'సవరించండి', 'Search': 'వెతకండి',
  'Search…': 'వెతకండి…', 'Clear': 'క్లియర్', 'Reset': 'రీసెట్',
  'Refresh': 'రిఫ్రెష్', 'Refreshing…': 'రిఫ్రెష్ అవుతోంది…',
  'Export': 'ఎగుమతి', 'Print': 'ప్రింట్', 'Download': 'డౌన్‌లోడ్',
  'Close': 'మూసివేయండి', 'Done': 'పూర్తయింది', 'Today': 'ఈరోజు', 'Now': 'ఇప్పుడు',
  'View': 'చూడండి', 'View only': 'చూడటం మాత్రమే', 'Actions': 'చర్యలు',
  'Filter': 'ఫిల్టర్', 'OK': 'సరే', 'Yes': 'అవును', 'No': 'కాదు',
  'Add': 'జోడించండి', 'Remove': 'తీసివేయండి', 'Verify': 'ధృవీకరించండి',
  'Reject': 'తిరస్కరించండి', 'Select…': 'ఎంచుకోండి…', 'Select date': 'తేదీ ఎంచుకోండి',
  'Select time': 'సమయం ఎంచుకోండి', 'Select date & time': 'తేదీ & సమయం ఎంచుకోండి',
  'Sign out': 'సైన్ అవుట్', 'Date Range': 'తేదీ పరిధి',

  // ── Statuses ──
  'Active': 'యాక్టివ్', 'Inactive': 'ఇనాక్టివ్', 'All': 'అన్నీ', 'All Status': 'అన్ని స్థితులు',
  'Paid': 'చెల్లించబడింది', 'Pending': 'పెండింగ్', 'Confirmed': 'నిర్ధారించబడింది',
  'Completed': 'పూర్తయింది', 'Cancelled': 'రద్దు చేయబడింది', 'Scheduled': 'షెడ్యూల్ చేయబడింది',
  'In Progress': 'జరుగుతోంది', 'Verified': 'ధృవీకరించబడింది',
  'Pending Verification': 'ధృవీకరణ పెండింగ్', 'Deposited': 'జమ చేయబడింది',
  'Pending Deposit': 'జమ పెండింగ్', 'Rejected': 'తిరస్కరించబడింది',
  'Open': 'తెరిచి ఉంది', 'Closed': 'మూసివేయబడింది', 'Void': 'రద్దు', 'Expired': 'గడువు ముగిసింది',

  // ── Common labels / table headers ──
  'Status': 'స్థితి', 'Date': 'తేదీ', 'Time': 'సమయం', 'Amount (₹)': 'మొత్తం (₹)',
  'Total': 'మొత్తం', 'Total Amount (₹)': 'మొత్తం సొమ్ము (₹)', 'Cash': 'నగదు',
  'Cash (₹)': 'నగదు (₹)', 'UPI / QR (₹)': 'యుపిఐ / క్యూఆర్ (₹)',
  'Payment': 'చెల్లింపు', 'Payment Mode': 'చెల్లింపు విధానం', 'Receipt': 'రసీదు',
  'Receipt No': 'రసీదు నం.', 'Ticket': 'టికెట్', 'Booking ID': 'బుకింగ్ ఐడి',
  'Devotee': 'భక్తుడు', 'Devotees': 'భక్తులు', 'Devotee Name': 'భక్తుని పేరు',
  'Pooja': 'పూజ', 'Poojas': 'పూజలు', 'Plan': 'ప్లాన్', 'Fee': 'రుసుము',
  'Quantity': 'పరిమాణం', 'Rate': 'రేటు', 'Notes': 'గమనికలు', 'Reason': 'కారణం',
  'Module': 'మాడ్యూల్', 'Transactions': 'లావాదేవీలు', 'Description': 'వివరణ',
  'Category': 'వర్గం', 'Item': 'వస్తువు', 'Winner': 'విజేత', 'Vendor': 'విక్రేత',
  'Gothram': 'గోత్రం', 'Nakshatram': 'నక్షత్రం', 'City': 'నగరం', 'Address': 'చిరునామా',
  'Mobile': 'మొబైల్', 'Refund': 'వాపసు', 'Refunds': 'వాపసులు',
  'Validity': 'చెల్లుబాటు', 'Persons': 'వ్యక్తులు', 'Occasion': 'సందర్భం',
  'Festival': 'పండుగ', 'Collection Date': 'వసూలు తేదీ', 'Denomination': 'డినామినేషన్',
  'Committee Members': 'కమిటీ సభ్యులు', 'Bank Name': 'బ్యాంక్ పేరు',
  'Verification Status': 'ధృవీకరణ స్థితి', 'Deposit Status': 'జమ స్థితి',
  'Deposit Date': 'జమ తేదీ', 'Booking Date': 'బుకింగ్ తేదీ', 'Vehicle Number': 'వాహన నంబర్',

  // ── Login screen ──
  'Username': 'యూజర్ పేరు', 'Password': 'పాస్‌వర్డ్', 'Sign In': 'సైన్ ఇన్',
  'Forgot Password?': 'పాస్‌వర్డ్ మర్చిపోయారా?',
  'Temple Management System': 'ఆలయ నిర్వహణ వ్యవస్థ',
}

const LangCtx = createContext(null)
const KEY = 'psbt_lang'

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => (typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) || 'en')
  const [cache, setCache] = useState({})
  const pending = useRef(new Set())
  const timer = useRef(null)

  const setLang = useCallback((l) => {
    setLangState(l)
    try { localStorage.setItem(KEY, l) } catch { /* ignore */ }
  }, [])
  const toggle = useCallback(() => setLang(lang === 'en' ? 'te' : 'en'), [lang, setLang])

  const flush = useCallback(() => {
    const texts = [...pending.current]
    pending.current = new Set()
    if (!texts.length) return
    TranslateAPI.translate(texts, 'te').then((res) => {
      const map = res?.translations || {}
      const add = {}
      for (const [k, v] of Object.entries(map)) if (v && v !== k) add[k] = v
      if (Object.keys(add).length) setCache((c) => ({ ...c, ...add }))
    }).catch(() => { /* offline → stay English */ })
  }, [])

  const t = useCallback((text) => {
    if (lang === 'en' || text == null || text === '') return text
    const s = String(text)
    if (/[\u0C00-\u0C7F]/.test(s)) return s   // already Telugu — nothing to do
    const local = UI_TE[s] || glossaryTe(s)
    if (local) return local
    // Suffix-tolerant: "Collection Date *" / "Amount:" hit the base entry.
    const dm = s.match(/^(.*?)([\s:*…]+)$/)
    if (dm) {
      const base = UI_TE[dm[1].trim()] || glossaryTe(dm[1].trim())
      if (base) return base + dm[2]
    }
    if (cache[s]) return cache[s]
    if (!pending.current.has(s)) {
      pending.current.add(s)
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, 250)
    }
    return text
  }, [lang, cache, flush])

  // Module-level handle so tr() (attribute props: placeholder/title) and <T>
  // work anywhere without threading the hook through every component.
  reg.lang = lang
  reg.t = t

  // key={lang} remounts the subtree on toggle, so even strings resolved via the
  // module-level tr() re-evaluate instantly in the new language.
  return (
    <LangCtx.Provider value={{ lang, setLang, toggle, t }}>
      <React.Fragment key={lang}>{children}</React.Fragment>
    </LangCtx.Provider>
  )
}

// ── Hook-free helpers (usable in any component, incl. ones without hooks) ──
const reg = { lang: 'en', t: (s) => s }

// Attribute-position translation (placeholder=, title=). Re-evaluates on the
// provider's key={lang} remount; dictionary hits are instant.
export function tr(text) { return reg.t(text) }

// Text-node translation: <T>Some sentence</T>. Subscribes to the context, so
// late-arriving dynamic translations (Azure cache) also re-render.
export function T({ children }) {
  const { t } = useLang()
  if (children == null) return null
  return t(typeof children === 'string' || typeof children === 'number' ? String(children) : String(children))
}

export function useLang() {
  return useContext(LangCtx) || { lang: 'en', setLang: () => {}, toggle: () => {}, t: (x) => x }
}
