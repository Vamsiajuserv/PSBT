// ── Themed form widgets: Select + DateField ─────────────────────────────────
// Drop-in replacements for native <select> and <input type="date">. The native
// widgets render their popups as OS-level windows (outside the browser tab,
// unstylable, different on every OS); these render an in-app popover instead —
// portalled to <body>, positioned against the trigger, flipped above when there
// is no room below, and never clipped by drawer/table overflow.
//
// Both emit onChange({ target: { value } }) so every existing handler written
// for the native controls keeps working unchanged. `required` still blocks an
// empty form submit via an invisible proxy input that focuses open the widget.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang, tr, clock12 } from '../../i18n/LanguageContext.jsx'
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Calendar as CalendarIcon, Check, Clock, Search, X,
} from 'lucide-react'

// ── shared popover plumbing ─────────────────────────────────────────────────

// Fixed-position style for a popover anchored to `triggerRef`, recomputed on
// scroll/resize; opens upward when the space below is too small.
function usePopoverPosition(open, triggerRef, prefer = 300, minW = 190) {
  const [pos, setPos] = useState(null)
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect()
      if (!r) return
      const vh = window.innerHeight
      const vw = window.innerWidth
      const below = vh - r.bottom
      const openUp = below < Math.min(prefer, 260) && r.top > below
      const maxH = Math.max(180, Math.min(prefer, (openUp ? r.top : below) - 12))
      const width = Math.min(Math.max(r.width, minW), vw - 16)
      const left = Math.min(Math.max(8, r.left), Math.max(8, vw - width - 8))
      setPos({
        top: openUp ? undefined : r.bottom + 4,
        bottom: openUp ? vh - r.top + 4 : undefined,
        left, width, maxHeight: maxH,
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, triggerRef, prefer, minW])
  return pos
}

// Close when clicking anywhere outside the trigger or the popover.
function useOutsideClose(open, refs, close) {
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (refs.some((r) => r.current && r.current.contains(e.target))) return
      close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, refs, close])
}

function Popover({ pos, popRef, children }) {
  if (!pos) return null
  return createPortal(
    <div
      ref={popRef}
      style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, zIndex: 9999 }}
      className="rounded-xl border border-gold-200 bg-white shadow-xl shadow-maroon-900/10 overflow-hidden"
    >
      {children}
    </div>,
    document.body,
  )
}

// Invisible proxy that keeps native `required` form validation working: an
// empty value blocks submit, and the browser's focus lands here → open widget.
function RequiredProxy({ value, onFocus }) {
  return (
    <input
      tabIndex={-1}
      aria-hidden="true"
      required
      value={value ?? ''}
      onChange={() => {}}
      onFocus={onFocus}
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
    />
  )
}

// ── Select ──────────────────────────────────────────────────────────────────

// Native <option>/<optgroup> children → flat list (group headers inline), with
// native semantics: values stringified, label used as value when none given.
function collectOptions(children, out = []) {
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return
    if (c.type === 'optgroup') {
      out.push({ group: c.props.label })
      collectOptions(c.props.children, out)
    } else if (c.type === 'option') {
      const label = React.Children.toArray(c.props.children)
        .map((x) => (typeof x === 'string' || typeof x === 'number' ? x : ''))
        .join('')
      out.push({
        value: c.props.value !== undefined ? String(c.props.value) : label,
        label,
        disabled: !!c.props.disabled,
      })
    } else if (Array.isArray(c.props?.children) || React.isValidElement(c.props?.children)) {
      collectOptions(c.props.children, out) // tolerate fragments/wrappers
    }
  })
  return out
}

