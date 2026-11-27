import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, AlertTriangle, CheckCircle2, Coins, Search, RotateCcw } from 'lucide-react'
import { PageTitle, Section, Pill, fmtDate, inr } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { Select, DateField } from '../../../components/common/Field.jsx'
import ExportButtons from '../../../components/common/ExportButtons.jsx'
import { T, tr, getLang, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { useTemple } from '../../../lib/SiteContext.jsx'
import { STATUS_TONE, StoresTabs } from './shared.jsx'

const g3 = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return tr(new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' })) + ` ${y}` }

// Valuables Statement: gold and silver in the store for one month, in grams and rupees —
// opening, received, sold / written off, on loan, closing — with the piece list, for the
// Committee and the auditor.
export default function ValuablesStatement() {
  const temple = useTemple()
  const months = useMemo(() => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    return Array.from({ length: 24 }, (_, n) => monthKey(new Date(now.getFullYear(), now.getMonth() - n, 1)))
  }, [])
  const [month, setMonth] = useState(months[0])
  // Period: one month (default) or custom dates — a festival week, the financial year (Apr–Mar)
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const [custom, setCustom] = useState(false)
  const [range, setRange] = useState({ start: `${months[0]}-01`, end: todayIso })
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const monthEndIso = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` }
  const period = custom ? `${fmtDate(range.start)} – ${fmtDate(range.end)}` : monthLabel(month)
  // Filters (on screen, print and export): metal for the whole statement; status, location and
  // search narrow the piece list.
  // Metals and ornament types are read from the data, so a new ornament added in Donation
  // Master (e.g. "Gold Bangle") appears in the filters by itself.
  const NO_FILTER = { metal: '', item: '', state: '', location: '', q: '' }
  const [f, setF] = useState(NO_FILTER)
  const filtered = f.metal || f.item || f.state || f.location || f.q.trim()

  const load = useCallback(() => {
    setErr('')
    if (custom && (!range.start || !range.end)) return
    StoresAPI.valuables(custom ? { start: range.start, end: range.end } : month).then(setData)
      .catch((ex) => { setData(null); setErr(errText(ex, 'Could not load the statement.')) })
  }, [month, custom, range.start, range.end])
  useEffect(() => { load() }, [load])

  const rows = (data?.rows || []).filter((r) => !f.metal || r.metal === f.metal)
  const allPieces = data?.pieces || []
  const metals = (data?.rows || []).map((r) => r.metal)
  const ornaments = [...new Set(allPieces.filter((p) => !f.metal || p.metal === f.metal).map((p) => p.item_name).filter(Boolean))].sort()
  const states = [...new Set(allPieces.map((p) => p.state))].sort()
  const locations = [...new Set(allPieces.map((p) => p.location).filter(Boolean))].sort()
  const needle = f.q.trim().toLowerCase()
  const pieces = allPieces.filter((p) => (!f.metal || p.metal === f.metal) && (!f.item || p.item_name === f.item) && (!f.state || p.state === f.state)
    && (!f.location || p.location === f.location)
    && (!needle || [p.tag_id, p.item_name, p.description, p.donation_code, p.source_ref].some((x) => (x || '').toLowerCase().includes(needle))))
  const totalValue = rows.reduce((n, r) => n + Number(r.value || 0), 0)
  const piecesValue = pieces.reduce((n, p) => n + Number(p.value || 0), 0)
  const narrowed = pieces.length !== allPieces.filter((p) => !f.metal || p.metal === f.metal).length
  const exportCols = [{ key: 'metal', label: tr('Metal'), type: 'text' }, { key: 'opening', label: `${tr('Opening')} (g)`, type: 'num' },
    { key: 'received', label: `${tr('Received')} (g)`, type: 'num' }, { key: 'out', label: `${tr('Sold / Written off')} (g)`, type: 'num' },
    { key: 'on_loan', label: `${tr('On loan')} (g)`, type: 'num' }, { key: 'closing', label: `${tr('Closing')} (g)`, type: 'num' },
    { key: 'value', label: tr('Value (₹)'), type: 'money' }]
  const td = 'px-3 py-2.5 tabular-nums text-right whitespace-nowrap'

  return (
    <div>
      <StoresTabs group="reports" />
      <PageTitle title={tr('Valuables Statement')} subtitle={tr('Gold and silver in the store for the month — in grams and at the month-end rate. For the committee and the auditor.')}
        actions={<span className="inline-flex flex-wrap items-center gap-2 no-print">
          <div role="tablist" aria-label={tr('Period')} className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-[0.8125rem] font-semibold">
            {[[false, 'Month'], [true, 'Custom dates']].map(([c, l]) => (
              <button key={l} type="button" role="tab" aria-selected={custom === c} onClick={() => setCustom(c)}
                className={`px-3 py-1.5 rounded-md ${custom === c ? 'bg-maroon-700 text-white' : 'text-gray-600 hover:text-maroon-700'}`}>{tr(l)}</button>))}
          </div>
          {custom ? <>
            <div className="w-[9.5rem]"><DateField className="input !py-2" value={range.start} max={range.end || todayIso} aria-label={tr('From')}
              onChange={(e) => setRange({ ...range, start: e.target.value })} /></div>
            <span className="text-gray-500 text-[0.8125rem]">–</span>
            <div className="w-[9.5rem]"><DateField className="input !py-2" value={range.end} min={range.start} max={todayIso} aria-label={tr('To')}
              onChange={(e) => setRange({ ...range, end: e.target.value })} /></div>
          </> : <div className="w-[9.5rem]"><Select className="input !py-2" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</Select></div>}
          <ExportButtons title={`${tr('Valuables Statement')} — ${period}${f.metal ? ` — ${tr(f.metal)}` : ''}`} columns={exportCols} rows={rows.map((r) => ({ ...r, metal: tr(r.metal) }))}
            screen="Valuables Statement" start={custom ? range.start : `${month}-01`} end={custom ? range.end : monthEndIso(month)} filters={[['Metal', f.metal]]} />
          <button onClick={() => window.print()} disabled={!data} className="btn-outline !py-2.5 disabled:opacity-50"><Printer size={15} />{' '}<T>Print</T></button>
        </span>} />

      {err && <div className="mb-4 flex items-center gap-2 text-[0.8125rem] rounded-lg px-4 py-2.5 border bg-red-50 border-red-200 text-red-700"><AlertTriangle size={15} />{err}</div>}

      {data && (
        <div className="no-print mb-4 bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-end gap-3">
          <div className="w-[9rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Metal</T></label>
            <Select className="input" value={f.metal} onChange={(e) => setF({ ...f, metal: e.target.value, item: '' })}>
              <option value="">{tr('All')}</option>{metals.map((m) => <option key={m} value={m}>{tr(m)}</option>)}</Select></div>
          <div className="w-[13rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Ornament</T></label>
            <Select className="input" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}>
              <option value="">{tr('All ornaments')}</option>{ornaments.map((x) => <option key={x} value={x}>{tr(x)}</option>)}</Select></div>
          <div className="w-[11rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label>
            <Select className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
              <option value="">{tr('All Status')}</option>{states.map((x) => <option key={x} value={x}>{tr(x)}</option>)}</Select></div>
          <div className="w-[12rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Location</T></label>
            <Select className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })}>
              <option value="">{tr('All locations')}</option>{locations.map((x) => <option key={x} value={x}>{tr(x)}</option>)}</Select></div>
          <div className="flex-[1_1_14rem] min-w-[12rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input !pl-9" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder={tr('Tag ID, item or donation no.')} /></div></div>
          <button type="button" disabled={!filtered} onClick={() => setF(NO_FILTER)} className="btn-outline !py-2.5 disabled:opacity-50"><RotateCcw size={14} />{' '}<T>Clear</T></button>
        </div>
      )}

      {data && (
        <div id="print-area" className="space-y-4">
          <div className="hidden print:block text-center">
            <div className="font-serif text-lg font-bold text-maroon-800">{getLang() === 'te' ? (temple?.nameTelugu || 'శ్రీ షిర్డీ సాయిబాబా దేవస్థానం') : (temple?.name || 'Shri Shirdi Sai Baba Temple')}</div>
            <div className="font-semibold">{tr('Valuables Statement')} — {data.custom ? `${fmtDate(data.start)} – ${fmtDate(data.end)}` : monthLabel(data.month)}{f.metal ? ` — ${tr(f.metal)}` : ''}</div>
            <div className="text-[0.8125rem]">{fmtDate(data.start)} – {fmtDate(data.end)}</div>
          </div>

          <div className="text-[0.8125rem] bg-amber-50/70 border border-amber-200 rounded-lg px-4 py-2.5 text-gray-700">
            <Coins size={15} className="inline mr-1.5 text-amber-600" />
            {tr('Rate used')}: {rows.map((r, n) => <span key={r.metal}>{n ? ' · ' : ''}{tr(r.metal)} {r.basis} {r.rate ? <><b>₹{Number(r.rate.rate_per_g).toLocaleString('en-IN')}/{tr('g')}</b> ({fmtDate(r.rate.date)})</> : <span className="text-red-700">{tr('no rate entered')}</span>}</span>)}
            <span className="text-gray-500"> · {tr('up to')} {fmtDate(data.end)}</span>
          </div>

          <Section title={tr('Summary (grams)')} bodyClass="p-0">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="bg-gray-50/70 text-[0.6875rem] uppercase tracking-wide text-gray-700">
                <th className="px-3 py-3 font-semibold text-left">{tr('Metal')}</th>
                {['Opening', 'Received', 'Sold / Written off', 'On loan (issued)', 'Closing', 'Pieces', 'Value (closing)'].map((h) => <th key={h} className="px-3 py-3 font-semibold text-right">{tr(h)}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.metal}>
                    <td className="px-3 py-2.5 font-semibold text-gray-800">{tr(r.metal)}
                      {!r.balanced && <div className="text-[0.6875rem] text-red-700"><AlertTriangle size={11} className="inline mr-0.5" />{tr('Does not balance — check Item Tracker')}</div>}</td>
                    <td className={td}>{g3(r.opening)} {gramUnit()}</td>
                    <td className={`${td} text-emerald-700`}>{r.received ? `+${g3(r.received)}` : '0'} {gramUnit()}</td>
                    <td className={`${td} text-red-600`}>{r.out ? `−${g3(r.out)}` : '0'} {gramUnit()}</td>
                    <td className={td}>{g3(r.on_loan)} {gramUnit()}</td>
                    <td className={`${td} font-bold`}>{g3(r.closing)} {gramUnit()}</td>
                    <td className={td}>{r.pieces}</td>
                    <td className={`${td} font-bold text-maroon-800`}>{inr(r.value)}
                      {r.unvalued > 0 && <div className="text-[0.6875rem] font-normal text-amber-700">{r.unvalued} {tr('piece(s) without a value')}</div>}</td>
                  </tr>))}
                <tr className="bg-gray-50/70"><td colSpan={7} className="px-3 py-2.5 text-right font-semibold">{tr('Total value')}{f.metal ? ` (${tr(f.metal)})` : ''}</td>
                  <td className={`${td} font-extrabold text-maroon-800`}>{inr(totalValue)}</td></tr>
              </tbody></table></div>
            <div className="px-4 py-2.5 text-[0.75rem] text-gray-500 border-t border-gray-100 flex items-center gap-1.5">
              {rows.every((r) => r.balanced) ? <CheckCircle2 size={13} className="text-emerald-600" /> : <AlertTriangle size={13} className="text-red-600" />}
              {tr('Opening + Received − Sold / Written off = Closing. On loan is part of Closing.')}</div>
          </Section>

          <Section title={`${tr(data.custom ? 'Pieces at the end of the period' : 'Pieces at month end')} (${narrowed ? `${pieces.length} ${tr('of')} ${allPieces.filter((p) => !f.metal || p.metal === f.metal).length}` : pieces.length})`} bodyClass="p-0">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
                {/* no Purity column (client, 2026-11-20) */}
                {['ID', 'Item', 'Weight', 'Location', 'Status', 'Value'].map((h) => <th key={h} className={`px-3 py-3 font-semibold ${['Weight', 'Value'].includes(h) ? 'text-right' : ''}`}>{tr(h)}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {pieces.map((p) => (
                  <tr key={p.tag_id}>
                    <td className="px-3 py-2 font-mono text-[0.78rem] font-semibold"><Link to={`/admin/stores/item/${p.tag_id}`} className="text-maroon-700 hover:underline">{p.tag_id}</Link></td>
                    <td className="px-3 py-2">{tr(p.description || p.item_name)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{g3(p.weight_g)} {gramUnit()}</td>
                    <td className="px-3 py-2 text-gray-600">{tr(p.location || '—')}</td>
                    <td className="px-3 py-2"><Pill tone={STATUS_TONE[p.state] || 'gray'}>{tr(p.state)}</Pill></td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{p.value != null ? inr(p.value) : '—'}
                      {p.value_basis === 'piece' && <div className="text-[0.6875rem] text-gray-500">{tr('piece value')}</div>}</td>
                  </tr>))}
                {narrowed && pieces.length > 0 && <tr className="bg-gray-50/70"><td colSpan={5} className="px-3 py-2.5 text-right font-semibold">{tr('Value of these pieces')}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-maroon-800 whitespace-nowrap">{inr(piecesValue)}</td></tr>}
                {!pieces.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400 text-[0.8125rem]">{allPieces.length ? tr('No pieces match the filters.') : tr(data.custom ? 'No gold or silver in the store at the end of this period.' : 'No gold or silver in the store at the end of this month.')}</td></tr>}
              </tbody></table></div>
          </Section>

          <div className="grid grid-cols-3 gap-6 pt-10 text-center text-[0.75rem] text-gray-600">
            {['Stores Officer', 'Committee', 'Accountant'].map((r) => <div key={r} className="border-t border-gray-400 pt-1">{tr(r)} ({tr('signature')})</div>)}
          </div>
        </div>
      )}
      {!data && !err && <div className="text-[0.8125rem] text-gray-500">{tr('Loading…')}</div>}
    </div>
  )
}
