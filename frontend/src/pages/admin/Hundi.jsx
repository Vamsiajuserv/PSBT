import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  Plus, X, Eye, Search, RotateCcw, Calendar, Info, ChevronDown, Trash2, Upload,
  HandCoins, IndianRupee, Landmark, CalendarClock, FileText, Calculator, Users, ShieldCheck, Building2,
  Package, CheckCircle2, Gem, Lock, XCircle,
} from 'lucide-react'
import { useFilterableSortableTable, SortFilterPanel, SortableFilterableTh, filtersToParam } from '../../components/common/SortableTable.jsx'
import { PageTitle, StatTile, KpiGrid, Pill, Pager, inr, num, fmtDate, fmtStamp, fmtLocalStamp } from '../../components/admin/ui.jsx'
import { HundiAPI, HundiItemsAPI, DevoteesAPI, CommitteeAPI, SettingsAPI, StoresAPI, getErrorMessage } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { isAdminRole } from '../../auth/access.js'
import { TagItemsDrawer, canWriteStores } from './stores/shared.jsx'
import { TableStates } from '../../components/common/states.jsx'
import ExportButtons from '../../components/common/ExportButtons.jsx'
import { Select, DateField, DateTimeField, Checkbox, NumberField, Combobox } from '../../components/common/Field.jsx'
import { promptDialog, confirmDialog, toast } from '../../components/common/Dialog.jsx'
import { T, tr, personName, useLang } from '../../i18n/LanguageContext.jsx'
import { sanitizeItemName } from '../../lib/validation.js'
import { useFilterParams } from '../../hooks/useUrlState.js'

const DENOMINATIONS = ['Mixed', 'Notes', 'Coins', 'Foreign Currency', 'Jewellery']
// Stored values stay as above; 'Notes' is shown as 'Currency Notes' because plain
// 'Notes' means remarks elsewhere (గమనికలు), and Telugu needs a different word here.
const DENOM_LABEL = { Notes: 'Currency Notes' }
const VER_TONE = { Verified: 'green', 'Pending Verification': 'blue', Rejected: 'red' }
const DEP_TONE = { Deposited: 'green', 'Pending Deposit': 'amber', 'N/A': 'gray' }
const VAL_TONE = { 'In Store': 'green', 'Pending Custody': 'violet' }
const nowLocal = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const today = () => nowLocal().slice(0, 10)
// Counting Completed On must fall between the collection date and now. Same rules
// (and wording) as the server, which checks again on save.
const countingErr = (m) => {
  const v = m?.counting_completed_on
  if (!v) return ''
  if (v > nowLocal()) return tr('Counting completed on cannot be in the future.')
  if (m.collected_on && v.slice(0, 10) < m.collected_on) return tr('Counting cannot be completed before the collection date.')
  return ''
}
const memberCount = (s) => (s ? s.split(',').filter((x) => x.trim()).length : 0)
// A count is verified once this many of its assigned committee members approve it
// (backend REQUIRED_APPROVALS). Older counts with a single member need just that one.
const REQUIRED_APPROVALS = 2
const approvalsNeeded = (h) => Math.min(REQUIRED_APPROVALS, (h.committee_member_ids || []).length || REQUIRED_APPROVALS)

const emptyLine = () => ({ hundi_item_id: '', item_name: '', item_type: '', quantity: '', unit: '', value: '', remarks: '' })
const lineTotal = (lines) => lines.reduce((s, l) => s + Number(l.value || 0), 0)

const emptyForm = () => ({
  collected_on: today(), counting_completed_on: nowLocal(),
  denomination: 'Mixed', officer: '', lines: [emptyLine()],
  members: [], verified_by: '', verified_on: nowLocal(),
  deposit_status: 'Deposited', deposited_on: today(), bank_name: '', bank_ref: '', attachment: '',
})

