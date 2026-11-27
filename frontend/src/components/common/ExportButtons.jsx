import React from 'react'
import { FileDown, FileSpreadsheet } from 'lucide-react'
import { exportReportToPdf } from '../../lib/pdf.js'
import { exportReportToExcel } from '../../lib/excel.js'
import { guardExport } from '../../lib/exportGuard.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

// Export the rows currently listed in a register (already filtered on screen) as a real downloaded
// PDF / Excel file — the accountant's hand-off need. A pop-up first says what is being taken (period,
// filters, record count; a warning for "all dates" or a cut-short list), the file's heading repeats it
// with who took it, and the Audit Trail records it (client, 2026-11-26).
//   screen   — the list's name for the pop-up / audit (defaults to the title)
//   start/end — the date range on screen ('' = all dates); filters — [[label, value], …]
//   available — how many records match on the server, when `rows` may hold fewer
export default function ExportButtons({ title, columns, rows, total, screen, start, end, filters, available, noDates }) {
  const { user } = useAuth() || {}
  if (!rows?.length) return null
  const run = async (format, fn) => {
    const heading = await guardExport({ screen: screen || title, format, start, end, filters, count: rows.length, available, noDates, user })
    if (heading == null) return
    fn({ title, subtitle: heading, columns, rows, total })
  }
  return (
    <span className="inline-flex gap-1.5">
      <button type="button" onClick={() => run('PDF', exportReportToPdf)} className="btn-outline !py-2 text-[0.75rem]" title={tr("Download PDF")}><FileDown size={14} />{' '}<T>PDF</T></button>
      <button type="button" onClick={() => run('Excel', exportReportToExcel)} className="btn-outline !py-2 text-[0.75rem]" title={tr("Download Excel")}><FileSpreadsheet size={14} />{' '}<T>Excel</T></button>
    </span>
  )
}
