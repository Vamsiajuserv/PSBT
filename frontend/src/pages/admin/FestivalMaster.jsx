import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { CalendarDays, CheckCircle2, CalendarClock, Moon, Sun, ChevronDown, Calendar, Info, Loader2 } from 'lucide-react'
import { toast } from '../../components/common/Dialog.jsx'
import MasterScreen from '../../components/admin/MasterScreen.jsx'
import { Pill, fmtDate } from '../../components/admin/ui.jsx'
import { FestivalsAPI, PoojasAPI, TithiAPI, PanchangamAPI } from '../../api/client.js'
import { NumberField } from '../../components/common/Field.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

// ── Panchangam Reference Component ─────────────────────────────────────────────
// Provides tithi date suggestions and panchangam info as REFERENCE only.
// Admin confirms final festival dates - this is NOT automatic.
function PanchangamReference({ data, setD }) {
  const [showSuggestions, setShowSuggestions] = useState(null)  // 'Pournami' | 'Amavasya' | null
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [panchangam, setPanchangam] = useState(null)
  const [panchangamLoading, setPanchangamLoading] = useState(false)

  // Fetch tithi date suggestions
  const fetchSuggestions = useCallback(async (tithiType) => {
    setLoading(true)
    setSuggestions([])
    setShowSuggestions(tithiType)
    try {
      const result = await TithiAPI.upcoming(tithiType, 12)
      setSuggestions(result.dates || [])
    } catch (err) {
      toast('Failed to fetch tithi dates', 'error')
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Select a suggested date
  const selectDate = useCallback((dateStr) => {
    setD({ start_date: dateStr, end_date: dateStr })
    setShowSuggestions(null)
  }, [setD])

  // Fetch panchangam when start_date changes
  useEffect(() => {
    if (!data.start_date) {
      setPanchangam(null)
      return
    }
    setPanchangamLoading(true)
    PanchangamAPI.date(data.start_date)
      .then((p) => setPanchangam(p))
      .catch(() => setPanchangam(null))
      .finally(() => setPanchangamLoading(false))
  }, [data.start_date])

  return (
    <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-800 font-medium text-[0.8125rem]">
        <Calendar size={16} />
        <span><T>Panchangam Reference</T></span>
        <span className="text-[0.6875rem] text-amber-600 font-normal">({tr('optional')})</span>
      </div>

      {/* Suggestion buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fetchSuggestions('Pournami')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-[0.8125rem] font-medium transition-colors"
        >
          <Moon size={14} />
          <T>Suggest Pournami Dates</T>
          <ChevronDown size={14} />
        </button>
        <button
          type="button"
          onClick={() => fetchSuggestions('Amavasya')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[0.8125rem] font-medium transition-colors"
        >
          <Sun size={14} />
          <T>Suggest Amavasya Dates</T>
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <div className="border border-gray-200 bg-white rounded-lg shadow-sm max-h-48 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-gray-500 text-[0.8125rem]">
              <Loader2 size={16} className="animate-spin" />
              <T>Loading dates...</T>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-3 px-4 text-gray-500 text-[0.8125rem]">
              <T>No upcoming dates found</T>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              <div className="px-3 py-2 bg-gray-50 text-[0.6875rem] text-gray-500 uppercase tracking-wide font-semibold">
                <T>Upcoming</T> {showSuggestions} <T>Dates</T> ({suggestions.length})
              </div>
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectDate(s.date)}
                  className="w-full text-left px-3 py-2 hover:bg-amber-50 text-[0.8125rem] flex items-center justify-between group"
                >
                  <span className="text-gray-800 font-medium">
                    {new Date(s.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {s.name && (
                    <span className="text-[0.75rem] text-amber-600">{s.name}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowSuggestions(null)}
            className="w-full px-3 py-2 text-[0.75rem] text-gray-500 hover:text-gray-700 border-t border-gray-100"
          >
            <T>Close</T>
          </button>
        </div>
      )}

      {/* Panchangam info for selected date */}
      {data.start_date && (
        <div className="border border-gray-200 bg-white rounded-lg p-3">
          {panchangamLoading ? (
            <div className="flex items-center gap-2 text-gray-500 text-[0.8125rem]">
              <Loader2 size={14} className="animate-spin" />
              <T>Loading panchangam...</T>
            </div>
          ) : panchangam ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[0.8125rem]">
                <Calendar size={14} className="text-maroon-600" />
                <span className="font-medium text-gray-800">
                  {new Date(data.start_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[0.75rem]">
                {panchangam.tithi && (
                  <div>
                    <span className="text-gray-500"><T>Tithi</T>: </span>
                    <span className="text-gray-800 font-medium">
                      {panchangam.tithi.name || panchangam.tithi_name || '—'}
                      {(panchangam.paksha || panchangam.tithi?.paksha) && (
                        <span className="text-gray-500 font-normal"> ({panchangam.paksha || panchangam.tithi?.paksha})</span>
                      )}
                    </span>
                  </div>
                )}
                {(panchangam.nakshatra || panchangam.nakshatra_name) && (
                  <div>
                    <span className="text-gray-500"><T>Nakshatra</T>: </span>
                    <span className="text-gray-800 font-medium">
                      {panchangam.nakshatra?.name || panchangam.nakshatra_name || '—'}
                    </span>
                  </div>
                )}
                {panchangam.vaara && (
                  <div>
                    <span className="text-gray-500"><T>Day</T>: </span>
                    <span className="text-gray-800 font-medium">{panchangam.vaara}</span>
                  </div>
                )}
                {panchangam.sunrise && (
                  <div>
                    <span className="text-gray-500"><T>Sunrise</T>: </span>
                    <span className="text-gray-800 font-medium">{panchangam.sunrise}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-[0.75rem] text-gray-500">
              <T>Panchangam info not available for this date</T>
            </div>
          )}
        </div>
      )}

      {/* Reference warning */}
      <div className="flex items-start gap-2 text-[0.6875rem] text-amber-700 bg-amber-100/50 rounded px-2.5 py-2">
        <Info size={12} className="shrink-0 mt-0.5" />
        <span>
          <T>This is a reference only. You must confirm the actual festival dates below based on temple tradition and local calendar.</T>
        </span>
      </div>
    </div>
  )
}

export default function FestivalMaster() {
  const [poojaOptions, setPoojaOptions] = useState([])
  const [poojaAll, setPoojaAll] = useState([])   // full poojas incl. plans (for committee pricing)
  useEffect(() => {
    PoojasAPI.admin().then((r) => {
      const items = r.items || []
      setPoojaAll(items)
      setPoojaOptions(items.map((p) => ({ value: p.id, label: p.name })))
    }).catch(() => toast('Failed to load poojas', 'error'))
  }, [])

  const config = useMemo(() => ({
    title: 'Festival Master', subtitle: 'Configure temple festivals and their associated poojas.',
    api: FestivalsAPI, entity: 'festival', addLabel: 'Add New Festival', searchPlaceholder: 'Search by name or code…',
    statCards: [
      { key: 'total', icon: CalendarDays, color: '#8a1c1c', bg: 'bg-maroon-50', title: 'Total Festivals', sub: 'All festivals' },
      { key: 'active', icon: CheckCircle2, color: '#059669', bg: 'bg-emerald-50', title: 'Active', sub: 'Currently active' },
      { key: 'upcoming', icon: CalendarClock, color: '#d97706', bg: 'bg-amber-50', title: 'Upcoming', sub: 'Yet to start' },
    ],
    sortColumns: [
      { key: 'name', label: 'Festival Name', type: 'text' },
      { key: 'start_date', label: 'Start Date', type: 'date' },
      { key: 'status', label: 'Status', type: 'text' },
    ],
    columns: [
      { key: 'code', label: tr('Festival ID'), mono: true },
      { key: 'name', label: tr('Festival Name'), strong: true },
      { key: 'start_date', label: tr('Start Date'), render: (r) => fmtDate(r.start_date) },
      { key: 'end_date', label: tr('End Date'), render: (r) => fmtDate(r.end_date) },
      { key: 'poojas', label: tr('Associated Poojas'), render: (r) => (r.poojas?.length ? <div className="flex flex-wrap gap-1">{r.poojas.slice(0, 3).map((p) => <Pill key={p.id} tone="maroon">{p.name}</Pill>)}{r.poojas.length > 3 && <span className="text-[0.6875rem] text-gray-400">+{r.poojas.length - 3}</span>}</div> : '—') },
    ],
    fields: [
      { k: 'name', label: tr('Festival Name'), type: 'name', required: true },
      {
        k: 'panchangam_ref', label: '', type: 'custom',
        render: (data, setD) => <PanchangamReference data={data} setD={setD} />,
      },
      { k: 'start_date', label: tr('Start Date'), type: 'date', required: true },
      { k: 'end_date', label: tr('End Date'), type: 'date' },
      { k: 'pooja_ids', label: tr('Associated Poojas'), type: 'multiselect', options: poojaOptions },
      {
        k: 'plan_fees', label: 'Committee Prices (set once for this festival)', type: 'custom', default: {},
        render: (data, setD) => {
          const selected = poojaAll.filter((p) => (data.pooja_ids || []).includes(p.id))
          const rows = selected.flatMap((p) => (p.plans || []).filter((pl) => pl.committee_decided).map((pl) => ({ p, pl })))
          if (!rows.length) return <div className="text-[0.75rem] text-gray-400"><T>Select the festival's poojas above — their committee-decided plans appear here for pricing.</T></div>
          return (
            <div className="space-y-2">
              {rows.map(({ p, pl }) => (
                <div key={pl.id} className="flex items-center gap-2">
                  <span className="flex-1 text-[0.8125rem] text-gray-700">{p.name} · {pl.plan_name}</span>
                  <NumberField min="0" step="1" prefix="₹" className="!py-1.5 w-32" placeholder={tr("Amount")}
                    value={(data.plan_fees || {})[String(pl.id)] ?? ''}
                    onChange={(e) => {
                      const nf = { ...(data.plan_fees || {}) }
                      if (e.target.value === '') delete nf[String(pl.id)]
                      else nf[String(pl.id)] = Number(e.target.value)
                      setD({ plan_fees: nf })
                    }} />
                </div>
              ))}
              <div className="text-[0.6875rem] text-gray-400"><T>Bookings automatically use these committee prices — no manual entry at the counter.</T></div>
            </div>
          )
        },
      },
      { k: 'status', label: tr('Status'), type: 'select', options: ['Active', 'Inactive'], default: 'Active' },
      { k: 'description', label: tr('Description'), type: 'textarea' },
    ],
  }), [poojaOptions, poojaAll])

  return <MasterScreen key={poojaOptions.length} config={config} />
}
