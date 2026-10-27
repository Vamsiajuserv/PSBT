// Roman → Telugu transliteration for people's names.
//
// Names reach the UI from many endpoints, and most carry only the English
// spelling — a booking stores `devotee_name` as text, an audit row stores a
// username, a waste sale stores `verified_by`. Rather than thread a `name_te`
// twin through every one of those, names are converted here at display time.
//
// Order of authority:
//   1. a stored `name_te` (staff-entered, always wins — see personName())
//   2. NAME_TOKENS below — hand-checked spellings for names the temple uses
//   3. the syllable rules — a reasonable fallback for anything new
//
// The fallback is deliberately conservative: Telugu is close to phonetic, so a
// rule-based reading of a Roman name is usually right, and where it isn't the
// staff-entered twin overrides it permanently.

// ── Hand-checked spellings ───────────────────────────────────────────────────
// Every token that appears in the temple's own records, plus the common Telugu
// given names and surnames. These beat the rules, so `Reddy` never comes out as
// రెడ్డ్య and `Sastry` never as సాస్ట్ర్య.
const NAME_TOKENS = {
  // honorifics / initials
  Shri: 'శ్రీ', smt: 'శ్రీమతి', kum: 'కుమారి', dr: 'డా',
  // given names
  anil: 'అనిల్', anitha: 'అనిత', anjaneya: 'ఆంజనేయ', anjaneyulu: 'ఆంజనేయులు',
  bhavani: 'భవాని', chaitanya: 'చైతన్య', chandra: 'చంద్ర', divya: 'దివ్య',
  ganapathi: 'గణపతి', gopal: 'గోపాల్', gopala: 'గోపాల', harish: 'హరీష్',
  kavya: 'కావ్య', kiran: 'కిరణ్', krishna: 'కృష్ణ', kumar: 'కుమార్', kumari: 'కుమారి',
  lakshmi: 'లక్ష్మి', latha: 'లత', madhava: 'మాధవ', madhavi: 'మాధవి', manoj: 'మనోజ్',
  meena: 'మీనా', mohan: 'మోహన్', murthy: 'మూర్తి', murty: 'మూర్తి',
  narayana: 'నారాయణ', naresh: 'నరేష్', padma: 'పద్మ', padmaja: 'పద్మజ',
  praneeth: 'ప్రణీత్', prasad: 'ప్రసాద్', priya: 'ప్రియ', radha: 'రాధ',
  rajesh: 'రాజేష్', ramachandra: 'రామచంద్ర', ramakrishna: 'రామకృష్ణ', ramana: 'రమణ',
  ramesh: 'రమేష్', rama: 'రామ', ravi: 'రవి', sai: 'సాయి', sandeep: 'సందీప్',
  sita: 'సీత', seetha: 'సీత', sravani: 'శ్రావణి', sridevi: 'శ్రీదేవి',
  sridhara: 'శ్రీధర', srinivas: 'శ్రీనివాస్', srinivasa: 'శ్రీనివాస',
  subrahmanya: 'సుబ్రహ్మణ్య', sunitha: 'సునీత', suresh: 'సురేష్', swathi: 'స్వాతి',
  teja: 'తేజ', usha: 'ఉష', venkata: 'వెంకట', venkatesh: 'వెంకటేష్',
  venkateswarlu: 'వెంకటేశ్వర్లు', vijay: 'విజయ్', vishnu: 'విష్ణు',
  ganesh: 'గణేష్', mahesh: 'మహేష్', naveen: 'నవీన్', pavan: 'పవన్',
  santosh: 'సంతోష్', satish: 'సతీష్', vamsi: 'వంశీ', arjun: 'అర్జున్',
  uday: 'ఉదయ్', engine: 'ఇంజిన్', sashank: 'శశాంక్', balaji: 'బాలాజీ', sri: 'శ్రీ', traders: 'ట్రేడర్స్',
  deepak: 'దీపక్', kalyan: 'కళ్యాణ్', sunil: 'సునీల్', swapna: 'స్వప్న',
  bhaskar: 'భాస్కర్', jyothi: 'జ్యోతి', sailaja: 'శైలజ', vani: 'వాణి',
  // long vowels and retroflex letters the Roman spelling doesn't show
  raju: 'రాజు', nagaraju: 'నాగరాజు', raja: 'రాజా',
  anand: 'ఆనంద్', ananda: 'ఆనంద', durga: 'దుర్గ', anjali: 'అంజలి',
  satyanarayana: 'సత్యనారాయణ', satya: 'సత్య', hanumantha: 'హనుమంత', hanuman: 'హనుమాన్',
  ramaiah: 'రామయ్య', subbaiah: 'సుబ్బయ్య', venkataiah: 'వెంకటయ్య', narasimha: 'నరసింహ',
  nageswara: 'నాగేశ్వర', venkateswara: 'వెంకటేశ్వర', srikanth: 'శ్రీకాంత్', prakash: 'ప్రకాష్',
  venkat: 'వెంకట్', sudha: 'సుధ', madhu: 'మధు', rajeswari: 'రాజేశ్వరి', vijaya: 'విజయ',
  kamala: 'కమల', saraswathi: 'సరస్వతి', parvathi: 'పార్వతి', annapurna: 'అన్నపూర్ణ',
  lalitha: 'లలిత', kavitha: 'కవిత', geetha: 'గీత', sangeetha: 'సంగీత', revathi: 'రేవతి',
  sujatha: 'సుజాత', vasantha: 'వసంత', shankar: 'శంకర్', shiva: 'శివ', siva: 'శివ',
  balakrishna: 'బాలకృష్ణ', mallikarjuna: 'మల్లికార్జున',
  ashok: 'అశోక్', ajay: 'అజయ్', karthik: 'కార్తీక్', aditya: 'ఆదిత్య', rahul: 'రాహుల్',
  sravan: 'శ్రావణ్', harika: 'హారిక', keerthi: 'కీర్తి', mounika: 'మౌనిక', bhargavi: 'భార్గవి',
  pandu: 'పాండు', kondal: 'కొండల్', chandu: 'చందు', yadagiri: 'యాదగిరి', yellaiah: 'ఎల్లయ్య',
  mohammed: 'మహమ్మద్', mohammad: 'మహమ్మద్', muhammad: 'మహమ్మద్', ali: 'అలీ',
  sekhar: 'శేఖర్', sekar: 'శేఖర్', chandrasekhar: 'చంద్రశేఖర్', rajasekhar: 'రాజశేఖర్',
  rakesh: 'రాకేష్', jagadish: 'జగదీష్', jagadeesh: 'జగదీష్', anusha: 'అనూష', bhanu: 'భాను',
  damodar: 'దామోదర్', rajendra: 'రాజేంద్ర', ravindra: 'రవీంద్ర', siddharth: 'సిద్ధార్థ్',
  sambasiva: 'సాంబశివ', sarada: 'శారద', sharada: 'శారద', tejaswini: 'తేజస్విని',
  khan: 'ఖాన్', ahmed: 'అహ్మద్', joseph: 'జోసెఫ్', john: 'జాన్', mary: 'మేరీ',
  // surnames
  acharya: 'ఆచార్య', bhat: 'భట్', chowdary: 'చౌదరి', choudary: 'చౌదరి',
  devi: 'దేవి', goud: 'గౌడ్', gupta: 'గుప్తా', iyer: 'అయ్యర్', kadiyam: 'కడియం', naidu: 'నాయుడు',
  oleti: 'ఒలేటి', pillai: 'పిళ్ళై', rao: 'రావు', reddy: 'రెడ్డి', sarma: 'శర్మ',
  sastry: 'శాస్త్రి', shastri: 'శాస్త్రి', setty: 'శెట్టి', shetty: 'శెట్టి',
  sharma: 'శర్మ', thota: 'తోట', varma: 'వర్మ', yadav: 'యాదవ్', verma: 'వర్మ',
  patel: 'పటేల్', nair: 'నాయర్', menon: 'మేనన్', rani: 'రాణి',
  // words that appear inside staff account names
  accounts: 'అకౌంట్స్', admin: 'అడ్మిన్', assistant: 'సహాయకుడు', audit: 'ఆడిట్',
  chairman: 'అధ్యక్షుడు', clerk: 'గుమాస్తా', committee: 'కమిటీ', counter: 'కౌంటర్',
  deputy: 'ఉప', devotee: 'భక్తుడు', eo: 'ఇఓ', finance: 'ఆర్థిక', it: 'ఐటి',
  manager: 'నిర్వాహకుడు', member: 'సభ్యుడు', officer: 'అధికారి', poojari: 'పూజారి',
  secretary: 'కార్యదర్శి', staff: 'సిబ్బంది', support: 'సపోర్ట్', system: 'సిస్టమ్',
  user: 'వినియోగదారు', test: 'టెస్ట్', temple: 'ఆలయం',
}

