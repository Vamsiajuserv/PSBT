// Staff alerts — shared by the header bell (AlertBell.jsx), the sidebar badge and the Alerts page.
// The bell owns the live stream; it publishes the unread count and each new alert here so the
// sidebar badge and an open Alerts page update at once without their own connections.
import { useEffect, useState } from 'react'
import { BellRing, Coins, Package, HeartPulse, PartyPopper, Soup, BadgeIndianRupee, Landmark, Gavel, Recycle, ClipboardCheck } from 'lucide-react'
import { tr, personName, getLang } from '../i18n/LanguageContext.jsx'

// ── Categories (= the alert event), in the page's order ──
export const CATEGORY = {
  hundi: { label: 'Hundi', icon: Landmark, color: '#9d174d' },
  auction: { label: 'Auction', icon: Gavel, color: '#6d28d9' },
  other_sale: { label: 'Other Sales', icon: Recycle, color: '#4d7c0f' },
  stores_approval: { label: 'Stores approvals', icon: ClipboardCheck, color: '#0e7490' },
  valuable: { label: 'Gold / Silver', icon: Coins, color: '#b45309' },
  material: { label: 'Material', icon: Package, color: '#2563eb' },
  medical: { label: 'Medical (80G)', icon: HeartPulse, color: '#0f766e' },
  sponsorship: { label: 'Sponsorship', icon: PartyPopper, color: '#7c3aed' },
  annadanam: { label: 'Annadanam', icon: Soup, color: '#c2410c' },
  donation_big: { label: 'Big cash donation', icon: BadgeIndianRupee, color: '#047857' },
}
export const categoryOf = (event) => CATEGORY[event] || { label: 'Other', icon: BellRing, color: '#b91c1c' }
export const accentOf = (event) => categoryOf(event).color

