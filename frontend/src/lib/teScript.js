// English text written in Telugu letters — for what staff typed in English (a
// reason, a note, a description, a login ID) when the screen is in Telugu.
//
// This is phonetic, not translation: "mismatch of cash" reads మిస్‌మ్యాచ్ ఆఫ్ క్యాష్,
// the way Telugu speakers write English words. Terms the app knows are
// translated by the dictionary before anything reaches here; codes, numbers,
// emails and links are left as they are.
import { toTelugu } from './translitTelugu.js'

// How common English words are written in Telugu. The name rules in
// translitTelugu.js read English spelling as if it were phonetic, which suits
// names (Ramesh, Lakshmi) but not English words (he → హ్, ready → రేఅది).
const EN_SOUND = {
  a: 'ఎ', an: 'ఆన్', the: 'ది', of: 'ఆఫ్', to: 'టు', for: 'ఫర్', in: 'ఇన్', on: 'ఆన్', at: 'ఎట్',
  by: 'బై', with: 'విత్', from: 'ఫ్రమ్', and: 'అండ్', or: 'ఆర్', not: 'నాట్', no: 'నో', yes: 'యెస్',
  is: 'ఈజ్', are: 'ఆర్', was: 'వాజ్', were: 'వర్', be: 'బీ', been: 'బీన్', it: 'ఇట్', its: 'ఇట్స్',
  he: 'హీ', she: 'షీ', they: 'దే', we: 'వీ', you: 'యూ', i: 'ఐ', my: 'మై', his: 'హిజ్', her: 'హర్',
  this: 'దిస్', that: 'దట్', these: 'దీజ్', all: 'ఆల్', one: 'వన్', two: 'టూ', some: 'సమ్',
  can: 'కెన్', cannot: 'కెనాట్', will: 'విల్', do: 'డు', done: 'డన్', did: 'డిడ్', has: 'హేజ్', have: 'హేవ్',
  now: 'నౌ', new: 'న్యూ', old: 'ఓల్డ్', good: 'గుడ్', bad: 'బ్యాడ్', ok: 'ఓకే', okay: 'ఓకే',
  ready: 'రెడీ', donate: 'డొనేట్', donated: 'డొనేటెడ్', birthday: 'బర్త్‌డే', birthaday: 'బర్త్‌డే',
  cash: 'క్యాష్', mismatch: 'మిస్‌మ్యాచ్', missing: 'మిస్సింగ్', miss: 'మిస్', mistake: 'మిస్టేక్',
  item: 'ఐటమ్', items: 'ఐటమ్స్', damaged: 'డ్యామేజ్డ్', damged: 'డ్యామేజ్డ్', damage: 'డ్యామేజ్',
  torn: 'టార్న్', heavy: 'హెవీ', long: 'లాంగ్', store: 'స్టోర్', buy: 'బై', proper: 'ప్రాపర్',
  perfect: 'పర్ఫెక్ట్', needed: 'నీడెడ్', need: 'నీడ్', check: 'చెక్', lock: 'లాక్', short: 'షార్ట్',
  recount: 'రీకౌంట్', count: 'కౌంట్', counted: 'కౌంటెడ్', twice: 'ట్వైస్', bundle: 'బండిల్', rupee: 'రూపీ',
  notes: 'నోట్స్', note: 'నోట్', took: 'టుక్', pieces: 'పీసెస్', piece: 'పీస్', winner: 'విన్నర్',
  test: 'టెస్ట్', testing: 'టెస్టింగ్', final: 'ఫైనల్', temp: 'టెంప్', demo: 'డెమో', sample: 'శాంపిల్',
  vendor: 'వెండర్', vendors: 'వెండర్స్', traders: 'ట్రేడర్స్', trader: 'ట్రేడర్', enterprises: 'ఎంటర్‌ప్రైజెస్',
  user: 'యూజర్', users: 'యూజర్స్', admin: 'అడ్మిన్', counter: 'కౌంటర్', staff: 'స్టాఫ్', officer: 'ఆఫీసర్',
  main: 'మెయిన్', branch: 'బ్రాంచ్', bank: 'బ్యాంక్', locker: 'లాకర్', room: 'రూమ్', hall: 'హాల్',
  silver: 'సిల్వర్', gold: 'గోల్డ్', lamp: 'ల్యాంప్', glass: 'గ్లాస్', metal: 'మెటల్', scrap: 'స్క్రాప్',
  rice: 'రైస్', oil: 'ఆయిల్', towel: 'టవల్', towels: 'టవల్స్', cloth: 'క్లాత్', saree: 'శారీ', bag: 'బ్యాగ్',
  pure: 'ప్యూర్', weight: 'వెయిట్', receipt: 'రిసీట్', add: 'యాడ్', added: 'యాడెడ్', bid: 'బిడ్',
  misread: 'మిస్‌రెడ్', sent: 'సెంట్', back: 'బ్యాక్', committee: 'కమిటీ', request: 'రిక్వెస్ట్',
  renamed: 'రీనేమ్డ్', updated: 'అప్‌డేటెడ్', update: 'అప్‌డేట్', delete: 'డిలీట్', del: 'డెల్', me: 'మీ',
  blank: 'బ్లాంక్', future: 'ఫ్యూచర్', smoke: 'స్మోక్', probe: 'ప్రోబ్', mat: 'మ్యాట్', cat: 'క్యాట్',
  medical: 'మెడికల్', cheque: 'చెక్', upi: 'యూపీఐ', unassigned: 'అన్‌అసైన్డ్', viewer: 'వ్యూయర్',
  report: 'రిపోర్ట్', seva: 'సేవ', pooja: 'పూజ', poojari: 'పూజారి', donor: 'డోనర్', devotee: 'డివోటీ',
  family: 'ఫ్యామిలీ', member: 'మెంబర్', festival: 'ఫెస్టివల్', festivals: 'ఫెస్టివల్స్', waste: 'వేస్ట్',
  auction: 'ఆక్షన్', hundi: 'హుండీ', donation: 'డొనేషన్', palki: 'పల్లకి', double: 'డబుల్', click: 'క్లిక్',
  script: 'స్క్రిప్ట్', alert: 'అలర్ట్', off: 'ఆఫ్', inserted: 'ఇన్సర్టెడ్', ui: 'యూఐ', qa: 'క్యూఏ',
  sbi: 'ఎస్‌బీఐ', kg: 'కేజీ', g: 'గ్రా',
}

