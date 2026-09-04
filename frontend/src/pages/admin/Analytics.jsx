import React, { useCallback, useEffect, useState } from 'react'
import {
  TrendingUp, TrendingDown, BarChart3, PieChart, Activity, ArrowUpRight, ArrowDownRight,
  Calendar, Filter, RotateCcw, Flame, HandHeart, HandCoins, Gavel, Recycle, UtensilsCrossed,
  IndianRupee, Users, ChevronDown, Download,
} from 'lucide-react'
import { AnalyticsAPI } from '../../api/client.js'
import { DateField, Select } from '../../components/common/Field.jsx'
import { toast } from '../../components/common/Dialog.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
const num = (n) => Number(n || 0).toLocaleString('en-IN')
const pct = (n) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
const shortNum = (n) => {
  if (n >= 10000000) return (n / 10000000).toFixed(1) + 'Cr'
  if (n >= 100000) return (n / 100000).toFixed(1) + 'L'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return num(n)
}

const COLORS = {
  pooja: '#2563eb',
  donation: '#059669',
  hundi: '#d97706',
  auction: '#7c3aed',
  annadanam: '#ea580c',
  waste: '#10b981',
}
const ICONS = {
  pooja: Flame,
  donation: HandHeart,
  hundi: HandCoins,
  auction: Gavel,
  annadanam: UtensilsCrossed,
  waste: Recycle,
}
const LABELS = {
  pooja: 'Pooja Bookings',
  donation: 'Donations',
  hundi: 'Hundi',
  auction: 'Auctions',
  annadanam: 'Annadanam',
  waste: 'Waste Sales',
}