export function Select({ value, onChange, children, className = '', disabled = false, required = false, title, placeholder, 'aria-label': ariaLabel }) {
  const { t } = useLang()
  const opts = useMemo(() => collectOptions(children), [children])
  const items = opts.filter((o) => !o.group)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  const searchRef = useRef(null)
  const pos = usePopoverPosition(open, triggerRef)
  useOutsideClose(open, [triggerRef, popRef], () => setOpen(false))

  const val = value === undefined || value === null ? '' : String(value)
  const current = items.find((o) => o.value === val)
  const searchable = items.length > 10
  const q = query.trim().toLowerCase()
  const shown = q ? opts.filter((o) => o.group || o.label.toLowerCase().includes(q)) : opts

  useEffect(() => { if (open) { setQuery(''); setActive(-1); setTimeout(() => searchRef.current?.focus(), 0) } }, [open])

  const pick = (o) => {
    if (o.disabled) return
    setOpen(false)
    triggerRef.current?.focus()
    if (o.value !== val) onChange?.({ target: { value: o.value } })
  }

  const selectable = shown.filter((o) => !o.group && !o.disabled)
  const onKey = (e) => {
    if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      if (!selectable.length) return
      const dir = e.key === 'ArrowDown' ? 1 : -1
      const cur = selectable.findIndex((o) => o === shown.filter((x) => !x.group)[active])
      const next = selectable[(cur + dir + selectable.length) % selectable.length]
      setActive(shown.filter((x) => !x.group).indexOf(next))
    }
    if (e.key === 'Enter') {
      const flat = shown.filter((x) => !x.group)
      if (open && active >= 0 && flat[active]) { e.preventDefault(); pick(flat[active]) }
      else if (!open) { e.preventDefault(); setOpen(true) }
    }
  }

  let flatIdx = -1
  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel || title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        className={`input flex items-center justify-between gap-2 text-left disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent ${open ? 'ring-2 ring-gold-400 border-transparent' : ''} ${className}`}
      >
        <span className={`truncate ${current && current.label ? 'text-gray-800' : 'text-gray-400'}`}>
          {t(current?.label || placeholder || (items[0]?.label ?? 'Select…'))}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-maroon-700/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {required && !disabled && <RequiredProxy value={val} onFocus={() => setOpen(true)} />}
      {open && (
        <Popover pos={pos} popRef={popRef}>
          {searchable && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gold-100 bg-cream/50">
              <Search size={13} className="text-maroon-700/50 shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(-1) }}
                onKeyDown={onKey}
                placeholder={t('Search…')}
                className="w-full bg-transparent text-[0.8125rem] outline-none placeholder:text-gray-400"
              />
              {query && <button type="button" onClick={() => setQuery('')} className="text-gray-400 hover:text-maroon-700"><X size={13} /></button>}
            </div>
          )}
          <div className="overflow-y-auto py-1" role="listbox" aria-label={t('Options')} style={{ maxHeight: (pos?.maxHeight ?? 300) - (searchable ? 40 : 0) }}>
            {shown.length === 0 && <div className="px-3 py-2.5 text-[0.8125rem] text-gray-400">{t('No matches')}</div>}
            {shown.map((o, i) => {
              if (o.group) {
                return <div key={`g${i}`} role="presentation" className="px-3 pt-2 pb-1 text-[0.625rem] font-bold uppercase tracking-wider text-maroon-700/60">{o.group}</div>
              }
              flatIdx += 1
              const idx = flatIdx
              const sel = o.value === val
              return (
                <button
                  key={`${o.value}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={sel}
                  disabled={o.disabled}
                  onClick={() => pick(o)}
                  onMouseEnter={() => setActive(idx)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[0.8125rem] transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gold-400 ${
                    o.disabled ? 'text-gray-300 cursor-not-allowed'
                      : sel ? 'bg-maroon-800 text-cream font-semibold'
                        : idx === active ? 'bg-gold-100/70 text-maroon-900' : 'text-gray-700 hover:bg-gold-100/70'
                  }`}
                >
                  <span className="truncate">{o.label ? t(o.label) : <span className="text-gray-400">—</span>}</span>
                  {sel && <Check size={14} className="shrink-0" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </Popover>
      )}
    </>
  )
}

// ── MultiSelect ─────────────────────────────────────────────────────────────
// Multi-select dropdown for filters with "Select All" capability

export function MultiSelect({ value = [], onChange, children, className = '', disabled = false, placeholder = 'Select…', title, allLabel = 'Select All' }) {
  const { t } = useLang()
  const opts = useMemo(() => collectOptions(children), [children])
  const items = opts.filter((o) => !o.group)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  const searchRef = useRef(null)
  const pos = usePopoverPosition(open, triggerRef)
  useOutsideClose(open, [triggerRef, popRef], () => setOpen(false))

  const vals = new Set(value)
  const searchable = items.length > 10
  const q = query.trim().toLowerCase()
  const shown = q ? opts.filter((o) => o.group || o.label.toLowerCase().includes(q)) : opts

  useEffect(() => { if (open) { setQuery(''); setTimeout(() => searchRef.current?.focus(), 0) } }, [open])

  const toggle = (v) => {
    const next = new Set(vals)
    next.has(v) ? next.delete(v) : next.add(v)
    onChange?.({ target: { value: [...next] } })
  }

  const selectAll = () => {
    const all = items.filter((o) => !o.disabled).map((o) => o.value)
    onChange?.({ target: { value: all } })
  }

  const clearAll = () => onChange?.({ target: { value: [] } })

  const allSelected = items.filter((o) => !o.disabled).every((o) => vals.has(o.value))

  const displayLabel = vals.size === 0 ? placeholder
    : vals.size === 1 ? items.find((o) => vals.has(o.value))?.label || '1 selected'
      : vals.size === items.length ? t('All selected')
        : `${vals.size} ${t('selected')}`

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={`input flex items-center justify-between gap-2 text-left disabled:bg-gray-50 disabled:text-gray-400 ${open ? 'ring-2 ring-gold-400 border-transparent' : ''} ${className}`}
      >
        <span className={`truncate ${vals.size > 0 ? 'text-gray-800' : 'text-gray-400'}`}>
          {t(displayLabel)}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-maroon-700/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <Popover pos={pos} popRef={popRef}>
          {searchable && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gold-100 bg-cream/50">
              <Search size={13} className="text-maroon-700/50 shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Search…')}
                className="w-full bg-transparent text-[0.8125rem] outline-none placeholder:text-gray-400"
              />
              {query && <button type="button" onClick={() => setQuery('')} className="text-gray-400 hover:text-maroon-700"><X size={13} /></button>}
            </div>
          )}
          <div className="px-3 py-2 border-b border-gold-100 flex items-center justify-between gap-2">
            <button type="button" onClick={allSelected ? clearAll : selectAll} className="text-[0.75rem] font-semibold text-maroon-700 hover:text-maroon-900">
              {allSelected ? t('Clear All') : t(allLabel)}
            </button>
            {vals.size > 0 && <span className="text-[0.75rem] text-gray-400">{vals.size} {t('selected')}</span>}
          </div>
          <div className="overflow-y-auto py-1" style={{ maxHeight: (pos?.maxHeight ?? 300) - (searchable ? 80 : 40) }}>
            {shown.length === 0 && <div className="px-3 py-2.5 text-[0.8125rem] text-gray-400">{t('No matches')}</div>}
            {shown.map((o, i) => {
              if (o.group) {
                return <div key={`g${i}`} className="px-3 pt-2 pb-1 text-[0.625rem] font-bold uppercase tracking-wider text-maroon-700/60">{o.group}</div>
              }
              const sel = vals.has(o.value)
              return (
                <button
                  key={`${o.value}-${i}`}
                  type="button"
                  disabled={o.disabled}
                  onClick={() => toggle(o.value)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] transition-colors ${
                    o.disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gold-100/70'
                  }`}
                >
                  <span className={`w-[1.125rem] h-[1.125rem] shrink-0 rounded-[0.3125rem] border grid place-items-center transition-colors ${
                    sel ? 'bg-maroon-800 border-maroon-800 text-cream' : 'bg-white border-gold-300'
                  }`}>
                    {sel && <Check size={12} strokeWidth={3.5} />}
                  </span>
                  <span className="truncate">{o.label ? t(o.label) : <span className="text-gray-400">—</span>}</span>
                </button>
              )
            })}
          </div>
        </Popover>
      )}
    </>
  )
}

// ── Date / time widgets ─────────────────────────────────────────────────────

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmt = (s) => {
  if (!s) return ''
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return s
  // The month is a word and translates; the numerals are data.
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/[A-Za-z]{3,}/g, (w) => tr(w))
}
const fmt12 = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return t
  const ap = h >= 12 ? 'PM' : 'AM'
  return clock12(`${String(h % 12 || 12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${ap}`)
}
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function NavBtn({ onClick, children, label }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="w-7 h-7 grid place-items-center rounded-lg text-maroon-700/70 hover:bg-gold-100 hover:text-maroon-900 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-400">{children}</button>
  )
}

// Month grid + year-jump header, shared by DateField and DateTimeField. Mounts
// fresh each time a popover opens, so view state can simply init from props.
function CalendarPanel({ value, min, max, onPick }) {
  const todayIso = iso(new Date())
  const base = value || (min && min > todayIso ? min : max && max < todayIso ? max : todayIso)
  const [view, setView] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 })
  const [mode, setMode] = useState('days') // 'days' | 'years' (year-jump grid)

  const inRange = (s) => (!min || s >= min) && (!max || s <= max)
  const nav = (dy, dm) => setView(({ y, m }) => {
    const d = new Date(y + dy, m + dm, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const first = new Date(view.y, view.m, 1)
  const cells = []
  for (let i = 0; i < first.getDay(); i++) cells.push(null)
  const days = new Date(view.y, view.m + 1, 0).getDate()
  for (let d = 1; d <= days; d++) cells.push(d)

  return (
    <div style={{ minWidth: 270 }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex">
          <NavBtn onClick={() => (mode === 'years' ? setView((v) => ({ ...v, y: v.y - 12 })) : nav(-1, 0))} label={tr("Previous year")}><ChevronsLeft size={15} /></NavBtn>
          {mode === 'days' && <NavBtn onClick={() => nav(0, -1)} label={tr("Previous month")}><ChevronLeft size={15} /></NavBtn>}
        </div>
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'days' ? 'years' : 'days'))}
          title={tr("Jump to a year")}
          className="text-[0.8125rem] font-bold text-maroon-800 rounded-lg px-2 py-0.5 hover:bg-gold-100 transition-colors"
        >
          {mode === 'days' ? `${tr(MONTHS[view.m])} ${view.y}` : `${view.y - 5} – ${view.y + 6}`}
        </button>
        <div className="flex">
          {mode === 'days' && <NavBtn onClick={() => nav(0, 1)} label={tr("Next month")}><ChevronRight size={15} /></NavBtn>}
          <NavBtn onClick={() => (mode === 'years' ? setView((v) => ({ ...v, y: v.y + 12 })) : nav(1, 0))} label={tr("Next year")}><ChevronsRight size={15} /></NavBtn>
        </div>
      </div>
      {mode === 'years' && (
        <div className="grid grid-cols-4 gap-1 py-1">
          {Array.from({ length: 12 }, (_, i) => view.y - 5 + i).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => { setView((v) => ({ ...v, y })); setMode('days') }}
              className={`h-9 rounded-lg text-[0.78125rem] transition-colors ${
                y === view.y ? 'bg-maroon-800 text-cream font-bold' : 'text-gray-700 hover:bg-gold-100'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      )}
      {mode === 'days' && (<>
        <div className="grid grid-cols-7 mb-1">
          {DOW.map((d) => <div key={d} className="h-7 grid place-items-center text-[0.625rem] font-bold uppercase text-maroon-700/50">{tr(d)}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />
            const s = `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            const ok = inRange(s)
            const sel = s === value
            const today = s === todayIso
            return (
              <button
                key={s}
                type="button"
                disabled={!ok}
                onClick={() => onPick(s)}
                className={`h-8 w-8 mx-auto grid place-items-center rounded-full text-[0.78125rem] transition-colors ${
                  sel ? 'bg-maroon-800 text-cream font-bold'
                    : !ok ? 'text-gray-300 cursor-not-allowed'
                      : today ? 'ring-1 ring-gold-400 text-maroon-800 font-semibold hover:bg-gold-100'
                        : 'text-gray-700 hover:bg-gold-100'
                }`}
              >
                {d}
              </button>
            )
          })}
        </div>
      </>)}
    </div>
  )
}

// Hour / minute / AM-PM columns. Value is 24h "HH:MM" (native input format);
// minutes step by 5 with the current off-step value kept selectable.
function TimeCol({ items, sel, render, onPick }) {
  const ref = useRef(null)
  // Center the selected entry within the column only (scrollIntoView would also
  // scroll the page/drawer behind the popover).
  useEffect(() => {
    const box = ref.current
    const el = box?.querySelector('[data-sel="1"]')
    if (box && el) box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className="overflow-y-auto max-h-44 w-14 space-y-0.5 pr-0.5">
      {items.map((it) => (
        <button
          key={it}
          type="button"
          data-sel={it === sel ? '1' : undefined}
          onClick={() => onPick(it)}
          className={`w-full h-8 rounded-lg text-[0.78125rem] transition-colors ${
            it === sel ? 'bg-maroon-800 text-cream font-bold' : 'text-gray-700 hover:bg-gold-100'
          }`}
        >
          {render(it)}
        </button>
      ))}
    </div>
  )
}

function TimePanel({ value, onChange }) {
  const [hs, ms] = (value || '').split(':')
  const h24 = hs ? Number(hs) : null
  const mm = ms !== undefined && ms !== '' ? Number(ms) : null
  const ap = h24 === null ? null : h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 === null ? null : h24 % 12 || 12

  const emit = ({ h = h12, m = mm, a = ap } = {}) => {
    const hh12 = h ?? 12
    const mmm = m ?? 0
    const aap = a ?? 'AM'
    let hh = hh12 % 12
    if (aap === 'PM') hh += 12
    onChange(`${String(hh).padStart(2, '0')}:${String(mmm).padStart(2, '0')}`)
  }

  const minutes = Array.from({ length: 12 }, (_, i) => i * 5)
  if (mm !== null && !minutes.includes(mm)) { minutes.push(mm); minutes.sort((a, b) => a - b) }

  return (
    <div className="flex gap-1">
      <TimeCol items={Array.from({ length: 12 }, (_, i) => i + 1)} sel={h12} render={(h) => String(h).padStart(2, '0')} onPick={(h) => emit({ h })} />
      <TimeCol items={minutes} sel={mm} render={(m) => String(m).padStart(2, '0')} onPick={(m) => emit({ m })} />
      <TimeCol items={['AM', 'PM']} sel={ap} render={(a) => tr(a)} onPick={(a) => emit({ a })} />
    </div>
  )
}

// Shared trigger button for the date/time fields.
function FieldTrigger({ triggerRef, open, setOpen, disabled, title, className, label, empty, icon: Icon, ariaLabel }) {
  return (
    <button
      type="button"
      ref={triggerRef}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel || title || label}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) } }}
      className={`input flex items-center justify-between gap-2 text-left disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent ${open ? 'ring-2 ring-gold-400 border-transparent' : ''} ${className}`}
    >
      <span className={`truncate ${empty ? 'text-gray-400' : 'text-gray-800'}`}>{label}</span>
      <Icon size={15} className="shrink-0 text-maroon-700/50" aria-hidden="true" />
    </button>
  )
}

export function DateField({ value, onChange, min, max, required = false, disabled = false, className = '', placeholder = tr('Select date'), title }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  const pos = usePopoverPosition(open, triggerRef, 340, 290)
  useOutsideClose(open, [triggerRef, popRef], () => setOpen(false))

  const todayIso = iso(new Date())
  const inRange = (s) => (!min || s >= min) && (!max || s <= max)
  const set = (s) => { setOpen(false); triggerRef.current?.focus(); if (s !== (value || '')) onChange?.({ target: { value: s } }) }

  return (
    <>
      <FieldTrigger triggerRef={triggerRef} open={open} setOpen={setOpen} disabled={disabled} title={title}
        className={className} empty={!value} label={value ? fmt(value) : t(placeholder)} icon={CalendarIcon} />
      {required && !disabled && <RequiredProxy value={value ?? ''} onFocus={() => setOpen(true)} />}
      {open && (
        <Popover pos={pos} popRef={popRef}>
          <div className="p-3 select-none">
            <CalendarPanel value={value} min={min} max={max} onPick={set} />
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gold-100">
              <button
                type="button"
                disabled={!inRange(todayIso)}
                onClick={() => set(todayIso)}
                className="text-[0.75rem] font-semibold text-maroon-700 hover:text-maroon-900 disabled:text-gray-300"
              >
                {t('Today')}
              </button>
              {!required && value && (
                <button type="button" onClick={() => set('')} className="text-[0.75rem] font-semibold text-gray-400 hover:text-red-600">{t('Clear')}</button>
              )}
            </div>
          </div>
        </Popover>
      )}
    </>
  )
}

// Time-only field — value is 24h "HH:MM" like a native <input type="time">.
export function TimeField({ value, onChange, required = false, disabled = false, className = '', placeholder = tr('Select time'), title }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  const pos = usePopoverPosition(open, triggerRef, 320, 230)
  useOutsideClose(open, [triggerRef, popRef], () => setOpen(false))

  const emit = (t) => { if (t !== (value || '')) onChange?.({ target: { value: t } }) }

  return (
    <>
      <FieldTrigger triggerRef={triggerRef} open={open} setOpen={setOpen} disabled={disabled} title={title}
        className={className} empty={!value} label={value ? fmt12(value) : t(placeholder)} icon={Clock} />
      {required && !disabled && <RequiredProxy value={value ?? ''} onFocus={() => setOpen(true)} />}
      {open && (
        <Popover pos={pos} popRef={popRef}>
          <div className="p-3 select-none">
            <div className="flex justify-center"><TimePanel value={value} onChange={emit} /></div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gold-100">
              <button type="button" onClick={() => emit(nowHHMM())} className="text-[0.75rem] font-semibold text-maroon-700 hover:text-maroon-900">{t('Now')}</button>
              <div className="flex items-center gap-3">
                {!required && value && (
                  <button type="button" onClick={() => { emit(''); setOpen(false) }} className="text-[0.75rem] font-semibold text-gray-400 hover:text-red-600">{t('Clear')}</button>
                )}
                <button type="button" onClick={() => { setOpen(false); triggerRef.current?.focus() }} className="px-3 py-1.5 rounded-lg text-[0.75rem] font-bold text-white bg-maroon-800 hover:bg-maroon-900">{t('Done')}</button>
              </div>
            </div>
          </div>
        </Popover>
      )}
    </>
  )
}

// Combined date + time — value is "YYYY-MM-DDTHH:MM" like a native
// <input type="datetime-local">. Picking either part fills the other with a
// sensible default (today / the current time) so the value is always complete.
export function DateTimeField({ value, onChange, min, max, required = false, disabled = false, className = '', placeholder = tr('Select date & time'), title }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  const pos = usePopoverPosition(open, triggerRef, 380, 420)
  useOutsideClose(open, [triggerRef, popRef], () => setOpen(false))

  const [datePart, timePart] = (value || '').split('T')
  const emit = (d, t) => { const v = d && t ? `${d}T${t}` : ''; if (v !== (value || '')) onChange?.({ target: { value: v } }) }

  return (
    <>
      <FieldTrigger triggerRef={triggerRef} open={open} setOpen={setOpen} disabled={disabled} title={title}
        className={className} empty={!value}
        label={value ? `${fmt(datePart)} · ${fmt12(timePart)}` : t(placeholder)} icon={CalendarIcon} />
      {required && !disabled && <RequiredProxy value={value ?? ''} onFocus={() => setOpen(true)} />}
      {open && (
        <Popover pos={pos} popRef={popRef}>
          <div className="p-3 select-none">
            <div className="flex gap-3">
              <CalendarPanel value={datePart || ''} min={min} max={max} onPick={(d) => emit(d, timePart || nowHHMM())} />
              <div className="border-l border-gold-100 pl-3">
                <div className="text-[0.625rem] font-bold uppercase tracking-wider text-maroon-700/50 mb-1.5 text-center">{t('Time')}</div>
                <TimePanel value={timePart || ''} onChange={(t) => emit(datePart || iso(new Date()), t)} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gold-100">
              <button type="button" onClick={() => emit(iso(new Date()), nowHHMM())} className="text-[0.75rem] font-semibold text-maroon-700 hover:text-maroon-900">{t('Now')}</button>
              <div className="flex items-center gap-3">
                {!required && value && (
                  <button type="button" onClick={() => { emit('', ''); setOpen(false) }} className="text-[0.75rem] font-semibold text-gray-400 hover:text-red-600">{t('Clear')}</button>
                )}
                <button type="button" onClick={() => { setOpen(false); triggerRef.current?.focus() }} className="px-3 py-1.5 rounded-lg text-[0.75rem] font-bold text-white bg-maroon-800 hover:bg-maroon-900">{t('Done')}</button>
              </div>
            </div>
          </div>
        </Popover>
      )}
    </>
  )
}

// ── NumberField ─────────────────────────────────────────────────────────────
// Styled number input: optional prefix (₹ for amounts), native spinner arrows
// hidden. The wrapping label carries the `.input` styling plus any className
// overrides, so it occupies exactly the layout slot the old input did; native
// `required`/`min`/`max` validation stays on the real inner input.
// Blocks 'e', '+', '-' keys to prevent scientific notation and signs.
export function NumberField({ value, onChange, prefix, min, max, step, required = false, disabled = false, placeholder, className = '', inputClass = '', title, innerRef }) {
  // Block non-numeric keys (e, E, +, -)
  const handleKeyDown = (e) => {
    if (['e', 'E', '+', '-'].includes(e.key)) {
      e.preventDefault()
    }
  }
  // Sanitize pasted content - only allow digits and decimal point
  const handleChange = (e) => {
    const sanitized = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
    onChange({ target: { value: sanitized } })
  }
  return (
    <label
      title={title}
      className={`input flex items-center gap-1.5 cursor-text focus-within:ring-2 focus-within:ring-gold-400 focus-within:border-transparent ${disabled ? 'bg-gray-50' : ''} ${className}`}
    >
      {prefix && <span className={`shrink-0 select-none font-medium ${disabled ? 'text-gray-300' : 'text-maroon-700/60'}`}>{prefix}</span>}
      <input
        ref={innerRef}
        type="number"
        className={`no-spin w-full min-w-0 bg-transparent outline-none border-0 p-0 disabled:text-gray-400 placeholder:text-gray-400 ${inputClass}`}
        value={value ?? ''}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        min={min}
        max={max}
        step={step}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
      />
    </label>
  )
}

// ── Checkbox / Toggle ───────────────────────────────────────────────────────
// Themed replacements for the native grey controls. Both emit
// onChange({ target: { checked } }) and are labelable (work inside <label>).

export function Checkbox({ checked, onChange, disabled = false, className = '', 'aria-label': ariaLabel }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange?.({ target: { checked: !checked } })}
      className={`w-[1.125rem] h-[1.125rem] shrink-0 rounded-[0.3125rem] border grid place-items-center transition-colors focus:outline-none focus:ring-2 focus:ring-gold-400 focus:ring-offset-1 ${
        checked ? 'bg-maroon-800 border-maroon-800 text-cream' : 'bg-white border-gold-300 hover:border-maroon-400'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}
    >
      {checked && <Check size={12} strokeWidth={3.5} aria-hidden="true" />}
    </button>
  )
}

export function Toggle({ checked, onChange, disabled = false, className = '', title, 'aria-label': ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={ariaLabel || title}
      disabled={disabled}
      title={title}
      onClick={() => onChange?.({ target: { checked: !checked } })}
      className={`relative shrink-0 h-[1.375rem] w-10 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold-400 focus:ring-offset-2 ${
        checked ? 'bg-maroon-800' : 'bg-gray-300'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}
    >
      <span className={`absolute top-[0.1875rem] left-[0.1875rem] h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[1.125rem]' : ''}`} aria-hidden="true" />
    </button>
  )
}

// ── Country Codes ────────────────────────────────────────────────────────────
// International country codes for mobile number input

export const COUNTRY_CODES = [
  // Asia
  { code: '+91', country: 'India', abbr: 'IN', flag: '🇮🇳', digits: 10 },
  { code: '+86', country: 'China', abbr: 'CN', flag: '🇨🇳', digits: 11 },
  { code: '+81', country: 'Japan', abbr: 'JP', flag: '🇯🇵', digits: 10 },
  { code: '+82', country: 'South Korea', abbr: 'KR', flag: '🇰🇷', digits: 10 },
  { code: '+850', country: 'North Korea', abbr: 'KP', flag: '🇰🇵', digits: 10 },
  { code: '+852', country: 'Hong Kong', abbr: 'HK', flag: '🇭🇰', digits: 8 },
  { code: '+853', country: 'Macau', abbr: 'MO', flag: '🇲🇴', digits: 8 },
  { code: '+886', country: 'Taiwan', abbr: 'TW', flag: '🇹🇼', digits: 9 },
  { code: '+65', country: 'Singapore', abbr: 'SG', flag: '🇸🇬', digits: 8 },
  { code: '+60', country: 'Malaysia', abbr: 'MY', flag: '🇲🇾', digits: 10 },
  { code: '+62', country: 'Indonesia', abbr: 'ID', flag: '🇮🇩', digits: 12 },
  { code: '+63', country: 'Philippines', abbr: 'PH', flag: '🇵🇭', digits: 10 },
  { code: '+66', country: 'Thailand', abbr: 'TH', flag: '🇹🇭', digits: 9 },
  { code: '+84', country: 'Vietnam', abbr: 'VN', flag: '🇻🇳', digits: 9 },
  { code: '+95', country: 'Myanmar', abbr: 'MM', flag: '🇲🇲', digits: 10 },
  { code: '+855', country: 'Cambodia', abbr: 'KH', flag: '🇰🇭', digits: 9 },
  { code: '+856', country: 'Laos', abbr: 'LA', flag: '🇱🇦', digits: 10 },
  { code: '+673', country: 'Brunei', abbr: 'BN', flag: '🇧🇳', digits: 7 },
  { code: '+670', country: 'Timor-Leste', abbr: 'TL', flag: '🇹🇱', digits: 8 },
  { code: '+880', country: 'Bangladesh', abbr: 'BD', flag: '🇧🇩', digits: 10 },
  { code: '+92', country: 'Pakistan', abbr: 'PK', flag: '🇵🇰', digits: 10 },
  { code: '+93', country: 'Afghanistan', abbr: 'AF', flag: '🇦🇫', digits: 9 },
  { code: '+94', country: 'Sri Lanka', abbr: 'LK', flag: '🇱🇰', digits: 9 },
  { code: '+977', country: 'Nepal', abbr: 'NP', flag: '🇳🇵', digits: 10 },
  { code: '+975', country: 'Bhutan', abbr: 'BT', flag: '🇧🇹', digits: 8 },
  { code: '+960', country: 'Maldives', abbr: 'MV', flag: '🇲🇻', digits: 7 },
  { code: '+976', country: 'Mongolia', abbr: 'MN', flag: '🇲🇳', digits: 8 },
  // Middle East
  { code: '+971', country: 'UAE', abbr: 'AE', flag: '🇦🇪', digits: 9 },
  { code: '+966', country: 'Saudi Arabia', abbr: 'SA', flag: '🇸🇦', digits: 9 },
  { code: '+974', country: 'Qatar', abbr: 'QA', flag: '🇶🇦', digits: 8 },
  { code: '+965', country: 'Kuwait', abbr: 'KW', flag: '🇰🇼', digits: 8 },
  { code: '+973', country: 'Bahrain', abbr: 'BH', flag: '🇧🇭', digits: 8 },
  { code: '+968', country: 'Oman', abbr: 'OM', flag: '🇴🇲', digits: 8 },
  { code: '+967', country: 'Yemen', abbr: 'YE', flag: '🇾🇪', digits: 9 },
  { code: '+964', country: 'Iraq', abbr: 'IQ', flag: '🇮🇶', digits: 10 },
  { code: '+98', country: 'Iran', abbr: 'IR', flag: '🇮🇷', digits: 10 },
  { code: '+962', country: 'Jordan', abbr: 'JO', flag: '🇯🇴', digits: 9 },
  { code: '+961', country: 'Lebanon', abbr: 'LB', flag: '🇱🇧', digits: 8 },
  { code: '+963', country: 'Syria', abbr: 'SY', flag: '🇸🇾', digits: 9 },
  { code: '+972', country: 'Israel', abbr: 'IL', flag: '🇮🇱', digits: 9 },
  { code: '+970', country: 'Palestine', abbr: 'PS', flag: '🇵🇸', digits: 9 },
  { code: '+90', country: 'Turkey', abbr: 'TR', flag: '🇹🇷', digits: 10 },
  { code: '+357', country: 'Cyprus', abbr: 'CY', flag: '🇨🇾', digits: 8 },
  // Europe
  { code: '+44', country: 'United Kingdom', abbr: 'UK', flag: '🇬🇧', digits: 10 },
  { code: '+49', country: 'Germany', abbr: 'DE', flag: '🇩🇪', digits: 11 },
  { code: '+33', country: 'France', abbr: 'FR', flag: '🇫🇷', digits: 9 },
  { code: '+39', country: 'Italy', abbr: 'IT', flag: '🇮🇹', digits: 10 },
  { code: '+34', country: 'Spain', abbr: 'ES', flag: '🇪🇸', digits: 9 },
  { code: '+351', country: 'Portugal', abbr: 'PT', flag: '🇵🇹', digits: 9 },
  { code: '+31', country: 'Netherlands', abbr: 'NL', flag: '🇳🇱', digits: 9 },
  { code: '+32', country: 'Belgium', abbr: 'BE', flag: '🇧🇪', digits: 9 },
  { code: '+352', country: 'Luxembourg', abbr: 'LU', flag: '🇱🇺', digits: 9 },
  { code: '+41', country: 'Switzerland', abbr: 'CH', flag: '🇨🇭', digits: 9 },
  { code: '+43', country: 'Austria', abbr: 'AT', flag: '🇦🇹', digits: 10 },
  { code: '+48', country: 'Poland', abbr: 'PL', flag: '🇵🇱', digits: 9 },
  { code: '+420', country: 'Czech Republic', abbr: 'CZ', flag: '🇨🇿', digits: 9 },
  { code: '+421', country: 'Slovakia', abbr: 'SK', flag: '🇸🇰', digits: 9 },
  { code: '+36', country: 'Hungary', abbr: 'HU', flag: '🇭🇺', digits: 9 },
  { code: '+40', country: 'Romania', abbr: 'RO', flag: '🇷🇴', digits: 10 },
  { code: '+359', country: 'Bulgaria', abbr: 'BG', flag: '🇧🇬', digits: 9 },
  { code: '+30', country: 'Greece', abbr: 'GR', flag: '🇬🇷', digits: 10 },
  { code: '+385', country: 'Croatia', abbr: 'HR', flag: '🇭🇷', digits: 9 },
  { code: '+386', country: 'Slovenia', abbr: 'SI', flag: '🇸🇮', digits: 8 },
  { code: '+381', country: 'Serbia', abbr: 'RS', flag: '🇷🇸', digits: 9 },
  { code: '+387', country: 'Bosnia', abbr: 'BA', flag: '🇧🇦', digits: 8 },
  { code: '+382', country: 'Montenegro', abbr: 'ME', flag: '🇲🇪', digits: 8 },
  { code: '+389', country: 'North Macedonia', abbr: 'MK', flag: '🇲🇰', digits: 8 },
  { code: '+355', country: 'Albania', abbr: 'AL', flag: '🇦🇱', digits: 9 },
  { code: '+383', country: 'Kosovo', abbr: 'XK', flag: '🇽🇰', digits: 8 },
  { code: '+353', country: 'Ireland', abbr: 'IE', flag: '🇮🇪', digits: 9 },
  { code: '+354', country: 'Iceland', abbr: 'IS', flag: '🇮🇸', digits: 7 },
  { code: '+46', country: 'Sweden', abbr: 'SE', flag: '🇸🇪', digits: 9 },
  { code: '+47', country: 'Norway', abbr: 'NO', flag: '🇳🇴', digits: 8 },
  { code: '+45', country: 'Denmark', abbr: 'DK', flag: '🇩🇰', digits: 8 },
  { code: '+358', country: 'Finland', abbr: 'FI', flag: '🇫🇮', digits: 9 },
  { code: '+372', country: 'Estonia', abbr: 'EE', flag: '🇪🇪', digits: 8 },
  { code: '+371', country: 'Latvia', abbr: 'LV', flag: '🇱🇻', digits: 8 },
  { code: '+370', country: 'Lithuania', abbr: 'LT', flag: '🇱🇹', digits: 8 },
  { code: '+375', country: 'Belarus', abbr: 'BY', flag: '🇧🇾', digits: 9 },
  { code: '+380', country: 'Ukraine', abbr: 'UA', flag: '🇺🇦', digits: 9 },
  { code: '+373', country: 'Moldova', abbr: 'MD', flag: '🇲🇩', digits: 8 },
  { code: '+7', country: 'Russia', abbr: 'RU', flag: '🇷🇺', digits: 10 },
  { code: '+374', country: 'Armenia', abbr: 'AM', flag: '🇦🇲', digits: 8 },
  { code: '+995', country: 'Georgia', abbr: 'GE', flag: '🇬🇪', digits: 9 },
  { code: '+994', country: 'Azerbaijan', abbr: 'AZ', flag: '🇦🇿', digits: 9 },
  { code: '+377', country: 'Monaco', abbr: 'MC', flag: '🇲🇨', digits: 8 },
  { code: '+376', country: 'Andorra', abbr: 'AD', flag: '🇦🇩', digits: 6 },
  { code: '+350', country: 'Gibraltar', abbr: 'GI', flag: '🇬🇮', digits: 8 },
  { code: '+356', country: 'Malta', abbr: 'MT', flag: '🇲🇹', digits: 8 },
  { code: '+378', country: 'San Marino', abbr: 'SM', flag: '🇸🇲', digits: 10 },
  { code: '+379', country: 'Vatican City', abbr: 'VA', flag: '🇻🇦', digits: 10 },
  { code: '+423', country: 'Liechtenstein', abbr: 'LI', flag: '🇱🇮', digits: 7 },
  // North America
  { code: '+1', country: 'USA', abbr: 'US', flag: '🇺🇸', digits: 10 },
  { code: '+1', country: 'Canada', abbr: 'CA', flag: '🇨🇦', digits: 10 },
  { code: '+52', country: 'Mexico', abbr: 'MX', flag: '🇲🇽', digits: 10 },
  { code: '+502', country: 'Guatemala', abbr: 'GT', flag: '🇬🇹', digits: 8 },
  { code: '+503', country: 'El Salvador', abbr: 'SV', flag: '🇸🇻', digits: 8 },
  { code: '+504', country: 'Honduras', abbr: 'HN', flag: '🇭🇳', digits: 8 },
  { code: '+505', country: 'Nicaragua', abbr: 'NI', flag: '🇳🇮', digits: 8 },
  { code: '+506', country: 'Costa Rica', abbr: 'CR', flag: '🇨🇷', digits: 8 },
  { code: '+507', country: 'Panama', abbr: 'PA', flag: '🇵🇦', digits: 8 },
  { code: '+501', country: 'Belize', abbr: 'BZ', flag: '🇧🇿', digits: 7 },
  { code: '+53', country: 'Cuba', abbr: 'CU', flag: '🇨🇺', digits: 8 },
  { code: '+1809', country: 'Dominican Republic', abbr: 'DO', flag: '🇩🇴', digits: 10 },
  { code: '+509', country: 'Haiti', abbr: 'HT', flag: '🇭🇹', digits: 8 },
  { code: '+1876', country: 'Jamaica', abbr: 'JM', flag: '🇯🇲', digits: 10 },
  { code: '+1868', country: 'Trinidad & Tobago', abbr: 'TT', flag: '🇹🇹', digits: 10 },
  { code: '+1246', country: 'Barbados', abbr: 'BB', flag: '🇧🇧', digits: 10 },
  { code: '+1242', country: 'Bahamas', abbr: 'BS', flag: '🇧🇸', digits: 10 },
  // South America
  { code: '+55', country: 'Brazil', abbr: 'BR', flag: '🇧🇷', digits: 11 },
  { code: '+54', country: 'Argentina', abbr: 'AR', flag: '🇦🇷', digits: 10 },
  { code: '+56', country: 'Chile', abbr: 'CL', flag: '🇨🇱', digits: 9 },
  { code: '+57', country: 'Colombia', abbr: 'CO', flag: '🇨🇴', digits: 10 },
  { code: '+58', country: 'Venezuela', abbr: 'VE', flag: '🇻🇪', digits: 10 },
  { code: '+51', country: 'Peru', abbr: 'PE', flag: '🇵🇪', digits: 9 },
  { code: '+593', country: 'Ecuador', abbr: 'EC', flag: '🇪🇨', digits: 9 },
  { code: '+591', country: 'Bolivia', abbr: 'BO', flag: '🇧🇴', digits: 8 },
  { code: '+595', country: 'Paraguay', abbr: 'PY', flag: '🇵🇾', digits: 9 },
  { code: '+598', country: 'Uruguay', abbr: 'UY', flag: '🇺🇾', digits: 8 },
  { code: '+592', country: 'Guyana', abbr: 'GY', flag: '🇬🇾', digits: 7 },
  { code: '+597', country: 'Suriname', abbr: 'SR', flag: '🇸🇷', digits: 7 },
  // Africa
  { code: '+20', country: 'Egypt', abbr: 'EG', flag: '🇪🇬', digits: 10 },
  { code: '+212', country: 'Morocco', abbr: 'MA', flag: '🇲🇦', digits: 9 },
  { code: '+213', country: 'Algeria', abbr: 'DZ', flag: '🇩🇿', digits: 9 },
  { code: '+216', country: 'Tunisia', abbr: 'TN', flag: '🇹🇳', digits: 8 },
  { code: '+218', country: 'Libya', abbr: 'LY', flag: '🇱🇾', digits: 9 },
  { code: '+249', country: 'Sudan', abbr: 'SD', flag: '🇸🇩', digits: 9 },
  { code: '+211', country: 'South Sudan', abbr: 'SS', flag: '🇸🇸', digits: 9 },
  { code: '+251', country: 'Ethiopia', abbr: 'ET', flag: '🇪🇹', digits: 9 },
  { code: '+254', country: 'Kenya', abbr: 'KE', flag: '🇰🇪', digits: 9 },
  { code: '+255', country: 'Tanzania', abbr: 'TZ', flag: '🇹🇿', digits: 9 },
  { code: '+256', country: 'Uganda', abbr: 'UG', flag: '🇺🇬', digits: 9 },
  { code: '+250', country: 'Rwanda', abbr: 'RW', flag: '🇷🇼', digits: 9 },
  { code: '+257', country: 'Burundi', abbr: 'BI', flag: '🇧🇮', digits: 8 },
  { code: '+253', country: 'Djibouti', abbr: 'DJ', flag: '🇩🇯', digits: 8 },
  { code: '+252', country: 'Somalia', abbr: 'SO', flag: '🇸🇴', digits: 8 },
  { code: '+291', country: 'Eritrea', abbr: 'ER', flag: '🇪🇷', digits: 7 },
  { code: '+234', country: 'Nigeria', abbr: 'NG', flag: '🇳🇬', digits: 10 },
  { code: '+233', country: 'Ghana', abbr: 'GH', flag: '🇬🇭', digits: 9 },
  { code: '+225', country: 'Ivory Coast', abbr: 'CI', flag: '🇨🇮', digits: 10 },
  { code: '+221', country: 'Senegal', abbr: 'SN', flag: '🇸🇳', digits: 9 },
  { code: '+223', country: 'Mali', abbr: 'ML', flag: '🇲🇱', digits: 8 },
  { code: '+226', country: 'Burkina Faso', abbr: 'BF', flag: '🇧🇫', digits: 8 },
  { code: '+227', country: 'Niger', abbr: 'NE', flag: '🇳🇪', digits: 8 },
  { code: '+228', country: 'Togo', abbr: 'TG', flag: '🇹🇬', digits: 8 },
  { code: '+229', country: 'Benin', abbr: 'BJ', flag: '🇧🇯', digits: 8 },
  { code: '+220', country: 'Gambia', abbr: 'GM', flag: '🇬🇲', digits: 7 },
  { code: '+224', country: 'Guinea', abbr: 'GN', flag: '🇬🇳', digits: 9 },
  { code: '+245', country: 'Guinea-Bissau', abbr: 'GW', flag: '🇬🇼', digits: 7 },
  { code: '+231', country: 'Liberia', abbr: 'LR', flag: '🇱🇷', digits: 7 },
  { code: '+232', country: 'Sierra Leone', abbr: 'SL', flag: '🇸🇱', digits: 8 },
  { code: '+222', country: 'Mauritania', abbr: 'MR', flag: '🇲🇷', digits: 8 },
  { code: '+238', country: 'Cape Verde', abbr: 'CV', flag: '🇨🇻', digits: 7 },
  { code: '+237', country: 'Cameroon', abbr: 'CM', flag: '🇨🇲', digits: 9 },
  { code: '+235', country: 'Chad', abbr: 'TD', flag: '🇹🇩', digits: 8 },
  { code: '+236', country: 'Central African Republic', abbr: 'CF', flag: '🇨🇫', digits: 8 },
  { code: '+241', country: 'Gabon', abbr: 'GA', flag: '🇬🇦', digits: 7 },
  { code: '+240', country: 'Equatorial Guinea', abbr: 'GQ', flag: '🇬🇶', digits: 9 },
  { code: '+242', country: 'Congo', abbr: 'CG', flag: '🇨🇬', digits: 9 },
  { code: '+243', country: 'DR Congo', abbr: 'CD', flag: '🇨🇩', digits: 9 },
  { code: '+244', country: 'Angola', abbr: 'AO', flag: '🇦🇴', digits: 9 },
  { code: '+260', country: 'Zambia', abbr: 'ZM', flag: '🇿🇲', digits: 9 },
  { code: '+263', country: 'Zimbabwe', abbr: 'ZW', flag: '🇿🇼', digits: 9 },
  { code: '+265', country: 'Malawi', abbr: 'MW', flag: '🇲🇼', digits: 9 },
  { code: '+258', country: 'Mozambique', abbr: 'MZ', flag: '🇲🇿', digits: 9 },
  { code: '+261', country: 'Madagascar', abbr: 'MG', flag: '🇲🇬', digits: 9 },
  { code: '+230', country: 'Mauritius', abbr: 'MU', flag: '🇲🇺', digits: 8 },
  { code: '+262', country: 'Reunion', abbr: 'RE', flag: '🇷🇪', digits: 9 },
  { code: '+269', country: 'Comoros', abbr: 'KM', flag: '🇰🇲', digits: 7 },
  { code: '+248', country: 'Seychelles', abbr: 'SC', flag: '🇸🇨', digits: 7 },
  { code: '+27', country: 'South Africa', abbr: 'ZA', flag: '🇿🇦', digits: 9 },
  { code: '+264', country: 'Namibia', abbr: 'NA', flag: '🇳🇦', digits: 9 },
  { code: '+267', country: 'Botswana', abbr: 'BW', flag: '🇧🇼', digits: 8 },
  { code: '+266', country: 'Lesotho', abbr: 'LS', flag: '🇱🇸', digits: 8 },
  { code: '+268', country: 'Eswatini', abbr: 'SZ', flag: '🇸🇿', digits: 8 },
  // Oceania
  { code: '+61', country: 'Australia', abbr: 'AU', flag: '🇦🇺', digits: 9 },
  { code: '+64', country: 'New Zealand', abbr: 'NZ', flag: '🇳🇿', digits: 9 },
  { code: '+679', country: 'Fiji', abbr: 'FJ', flag: '🇫🇯', digits: 7 },
  { code: '+675', country: 'Papua New Guinea', abbr: 'PG', flag: '🇵🇬', digits: 8 },
  { code: '+676', country: 'Tonga', abbr: 'TO', flag: '🇹🇴', digits: 7 },
  { code: '+677', country: 'Solomon Islands', abbr: 'SB', flag: '🇸🇧', digits: 7 },
  { code: '+678', country: 'Vanuatu', abbr: 'VU', flag: '🇻🇺', digits: 7 },
  { code: '+685', country: 'Samoa', abbr: 'WS', flag: '🇼🇸', digits: 7 },
  { code: '+686', country: 'Kiribati', abbr: 'KI', flag: '🇰🇮', digits: 8 },
  { code: '+688', country: 'Tuvalu', abbr: 'TV', flag: '🇹🇻', digits: 6 },
  { code: '+680', country: 'Palau', abbr: 'PW', flag: '🇵🇼', digits: 7 },
  { code: '+691', country: 'Micronesia', abbr: 'FM', flag: '🇫🇲', digits: 7 },
  { code: '+692', country: 'Marshall Islands', abbr: 'MH', flag: '🇲🇭', digits: 7 },
  { code: '+674', country: 'Nauru', abbr: 'NR', flag: '🇳🇷', digits: 7 },
  // Central Asia
  { code: '+7', country: 'Kazakhstan', abbr: 'KZ', flag: '🇰🇿', digits: 10 },
  { code: '+998', country: 'Uzbekistan', abbr: 'UZ', flag: '🇺🇿', digits: 9 },
  { code: '+993', country: 'Turkmenistan', abbr: 'TM', flag: '🇹🇲', digits: 8 },
  { code: '+996', country: 'Kyrgyzstan', abbr: 'KG', flag: '🇰🇬', digits: 9 },
  { code: '+992', country: 'Tajikistan', abbr: 'TJ', flag: '🇹🇯', digits: 9 },
]

// Helper function to get digit length for a country code
export const getCountryDigits = (code) => {
  const country = COUNTRY_CODES.find((c) => c.code === code)
  return country?.digits || 10
}

// CountryCodeSelect - Dropdown for selecting country code
// Shows short format (IN +91) in field, full format (India (IN) +91) in dropdown
export function CountryCodeSelect({ value = '+91', onChange, className = '', disabled = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  const searchRef = useRef(null)
  const pos = usePopoverPosition(open, triggerRef, 300, 220)
  useOutsideClose(open, [triggerRef, popRef], () => setOpen(false))

  const current = COUNTRY_CODES.find((c) => c.code === value) || COUNTRY_CODES[0]
  const q = query.trim().toLowerCase()
  const filtered = q
    ? COUNTRY_CODES.filter((c) =>
        c.country.toLowerCase().includes(q) ||
        c.abbr.toLowerCase().includes(q) ||
        c.code.includes(q)
      )
    : COUNTRY_CODES

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [open])

  const pick = (c) => {
    setOpen(false)
    triggerRef.current?.focus()
    if (c.code !== value) onChange?.({ target: { value: c.code } })
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`input flex items-center justify-between gap-1 text-left disabled:bg-gray-50 disabled:text-gray-400 !w-[5.5rem] shrink-0 !rounded-r-none !border-r-0 text-[0.75rem] !px-2 !py-2 ${open ? 'ring-2 ring-gold-400 border-transparent' : ''} ${className}`}
      >
        <span className="text-gray-800 font-medium">{current.abbr} {current.code}</span>
        <ChevronDown size={12} className={`shrink-0 text-maroon-700/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <Popover pos={pos} popRef={popRef}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gold-100 bg-cream/50">
            <Search size={13} className="text-maroon-700/50 shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('Search country…')}
              className="w-full bg-transparent text-[0.8125rem] outline-none placeholder:text-gray-400"
            />
            {query && <button type="button" onClick={() => setQuery('')} className="text-gray-400 hover:text-maroon-700"><X size={13} /></button>}
          </div>
          <div className="overflow-y-auto py-1" style={{ maxHeight: (pos?.maxHeight ?? 300) - 44 }}>
            {filtered.length === 0 && <div className="px-3 py-2.5 text-[0.8125rem] text-gray-400">{tr('No matches')}</div>}
            {filtered.map((c) => {
              const sel = c.code === value
              return (
                <button
                  key={`${c.abbr}-${c.code}`}
                  type="button"
                  onClick={() => pick(c)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[0.8125rem] transition-colors ${
                    sel ? 'bg-maroon-800 text-cream font-semibold' : 'text-gray-700 hover:bg-gold-100/70'
                  }`}
                >
                  <span className="truncate">{c.country} ({c.abbr}) {c.code}</span>
                  {sel && <Check size={14} className="shrink-0" />}
                </button>
              )
            })}
          </div>
        </Popover>
      )}
    </>
  )
}

// MobileInput - Combined country code dropdown + mobile number input
export function MobileInput({
  countryCode = '+91',
  onCountryCodeChange,
  value = '',
  onChange,
  placeholder = 'Mobile Number',
  maxLength = 10,
  required = false,
  disabled = false,
  className = '',
  error = false,
}) {
  const { t } = useLang()
  return (
    <div className={`flex ${className}`}>
      <CountryCodeSelect
        value={countryCode}
        onChange={onCountryCodeChange}
        disabled={disabled}
      />
      <input
        type="tel"
        value={value}
        onChange={onChange}
        placeholder={t(placeholder)}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
        className={`input flex-1 !rounded-l-none ${error ? 'border-red-400' : ''}`}
      />
    </div>
  )
}

// ── Combobox ─────────────────────────────────────────────────────────────────
// Searchable dropdown that allows both selection from options and custom typing.
// Perfect for fields like Gothram / Nakshatram where common values exist but
// custom entries are also valid.

export function Combobox({
  value,
  onChange,
  options = [],
  placeholder = '',
  disabled = false,
  required = false,
  className = '',
  title,
}) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  const inputRef = useRef(null)
  const pos = usePopoverPosition(open, triggerRef, 280, 200)
  useOutsideClose(open, [triggerRef, popRef], () => setOpen(false))

  // Filter options based on query
  const q = query.trim().toLowerCase()
  const filtered = q
    ? options.filter((opt) => {
        const label = typeof opt === 'string' ? opt : opt.label
        return label.toLowerCase().includes(q)
      })
    : options

  // Focus input when dropdown opens
  useEffect(() => {
    if (open) {
      setQuery(value || '')
      setActive(-1)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open, value])

  const pick = (opt) => {
    const val = typeof opt === 'string' ? opt : opt.value
    setOpen(false)
    triggerRef.current?.focus()
    if (val !== value) onChange?.({ target: { value: val } })
  }

  const handleInputChange = (e) => {
    setQuery(e.target.value)
    setActive(-1)
    // Also update the actual value for custom typing
    onChange?.({ target: { value: e.target.value } })
  }

  const handleBlur = () => {
    // On blur, keep whatever was typed
    if (query.trim() !== value) {
      onChange?.({ target: { value: query.trim() } })
    }
  }

  const onKey = (e) => {
    if (e.key === 'Escape') {
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      if (!filtered.length) return
      const dir = e.key === 'ArrowDown' ? 1 : -1
      setActive((prev) => (prev + dir + filtered.length) % filtered.length)
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (open && active >= 0 && filtered[active]) {
        pick(filtered[active])
      } else if (!open) {
        setOpen(true)
      } else {
        // Accept current input value
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
  }

  const displayValue = value || ''
  const hasMatch = options.some((opt) => {
    const val = typeof opt === 'string' ? opt : opt.value
    return val === displayValue
  })

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={`input flex items-center justify-between gap-2 text-left disabled:bg-gray-50 disabled:text-gray-400 ${open ? 'ring-2 ring-gold-400 border-transparent' : ''} ${className}`}
      >
        <span className={`truncate ${displayValue ? 'text-gray-800' : 'text-gray-400'}`}>
          {displayValue || t(placeholder) || t('Select or type…')}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-maroon-700/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {required && !disabled && <RequiredProxy value={value ?? ''} onFocus={() => setOpen(true)} />}
      {open && (
        <Popover pos={pos} popRef={popRef}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gold-100 bg-cream/50">
            <Search size={13} className="text-maroon-700/50 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={handleInputChange}
              onKeyDown={onKey}
              onBlur={handleBlur}
              placeholder={t('Search or type custom…')}
              className="w-full bg-transparent text-[0.8125rem] outline-none placeholder:text-gray-400"
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); onChange?.({ target: { value: '' } }) }} className="text-gray-400 hover:text-maroon-700">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="overflow-y-auto py-1" style={{ maxHeight: (pos?.maxHeight ?? 280) - 48 }}>
            {filtered.length === 0 && query && (
              <div className="px-3 py-2 text-[0.8125rem]">
                <div className="text-gray-500">{t('No matches')}</div>
                <div className="text-[0.75rem] text-maroon-600 mt-1">
                  {t('Press Enter to use')}: <span className="font-medium">"{query}"</span>
                </div>
              </div>
            )}
            {filtered.map((opt, i) => {
              const label = typeof opt === 'string' ? opt : opt.label
              const val = typeof opt === 'string' ? opt : opt.value
              const sel = val === value
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => pick(opt)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[0.8125rem] transition-colors ${
                    sel ? 'bg-maroon-800 text-cream font-semibold'
                      : i === active ? 'bg-gold-100/70 text-maroon-900'
                        : 'text-gray-700 hover:bg-gold-100/70'
                  }`}
                >
                  <span className="truncate">{t(label)}</span>
                  {sel && <Check size={14} className="shrink-0" />}
                </button>
              )
            })}
          </div>
        </Popover>
      )}
    </>
  )
}
