// Telugu coverage audit for the devotee-facing site.
//
// Two failure modes put English on a Telugu page, and neither one throws:
//   UNWRAPPED — the string never reaches t(), so it can never translate no
//               matter what the dictionaries contain.
//   MISSING   — the string is wrapped in t()/tr()/<T>, but no Telugu exists for
//               it in UI_TE or the receipt glossary, so t() hands back the
//               English it was given. (The dynamic /translate path can't save
//               it either while AZURE_TRANSLATOR_KEY is blank.)
//
// Run:  npm run i18n:audit           public surface only (what devotees see)
//       npm run i18n:audit -- --all  every file under frontend/src
//
// Exits 1 when the audited surface has any finding, so CI can gate on it.
const { readFileSync, readdirSync, statSync } = require('node:fs')
const path = require('node:path')

const SRC = path.join(__dirname, '..', 'frontend', 'src')
const ALL = process.argv.includes('--all')

// The devotee-facing surface: public pages, public chrome, and the shared
// components those pages render. Admin screens are staff-only — audit them
// with --all.
const PUBLIC_DIRS = [
  path.join(SRC, 'pages', 'public'),
  path.join(SRC, 'components', 'public'),
  path.join(SRC, 'components', 'common'),
]
// Staff login is served under /admin but is linked from the public site and
// carries the language toggle, so devotee-facing rules apply to it too.
const EXTRA_FILES = [path.join(SRC, 'pages', 'admin', 'StaffLogin.jsx')]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.jsx?$/.test(p)) out.push(p)
  }
  return out
}

// Blank out a region while preserving every byte offset, so reported line
// numbers still point at the real source.
const blank = (s, from, to) => s.slice(0, from) + s.slice(from, to).replace(/[^\n]/g, ' ') + s.slice(to)