// ── Summary Card ──
function SummaryCard({ icon: Icon, label, amount, count, growth, color, onClick, active }) {
  const isPositive = growth >= 0
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white rounded-xl border shadow-sm p-4 transition-all hover:shadow-md ${active ? 'border-maroon-400 ring-2 ring-maroon-100' : 'border-gray-100'}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: color + '15', color }}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.75rem] text-gray-500 leading-tight">{tr(label)}</div>
          <div className="text-lg font-extrabold text-gray-800 tabular-nums">{inr(amount)}</div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
        <span className="text-[0.75rem] text-gray-400">{num(count)} {tr('txns')}</span>
        <span className={`text-[0.75rem] font-semibold flex items-center gap-0.5 ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
          {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {pct(growth)}
        </span>
      </div>
    </button>
  )
}

// ── Multi-Line Chart (SVG) ──
function MultiLineChart({ data, metrics, height = 250 }) {
  if (!data || !Object.keys(data).length) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-400">
        <Activity size={32} className="mb-2 opacity-50" />
        <span className="text-sm"><T>No trend data available</T></span>
      </div>
    )
  }

  // Collect all unique dates from all metrics and sort chronologically
  const allDates = new Set()
  metrics.forEach(m => {
    if (Array.isArray(data[m])) {
      data[m].forEach(d => allDates.add(d.date))
    }
  })
  const dates = [...allDates].sort()
  if (!dates.length) return null

  // Create date-to-index map for x-positioning
  const dateIndex = Object.fromEntries(dates.map((d, i) => [d, i]))

  let maxVal = 0
  metrics.forEach(m => {
    (data[m] || []).forEach(d => { if (d.amount > maxVal) maxVal = d.amount })
  })
  maxVal = maxVal || 1

  const padding = { left: 60, right: 20, top: 20, bottom: 40 }
  const chartWidth = 800
  const chartHeight = height
  const plotWidth = chartWidth - padding.left - padding.right
  const plotHeight = chartHeight - padding.top - padding.bottom

  const xScale = (i) => padding.left + (i / Math.max(dates.length - 1, 1)) * plotWidth
  const yScale = (v) => padding.top + plotHeight - (v / maxVal) * plotHeight

  // Generate paths for each metric using actual date positions
  const paths = metrics.map(m => {
    const metricData = data[m] || []
    if (!metricData.length) return { metric: m, path: '', color: COLORS[m] }
    const points = metricData.map(d => `${xScale(dateIndex[d.date])},${yScale(d.amount)}`)
    return { metric: m, path: `M${points.join(' L')}`, color: COLORS[m] }
  }).filter(p => p.path)

  // Y-axis labels
  const yLabels = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal].map(v => ({ v, y: yScale(v) }))

  // X-axis labels (show subset)
  const step = Math.ceil(dates.length / 7)
  const xLabels = dates.filter((_, i) => i % step === 0 || i === dates.length - 1)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full min-w-[600px]" style={{ height }}>
        {/* Grid lines */}
        {yLabels.map(({ v, y }) => (
          <g key={v}>
            <line x1={padding.left} y1={y} x2={chartWidth - padding.right} y2={y} stroke="#e5e7eb" strokeDasharray="4" />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" className="text-[10px] fill-gray-400">{shortNum(v)}</text>
          </g>
        ))}

        {/* Lines */}
        {paths.map(p => (
          <path key={p.metric} d={p.path} fill="none" stroke={p.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* Data points */}
        {metrics.map(m => (data[m] || []).map((d, i) => (
          <circle key={`${m}-${i}`} cx={xScale(dateIndex[d.date])} cy={yScale(d.amount)} r={3} fill={COLORS[m]} className="hover:r-5 transition-all">
            <title>{d.date}: {inr(d.amount)}</title>
          </circle>
        )))}

        {/* X-axis labels */}
        {xLabels.map((label) => (
          <text key={label} x={xScale(dateIndex[label])} y={chartHeight - 10} textAnchor="middle" className="text-[10px] fill-gray-500">
            {label.slice(5)}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center mt-4">
        {metrics.map(m => (
          <div key={m} className="flex items-center gap-2 text-[0.8125rem]">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[m] }} />
            <span className="text-gray-600">{tr(LABELS[m])}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Horizontal Bar Chart ──
function HorizontalBarChart({ items, maxItems = 10, color = '#8b1a1a' }) {
  if (!items?.length) {
    return <div className="text-center text-gray-600 py-8 text-sm"><T>No data available</T></div>
  }

  const max = Math.max(...items.map(i => i.amount), 1)
  const display = items.slice(0, maxItems)

  return (
    <div className="space-y-3">
      {display.map((item, i) => (
        <div key={item.name || i} className="group">
          <div className="flex items-center justify-between text-[0.8125rem] mb-1">
            <span className="text-gray-700 font-medium flex-1 mr-2 leading-tight">
              {item.rank && <span className="text-gray-400 mr-1.5">#{item.rank}</span>}
              {item.name}
            </span>
            <span className="font-semibold text-gray-800 tabular-nums shrink-0">{inr(item.amount)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all group-hover:opacity-80"
              style={{ width: `${(item.amount / max) * 100}%`, backgroundColor: color }}
            />
          </div>
          {item.count !== undefined && (
            <div className="text-[0.6875rem] text-gray-400 mt-0.5">{num(item.count)} {tr('transactions')}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Donut Chart ──
function DonutChart({ segments, size = 180, label }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1
  let cumulative = 0
  const radius = 65
  const strokeWidth = 28
  const circumference = 2 * Math.PI * radius

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox="0 0 180 180">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
        {segments.map((seg, i) => {
          const pct = seg.value / total
          const dashArray = `${pct * circumference} ${circumference}`
          const rotation = cumulative * 360 - 90
          cumulative += pct
          return (
            <circle
              key={i}
              cx="90" cy="90" r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              transform={`rotate(${rotation} 90 90)`}
              className="transition-all hover:opacity-80"
            >
              <title>{seg.label}: {inr(seg.value)} ({(pct * 100).toFixed(1)}%)</title>
            </circle>
          )
        })}
        <text x="90" y="85" textAnchor="middle" className="text-[0.75rem] fill-gray-500">{label || tr('Total')}</text>
        <text x="90" y="105" textAnchor="middle" className="text-[1rem] font-bold fill-gray-800">{inr(total)}</text>
      </svg>
      <div className="flex flex-wrap gap-3 justify-center mt-3">
        {segments.slice(0, 6).map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[0.75rem]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-gray-600">{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Funnel Chart ──
function FunnelChart({ funnel, pending }) {
  const stages = [
    { key: 'collected', label: 'Collected', color: '#f59e0b' },
    { key: 'verified', label: 'Verified', color: '#3b82f6' },
    { key: 'deposited', label: 'Deposited', color: '#10b981' },
  ]
  const maxCount = Math.max(...stages.map(s => funnel[s.key]?.count || 0), 1)

  return (
    <div className="space-y-4">
      {stages.map((stage, i) => {
        const data = funnel[stage.key] || { count: 0, amount: 0 }
        const width = (data.count / maxCount) * 100
        return (
          <div key={stage.key}>
            <div className="flex items-center justify-between text-[0.8125rem] mb-1.5">
              <span className="font-medium text-gray-700">{tr(stage.label)}</span>
              <span className="font-semibold text-gray-800">{inr(data.amount)}</span>
            </div>
            <div className="h-8 bg-gray-100 rounded-lg overflow-hidden relative">
              <div
                className="h-full rounded-lg flex items-center justify-center text-white text-[0.75rem] font-semibold transition-all"
                style={{ width: `${Math.max(width, 10)}%`, backgroundColor: stage.color }}
              >
                {num(data.count)} {tr('bags')}
              </div>
            </div>
            {i < stages.length - 1 && (
              <div className="flex justify-center my-1">
                <ChevronDown size={16} className="text-gray-300" />
              </div>
            )}
          </div>
        )
      })}

      {/* Pending alerts */}
      {(pending?.verification?.count > 0 || pending?.deposit?.count > 0) && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="text-[0.75rem] font-semibold text-gray-500 mb-2 uppercase tracking-wide"><T>Pending Actions</T></div>
          {pending.verification?.count > 0 && (
            <div className="flex items-center justify-between text-[0.8125rem] py-1.5 text-amber-700 bg-amber-50 rounded-lg px-3 mb-2">
              <span>{num(pending.verification.count)} {tr('awaiting verification')}</span>
              <span className="font-semibold">{inr(pending.verification.amount)}</span>
            </div>
          )}
          {pending.deposit?.count > 0 && (
            <div className="flex items-center justify-between text-[0.8125rem] py-1.5 text-blue-700 bg-blue-50 rounded-lg px-3">
              <span>{num(pending.deposit.count)} {tr('awaiting deposit')}</span>
              <span className="font-semibold">{inr(pending.deposit.amount)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Comparison Card ──
function ComparisonCard({ label, current, previous, growth }) {
  const isPositive = growth >= 0
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-[0.75rem] text-gray-500 mb-2">{tr(label)}</div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xl font-bold text-gray-800">{inr(current)}</div>
          <div className="text-[0.75rem] text-gray-400">{tr('vs')} {inr(previous)} {tr('prev')}</div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[0.8125rem] font-semibold ${isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
          {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {pct(growth)}
        </div>
      </div>
    </div>
  )
}

// ── Main Analytics Page ──
export default function Analytics() {
  const todayISO = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [start, setStart] = useState(thirtyDaysAgo)
  const [end, setEnd] = useState(todayISO)
  const [granularity, setGranularity] = useState('daily')
  const [selectedMetric, setSelectedMetric] = useState('all')
  const [comparisonPeriod, setComparisonPeriod] = useState('month')
  const [loading, setLoading] = useState(true)

  const [summary, setSummary] = useState(null)
  const [trends, setTrends] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [topPoojas, setTopPoojas] = useState(null)
  const [topDonations, setTopDonations] = useState(null)
  const [paymentModes, setPaymentModes] = useState(null)
  const [hundiFunnel, setHundiFunnel] = useState(null)
  const [donationBreakdown, setDonationBreakdown] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [summ, trnd, comp, topP, topD, pmodes, funnel, donBrk] = await Promise.all([
        AnalyticsAPI.summary({ start, end }),
        AnalyticsAPI.trends({ metric: 'all', granularity, start, end }),
        AnalyticsAPI.comparison({ metric: 'all', period: comparisonPeriod }),
        AnalyticsAPI.top({ type: 'poojas', limit: 10, start, end }),
        AnalyticsAPI.top({ type: 'donations', limit: 10, start, end }),
        AnalyticsAPI.paymentModes({ granularity: 'daily', start, end }),
        AnalyticsAPI.hundiFunnel({ start, end }),
        AnalyticsAPI.breakdown({ metric: 'donation', dimension: 'fund', start, end }),
      ])
      setSummary(summ)
      setTrends(trnd)
      setComparison(comp)
      setTopPoojas(topP)
      setTopDonations(topD)
      setPaymentModes(pmodes)
      setHundiFunnel(funnel)
      setDonationBreakdown(donBrk)
    } catch (err) {
      toast(tr('Failed to load analytics'), 'error')
    } finally {
      setLoading(false)
    }
  }, [start, end, granularity, comparisonPeriod])

  useEffect(() => { load() }, [load])

  const refresh = () => { load(); toast(tr('Analytics refreshed'), 'info') }

  // Presets
  const setPreset = (days) => {
    const e = new Date()
    const s = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    setStart(s.toISOString().slice(0, 10))
    setEnd(e.toISOString().slice(0, 10))
  }

  // Prepare chart data
  const metricsToShow = selectedMetric === 'all'
    ? ['pooja', 'donation', 'hundi', 'auction', 'annadanam', 'waste']
    : [selectedMetric]

  // Donation breakdown for donut
  const donationSegments = (donationBreakdown?.items || []).map((item, i) => ({
    label: item.label,
    value: item.amount,
    color: ['#8b1a1a', '#ea580c', '#059669', '#2563eb', '#7c3aed', '#d97706'][i % 6],
  }))

  // Payment mode donut
  const paymentSegments = paymentModes?.summary ? [
    { label: 'Cash', value: paymentModes.summary.cash.amount, color: '#059669' },
    { label: 'UPI', value: paymentModes.summary.upi.amount, color: '#3b82f6' },
  ] : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-maroon-700"><T>Analytics & Trends</T></h1>
          <p className="text-sm text-gray-500 mt-1"><T>Comprehensive insights across all temple operations</T></p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="btn-outline !py-2" disabled={loading}>
            <RotateCcw size={15} className={loading ? 'animate-spin' : ''} /> <T>Refresh</T>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex gap-1.5">
            {[['7d', 7], ['30d', 30], ['90d', 90], ['1Y', 365]].map(([label, days]) => (
              <button
                key={label}
                onClick={() => setPreset(days)}
                className={`px-3 py-1.5 rounded-lg text-[0.8125rem] font-medium transition ${
                  start === new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
                    ? 'bg-maroon-700 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <DateField value={start} onChange={(e) => setStart(e.target.value)} className="input !py-1.5 !text-sm w-36" />
            <span className="text-gray-400">–</span>
            <DateField value={end} onChange={(e) => setEnd(e.target.value)} className="input !py-1.5 !text-sm w-36" />
          </div>
          <Select value={granularity} onChange={(e) => setGranularity(e.target.value)} className="input !py-1.5 !text-sm w-32">
            <option value="daily">{tr('Daily')}</option>
            <option value="weekly">{tr('Weekly')}</option>
            <option value="monthly">{tr('Monthly')}</option>
          </Select>
          <Select value={comparisonPeriod} onChange={(e) => setComparisonPeriod(e.target.value)} className="input !py-1.5 !text-sm w-40">
            <option value="day">{tr('vs Yesterday')}</option>
            <option value="week">{tr('vs Last Week')}</option>
            <option value="month">{tr('vs Last Month')}</option>
            <option value="year">{tr('vs Last Year')}</option>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {['pooja', 'donation', 'hundi', 'auction', 'annadanam', 'waste'].map(key => {
            const m = summary.metrics[key] || {}
            const comp = comparison?.metrics?.[key] || {}
            return (
              <SummaryCard
                key={key}
                icon={ICONS[key]}
                label={LABELS[key]}
                amount={m.amount || 0}
                count={m.count || 0}
                growth={comp.growth_amount || 0}
                color={COLORS[key]}
                onClick={() => setSelectedMetric(selectedMetric === key ? 'all' : key)}
                active={selectedMetric === key}
              />
            )
          })}
        </div>
      )}

      {/* Total Revenue Card */}
      {summary && (
        <div className="bg-gradient-to-r from-maroon-800 to-maroon-700 rounded-xl p-6 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-cream/70 text-sm"><T>Total Revenue</T></div>
              <div className="text-3xl font-extrabold mt-1">{inr(summary.total_revenue)}</div>
              <div className="text-cream/60 text-sm mt-1">{num(summary.total_transactions)} {tr('transactions')} · {tr('Avg')} {inr(summary.avg_transaction)}</div>
            </div>
            <div className="flex flex-wrap gap-4">
              {comparison?.total && (
                <ComparisonCard
                  label={`${tr('vs')} ${tr(comparisonPeriod === 'day' ? 'Yesterday' : comparisonPeriod === 'week' ? 'Last Week' : comparisonPeriod === 'month' ? 'Last Month' : 'Last Year')}`}
                  current={comparison.total.current_amount}
                  previous={comparison.total.previous_amount}
                  growth={comparison.total.growth}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trends Chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg font-bold text-gray-800 flex items-center gap-2">
            <Activity size={20} className="text-maroon-600" />
            <T>Revenue Trends</T>
          </h2>
          <Select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)} className="input !py-1.5 !text-sm w-40">
            <option value="all">{tr('All Metrics')}</option>
            {Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{tr(v)}</option>)}
          </Select>
        </div>
        {trends && <MultiLineChart data={trends} metrics={metricsToShow} />}
      </div>

      {/* Middle Row: Top Performers + Payment Modes */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Top Poojas */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-serif text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Flame size={18} className="text-blue-600" />
            <T>Top Poojas</T>
          </h3>
          <HorizontalBarChart items={topPoojas?.items} color={COLORS.pooja} />
        </div>

        {/* Top Donation Categories */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-serif text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <HandHeart size={18} className="text-emerald-600" />
            <T>Top Donation Categories</T>
          </h3>
          <HorizontalBarChart items={topDonations?.items} color={COLORS.donation} />
        </div>

        {/* Payment Mode Split */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-serif text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <IndianRupee size={18} className="text-amber-600" />
            <T>Payment Mode Split</T>
          </h3>
          {paymentSegments.length > 0 && <DonutChart segments={paymentSegments} label={tr('Revenue')} />}
          {paymentModes?.summary && (
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <div className="text-[0.75rem] text-emerald-700"><T>Cash</T></div>
                <div className="font-bold text-emerald-800">{paymentModes.summary.cash.pct}%</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-[0.75rem] text-blue-700"><T>UPI</T></div>
                <div className="font-bold text-blue-800">{paymentModes.summary.upi.pct}%</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Donation Breakdown + Hundi Funnel */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Donation by Category */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-serif text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <PieChart size={18} className="text-maroon-600" />
            <T>Donations by Category</T>
          </h3>
          <div className="flex justify-center">
            {donationSegments.length > 0 && <DonutChart segments={donationSegments} size={200} />}
          </div>
        </div>

        {/* Hundi Collection Funnel */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-serif text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <HandCoins size={18} className="text-amber-600" />
            <T>Hundi Collection Pipeline</T>
          </h3>
          {hundiFunnel && <FunnelChart funnel={hundiFunnel.funnel} pending={hundiFunnel.pending} />}
        </div>
      </div>

      {/* Revenue Share */}
      {summary?.revenue_share && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-serif text-lg font-bold text-gray-800 mb-4"><T>Revenue Distribution</T></h3>
          <div className="h-8 flex rounded-lg overflow-hidden">
            {Object.entries(summary.revenue_share).map(([key, pct]) => (
              pct > 0 && (
                <div
                  key={key}
                  className="h-full flex items-center justify-center text-white text-[0.75rem] font-semibold transition-all hover:opacity-90"
                  style={{ width: `${pct}%`, backgroundColor: COLORS[key], minWidth: pct > 5 ? 'auto' : '0' }}
                  title={`${tr(LABELS[key])}: ${pct}%`}
                >
                  {pct >= 8 && `${pct}%`}
                </div>
              )
            ))}
          </div>
          <div className="flex flex-wrap gap-4 mt-3">
            {Object.entries(summary.revenue_share).map(([key, pct]) => (
              pct > 0 && (
                <div key={key} className="flex items-center gap-2 text-[0.8125rem]">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[key] }} />
                  <span className="text-gray-600">{tr(LABELS[key])}</span>
                  <span className="font-semibold text-gray-800">{pct}%</span>
                </div>
              )
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
