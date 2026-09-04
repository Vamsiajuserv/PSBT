import React, { useEffect, useMemo, useState } from 'react'
import {
  Search, RotateCcw, FileText, FileSpreadsheet, Flame, HandCoins,
  Wallet, FileBarChart, CalendarCheck, CalendarDays,
  ArrowUp, ArrowDown, X,
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
const thisWeekStart = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10) }
const money2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// 4 consolidated categories
const CAT_ICON = {
  pooja: { icon: Flame, color: '#8a1c1c', bg: 'bg-maroon-50', desc: 'Bookings, schedules, poojari performance' },
  donation: { icon: HandCoins, color: '#059669', bg: 'bg-emerald-50', desc: 'Donations, annadanam, 80G certificates' },
  collection: { icon: Wallet, color: '#d97706', bg: 'bg-amber-50', desc: 'Hundi, auction, waste sales' },
  general: { icon: FileBarChart, color: '#2563eb', bg: 'bg-blue-50', desc: 'Consolidated summaries, trends' },
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
  const [sorts, setSorts] = useState([]) // [{key, direction: 'asc'|'desc'}]

  // ── Sorting helpers ──
  const handleColumnClick = (colKey, e) => {
    setSorts((prev) => {
      const idx = prev.findIndex((s) => s.key === colKey)
      if (e.shiftKey) {
        // Shift+Click: add or toggle secondary sort
        if (idx >= 0) {
          // Toggle direction
          return prev.map((s, i) => i === idx ? { ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' } : s)
        }
        // Add as new sort
        return [...prev, { key: colKey, direction: 'desc' }]
      }
      // Regular click: single column sort or toggle
      if (idx === 0 && prev.length === 1) {
        // Toggle direction if already primary
        return [{ key: colKey, direction: prev[0].direction === 'asc' ? 'desc' : 'asc' }]
      }
      // Set as primary sort
      return [{ key: colKey, direction: 'desc' }]
    })
  }

  const removeSort = (colKey) => setSorts((prev) => prev.filter((s) => s.key !== colKey))
  const clearSorts = () => setSorts([])

  const getSortIndex = (colKey) => sorts.findIndex((s) => s.key === colKey)
  const getSortDirection = (colKey) => sorts.find((s) => s.key === colKey)?.direction

  // Smart sorting based on column type
  const parseValue = (val, colType) => {
    if (val == null || val === '' || val === '—') return null
    if (colType === 'money' || colType === 'num') {
      const n = typeof val === 'string' ? parseFloat(val.replace(/[₹,\s]/g, '')) : val
      return isNaN(n) ? null : n
    }
    if (colType === 'text') {
      // Try to parse as date (formats: "01 Sept 2026", "2026-09-01", etc.)
      const dateMatch = String(val).match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
      if (dateMatch) {
        const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 }
        const m = months[dateMatch[2].toLowerCase().slice(0, 3)]
        if (m !== undefined) return new Date(dateMatch[3], m, dateMatch[1]).getTime()
      }
      const d = Date.parse(val)
      if (!isNaN(d)) return d
      return String(val).toLowerCase()
    }
    return String(val).toLowerCase()
  }

  const sortedRows = useMemo(() => {
    if (!result?.rows || sorts.length === 0) return result?.rows || []
    const colMap = Object.fromEntries((result.columns || []).map((c) => [c.key, c.type]))
    return [...result.rows].sort((a, b) => {
      for (const { key, direction } of sorts) {
        const colType = colMap[key] || 'text'
        const aVal = parseValue(a[key], colType)
        const bVal = parseValue(b[key], colType)
        // Handle nulls
        if (aVal === null && bVal === null) continue
        if (aVal === null) return direction === 'asc' ? 1 : -1
        if (bVal === null) return direction === 'asc' ? -1 : 1
        // Compare
        let cmp = 0
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          cmp = aVal - bVal
        } else {
          cmp = String(aVal).localeCompare(String(bVal))
        }
        if (cmp !== 0) return direction === 'asc' ? cmp : -cmp
      }
      return 0
    })
  }, [result?.rows, result?.columns, sorts])

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

  async function generate(rep = report, s = start, e = end) {
    if (!rep) { setLoadErr('Please select a report.'); return }
    setLoading(true); setLoadErr(''); setResult(null)
    try {
      const out = await ReportsAPI.generate({ report: rep, start: s, end: e })
      if (!out || !out.columns) {
        setLoadErr('Invalid response from server.')
      } else {
        setResult(out); setLoadErr('')
        // Default sort: first column (usually date) in descending order (today first)
        if (out.columns?.length > 0) {
          setSorts([{ key: out.columns[0].key, direction: 'desc' }])
        }
      }
    } catch (ex) {
      console.error('Report generation failed:', ex)
      setLoadErr(ex?.detail || ex?.message || LOAD_ERROR)
    } finally { setLoading(false) }
  }

  function setToday() { const t = today(); setStart(t); setEnd(t) }
  useEffect(() => { if (report) generate(report, start, end) }, [report]) // eslint-disable-line

  function pickReport(name, cat) { setCategory(cat); setReport(name); setSorts([]) }
  function reset() { setStart(firstOfMonth()); setEnd(today()); setRq(''); setSorts([]); if (cats[0]) { setCategory(cats[0].key); setReport(cats[0].reports[0]) } }

  const [exporting, setExporting] = useState(false)
  async function exportExcel() {
    if (!result || exporting) return
    setExporting(true)
    try { await exportReportToExcel(result) } finally { setExporting(false) }
  }

  // Server-formatted dates ('01 Jul 2026') carry an English month; the word
  // translates, the numerals stay.
  const localiseDate = (v) => (typeof v === 'string' ? v.replace(/\b[A-Za-z]{3,}\b/g, (w) => tr(w)) : v)
  const cell = (col, row, isTotal) => {
    if (isTotal && row?.[col.key] === 'Total') return tr('Total')
    const v = row[col.key]
    if (col.type === 'money') return (isTotal ? '₹ ' : '') + money2(v)
    if (col.type === 'text') return localiseDate(v)
    if (col.type === 'num') return v === '' || v == null ? '' : num(v)
    return v
  }

  return (
    <div>
      <PageTitle title={tr("Reports")} subtitle={tr("Generate, view and export reports for all temple activities.")} />

      {/* Report Categories - 4 consolidated categories */}
      <div className="text-[0.9375rem] font-bold text-maroon-800 mb-3"><T>Report Categories</T></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {cats.map((c) => {
          const cfg = CAT_ICON[c.key] || CAT_ICON.pooja; const Icon = cfg.icon; const on = category === c.key
          return (
            <button key={c.key} onClick={() => pickReport(c.reports[0], c.key)}
              className={`bg-white rounded-xl border p-4 text-left transition-all ${on ? 'border-maroon-400 ring-2 ring-maroon-100 shadow-sm' : 'border-gray-100 hover:border-maroon-200 hover:shadow-sm'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-lg grid place-items-center shrink-0 ${cfg.bg}`} style={{ color: cfg.color }}><Icon size={20} /></div>
                <div className="min-w-0">
                  <div className="text-[0.875rem] font-semibold text-gray-800 leading-tight">{tr(c.label)}</div>
                  <div className="text-[0.6875rem] text-gray-500 leading-tight">{c.reports.length} {tr('reports')}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Filter bar with quick presets */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-5 mb-5">
        {/* Quick date presets */}
        <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-gray-100">
          <span className="text-[0.75rem] text-gray-500 font-medium mr-1"><T>Quick Select</T>:</span>
          <button onClick={setToday} className="h-7 px-3 rounded-md border border-gray-200 bg-white text-[0.75rem] font-medium text-gray-600 hover:bg-maroon-50 hover:text-maroon-700 hover:border-maroon-200 transition-colors"><T>Today</T></button>
          <button onClick={() => { setStart(thisWeekStart()); setEnd(today()) }} className="h-7 px-3 rounded-md border border-gray-200 bg-white text-[0.75rem] font-medium text-gray-600 hover:bg-maroon-50 hover:text-maroon-700 hover:border-maroon-200 transition-colors"><T>This Week</T></button>
          <button onClick={() => { setStart(firstOfMonth()); setEnd(today()) }} className="h-7 px-3 rounded-md border border-gray-200 bg-white text-[0.75rem] font-medium text-gray-600 hover:bg-maroon-50 hover:text-maroon-700 hover:border-maroon-200 transition-colors"><T>This Month</T></button>
          <button onClick={() => { const d = new Date(); d.setMonth(d.getMonth() - 1); setStart(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0); setEnd(lastDay.toISOString().slice(0, 10)) }} className="h-7 px-3 rounded-md border border-gray-200 bg-white text-[0.75rem] font-medium text-gray-600 hover:bg-maroon-50 hover:text-maroon-700 hover:border-maroon-200 transition-colors"><T>Last Month</T></button>
          <button onClick={() => { const d = new Date(); setStart(`${d.getFullYear()}-01-01`); setEnd(today()) }} className="h-7 px-3 rounded-md border border-gray-200 bg-white text-[0.75rem] font-medium text-gray-600 hover:bg-maroon-50 hover:text-maroon-700 hover:border-maroon-200 transition-colors"><T>This Year</T></button>
        </div>

        {/* Main filters */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[7rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>From</T></label>
            <DateField value={start} onChange={(e) => setStart(e.target.value)} className="input" />
          </div>
          <div className="min-w-[7rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
            <DateField value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
          </div>
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Report Category</T></label>
            <Select value={category} onChange={(e) => { const k = e.target.value; setCategory(k); const rp = cats.find((c) => c.key === k)?.reports[0]; if (rp) setReport(rp) }} className="input">
              {cats.map((c) => <option key={c.key} value={c.key}>{tr(c.label)}</option>)}
            </Select>
          </div>
          <div className="flex-1 min-w-[16rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Report Name</T></label>
            <Select value={report} onChange={(e) => setReport(e.target.value)} className="input">
              {reportsInCat.map((r) => <option key={r}>{r}</option>)}
            </Select>
          </div>
          <div className="flex gap-2">
            <button onClick={reset} className="btn-outline !py-2 !px-3 !text-[0.8125rem]"><RotateCcw size={14} />{' '}<T>Reset</T></button>
            <button onClick={() => generate(report, start, end)} className="btn-maroon !py-2 !px-3 !text-[0.8125rem]"><Search size={14} />{' '}<T>Generate</T></button>
          </div>
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
                {tr(r.name)}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" id="print-area">
          <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100">
            <div>
              <h3 className="font-serif text-lg font-bold text-maroon-800">{result?.title ? tr(result.title) : tr('Select a report')}</h3>
              {result?.subtitle && <p className="text-[0.8125rem] text-gray-500 mt-0.5">{tr(result.subtitle)}</p>}
            </div>
            <div className="flex gap-2 no-print">
              <button onClick={() => exportReportToPdf(result)} disabled={!result?.rows?.length} className="btn-outline !py-2 text-red-600 border-red-200 disabled:opacity-60"><FileText size={15} />{' '}<T>Export PDF</T></button>
              <button onClick={exportExcel} disabled={exporting} className="btn-outline !py-2 text-emerald-700 border-emerald-200 disabled:opacity-60"><FileSpreadsheet size={15} /> {exporting ? tr('Exporting…') : tr('Export Excel')}</button>
            </div>
          </div>
          {/* Sort Panel */}
          {sorts.length > 0 && (
            <div className="px-5 py-3 bg-blue-50/50 border-b border-blue-100 flex flex-wrap items-center gap-2">
              <span className="text-[0.75rem] text-gray-500 font-medium"><T>Sorted by</T>:</span>
              {sorts.map((s, i) => {
                const col = result?.columns?.find((c) => c.key === s.key)
                return (
                  <span key={s.key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-blue-200 text-[0.75rem] font-medium text-blue-700">
                    <span className="w-4 h-4 rounded-full bg-blue-100 text-[0.625rem] font-bold grid place-items-center">{i + 1}</span>
                    {tr(col?.label || s.key)}
                    <button onClick={() => handleColumnClick(s.key, { shiftKey: true })} className="hover:text-blue-900">
                      {s.direction === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                    </button>
                    <button onClick={() => removeSort(s.key)} className="hover:text-red-600 ml-0.5"><X size={12} /></button>
                  </span>
                )
              })}
              <button onClick={clearSorts} className="text-[0.75rem] text-gray-500 hover:text-red-600 ml-2"><T>Clear All</T></button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
                {(result?.columns || []).map((c) => {
                  const sortIdx = getSortIndex(c.key)
                  const sortDir = getSortDirection(c.key)
                  const isSorted = sortIdx >= 0
                  return (
                    <th key={c.key}
                      onClick={(e) => handleColumnClick(c.key, e)}
                      className={`px-5 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${c.type !== 'text' ? 'text-right' : ''} ${isSorted ? 'text-blue-700 bg-blue-50/50' : ''}`}
                      title={tr("Click to sort, Shift+Click to add secondary sort")}>
                      <span className="inline-flex items-center gap-1">
                        {tr(c.label)}
                        {isSorted && (
                          <span className="inline-flex items-center gap-0.5 text-blue-600">
                            {sorts.length > 1 && <span className="text-[0.5625rem] font-bold">{sortIdx + 1}</span>}
                            {sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                          </span>
                        )}
                      </span>
                    </th>
                  )
                })}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {loading && <tr><td colSpan={(result?.columns?.length) || 1} className="px-5 py-12 text-center text-gray-600 text-sm"><T>Loading…</T></td></tr>}
                {!loading && loadErr && (
                  <tr><td colSpan={(result?.columns?.length) || 1} className="px-5 py-12 text-center">
                    <div className="text-sm text-red-600 mb-3">{loadErr}</div>
                    <button onClick={() => generate(report, start, end)} className="btn-outline !py-1.5 mx-auto"><Search size={14} />{' '}<T>Retry</T></button>
                  </td></tr>
                )}
                {!loading && !loadErr && result?.columns?.length > 0 && sortedRows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50/60">
                    {result.columns.map((c) => <td key={c.key} className={`px-5 py-3 ${c.type !== 'text' ? 'text-right tabular-nums text-gray-700' : 'text-gray-700'} ${c.key === result.columns[0].key ? 'font-medium text-gray-800' : ''}`}>{cell(c, row)}</td>)}
                  </tr>
                ))}
                {!loading && !loadErr && result?.columns?.length > 0 && result?.total && (
                  <tr className="bg-amber-50/60 font-bold text-gray-800">
                    {result.columns.map((c) => <td key={c.key} className={`px-5 py-3 ${c.type !== 'text' ? 'text-right tabular-nums' : ''}`}>{cell(c, result.total, true)}</td>)}
                  </tr>
                )}
                {!loading && !loadErr && result && sortedRows.length === 0 && <tr><td colSpan={result.columns?.length || 1} className="px-5 py-12 text-center text-gray-600"><T>No records for the selected period.</T></td></tr>}
                {!loading && !loadErr && !result && <tr><td className="px-5 py-12 text-center text-gray-600"><T>Choose a report and click Generate Report.</T></td></tr>}
              </tbody>
            </table>
          </div>
          {result?.rows && <div className="px-5 py-3.5 border-t border-gray-100 text-[0.8125rem] text-gray-500">{tr('Showing')} 1 {tr('to')} {sortedRows.length} {tr('of')} {sortedRows.length} {tr('records')}{sorts.length > 0 && <span className="text-blue-600 ml-2">• {tr('Sorted')}</span>}</div>}
        </div>
      </div>
    </div>
  )
}
