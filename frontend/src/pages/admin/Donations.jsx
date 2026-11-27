import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Plus, X, Printer, Eye, Search, RotateCcw, Calendar, Info, ChevronDown,
  Sprout, CalendarDays, Package, HandHeart, User, Boxes, Ban,
} from 'lucide-react'
import { toast, promptDialog, confirmDialog } from '../../components/common/Dialog.jsx'
import { useFilterableSortableTable, SortFilterPanel, SortableFilterableTh, filtersToParam } from '../../components/common/SortableTable.jsx'
import { PageTitle, StatTile, KpiGrid, Pill, Pager, inr, num, fmtDate, FilterPanel } from '../../components/admin/ui.jsx'
import { TableStates, LOAD_ERROR } from '../../components/common/states.jsx'
import ExportButtons from '../../components/common/ExportButtons.jsx'
import { colFilters } from '../../lib/exportGuard.js'
import { monthStartISO, todayISO as periodToday } from '../../lib/period.js'
import { Receipt } from '../../components/common/Receipt.jsx'
import { te } from '../../lib/telugu.js'
import { DonationsAPI, DonationCategoriesAPI, DevoteesAPI, SettingsAPI, getErrorMessage } from '../../api/client.js'
import { useAuth, useHasModule } from '../../auth/AuthContext.jsx'
import { Select, DateField, Checkbox, NumberField, CountryCodeSelect, getCountryDigits } from '../../components/common/Field.jsx'
import { T, tr, clock12, stamp, personName, useLang, teTerm } from '../../i18n/LanguageContext.jsx'
import { sanitizePhone, sanitizeName, validatePhone, validatePAN } from '../../lib/validation.js'
import { useFilterParams } from '../../hooks/useUrlState.js'
import { TagItemsDrawer, canManageStores, DonationItemsDialog } from './stores/shared.jsx'
import { canAccessKey, isAdminRole } from '../../auth/access.js'
import { metalOf, isGrams } from '../../lib/metal.js'
import { AnnadanamForm, AnnadanamRegister, AnnadanamReceiptModal, canWriteAnnadanam } from './annadanam/shared.jsx'
import ResetButton from '../../components/common/ResetButton.jsx'
import usePickList from '../../hooks/usePickList.js'

const TYPE_LABEL = { Cash: 'Cash Donation', Material: 'Material Donation', Sponsorship: 'Sponsorship', Annadanam: 'Annadanam' }
const MODES = ['Cash', 'UPI/QR Code']
const todayStamp = () => {
  const d = new Date()
  return stamp(d.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }))
}
// Parse datetime as UTC (server returns naive ISO without 'Z')
const parseUTC = (s) => (s && String(s).includes('T')) ? new Date(String(s) + (String(s).endsWith('Z') ? '' : 'Z')) : null
const fmtTime = (s) => {
  const d = parseUTC(s)
  if (!d || isNaN(d.getTime())) return ''
  return clock12(d.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }))
}

