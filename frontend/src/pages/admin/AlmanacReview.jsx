import React, { useEffect, useMemo, useState } from 'react'
import { Moon, Sparkles, AlertTriangle, ShieldCheck, RefreshCw, CalendarClock, Check, Loader2 } from 'lucide-react'
import { PageTitle, StatTile, KpiGrid, Pill, Section, fmtDate } from '../../components/admin/ui.jsx'
import { AlmanacAPI } from '../../api/client.js'
import { Select, Toggle } from '../../components/common/Field.jsx'
import { toast, confirmDialog, promptDialog } from '../../components/common/Dialog.jsx'
import { T, tr, useLang } from '../../i18n/LanguageContext.jsx'

// Almanac Review — the yearly sign-off of engine-computed Pournami and festival days.
// Days the engine is sure about are already published; flagged days (close calls)
// wait here as provisional until the Administrator checks them against the TTD
// calendar and confirms or moves them. Moved days keep the reason and are never
// recalculated.

const FILTERS = [
  { k: 'review', label: 'To review' },
  { k: 'all', label: 'All' },
  { k: 'Pournami', label: 'Pournami' },
  { k: 'Amavasya', label: 'Amavasya' },
  { k: 'Festival', label: 'Festivals' },
]

const thisYear = () => Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 4))

