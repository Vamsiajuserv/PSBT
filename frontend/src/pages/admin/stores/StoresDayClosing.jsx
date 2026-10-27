import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PackagePlus, MapPin, ArrowLeftRight, BadgeIndianRupee, Archive, AlertTriangle, CheckCircle2, Printer, Send, Undo2,
  RefreshCw, Lock, Info, Unlock, History } from 'lucide-react'
import { PageTitle, StatTile, KpiGrid, Section, Pill, num, fmtDate, fmtStamp } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { DateField } from '../../../components/common/Field.jsx'
import { confirmDialog, promptDialog, toast } from '../../../components/common/Dialog.jsx'
import ExportButtons from '../../../components/common/ExportButtons.jsx'
import { T, tr, personName, useLang, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { canManageStores, isAdminUser, staffName, AWAITING } from './shared.jsx'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const q3 = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback))
const SOURCE_TONE = { Donation: 'blue', Hundi: 'violet', Manual: 'amber' }

// The store's end of day: what came in, where it went, consumables, what is left to do,
// and the Stores Officer's sign-off. Entries are never blocked after closing; a later
// change shows as "changed after closing" against the signed-off figures.
export default function StoresDayClosing() {
  const { user } = useAuth()
  const { lang } = useLang()
  const canClose = canManageStores(user)          // Stores Officer + Administrator
  const canReopen = isAdminUser(user)             // Administrator only — never the one who signed off
  const [day, setDay] = useState(today())
  const [data, setData] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [showLive, setShowLive] = useState(false)
  const [notes, setNotes] = useState('')
  const [closing, setClosing] = useState(false)
  const [history, setHistory] = useState([])

  const load = useCallback(() => {
    setLoadErr('')
    StoresAPI.dayClosing(day).then((d) => { setData(d); setShowLive(false) })
      .catch((ex) => { setData(null); setLoadErr(errText(ex, 'Could not load the day closing.')) })
    StoresAPI.dayClosingHistory().then((h) => setHistory(h.items || [])).catch(() => setHistory([]))
  }, [day])
  useEffect(() => { load() }, [load])

  const closed = data?.closing
  const rep = closed && !showLive ? closed : data?.live
  const k = rep?.kpis || {}
  const dateLabel = fmtDate(day)

  async function closeDay() {
    const unplaced = data.live.kpis.unplaced
    const out = data.live.kpis.out_on_issue || 0
    const att = data.live.attention || {}
    const warn = [unplaced ? `${unplaced} ${tr('piece(s) are still not placed.')}` : '', out ? `${out} ${tr('piece(s) are still out on issue.')}` : '',
      att.to_receive ? `${att.to_receive} ${tr('counter receipt(s) are not yet received at the store.')}` : '',
      att.shortages ? `${att.shortages} ${tr('shortage(s) are still open.')}` : ''].filter(Boolean)
    const ok = await confirmDialog({
      title: `${tr('Close the store day')} — ${dateLabel}?`, confirmLabel: tr('Close the day'),
      tone: warn.length ? 'warning' : undefined,
      message: warn.length
        ? `${warn.join(' ')} ${tr('Close the day anyway? The figures are saved as signed off; nothing is blocked afterwards.')}`
        : tr('The figures are saved as signed off; nothing is blocked afterwards.'),
    })
    if (!ok) return
    setClosing(true)
    try {
      const d = await StoresAPI.closeDay({ date: day, notes: notes.trim() || null })
      setData(d); setNotes(''); toast(tr('Store day closed.'))
      StoresAPI.dayClosingHistory().then((h) => setHistory(h.items || [])).catch(() => {})
    } catch (ex) { toast(errText(ex, 'Could not close the day.'), 'error') }
    finally { setClosing(false) }
  }

  async function reopenDay() {
    const res = await promptDialog({
      title: `${tr('Reopen store day')} — ${dateLabel}`, tone: 'warning', confirmLabel: tr('Reopen'),
      message: tr('The signed-off closing is kept in this day\'s history. The Stores Officer then closes the day again.'),
      fields: [{ k: 'reason', label: tr('Reason'), required: true, placeholder: tr('e.g. Closed early, 3 donations came later') }],
    })
    if (!res) return
    try {
      const d = await StoresAPI.reopenDay({ date: day, reason: res.reason.trim() })
      setData(d); toast(tr('Store day reopened.'))
      StoresAPI.dayClosingHistory().then((h) => setHistory(h.items || [])).catch(() => {})
    } catch (ex) { toast(errText(ex, 'Could not reopen the day.'), 'error') }
  }

  // One export table: a Section column groups the rows
  const exportRows = rep ? [
    ...Object.entries({ received: 'Received', placed: 'Placed', moved: 'Moved', issued: 'Issued', returned: 'Returned from issue',
      sold: 'Sold', written_off: 'Written off', unplaced: 'Still unplaced', out_on_issue: 'Out on issue', missing: 'Missing' })
      .map(([key, label]) => ({ section: tr('Summary'), name: tr(label), a: k[key] })),
    ...(rep.store_receipts || []).map((g) => ({ section: tr('Received at store'), name: `${g.receipt_no} · ${tr(g.item_name)}${g.short_code ? ` · ${g.short_code}` : ''}`,
      a: `${q3(g.billed)}`, b: `${q3(g.received)}${g.short ? ` (${tr('short')} ${q3(g.short)})` : ''}`, c: staffName(g.by || '') })),
    ...rep.received.map((g) => ({ section: tr('Received today'), name: `${tr(g.source_type)} ${g.source_ref} · ${personName({ name: g.donor_name }, lang)} · ${tr(g.item_name)}`, a: g.tagged, b: g.placed })),
    ...rep.locations.map((x) => ({ section: tr('Location-wise'), name: x.location ? tr(x.location) : tr('Not placed'), a: x.opening,
      b: x.location ? `+${x.placed_in + x.moved_in + x.returned + (x.back_from_issue || 0)} / −${x.moved_out + (x.issued_out || 0) + x.left}` : '', c: x.closing })),
    ...rep.consumables.map((c) => ({ section: tr('Consumables'), name: `${tr(c.name)} (${tr(c.unit || '')})`, a: q3(c.opening),
      b: `+${q3(c.received)} / −${q3(c.used)}`, c: q3(c.closing) })),
  ] : []
  const exportCols = [{ key: 'section', label: tr('Section') }, { key: 'name', label: tr('Item') },
    { key: 'a', label: tr('Opening / Count') }, { key: 'b', label: tr('In / Out · Placed') }, { key: 'c', label: tr('Closing') }]

  const th = 'px-3 py-2.5 font-semibold whitespace-nowrap'
  const Head = ({ cols }) => (
    <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
      {cols.map((c, i) => <th key={i} className={`${th} ${c[1] ? 'text-right' : ''}`}>{c[0]}</th>)}</tr></thead>
  )
  const td = 'px-3 py-2.5', tdr = 'px-3 py-2.5 text-right tabular-nums'

  return (
    <div>
      <PageTitle title={tr('Stores Day Closing')} subtitle={tr('What came into the store today, where it went, and what is left to do.')}
        actions={<span className="inline-flex items-center gap-2 no-print">
          <DateField value={day} max={today()} onChange={(e) => setDay(e.target.value > today() ? today() : e.target.value)}
            className="!w-48 !py-2.5 text-[0.8125rem] font-medium" />
          <button onClick={load} className="btn-outline !py-2.5" title={tr('Refresh')} aria-label={tr('Refresh')}><RefreshCw size={15} /></button>
          <button onClick={() => window.print()} disabled={!rep} className="btn-outline !py-2.5 disabled:opacity-50"><Printer size={15} />{' '}<T>Print</T></button>
          {rep && <ExportButtons title={`${tr('Stores Day Closing')} — ${dateLabel}`} columns={exportCols} rows={exportRows} />}
        </span>} />

      {loadErr && <div className="mb-4 text-[0.8125rem] rounded-lg px-4 py-2.5 border bg-red-50 border-red-200 text-red-700">{loadErr}{' '}
        <button onClick={load} className="font-semibold underline">{tr('Retry')}</button></div>}

      {/* ── Status of the day ── */}
      {data && (closed ? (
        <div className="mb-4 space-y-2 no-print">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] rounded-lg px-4 py-2.5 border bg-emerald-50/60 border-emerald-100 text-emerald-800">
            <Lock size={15} /><b>{tr('Closed')}</b>
            <span>{tr('by')} {staffName(closed.closed_by)} · {fmtStamp(closed.closed_at)}</span>
            {closed.notes && <span className="text-emerald-700">· {closed.notes}</span>}
            {canReopen && <button onClick={reopenDay} className="ml-auto inline-flex items-center gap-1 font-semibold text-amber-800 hover:underline"><Unlock size={14} />{tr('Reopen day')}</button>}
          </div>
          {data.changed_after_close && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] rounded-lg px-4 py-2.5 border bg-amber-50 border-amber-200 text-amber-800">
              <AlertTriangle size={15} /><b>{tr('Changed after closing')}</b>
              <span>{showLive ? tr('Showing the live figures.') : tr('Showing the signed-off figures.')}</span>
              <button onClick={() => setShowLive((v) => !v)} className="font-semibold underline">{showLive ? tr('Show signed-off figures') : tr('Show live figures')}</button>
            </div>
          )}
        </div>
      ) : data.reopened ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] rounded-lg px-4 py-2.5 border bg-amber-50 border-amber-200 text-amber-800 no-print">
          <Unlock size={15} /><b>{tr('Reopened')}</b>
          <span>{tr('by')} {staffName(data.reopened.reopened_by)} · {fmtStamp(data.reopened.reopened_at)}</span>
          <span>· {data.reopened.reason}</span>
          <span className="font-semibold">— {tr('Close the day again when the store is done.')}</span>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 text-[0.8125rem] rounded-lg px-4 py-2.5 border bg-gray-50 border-gray-200 text-gray-700 no-print">
          <Info size={15} /> {data.is_today ? tr('Not closed yet — the figures update as the day goes on.') : tr('This day was not closed.')}
        </div>
      ))}

      {rep && (
        <div id="print-area">
          <div className="hidden print:block mb-3">
            <div className="font-serif text-xl font-bold text-maroon-800"><T>Stores Day Closing</T> — {dateLabel}</div>
            {closed && !showLive && <div className="text-[0.8125rem]">{tr('Closed')} {tr('by')} {staffName(closed.closed_by)} · {fmtStamp(closed.closed_at)}</div>}
          </div>

          <KpiGrid data-n={8}>
            <StatTile icon={PackagePlus} color="#8a1c1c" bg="bg-maroon-50" title={tr('Received')} value={num(k.received)} sub={tr('Pieces tagged')} />
            <StatTile icon={MapPin} color="#059669" bg="bg-emerald-50" title={tr('Placed')} value={num(k.placed)} sub={tr('Put on a shelf')} />
            <StatTile icon={ArrowLeftRight} color="#2563eb" bg="bg-blue-50" title={tr('Moved')} value={num(k.moved)} sub={tr('Between locations')} />
            <StatTile icon={Send} color="#8a1c1c" bg="bg-maroon-50" title={tr('Issued')} value={num(k.issued || 0)} sub={`${num(k.out_on_issue || 0)} ${tr('still out at day end')}`} />
            <StatTile icon={Undo2} color="#059669" bg="bg-emerald-50" title={tr('Returned')} value={num(k.returned || 0)} sub={tr('Back from issue')} />
            <StatTile icon={BadgeIndianRupee} color="#7c3aed" bg="bg-violet-50" title={tr('Sold')} value={num(k.sold)} sub={tr('Auction or Open Sale')} />
            <StatTile icon={Archive} color="#6b7280" bg="bg-gray-100" title={tr('Written Off')} value={num(k.written_off)} sub={tr('Damaged or lost')} />
            <StatTile icon={AlertTriangle} color="#c2410c" bg="bg-orange-50" title={tr('Still unplaced')} value={num(k.unplaced)} sub={tr('At the end of the day')} />
          </KpiGrid>

          <div className="space-y-4">
            {/* 1. Received today */}
            <Section title={tr('1. Received today (by source)')} bodyClass="p-0">
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <Head cols={[[tr('Source')], [tr('Ref')], [tr('Donor')], [tr('Item')], [tr('Tagged'), 1], [tr('Placed'), 1]]} />
                <tbody className="divide-y divide-gray-100">
                  {rep.received.map((g) => (
                    <tr key={g.source_ref}>
                      <td className={td}><Pill tone={SOURCE_TONE[g.source_type] || 'gray'}>{tr(g.source_type === 'Manual' ? 'Manual entry' : g.source_type)}</Pill></td>
                      <td className={`${td} font-mono text-[0.78rem]`}>{g.source_ref}</td>
                      <td className={td}>{personName({ name: g.donor_name }, lang)}</td>
                      <td className={td}>{tr(g.item_name)}</td>
                      <td className={tdr}>{g.tagged}</td>
                      <td className={tdr}>{g.placed < g.tagged ? <span className="text-orange-700 font-semibold">{g.placed}</span> : g.placed}</td>
                    </tr>))}
                  {!rep.received.length && <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400 text-[0.8125rem]">{tr('Nothing was tagged on this day.')}</td></tr>}
                </tbody></table></div>
              {(rep.store_receipts || []).length > 0 && (
                <div className="overflow-x-auto border-t border-gray-100">
                  <div className="px-3 pt-3 pb-1 text-[0.75rem] font-semibold text-gray-600">{tr('Counted in at the store')}</div>
                  <table className="w-full text-sm">
                    <Head cols={[[tr('Receipt')], [tr('Item')], [tr('Billed / counted'), 1], [tr('Received'), 1], [tr('Short'), 1], [tr('By')]]} />
                    <tbody className="divide-y divide-gray-100">
                      {rep.store_receipts.map((g) => (
                        <tr key={`${g.receipt_no}-${g.item_name}`}>
                          <td className={`${td} font-mono text-[0.78rem]`}>{g.receipt_no}</td>
                          <td className={td}>{tr(g.item_name)}</td>
                          <td className={tdr}>{g.mode === 'value' ? '1' : q3(g.billed)}{g.mode === 'weight' ? ` ${gramUnit()}` : ''}</td>
                          <td className={tdr}>{g.mode === 'value' ? (g.received > 0 ? '✔' : '—') : q3(g.received)}{g.mode === 'weight' ? ` ${gramUnit()}` : ''}</td>
                          <td className={tdr}>{g.short ? <span className="text-red-700 font-semibold">{q3(g.short)} · {g.short_code}</span> : '—'}</td>
                          <td className={td}>{staffName(g.by || '—')}</td>
                        </tr>))}
                    </tbody></table></div>)}
            </Section>

            {/* 2. Location-wise */}
            <Section title={tr('2. Location-wise')} bodyClass="p-0">
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <Head cols={[[tr('Location')], [tr('Opening'), 1], [tr('Newly placed'), 1], [tr('Moved in'), 1], [tr('Returned'), 1], [tr('Back from issue'), 1],
                  [tr('Moved out'), 1], [tr('Issued out'), 1], [tr('Left store'), 1], [tr('Closing'), 1]]} />
                <tbody className="divide-y divide-gray-100">
                  {rep.locations.map((x) => x.location ? (
                    <tr key={x.location}>
                      <td className={`${td} font-medium text-gray-800`}>{tr(x.location)}</td>
                      <td className={tdr}>{x.opening}</td><td className={tdr}>{x.placed_in || '—'}</td><td className={tdr}>{x.moved_in || '—'}</td>
                      <td className={tdr}>{x.returned || '—'}</td><td className={tdr}>{x.back_from_issue || '—'}</td>
                      <td className={tdr}>{x.moved_out || '—'}</td><td className={tdr}>{x.issued_out || '—'}</td><td className={tdr}>{x.left || '—'}</td>
                      <td className={`${tdr} font-bold`}>{x.closing}</td>
                    </tr>
                  ) : (
                    <tr key="not-placed" className={x.closing ? 'bg-orange-50/60' : ''}>
                      <td className={`${td} font-medium ${x.closing ? 'text-orange-800' : 'text-gray-600'}`}>{tr('Not placed')}</td>
                      <td className={tdr}>{x.opening}</td><td colSpan={7} className={`${td} text-[0.75rem] text-gray-500`}>{tr('Tagged pieces not yet put on a shelf')}</td>
                      <td className={`${tdr} font-bold ${x.closing ? 'text-orange-700' : ''}`}>{x.closing}{x.closing > 0 && ' ⚠'}</td>
                    </tr>
                  ))}
                </tbody></table></div>
              <div className="px-4 py-2.5 border-t border-gray-100 text-[0.6875rem] text-gray-500">{tr('Left store = sold, written off, put in an auction or missing at a stock check. Returned = back from an auction, a cancelled sale or found again.')}</div>
            </Section>

            {/* 3. Consumables */}
            <Section title={tr('3. Consumables today')} bodyClass="p-0">
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <Head cols={[[tr('Item')], [tr('Unit')], [tr('Opening'), 1], [tr('Received'), 1], [tr('Used'), 1], [tr('Closing'), 1], ['']]} />
                <tbody className="divide-y divide-gray-100">
                  {rep.consumables.map((c) => (
                    <tr key={c.category_id}>
                      <td className={`${td} font-medium text-gray-800`}>{tr(c.name)}</td><td className={td}>{tr(c.unit || '')}</td>
                      <td className={tdr}>{q3(c.opening)}</td><td className={tdr}>{c.received ? q3(c.received) : '—'}</td>
                      <td className={tdr}>{c.used ? q3(c.used) : '—'}</td><td className={`${tdr} font-bold`}>{q3(c.closing)}</td>
                      <td className={td}>{c.low && <Pill tone="red">{tr('Low')}</Pill>}</td>
                    </tr>))}
                  {!rep.consumables.length && <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400 text-[0.8125rem]">{tr('No consumable movement.')}</td></tr>}
                </tbody></table></div>
            </Section>

            {/* 4. Needs attention (live reminders) */}
            <Section title={tr('4. Needs attention')} className="no-print">
              <ul className="space-y-2 text-[0.8125rem]">
                <li className="flex items-center gap-2">{data.live.attention.unplaced ? <AlertTriangle size={15} className="text-orange-600" /> : <CheckCircle2 size={15} className="text-emerald-600" />}
                  <Link to={`/admin/stores/register?status=${encodeURIComponent(AWAITING)}`} className="hover:underline">{num(data.live.attention.unplaced)} {tr('piece(s) still not placed')}</Link></li>
                <li className="flex items-center gap-2">{data.live.attention.overdue ? <AlertTriangle size={15} className="text-red-600" /> : data.live.attention.out_on_issue ? <AlertTriangle size={15} className="text-amber-600" /> : <CheckCircle2 size={15} className="text-emerald-600" />}
                  <Link to="/admin/stores/issue" className="hover:underline">{num(data.live.attention.out_on_issue || 0)} {tr('piece(s) still out on issue')}{data.live.attention.overdue ? <b className="text-red-700"> ({num(data.live.attention.overdue)} {tr('overdue')})</b> : ''}</Link></li>
                <li className="flex items-center gap-2">{data.live.attention.missing ? <AlertTriangle size={15} className="text-red-600" /> : <CheckCircle2 size={15} className="text-emerald-600" />}
                  <Link to="/admin/stores/missing" className="hover:underline">{num(data.live.attention.missing || 0)} {tr('piece(s) missing')}</Link></li>
                {data.live.attention.to_receive != null && <li className="flex items-center gap-2">{data.live.attention.to_receive ? <AlertTriangle size={15} className="text-amber-600" /> : <CheckCircle2 size={15} className="text-emerald-600" />}
                  <Link to="/admin/stores/pending" className="hover:underline">{num(data.live.attention.to_receive)} {tr('counter receipt(s) not yet received at the store')}</Link></li>}
                {data.live.attention.shortages != null && <li className="flex items-center gap-2">{data.live.attention.shortages ? <AlertTriangle size={15} className="text-red-600" /> : <CheckCircle2 size={15} className="text-emerald-600" />}
                  <Link to="/admin/stores/pending" className="hover:underline">{num(data.live.attention.shortages)} {tr('shortage(s) open')}</Link></li>}
                <li className="flex items-center gap-2">{data.live.attention.pending_tagging ? <AlertTriangle size={15} className="text-amber-600" /> : <CheckCircle2 size={15} className="text-emerald-600" />}
                  <Link to="/admin/stores/pending" className="hover:underline">{num(data.live.attention.pending_tagging)} {tr('receipt(s) waiting to be tagged')}</Link></li>
                <li className="flex items-center gap-2">{data.live.attention.manual_pending ? <AlertTriangle size={15} className="text-amber-600" /> : <CheckCircle2 size={15} className="text-emerald-600" />}
                  <Link to="/admin/stores/manual" className="hover:underline">{num(data.live.attention.manual_pending)} {tr('manual entry(s) waiting for committee')}</Link></li>
              </ul>
            </Section>
          </div>
        </div>
      )}

      {/* ── Close the day ── */}
      {data && !closed && canClose && (
        <Section title={data.reopened ? tr('Close the day again') : tr('Close the day')} className="mt-4 no-print">
          <label className="label"><T>Notes</T></label>
          <textarea rows={2} maxLength={1000} className="input" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder={tr('e.g. All shelves checked, 2 panchas kept aside for washing')} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[0.75rem] text-gray-500">{tr('Saves these figures as signed off by you. Entries for the day are not blocked.')}</span>
            <button disabled={closing} onClick={closeDay} className="btn-maroon !py-2.5 disabled:opacity-60"><CheckCircle2 size={16} />{' '}{closing ? tr('Saving…') : tr('Close the day')}</button>
          </div>
        </Section>
      )}

      {/* ── This day's earlier closings and reopens ── */}
      {data?.history?.length > 0 && (
        <Section title={<span className="inline-flex items-center gap-2"><History size={17} />{tr('Closing history of this day')}</span>} className="mt-4 no-print" bodyClass="p-0">
          <ul className="divide-y divide-gray-100 text-[0.8125rem]">
            {data.history.map((h, i) => (
              <li key={i} className="px-5 py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-emerald-800"><Lock size={13} className="inline mr-1" />{tr('Closed')} {tr('by')} <b>{staffName(h.closed_by)}</b> · {fmtStamp(h.closed_at)}</span>
                <span className="text-gray-500">({tr('Received')} {h.kpis?.received ?? 0} · {tr('Placed')} {h.kpis?.placed ?? 0} · {tr('Still unplaced')} {h.kpis?.unplaced ?? 0})</span>
                <span className="text-amber-800"><Unlock size={13} className="inline mr-1" />{tr('Reopened')} {tr('by')} <b>{staffName(h.reopened_by)}</b> · {fmtStamp(h.reopened_at)} — {h.reason}</span>
              </li>))}
          </ul>
        </Section>
      )}

      {/* ── Recent closings ── */}
      {history.length > 0 && (
        <Section title={tr('Recent closings')} className="mt-4 no-print" bodyClass="p-0">
          <ul className="divide-y divide-gray-100">
            {history.slice(0, 10).map((h) => (
              <li key={h.date}>
                <button onClick={() => setDay(h.date)} className={`w-full text-left px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 hover:bg-gray-50 ${h.date === day ? 'bg-cream/60' : ''}`}>
                  <b className="text-gray-800 w-28">{fmtDate(h.date)}</b>
                  <span className="text-[0.8125rem] text-gray-600">{tr('Received')} {h.kpis?.received ?? 0} · {tr('Placed')} {h.kpis?.placed ?? 0} · {tr('Still unplaced')} {h.kpis?.unplaced ?? 0}</span>
                  {h.status === 'Reopened' ? <Pill tone="amber">{tr('Reopened')}</Pill> : h.times_reopened > 0 && <span className="text-[0.6875rem] text-amber-700">{tr('Reopened')} ×{h.times_reopened}</span>}
                  <span className="text-[0.75rem] text-gray-500 ml-auto">{h.status === 'Reopened' ? `${staffName(h.reopened_by)} · ${fmtStamp(h.reopened_at)}` : `${staffName(h.closed_by)} · ${fmtStamp(h.closed_at)}`}</span>
                </button>
              </li>))}
          </ul>
        </Section>
      )}
    </div>
  )
}