// Letter names, for initials (`G. Meena`) and acronyms (`RBAC`), which are read
// out rather than pronounced as words.
const LETTER = {
  a: 'ఏ', b: 'బి', c: 'సి', d: 'డి', e: 'ఈ', f: 'ఎఫ్', g: 'జి', h: 'హెచ్',
  i: 'ఐ', j: 'జే', k: 'కె', l: 'ఎల్', m: 'ఎం', n: 'ఎన్', o: 'ఓ', p: 'పి',
  q: 'క్యూ', r: 'ఆర్', s: 'ఎస్', t: 'టి', u: 'యు', v: 'వి', w: 'డబ్ల్యూ',
  x: 'ఎక్స్', y: 'వై', z: 'జెడ్',
}

// ── Syllable rules ───────────────────────────────────────────────────────────
const VOWEL_SIGN = {
  a: '', aa: 'ా', i: 'ి', ii: 'ీ', ee: 'ీ', u: 'ు', uu: 'ూ', oo: 'ూ',
  e: 'ే', ae: 'ే', ai: 'ై', o: 'ో', oa: 'ో', au: 'ౌ', ou: 'ౌ', ow: 'ౌ',
}
const VOWEL_LETTER = {
  a: 'అ', aa: 'ఆ', i: 'ఇ', ii: 'ఈ', ee: 'ఈ', u: 'ఉ', uu: 'ఊ', oo: 'ఊ',
  e: 'ఏ', ae: 'ఏ', ai: 'ఐ', o: 'ఓ', oa: 'ఓ', au: 'ఔ', ou: 'ఔ', ow: 'ఔ',
}
const CONSONANT = {
  kh: 'ఖ', gh: 'ఘ', ch: 'చ', chh: 'ఛ', jh: 'ఝ', th: 'త', dh: 'ధ', ph: 'ఫ',
  bh: 'భ', sh: 'శ', ss: 'ష', ng: 'ంగ', ksh: 'క్ష', jn: 'జ్ఞ',
  sr: 'శ్ర', tr: 'త్ర', sw: 'స్వ',
  k: 'క', g: 'గ', c: 'క', j: 'జ', t: 'ట', d: 'ద', n: 'న', p: 'ప', b: 'బ',
  m: 'మ', y: 'య', r: 'ర', l: 'ల', v: 'వ', w: 'వ', s: 'స', h: 'హ', z: 'జ', f: 'ఫ',
  q: 'క', x: 'క్స',
}
const VIRAMA = '్'
const ANUSVARA = 'ం'
// A nasal closing a syllable before these consonants is written as the
// anusvara: Anjali అంజలి, Hanumantha హనుమంత, Sambasiva సాంబశివ.
const NASAL_BEFORE = { n: /^(k|g|c|j|t|d|s)/, m: /^(b|p|s|h)/ }
// Longest first, so `chh` wins over `ch` and `aa` over `a`.
const CONS_KEYS = Object.keys(CONSONANT).sort((a, b) => b.length - a.length)
const VOW_KEYS = Object.keys(VOWEL_SIGN).sort((a, b) => b.length - a.length)

