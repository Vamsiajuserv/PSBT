import React, { useEffect, useMemo, useState } from 'react'
import {
  Search, RotateCcw, FileText, FileSpreadsheet, Flame, HandCoins, HeartPulse,
  Landmark, Gavel, UtensilsCrossed, Recycle, FileBarChart,
} from 'lucide-react'
import { PageTitle, num } from '../../components/admin/ui.jsx'
import { LOAD_ERROR } from '../../components/common/states.jsx'
import { ReportsAPI } from '../../api/client.js'
import { exportReportToExcel } from '../../lib/excel.js'
import { exportReportToPdf } from '../../lib/pdf.js'
import { Select, DateField } from '../../components/common/Field.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const today = () => new Date().toISOString().slice(0, 10)
const money2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const CAT_ICON = {
  pooja: { icon: Flame, color: '#8a1c1c', bg: 'bg-maroon-50' },
  donation: { icon: HandCoins, color: '#059669', bg: 'bg-emerald-50' },
  medical: { icon: HeartPulse, color: '#7c3aed', bg: 'bg-violet-50' },
  hundi: { icon: Landmark, color: '#d97706', bg: 'bg-amber-50' },
  auction: { icon: Gavel, color: '#2563eb', bg: 'bg-blue-50' },
  annadanam: { icon: UtensilsCrossed, color: '#dc2626', bg: 'bg-red-50' },
  waste: { icon: Recycle, color: '#059669', bg: 'bg-emerald-50' },
  general: { icon: FileBarChart, color: '#8a1c1c', bg: 'bg-maroon-50' },
}

