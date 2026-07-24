import React from 'react'
import { FileDown, FileSpreadsheet } from 'lucide-react'
import { exportReportToPdf } from '../../lib/pdf.js'
import { exportReportToExcel } from '../../lib/excel.js'
import { T, tr } from '../../i18n/LanguageContext.jsx'

// Export the rows currently listed in a register (already filtered on screen)
// as a real downloaded PDF / Excel file — the accountant's hand-off need.
export default function ExportButtons({ title, columns, rows, total }) {
  if (!rows?.length) return null
  const result = () => ({ title, subtitle: `${rows.length} record(s) · exported ${new Date().toLocaleDateString('en-GB')}`, columns, rows, total })
  return (
    <span className="inline-flex gap-1.5">
      <button type="button" onClick={() => exportReportToPdf(result())} className="btn-outline !py-2 text-[0.75rem]" title={tr("Download PDF")}><FileDown size={14} />{' '}<T>PDF</T></button>
      <button type="button" onClick={() => exportReportToExcel(result())} className="btn-outline !py-2 text-[0.75rem]" title={tr("Download Excel")}><FileSpreadsheet size={14} />{' '}<T>Excel</T></button>
    </span>
  )
}