function stripComments(src) {
  let out = src
  for (const re of [/\/\*[\s\S]*?\*\//g, /(^|[^:])\/\/[^\n]*/g]) {
    out = out.replace(re, (m, pre = '') => pre + m.slice(pre.length).replace(/[^\n]/g, ' '))
  }
  return out
}

// `>text<` also matches across JS comparison operators (`s >= min && s <= max`),
// which yields code fragments, not JSX text. Prose doesn't contain operators.
const looksLikeCode = (s) =>
  /[=;]|&&|\|\||=>|\?\.|\s\?\s/.test(s) ||
  /^\s*[:!?]/.test(s) ||                    // ternary / negation fragment
  /^[\w$]+\.[\w$]+$/.test(s.trim()) ||      // bare property access
  /\?\s*$/.test(s)

// Pull keys out of an object literal without evaluating it (these live in .jsx
// modules that plain node can't require()).
function objectKeys(source, declaration) {
  const start = source.indexOf(declaration)
  if (start === -1) return []
  let depth = 0
  let end = source.length
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) { end = i; break }
  }
  const body = stripComments(source.slice(start, end))
  const keys = new Set()
  // 'quoted key':  |  "quoted key":  |  bareKey:
  const re = /(['"])((?:\\.|(?!\1).)*)\1\s*:|(?:^|[{,]\s*)([A-Za-z_$][\w$]*)\s*:/gm
  let m
  while ((m = re.exec(body))) {
    const raw = m[2] ?? m[3]
    if (raw) keys.add(raw.replace(/\\(['"\\])/g, '$1'))
  }
  return [...keys]
}

const langSrc = readFileSync(path.join(SRC, 'i18n', 'LanguageContext.jsx'), 'utf8')
const teluguSrc = readFileSync(path.join(SRC, 'lib', 'telugu.js'), 'utf8')
const known = new Set([
  ...objectKeys(langSrc, 'const UI_TE = {'),
  ...objectKeys(teluguSrc, 'export const TE = {'),
])

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

// Product and file-format names stay in Latin script for the same reason the
// email address does — they are identifiers, not prose.
const INTENTIONALLY_ENGLISH = new Set(['Excel', 'PDF', 'CSV', 'UPI', 'QR', 'WhatsApp', 'SMS'])
// Environment-variable names are configuration identifiers, never translated.
const ENV_VAR = /^[A-Z][A-Z0-9_]*\*?$/

// A string needs Telugu only if it is prose a devotee reads. Identifiers that
// must stay in Latin script (emails, URLs, phone numbers, codes) and pure
// data (times, amounts) are not translatable content.
function needsTranslation(raw) {
  const s = decode(raw).trim()
  if (s.length < 2 || !/[A-Za-z]{2,}/.test(s)) return false
  if (INTENTIONALLY_ENGLISH.has(s)) return false
  if (/[ఀ-౿]/.test(s)) return false                              // already Telugu
  if (/@|https?:|www\.|\.(com|org|in)\b/i.test(s)) return false   // email / URL
  if (/^\d[\d:\sAPM.–—-]*$/i.test(s)) return false                // "9:00 AM – 8:00 PM"
  if (/^[x\d\s+()-]+$/i.test(s)) return false                     // "98xxxxxxxx" placeholders
  if (/^[A-Z0-9_]+$/.test(s) || ENV_VAR.test(s)) return false     // CONSTANT_CASE / env vars
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return false                   // hex colours
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(s)) return false     // snake_case keys
  if (/^[\w.+-]+\/[\w.+,-]+$/.test(s)) return false              // MIME types / paths
  // CSS / SVG values: colour functions, filters, gradients, url refs, units.
  if (/\b(?:rgba?|hsla?|url|blur|clamp|calc|translate[XY]?|rotate|scale|matrix|var)\(|gradient|currentColor|\d(?:px|rem|vw|vh|%)\b/.test(s)) return false
  // Tailwind with arbitrary values — `grid-rows-[1fr]`, `shadow-[0_10px…]`.
  if (/[\w-]+-\[[^\]]+\]/.test(s)) return false
  // Tailwind class strings: every token is a utility (`-left-8`, `sm:block`,
  // `bg-gold-400/70`) rather than a word someone reads.
  if (s.split(/\s+/).every((w) => /^-?[a-z]+[\w:/.-]*-[\w.]+(?:\/[\w.]+)?$/.test(w) || /^(?:hidden|block|flex|grid|absolute|relative|truncate)$/.test(w) || /:/.test(w)))
    return false
  return true
}

// Mirrors t()'s lookup: an exact entry, or a composed "<name> — <shared tail>"
// where both halves resolve. Without this the audit reports strings the app
// actually translates fine.
const hasTelugu = (s) => {
  if (known.has(s)) return true
  const parts = s.split(' — ')
  return parts.length === 2 && known.has(parts[0]) && known.has(parts[1])
}

// True when the access sits inside any call's parentheses. That covers both
// t(x.name) — already translated — and logic like norm(d.name) or
// dateFor(f.name), which are matching helpers, not renders. A bare render is
// `{x.name}` with no enclosing call, so this cheaply separates the two.
function insideCall(code, idx) {
  let depth = 0
  for (let i = idx; i >= 0; i--) {
    const c = code[i]
    if (c === ')') depth++
    else if (c === '(') {
      if (depth === 0) {
        return true
      } else depth--
    } else if (c === '\n' && depth === 0 && i < idx - 400) break
  }
  return false
}

// Inside a <T>…</T> element the whole expression is translated, even when the
// access is several tokens past the opening tag.
function insideTElement(code, idx) {
  const open = code.lastIndexOf('<T>', idx)
  if (open === -1) return false
  const close = code.lastIndexOf('</T>', idx)
  return close < open
}

// Attribute positions that are never devotee-visible prose.
const NON_PROSE_ATTR = /(?:className|href|src|key|id|to|alt|aria-[\w-]+|target|rel|type|name|value|accept|defaultValue)\s*=\s*\{?$/

// Receipts and tickets print English and Telugu together rather than switching
// between them. A Telugu sibling on the next line — literal Telugu text, a
// `nameTelugu`-style field, or a `font-telugu` run — means the pair is
// deliberate and the English half is not a bug.
const isBilingualPair = (lines, n) =>
  /[ఀ-౿]|font-telugu|Telugu\b/.test(lines[n] || '') ||   // twin on the next line
  /\w+Te\b|font-telugu/.test(lines[n - 1] || '')       // twin in the same ternary

// Temple-profile fields that are identifiers or data rather than prose — the
// same rule as the email address. `address` is excluded because
// useTempleAddress() already resolves it per language.
const IDENTIFIER_FIELDS = /^(id|code|key|slug|phone|email|website|regNo|pincode|established|timings|address|addressTe|nameTelugu|hero|about|banner|src|url|icon|image|value|social|facebook|instagram|youtube|defaultLanguage|short|time|year|length|map|filter|some|toLocaleString|split|trim|replace|temple|images|gallery|stats)$/i

// Prose-bearing fields of the site payload. Restricting to these keeps the
// check precise: everything else on those objects is a number, a sub-object or
// an identifier, and flagging them all buries the real findings.
const PROSE_FIELDS = /^(name|tagline|managedBy|trust|timingsNote|pan|receiptFooter|intro|mission|note|heading|subtitle|caption|plan|plans|validity|category|label|title|desc|description|session|item)$/

// Page content usually lives in a module-level CONST_CASE array or object —
// STEPS, ASSIST, CATS, SEVA_ABOUT — and is rendered as t(step), not t('literal').
// The MISSING check only sees literal arguments, so without this the strings are
// invisible to the audit even though they are plain English in the source.
function contentLiterals(code) {
  const out = []
  for (const m of code.matchAll(/^const ([A-Z][A-Z_0-9]*)\s*=\s*[[{]/gm)) {
    let depth = 0
    let i = code.indexOf(code[m.index + m[0].length - 1], m.index)
    const start = i
    for (; i < code.length; i++) {
      if (code[i] === '[' || code[i] === '{') depth++
      else if (code[i] === ']' || code[i] === '}') { if (--depth === 0) break }
    }
    const body = code.slice(start, i)
    for (const lit of body.matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)) {
      const s = lit[2].replace(/\\(['"\\])/g, '$1')
      if (s.startsWith('/') || s.startsWith('.') || /^[a-z0-9-]+$/.test(s)) continue
      out.push({ name: m[1], text: s, index: start + lit.index })
    }
  }
  return out
}

// Any English string literal that never reaches t(). This is the general case
// the earlier checks only sampled: `{cond ? "Today's Overview" : 'Overview'}`,
// preset labels in an inline array, `toast('Saved.')` — all invisible to a
// JSX-text or CONST_CASE scan, all English on a Telugu screen.
function looseLiterals(code) {
  const out = []
  for (const m of code.matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)) {
    const text = m[2].replace(/\\(['"\\])/g, '$1')
    if (!needsTranslation(text)) continue
    // Only skip a translated string when it sits in a data structure, where it
    // is usually resolved later via a variable (`tr(label)`) that no static
    // scan can follow. A bare literal in render position is still a finding
    // even when Telugu exists for it.
    const prev = code.slice(Math.max(0, m.index - 24), m.index)
    if (hasTelugu(text) && /[[,:{=]\s*$|\breturn\s*$/.test(prev)) continue
    // A `FOO_TE` twin map keyed the same way as `FOO` supplies the Telugu —
    // the English half is data, not an untranslated string.
    if (/const ([A-Z][A-Z_0-9]*)\s*=/.test(code.slice(0, m.index).split('\n').slice(-400).join('\n'))) {
      const owner = [...code.slice(0, m.index).matchAll(/^const ([A-Z][A-Z_0-9]*)\s*=/gm)].pop()
      if (owner && code.includes(`const ${owner[1]}_TE`)) continue
    }
    if (insideCall(code, m.index) || insideTElement(code, m.index)) continue
    // Routes, internal keys and CONSTANT-ish tokens are not prose.
    if (text.startsWith('/') || text.startsWith('.') || /^[a-z0-9_-]+$/.test(text)) continue
    const lineStart = code.lastIndexOf('\n', m.index) + 1
    const before = code.slice(lineStart, m.index)
    if (NON_PROSE_ATTR.test(before) || /\b(?:import|from|require)\b/.test(before)) continue
    // `role === 'Administrator'` is a comparison, not something rendered.
    if (/[=!]==?\s*$|\bincludes\(\s*$/.test(before)) continue
    // An object key is `{ Foo: …` or `, Foo: …` — not the middle of a ternary.
    if (/(?:^|[{,])\s*$/.test(before) && /^\s*:/.test(code.slice(m.index + m[0].length, m.index + m[0].length + 3))) continue
    const line = code.slice(lineStart, code.indexOf('\n', m.index))
    if (/[ఀ-౿]/.test(line)) continue   // bilingual pair — English beside Telugu
    out.push({ text, index: m.index })
  }
  return out
}

const findings = { unwrapped: [], missing: [], dynamic: [], content: [], literal: [] }
const files = ALL ? walk(SRC) : [...PUBLIC_DIRS.flatMap((d) => walk(d)), ...EXTRA_FILES]

for (const file of files) {
  const rel = path.relative(path.join(__dirname, '..'), file)
  if (rel.includes(`i18n${path.sep}`)) continue
  const raw = readFileSync(file, 'utf8')
  const code = stripComments(raw)
  const lineOf = (idx) => raw.slice(0, idx).split('\n').length

  // ── MISSING: wrapped, but nothing behind it ──
  const wrapped = /\b(?:t|tr)\(\s*(['"])((?:\\.|(?!\1).)*)\1|<T>([^<>{]+)<\/T>/g
  let m
  while ((m = wrapped.exec(code))) {
    const key = decode((m[2] ?? m[3] ?? '').replace(/\\(['"\\])/g, '$1')).trim()
    if (!needsTranslation(key)) continue
    if (!hasTelugu(key)) findings.missing.push({ rel, line: lineOf(m.index), key })
  }

  // ── UNWRAPPED: JSX text nodes that never reach t() ──
  const lines = raw.split('\n')
  // Text may sit on its own line between an expression and a closing tag,
  // so newlines are allowed — `[^<>{}]` still stops at any tag or expression.
  const textNode = />([^<>{}]{2,})</g
  while ((m = textNode.exec(code))) {
    const text = decode(m[1]).trim()
    if (!needsTranslation(text) || looksLikeCode(text)) continue
    if (m[1].includes('\n') && /[(){}]|=>/.test(m[1])) continue   // code, not prose
    if (/<T>\s*$/.test(code.slice(Math.max(0, m.index - 8), m.index + 1))) continue
    // Receipts print English and Telugu together rather than switching between
    // them. A Telugu sibling on the next line means this pair is deliberate.
    const n = lineOf(m.index)
    if (/[ఀ-౿]/.test(lines[n] || '')) continue
    findings.unwrapped.push({ rel, line: n, key: text })
  }

  // ── CONTENT LITERALS: page content arrays with no Telugu ──
  for (const lit of contentLiterals(code)) {
    if (!needsTranslation(lit.text) || hasTelugu(lit.text)) continue
    findings.content.push({ rel, line: lineOf(lit.index), key: `${lit.name}: ${lit.text}` })
  }

  // ── LOOSE LITERALS: English strings that never reach t() ──
  for (const lit of looseLiterals(code)) {
    findings.literal.push({ rel, line: lineOf(lit.index), key: lit.text })
  }

  // ── DYNAMIC: temple/site values printed without t() ──
  // The value is prose from the database, so it needs t() exactly like a
  // literal does. This is what left the temple name English in the header,
  // the About grid and the footer while the copyright line beside it was fine.
  const sources = new Set(['site', 'temple', 'TEMPLE'])
  const declared = /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:site|SITE)\s*\??\.|const\s+([A-Za-z_$][\w$]*)\s*=\s*use(?:Site|Temple)\(\)/g
  while ((m = declared.exec(code))) sources.add(m[1] || m[2])
  // Content is usually rendered through a callback parameter — `sevas.map((s)
  // => …s.name…)`. Without tracking those params the check sees nothing, which
  // is how every pooja name on the Sevas page stayed English.
  for (let pass = 0; pass < 2; pass++) {
    const cb = /([A-Za-z_$][\w$]*)\s*(?:\.\w+\([^)]*\))?\s*\.\s*(?:map|filter|find|forEach|flatMap|some|every|sort|reduce)\s*\(\s*\(?\s*([A-Za-z_$][\w$]*)/g
    while ((m = cb.exec(code))) if (sources.has(m[1])) sources.add(m[2])
  }
  // Props named after content flow into child components (<ServiceCard seva={…}>).
  const propRe = /\b(?:seva|festival|item|fund|pooja|entry|row)\b/
  for (const decl of code.matchAll(/function\s+\w+\s*\(\s*\{([^}]*)\}/g))
    for (const nm of decl[1].split(',').map((x) => x.trim().split(/[:=\s]/)[0]))
      if (propRe.test(nm)) sources.add(nm)

  const access = /([A-Za-z_$][\w$]*)\s*\??\.\s*([A-Za-z_$][\w$]*)/g
  while ((m = access.exec(code))) {
    const [, obj, prop] = m
    if (!sources.has(obj) || IDENTIFIER_FIELDS.test(prop) || !PROSE_FIELDS.test(prop)) continue
    if (insideCall(code, m.index)) continue
    const lineStart = code.lastIndexOf('\n', m.index) + 1
    const before = code.slice(lineStart, m.index)
    if (NON_PROSE_ATTR.test(before) || before.endsWith('[')) continue
    if (/<T>\s*\{?\s*$/.test(before) || insideTElement(code, m.index)) continue
    // `{x.desc ? … : …}` — a ternary test, not a render.
    if (/^\s*\?/.test(code.slice(m.index + m[0].length, m.index + m[0].length + 40))) continue
    if (isBilingualPair(lines, lineOf(m.index))) continue
    // `{x.note && <div>…</div>}` — a truthiness guard, not a render.
    if (/^\s*&&/.test(code.slice(m.index + m[0].length, m.index + m[0].length + 4))) continue
    findings.dynamic.push({ rel, line: lineOf(m.index), key: `${obj}.${prop}` })
  }
}

// ── CONTENT: DB-sourced values with no Telugu ──
// The temple profile and page content come from /api/public/site, not from
// literals in the page, so neither check above can see them. This is what put
// the tagline, "Managed By" and the timings note in English on a Telugu footer.
// Audited against the live payload, so it also covers anything staff type into
// Admin → Settings later.
const API = process.env.API_URL || `http://127.0.0.1:${process.env.API_PORT || 8099}`

function collectStrings(node, key = '', out = [], parent = null) {
  if (typeof node === 'string') {
    // A `fooTe` sibling means this field already has Telugu content — the twin
    // convention used by festivals (nameTe/descTe) and the temple address.
    if (parent && parent[`${key}Te`]) return out
    if (!IDENTIFIER_FIELDS.test(key) && needsTranslation(node) && !node.startsWith('/')) out.push({ key, text: node })
  } else if (Array.isArray(node)) node.forEach((v) => collectStrings(v, key, out, parent))
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) collectStrings(v, k, out, node)
  return out
}

async function auditContent() {
  let payload
  try {
    const res = await fetch(`${API}/api/public/site`, { signal: AbortSignal.timeout(5000) })
    payload = await res.json()
  } catch {
    return null   // unreachable ≠ clean — the caller must say so
  }
  const seen = new Set()
  return collectStrings(payload).filter(({ text }) => {
    if (seen.has(text) || hasTelugu(text)) return false
    seen.add(text)
    return true
  })
}

const surface = ALL ? 'frontend/src' : 'the public site'

async function main() {
  console.log(`\nTelugu coverage — ${surface}  (${files.length} files, ${known.size} dictionary entries)\n`)

  for (const [kind, name, label, hint] of [
    ['unwrapped', 'PAGE TEXT', 'never passed through t()', "wrap it: {t('…')} or <T>…</T>"],
    ['dynamic', 'DATABASE VALUES IN CODE', 'printed without t()', 'wrap it: {t(TEMPLE.x)} — or tr(TEMPLE.x) outside a hook'],
    ['literal', 'UNTRANSLATED LITERALS', 'English strings never passed to t()', "wrap it: t('…') / tr('…') / <T>…</T>"],
    ['content', 'PAGE CONTENT ARRAYS', 'literals in CONST_CASE data with no Telugu', 'add an entry to UI_TE, or a *_TE twin map beside it'],
    ['missing', 'DICTIONARY', 'wrapped, but no Telugu exists', 'add an entry to UI_TE in LanguageContext.jsx'],
  ]) {
    const rows = findings[kind]
    if (!rows.length) { console.log(`✅ ${name}: none\n`); continue }
    console.log(`❌ ${name} — ${label}  (${rows.length})\n   → ${hint}\n`)
    for (const r of rows) console.log(`   ${r.rel}:${r.line}\n     ${JSON.stringify(r.key)}`)
    console.log('')
  }

  const content = await auditContent()
  if (content === null) {
    console.log(`⚠️  DATABASE CONTENT — not checked: no API at ${API}`)
    console.log('   Start the backend, then re-run. Until then this audit covers')
    console.log('   only the code, not what the database serves.\n')
  } else if (content.length) {
    console.log(`❌ NO TELUGU — database content served by /api/public/site  (${content.length})`)
    console.log('   → add an entry to UI_TE, or give the field a Telugu twin in Settings\n')
    for (const c of content) console.log(`   ${c.key}\n     ${JSON.stringify(c.text)}`)
    console.log('')
  } else console.log('✅ DATABASE CONTENT: none\n')

  const total = findings.missing.length + findings.unwrapped.length +
    findings.dynamic.length + findings.content.length + findings.literal.length + (content?.length || 0)
  if (total) { console.log(`${total} string(s) will render in English when తెలుగు is selected.\n`); process.exit(1) }
  console.log('All devotee-facing text has Telugu.\n')
}

main()