export default function Hundi() {
  const { user } = useAuth()
  const { lang } = useLang()
  const canWrite = user?.role !== 'Accountant'
  const isAdmin = isAdminRole(user)
  // Only the committee members assigned to a count may approve or reject it; an
  // Administrator may override. A Committee login acts through its linked member.
  const myMemberId = user?.role === 'Committee' ? user?.committee_member_id : null
  const isAssigned = (h) => !!myMemberId && (h.committee_member_ids || []).includes(myMemberId)
  const hasApproved = (h) => (h.approvals || []).some((a) => a.member_id === myMemberId)
  const canApprove = (h) => h.verification_status === 'Pending Verification' && h.created_by !== user?.username
    && (isAdmin || (isAssigned(h) && !hasApproved(h)))
  // A member who has already approved has attested the count — they cannot also reject it.
  const canReject = (h) => h.verification_status === 'Pending Verification' && (isAdmin || (isAssigned(h) && !hasApproved(h)))
  // Only Admin, Committee, Accountant can see amounts in reports
  const canSeeAmounts = ['Admin', 'Administrator', 'Committee', 'Accountant'].includes(user?.role)
  const SIZE = 15
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [loadErr, setLoadErr] = useState('')
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [view, setView] = useState(null)
  const [committee, setCommittee] = useState([])
  const [banks, setBanks] = useState([])
  const [itemMaster, setItemMaster] = useState([])
  // Stores & Inventory: once valuables are in custody, tag each piece
  const [tagSource, setTagSource] = useState(null)

  // filters - persisted in URL for state preservation across navigation
  const {
    q, setQ, verification, setVerification, deposit, setDeposit,
    start, setStart, end, setEnd, page, setPage, setFilters,
  } = useFilterParams({
    q: '', verification: '', deposit: '', start: '', end: '', page: 1,
  })
  const [saving, setSaving] = useState(false)
  // An error the server returned for the collection date, shown under that field.
  const [dateServerErr, setDateServerErr] = useState('')
  const [countServerErr, setCountServerErr] = useState('')

  // State for all filtered records (for export when date filter applied)
  const [allFilteredData, setAllFilteredData] = useState([])
  const [loadingExport, setLoadingExport] = useState(false)

  // Sortable table columns with filtering support
  const sortColumns = [
    { key: 'code', label: 'Hundi ID', type: 'text' },
    { key: 'collected_on', label: 'Date', type: 'date' },
    { key: 'cash_amount', label: 'Cash (₹)', type: 'money' },
    { key: 'valuables_amount', label: 'Valuables (₹)', type: 'money' },
    { key: 'verification_status', label: 'Verification', type: 'text', filterable: true, filterOptions: ['Verified', 'Pending Verification', 'Rejected'] },
    { key: 'deposit_status', label: 'Cash Status', type: 'text', filterable: true, filterOptions: ['Deposited', 'Pending Deposit', 'N/A'] },
    { key: 'valuables_status', label: 'Valuables Status', type: 'text', filterable: true, filterOptions: ['In Store', 'Pending Custody'] },
  ]
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
      const d = await HundiAPI.list({ q, verification, deposit, start, end, page: 1, size: 10000, col_filters: filtersToParam(filters) })
      const items = d.items || []
      // Sort by date ascending (oldest first)
      items.sort((a, b) => (a.collected_on || '').localeCompare(b.collected_on || ''))
      setAllFilteredData(items)
    } catch (err) {
      toast(tr('Failed to fetch all records'), 'error')
      setAllFilteredData([])
    } finally {
      setLoadingExport(false)
    }
  }, [q, verification, deposit, start, end])

  // Fetch all data for export ONLY when Apply button is clicked (reloadTrigger changes)
  // User must click Apply to filter - no auto-fetch on date change
  useEffect(() => {
    if (start || end) {
      setLoadingExport(true)
      HundiAPI.list({ q, verification, deposit, start, end, page: 1, size: 10000, col_filters: filtersToParam(filters) })
        .then((d) => {
          const items = d.items || []
          items.sort((a, b) => (a.collected_on || '').localeCompare(b.collected_on || ''))
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

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('')
    try {
      const [d, s] = await Promise.all([
        HundiAPI.list({ q, verification, deposit, start, end, page, size: SIZE, sort_by: sorts[0]?.key || 'collected_on', sort_dir: sorts[0]?.direction || ((start || end) ? 'asc' : 'desc'), col_filters: filtersToParam(filters) }),
        HundiAPI.stats().catch(() => null),
      ])
      setRows(d.items); setTotal(d.total); if (s) setStats(s)
    } catch (ex) {
      setLoadErr(ex?.detail || tr("Couldn't load collections — check your connection and retry."))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q, verification, deposit, start, end, page, sorts, filters])
  // Load on initial mount, page changes, or reload trigger
  useEffect(() => { load() }, [page, reloadTrigger, listTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    CommitteeAPI.list()
      .then((r) => { const arr = Array.isArray(r) ? r : (r.items || []); setCommittee(arr.filter((c) => c.active)) })
      .catch(() => toast(tr('Failed to load committee members'), 'error'))
    SettingsAPI.config()
      .then((c) => setBanks(Array.isArray(c?.banks) ? c.banks : []))
      .catch(() => toast(tr('Failed to load bank settings'), 'error'))
    HundiItemsAPI.list()
      .then((r) => { const arr = Array.isArray(r) ? r : (r.items || []); setItemMaster(arr.filter((i) => i.active)) })
      .catch(() => toast(tr('Failed to load hundi items'), 'error'))
  }, [])

  // DEF-009: Use language-aware names for committee members
  const committeeNames = committee.map((c) => personName(c, lang))
  // Admin: correct a rejected count's items and send it back to the same members for approval
  const openResubmit = (h) => {
    setDateServerErr(''); setCountServerErr('')
    setDrawer({
      ...emptyForm(), resubmit: h, note: '',
      collected_on: h.collected_on || today(),
      counting_completed_on: h.counting_completed_on ? String(h.counting_completed_on).slice(0, 16) : nowLocal(),
      denomination: h.denomination || 'Mixed', officer: h.officer || '',
      members: h.committee_member_ids || [],
      lines: (h.items || []).length ? h.items.map((it) => ({
        hundi_item_id: it.hundi_item_id || '', item_name: it.item_name || '', item_type: it.item_type || '',
        quantity: it.quantity ?? '', unit: it.unit || '', value: it.value ?? '', remarks: it.remarks || '',
      })) : [emptyLine()],
    })
  }
  const openCreate = () => { setDateServerErr(''); setCountServerErr(''); setDrawer({ ...emptyForm(), bank_name: banks[0] || '' }) }
  const toggleMember = (id) => setDrawer((d) => ({ ...d, members: d.members.includes(id) ? d.members.filter((x) => x !== id) : [...d.members, id] }))

  // ── Item-wise counting register helpers ──
  const setLine = (i, patch) => setDrawer((d) => ({ ...d, lines: d.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  // Add new item at the top so the form appears first (Item 24)
  const addLine = () => setDrawer((d) => ({ ...d, lines: [emptyLine(), ...d.lines] }))
  const removeLine = (i) => setDrawer((d) => ({ ...d, lines: d.lines.length > 1 ? d.lines.filter((_, idx) => idx !== i) : d.lines }))
  const pickItem = (i, name) => {
    const it = itemMaster.find((x) => x.name === name)
    if (it) setLine(i, { hundi_item_id: it.id, item_name: it.name, item_type: it.item_type || '', unit: it.unit || '' })
    else setLine(i, { hundi_item_id: null, item_name: name, item_type: '', unit: '' })
  }

  async function depositCollection(h) {
    const cashAmt = h.cash_amount || 0
    const res = await promptDialog({
      title: `${tr('Record Cash Bank Deposit')} — ${h.code}`,
      message: `${tr('Cash amount')}: ${inr(cashAmt)}`,
      confirmLabel: tr('Record Deposit'),
      fields: [
        { k: 'bank_name', label: tr('Bank name'), defaultValue: h.bank_name || '', placeholder: tr('e.g. SBI Punjagutta') },
        { k: 'bank_ref', label: tr('Bank reference / challan no.'), note: tr('Optional') },
      ],
    })
    if (!res) return
    try { await HundiAPI.deposit(h.id, { bank_name: res.bank_name.trim() || null, bank_ref: res.bank_ref.trim() || null, deposited_on: today() }); toast(tr('Cash deposited to bank.')); load() }
    catch (ex) { toast(ex.detail || tr('Could not record the deposit.'), 'error') }
  }
  async function storeValuables(h) {
    const valAmt = h.valuables_amount || 0
    // Custody goes to one of the Store Locations — the same place the tagged pieces are tracked
    const locs = await StoresAPI.locations().then((r) => (r.items || []).filter((l) => l.active)).catch(() => [])
    if (!locs.length) { toast(tr('Add a store location first (Stores → Store Locations).'), 'error'); return }
    const res = await promptDialog({
      title: `${tr('Record Valuables Store Custody')} — ${h.code}`,
      message: `${tr('Valuables amount')}: ${inr(valAmt)}`,
      confirmLabel: tr('Record Custody'),
      fields: [
        { k: 'store_location', label: tr('Store Location'), type: 'select', required: true, defaultValue: '',
          options: locs.map((l) => ({ value: l.name, label: tr(l.name) })) },
        { k: 'custodian', label: tr('Custodian Name'), type: 'combobox', defaultValue: '', placeholder: tr('Committee member holding custody'),
          options: committee.map((c) => ({ value: c.name, label: personName(c, lang) })) },
      ],
    })
    if (!res) return
    try {
      await HundiAPI.store(h.id, { store_location: res.store_location.trim() || null, custodian: res.custodian.trim() || null, stored_on: today() })
      toast(tr('Valuables stored in custody.')); load()
      if (canWriteStores(user)) setTagSource({ type: 'Hundi', id: h.id })
    }
    catch (ex) { toast(ex.detail || tr('Could not record custody.'), 'error') }
  }
  async function rejectCollection(h) {
    const res = await promptDialog({
      title: `${tr('Flag a discrepancy')} — ${h.code}`,
      message: tr('Counted amount: ₹{amount}. The collection will be marked Rejected.').replace('{amount}', h.counted_amount),
      tone: 'danger', confirmLabel: tr('Reject Collection'),
      fields: [{ k: 'reason', label: tr('Reason'), required: true, placeholder: tr('What is wrong with this count?') }],
    })
    if (!res) return
    try { await HundiAPI.reject(h.id, { reason: res.reason.trim() }); toast(tr('Collection rejected.')); load() }
    catch (ex) { toast(ex.detail || tr('Could not reject this collection.'), 'error') }
  }
  async function verify(h) {
    if (isAdmin) {
      const ok = await confirmDialog({
        title: `${tr('Verify (Admin Override)')} — ${h.code}`,
        message: tr('This verifies the collection without waiting for the assigned committee members ({done}/{need} approved).')
          .replace('{done}', (h.approvals || []).length).replace('{need}', approvalsNeeded(h)),
        confirmLabel: tr('Verify'),
      })
      if (!ok) return
    }
    try {
      const r = await HundiAPI.verify(h.id)
      toast(r.verification_status === 'Verified' ? tr('Collection verified.')
        : tr('Approval recorded ({done}/{need}). Waiting for another committee member.')
          .replace('{done}', (r.approvals || []).length).replace('{need}', approvalsNeeded(r)))
      load()
    }
    catch (ex) { toast(ex.detail || tr('Could not verify this collection.'), 'error') }
  }

  async function save(e) {
    e.preventDefault()
    if (saving) return
    const m = drawer

    // A future collection date is shown under its field; stop before sending.
    // The server keeps the same check as a backup.
    if (m.collected_on && m.collected_on > today()) {
      document.getElementById('hundi-collected-on')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (countingErr(m)) {
      document.getElementById('hundi-counting-on')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    // At least two committee members must be selected — they approve this count.
    // (A resubmitted count keeps its original members.)
    const chosen = committee.filter((c) => m.members.includes(c.id))
    if (!m.resubmit && chosen.length < REQUIRED_APPROVALS) {
      document.getElementById('hundi-committee')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      toast(tr('Please select at least 2 committee members who were present during counting.'), 'error')
      return
    }

    // Filter and validate items - value must be positive
    const items = m.lines
      .filter((l) => l.item_name.trim() && l.value !== '')
      .map((l) => ({
        hundi_item_id: (l.hundi_item_id && l.hundi_item_id !== 'custom') ? l.hundi_item_id : null,
        item_name: l.item_name.trim(),
        item_type: l.item_type || null,
        quantity: l.quantity !== '' ? Number(l.quantity) : null,
        unit: l.unit || null,
        value: Number(l.value || 0),
        remarks: l.remarks || null,
      }))

    if (items.length === 0) {
      toast(tr('Add at least one counted item line with a value.'), 'error')
      return
    }

    // Validate all items have positive values
    const invalidItems = items.filter((item) => item.value <= 0)
    if (invalidItems.length > 0) {
      toast(tr('All item values must be greater than zero.'), 'error')
      return
    }

    // Validate quantity is not negative
    const negativeQty = items.filter((item) => item.quantity !== null && item.quantity < 0)
    if (negativeQty.length > 0) {
      toast(tr('Quantity cannot be negative.'), 'error')
      return
    }

    setSaving(true)
    if (m.resubmit) {
      if ((m.note || '').trim().length < 5) {
        document.getElementById('hundi-reason')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        toast(tr('Enter the reason for the correction (at least 5 characters).'), 'error')
        setSaving(false)
        return
      }
      try {
        await HundiAPI.resubmit(m.resubmit.id, {
          items, counting_completed_on: m.counting_completed_on || null,
          denomination: m.denomination || null, note: m.note.trim(),
        })
        toast(tr('Corrected and sent back for committee approval.'))
        setDrawer(null); load()
      } catch (ex) {
        if (/^counting/i.test(ex?.detail || '')) setCountServerErr(ex.detail)
        toast(tr(getErrorMessage(ex, 'Could not resubmit this collection.')).replace(/^Value error, /, ''), 'error')
      } finally { setSaving(false) }
      return
    }
    try {
      // Verification/deposit fields are server-controlled (always born Pending) —
      // only the actual collection data is sent.
      await HundiAPI.create({
        collected_on: m.collected_on || null,
        counted_amount: lineTotal(m.lines),   // server recomputes from items; sent for the no-items fallback path
        counting_completed_on: m.counting_completed_on || null,
        denomination: m.denomination || null,
        officer: m.officer || null,
        items,
        committee_member_ids: chosen.map((c) => c.id),
        committee_members: chosen.map((c) => c.name),
      })
      setDrawer(null); load()
    } catch (ex) {
      if (/^counting/i.test(ex?.detail || '')) setCountServerErr(ex.detail)
      else if (/collection date/i.test(ex?.detail || '')) setDateServerErr(ex.detail)
      toast(ex.detail || tr('Could not save this collection.'), 'error')
    }
    finally { setSaving(false) }
  }
  const setM = (patch) => setDrawer((d) => ({ ...d, ...patch }))
  const countingOnErr = drawer ? (countingErr(drawer) || (countServerErr ? tr(countServerErr) : '')) : ''
  const collectedOnErr = drawer && drawer.collected_on && drawer.collected_on > today()
    ? tr('The collection date cannot be in the future.') : (dateServerErr ? tr(dateServerErr) : '')

  const ALL_EXPORT_COLS = [
    { key: 'code', label: tr('Hundi ID') },
    { key: 'collected_on', label: tr('Collection Date') },
    { key: 'cash_amount', label: tr('Cash (₹)'), type: 'money' },
    { key: 'valuables_amount', label: tr('Valuables (₹)'), type: 'money' },
    { key: 'verification_status', label: tr('Verification') },
    { key: 'deposit_status', label: tr('Cash Status') },
    { key: 'bank_name', label: tr('Bank') },
    { key: 'valuables_status', label: tr('Valuables Status') },
    { key: 'store_location', label: tr('Store Location') },
  ]
  // Hide money columns for non-finance roles
  const EXPORT_COLS = canSeeAmounts ? ALL_EXPORT_COLS : ALL_EXPORT_COLS.filter(c => c.type !== 'money')
  // Use allFilteredData when date filter applied (ALL records), otherwise use current page
  const dataForExport = (start || end) ? allFilteredData : displayRows
  const exportRows = canSeeAmounts ? dataForExport : dataForExport.map(r => ({ ...r, cash_amount: null, valuables_amount: null }))
  const exportTotal = canSeeAmounts ? {
    code: 'Total',
    cash_amount: dataForExport.reduce((s, h) => s + Number(h.cash_amount || 0), 0),
    valuables_amount: dataForExport.reduce((s, h) => s + Number(h.valuables_amount || 0), 0),
  } : null
  return (
    <div>
      <PageTitle title={tr("Hundi Management")} subtitle={tr("Manage physical hundi collections from the temple, counting, verification and bank deposits.")}
        actions={<span className="inline-flex items-center gap-2"><ExportButtons title={tr("Hundi Collection Register")} columns={EXPORT_COLS} rows={exportRows} total={exportTotal} />{canWrite ? <button onClick={openCreate} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Record New Collection</T></button> : <span className="px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-blue-50 text-blue-700"><T>View only</T></span>}</span>} />

      {user?.role !== 'Counter Staff' && (
        <KpiGrid>
          <StatTile icon={HandCoins} color="#059669" bg="bg-emerald-50" title={tr("This Month Total")}
            value={stats ? inr(stats.month_amount) : '—'} sub={stats ? `${num(stats.month_count)} ${tr("Collections")}` : ''} />
          <StatTile icon={IndianRupee} color="#2563eb" bg="bg-blue-50" title={tr("Cash (This Month)")}
            value={stats ? inr(stats.month_cash) : '—'} sub={stats?.pending_deposit_count ? `${num(stats.pending_deposit_count)} ${tr("Pending Deposit")}` : tr("For bank deposit")} />
          <StatTile icon={Gem} color="#7c3aed" bg="bg-violet-50" title={tr("Valuables (This Month)")}
            value={stats ? inr(stats.month_valuables) : '—'} sub={stats?.pending_custody_count ? `${num(stats.pending_custody_count)} ${tr("Pending Custody")}` : tr("Gold, Silver, Jewellery")} />
          <StatTile icon={Landmark} color="#d97706" bg="bg-amber-50" title={tr("Cash Deposited")}
            value={stats ? inr(stats.deposited_month_amount) : '—'} sub={stats ? `${num(stats.deposited_month_count)} ${tr("Bank Deposits")}` : ''} />
          <StatTile icon={Lock} color="#059669" bg="bg-emerald-50" title={tr("Valuables In Store")}
            value={stats ? `${num(stats.stored_month_count)}` : '—'} sub={tr("Collections in custody")} />
        </KpiGrid>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[10rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search by Reference No.</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search reference number…")} className="input !pl-9" /></div>
          </div>
          <div className="w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>From</T></label>
            <DateField value={start} onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd('') }} className="input" />
          </div>
          <div className="w-[8rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
            <DateField value={end} onChange={(e) => setEnd(e.target.value)} min={start} className="input" />
          </div>
          <div className="w-[10rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Verification Status</T></label>
            <Select value={verification} onChange={(e) => setVerification(e.target.value)} className="input"><option value="">{tr("All")}</option><option value="Verified">{tr("Verified")}</option><option value="Pending Verification">{tr("Pending Verification")}</option></Select>
          </div>
          <div className="w-[10rem]">
            <label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Deposit Status</T></label>
            <Select value={deposit} onChange={(e) => setDeposit(e.target.value)} className="input"><option value="">{tr("All")}</option><option value="Deposited">{tr("Deposited")}</option><option value="Pending Deposit">{tr("Pending Deposit")}</option></Select>
          </div>
          <button onClick={() => { setPage(1); setReloadTrigger(t => t + 1) }} className="btn-maroon !py-2.5 shrink-0"><Search size={14} />{' '}<T>Apply</T></button>
          <button onClick={() => { setFilters({ q: '', verification: '', deposit: '', start: '', end: '', page: 1 }); setReloadTrigger(t => t + 1) }} className="btn-outline !py-2.5 shrink-0"><RotateCcw size={14} />{' '}<T>Clear</T></button>
        </div>

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
              {sortColumns.map((col) => (
                <SortableFilterableTh
                  key={col.key}
                  colKey={col.key}
                  label={tr(col.label)}
                  type={col.type}
                  // Number columns: left-aligned like their cells, so the figures sit directly under the
                  // title (a right-aligned title is pushed left by its hidden sort icon).
                  className={`!px-3 ${col.type === 'money' || col.type === 'num' ? '!text-left' : ''}`}
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
              <th className="px-3 py-3 font-semibold whitespace-nowrap">{tr('Actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {displayRows.map((h) => (
                <tr key={h.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-3 font-mono text-[0.75rem] text-gray-500 whitespace-nowrap">{h.code}</td>
                  <td className="px-3 py-3 text-gray-600 text-[0.8125rem] whitespace-nowrap">{fmtDate(h.collected_on)}</td>
                  <td className="px-3 py-3 font-semibold text-blue-700">{canSeeAmounts ? (h.cash_amount > 0 ? inr(h.cash_amount) : <span className="text-gray-300">—</span>) : '—'}</td>
                  <td className="px-3 py-3 font-semibold text-violet-700">{canSeeAmounts ? (h.valuables_amount > 0 ? inr(h.valuables_amount) : <span className="text-gray-300">—</span>) : '—'}</td>
                  <td className="px-3 py-3">
                    <Pill tone={VER_TONE[h.verification_status] || 'gray'}>{tr(h.verification_status)}</Pill>
                    {h.verification_status === 'Pending Verification' && (
                      <div className="text-[0.6875rem] text-gray-500 mt-1 whitespace-nowrap">{(h.approvals || []).length}/{approvalsNeeded(h)} {tr('approved')}</div>
                    )}
                  </td>
                  <td className="px-3 py-3">{h.deposit_status && h.deposit_status !== 'N/A' ? <Pill tone={DEP_TONE[h.deposit_status] || 'gray'}>{tr(h.deposit_status)}</Pill> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-3">{h.valuables_status ? <Pill tone={VAL_TONE[h.valuables_status] || 'gray'}>{tr(h.valuables_status)}</Pill> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-3">
                    {/* Icon-only actions (tooltip names each one) so the column stays narrow — no horizontal scroll */}
                    <div className="flex items-center gap-1.5 flex-nowrap">
                      <IconAction onClick={() => setView(h)} label={tr("View details")} icon={Eye} tone="border-gray-200 text-gray-800 hover:text-maroon-700 hover:border-maroon-300" />
                      {canApprove(h) && (isAdmin
                        ? <IconAction onClick={() => verify(h)} label={tr("Verify (Override)")} icon={ShieldCheck} tone="border-emerald-200 text-emerald-700 hover:bg-emerald-50" />
                        : <IconAction onClick={() => verify(h)} label={tr("Approve")} icon={CheckCircle2} tone="border-emerald-200 text-emerald-700 hover:bg-emerald-50" />)}
                      {canReject(h) && (
                        <IconAction onClick={() => rejectCollection(h)} label={tr("Reject")} icon={XCircle} tone="border-red-200 text-red-600 hover:bg-red-50" />
                      )}
                      {isAdmin && h.verification_status === 'Rejected' && (
                        <IconAction onClick={() => openResubmit(h)} label={tr("Correct & Resubmit")} icon={RotateCcw} tone="border-amber-300 text-amber-700 hover:bg-amber-50" />
                      )}
                      {canWrite && h.verification_status === 'Verified' && h.deposit_status === 'Pending Deposit' && h.cash_amount > 0 && (
                        <IconAction onClick={() => depositCollection(h)} label={tr("Bank Deposit")} icon={Landmark} tone="border-blue-200 text-blue-700 hover:bg-blue-50" />
                      )}
                      {canWrite && h.verification_status === 'Verified' && h.valuables_status === 'Pending Custody' && h.valuables_amount > 0 && (
                        <IconAction onClick={() => storeValuables(h)} label={tr("Store Custody")} icon={Lock} tone="border-violet-200 text-violet-700 hover:bg-violet-50" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <TableStates colSpan={8} loading={loading} error={loadErr} onRetry={load} empty={tr("No collections recorded.")} />}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit={tr("collections")} />
        </div>
      </div>

      {/* ── Record New Hundi Collection drawer ── */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              {drawer.resubmit ? (
                <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Correct & Resubmit</T></h3>
                  <p className="text-[0.8125rem] text-gray-500 mt-0.5 font-mono">{drawer.resubmit.code}</p></div>
              ) : (
                <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Record New Hundi Collection</T></h3>
                  <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Record hundi collection, counting, verification and deposit details.</T></p></div>
              )}
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-6 flex-1">
              {drawer.resubmit && (
                <div className="bg-red-50/70 border border-red-100 rounded-lg px-3 py-2.5 text-[0.75rem] text-gray-700 flex items-start gap-2">
                  <Info size={15} className="text-red-500 shrink-0 mt-0.5" />
                  <span><b><T>Rejected</T>:</b> {(drawer.resubmit.notes || '').split(' | ').filter((x) => /^Rejected by/.test(x)).slice(-1)[0] || '—'}</span>
                </div>
              )}
              <DSection n="1" icon={FileText} title={tr("Collection Details")}>
                <div id="hundi-collected-on"><label className="label"><T>Collection Date *</T></label>
                  {/* max = today: future days are greyed out and the calendar can't move past this month */}
                  <DateField required max={today()} disabled={!!drawer.resubmit} className={`input ${collectedOnErr ? '!border-red-400 ring-1 ring-red-200' : ''}`} value={drawer.collected_on}
                    onChange={(e) => { setDateServerErr(''); setM({ collected_on: e.target.value }) }} />
                  {collectedOnErr && <div role="alert" className="text-[0.6875rem] text-red-600 mt-1">{collectedOnErr}</div>}
                </div>
                <div><label className="label"><T>Reference No.</T></label><input disabled className="input bg-gray-50" value={drawer.resubmit ? drawer.resubmit.code : tr("Auto-generated on save")} /><div className="text-[0.6875rem] text-gray-400 mt-1"><T>Auto generated</T></div></div>
              </DSection>

              <DSection n="2" icon={Calculator} title={tr("Counting Details")}>
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="label !mb-0 flex items-center gap-1.5"><Package size={13} />{' '}<T>Item-wise Counting Register *</T></label>
                    <button type="button" onClick={addLine} className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-maroon-700 hover:text-maroon-800"><Plus size={13} />{' '}<T>Add Item</T></button>
                  </div>
                  <div className="space-y-2.5">
                    {drawer.lines.map((l, i) => (
                      <div key={i} className="border border-gray-200 rounded-lg p-2.5 space-y-2 bg-gray-50/40">
                        <div className="flex items-center gap-2">
                          <Combobox
                            value={l.item_name}
                            onChange={(e) => pickItem(i, e.target.value)}
                            options={itemMaster.map((it) => it.name)}
                            placeholder={tr("Select or type item")}
                            className="!py-1.5 text-[0.78125rem] flex-1"
                          />
                          <button type="button" onClick={() => removeLine(i)} disabled={drawer.lines.length <= 1} title={tr("Remove line")}
                            className="w-8 h-8 shrink-0 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-red-600 hover:border-red-200 disabled:opacity-40"><Trash2 size={14} /></button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <NumberField min="0" max="999999" step="0.01" className="!py-1.5 text-[0.78125rem]" placeholder={tr("Qty")} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                          <input className="input !py-1.5 text-[0.78125rem]" placeholder={tr("Unit")} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
                          <NumberField required min="0.01" max="99999999" step="0.01" prefix="₹" className="!py-1.5 text-[0.78125rem]" placeholder={tr("Value *")} value={l.value} onChange={(e) => setLine(i, { value: e.target.value })} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between bg-maroon-50 border border-maroon-100 rounded-lg px-3 py-2.5 mt-3">
                    <span className="text-[0.78125rem] font-semibold text-maroon-800"><T>Total Amount Counted</T></span>
                    <span className="text-[0.9375rem] font-extrabold text-maroon-800 tabular-nums">{inr(lineTotal(drawer.lines))}</span>
                  </div>
                </div>
                <div id="hundi-counting-on"><label className="label"><T>Counting Completed On *</T></label>
                  {/* between the collection date and now: counting can't finish before the hundi was opened, or in the future */}
                  <DateTimeField required min={drawer.collected_on || undefined} max={today()} className={countingOnErr ? '!border-red-400 ring-1 ring-red-200' : ''}
                    value={drawer.counting_completed_on} onChange={(e) => { setCountServerErr(''); setM({ counting_completed_on: e.target.value }) }} />
                  {countingOnErr && <div role="alert" className="text-[0.6875rem] text-red-600 mt-1">{countingOnErr}</div>}
                </div>
                <div><label className="label"><T>Denomination *</T></label>
                  <Select className="input" value={drawer.denomination} onChange={(e) => setM({ denomination: e.target.value })}>{DENOMINATIONS.map((d) => <option key={d} value={d}>{tr(DENOM_LABEL[d] || d)}</option>)}</Select></div>
                <div className="col-span-2"><label className="label"><T>Officer</T></label>
                  <Combobox
                    disabled={!!drawer.resubmit}
                    value={drawer.officer || ''}
                    onChange={(e) => setM({ officer: e.target.value })}
                    options={committeeNames}
                    placeholder={tr("Select or type name")}
                    className="input"
                  /></div>
                {drawer.resubmit && (
                  <div id="hundi-reason" className="col-span-2"><label className="label"><T>Reason for Correction *</T></label>
                    <textarea required minLength={5} maxLength={500} rows={2} className="input" value={drawer.note || ''} onChange={(e) => setM({ note: e.target.value })} placeholder={tr('e.g. Recounted notes — short by ₹500')} />
                    <div className="text-[0.6875rem] text-gray-500 mt-1"><T>Shown to the committee members and kept in the audit trail.</T></div></div>
                )}
              </DSection>

              <div>
                <div id="hundi-committee" className="flex items-center gap-2 mb-3 text-maroon-700">
                  <span className="w-5 h-5 rounded-full bg-maroon-700 text-cream text-[0.6875rem] grid place-items-center font-bold">3</span>
                  <span className="font-semibold text-[0.84375rem]"><T>Committee Members (Present During Counting)</T> *</span>
                </div>
                {drawer.resubmit ? (
                  <div className="border border-gray-200 rounded-lg px-3 py-2.5 text-[0.8125rem] text-gray-700 bg-gray-50">
                    {(drawer.resubmit.committee_members || '').split(',').map((n) => personName({ name: n.trim() }, lang)).join(', ') || '—'}
                    <div className="text-[0.6875rem] text-gray-500 mt-1"><T>The same members approve the corrected count again (earlier approvals are cleared).</T></div>
                  </div>
                ) : (<>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
                  {committee.length === 0 && <div className="px-3 py-2.5 text-[0.75rem] text-gray-400"><T>No active committee members found.</T></div>}
                  {committee.map((c) => (
                    <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 text-[0.8125rem] text-gray-700 hover:bg-gray-50 cursor-pointer">
                      <Checkbox checked={drawer.members.includes(c.id)} onChange={() => toggleMember(c.id)} />
                      <span className="flex-1">{personName(c, lang)}</span>
                      {c.designation && <span className="text-[0.6875rem] text-gray-400">{tr(c.designation)}</span>}
                    </label>
                  ))}
                </div>
                <div className="bg-blue-50/70 border border-blue-100 rounded-lg px-3 py-2.5 text-[0.75rem] text-gray-600 flex items-start gap-2 mt-3"><Info size={15} className="text-blue-500 shrink-0 mt-0.5" />{' '}<T>Select at least 2 committee members who were present during counting. Any 2 of them must approve this count.</T>{' '}{drawer.members.length} {tr('selected.')}</div>
                </>)}
              </div>

              {/* Verification & deposit are deliberately NOT set here: the server records
                  every new collection as Pending Verification; a different committee member
                  verifies it from the list, and the bank deposit is recorded after
                  verification via the Deposit action. */}
              {!drawer.resubmit && (
              <div className="bg-amber-50/70 border border-amber-100 rounded-lg px-3 py-2.5 text-[0.75rem] text-gray-600 flex items-start gap-2">
                <Info size={15} className="text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <T>New collections are recorded as</T>{' '}<b>&nbsp;{tr('Pending Verification')}&nbsp;</b>.{' '}
                  <T>Two of the selected committee members approve it from the list; the bank deposit and store custody are recorded after it is verified.</T>
                </span>
              </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button disabled={saving} className="btn-maroon flex-1 justify-center disabled:opacity-60">{saving ? tr('Saving…') : <>{drawer.resubmit ? <T>Resubmit for Approval</T> : <T>Save Collection</T>}{' '}<ChevronDown size={14} /></>}</button>
            </div>
          </form>
        </div>
      )}

      {/* ── View drawer (read-only) ── */}
      {tagSource && <TagItemsDrawer source={tagSource} onClose={() => setTagSource(null)} />}
      {view && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setView(null)} />
          <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Hundi Collection</T></h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5 font-mono">{view.code}</p></div>
              <button onClick={() => setView(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-6 flex-1">
              <DSection n="1" icon={FileText} title={tr("Collection Details")}>
                <VField label={tr("Collection Date")} value={fmtDate(view.collected_on)} />
                <VField label={tr("Counting Completed")} value={fmtLocalStamp(view.counting_completed_on)} />
                <VField label={tr("Total Amount Counted")} value={canSeeAmounts ? inr(view.counted_amount) : '—'} />
                <VField label={tr("Committee Members")} value={`${memberCount(view.committee_members)} ${tr("Members")}`} />
                <VField label={tr("Members")} value={view.committee_members ? view.committee_members.split(',').map((n) => personName({ name: n.trim() }, lang)).join(', ') : '—'} wide />
              </DSection>
              {Array.isArray(view.items) && view.items.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-maroon-700">
                    <span className="w-5 h-5 rounded-full bg-maroon-700 text-cream text-[0.6875rem] grid place-items-center font-bold"><Package size={12} /></span>
                    <span className="font-semibold text-[0.84375rem]"><T>Counted Items</T></span>
                  </div>
                  <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                    {view.items.map((it, i) => (
                      <div key={it.id ?? i} className="flex items-start justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="text-[0.8125rem] font-medium text-gray-800 truncate">{tr(it.item_name)}</div>
                          <div className="text-[0.6875rem] text-gray-400">
                            {it.item_type ? tr(it.item_type) : '—'}
                            {it.quantity != null && ` · ${num(it.quantity)}${it.unit ? ` ${tr(it.unit)}` : ''}`}
                          </div>
                        </div>
                        <div className="text-[0.8125rem] font-semibold text-gray-800 tabular-nums shrink-0">{canSeeAmounts ? inr(it.value) : '—'}</div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50/70">
                      <span className="text-[0.75rem] font-semibold text-gray-500"><T>Total</T></span>
                      <span className="text-[0.8125rem] font-extrabold text-maroon-800 tabular-nums">{canSeeAmounts ? inr(view.counted_amount) : '—'}</span>
                    </div>
                  </div>
                </div>
              )}
              <DSection n="2" icon={ShieldCheck} title={tr("Verification")}>
                <VField label={tr("Status")} value={<Pill tone={VER_TONE[view.verification_status]}>{tr(view.verification_status)}</Pill>} />
                <VField label={tr("Approvals")} value={`${(view.approvals || []).length}/${approvalsNeeded(view)}`} />
                {(view.approvals || []).map((a, i) => (
                  <VField key={a.member_id ?? i} label={`${tr('Approved By')} ${i + 1}`} value={`${personName({ name: a.name }, lang)} · ${fmtStamp(a.at)}`} wide />
                ))}
                {/* Reject / correction trail, so the members re-approving see why the count changed */}
                {(view.notes || '').split(' | ').some((x) => /^(Rejected|Corrected) by /.test(x)) && (
                  <VField label={tr("History")} wide value={
                    <ul className="space-y-1">
                      {(view.notes || '').split(' | ').filter((x) => /^(Rejected|Corrected) by /.test(x)).map((x, i) => (
                        <li key={i} className={/^Rejected/.test(x) ? 'text-red-700' : 'text-amber-800'}>{x}</li>
                      ))}
                    </ul>} />
                )}
                <VField label={tr("Verified By")} value={view.verified_by ? personName({ name: view.verified_by }, lang) : '—'} />
                <VField label={tr("Verified On")} value={view.verified_on ? fmtStamp(view.verified_on) : '—'} wide />
              </DSection>
              {/* Cash → Bank Deposit Section */}
              {view.cash_amount > 0 && (
                <DSection n="3" icon={Landmark} title={tr("Cash → Bank Deposit")}>
                  <VField label={tr("Cash Amount")} value={canSeeAmounts ? inr(view.cash_amount) : '—'} />
                  <VField label={tr("Status")} value={<Pill tone={DEP_TONE[view.deposit_status]}>{tr(view.deposit_status)}</Pill>} />
                  <VField label={tr("Deposit Date")} value={view.deposited_on ? fmtDate(view.deposited_on) : '—'} />
                  <VField label={tr("Bank Name")} value={view.bank_name ? tr(view.bank_name) : '—'} />
                  <VField label={tr("Challan / Reference")} value={view.bank_ref || '—'} wide />
                </DSection>
              )}
              {/* Valuables → Store Custody Section */}
              {view.valuables_amount > 0 && (
                <DSection n={view.cash_amount > 0 ? "4" : "3"} icon={Lock} title={tr("Valuables → Store Custody")}>
                  <VField label={tr("Valuables Amount")} value={canSeeAmounts ? inr(view.valuables_amount) : '—'} />
                  <VField label={tr("Status")} value={view.valuables_status ? <Pill tone={VAL_TONE[view.valuables_status]}>{tr(view.valuables_status)}</Pill> : '—'} />
                  <VField label={tr("Custody Date")} value={view.valuables_stored_on ? fmtDate(view.valuables_stored_on) : '—'} />
                  <VField label={tr("Store Location")} value={view.store_location ? tr(view.store_location) : '—'} />
                  <VField label={tr("Custodian")} value={view.valuables_custodian ? personName({ name: view.valuables_custodian }, lang) : '—'} wide />
                </DSection>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={() => setView(null)} className="btn-maroon w-full justify-center"><T>Close</T></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Square icon button for a row action; the label shows as a tooltip and is read by screen readers.
function IconAction({ onClick, label, icon: Icon, tone }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className={`w-8 h-8 shrink-0 grid place-items-center rounded-lg border ${tone}`}><Icon size={15} /></button>
  )
}

function DSection({ n, icon: Icon, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-maroon-700">
        <span className="w-5 h-5 rounded-full bg-maroon-700 text-cream text-[0.6875rem] grid place-items-center font-bold">{n}</span>
        <span className="font-semibold text-[0.84375rem]">{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">{children}</div>
    </div>
  )
}
function VField({ label, value, wide }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[0.6875rem] text-gray-400 mb-0.5">{label}</div>
      <div className="text-[0.8125rem] text-gray-800 font-medium break-words">{value ?? '—'}</div>
    </div>
  )
}
