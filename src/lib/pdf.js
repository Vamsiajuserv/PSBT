// Real PDF export for report results (replaces the old window.print()).
// Uses jsPDF + autotable to generate and DOWNLOAD a .pdf file.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const MAROON = [123, 17, 17]

// result: { title, subtitle, columns:[{key,label}], rows:[{...}], total:{...} }
export function exportReportToPdf(result) {
  if (!result || !Array.isArray(result.columns)) return
  const cols = result.columns
  const doc = new jsPDF({ orientation: cols.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })

  const cell = (row, c) => {
    const v = row?.[c.key]
    return v == null ? '' : String(v)
  }
  const head = [cols.map((c) => c.label ?? c.key)]
  const body = (result.rows || []).map((r) => cols.map((c) => cell(r, c)))
  const foot = result.total ? [cols.map((c) => cell(result.total, c))] : undefined

  doc.setFontSize(15); doc.setTextColor(...MAROON)
  doc.text(result.title || 'Report', 40, 42)
  if (result.subtitle) { doc.setFontSize(9); doc.setTextColor(120); doc.text(String(result.subtitle), 40, 58) }
  doc.setFontSize(8); doc.setTextColor(150)
  doc.text(`Generated ${new Date().toLocaleString()}`, 40, result.subtitle ? 72 : 58)

  autoTable(doc, {
    head, body, foot,
    startY: result.subtitle ? 84 : 70,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: MAROON, textColor: 255 },
    footStyles: { fillColor: [245, 240, 235], textColor: MAROON, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 248, 246] },
  })

  const fname = `${(result.title || 'report').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(fname)
}
