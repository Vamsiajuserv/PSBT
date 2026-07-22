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
      style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, zIndex: 90 }}
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

export function Select({ value, onChange, children, className = '', disabled = false, required = false, title, placeholder }) {
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
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        className={`input flex items-center justify-between gap-2 text-left disabled:bg-gray-50 disabled:text-gray-400 ${open ? 'ring-2 ring-gold-400 border-transparent' : ''} ${className}`}
      >
        <span className={`truncate ${current && current.label ? 'text-gray-800' : 'text-gray-400'}`}>
          {current?.label || placeholder || (items[0]?.label ?? 'Select…')}
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
                placeholder="Search…"
                className="w-full bg-transparent text-[0.8125rem] outline-none placeholder:text-gray-400"
              />
              {query && <button type="button" onClick={() => setQuery('')} className="text-gray-400 hover:text-maroon-700"><X size={13} /></button>}
            </div>
          )}
          <div className="overflow-y-auto py-1" style={{ maxHeight: (pos?.maxHeight ?? 300) - (searchable ? 40 : 0) }}>
            {shown.length === 0 && <div className="px-3 py-2.5 text-[0.8125rem] text-gray-400">No matches</div>}
            {shown.map((o, i) => {
              if (o.group) {
                return <div key={`g${i}`} className="px-3 pt-2 pb-1 text-[0.625rem] font-bold uppercase tracking-wider text-maroon-700/60">{o.group}</div>
              }
              flatIdx += 1
              const idx = flatIdx
              const sel = o.value === val
              return (
                <button
                  key={`${o.value}-${i}`}
                  type="button"
                  disabled={o.disabled}
                  onClick={() => pick(o)}
                  onMouseEnter={() => setActive(idx)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[0.8125rem] transition-colors ${
                    o.disabled ? 'text-gray-300 cursor-not-allowed'
                      : sel ? 'bg-maroon-800 text-cream font-semibold'
                        : idx === active ? 'bg-gold-100/70 text-maroon-900' : 'text-gray-700 hover:bg-gold-100/70'
                  }`}
                >
                  <span className="truncate">{o.label || <span className="text-gray-400">—</span>}</span>
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

// ── Date / time widgets ─────────────────────────────────────────────────────

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmt = (s) => {
  if (!s) return ''
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return s
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
const fmt12 = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return t
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${ap}`
}
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function NavBtn({ onClick, children, label }) {
  return (
    <button type="button" onClick={onClick} title={label} className="w-7 h-7 grid place-items-center rounded-lg text-maroon-700/70 hover:bg-gold-100 hover:text-maroon-900 transition-colors">{children}</button>
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
    <div style={{ minWidth: 232 }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex">
          <NavBtn onClick={() => (mode === 'years' ? setView((v) => ({ ...v, y: v.y - 12 })) : nav(-1, 0))} label="Previous year"><ChevronsLeft size={15} /></NavBtn>
          {mode === 'days' && <NavBtn onClick={() => nav(0, -1)} label="Previous month"><ChevronLeft size={15} /></NavBtn>}
        </div>
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'days' ? 'years' : 'days'))}
          title="Jump to a year"
          className="text-[0.8125rem] font-bold text-maroon-800 rounded-lg px-2 py-0.5 hover:bg-gold-100 transition-colors"
        >
          {mode === 'days' ? `${MONTHS[view.m]} ${view.y}` : `${view.y - 5} – ${view.y + 6}`}
        </button>
        <div className="flex">
          {mode === 'days' && <NavBtn onClick={() => nav(0, 1)} label="Next month"><ChevronRight size={15} /></NavBtn>}
          <NavBtn onClick={() => (mode === 'years' ? setView((v) => ({ ...v, y: v.y + 12 })) : nav(1, 0))} label="Next year"><ChevronsRight size={15} /></NavBtn>
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
          {DOW.map((d) => <div key={d} className="h-7 grid place-items-center text-[0.625rem] font-bold uppercase text-maroon-700/50">{d}</div>)}
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
      <TimeCol items={['AM', 'PM']} sel={ap} render={(a) => a} onPick={(a) => emit({ a })} />
    </div>
  )
}

// Shared trigger button for the date/time fields.
function FieldTrigger({ triggerRef, open, setOpen, disabled, title, className, label, empty, icon: Icon }) {
  return (
    <button
      type="button"
      ref={triggerRef}
      disabled={disabled}
      title={title}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) } }}
      className={`input flex items-center justify-between gap-2 text-left disabled:bg-gray-50 disabled:text-gray-400 ${open ? 'ring-2 ring-gold-400 border-transparent' : ''} ${className}`}
    >
      <span className={`truncate ${empty ? 'text-gray-400' : 'text-gray-800'}`}>{label}</span>
      <Icon size={15} className="shrink-0 text-maroon-700/50" />
    </button>
  )
}