function transliterateToken(word) {
  // English orthography: a final 'y' is an 'i' sound (Validity, Notify), and a
  // final 'e' after a consonant is silent (Complete, Smoke).
  let w = word.toLowerCase()
    .replace(/([b-df-hj-np-tv-z])y$/, '$1i')
    .replace(/([b-df-hj-np-tv-xz])e$/, '$1')
    // Subbaiah, Yellaiah, Kotaiah — the Telugu -య్య ending spelled the English way.
    .replace(/a?iah$/, 'ayya')
    // English `ui` after b/g is a plain i: Building, Guild.
    .replace(/([bg])ui/, '$1i')
    // Sri opens a name as శ్రీ (Sridhar, Srilatha); -akar is -ākar (Sudhakar, Divakar).
    .replace(/^sri/, 'srii')
    .replace(/akar$/, 'aakar')
    // A final -ish is long in names: Girish గిరీష్, Satish సతీష్, Manish మనీష్.
    .replace(/ish$/, 'iish')
  let out = ''
  let i = 0
  let atStart = true
  let prev = ''
  while (i < w.length) {
    const cons = CONS_KEYS.find((c) => w.startsWith(c, i))
    if (cons) {
      i += cons.length
      let letter = CONSONANT[cons]
      // sh: శ opening a word (Shankar, Shiva), ష inside it (Suresh, Kishore).
      if (cons === 'sh' && !atStart) letter = 'ష'
      // n after r takes the retroflex ణ (Aruna, Pranav, Varun).
      if (cons === 'n' && prev === 'r') letter = 'ణ'
      // -eswar is -ēśvar: Eswar ఈశ్వర్, Nageswar నాగేశ్వర్, Rajeswari రాజేశ్వరి.
      if (cons === 'sw' && w[i - 3] === 'e' && w.startsWith('ar', i)) letter = 'శ్వ'
      prev = cons
      const vow = VOW_KEYS.find((v) => w.startsWith(v, i))
      if (vow) {
        i += vow.length
        out += letter + VOWEL_SIGN[vow]
      } else if (!atStart && NASAL_BEFORE[cons]?.test(w.slice(i))) {
        out += ANUSVARA
        // Dental after the anusvara: Hemant హేమంత్, Vasant వసంత్.
        if (w[i] === 't' && w[i + 1] !== 'h') { w = w.slice(0, i) + 'th' + w.slice(i + 1) }
      } else {
        // No vowel: a consonant cluster mid-word, or a final consonant — both
        // take the virama so `Anil` reads అనిల్ rather than అనిల.
        out += letter + VIRAMA
      }
      atStart = false
      continue
    }
    const vow = VOW_KEYS.find((v) => w.startsWith(v, i))
    if (vow) {
      i += vow.length
      // A consonant always takes the vowel after it, so a vowel reaching here
      // opens the word or follows another vowel — the full letter either way
      // (a sign stacked on a sign, బుి, is not valid Telugu).
      out += VOWEL_LETTER[vow]
      atStart = false
      continue
    }
    out += w[i]   // digits, punctuation — pass through
    i += 1
  }
  return out
}

/**
 * Telugu form of an English personal name. Returns '' for anything that has no
 * Latin letters (already Telugu, a number, an empty value), so callers can fall
 * back to what they were given.
 */
export function toTelugu(name) {
  const s = String(name ?? '').trim()
  if (!s || !/[A-Za-z]/.test(s) || /[ఀ-౿]/.test(s)) return ''
  return s.split(/(\s+|[.,()])/).map((part) => {
    if (!/[A-Za-z]/.test(part)) return part
    const key = part.toLowerCase()
    if (NAME_TOKENS[key]) return NAME_TOKENS[key]
    // A lone letter is an initial; an all-caps run is an acronym. Both are read
    // out letter by letter rather than pronounced as a word.
    if (part.length === 1) return LETTER[key] || part
    if (/^[A-Z]{2,5}$/.test(part) && !NAME_TOKENS[key]) {
      return [...key].map((ch) => LETTER[ch] || ch).join('')
    }
    return transliterateToken(part)
  }).join('')
    // "Srinivas Rao" is written శ్రీనివాస రావు — the given name takes its full
    // vowel before Rao, as in Nageswara Rao and Venkateswara Rao.
    .replace(/్(\s+రావు)/g, '$1')
}
