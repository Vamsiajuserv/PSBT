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
  'About Our Temple': 'మా ఆలయం గురించి', 'Temple Information': 'ఆలయ సమాచారం',
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
  'View More Photos': 'మరిన్ని ఫోటోలు చూడండి', 'Gallery': 'గ్యాలరీ',
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
    const local = UI_TE[s] || glossaryTe(s)
    if (local) return local
    if (cache[s]) return cache[s]
    if (!pending.current.has(s)) {
      pending.current.add(s)
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, 250)
    }
    return text
  }, [lang, cache, flush])

  return <LangCtx.Provider value={{ lang, setLang, toggle, t }}>{children}</LangCtx.Provider>
}

export function useLang() {
  return useContext(LangCtx) || { lang: 'en', setLang: () => {}, toggle: () => {}, t: (x) => x }
}
