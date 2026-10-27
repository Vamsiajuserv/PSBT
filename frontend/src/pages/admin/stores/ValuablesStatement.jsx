import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, AlertTriangle, CheckCircle2, Coins } from 'lucide-react'
import { PageTitle, Section, Pill, fmtDate, inr } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { Select } from '../../../components/common/Field.jsx'
import ExportButtons from '../../../components/common/ExportButtons.jsx'
import { T, tr, getLang, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { useTemple } from '../../../lib/SiteContext.jsx'
import { STATUS_TONE } from './shared.jsx'

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
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    setErr('')
    StoresAPI.valuables(month).then(setData).catch((ex) => { setData(null); setErr(errText(ex, 'Could not load the statement.')) })
  }, [month])
  useEffect(() => { load() }, [load])

  const rows = data?.rows || []
  const exportCols = [{ key: 'metal', label: tr('Metal'), type: 'text' }, { key: 'opening', label: `${tr('Opening')} (g)`, type: 'num' },
    { key: 'received', label: `${tr('Received')} (g)`, type: 'num' }, { key: 'out', label: `${tr('Sold / Written off')} (g)`, type: 'num' },
    { key: 'on_loan', label: `${tr('On loan')} (g)`, type: 'num' }, { key: 'closing', label: `${tr('Closing')} (g)`, type: 'num' },
    { key: 'value', label: tr('Value (₹)'), type: 'money' }]
  const td = 'px-3 py-2.5 tabular-nums text-right whitespace-nowrap'

  return (
    <div>
      <PageTitle title={tr('Valuables Statement')} subtitle={tr('Gold and silver in the store for the month — in grams and at the month-end rate. For the committee and the auditor.')}
        actions={<span className="inline-flex flex-wrap items-center gap-2 no-print">
          <div className="w-[9.5rem]"><Select className="input !py-2" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</Select></div>
          <ExportButtons title={`${tr('Valuables Statement')} — ${monthLabel(month)}`} columns={exportCols} rows={rows.map((r) => ({ ...r, metal: tr(r.metal) }))} />
          <button onClick={() => window.print()} disabled={!data} className="btn-outline !py-2.5 disabled:opacity-50"><Printer size={15} />{' '}<T>Print</T></button>
        </span>} />

      {err && <div className="mb-4 flex items-center gap-2 text-[0.8125rem] rounded-lg px-4 py-2.5 border bg-red-50 border-red-200 text-red-700"><AlertTriangle size={15} />{err}</div>}

      {data && (
        <div id="print-area" className="space-y-4">
          <div className="hidden print:block text-center">
            <div className="font-serif text-lg font-bold text-maroon-800">{getLang() === 'te' ? (temple?.nameTelugu || 'శ్రీ షిర్డీ సాయిబాబా దేవస్థానం') : (temple?.name || 'Shri Shirdi Sai Baba Temple')}</div>
            <div className="font-semibold">{tr('Valuables Statement')} — {monthLabel(data.month)}</div>
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
                      {!r.balanced && <div className="text-[0.6875rem] text-red-700"><AlertTriangle size={11} className="inline mr-0.5" />{tr('Does not balance — check Item History')}</div>}</td>
                    <td className={td}>{g3(r.opening)} {gramUnit()}</td>
                    <td className={`${td} text-emerald-700`}>{r.received ? `+${g3(r.received)}` : '0'} {gramUnit()}</td>
                    <td className={`${td} text-red-600`}>{r.out ? `−${g3(r.out)}` : '0'} {gramUnit()}</td>
                    <td className={td}>{g3(r.on_loan)} {gramUnit()}</td>
                    <td className={`${td} font-bold`}>{g3(r.closing)} {gramUnit()}</td>
                    <td className={td}>{r.pieces}</td>
                    <td className={`${td} font-bold text-maroon-800`}>{inr(r.value)}
                      {r.unvalued > 0 && <div className="text-[0.6875rem] font-normal text-amber-700">{r.unvalued} {tr('piece(s) without a value')}</div>}</td>
                  </tr>))}
                <tr className="bg-gray-50/70"><td colSpan={7} className="px-3 py-2.5 text-right font-semibold">{tr('Total value')}</td>
                  <td className={`${td} font-extrabold text-maroon-800`}>{inr(data.total_value)}</td></tr>
              </tbody></table></div>
            <div className="px-4 py-2.5 text-[0.75rem] text-gray-500 border-t border-gray-100 flex items-center gap-1.5">
              {rows.every((r) => r.balanced) ? <CheckCircle2 size={13} className="text-emerald-600" /> : <AlertTriangle size={13} className="text-red-600" />}
              {tr('Opening + Received − Sold / Written off = Closing. On loan is part of Closing. Value = grams × rate × purity.')}</div>
          </Section>

          <Section title={`${tr('Pieces at month end')} (${data.pieces.length})`} bodyClass="p-0">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
                {['ID', 'Item', 'Weight', 'Purity', 'Location', 'Status', 'Value'].map((h) => <th key={h} className={`px-3 py-3 font-semibold ${['Weight', 'Value'].includes(h) ? 'text-right' : ''}`}>{tr(h)}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.pieces.map((p) => (
                  <tr key={p.tag_id}>
                    <td className="px-3 py-2 font-mono text-[0.78rem] font-semibold"><Link to={`/admin/stores/item/${p.tag_id}`} className="text-maroon-700 hover:underline">{p.tag_id}</Link></td>
                    <td className="px-3 py-2">{tr(p.description || p.item_name)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{g3(p.weight_g)} {gramUnit()}</td>
                    <td className="px-3 py-2">{p.purity || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{tr(p.location || '—')}</td>
                    <td className="px-3 py-2"><Pill tone={STATUS_TONE[p.state] || 'gray'}>{tr(p.state)}</Pill></td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{p.value != null ? inr(p.value) : '—'}
                      {p.value_basis === 'piece' && <div className="text-[0.6875rem] text-gray-500">{tr('piece value')}</div>}</td>
                  </tr>))}
                {!data.pieces.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400 text-[0.8125rem]">{tr('No gold or silver in the store at the end of this month.')}</td></tr>}
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