export default function AlmanacReview() {
  const { lang } = useLang()
  const [year, setYear] = useState(thisYear)
  const [filter, setFilter] = useState('review')
  const [rows, setRows] = useState([])
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [recalc, setRecalc] = useState(false)

  const label = (r) => (lang === 'te' && r.name_te ? r.name_te : tr(r.name))

  const load = () => {
    setLoading(true)
    return Promise.all([AlmanacAPI.events({ year }), AlmanacAPI.rules()])
      .then(([e, r]) => { setRows(e.items || []); setRules(r.items || []) })
      .catch((ex) => toast(ex?.detail || tr('Could not load the almanac.'), 'error'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [year])   // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => rows.filter((r) =>
    filter === 'all' ? true : filter === 'review' ? r.provisional : r.event_type === filter), [rows, filter])
  const counts = useMemo(() => ({
    pournami: rows.filter((r) => r.event_type === 'Pournami').length,
    amavasya: rows.filter((r) => r.event_type === 'Amavasya').length,
    festivals: rows.filter((r) => r.event_type === 'Festival').length,
    review: rows.filter((r) => r.provisional).length,
    checked: rows.filter((r) => r.verified_by).length,
  }), [rows])

  const replace = (row) => setRows((list) => list.map((x) => (x.id === row.id ? row : x)))

  async function confirm(r) {
    setBusyId(r.id)
    try { replace(await AlmanacAPI.publish(r.id)); toast(tr('Confirmed.')) }
    catch (ex) { toast(ex?.detail || tr('Could not confirm.'), 'error') }
    finally { setBusyId(null) }
  }

  async function move(r) {
    const res = await promptDialog({
      title: `${tr('Change date')} — ${label(r)}`,
      message: tr('Use this only when the TTD calendar shows a different day. The engine\'s date stays on record.'),
      confirmLabel: tr('Save date'),
      fields: [
        { k: 'event_date', label: tr('Observed on'), type: 'date', defaultValue: r.event_date, required: true },
        { k: 'reason', label: tr('Reason'), placeholder: tr('e.g. TTD calendar 2026 lists this day'), required: true },
      ],
    })
    if (!res) return
    if ((res.reason || '').trim().length < 5) { toast(tr('Give a reason of at least 5 characters.'), 'error'); return }
    setBusyId(r.id)
    try { replace(await AlmanacAPI.move(r.id, res.event_date, res.reason)); toast(tr('Date saved.')) }
    catch (ex) { toast(ex?.detail || tr('Could not change the date.'), 'error') }
    finally { setBusyId(null) }
  }

  async function recalculate() {
    const ok = await confirmDialog({
      title: `${tr('Recalculate')} ${year}?`,
      message: tr('The engine recomputes this year\'s days. Days you confirmed or moved are kept exactly as they are.'),
      confirmLabel: tr('Recalculate'),
    })
    if (!ok) return
    setRecalc(true)
    try { await AlmanacAPI.generate(year); await load(); toast(tr('Recalculated.')) }
    catch (ex) { toast(ex?.detail || tr('Could not recalculate.'), 'error') }
    finally { setRecalc(false) }
  }

  async function toggleRule(rule, active) {
    setRules((list) => list.map((x) => (x.code === rule.code ? { ...x, active } : x)))
    try { await AlmanacAPI.toggleRule(rule.code, active); await load() }
    catch (ex) {
      setRules((list) => list.map((x) => (x.code === rule.code ? { ...x, active: !active } : x)))
      toast(ex?.detail || tr('Could not update the festival list.'), 'error')
    }
  }

  const years = [thisYear() - 1, thisYear(), thisYear() + 1, thisYear() + 2]

  return (
    <div>
      <PageTitle
        title="Pournami & Festival Calendar"
        subtitle="Calculated by the panchangam engine to the TTD panchangam (Tirumala sunrise). Confirm flagged days against the TTD calendar."
        actions={<>
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="!w-28">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <button type="button" onClick={recalculate} disabled={recalc}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-maroon-200 text-maroon-700 text-[0.8125rem] font-semibold hover:bg-maroon-50 disabled:opacity-50">
            {recalc ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} <T>Recalculate year</T>
          </button>
        </>}
      />

      <KpiGrid>
        <StatTile icon={Moon} title="Pournami days" value={counts.pournami} color="#b45309" bg="bg-amber-50" />
        <StatTile icon={Moon} title="Amavasya days" value={counts.amavasya} color="#4b5563" bg="bg-gray-100" />
        <StatTile icon={Sparkles} title="Festivals" value={counts.festivals} color="#be123c" bg="bg-rose-50" />
        <StatTile icon={AlertTriangle} title="To review" value={counts.review} color="#d97706" bg="bg-amber-50"
          sub="Provisional until confirmed" onClick={() => setFilter('review')} />
        <StatTile icon={ShieldCheck} title="Checked by admin" value={counts.checked} color="#059669" bg="bg-emerald-50" />
      </KpiGrid>

      <Section
        title={<span className="flex items-center gap-2"><CalendarClock size={16} /> {year}</span>}
        actions={<div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.k} type="button" onClick={() => setFilter(f.k)}
              className={`px-2.5 py-1 rounded-full text-[0.75rem] font-semibold border ${filter === f.k ? 'bg-maroon-700 text-white border-maroon-700' : 'bg-white text-gray-600 border-gray-200 hover:border-maroon-200'}`}>
              {tr(f.label)}{f.k === 'review' && counts.review ? ` (${counts.review})` : ''}
            </button>
          ))}
        </div>}
        bodyClass="p-0"
      >
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500"><Loader2 size={18} className="inline animate-spin mr-2" /><T>Loading…</T></div>
        ) : shown.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            {filter === 'review' ? <T>Nothing to review — every day this year is confirmed.</T> : <T>No days.</T>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.8125rem]">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-semibold"><T>Date</T></th>
                  <th className="px-4 py-2.5 font-semibold"><T>Name</T></th>
                  <th className="px-4 py-2.5 font-semibold"><T>Type</T></th>
                  <th className="px-4 py-2.5 font-semibold"><T>Status</T></th>
                  <th className="px-4 py-2.5 font-semibold"><T>Why</T></th>
                  <th className="px-4 py-2.5 font-semibold text-right"><T>Actions</T></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((r) => (
                  <tr key={r.id} className={r.provisional ? 'bg-amber-50/40' : ''}>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-semibold text-gray-800">{fmtDate(r.event_date)}</div>
                      <div className="text-[0.6875rem] text-gray-500">{tr(r.weekday)}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-800">{label(r)}</div>
                      {r.lunar_month && <div className="text-[0.6875rem] text-gray-500">{r.adhika ? `${tr('Adhika')} ` : ''}{lang === 'te' && r.lunar_month_te ? r.lunar_month_te : tr(r.lunar_month)} {tr('month')}</div>}
                    </td>
                    <td className="px-4 py-2.5"><Pill tone={{ Pournami: 'amber', Amavasya: 'gray', Festival: 'maroon' }[r.event_type] || 'gray'}>{r.event_type}</Pill></td>
                    <td className="px-4 py-2.5">
                      {r.override_reason ? <Pill tone="blue">Moved</Pill> : r.provisional ? <Pill tone="orange">Provisional</Pill> : <Pill tone="green">Published</Pill>}
                      {r.verified_by && <div className="text-[0.6875rem] text-gray-500 mt-0.5">{tr('by')} {r.verified_by}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-[0.75rem] text-gray-600 max-w-sm">
                      {r.override_reason
                        ? <>{r.override_reason}{r.computed_date && r.computed_date !== r.event_date && <span className="text-gray-400"> · {tr('engine')}: {fmtDate(r.computed_date)}</span>}</>
                        : (r.review_notes && tr(r.review_notes)) || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {r.provisional && (
                        <button type="button" disabled={busyId === r.id} onClick={() => confirm(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-maroon-700 text-white text-[0.75rem] font-semibold hover:bg-maroon-800 disabled:opacity-50 mr-1.5">
                          <Check size={13} /> <T>Confirm</T>
                        </button>
                      )}
                      <button type="button" disabled={busyId === r.id} onClick={() => move(r)}
                        className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700 text-[0.75rem] font-semibold hover:border-maroon-200 hover:text-maroon-700 disabled:opacity-50">
                        <T>Change date</T>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={tr('Festivals shown on the calendar')} className="mt-5">
        <p className="text-[0.75rem] text-gray-500 mb-3"><T>Each rule is checked against official Telangana government and TTD dates. Switching one off hides it from every screen.</T></p>
        <div className="grid sm:grid-cols-2 gap-2">
          {rules.map((r) => (
            <div key={r.code} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <div className="text-[0.8125rem] font-medium text-gray-800 truncate">{label(r)}</div>
                <div className="text-[0.6875rem] text-gray-500 truncate">{tr(r.rule)}</div>
              </div>
              <Toggle checked={r.active} onChange={(e) => toggleRule(r, e.target.checked)} aria-label={label(r)} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
