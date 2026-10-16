// Real PDF export for report results (replaces the old window.print()).
// Uses jsPDF + autotable to generate and DOWNLOAD a .pdf file.
//
// Telugu: jsPDF writes glyphs one by one and cannot shape Telugu — vowel signs
// and conjuncts (క్ష, ర్మ) come out broken even with a Telugu font embedded. So a
// Telugu export is laid out as HTML in the app's Telugu font (Noto Sans Telugu),
// which the browser shapes correctly, and each A4 page is captured into the PDF.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getLang, tr, stamp } from '../i18n/LanguageContext.jsx'
import { localiseReport } from './reportText.js'

const MAROON = [123, 17, 17]

const generatedAt = () => new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })

// ASCII file name from the English title; a Telugu title has none, so "report".
// Named by the report's period (same as the Excel file); without a period, by today's IST date.
function fileName(title, range) {
  const base = String(title || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'report'
  const when = range && range.start
    ? (range.end && range.end !== range.start ? `${range.start}-to-${range.end}` : range.start)
    : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  return `${base}-${when}.pdf`
}

// The standard PDF fonts have no ₹ glyph (it printed as "¹"), so English files spell it out.
const rupee = (s) => String(s).replace(/₹(?=\))/g, 'Rs.').replace(/₹\s?/g, 'Rs. ')

// result: { title, subtitle, columns:[{key,label}], rows:[{...}], total:{...} }
export async function exportReportToPdf(result) {
  if (!result || !Array.isArray(result.columns)) return
  if (getLang() === 'te') return exportTeluguPdf(result)
  const cols = result.columns
  const doc = new jsPDF({ orientation: cols.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })

  const cell = (row, c) => {
    const v = row?.[c.key]
    return v == null ? '' : rupee(v)
  }
  const head = [cols.map((c) => rupee(c.label ?? c.key))]
  const body = (result.rows || []).map((r) => cols.map((c) => cell(r, c)))
  const foot = result.total ? [cols.map((c) => cell(result.total, c))] : undefined

  doc.setFontSize(15); doc.setTextColor(...MAROON)
  doc.text(rupee(result.title || 'Report'), 40, 42)
  if (result.subtitle) { doc.setFontSize(9); doc.setTextColor(120); doc.text(rupee(result.subtitle), 40, 58) }
  doc.setFontSize(8); doc.setTextColor(150)
  doc.text(`Generated ${generatedAt()}`, 40, result.subtitle ? 72 : 58)

  autoTable(doc, {
    head, body, foot,
    startY: result.subtitle ? 84 : 70,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: MAROON, textColor: 255 },
    footStyles: { fillColor: [245, 240, 235], textColor: MAROON, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 248, 246] },
  })

  doc.save(fileName(result.title, result.range))
}

// ── Telugu: HTML pages in Noto Sans Telugu → images → PDF ────────────────────
const FONT = '"Noto Sans Telugu", "Noto Sans", sans-serif'
const MAROON_CSS = 'rgb(123,17,17)'
const fmtNum = (v, money) => {
  if (v === '' || v == null) return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n.toLocaleString('en-IN', money ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined)
}

function el(tag, css, text) {
  const e = document.createElement(tag)
  if (css) e.style.cssText = css
  if (text != null) e.textContent = text
  return e
}

async function exportTeluguPdf(result) {
  const { default: html2canvas } = await import('html2canvas')
  const loc = localiseReport(result)
  const cols = loc.columns
  const landscape = cols.length > 6
  // A4 at 96 CSS px per inch.
  const W = landscape ? 1123 : 794
  const H = landscape ? 794 : 1123
  const PAD = 40
  const FOOT = 28   // room kept for the page number

  try { await document.fonts?.load(`16px ${FONT}`, 'తెలుగు') } catch { /* fall back to whatever is loaded */ }
  try { await document.fonts?.ready } catch { /* ignore */ }

  const host = el('div', 'position:fixed;left:-20000px;top:0;z-index:-1;')
  document.body.appendChild(host)
  try {
    const align = (c) => (c.type === 'money' || c.type === 'num' ? 'right' : 'left')
    const cellText = (row, c) => {
      const v = row?.[c.key]
      return c.type === 'money' || c.type === 'num' ? fmtNum(v, c.type === 'money') : (v == null ? '' : String(v))
    }
    const pages = []
    const newPage = (first) => {
      const page = el('div', `width:${W}px;padding:${PAD}px ${PAD}px 0;box-sizing:border-box;background:#fff;color:#1f2937;font-family:${FONT};position:relative;`)
      if (first) {
        page.appendChild(el('div', `font-size:20px;font-weight:700;color:${MAROON_CSS};line-height:1.5;`, loc.title || tr('Report')))
        if (loc.subtitle) page.appendChild(el('div', 'font-size:11px;color:#6b7280;margin-top:2px;line-height:1.6;', loc.subtitle))
        page.appendChild(el('div', 'font-size:10px;color:#9ca3af;margin:4px 0 12px;', `${tr('Generated on')}: ${stamp(generatedAt())}`))
      }
      const table = el('table', 'width:100%;border-collapse:collapse;font-size:10.5px;line-height:1.55;')
      const head = el('tr')
      cols.forEach((c) => head.appendChild(el('th', `background:${MAROON_CSS};color:#fff;font-weight:600;padding:6px 7px;text-align:${align(c)};`, c.label)))
      table.appendChild(el('thead')).appendChild(head)
      const tbody = table.appendChild(el('tbody'))
      page.appendChild(table)
      host.appendChild(page)
      pages.push(page)
      return { page, tbody }
    }
    const makeRow = (row, i, isTotal) => {
      const tr_ = el('tr', isTotal ? `background:#f5f0eb;color:${MAROON_CSS};font-weight:700;` : (i % 2 ? 'background:#faf8f6;' : ''))
      cols.forEach((c) => tr_.appendChild(el('td', `padding:5px 7px;border-bottom:1px solid #eee;text-align:${align(c)};vertical-align:top;`, cellText(row, c))))
      return tr_
    }

    let cur = newPage(true)
    const place = (rowEl) => {
      cur.tbody.appendChild(rowEl)
      // Overflowed the page: move the row to a fresh page (keep at least one row per page).
      if (cur.page.offsetHeight > H - FOOT && cur.tbody.children.length > 1) {
        cur.tbody.removeChild(rowEl)
        cur = newPage(false)
        cur.tbody.appendChild(rowEl)
      }
    }
    const rows = loc.rows || []
    if (!rows.length) cur.tbody.appendChild(el('tr')).appendChild(el('td', 'padding:14px;text-align:center;color:#9ca3af;', tr('No records for the selected period.'))).colSpan = cols.length
    rows.forEach((r, i) => place(makeRow(r, i, false)))
    if (loc.total) place(makeRow(loc.total, 0, true))

    // Fix every page to A4 height and number it.
    pages.forEach((page, i) => {
      page.style.height = `${H}px`
      page.appendChild(el('div', `position:absolute;left:0;right:0;bottom:12px;text-align:center;font-size:9px;color:#9ca3af;`, tr(`Page ${i + 1} of ${pages.length}`)))
    })

    const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
    const pw = doc.internal.pageSize.getWidth()
    const ph = doc.internal.pageSize.getHeight()
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false, width: W, height: H })
      if (i) doc.addPage()
      doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pw, ph)
    }
    doc.save(fileName(result.title, result.range))
  } finally {
    host.remove()
  }
}