export default function Reports() {
  const [cats, setCats] = useState([])
  const [start, setStart] = useState(firstOfMonth())
  const [end, setEnd] = useState(today())
  const [category, setCategory] = useState('')
  const [report, setReport] = useState('')
  const [rq, setRq] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState('')

  useEffect(() => {
    ReportsAPI.catalog().then((r) => {
      setCats(r.categories)
      const c0 = r.categories[0]
      setCategory(c0.key); setReport(c0.reports[0])
    }).catch((ex) => setLoadErr(ex?.detail || "Couldn't load reports — check your connection and retry."))
  }, [])

  const allReports = useMemo(() => cats.flatMap((c) => c.reports.map((rp) => ({ category: c.key, name: rp }))), [cats])
  const reportsInCat = useMemo(() => cats.find((c) => c.key === category)?.reports || [], [cats, category])
  const filteredList = useMemo(() => allReports.filter((r) => r.name.toLowerCase().includes(rq.toLowerCase())), [allReports, rq])

  async function generate(rep = report) {
    if (!rep) return
    setLoading(true); setLoadErr('')
    try {
      const out = await ReportsAPI.generate({ report: rep, start, end })
      setResult(out)
    } catch (ex) {
      setLoadErr(ex?.detail || LOAD_ERROR); setResult(null)
    } finally { setLoading(false) }
  }
  useEffect(() => { if (report) generate() }, [report]) // eslint-disable-line

  function pickReport(name, cat) { setCategory(cat); setReport(name) }
  function reset() { setStart(firstOfMonth()); setEnd(today()); setRq(''); if (cats[0]) { setCategory(cats[0].key); setReport(cats[0].reports[0]) } }

  const [exporting, setExporting] = useState(false)
  async function exportExcel() {
    if (!result || exporting) return
    setExporting(true)
    try { await exportReportToExcel(result) } finally { setExporting(false) }
  }

  const cell = (col, row, isTotal) => {
    const v = row[col.key]
    if (col.type === 'money') return (isTotal ? '₹ ' : '') + money2(v)
    if (col.type === 'num') return v === '' || v == null ? '' : num(v)
    return v
  }

  return (
    <div>
      <PageTitle title={tr("Reports")} subtitle="Generate, view and export reports for all temple activities." />

      {/* Report Categories */}
      <div className="text-[0.9375rem] font-bold text-maroon-800 mb-3"><T>Report Categories</T></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
        {cats.map((c) => {
          const cfg = CAT_ICON[c.key] || CAT_ICON.pooja; const Icon = cfg.icon; const on = category === c.key
          return (
            <button key={c.key} onClick={() => pickReport(c.reports[0], c.key)}
              className={`bg-white rounded-xl border p-4 text-center transition-colors ${on ? 'border-maroon-400 ring-1 ring-maroon-200' : 'border-gray-100 hover:border-maroon-200'}`}>
              <div className={`w-12 h-12 rounded-full grid place-items-center mx-auto ${cfg.bg}`} style={{ color: cfg.color }}><Icon size={22} /></div>
              <div className="text-[0.78125rem] font-semibold text-gray-700 mt-2 leading-tight">{c.label}</div>
            </button>
          )
        })}
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-5 mb-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Date Range</T></label>
          <div className="flex items-center gap-1.5">
            <DateField value={start} onChange={(e) => setStart(e.target.value)} className="input !px-2.5 text-[0.78125rem]" />
            <span className="text-gray-400">–</span>
            <DateField value={end} onChange={(e) => setEnd(e.target.value)} className="input !px-2.5 text-[0.78125rem]" />
          </div>
        </div>
        <div>
          <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Report Category</T></label>
          <Select value={category} onChange={(e) => { const k = e.target.value; setCategory(k); const rp = cats.find((c) => c.key === k)?.reports[0]; if (rp) setReport(rp) }} className="input">
            {cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Report Name</T></label>
          <Select value={report} onChange={(e) => setReport(e.target.value)} className="input">
            {reportsInCat.map((r) => <option key={r}>{r}</option>)}
          </Select>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={reset} className="btn-outline !py-2.5"><RotateCcw size={14} />{' '}<T>Reset</T></button>
          <button onClick={() => generate()} className="btn-maroon !py-2.5"><Search size={14} />{' '}<T>Generate Report</T></button>
        </div>
      </div>

      {/* Reports list + result */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 h-max">
          <div className="font-serif text-lg font-bold text-maroon-800 mb-3"><T>Reports List</T></div>
          <div className="relative mb-3"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={rq} onChange={(e) => setRq(e.target.value)} placeholder={tr("Search reports…")} className="input !pl-9" /></div>
          <div className="space-y-0.5">
            {filteredList.map((r) => (
              <button key={r.name} onClick={() => pickReport(r.name, r.category)}
                className={`w-full text-left px-3 py-2 rounded-lg text-[0.8125rem] transition-colors ${report === r.name ? 'bg-maroon-50 text-maroon-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}>
                {r.name}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" id="print-area">
          <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100">
            <div>
              <h3 className="font-serif text-lg font-bold text-maroon-800">{result?.title || 'Select a report'}</h3>
              {result?.subtitle && <p className="text-[0.8125rem] text-gray-500 mt-0.5">{result.subtitle}</p>}
            </div>
            <div className="flex gap-2 no-print">
              <button onClick={() => exportReportToPdf(result)} disabled={!result?.rows?.length} className="btn-outline !py-2 text-red-600 border-red-200 disabled:opacity-60"><FileText size={15} />{' '}<T>Export PDF</T></button>
              <button onClick={exportExcel} disabled={exporting} className="btn-outline !py-2 text-emerald-700 border-emerald-200 disabled:opacity-60"><FileSpreadsheet size={15} /> {exporting ? 'Exporting…' : 'Export Excel'}</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
                {(result?.columns || []).map((c) => <th key={c.key} className={`px-5 py-3 font-semibold whitespace-nowrap ${c.type !== 'text' ? 'text-right' : ''}`}>{c.label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {loading && <tr><td colSpan={(result?.columns.length) || 1} className="px-5 py-12 text-center text-gray-400 text-sm"><T>Loading…</T></td></tr>}
                {!loading && loadErr && (
                  <tr><td colSpan={(result?.columns.length) || 1} className="px-5 py-12 text-center">
                    <div className="text-sm text-red-600 mb-3">{loadErr}</div>
                    <button onClick={() => generate()} className="btn-outline !py-1.5 mx-auto"><Search size={14} />{' '}<T>Retry</T></button>
                  </td></tr>
                )}
                {!loading && !loadErr && (result?.rows || []).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50/60">
                    {result.columns.map((c) => <td key={c.key} className={`px-5 py-3 ${c.type !== 'text' ? 'text-right tabular-nums text-gray-700' : 'text-gray-700'} ${c.key === result.columns[0].key ? 'font-medium text-gray-800' : ''}`}>{cell(c, row)}</td>)}
                  </tr>
                ))}
                {!loading && !loadErr && result?.total && (
                  <tr className="bg-amber-50/60 font-bold text-gray-800">
                    {result.columns.map((c) => <td key={c.key} className={`px-5 py-3 ${c.type !== 'text' ? 'text-right tabular-nums' : ''}`}>{cell(c, result.total, true)}</td>)}
                  </tr>
                )}
                {!loading && !loadErr && result && result.rows.length === 0 && <tr><td colSpan={result.columns.length} className="px-5 py-12 text-center text-gray-400"><T>No records for the selected period.</T></td></tr>}
                {!loading && !loadErr && !result && <tr><td className="px-5 py-12 text-center text-gray-400"><T>Choose a report and click Generate Report.</T></td></tr>}
              </tbody>
            </table>
          </div>
          {result && <div className="px-5 py-3.5 border-t border-gray-100 text-[0.8125rem] text-gray-500">Showing 1 to {result.rows.length} of {result.rows.length} records</div>}
        </div>
      </div>
    </div>
  )
}
