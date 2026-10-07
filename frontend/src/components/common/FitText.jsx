import React, { useLayoutEffect, useRef } from 'react'

// Keeps a single-line value (a KPI amount, a count) fully readable in whatever
// width its card ends up with — card widths vary with screen size, Windows
// display scaling, browser zoom and the A−/A/A+ text-size setting.
//
//   1. Fits as-is            → shown at its normal (responsive) size.
//   2. Slightly too wide     → font shrinks just enough, down to `minScale`.
//   3. Still too wide at min → slides left to reveal the end, pauses, slides
//                              back (pauses on hover; the full value is also in
//                              the tooltip). Reduced-motion users get a wrap.
//
// Everything is measured and applied directly on the DOM (no React state), so
// re-fitting never triggers a re-render. Styles live in index.css (.fit-box).
export default function FitText({ children, className = '', minScale = 0.72, minPx = 12 }) {
  const boxRef = useRef(null)
  const textRef = useRef(null)
  // Re-fit whenever the rendered text changes; non-text children re-fit every render.
  const sig = typeof children === 'string' || typeof children === 'number' ? String(children) : {}

  useLayoutEffect(() => {
    const box = boxRef.current
    const text = textRef.current
    if (!box || !text) return undefined

    const fit = () => {
      // Measure at the CSS size, single line, without the slide animation.
      delete box.dataset.scroll
      box.removeAttribute('title')
      text.style.fontSize = ''
      const avail = box.getBoundingClientRect().width
      const natural = text.getBoundingClientRect().width
      if (!avail || natural <= avail) return

      const base = parseFloat(getComputedStyle(text).fontSize) || 16
      const floor = Math.min(base, Math.max(base * minScale, minPx))
      const target = Math.floor(base * (avail / natural) * 0.98 * 100) / 100
      text.style.fontSize = `${Math.max(target, floor)}px`
      if (target >= floor) return

      const shift = Math.ceil(text.getBoundingClientRect().width - avail)
      if (shift <= 0) return
      box.title = text.textContent || ''
      box.style.setProperty('--fit-shift', `${shift}px`)
      // ~30px/s while sliding (each slide is a quarter of the cycle), min 7s.
      box.style.setProperty('--fit-duration', `${Math.max(7, shift / 7.5).toFixed(1)}s`)
      box.dataset.scroll = ''
    }

    fit()
    let lastWidth = box.getBoundingClientRect().width
    let frame = 0
    const ro = new ResizeObserver(() => {
      const w = box.getBoundingClientRect().width
      if (Math.abs(w - lastWidth) < 0.5) return   // our own font change only alters height
      lastWidth = w
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    })
    ro.observe(box)
    // Web fonts change glyph widths once loaded.
    document.fonts?.ready?.then(() => { if (boxRef.current) fit() })
    return () => { ro.disconnect(); cancelAnimationFrame(frame) }
  }, [sig, minScale, minPx])

  return (
    <div ref={boxRef} className={`fit-box ${className}`}>
      <span ref={textRef} className="fit-text">{children}</span>
    </div>
  )
}
