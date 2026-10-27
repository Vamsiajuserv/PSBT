import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Coins, Save, Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { PageTitle, Section, fmtDate, fmtStamp } from '../../components/admin/ui.jsx'
import { MetalRatesAPI, getErrorMessage } from '../../api/client.js'
import { DateField, NumberField } from '../../components/common/Field.jsx'
import { toast } from '../../components/common/Dialog.jsx'
import { T, tr, staffName } from '../../i18n/LanguageContext.jsx'
import { pct, useMetalDay } from '../../lib/metal.js'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const rupee = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')
const METALS = [['Gold', '24K'], ['Silver', '999']]

// Gold & Silver Rate (Administrator): the day's rate per gram, used to value gold and silver
// at the counter and in hundi counts. A day without a rate blocks gold / silver receipts.
export default function MetalRates() {
  const todayRates = useMetalDay()
  const [form, setForm] = useState({ rate_date: today(), Gold: '', Silver: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState([])
  const [pur, setPur] = useState(null)

  const loadHistory = useCallback(() => MetalRatesAPI.history(90).then((d) => setHistory(d.items || [])).catch(() => setHistory([])), [])
  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => { if (todayRates.purities && !pur) setPur(JSON.parse(JSON.stringify(todayRates.purities))) }, [todayRates.purities, pur])

  const byDay = useMemo(() => {
    const m = new Map()
    for (const r of history) { if (!m.has(r.rate_date)) m.set(r.rate_date, {}); m.get(r.rate_date)[r.metal] = r }
    return [...m.entries()]
  }, [history])

  async function save(e) {
    e.preventDefault()
    const todo = METALS.filter(([m]) => form[m] !== '' && Number(form[m]) > 0)
    if (!todo.length) { toast(tr('Enter the gold or silver rate.'), 'error'); return }
    setSaving(true)
    try {
      for (const [m] of todo) await MetalRatesAPI.setRate({ rate_date: form.rate_date, metal: m, rate_per_g: Number(form[m]), note: form.note.trim() || null })
      toast(`${tr('Rate saved for')} ${fmtDate(form.rate_date)}.`)
      setForm((f) => ({ ...f, Gold: '', Silver: '', note: '' }))
      todayRates.reload(); loadHistory()
    } catch (ex) { toast(errText(ex, 'Could not save the rate.'), 'error') } finally { setSaving(false) }
  }

  async function savePurities() {
    try {
      const body = Object.fromEntries(METALS.map(([m]) => [m, pur[m].map((p) => ({ label: p.label.trim(), factor: Number(p.factor) }))]))
      const d = await MetalRatesAPI.setPurities(body)
      setPur(d.purities); todayRates.reload(); toast(tr('Purity table saved.'))
    } catch (ex) { toast(errText(ex, 'Could not save the purity table.'), 'error') }
  }
  const setP = (m, i, patch) => setPur((x) => ({ ...x, [m]: x[m].map((p, j) => (j === i ? { ...p, ...patch } : p)) }))

  return (
    <div>
      <PageTitle title={tr('Gold & Silver Rate')} subtitle={tr('Enter the day\'s rate per gram. Gold and silver at the counter and in hundi counts are valued at it: grams × rate × purity.')} />

      {/* Today */}
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        {METALS.map(([m, basis]) => {
          const r = todayRates.rates?.[m]
          return (
            <div key={m} className={`rounded-xl border p-5 bg-white shadow-sm ${r ? 'border-gray-100' : 'border-red-200'}`}>
              <div className="flex items-center gap-2 text-[0.75rem] font-semibold uppercase tracking-wide text-gray-500"><Coins size={15} className={m === 'Gold' ? 'text-amber-500' : 'text-gray-400'} />{tr(m)} {basis} · {tr('Today')}</div>
              {r ? (<>
                <div className="text-2xl font-extrabold text-gray-800 mt-1 tabular-nums">{rupee(r.rate_per_g)}<span className="text-sm font-semibold text-gray-500"> / {tr('gram')}</span></div>
                <div className="text-[0.75rem] text-emerald-700 mt-1"><CheckCircle2 size={13} className="inline mr-1" />{staffName(r.entered_by || '')} · {fmtStamp(r.entered_at)}</div>
              </>) : (
                <div className="text-[0.8125rem] text-red-700 mt-2"><AlertTriangle size={14} className="inline mr-1" />{tr('Not entered yet — gold / silver receipts and hundi counts are blocked until it is.')}</div>
              )}
            </div>)
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Section title={tr('Enter rate')}>
          <form onSubmit={save} className="space-y-4">
            <div><label className="label"><T>Date *</T></label>
              <DateField required value={form.rate_date} max={today()} onChange={(e) => setForm({ ...form, rate_date: e.target.value > today() ? today() : e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              {METALS.map(([m, basis]) => (
                <div key={m}><label className="label">{tr(m)} {basis} (₹ / {tr('gram')})</label>
                  <NumberField min="1" max="10000000" step="0.01" prefix="₹" value={form[m]} onChange={(e) => setForm({ ...form, [m]: e.target.value })} /></div>))}
            </div>
            <div><label className="label"><T>Note</T></label>
              <input className="input" maxLength={200} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={tr('e.g. Hyderabad market rate, 10 AM')} /></div>
            <div className="text-[0.75rem] text-gray-500">{tr('Entering a rate again for the same day corrects it. Receipts already made keep the rate they used.')}</div>
            <button disabled={saving} className="btn-maroon !py-2.5 disabled:opacity-60"><Save size={15} />{' '}{saving ? tr('Saving…') : tr('Save rate')}</button>
          </form>
        </Section>

        <Section title={tr('Purity table')}>
          {pur ? (
            <div className="space-y-4">
              {METALS.map(([m, basis]) => (
                <div key={m}>
                  <div className="text-[0.8125rem] font-semibold text-gray-700 mb-2">{tr(m)} — {tr('value as a part of the')} {basis} {tr('rate')}</div>
                  <div className="space-y-2">
                    {pur[m].map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input className="input !py-1.5 w-24" maxLength={10} value={p.label} onChange={(e) => setP(m, i, { label: e.target.value })} />
                        <NumberField min="0.01" max="1" step="0.001" className="!py-1.5 w-28" value={p.factor} onChange={(e) => setP(m, i, { factor: e.target.value })} />
                        <span className="text-[0.75rem] text-gray-500 w-16">{Number(p.factor) > 0 ? pct(p.factor) : ''}</span>
                        <button type="button" onClick={() => setPur((x) => ({ ...x, [m]: x[m].filter((_, j) => j !== i) }))} disabled={pur[m].length <= 1}
                          className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-600 hover:text-red-600 disabled:opacity-40" aria-label={tr('Remove')}><Trash2 size={14} /></button>
                      </div>))}
                  </div>
                  <button type="button" onClick={() => setPur((x) => ({ ...x, [m]: [...x[m], { label: '', factor: '' }] }))} className="mt-2 inline-flex items-center gap-1 text-[0.75rem] font-semibold text-maroon-700"><Plus size={13} />{tr('Add purity')}</button>
                </div>))}
              <button type="button" onClick={savePurities} className="btn-outline !py-2"><Save size={14} />{' '}<T>Save purity table</T></button>
            </div>
          ) : <div className="text-[0.8125rem] text-gray-400">{tr('Loading…')}</div>}
        </Section>
      </div>

      <Section title={tr('Rate history')} className="mt-5" bodyClass="p-0">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
            {[tr('Date'), `${tr('Gold')} 24K`, `${tr('Silver')} 999`, tr('Entered by')].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {byDay.map(([d, r]) => (
              <tr key={d}>
                <td className="px-4 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{fmtDate(d)}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.Gold ? rupee(r.Gold.rate_per_g) : '—'}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.Silver ? rupee(r.Silver.rate_per_g) : '—'}</td>
                <td className="px-4 py-2.5 text-[0.8125rem] text-gray-600">{[...new Set([r.Gold?.entered_by, r.Silver?.entered_by].filter(Boolean))].map(staffName).join(', ')}
                  {(r.Gold?.note || r.Silver?.note) && <div className="text-[0.6875rem] text-gray-400">{r.Gold?.note || r.Silver?.note}</div>}</td>
              </tr>))}
            {!byDay.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-[0.8125rem]">{tr('No rates entered yet.')}</td></tr>}
          </tbody></table></div>
      </Section>
    </div>
  )
}