const isCode = (w) => /\d/.test(w) || /^[A-Z]{2,}(?:[-_][A-Z0-9]+)+$/.test(w)

/** One English word in Telugu letters. */
function word(w) {
  const key = w.toLowerCase()
  if (EN_SOUND[key]) return EN_SOUND[key]
  return toTelugu(w) || w
}

/**
 * Every English word in `text` written in Telugu letters. Codes (PAN-00016,
 * BK2609160875, counter1's digits), numbers, emails and links stay as they are.
 */
export function teScript(text) {
  const s = String(text ?? '')
  if (!/[A-Za-z]/.test(s)) return s
  return s.split(/(\S+@\S+\.\S+|https?:\/\/\S+|[\w.-]+\.(?:json|csv|xlsx?|pdf|png|jpe?g|zip|enc|txt)\b|[\w-]*\d[\w-]*|[A-Za-z]+)/).map((part) => {
    if (!part || !/[A-Za-z]/.test(part)) return part
    // emails, links and file names (psbt-full-backup-….json) stay as written
    if (/@|^https?:|\.(?:json|csv|xlsx?|pdf|png|jpe?g|zip|enc|txt)$/.test(part)) return part
    if (isCode(part)) {
      // "counter1", "locker2": the letters are a word, the digits stay. Upper-case
      // codes (PAN-00016, BK2609160875) are left exactly as printed.
      return /^[a-z]+\d+$/.test(part) ? part.replace(/[a-z]+/, (m) => word(m)) : part
    }
    return word(part)
  }).join('')
}
