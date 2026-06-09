// Remote / D-pad spatial navigation for TV (and keyboard users).
// Android TV's WebView delivers the remote as Arrow keys + Enter but does NOT
// move focus between elements on its own. This moves focus to the nearest
// focusable element in the pressed direction and scrolls it into view. Enter is
// left to the browser (it natively "clicks" the focused button/link). It stays
// inert on phones (no arrow keys), so the same build works everywhere.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

function visibleFocusables() {
  return Array.from(document.querySelectorAll(FOCUSABLE)).filter((el) => {
    if (el.offsetParent === null) return false // display:none / hidden ancestor
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  })
}

function nearest(current, key) {
  const cr = current.getBoundingClientRect()
  const cx = cr.left + cr.width / 2
  const cy = cr.top + cr.height / 2
  let best = null
  let bestScore = Infinity
  for (const el of visibleFocusables()) {
    if (el === current) continue
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const dx = x - cx
    const dy = y - cy
    let primary
    let cross
    if (key === 'ArrowRight') { if (dx <= 1) continue; primary = dx; cross = Math.abs(dy) }
    else if (key === 'ArrowLeft') { if (dx >= -1) continue; primary = -dx; cross = Math.abs(dy) }
    else if (key === 'ArrowDown') { if (dy <= 1) continue; primary = dy; cross = Math.abs(dx) }
    else { if (dy >= -1) continue; primary = -dy; cross = Math.abs(dx) }
    const score = primary + cross * 2.5 // strongly prefer items aligned on the axis
    if (score < bestScore) { bestScore = score; best = el }
  }
  return best
}

function onKeyDown(e) {
  const key = e.key
  if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'ArrowUp' && key !== 'ArrowDown') return

  const active = document.activeElement
  const tag = active && active.tagName
  // Let text fields use Left/Right for the caret.
  if ((tag === 'INPUT' || tag === 'TEXTAREA') && (key === 'ArrowLeft' || key === 'ArrowRight')) return

  const current = active && active !== document.body ? active : visibleFocusables()[0]
  if (!current) return

  const next = nearest(current, key)
  if (next) {
    e.preventDefault()
    next.focus({ preventScroll: true })
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }
}

export function initTvNavigation() {
  document.addEventListener('keydown', onKeyDown)
  return () => document.removeEventListener('keydown', onKeyDown)
}