const newDonation = () => ({
  donation_type: 'Cash', devotee_id: '', donor_name: '', country_code: '+91', mobile: '', pan: '', fund: '', amount: '',
  unit: '', quantity: '', mode: 'Cash', txn_ref: '', g80: false, notes: '', item_desc: '', est_value: '', expiry_date: '',
  donated_on: '',
})
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const daysBack = (n) => { const d = new Date(`${todayISO()}T00:00:00`); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA') }

export default function Donations() {
  const { lang } = useLang()
  const { user } = useAuth()
  const canWrite = user?.role !== 'Accountant'
  const canVoid = isAdminRole(user)   // backend: DELETE /donations/{id} is require_admin
  // Only Admin, Committee, Accountant can see amounts in reports/exports
  const canSeeAmounts = ['Admin', 'Administrator', 'Committee', 'Accountant'].includes(user?.role)
  // Annadanam lives here too: a "Annadanam" tab in Record Donation and a Donations | Annadanam
  // view switch above the list (?view=annadanam). Its records stay in the annadanam table.
  const hasModule = useHasModule()
  const showAnnadanam = hasModule('Annadanam')
  const annadanamTab = canWriteAnnadanam(user)
  const [searchParams, setSearchParams] = useSearchParams()
  const view = showAnnadanam && searchParams.get('view') === 'annadanam' ? 'annadanam' : 'donations'
  // switching view starts the other list fresh (both lists keep their filters in the URL)
  const switchView = (v) => setSearchParams(v === 'annadanam' ? { view: 'annadanam' } : {})
  const [annadanamDoc, setAnnadanamDoc] = useState(null)
  const [annadanamKey, setAnnadanamKey] = useState(0)

  const SIZE = 15
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState(null)
  const [cats, setCats] = useState([])
  // Stores & Inventory: after a material donation in a Tagged category, tag its pieces
  const [tagSource, setTagSource] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [printDoc, setPrintDoc] = useState(null)
  const [itemsFor, setItemsFor] = useState(null)   // material donation whose tagged pieces are shown
  // Row 🖨 prints straight away: the receipt renders invisibly (print-only), prints, then closes.
  const [directPrint, setDirectPrint] = useState(false)
  useEffect(() => {
    if (!printDoc || !directPrint) return
    const id = setTimeout(() => { window.print(); setDirectPrint(false); setPrintDoc(null) }, 300)
    return () => clearTimeout(id)
  }, [printDoc, directPrint])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [saving, setSaving] = useState(false)

  // State for all filtered records (for export when date filter applied)
  const [allFilteredData, setAllFilteredData] = useState([])
  const [loadingExport, setLoadingExport] = useState(false)

  // devotee type-ahead search inside the drawer
  const [dq, setDq] = useState('')
  const [devResults, setDevResults] = useState([])
  const devPick = usePickList(devResults, (d) => pickDevotee(d))
  // Each form error shows under its own field, all at once (client, 2026-11-26: a UTR error used to appear
  // under PAN; two wrong fields showed one at a time). { field: msg }; 'form' (server errors) shows beside Save.
  const [formErrs, setFormErrs] = useState({})
  const errOf = (f) => formErrs[f] || ''
  // Editing a field clears its own message (and the "fix the errors" line; the other fields stay red)
  const clearErr = (f) => { if (formErrs[f]) setFormErrs(({ [f]: _, form: __, ...rest }) => rest) }
  const setFormErr = (v) => setFormErrs(v || {})
  const showErrs = (errs) => {
    setFormErrs(errs)
    const first = Object.keys(errs)[0]
    setTimeout(() => document.querySelector(`[data-err-field="${first}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0)
  }
  const fail = (field, msg) => showErrs({ [field]: msg })
  const errRing = (f) => (errOf(f) ? 'border-red-400 ring-1 ring-red-300' : '')
  const ErrText = ({ f }) => (errOf(f) ? <div className="text-[0.71875rem] text-red-600 mt-1">{errOf(f)}</div> : null)
  const [mobileError, setMobileError] = useState('')  // Mobile validation error

  // filters - persisted in URL for state preservation across navigation
  const {
    q, setQ, type, setType, category, setCategory, mode, setMode,
    start, setStart, end, setEnd, page, setPage, setFilters,
  } = useFilterParams({
    q: '', type: '', category: '', mode: '', start: monthStartISO(), end: periodToday(), page: 1,   // opens on this month (2026-11-26)
  }, { blankable: ['start', 'end'] })

  // Sortable table columns with filtering support
  const sortColumns = [
    { key: 'code', label: 'Donation ID', type: 'text' },
    { key: 'donor_name', label: 'Devotee', type: 'text' },
    { key: 'donation_type', label: 'Donation Type', type: 'text', filterable: true, filterOptions: ['Cash', 'Material', 'Sponsorship'] },
    { key: 'category_name', label: 'Category', type: 'text' },
    { key: 'amount', label: 'Amount / Material', type: 'money' },
    { key: 'mode', label: 'Payment Mode', type: 'text', filterable: true, filterOptions: ['Cash', { value: 'UPI/QR Code', label: 'Online' }] },
    { key: 'donated_on', label: 'Donated On', type: 'date' },
    { key: 'receipt_no', label: 'Receipt No.', type: 'text' },
  ]
  // Columns shown (client review 2026-11-15: the table must fit without sideways scrolling):
  // receipt sits under the donation ID, the type under the category, the payment mode under the
  // amount — Type and Payment Mode are still filtered from the toolbar above.
  const SHOWN = { code: 'Donation / Receipt', donor_name: 'Devotee', category_name: 'Category', amount: 'Amount / Material', donated_on: 'Donated On' }
  const {
    filteredSortedRows,
    sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection,
    filters, toggleFilterValue, clearFilter, clearAllFilters, getFilterValues,
  } = useFilterableSortableTable(rows, sortColumns, [], {}, { manualSort: true, manualFilter: true })

  // Sorting and column filters run on the server so they cover every record, not just the
  // visible page; changing either reloads from page 1. With no column chosen the date
  // column is used — oldest first when a date filter is applied, newest first otherwise.
  const [listTrigger, setListTrigger] = useState(0)
  const prevSortsRef = useRef(sorts)
  const prevFiltersRef = useRef(filters)
  useEffect(() => {
    const filtersChanged = prevFiltersRef.current !== filters
    if (prevSortsRef.current === sorts && !filtersChanged) return
    prevSortsRef.current = sorts
    prevFiltersRef.current = filters
    setPage(1)
    // A filter change also refreshes the export data; a sort change only reloads the list
    if (filtersChanged) setReloadTrigger((t) => t + 1)
    else setListTrigger((t) => t + 1)
  }, [sorts, filters]) // eslint-disable-line react-hooks/exhaustive-deps
  const displayRows = filteredSortedRows

  // Fetch ALL filtered records for export when date filter is applied
  const fetchAllFiltered = useCallback(async () => {
    if (!start && !end) {
      setAllFilteredData([])
      return
    }
    setLoadingExport(true)
    try {
      const d = await DonationsAPI.list({ q, type, category, mode, start, end, page: 1, size: 10000, col_filters: filtersToParam(filters) })
      const items = d.items || []
      // Sort by date ascending (oldest first)
      items.sort((a, b) => (a.donated_on || '').localeCompare(b.donated_on || ''))
      setAllFilteredData(items)
    } catch (err) {
      toast(tr('Failed to fetch all records'), 'error')
      setAllFilteredData([])
    } finally {
      setLoadingExport(false)
    }
  }, [q, type, category, mode, start, end])

  // Fetch all data for export ONLY when Apply button is clicked (reloadTrigger changes)
  // User must click Apply to filter - no auto-fetch on date change
  useEffect(() => {
    if (start || end) {
      setLoadingExport(true)
      DonationsAPI.list({ q, type, category, mode, start, end, page: 1, size: 10000, col_filters: filtersToParam(filters) })
        .then((d) => {
          const items = d.items || []
          items.sort((a, b) => (a.donated_on || '').localeCompare(b.donated_on || ''))
          setAllFilteredData(items)
        })
        .catch(() => {
          toast(tr('Failed to fetch all records'), 'error')
          setAllFilteredData([])
        })
        .finally(() => setLoadingExport(false))
    } else {
      setAllFilteredData([])
    }
  }, [reloadTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // Administrator voids a receipt: a reason (min 5 characters) is required by the server.
  async function voidDonation(d) {
    const res = await promptDialog({
      title: `${tr('Void donation')} ${d.receipt_no}?`,
      message: tr('The receipt stays in the register as voided and drops out of collections. This cannot be undone.'),
      tone: 'danger', confirmLabel: tr('Void donation'), cancelLabel: tr('Keep donation'),
      fields: [{ k: 'reason', label: tr('Reason'), required: true, placeholder: tr('Why is this donation being voided?') }],
    })
    if (!res) return
    try { await DonationsAPI.void(d.id, res.reason.trim()); toast(tr('Donation voided.')); load() }
    catch (ex) { toast(getErrorMessage(ex, tr('Could not void this donation.')), 'error') }
  }

  const load = useCallback(async () => {
    if (view === 'annadanam') return   // the Annadanam view loads its own list
    setLoading(true); setLoadErr('')
    try {
      const [d, s] = await Promise.all([
        DonationsAPI.list({ q, type, category, mode, start, end, page, size: SIZE, sort_by: sorts[0]?.key || 'donated_on', sort_dir: sorts[0]?.direction || 'desc', col_filters: filtersToParam(filters) }),
        DonationsAPI.stats().catch(() => null),
      ])
      setRows(d.items); setTotal(d.total); if (s) setStats(s)
    } catch (ex) {
      setLoadErr(getErrorMessage(ex, LOAD_ERROR)); setRows([]); setTotal(0)
    } finally { setLoading(false) }
  }, [q, type, category, mode, start, end, page, sorts, filters, view])
  // Load on initial mount, page changes, reload trigger, or switching back to this view
  useEffect(() => { load() }, [page, reloadTrigger, listTrigger, view]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    DonationCategoriesAPI.list().then((r) => setCats(r.items.filter((c) => c.active))).catch(() => toast(tr('Failed to load donation categories'), 'error'))
  }, [])
  // Settings › Donations & Payments: how far back the Administrator may date a donation, and the
  // amount above which the counter is asked to confirm (2026-11-15)
  const [cfg, setCfg] = useState({ backdays: 7, confirmAbove: 100000 })
  useEffect(() => {
    SettingsAPI.config().then((c) => setCfg({
      backdays: Number.isInteger(c?.donation_backdate_days) ? c.donation_backdate_days : 7,
      confirmAbove: Number.isFinite(Number(c?.donation_confirm_amount)) ? Number(c.donation_confirm_amount) : 100000,
    })).catch(() => {})
  }, [])
  const isAdmin = isAdminRole(user)

  // debounced devotee type-ahead (only while the drawer is open and none picked yet)
  useEffect(() => {
    if (!drawer || drawer.devotee_id || dq.trim().length < 1) { setDevResults([]); return }
    const t = setTimeout(
      () => DevoteesAPI.lookup({ q: dq, size: 6 }).then((r) => setDevResults(r.items || [])).catch(() => setDevResults([])),
      250,
    )
    return () => clearTimeout(t)
  }, [dq, drawer])

  // A full 10-digit mobile of a registered devotee links them (one devotee per phone)
  const [mobileNew, setMobileNew] = useState(false)
  useEffect(() => {
    const m = (drawer?.mobile || '').trim()
    setMobileNew(false)
    if (!drawer || drawer.devotee_id || (drawer.country_code || '+91') !== '+91' || m.length !== 10) return undefined
    let live = true
    DevoteesAPI.lookup({ q: m, size: 5 }).then((r) => {
      if (!live) return
      const hit = (r.items || []).find((d) => d.mobile === m)
      if (hit) setDrawer((d) => (d && !d.devotee_id ? { ...d, devotee_id: hit.id, donor_name: hit.name, mobile: hit.mobile } : d))
      else setMobileNew(true)
    }).catch(() => {})
    return () => { live = false }
  }, [drawer?.mobile, drawer?.devotee_id, drawer?.country_code]) // eslint-disable-line react-hooks/exhaustive-deps

  const drawerCats = useMemo(
    () => cats.filter((c) => c.type === (drawer?.donation_type || 'Cash')),
    [cats, drawer?.donation_type],
  )

  // 80G is only for Medical donations, and there it is mandatory (always on, PAN required);
  // every other donation has no 80G and the PAN is optional. The server enforces the same rule.
  const isMedicalFund = (name) => (name || '').toLowerCase().includes('medical')
  // No category is picked for the staff (client, 2026-11-26): every tab starts at "Select a category"
  // and the form has autoComplete="off": the browser offers no remembered text — staff pick or type every
  // time; the devotee search and the category list (new Donation Master entries included) work as before
  function setDType(t) {
    setDrawer((m) => ({
      ...m, donation_type: t, fund: '',
      unit: '', quantity: '', amount: t === 'Material' ? '' : m.amount, item_desc: '', est_value: '', expiry_date: '',
      g80: false,
    }))
  }
  function setFund(name) {
    setDrawer((m) => ({ ...m, fund: name, g80: isMedicalFund(name), expiry_date: '' }))
    clearErr('fund'); clearErr('pan')
  }
  function pickDevotee(dv) {
    setDrawer((m) => ({ ...m, devotee_id: dv.id, donor_name: dv.name, mobile: dv.mobile || '' }))
    setDq(''); setDevResults([])
  }
  // Reset (client, 2026-11-20): a fresh drawer on the same tab — as if just opened / tab just picked
  function resetDrawer() {
    const t = drawer?.donation_type || 'Cash'
    setDrawer({ ...newDonation(), donation_type: t })
    if (t !== 'Cash') setDType(t)   // same as a tab click — no category picked
    setDq(''); setDevResults([]); setFormErr(null); setMobileError('')
  }
  function clearDevotee() {
    setDrawer((m) => ({ ...m, devotee_id: '', donor_name: '', mobile: '' }))
    setDq(''); setDevResults([])
  }

  // Gold / silver category with grams: weight (required), what it is and an optional amount — no purity (client, 2026-11-20)
  const fundCat = drawer ? (cats || []).find((c) => c.name === drawer.fund && c.type === 'Material') : null
  const metal = drawer?.donation_type === 'Material' && isGrams(fundCat?.unit) ? metalOf(drawer.fund) : null
  // Consumables with "Track expiry" in Donation Master (ghee, oil…): optional best-before date
  const askExpiry = drawer?.donation_type === 'Material' && fundCat?.tracking === 'Quantity' && !!fundCat?.track_expiry

  async function save(e, print) {
    e.preventDefault()
    if (saving) return
    const m = drawer

    // Every check runs, so all wrong fields show together (client, 2026-11-26)
    const errs = {}
    if (!(m.fund || '').trim()) errs.fund = tr('Please select a Donation Category.')
    if (m.donation_type === 'Material') {
      if (Number(m.quantity || 0) <= 0) errs.quantity = tr('Quantity must be greater than zero for material donations.')
    } else if (Number(m.amount || 0) <= 0) {
      errs.amount = tr('Amount must be greater than zero.')
    }
    // A typed +91 mobile must be a whole, real one — a foreign one is checked by the server
    if ((m.country_code || '+91') === '+91' && (m.mobile || '').trim()) {
      const mob = validatePhone(m.mobile.trim())
      if (!mob.valid) { errs.mobile = mob.error; setMobileError(mob.error) }
    }
    // UTR is required for online payments (non-material donations) — the one UTR rule on every bill
    if (m.donation_type !== 'Material' && m.mode === 'UPI/QR Code') {
      const trimmedUtr = (m.txn_ref || '').trim()
      if (!trimmedUtr) errs.utr = tr('UTR / Transaction ID is required for online payments.')
      else if (!/^[A-Za-z0-9]{6,40}$/.test(trimmedUtr)) errs.utr = tr('The UTR must be 6–40 letters and digits.')
    }
    // 80G (Medical) needs a PAN; a typed PAN must be a real one even where it is optional
    if (isMedicalFund(m.fund) && !(m.pan || '').trim()) errs.pan = tr('PAN is required for tax-exemption (80G) receipts.')
    else {
      const panCheck = validatePAN(m.pan)
      if (!panCheck.valid) errs.pan = panCheck.error
    }
    if (Object.keys(errs).length) {
      if (Object.keys(errs).length > 1) errs.form = tr('Please fix the errors above.')
      showErrs(errs); return
    }
    // A very large amount: check it with the devotee first (Settings › Donations & Payments)
    let confirmed = false
    if (m.donation_type !== 'Material' && cfg.confirmAbove > 0 && Number(m.amount) > cfg.confirmAbove) {
      confirmed = await confirmDialog({
        title: tr('Is the amount right?'), confirmLabel: tr('Yes, record it'),
        message: `₹${Number(m.amount).toLocaleString('en-IN')} — ${tr('please read the amount back to the devotee before recording it.')}`,
      })
      if (!confirmed) return
    }
    setFormErr(null); setSaving(true)
    const payload = {
      donation_type: m.donation_type,
      devotee_id: m.devotee_id ? Number(m.devotee_id) : null,
      donor_name: (m.donor_name || '').trim() || 'Anonymous',
      mobile: (m.mobile || '').trim() || null,
      confirmed,
      donated_on: isAdmin && m.donated_on ? m.donated_on : undefined,
      fund: m.fund, mode: m.donation_type === 'Material' ? '-' : m.mode,
      txn_ref: m.mode === 'UPI/QR Code' ? (m.txn_ref || null) : null,
      amount: m.donation_type === 'Material' ? 0 : Number(m.amount || 0),
      unit: m.donation_type === 'Material' ? (fundCat?.unit || m.unit || null) : null,
      quantity: m.donation_type === 'Material' && m.quantity ? Number(m.quantity) : null,
      item_desc: m.donation_type === 'Material' ? ((m.item_desc || '').trim() || null) : null,
      est_value: m.donation_type === 'Material' && m.est_value !== '' && m.est_value != null ? Number(m.est_value) : null,
      expiry_date: m.donation_type === 'Material' && askExpiry && m.expiry_date ? m.expiry_date : null,
      pan: (m.pan || '').trim() || null,
      g80: isMedicalFund(m.fund), notes: m.notes || null,
    }
    try {
      const created = await DonationsAPI.create(payload)
      setDrawer(null); setDq(''); setDevResults([]); setFormErr(null); load()
      if (print) setPrintDoc(created)
      const cat = cats.find((c) => c.name === created.fund)
      // The counter only receives the item; the Stores Officer tags it from Stores › Pending Tagging
      // (client, 2026-11-26) — the tag screen opens here only for the Stores Officer / Administrator
      if (created.donation_type === 'Material' && cat?.tracking === 'Tagged' && canManageStores(user)) {
        setTagSource({ type: 'Donation', id: created.id })   // opens once the receipt is closed
      }
    } catch (err) {
      fail('form', getErrorMessage(err, tr('Could not save the donation. Please try again.')))
    } finally {
      setSaving(false)
    }
  }

  // Material donation → its items in Stores: the tagged pieces (popup), or the Consumables
  // Stock ledger for quantity goods (rice, ghee…). Shown to staff who can open those screens.
  const storeLink = (d) => {
    const st = d.stock
    if (!st) return null
    const cls = 'mt-1 inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-maroon-700 hover:underline'
    if (st.tracking === 'Quantity') {
      return canAccessKey(user, 'stores/consumables')
        ? <div><Link to={`/admin/stores/consumables?item=${st.category_id}&q=${encodeURIComponent(d.donation_code || d.receipt_no)}`} className={cls}><Boxes size={12} />{tr('In Consumable Stock Management')}</Link></div>
        : null
    }
    if (!canAccessKey(user, 'stores/register')) return null
    return <div><button type="button" onClick={() => setItemsFor(d)} className={`${cls} ${st.pieces ? '' : '!text-amber-700'}`}>
      <Boxes size={12} />{st.pieces ? `${st.pieces} ${(st.pieces === 1 ? tr('item') : tr('items'))}` : tr('Not tagged yet')}</button></div>
  }
  const amountCell = (d) => d.donation_type === 'Material'
    ? (d.quantity ? `${num(d.quantity)} ${tr(d.unit || '')}`.trim() : (Number(d.amount) > 0 ? inr(d.amount) : '—'))
    : inr(d.amount)

  const ALL_EXPORT_COLS = [{ key: 'receipt_no', label: tr('Receipt No.') }, { key: 'donated_on', label: tr('Date') },
    { key: 'donor_name', label: tr('Donor') }, { key: 'donation_type', label: tr('Type') },
    { key: 'fund', label: tr('Category') }, { key: 'amount', label: tr('Amount (₹)'), type: 'money' },
    { key: 'mode', label: tr('Mode') }, { key: 'txn_ref', label: tr('UTR') }, { key: 'g80x', label: tr('80G') }]
  // Hide money columns for non-finance roles
  const EXPORT_COLS = canSeeAmounts ? ALL_EXPORT_COLS : ALL_EXPORT_COLS.filter(c => c.type !== 'money')
  // Material donations are goods: qty+unit instead of ₹0, and no payment mode.
  // Use allFilteredData when date filter applied (ALL records), otherwise use current page
  const dataForExport = (start || end) ? allFilteredData : displayRows
  const exportRows = dataForExport.map((d) => ({
    ...d, g80x: d.g80 ? 'Yes' : 'No',
    amount: canSeeAmounts ? (d.donation_type === 'Material' ? (Number(d.amount) > 0 ? d.amount : null) : d.amount) : null,
    mode: d.donation_type === 'Material' ? '—' : (d.mode === 'UPI/QR Code' ? 'Online' : d.mode),
  }))
  const exportTotal = canSeeAmounts ? { receipt_no: 'Total', amount: dataForExport.reduce((s, d) => s + Number(d.amount || 0), 0) } : null
  return (
    <div>
      <PageTitle title={tr("Donation Management")} subtitle={tr("Record, manage and view all donations.")}
        actions={<span className="inline-flex items-center gap-2">{view === 'donations' && <ExportButtons title={tr("Donation Register")} columns={EXPORT_COLS} rows={exportRows} total={exportTotal}
          screen="Donation Register" start={start} end={end} available={total} filters={[['Search', q], ['Type', type], ['Category', category], ['Payment mode', mode], ...colFilters(filters, sortColumns)]} />}{canWrite ? <button onClick={() => { setDrawer({ ...newDonation(), donation_type: view === 'annadanam' && annadanamTab ? 'Annadanam' : 'Cash' }); setDq(''); setDevResults([]); setFormErr(null); setMobileError('') }} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Record Donation</T></button> : <span className="px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-blue-50 text-blue-700"><T>View only</T></span>}</span>} />

      {showAnnadanam && (
        <div className="inline-flex mb-4 rounded-lg border border-gray-200 bg-white p-1 shadow-sm" role="tablist" aria-label={tr('Donation views')}>
          {[['donations', 'Donations'], ['annadanam', 'Annadanam']].map(([v, label]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => view !== v && switchView(v)}
              className={`px-4 py-1.5 rounded-md text-[0.8125rem] font-semibold transition-colors ${view === v ? 'bg-maroon-700 text-cream' : 'text-gray-600 hover:bg-gray-50'}`}>{tr(label)}</button>
          ))}
        </div>
      )}

      {view === 'annadanam' ? <AnnadanamRegister key={annadanamKey} /> : <>
      {user?.role !== 'Counter Staff' && (
        <KpiGrid>
          <StatTile icon={Sprout} color="#059669" bg="bg-emerald-50" title={tr("Today's Donations")}
            value={stats ? inr(stats.today.amount) : '—'} sub={stats ? `${num(stats.today.count)} Transactions` : ''} />
          <StatTile icon={CalendarDays} color="#7c3aed" bg="bg-violet-50" title={tr("This Month Donations")}
            value={stats ? inr(stats.month.amount) : '—'} sub={stats ? `${num(stats.month.count)} Transactions` : ''} />
          <StatTile icon={Package} color="#d97706" bg="bg-amber-50" title={tr("Material Donations")}
            value={stats ? num(stats.material) : '—'} sub={tr("Material Donations")} />
          <StatTile icon={HandHeart} color="#2563eb" bg="bg-blue-50" title={tr("Sponsorships")}
            value={stats ? num(stats.sponsorship) : '—'} sub={tr("Recorded Sponsorships")} />
        </KpiGrid>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <FilterPanel>
        <div className="px-5 py-5 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[10rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search by Devotee Name / Mobile</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search name or mobile number…")} className="input !pl-9" /></div>
          </div>
          <div className="w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>From</T></label>
            <DateField value={start} onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd('') }} className="input" />
          </div>
          <div className="w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
            <DateField value={end} onChange={(e) => setEnd(e.target.value)} min={start} className="input" />
          </div>
          <div className="w-[9rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Donation Type</T></label>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="input"><option value="">{tr("All")}</option><option value="Cash">{tr("Cash Donation")}</option><option value="Material">{tr("Material Donation")}</option><option value="Sponsorship">{tr("Sponsorship")}</option></Select>
          </div>
          <div className="w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Category</T></label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="input"><option value="">{tr("All")}</option>{[...new Map(cats.map((c) => [c.name, c])).values()].map((c) => <option key={c.id} value={c.name}>{teTerm(c.name)}</option>)}</Select>
          </div>
          <div className="w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Payment Mode</T></label>
            <Select value={mode} onChange={(e) => setMode(e.target.value)} className="input"><option value="">{tr("All")}</option>{MODES.map((m) => <option key={m}>{m}</option>)}</Select>
          </div>
          <button onClick={() => { setPage(1); setReloadTrigger(t => t + 1) }} className="btn-maroon !py-2.5 shrink-0"><Search size={14} />{' '}<T>Apply</T></button>
          <button onClick={() => { setFilters({ q: '', type: '', category: '', mode: '', start: '', end: '', page: 1 }); setReloadTrigger(t => t + 1) }} className="btn-outline !py-2.5 shrink-0"><RotateCcw size={14} />{' '}<T>Clear</T></button>
        </div>
        </FilterPanel>

        <SortFilterPanel
          sorts={sorts}
          filters={filters}
          columns={sortColumns}
          onToggleSort={handleColumnClick}
          onRemoveSort={removeSort}
          onClearSorts={clearSorts}
          onClearFilter={clearFilter}
          onClearAllFilters={clearAllFilters}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              {sortColumns.filter((col) => SHOWN[col.key]).map((col) => (
                <SortableFilterableTh
                  key={col.key}
                  colKey={col.key}
                  label={tr(SHOWN[col.key])}
                  type={col.type}
                  // Number columns: left-aligned like their cells, so the figures sit directly under the
                  // title (a right-aligned title is pushed left by its hidden sort icon).
                  className={col.type === 'money' || col.type === 'num' ? '!text-left' : ''}
                  filterable={col.filterable}
                  filterOptions={col.filterOptions}
                  onSort={handleColumnClick}
                  sortIndex={getSortIndex(col.key)}
                  sortDirection={getSortDirection(col.key)}
                  multiSort={sorts.length > 1}
                  filterValues={getFilterValues(col.key)}
                  onToggleFilter={toggleFilterValue}
                  onClearFilter={clearFilter}
                />
              ))}
              <th className="px-4 py-3 font-semibold whitespace-nowrap">{tr('Actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {displayRows.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[0.75rem]">
                    <div className="text-maroon-600 whitespace-nowrap">{d.donation_code || d.receipt_no}</div>
                    {d.donation_code && d.receipt_no && <div className="text-gray-500 whitespace-nowrap">{d.receipt_no}</div>}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{personName({ name: d.donor_name, name_te: d.donor_name_te }, lang)}</td>
                  <td className="px-4 py-3 text-gray-700">{teTerm(d.fund)}{d.g80 && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[0.625rem] font-bold bg-emerald-50 text-emerald-700 align-middle">80G</span>}
                    <div className="text-[0.75rem] text-gray-500">{tr(TYPE_LABEL[d.donation_type] || d.donation_type)}</div></td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{canSeeAmounts ? amountCell(d) : '—'}{storeLink(d)}
                    {d.donation_type !== 'Material' && d.mode && d.mode !== '-' && <div className="text-[0.75rem] font-normal text-gray-500">{tr(d.mode === 'UPI/QR Code' ? 'Online' : d.mode)}</div>}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="text-gray-700 text-[0.8125rem]">{fmtDate(d.donated_on)}</div><div className="text-[0.6875rem] text-gray-400">{fmtTime(d.created_at)}</div></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setDirectPrint(true); setPrintDoc(d) }} title={tr("Print receipt directly")} aria-label={tr("Print receipt directly")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700 hover:border-maroon-300"><Printer size={15} /></button>
                      <button onClick={() => { setDirectPrint(false); setPrintDoc(d) }} title={tr("View receipt on screen")} aria-label={tr("View receipt on screen")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700 hover:border-maroon-300"><Eye size={15} /></button>
                      {canVoid && <button onClick={() => voidDonation(d)} title={tr("Void donation")} aria-label={tr("Void donation")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-red-700 hover:border-red-300"><Ban size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <TableStates colSpan={6} loading={loading} error={loadErr} onRetry={load} empty={tr("No donations found.")} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit={tr("transactions")} />
        </div>
      </div>
      </>}

      {/* ── Record Donation drawer ── */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Record Donation</T></h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5">{drawer.donation_type === 'Annadanam'
                  ? <T>Select devotee, enter number of persons, record payment and generate receipt.</T>
                  : <T>Enter donation details and issue receipt.</T>}</p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className={`px-6 pt-5 grid gap-2 ${annadanamTab ? 'grid-cols-4' : 'grid-cols-3'}`}>
              {['Cash', 'Material', 'Sponsorship', ...(annadanamTab ? ['Annadanam'] : [])].map((t) => (
                <button type="button" key={t} onClick={() => setDType(t)} className={`border rounded-lg py-2 px-1 leading-tight text-[0.78125rem] font-semibold ${drawer.donation_type === t ? 'border-maroon-500 bg-maroon-700 text-cream' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{tr(TYPE_LABEL[t])}</button>
              ))}
            </div>
            {drawer.donation_type === 'Annadanam' ? (
              <AnnadanamForm onCancel={() => setDrawer(null)}
                onSaved={(created) => { setDrawer(null); setAnnadanamKey((k) => k + 1); setAnnadanamDoc(created) }} />
            ) : (
          <form onSubmit={(e) => save(e, true)} autoComplete="off" className="flex-1 flex flex-col">
            <div className="px-6 py-5 space-y-5 flex-1">
              <div>
                <label className="label"><T>Devotee (optional — leave blank for walk-in)</T></label>
                {drawer.devotee_id ? (
                  <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-3.5 py-3 bg-gray-50/50">
                    <div className="w-10 h-10 rounded-full bg-maroon-700 text-cream grid place-items-center"><User size={18} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className="font-semibold text-gray-800">{personName({ name: drawer.donor_name }, lang)}</span><Pill tone="green"><T>Registered</T></Pill></div>
                      {drawer.mobile && <div className="text-[0.75rem] text-gray-500">{tr('Mobile:')} {drawer.mobile}</div>}
                    </div>
                    <button type="button" onClick={clearDevotee} className="text-gray-400 hover:text-red-600"><X size={17} /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input autoComplete="off" className="input pr-9" placeholder={tr("Search registered devotee by name / mobile…")} value={dq} onChange={(e) => setDq(e.target.value)} onKeyDown={devPick.onKeyDown} />
                    {devResults.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-gray-100 rounded-lg shadow-lg py-1">
                        {devResults.map((d, i) => (
                          <button type="button" key={d.id} onClick={() => pickDevotee(d)} {...devPick.rowProps(i)} className={`pick-row ${devPick.rowClass(i)} w-full text-left px-3 py-2 flex items-center gap-2`}>
                            <span className="pick-avatar transition-colors w-7 h-7 rounded-full bg-amber-50 text-amber-700 grid place-items-center text-[0.75rem] font-bold">{d.name?.[0]}</span>
                            <span><span className="pick-name font-semibold text-gray-800 text-[0.8125rem]">{personName(d, lang)}</span><span className="block text-[0.6875rem] text-gray-400">{d.code} · {d.mobile}</span></span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div><label className="label"><T>Donor Name *</T></label>
                  <input autoComplete="off" required className="input" placeholder={tr("Donor Name")} value={personName({ name: drawer.donor_name }, lang)} onChange={(e) => setDrawer({ ...drawer, donor_name: sanitizeName(e.target.value) })} /></div>
                <div data-err-field="mobile"><label className="label"><T>Mobile (Optional)</T></label>
                  <div className="flex">
                    <CountryCodeSelect value={drawer.country_code || '+91'} onChange={(e) => { setDrawer({ ...drawer, country_code: e.target.value, ...(drawer.devotee_id ? { devotee_id: '', donor_name: '' } : {}) }); setMobileError('') }} />
                    <input autoComplete="off" className={`input flex-1 !rounded-l-none ${mobileError ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''}`} placeholder={tr("Enter Mobile Number")} maxLength={getCountryDigits(drawer.country_code || '+91')} value={drawer.mobile} onChange={(e) => {
                      const cleaned = sanitizePhone(e.target.value)
                      // A changed number is no longer the linked devotee → unlink and clear their name (client, 2026-11-25)
                      setDrawer({ ...drawer, mobile: cleaned, ...(drawer.devotee_id && cleaned !== drawer.mobile ? { devotee_id: '', donor_name: '' } : {}) })
                      if ((drawer.country_code || '+91') === '+91') {
                        if (cleaned.length === 10) {
                          const validation = validatePhone(cleaned)
                          setMobileError(validation.valid ? '' : 'Invalid Mobile Number. Please Enter Valid Mobile Number')
                        } else if (cleaned.length >= 1 && cleaned.length < 10) {
                          setMobileError('Please Enter 10 digits Mobile Number')
                        } else {
                          setMobileError('')
                        }
                      } else {
                        setMobileError('')
                      }
                    }} />
                  </div>
                  {mobileError && <p className="text-[0.6875rem] text-red-600 mt-1 font-medium">{tr(mobileError)}</p>}
                  {!mobileError && mobileNew && !drawer.devotee_id && (drawer.donor_name || '').trim() && (
                    <p className="text-[0.6875rem] text-blue-700 mt-1 flex items-center gap-1"><User size={11} />{tr('New devotee — registered on this mobile when the donation is saved.')}</p>)}</div>
              </div>

              <div data-err-field="fund"><label className="label"><T>Donation Category *</T></label>
                {/* only Donation Master categories in use — a typed name would split the reports */}
                <Select value={drawer.fund} onChange={(e) => setFund(e.target.value)} className={`input ${errRing('fund')}`} aria-label={tr('Donation Category')}>
                  <option value="">{tr('Select a category')}</option>
                  {[...new Set(drawerCats.map((c) => c.name))].map((n) => <option key={n} value={n}>{teTerm(n)}</option>)}
                </Select><ErrText f="fund" /></div>

              {drawer.donation_type === 'Material' && metal ? (
                <div className="space-y-3">
                  {/* client, 2026-11-20: no purity; an optional amount like other goods */}
                  <div className="grid grid-cols-2 gap-3">
                    <div data-err-field="quantity"><label className="label">{tr('Weight *')} ({tr('grams')})</label><NumberField required step="0.01" min="0.01" max="999999" value={drawer.quantity} onChange={(e) => { setDrawer({ ...drawer, quantity: e.target.value }); clearErr('quantity') }} /><ErrText f="quantity" /></div>
                    <div><label className="label">{tr('Amount (₹)')} <span className="font-normal text-gray-400">{tr('(Optional)')}</span></label>
                      <NumberField min="0" max="99999999" step="1" allowDecimal={false} prefix="₹" value={drawer.est_value} onChange={(e) => setDrawer({ ...drawer, est_value: e.target.value })} /></div>
                  </div>
                  <div><label className="label"><T>What is it</T></label>
                    <input autoComplete="off" className="input" maxLength={120} placeholder={tr('e.g. chain, ring, coin, lamp')} value={drawer.item_desc} onChange={(e) => setDrawer({ ...drawer, item_desc: e.target.value })} /></div>
                  <div className="text-[0.75rem] text-gray-500"><Info size={13} className="inline mr-1" /><T>Gold and silver are kept by weight. The amount is optional — printed on the receipt as stated by the donor, not cash.</T></div>
                </div>
              ) : drawer.donation_type === 'Material' ? (
                <div className="grid grid-cols-2 gap-3">
                  {(() => {
                    // The unit is the category's own (Donation Master) — never typed, so "500 ml" can't land in a
                    // balance kept in Litres; pieces are whole numbers, weights / volumes may have decimals (2026-11-15)
                    const whole = fundCat?.tracking === 'Tagged' || /^(nos|pieces?|packet|count|number)$/i.test((fundCat?.unit || '').trim())
                    return (<>
                      <div data-err-field="quantity"><label className="label"><T>Quantity *</T></label><NumberField required step={whole ? '1' : '0.001'} min={whole ? '1' : '0.001'} max="999999" allowDecimal={!whole} value={drawer.quantity} onChange={(e) => { setDrawer({ ...drawer, quantity: e.target.value }); clearErr('quantity') }} /><ErrText f="quantity" /></div>
                      <div><label className="label"><T>Unit</T></label><div className="input bg-gray-50 text-gray-700">{fundCat?.unit ? tr(fundCat.unit) : '—'}</div></div>
                    </>)
                  })()}
                  {/* the devotee's own description and value (optional) — printed on the receipt, pre-filled at tagging */}
                  <div className="col-span-2"><label className="label"><T>What is it</T></label>
                    <input autoComplete="off" className="input" maxLength={120} placeholder={tr('e.g. silk pancha, red · steel plate')} value={drawer.item_desc} onChange={(e) => setDrawer({ ...drawer, item_desc: e.target.value })} /></div>
                  <div className="col-span-2"><label className="label">{tr('Value ₹ (optional)')}</label>
                    <NumberField min="0" max="99999999" step="1" allowDecimal={false} prefix="₹" value={drawer.est_value} onChange={(e) => setDrawer({ ...drawer, est_value: e.target.value })} />
                    <div className="text-[0.6875rem] text-gray-500 mt-1">{tr('Ask the devotee (or see their bill). Printed on the receipt as "stated by donor" — not cash.')}</div></div>
                  {askExpiry && (
                    <div className="col-span-2"><label className="label">{tr('Expiry date (optional)')}</label>
                      <DateField min={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })} value={drawer.expiry_date} onChange={(e) => setDrawer({ ...drawer, expiry_date: e.target.value })} />
                      <div className="text-[0.6875rem] text-gray-500 mt-1">{tr('From the packet. The Stores Officer can add it later if not known.')}</div></div>)}
                </div>
              ) : (
                <div data-err-field="amount"><label className="label"><T>Amount (₹) *</T></label><NumberField required min="1" max="99999999" step="1" allowDecimal={false} prefix="₹" value={drawer.amount} onChange={(e) => { setDrawer({ ...drawer, amount: e.target.value }); clearErr('amount') }} /><ErrText f="amount" /></div>
              )}

              {drawer.donation_type !== 'Material' && (
                <>
                  <div><label className="label"><T>Payment Mode *</T></label>
                    <div className="flex gap-6 mt-1">{MODES.map((mo) => (
                      <label key={mo} className="flex items-center gap-2 text-sm text-gray-700"><input autoComplete="off" type="radio" name="pmode" className="accent-maroon-700" checked={drawer.mode === mo} onChange={() => { setDrawer({ ...drawer, mode: mo }); clearErr('utr') }} /> {tr(mo === 'UPI/QR Code' ? 'Online' : mo)}</label>
                    ))}</div>
                  </div>
                  {drawer.mode === 'UPI/QR Code'
                    ? <div data-err-field="utr"><label className="label"><T>UTR / Transaction ID</T></label><input autoComplete="off" className={`input ${errRing('utr')}`} placeholder={tr("Enter UTR / transaction reference")} value={drawer.txn_ref} onChange={(e) => { setDrawer({ ...drawer, txn_ref: e.target.value }); clearErr('utr') }} /><ErrText f="utr" /></div>
                    : <div className="bg-blue-50/70 border border-blue-100 rounded-lg px-3 py-2.5 text-[0.75rem] text-gray-600 flex items-start gap-2"><Info size={15} className="text-blue-500 shrink-0 mt-0.5" />{' '}<T>UTR / Transaction ID is required only for online payments.</T></div>}
                </>
              )}

              <div><label className="label"><T>Donation Date *</T></label>
                {isAdmin && cfg.backdays > 0 ? (<>
                  <DateField value={drawer.donated_on || todayISO()} min={daysBack(cfg.backdays)} max={todayISO()} onChange={(e) => setDrawer({ ...drawer, donated_on: e.target.value })} />
                  <div className="text-[0.6875rem] text-gray-500 mt-1">{tr('Administrator: up to {n} days back (Settings › Donations & Payments).').replace('{n}', cfg.backdays)}</div>
                </>) : (
                  <div className="relative"><input autoComplete="off" className="input bg-gray-50 pr-9" value={todayStamp()} readOnly /><Calendar size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" /></div>)}</div>

              {isMedicalFund(drawer.fund) ? (<>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 text-[0.75rem] text-emerald-700 flex items-start gap-2"><Info size={15} className="text-emerald-500 shrink-0 mt-0.5" />{' '}<T>80G Tax Exemption enabled — PAN is mandatory for this receipt.</T></div>
                <label className="flex items-center gap-2 text-sm text-gray-700" title={tr('Always on for Medical donations')}><Checkbox checked disabled onChange={() => {}} /> {tr('Eligible for Tax Exemption (80G)')}</label>
              </>) : (
                <div className="bg-blue-50/70 border border-blue-100 rounded-lg px-3 py-2.5 text-[0.75rem] text-gray-600 flex items-start gap-2"><Info size={15} className="text-blue-500 shrink-0 mt-0.5" />{' '}<T>Tax exemption (80G) is applicable only for Medical Donations.</T></div>
              )}

              <div data-err-field="pan"><label className="label">{tr("PAN")} {isMedicalFund(drawer.fund)
                  ? <><span className="text-red-500">*</span><span className="text-[0.6875rem] text-gray-400 font-normal"> <T>(required for 80G)</T></span></>
                  : <span className="text-[0.6875rem] text-gray-400 font-normal"> <T>(Optional)</T></span>}</label>
                <input autoComplete="off" className={`input uppercase ${errOf('pan') ? errRing('pan') : isMedicalFund(drawer.fund) && !drawer.pan ? 'border-amber-400' : ''}`} placeholder={tr("Enter PAN Card Number")}
                  value={drawer.pan} onChange={(e) => { setDrawer({ ...drawer, pan: e.target.value.toUpperCase() }); clearErr('pan') }} />
                <ErrText f="pan" /></div>

              <div><label className="label"><T>Notes (Optional)</T></label>
                <textarea autoComplete="off" className="input min-h-[4.5rem]" maxLength={250} placeholder={tr("Enter any additional notes…")} value={drawer.notes} onChange={(e) => setDrawer({ ...drawer, notes: e.target.value })} />
                <div className="text-right text-[0.6875rem] text-gray-400 mt-0.5">{(drawer.notes || '').length} / 250</div></div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              {errOf('form') && <div className="text-[0.75rem] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3 text-center">{errOf('form')}</div>}
              {/* Small buttons with short names on every tab (client, 2026-11-26): Reset · Save · Print (saves, then prints) */}
              <div className="flex items-center justify-end gap-3">
                <ResetButton onReset={resetDrawer} disabled={saving} className="!py-2 !px-4 !text-[0.875rem] !gap-1.5" />
                <button type="button" disabled={saving} onClick={(e) => save(e, false)} className="btn-outline !py-2 !px-5 !text-[0.875rem] disabled:opacity-50"><T>Save</T></button>
                <button disabled={saving} title={tr('Save & Print Receipt')} className="btn-maroon !py-2 !px-5 !text-[0.875rem] !gap-1.5 disabled:opacity-60">{saving ? tr('Saving…') : <><Printer size={14} />{tr('Print')}</>}</button>
              </div>
            </div>
          </form>
            )}
          </div>
        </div>
      )}

      <AnnadanamReceiptModal doc={annadanamDoc} onClose={() => setAnnadanamDoc(null)} />
      {tagSource && !printDoc && <TagItemsDrawer source={tagSource} onClose={() => setTagSource(null)} />}
      {itemsFor && <DonationItemsDialog donation={itemsFor} onClose={() => setItemsFor(null)} />}
      {printDoc && (
        <div className={`fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto print-modal ${directPrint ? 'opacity-0 pointer-events-none print:opacity-100' : ''}`} onClick={() => setPrintDoc(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg my-auto">
            <div id="print-area">
              <Receipt title={tr("Donation Receipt")} titleTe="విరాళం రసీదు" no={printDoc.receipt_no} subNo={fmtDate(printDoc.donated_on)} subNoLabel="Date"
                {...(printDoc.donation_type === 'Material'
                  ? (printDoc.est_value != null
                    ? { amount: printDoc.est_value, amountLabel: 'Estimated Value',
                        amountNote: printDoc.rate_per_g != null ? 'Estimated value of the goods — not cash received.' : 'Value as stated by the donor — not cash received.' }
                    : { hideAmount: true })
                  : { amount: printDoc.amount })}
                rows={[
                  { en: 'Donor', value: printDoc.donor_name, valueTe: personName({ name: printDoc.donor_name, name_te: printDoc.donor_name_te }, 'te') },
                  { en: 'Category', value: printDoc.fund, valueTe: te(printDoc.fund) || teTerm(printDoc.fund) },
                  { en: 'Type', value: TYPE_LABEL[printDoc.donation_type], valueTe: te(printDoc.donation_type) },
                  ...(printDoc.donation_type === 'Material' && printDoc.quantity ? [{ en: metalOf(printDoc.fund) && isGrams(printDoc.unit) ? 'Weight' : 'Quantity', value: `${num(printDoc.quantity)} ${printDoc.unit || ''}`.trim() }] : [{ en: 'Payment Mode', value: printDoc.mode === 'UPI/QR Code' ? 'Online' : printDoc.mode }]),
                  ...(printDoc.item_desc ? [{ en: 'Item', value: printDoc.item_desc }] : []),
                  ...(printDoc.txn_ref ? [{ en: 'Transaction', value: printDoc.txn_ref, valueTe: printDoc.txn_ref }] : []),
                  { en: 'Tax Exemption', value: printDoc.g80 ? tr('Eligible (80G)') : '—' },
                ]}
                footerNote={printDoc.g80 ? tr('Eligible for 80G tax exemption.') : undefined} />
            </div>
            <div className="flex gap-2 justify-center mt-4 no-print">
              {/* window.print() returns once the print dialog closes; if pieces must be tagged,
                  close the receipt so Tag Items opens straight away */}
              <button onClick={() => { window.print(); if (tagSource) setPrintDoc(null) }} className="btn-maroon"><Printer size={15} />{' '}<T>Print Receipt</T></button>
              <button onClick={() => setPrintDoc(null)} className="btn-outline"><T>Close</T></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
