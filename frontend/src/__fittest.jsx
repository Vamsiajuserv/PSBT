import React from 'react'
import ReactDOM from 'react-dom/client'
import { IndianRupee, CalendarDays, Clock, CheckCircle, Ban } from 'lucide-react'
import { StatTile, KpiGrid, inr, num } from './components/admin/ui.jsx'
import './index.css'

const amounts = new URLSearchParams(location.search).get('big') === '1'
  ? [987654321098.5, 12345678.5, 7, 1234, 56]
  : [1234567.5, 45210, 7, 1234, 56]
function App() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-maroon-800" />
      <main className="flex-1 min-w-0 p-6">
        <KpiGrid>
          <StatTile icon={IndianRupee} title="Total Sales Amount" value={inr(amounts[0])} sub="All Time" />
          <StatTile icon={CalendarDays} title="Today's Sales Amount" value={inr(amounts[1])} sub="Today" />
          <StatTile icon={Clock} title="Pending Verification" value={num(amounts[2])} sub="Awaiting committee review" />
          <StatTile icon={CheckCircle} title="Verified" value={num(amounts[3])} sub="Committee approved" />
          <StatTile icon={Ban} title="Voided / Rejected" value={num(amounts[4])} sub="Cancelled records" />
        </KpiGrid>
        <KpiGrid>
          {[1, 2, 3, 4].map((i) => <StatTile key={i} icon={IndianRupee} title={`Card ${i}`} value={inr(amounts[0] / i)} sub="4-card row" />)}
        </KpiGrid>
      </main>
    </div>
  )
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
// Report what FitText decided, for checking without eyes.
setTimeout(() => {
  const rows = [...document.querySelectorAll('.fit-box')].map((b) => {
    const t = b.querySelector('.fit-text')
    return `${t.textContent} | font=${getComputedStyle(t).fontSize} | scroll=${'scroll' in b.dataset} | box=${Math.round(b.getBoundingClientRect().width)}`
  })
  const g = [...document.querySelectorAll('.kpi-grid')].map((g) => `grid n=${g.dataset.n} cols=${getComputedStyle(g).gridTemplateColumns.split(' ').length}`)
  const an = document.getAnimations().map((a) => `anim ${a.animationName} dur=${a.effect.getTiming().duration} t=${Math.round(a.currentTime)} state=${a.playState} kf=${JSON.stringify(a.effect.getKeyframes().map(k=>k.transform))}`)
  rows.push(...an)
  const pre = document.createElement('pre'); pre.id = 'report'; pre.textContent = [...g, ...rows].join('\n'); document.body.appendChild(pre)
}, 1500)
