// Shared .xlsx exporter for the Reports module.
//
// Single source of truth = the generated report result already on screen:
//   { title, subtitle, columns:[{key,label,type}], rows:[{...}], total:{...}|null, range:{start,end} }
// One utility for every report — no per-report export code. Money/number columns
// become real numeric Excel cells; date-like text columns become real Excel dates.
import ExcelJS from 'exceljs'

const MAROON = 'FF7A1220'
const HEADER_TEXT = 'FFFFFFFF'
const TOTAL_FILL = 'FFFDF3E0'
const MUTED = 'FF6B7280'
const BORDER = 'FFE5E7EB'
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }
const DMY = /^(\d{2}) ([A-Za-z]{3}) (\d{4})$/   // the backend's consistent "%d %b %Y" date format

const parseDMY = (s) => {
  const m = DMY.exec(String(s ?? ''))
  if (!m || MON[m[2]] == null) return null
  // noon UTC avoids any timezone off-by-one when ExcelJS serialises the date
  return new Date(Date.UTC(Number(m[3]), MON[m[2]], Number(m[1]), 12))
}
const isBlank = (v) => v === '' || v == null
const fmtISO = (iso) => {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-')
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]} ${y}`
}

function sanitizeFilename(title, range) {
  const base = (title || 'report').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'report'
  const r = range && range.start ? `_${range.start}_to_${range.end}` : ''
  return `${(base + r).slice(0, 120)}.xlsx`
}

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/** Export the on-screen report result to a genuine .xlsx workbook and download it. */
export async function exportReportToExcel(result) {
  if (!result) return
  const cols = result.columns || []
  const rows = result.rows || []
  const n = Math.max(1, cols.length)

  // Which text columns are actually dates? Only when EVERY non-blank cell matches the
  // backend's fixed date format — deterministic, so no misparsing of ordinary text.
  const dateCol = cols.map((c) => c.type === 'text'
    && rows.length > 0
    && rows.every((r) => isBlank(r[c.key]) || DMY.test(String(r[c.key])))
    && rows.some((r) => DMY.test(String(r[c.key] ?? ''))))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'PSBT-Portal'
  const safeName = (result.title || 'Report').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Report'
  const ws = wb.addWorksheet(safeName)

  // ── Heading block: title, subtitle, period ──
  ws.mergeCells(1, 1, 1, n)
  Object.assign(ws.getCell(1, 1), { value: result.title || 'Report' })
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: MAROON } }
  let row = 2
  if (result.subtitle) {
    ws.mergeCells(row, 1, row, n)
    ws.getCell(row, 1).value = result.subtitle
    ws.getCell(row, 1).font = { italic: true, size: 10, color: { argb: MUTED } }
    row++
  }
  if (result.range && result.range.start) {
    ws.mergeCells(row, 1, row, n)
    ws.getCell(row, 1).value = `Period: ${fmtISO(result.range.start)} to ${fmtISO(result.range.end)}`
    ws.getCell(row, 1).font = { size: 10, color: { argb: MUTED } }
    row++
  }
  row++ // spacer

  // ── Header row ──
  const headerRowNum = row
  const hr = ws.getRow(headerRowNum)
  cols.forEach((c, i) => {
    const cell = hr.getCell(i + 1)
    cell.value = c.label
    cell.font = { bold: true, color: { argb: HEADER_TEXT } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MAROON } }
    cell.alignment = { vertical: 'middle', horizontal: c.type === 'text' ? 'left' : 'right' }
  })
  hr.height = 18
  row++

  const writeCell = (cell, col, value, isDate) => {
    if (isBlank(value)) { cell.value = null; return }
    if (col.type === 'money') {
      cell.value = Number(value) || 0
      cell.numFmt = '#,##0.00'
      cell.alignment = { horizontal: 'right' }
    } else if (col.type === 'num') {
      const num = Number(value)
      cell.value = Number.isFinite(num) ? num : String(value)
      if (Number.isFinite(num)) cell.numFmt = '#,##0'
      cell.alignment = { horizontal: 'right' }
    } else if (isDate) {
      const d = parseDMY(value)
      if (d) { cell.value = d; cell.numFmt = 'dd mmm yyyy' } else cell.value = String(value)
    } else {
      cell.value = String(value)
    }
  }

  // ── Data rows (or a graceful empty note) ──
  if (rows.length) {
    for (const r of rows) {
      const xr = ws.getRow(row)
      cols.forEach((c, i) => writeCell(xr.getCell(i + 1), c, r[c.key], dateCol[i]))
      row++
    }
  } else {
    ws.mergeCells(row, 1, row, n)
    ws.getCell(row, 1).value = 'No records for the selected period.'
    ws.getCell(row, 1).font = { italic: true, color: { argb: 'FF9CA3AF' } }
    ws.getCell(row, 1).alignment = { horizontal: 'center' }
    row++
  }

  // ── Total row ──
  if (result.total) {
    const tr = ws.getRow(row)
    cols.forEach((c, i) => {
      const cell = tr.getCell(i + 1)
      writeCell(cell, c, result.total[c.key], dateCol[i])
      cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } }
      cell.border = { top: { style: 'thin', color: { argb: BORDER } } }
    })
    row++
  }

  // ── Column widths (from header + content) ──
  cols.forEach((c, i) => {
    let w = String(c.label).length
    const measure = (v) => { if (!isBlank(v)) w = Math.max(w, String(v).length) }
    rows.forEach((r) => measure(r[c.key]))
    if (result.total) measure(result.total[c.key])
    ws.getColumn(i + 1).width = Math.min(42, Math.max(10, w + 2))
  })

  // ── Freeze the heading + header rows ──
  ws.views = [{ state: 'frozen', ySplit: headerRowNum }]

  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    sanitizeFilename(result.title, result.range))
}
