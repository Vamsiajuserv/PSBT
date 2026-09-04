// Proportional UI scaling — every desktop/laptop sees the SAME layout, just
// bigger or smaller, instead of a fixed zoom that renders differently on
// different screen widths.
//
// How it works: the UI is authored for a BASE_WIDTH canvas; we scale the whole
// app with CSS `zoom` = viewportWidth / BASE_WIDTH. `zoom` scales px, rem,
// icons and images uniformly, while responsive breakpoints (evaluated on the
// real viewport) are untouched — and since no `2xl:` styles exist, every
// screen ≥ the `xl` breakpoint renders the exact same layout, so scaling it
// proportionally makes a 1366px laptop and a 1920px laptop look identical.
//
// BASE_WIDTH is 1600 so a 1440px-wide screen keeps the zoom (0.9) the UI was
// previously tuned to. Below the `lg` breakpoint (tablets/phones) we leave the
// native responsive layout unscaled. Print resets to zoom 1 via index.css so
// receipts keep their physical size.
const BASE_WIDTH = 1600
const MIN_ZOOM = 0.8   // floor so mid-size windows never become unreadably small
const MAX_ZOOM = 1.6   // ceiling so ultra-wide monitors don't look comical
const MIN_VIEWPORT = 1024 // below `lg`: keep native responsive layout, no zoom

function apply() {
  const root = document.getElementById('root')
  if (!root) return
  const w = window.innerWidth
  if (w < MIN_VIEWPORT) {
    root.style.zoom = ''
    return
  }
  root.style.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, w / BASE_WIDTH))
}

export function initAutoScale() {
  apply()
  window.addEventListener('resize', apply)
}
