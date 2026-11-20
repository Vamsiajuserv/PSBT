#!/usr/bin/env node
// Telugu coverage check.
//
// Loads the app's own translation code (src/i18n/LanguageContext.jsx, through Vite exactly
// as the app does), switches it to Telugu and runs every English string it can find:
//
//   1. Frontend text: <T>…</T>, t('…') / tr('…'), and text props of app components
//      (title=, subtitle=, breadcrumb= …) — fails if any has no Telugu.
//   2. Literal English in a plain HTML attribute (<input placeholder="Search…">) — never
//      reaches the translator, so it fails unless it is a code like "PAN-00003".
//   3. Backend messages: HTTPException / ValueError texts and detail="…" literals — fails
//      if any has no Telugu.
//   4. Backend sentences built with values (f-strings: audit log, stock history) — each must
//      have a sample in telugu-samples.json, and the Telugu the app produces for that sample
//      must match the reviewed Telugu stored there. A new f-string without a sample fails,
//      so new messages get a Telugu review instead of slipping through.
//
// Usage:  npm run check:telugu              (repo root or frontend/)
//         npm run check:telugu -- --update   (store the current Telugu for samples, after review)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'

const FRONT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(FRONT, 'src')
const BACK = path.resolve(FRONT, '..', 'backend', 'app')
const SAMPLES_FILE = path.join(FRONT, 'scripts', 'telugu-samples.json')
const UPDATE = process.argv.includes('--update')

const rel = (f) => path.relative(path.resolve(FRONT, '..'), f)
const lineOf = (src, i) => src.slice(0, i).split('\n').length
const norm = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
// Nothing to translate: no words, an email, a language code, an ID / code example
const noNeed = (s) => !/[A-Za-z]{2,}/.test(s) || /^\S+@\S+\.\S+$/.test(s) || /^(EN|[A-Z]{2})$/.test(s)
  || /^[A-Z]{2,6}(-\d[\w-]*)?$/.test(s)

function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '__pycache__') walk(p, exts, out) }
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p)
  }
  return out
}

// ── 1 + 2. Frontend strings ──────────────────────────────────────────────
const TEXT_PROPS = 'title|subtitle|label|placeholder|message|sub|subNoLabel|breadcrumb|emptyText|heading|alt|aria-label|hint|caption|description|confirmLabel|cancelLabel|tooltip'
const front = new Map()          // string → first place it is used
const rawAttrs = []              // literal English on plain HTML elements
const addFront = (s, where) => { s = norm(s); if (s && !noNeed(s) && !front.has(s)) front.set(s, where) }