function dateLabel(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(getLang() === 'te' ? 'te-IN' : 'en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** The alert's text in the active language, built from its saved values. */
export function alertText(a) {
  const p = a.params || {}
  const who = p.donor ? personName({ name: p.donor }, getLang()) : ''
  const fund = p.fund ? tr(p.fund) : ''
  const item = p.item ? tr(p.item) : fund
  const join = (...xs) => xs.filter(Boolean).join(' · ')
  const qty = p.quantity ? `${p.quantity} ${p.unit ? tr(p.unit) : ''}`.trim() : p.qty
  switch (a.event) {
    case 'medical':
      return { title: tr('Medical donation (80G)'), body: join(who, `₹${p.amount}`, p.receipt), action: tr('80G receipt issued — check the PAN and the receipt') }
    case 'valuable':
      return { title: p.metal === 'Silver' ? tr('Silver donation') : tr('Gold donation'), body: join(who, item, qty, p.value && `≈ ₹${p.value}`),
        action: tr('Receive it into valuables and tag it in Receive & Tag') }
    case 'material':
      return { title: tr('Material donation'), body: join(who, item, qty),
        action: p.tagged ? tr('Receive it into stores and tag it in Receive & Tag') : tr('Receive it into stores — check Consumables Stock') }
    case 'sponsorship':
      return { title: tr('Sponsorship donation'), body: join(who, fund, `₹${p.amount}`), action: tr('Plan the sponsored event') }
    case 'annadanam':
      return { title: tr('Annadanam sponsorship'), body: join(who, `${p.persons} ${tr('persons')}`, p.date && dateLabel(p.date), `₹${p.amount}`),
        action: tr('Plan the food for that day') }
    case 'hundi':
      return hundiText(p, join)
    case 'auction':
      return auctionText(p, join)
    case 'other_sale': {
      const head = join(p.code, tr(p.material || ''), p.qty && `${p.qty} ${p.unit ? tr(p.unit) : ''}`.trim(), `₹${p.amount}`,
        p.buyer && personName({ name: p.buyer }, getLang()))
      return p.stage === 'rejected'
        ? { title: tr('Other sale rejected by the committee'), body: join(head, p.by && `${tr('Rejected by')} ${p.by}`),
            action: join(p.reason && `${tr('Reason')}: ${p.reason}`, tr('Check the sale and the money collected')) }
        : { title: tr('Other sale waiting for verification'), body: join(head, p.recorded_by && `${tr('Recorded by')} ${p.recorded_by}`),
            action: tr('Open Other Sales and verify or reject it') }
    }
    case 'stores_approval':
      return storesText(p, join)
    case 'donation_big':
      return { title: tr('Big donation'), body: join(who, fund, `₹${p.amount}`), action: tr('Consider thanking the donor') }
    default:
      return { title: tr(a.title || 'Alert'), body: a.body || '', action: '' }
  }
}

function auctionText(p, join) {
  const base = `${tr('Base')} ₹${p.base}${p.each ? ` ${tr('each')}` : ''}`
  const when = join(p.date && dateLabel(p.date), p.time)
  const head = join(p.code, tr(p.item || ''), base)
  switch (p.stage) {
    case 'approve':
      return { title: p.changed ? tr('Auction corrected — approve again') : tr('Auction waiting for committee approval'),
        body: join(head, when), action: tr('Open Auction and approve (you may raise the base price) or reject it') }
    case 'approved':
      return { title: p.old_base ? tr('Auction approved with a new base price') : tr('Auction approved'),
        body: join(head, p.old_base && `${tr('asked')} ₹${p.old_base}`, p.by && `${tr('Approved by')} ${p.by}`),
        action: join(when && `${tr('Hold the auction on')} ${when}`, p.note) }
    case 'rejected':
      return { title: tr('Auction rejected by the committee'), body: join(head, p.by && `${tr('Rejected by')} ${p.by}`),
        action: join(p.reason && `${tr('Reason')}: ${p.reason}`, tr('Correct it and resubmit it')) }
    default:
      return { title: tr('Auction'), body: head, action: '' }
  }
}

function hundiText(p, join) {
  const head = join(p.code, `₹${p.amount}`, p.date && dateLabel(p.date))
  switch (p.stage) {
    case 'approve':
      return { title: p.resubmitted ? tr('Corrected hundi count — approve again') : tr('Hundi count waiting for your approval'),
        body: join(head, p.counted_by && `${tr('Counted by')} ${p.counted_by}`), action: tr('Open Hundi and approve or reject the count') }
    case 'submitted':
    case 'resubmitted':
      return { title: p.stage === 'resubmitted' ? tr('Hundi count corrected and resubmitted') : tr('Hundi counted'),
        body: join(head, p.members && `${tr('Approvers')}: ${p.members}`), action: tr('Waiting for 2 committee approvals') }
    case 'rejected':
      return { title: tr('Hundi count rejected'), body: join(head, p.by && `${tr('Rejected by')} ${p.by}`),
        action: join(p.reason && `${tr('Reason')}: ${p.reason}`, tr('Correct the count and resubmit it')) }
    case 'verified':
      return { title: tr('Hundi count approved'), body: join(head, p.by && `${tr('Approved by')} ${p.by}`),
        action: Number(String(p.cash || 0).replace(/,/g, '')) > 0 ? tr('Deposit the cash in the bank') : tr('Store the valuables in custody') }
    default:
      return { title: tr('Hundi'), body: head, action: '' }
  }
}

// ── Shared unread count + new-alert bus ──
let unread = 0
const subs = new Set()
export function setAlertUnread(n) {
  if (typeof n !== 'number' || n < 0 || n === unread) return
  unread = n
  subs.forEach((f) => f(n))
}
export function useAlertUnread() {
  const [n, setN] = useState(unread)
  useEffect(() => { subs.add(setN); setN(unread); return () => subs.delete(setN) }, [])
  return n
}
/** A new alert arrived (bell → open Alerts page) or alerts were marked read (page → bell). */
// Stores approvals (2026-11-15): write-off, gold / silver change, stock-count shortage → Committee;
// a rejection → Stores Officer + Administrator
const KIND_TE = { Correction: 'Gold / silver correction', Weight: 'Weight changed on return' }
function storesText(p, join) {
  const head = join(p.tag || p.code, p.item && tr(p.item), p.qty && `${p.qty} ${p.unit ? tr(p.unit) : ''}`.trim())
  switch (p.stage) {
    case 'write_off':
      return { title: tr('Write-off waiting for approval'), body: join(head, p.what && tr(p.what), p.by && `${tr('Asked by')} ${p.by}`),
        action: join(p.reason && `${tr('Reason')}: ${p.reason}`, tr('Open Missing Items and approve or reject it')) }
    case 'change':
      return { title: tr('Gold / silver change waiting for approval'), body: join(head, p.kind && tr(KIND_TE[p.kind] || p.kind), p.by && `${tr('Asked by')} ${p.by}`),
        action: join(p.what, tr('Open Missing Items and approve or reject it')) }
    case 'count':
      return { title: tr('Stock count shortage waiting for approval'), body: join(head, p.by && `${tr('Counted by')} ${p.by}`),
        action: tr('Open Consumables Stock and approve or reject it') }
    case 'rejected':
      return { title: tr('Stores request rejected by the committee'), body: join(head, p.what && tr(p.what), p.by && `${tr('Rejected by')} ${p.by}`),
        action: join(p.reason && `${tr('Reason')}: ${p.reason}`) }
    default:
      return { title: tr('Stores approvals'), body: head, action: '' }
  }
}

export const ALERTS_EVENT = 'alerts:changed'
export const announceAlerts = (detail = {}) => window.dispatchEvent(new CustomEvent(ALERTS_EVENT, { detail }))
