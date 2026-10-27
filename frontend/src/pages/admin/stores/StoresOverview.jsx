import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Tag, AlertTriangle, Undo2, Hourglass, Boxes, ArrowRight, RotateCcw, CheckCircle2, MapPin, Send, SearchX, PackageCheck, CalendarClock, ShoppingCart, PackageOpen } from 'lucide-react'
import { PageTitle, StatTile, KpiGrid, Section, Pill, inr, num, fmtStamp, fmtDate } from '../../../components/admin/ui.jsx'
import { StoresAPI } from '../../../api/client.js'
import { T, tr } from '../../../i18n/LanguageContext.jsx'
import { STATUS_TONE, STATUSES, AWAITING, staffName, storeDetail } from './shared.jsx'

const q3 = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

// The Stores Officer's landing page: what needs attention today, where the stock stands,
// and what happened last. Read-only — every card links to the screen that does the work.
export default function StoresOverview() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    const safe = (p) => p.catch(() => null)
    Promise.all([safe(StoresAPI.summary()), safe(StoresAPI.pendingCount()), safe(StoresAPI.unsoldCount()),
      safe(StoresAPI.consumables()), safe(StoresAPI.activity(10)), safe(StoresAPI.issueCount()), safe(StoresAPI.missingCount()),
      safe(StoresAPI.expiryCount()), safe(StoresAPI.purchaseCount()), safe(StoresAPI.kitsOut())])
      .then(([summary, pending, unsold, consumables, activity, issue, missing, expiry, purchase, kits]) => {
        if (!summary && !pending && !consumables) { setFailed(true); return }
        setData({ summary, pending: pending?.total ?? null, toReceive: pending?.to_receive ?? null, shortages: pending?.shortages || 0, unsold: unsold?.total ?? null,
          low: (consumables?.items || []).filter((i) => i.low), activity: activity?.items || [],
          out: issue?.total ?? null, overdue: issue?.overdue || 0, missing: missing?.total ?? null, expiry, purchase, kits })
      })
  }, [])
  useEffect(() => {
    load()
    window.addEventListener('stores:changed', load)
    return () => window.removeEventListener('stores:changed', load)
  }, [load])

  const by = data?.summary?.by_status || {}
  const v = (n) => (data && n != null ? num(n) : '—')

  return (
    <div>
      <PageTitle title={tr('Stores Overview')} subtitle={tr('What needs attention in the store today, and where the stock stands.')}
        actions={<span className="inline-flex items-center gap-2">
          <button onClick={load} className="btn-outline !py-2.5" title={tr('Refresh')} aria-label={tr('Refresh')}><RotateCcw size={15} /></button>
          <Link to="/admin/stores/register" className="btn-maroon !py-2.5"><Boxes size={16} />{' '}<T>Stock Register</T></Link>
        </span>} />

      {failed && (
        <div className="mb-4 flex items-center gap-2 text-[0.8125rem] rounded-lg px-4 py-2.5 border bg-red-50 border-red-200 text-red-700">
          <AlertTriangle size={15} /> {tr('Could not load the store figures.')}
          <button onClick={load} className="font-semibold underline">{tr('Retry')}</button>
        </div>
      )}

      {/* ── Needs attention ── */}
      <KpiGrid data-n={8}>
        <StatTile icon={PackageCheck} color="#0f766e" bg="bg-teal-50" title={tr('To receive')} value={v(data?.toReceive)}
          sub={data?.shortages ? `${num(data.shortages)} ${tr('shortage(s) open')} ⚠` : tr('Counter receipts not yet counted in')} onClick={() => navigate('/admin/stores/pending')} />
        <StatTile icon={Tag} color="#b45309" bg="bg-amber-50" title={tr('Pending Tagging')} value={v(data?.pending)}
          sub={tr('Receipts waiting for ID tags')} onClick={() => navigate('/admin/stores/pending')} />
        <StatTile icon={MapPin} color="#c2410c" bg="bg-orange-50" title={tr('Awaiting Placement')} value={v(data?.summary ? by[AWAITING]?.count || 0 : null)}
          sub={tr('Tagged, not yet on a shelf')} onClick={() => navigate(`/admin/stores/register?status=${encodeURIComponent(AWAITING)}`)} />
        <StatTile icon={AlertTriangle} color="#dc2626" bg="bg-red-50" title={tr('Low Stock')} value={v(data?.low.length)}
          sub={tr('Consumables at or below the warning level')} onClick={() => navigate('/admin/stores/consumables')} />
        <StatTile icon={Undo2} color="#7c3aed" bg="bg-violet-50" title={tr('Unsold Items')} value={v(data?.unsold)}
          sub={tr('Back in store after an auction')} onClick={() => navigate('/admin/stores/unsold')} />
        <StatTile icon={Hourglass} color="#2563eb" bg="bg-blue-50" title={tr('Manual Entries')} value={v(data?.summary?.pending_manual)}
          sub={tr('Waiting for committee verification')} onClick={() => navigate('/admin/stores/manual')} />
        <StatTile icon={Send} color="#8a1c1c" bg="bg-maroon-50" title={tr('Out on issue')} value={v(data?.out)}
          sub={data?.overdue ? `${num(data.overdue)} ${tr('overdue')} ⚠` : tr('Lent out, not yet back')} onClick={() => navigate('/admin/stores/issue')} />
        <StatTile icon={SearchX} color="#dc2626" bg="bg-red-50" title={tr('Missing')} value={v(data?.missing)}
          sub={tr('Not found at a stock check')} onClick={() => navigate('/admin/stores/missing')} />
        <StatTile icon={CalendarClock} color="#dc2626" bg="bg-red-50" title={tr('Expiring soon')} value={v(data?.expiry?.total)}
          sub={data?.expiry?.first ? `${tr(data.expiry.first.name)} ${q3(data.expiry.first.left)} ${tr(data.expiry.first.unit || '')} · ${data.expiry.first.days_left < 0 ? tr('expired') : `${data.expiry.first.days_left} ${tr('days')}`}${data.expiry.expired ? ' ⚠' : ''}`
            : tr('Batches expiring within 7 days')} onClick={() => navigate('/admin/stores/consumables')} />
        <StatTile icon={ShoppingCart} color="#2563eb" bg="bg-blue-50" title={tr('Purchase requests')} value={v(data?.purchase?.waiting)}
          sub={data?.purchase?.approved ? `${num(data.purchase.approved)} ${tr('approved, to buy')}` : tr('Waiting for approval')} onClick={() => navigate('/admin/stores/purchase')} />
        <StatTile icon={PackageOpen} color="#8a1c1c" bg="bg-maroon-50" title={tr('Kits out')} value={v(data?.kits?.total)}
          sub={data?.kits?.first ? `${tr(data.kits.first.kit_name)} · ${tr('due')} ${fmtDate(data.kits.first.return_by)}${data.kits.overdue ? ' ⚠' : ''}` : tr('Festival kits on issue')}
          onClick={() => navigate('/admin/stores/kits')} />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* ── Stock by status ── */}
        <Section title={tr('Stock by status')} actions={<Link to="/admin/stores/register" className="text-[0.8125rem] text-maroon-700 font-semibold hover:underline inline-flex items-center gap-1">{tr('View All')} <ArrowRight size={14} /></Link>}>
          {data?.summary ? (
            <>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-2xl font-extrabold text-gray-800 tabular-nums">{num(data.summary.received)}</span>
                <span className="text-[0.8125rem] text-gray-500">{tr('pieces tagged in all')}</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {STATUSES.map((s) => (
                  <li key={s}>
                    <Link to={`/admin/stores/register?status=${encodeURIComponent(s)}`} className="flex items-center justify-between py-2 hover:bg-gray-50 -mx-2 px-2 rounded">
                      <Pill tone={STATUS_TONE[s]}>{tr(s)}</Pill>
                      <span className="text-[0.875rem] tabular-nums">
                        <b className="text-gray-800">{num(by[s]?.count || 0)}</b>
                        {s === 'In Store' && <span className="text-gray-500"> · {inr(by[s]?.est_value || 0)} {tr('est.')}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className={`mt-3 inline-flex items-center gap-1.5 text-[0.75rem] font-semibold ${data.summary.balanced ? 'text-emerald-700' : 'text-red-700'}`}>
                {data.summary.balanced ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {data.summary.balanced ? tr('Register balances') : tr('Register does not balance — check the Stock Register')}
              </div>
            </>
          ) : <p className="text-[0.8125rem] text-gray-500">{data ? '—' : tr('Loading...')}</p>}
        </Section>

        {/* ── Low stock ── */}
        <Section title={tr('Low stock')} actions={<Link to="/admin/stores/consumables" className="text-[0.8125rem] text-maroon-700 font-semibold hover:underline inline-flex items-center gap-1">{tr('Consumables Stock')} <ArrowRight size={14} /></Link>}>
          {!data ? <p className="text-[0.8125rem] text-gray-500">{tr('Loading...')}</p>
            : data.low.length === 0 ? (
              <p className="text-[0.8125rem] text-emerald-700 inline-flex items-center gap-1.5"><CheckCircle2 size={15} /> {tr('No consumable is running low.')}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.low.map((i) => (
                  <li key={i.category_id} className="flex items-center justify-between py-2">
                    <span className="font-medium text-gray-800">{tr(i.name)}</span>
                    <span className="text-[0.875rem] tabular-nums">
                      <b className="text-red-700">{q3(i.remaining)}</b>
                      <span className="text-gray-500"> / {q3(i.low_stock_level)} {tr(i.unit || '')}</span>
                      <span className="ml-2"><Pill tone="red">{tr('Low')}</Pill></span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </Section>
      </div>

      {/* ── Recent activity ── */}
      <Section title={tr('Recent activity')} bodyClass="p-0">
        {!data ? <p className="px-5 py-4 text-[0.8125rem] text-gray-500">{tr('Loading...')}</p>
          : data.activity.length === 0 ? <p className="px-5 py-4 text-[0.8125rem] text-gray-500">{tr('No stock activity yet.')}</p>
            : (
              <ul className="divide-y divide-gray-100">
                {data.activity.map((a, n) => (
                  <li key={`${a.kind}-${a.ref}-${n}`} className="px-5 py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    {a.kind === 'Piece'
                      ? <Link to={`/admin/stores/item/${encodeURIComponent(a.ref)}`} className="font-mono text-[0.8125rem] font-semibold text-maroon-700 hover:underline">{a.ref}</Link>
                      : <span className="font-mono text-[0.8125rem] font-semibold text-gray-700">{a.ref}</span>}
                    <b className="text-[0.8125rem] text-gray-800">{tr(a.action)}</b>
                    {a.detail && <span className="text-[0.8125rem] text-gray-600 min-w-0 flex-1">{a.action === 'Written off' && !/^Lost — /.test(a.detail) ? tr(a.detail) : storeDetail(a.detail)}</span>}
                    <span className="text-[0.6875rem] text-gray-500 whitespace-nowrap ml-auto">{fmtStamp(a.at)} · {staffName(a.by)}</span>
                  </li>
                ))}
              </ul>
            )}
      </Section>
    </div>
  )
}
