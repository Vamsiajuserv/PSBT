import { useEffect, useRef, useState } from 'react'

// Keyboard picking for search-result lists (client feedback 2026-11-25).
// When the list opens, the FIRST match is highlighted; ↑ / ↓ move the highlight and Enter picks it,
// so the counter can choose a devotee without the mouse. The mouse does not move the highlight
// (no hover highlight) — a click still picks the clicked row. Colour: green.
//
//   const pick = usePickList(results, (d) => choose(d))
//   <input onKeyDown={pick.onKeyDown} />          // returns true when it handled the key
//   <button {...pick.rowProps(i)} className={`pick-row ... ${pick.rowClass(i)}`}>
export default function usePickList(items, onPick, { open = true } = {}) {
  const list = open && Array.isArray(items) ? items : []
  const n = list.length
  const [active, setActive] = useState(0)
  const moved = useRef(false)
  // A new set of results starts again from the first match
  const sig = list.map((x, i) => x?.id ?? x?.date ?? i).join('|')
  useEffect(() => { setActive(0); moved.current = false }, [sig])
  const cur = Math.min(active, Math.max(n - 1, 0))

  const onKeyDown = (e) => {
    if (!n) return false
    if (e.key === 'ArrowDown') { e.preventDefault(); moved.current = true; setActive((cur + 1) % n); return true }
    if (e.key === 'ArrowUp') { e.preventDefault(); moved.current = true; setActive((cur - 1 + n) % n); return true }
    if (e.key === 'Enter') { e.preventDefault(); onPick(list[cur]); return true }
    return false
  }
  // Green highlight on the chosen row only — kept here (not in index.css) so no global style changes.
  // .pick-name / .pick-avatar mark the name and the initial badge inside the row.
  const rowClass = (i) => (i === cur
    ? 'cursor-pointer outline-none bg-emerald-50 shadow-[inset_3px_0_0_#059669] [&_.pick-name]:!text-emerald-800 [&_.pick-avatar]:!bg-emerald-600 [&_.pick-avatar]:!text-white'
    : 'cursor-pointer outline-none')
  const rowProps = (i) => ({
    'aria-selected': i === cur,
    // keep the highlighted row visible inside a scrolling list (only after arrow keys, so opening
    // the list never scrolls the page)
    ref: (el) => { if (el && i === cur && moved.current) el.scrollIntoView({ block: 'nearest' }) },
  })
  return { active: cur, onKeyDown, rowClass, rowProps }
}