export function DateField({ value, onChange, min, max, required = false, disabled = false, className = '', placeholder = 'Select date', title }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  const pos = usePopoverPosition(open, triggerRef, 340)
  useOutsideClose(open, [triggerRef, popRef], () => setOpen(false))

  const todayIso = iso(new Date())
  const inRange = (s) => (!min || s >= min) && (!max || s <= max)
  const set = (s) => { setOpen(false); triggerRef.current?.focus(); if (s !== (value || '')) onChange?.({ target: { value: s } }) }

  return (
    <>
      <FieldTrigger triggerRef={triggerRef} open={open} setOpen={setOpen} disabled={disabled} title={title}
        className={className} empty={!value} label={value ? fmt(value) : placeholder} icon={CalendarIcon} />
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
                Today
              </button>
              {!required && value && (
                <button type="button" onClick={() => set('')} className="text-[0.75rem] font-semibold text-gray-400 hover:text-red-600">Clear</button>
              )}
            </div>
          </div>
        </Popover>
      )}
    </>
  )
}

// Time-only field — value is 24h "HH:MM" like a native <input type="time">.
export function TimeField({ value, onChange, required = false, disabled = false, className = '', placeholder = 'Select time', title }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  const pos = usePopoverPosition(open, triggerRef, 320, 230)
  useOutsideClose(open, [triggerRef, popRef], () => setOpen(false))

  const emit = (t) => { if (t !== (value || '')) onChange?.({ target: { value: t } }) }

  return (
    <>
      <FieldTrigger triggerRef={triggerRef} open={open} setOpen={setOpen} disabled={disabled} title={title}
        className={className} empty={!value} label={value ? fmt12(value) : placeholder} icon={Clock} />
      {required && !disabled && <RequiredProxy value={value ?? ''} onFocus={() => setOpen(true)} />}
      {open && (
        <Popover pos={pos} popRef={popRef}>
          <div className="p-3 select-none">
            <div className="flex justify-center"><TimePanel value={value} onChange={emit} /></div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gold-100">
              <button type="button" onClick={() => emit(nowHHMM())} className="text-[0.75rem] font-semibold text-maroon-700 hover:text-maroon-900">Now</button>
              <div className="flex items-center gap-3">
                {!required && value && (
                  <button type="button" onClick={() => { emit(''); setOpen(false) }} className="text-[0.75rem] font-semibold text-gray-400 hover:text-red-600">Clear</button>
                )}
                <button type="button" onClick={() => { setOpen(false); triggerRef.current?.focus() }} className="px-3 py-1.5 rounded-lg text-[0.75rem] font-bold text-white bg-maroon-800 hover:bg-maroon-900">Done</button>
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
export function DateTimeField({ value, onChange, min, max, required = false, disabled = false, className = '', placeholder = 'Select date & time', title }) {
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
        label={value ? `${fmt(datePart)} · ${fmt12(timePart)}` : placeholder} icon={CalendarIcon} />
      {required && !disabled && <RequiredProxy value={value ?? ''} onFocus={() => setOpen(true)} />}
      {open && (
        <Popover pos={pos} popRef={popRef}>
          <div className="p-3 select-none">
            <div className="flex gap-3">
              <CalendarPanel value={datePart || ''} min={min} max={max} onPick={(d) => emit(d, timePart || nowHHMM())} />
              <div className="border-l border-gold-100 pl-3">
                <div className="text-[0.625rem] font-bold uppercase tracking-wider text-maroon-700/50 mb-1.5 text-center">Time</div>
                <TimePanel value={timePart || ''} onChange={(t) => emit(datePart || iso(new Date()), t)} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gold-100">
              <button type="button" onClick={() => emit(iso(new Date()), nowHHMM())} className="text-[0.75rem] font-semibold text-maroon-700 hover:text-maroon-900">Now</button>
              <div className="flex items-center gap-3">
                {!required && value && (
                  <button type="button" onClick={() => { emit('', ''); setOpen(false) }} className="text-[0.75rem] font-semibold text-gray-400 hover:text-red-600">Clear</button>
                )}
                <button type="button" onClick={() => { setOpen(false); triggerRef.current?.focus() }} className="px-3 py-1.5 rounded-lg text-[0.75rem] font-bold text-white bg-maroon-800 hover:bg-maroon-900">Done</button>
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
export function NumberField({ value, onChange, prefix, min, max, step, required = false, disabled = false, placeholder, className = '', inputClass = '', title, innerRef }) {
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
        onChange={onChange}
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

export function Checkbox({ checked, onChange, disabled = false, className = '' }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!checked}
      disabled={disabled}
      onClick={() => onChange?.({ target: { checked: !checked } })}
      className={`w-[1.125rem] h-[1.125rem] shrink-0 rounded-[0.3125rem] border grid place-items-center transition-colors ${
        checked ? 'bg-maroon-800 border-maroon-800 text-cream' : 'bg-white border-gold-300 hover:border-maroon-400'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}
    >
      {checked && <Check size={12} strokeWidth={3.5} />}
    </button>
  )
}

export function Toggle({ checked, onChange, disabled = false, className = '', title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      title={title}
      onClick={() => onChange?.({ target: { checked: !checked } })}
      className={`relative shrink-0 h-[1.375rem] w-10 rounded-full transition-colors ${
        checked ? 'bg-maroon-800' : 'bg-gray-300'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}
    >
      <span className={`absolute top-[0.1875rem] left-[0.1875rem] h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[1.125rem]' : ''}`} />
    </button>
  )
}
