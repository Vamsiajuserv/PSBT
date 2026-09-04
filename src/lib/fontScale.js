// Visitor text-size preference (A− / A / A+). Applied as the `--font-scale`
// CSS variable which multiplies the fluid root font-size in index.css, and
// remembered across visits in localStorage.
const KEY = 'psbt-font-scale'
export const FONT_LEVELS = { small: 0.92, normal: 1, large: 1.12 }

export function getFontScale() {
  try {
    const v = localStorage.getItem(KEY)
    return v && v in FONT_LEVELS ? v : 'normal'
  } catch {
    return 'normal'
  }
}

export function setFontScale(level) {
  const lvl = level in FONT_LEVELS ? level : 'normal'
  document.documentElement.style.setProperty('--font-scale', String(FONT_LEVELS[lvl]))
  try { localStorage.setItem(KEY, lvl) } catch { /* private mode — ignore */ }
  return lvl
}

// Apply the saved choice as early as possible (called from main.jsx) so there
// is no flash of the default size on load.
export function initFontScale() {
  document.documentElement.style.setProperty('--font-scale', String(FONT_LEVELS[getFontScale()]))
}