for (const f of walk(SRC, ['.js', '.jsx'])) {
  if (f.startsWith(path.join(SRC, 'i18n') + path.sep)) continue
  const src = fs.readFileSync(f, 'utf8')
  const scan = (re, fn) => { for (const m of src.matchAll(re)) fn(m, `${rel(f)}:${lineOf(src, m.index)}`) }
  scan(/<T>([^<{]+)<\/T>/g, (m, w) => addFront(m[1], w))
  scan(/\btr?\(\s*'((?:[^'\\\n]|\\.)+)'/g, (m, w) => addFront(m[1], w))
  scan(/\btr?\(\s*"([^"\n]+)"/g, (m, w) => addFront(m[1], w))
  scan(/\btr?\(\s*`([^`$]+)`/g, (m, w) => addFront(m[1], w))
  scan(new RegExp(`\\b(${TEXT_PROPS})="([^"{}]*[A-Za-z]{2}[^"{}]*)"`, 'g'), (m, w) => {
    const tag = src.slice(src.lastIndexOf('<', m.index), m.index).match(/^<([A-Za-z][\w.]*)/)?.[1] || ''
    if (/^[a-z]/.test(tag)) { if (!noNeed(norm(m[2]))) rawAttrs.push(`${w}  <${tag} ${m[1]}="${m[2]}">`); return }
    // App components translate these props themselves; a breadcrumb is translated part by part.
    for (const part of m[1] === 'breadcrumb' ? m[2].split('›') : [m[2]]) addFront(part, w)
  })
}

// ── 3 + 4. Backend strings ───────────────────────────────────────────────
// Reads the Python string literal(s) starting at i — implicit concatenation across lines
// included. Returns null when the text is built further with + / .join / %, i.e. dynamic.
function readPy(src, i) {
  let j = i, text = '', isF = false, any = false
  const ws = () => { while (j < src.length && /[\s(]/.test(src[j])) j++ }
  ws()
  for (;;) {
    const m = src.slice(j).match(/^([rRfFbBuU]{0,2})('''|"""|'|")/)
    if (!m) break
    const q = m[2], prefix = m[1].toLowerCase()
    let k = j + m[0].length, body = ''
    while (k < src.length && !src.startsWith(q, k)) {
      if (src[k] === '\\') { body += src[k] + src[k + 1]; k += 2 } else if (src[k] === '\n' && q.length === 1) return null
      else body += src[k++]
    }
    if (prefix.includes('f')) {
      isF = true
      // {expr} → {x}; {{ and }} are literal braces
      let out = '', d = 0
      for (let p = 0; p < body.length; p++) {
        const c = body[p]
        if (!d && c === '{' && body[p + 1] === '{') { out += '{'; p++; continue }
        if (!d && c === '}' && body[p + 1] === '}') { out += '}'; p++; continue }
        if (c === '{') { if (!d++) out += '{x}'; continue }
        if (c === '}' && d) { d--; continue }
        if (!d) out += c
      }
      body = out
    }
    text += body; any = true; j = k + q.length
    const save = j; ws()
    if (!/^([rRfFbBuU]{0,2})('|")/.test(src.slice(j))) { j = save; break }
  }
  if (!any) return null
  while (j < src.length && /\s/.test(src[j])) j++
  if (/[+.%]/.test(src[j])) return null
  return { text: norm(text), isF }
}

const backPlain = new Map()      // literal message → where
const backTemplates = new Map()  // audit / history sentence built with values → where
const errTemplates = new Map()   // error message built with values → where
for (const f of walk(BACK, ['.py'])) {
  const src = fs.readFileSync(f, 'utf8')
  // An error is raised (HTTPException / ValueError, or detail= inside an HTTPException);
  // any other detail= is a sentence written to the audit log or an item's history.
  const inError = (i) => { const h = src.lastIndexOf('HTTPException(', i); return h >= 0 && i - h < 200 && !src.slice(h, i).includes(')') }
  const starts = [
    ...[...src.matchAll(/HTTPException\(\s*\d+\s*,/g)].map((m) => [m.index + m[0].length, true]),
    ...[...src.matchAll(/\bValueError\(/g)].map((m) => [m.index + m[0].length, true]),
    ...[...src.matchAll(/\bdetail\s*=/g)].map((m) => [m.index + m[0].length, inError(m.index)]),
  ]
  for (const [i, isErr] of starts) {
    const r = readPy(src, i)
    if (!r || noNeed(r.text) || r.text === '{x}') continue
    const where = `${rel(f)}:${lineOf(src, i)}`
    const map = !(r.isF && r.text.includes('{x}')) ? backPlain : isErr ? errTemplates : backTemplates
    if (!map.has(r.text)) map.set(r.text, where)
  }
}
// Seed / site content names the public pages show
for (const f of ['seed.py', 'site_content.py']) {
  const p = path.join(BACK, f)
  if (!fs.existsSync(p)) continue
  const src = fs.readFileSync(p, 'utf8')
  for (const m of src.matchAll(/["'](?:name|title|label)["']\s*:\s*["']([^"'\n]{2,120})["']/g)) {
    const s = norm(m[1]); if (!noNeed(s) && !backPlain.has(s)) backPlain.set(s, `${rel(p)}:${lineOf(src, m.index)}`)
  }
}

// ── Run the real translation code in Telugu ──────────────────────────────
globalThis.localStorage = { getItem: (k) => (k === 'psbt_lang' ? 'te' : null), setItem() {}, removeItem() {} }
const vite = await createServer({ root: FRONT, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } })
let failed = false
try {
  const L = await vite.ssrLoadModule('/src/i18n/LanguageContext.jsx')
  const { storeDetail } = await vite.ssrLoadModule('/src/pages/admin/stores/shared.jsx')
  let t = null
  const Probe = () => { t = L.useLang().t; return null }
  renderToString(React.createElement(L.LanguageProvider, null, React.createElement(Probe)))
  if (!t || L.getLang() !== 'te') throw new Error('Could not switch the translation code to Telugu')
  const local = (s) => String(t(s, { local: true }))
  const run = (mode, s) => String(mode === 'store' ? storeDetail(s) : mode === 't' ? local(s) : L.auditDetail(s))

  const missing = (map) => [...map].filter(([s]) => local(s) === s)
  const frontMissing = missing(front)
  const backMissing = missing(backPlain)
  // Error messages with values go through t(): fill each slot with a value and the Telugu
  // template must match. A slot glued to text ("day.{x}") is an optional suffix — try it empty too.
  const errMissing = [...errTemplates].filter(([tpl]) => {
    const tries = [tpl.replace(/\{x\}/g, '7'), tpl.replace(/(\S)\{x\}$/, '$1').replace(/\{x\}/g, '7'), tpl.replace(/\{x\}/g, 'Rice')]
    return tries.every((s) => local(s) === s)
  })

  // Templated backend messages: every f-string needs a sample, and each sample's Telugu
  // must be the reviewed one.
  const samples = fs.existsSync(SAMPLES_FILE) ? JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8')) : []
  const toRe = (tpl) => new RegExp('^' + tpl.split('{x}').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+') + '$', 's')
  const noSample = [...backTemplates].filter(([tpl]) => !samples.some((x) => toRe(tpl).test(x.en)))
  const changed = []
  for (const x of samples) {
    const out = run(x.mode, x.en)
    if (UPDATE) x.te = out
    else if (out !== x.te) changed.push(`${x.en}\n      expected: ${x.te}\n      now:      ${out}`)
  }
  if (UPDATE) fs.writeFileSync(SAMPLES_FILE, JSON.stringify(samples, null, 1) + '\n')

  const total = front.size + backPlain.size + errTemplates.size + backTemplates.size
  const bad = frontMissing.length + backMissing.length + errMissing.length + noSample.length + rawAttrs.length
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '100.0')
  console.log('Telugu coverage (real translation code, Telugu mode)\n')
  console.log(`  Frontend text            ${front.size - frontMissing.length} / ${front.size}  (${pct(front.size - frontMissing.length, front.size)}%)`)
  console.log(`  Backend messages         ${backPlain.size - backMissing.length} / ${backPlain.size}  (${pct(backPlain.size - backMissing.length, backPlain.size)}%)`)
  console.log(`  Backend errors w/ values ${errTemplates.size - errMissing.length} / ${errTemplates.size}  (${pct(errTemplates.size - errMissing.length, errTemplates.size)}%)`)
  console.log(`  Audit / history entries  ${backTemplates.size - noSample.length} / ${backTemplates.size} have a reviewed sample  (${samples.length} samples, ${changed.length} changed)`)
  console.log(`  HTML attributes          ${rawAttrs.length} with English the translator never sees`)
  console.log(`\n  TOTAL                    ${total - bad} / ${total}  (${pct(total - bad, total)}%)\n`)

  const list = (title, rows) => { if (rows.length) { failed = true; console.log(`✘ ${title} (${rows.length})`); for (const r of rows) console.log(`    ${r}`); console.log() } }
  list('No Telugu — add to UI_TE in src/i18n/LanguageContext.jsx', frontMissing.map(([s, w]) => `${JSON.stringify(s)}   ${w}`))
  list('Backend message with no Telugu — add to UI_TE', backMissing.map(([s, w]) => `${JSON.stringify(s)}   ${w}`))
  list('Backend error built with values has no Telugu template — add one to UI_TE with {name} slots', errMissing.map(([s, w]) => `${s}   ${w}`))
  list('Plain HTML attribute with English — wrap it in tr()', rawAttrs)
  list('Backend message built with values has no sample — add one to scripts/telugu-samples.json, check its Telugu, then run with --update', noSample.map(([s, w]) => `${s}   ${w}`))
  list('Telugu changed for a sample — check it; if the new Telugu is right, run with --update', changed)
  if (UPDATE) console.log(`Stored the current Telugu for ${samples.length} samples in ${rel(SAMPLES_FILE)}.`)
  else if (!failed) console.log('✔ Everything has Telugu.')
} finally {
  await vite.close()
}
process.exit(failed ? 1 : 0)
