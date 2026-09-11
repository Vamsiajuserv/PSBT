import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { ArrowUp, ArrowDown, ChevronsUpDown, X, Info, Filter, Check } from 'lucide-react'
import { T, tr } from '../../i18n/LanguageContext.jsx'

/**
 * Reusable multi-column sorting hook for tables
 *
 * Features:
 * - Three-state sorting: desc → asc → unsorted (click cycle)
 * - Multi-column sorting with Shift+Click
 * - Smart type-aware parsing (text, money, num, date)
 *
 * @param {Array} rows - Array of row data
 * @param {Array} columns - Array of {key, type, label} where type is 'text'|'money'|'num'|'date'
 * @param {Array} initialSorts - Optional initial sort state [{key, direction: 'asc'|'desc'}]
 * @returns {Object} { sortedRows, sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection }
 */
export function useSortableTable(rows, columns = [], initialSorts = []) {
  const [sorts, setSorts] = useState(initialSorts) // [{key, direction: 'asc'|'desc'}]

  const handleColumnClick = useCallback((colKey, e) => {
    setSorts((prev) => {
      const idx = prev.findIndex((s) => s.key === colKey)

      if (e?.shiftKey) {
        // Shift+Click: add or toggle secondary sort (two-state for multi-sort)
        if (idx >= 0) {
          // Toggle between asc and desc for existing sort
          return prev.map((s, i) => i === idx ? { ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' } : s)
        }
        // Add new column to multi-sort
        return [...prev, { key: colKey, direction: 'desc' }]
      }

      // Regular click: three-state cycle (desc → asc → unsorted)
      if (idx === 0 && prev.length === 1) {
        // Column is already the only sorted column
        if (prev[0].direction === 'desc') {
          // desc → asc
          return [{ key: colKey, direction: 'asc' }]
        } else {
          // asc → unsorted (clear sort)
          return []
        }
      }

      // New column or replacing multi-sort: start with desc
      return [{ key: colKey, direction: 'desc' }]
    })
  }, [])

  const removeSort = useCallback((colKey) => setSorts((prev) => prev.filter((s) => s.key !== colKey)), [])
  const clearSorts = useCallback(() => setSorts([]), [])

  const getSortIndex = useCallback((colKey) => sorts.findIndex((s) => s.key === colKey), [sorts])
  const getSortDirection = useCallback((colKey) => sorts.find((s) => s.key === colKey)?.direction, [sorts])

  // Smart parsing based on column type
  const parseValue = useCallback((val, colType) => {
    if (val == null || val === '' || val === '—' || val === '-') return null

    if (colType === 'money' || colType === 'num') {
      const n = typeof val === 'string' ? parseFloat(val.replace(/[₹,\s]/g, '')) : Number(val)
      return isNaN(n) ? null : n
    }

    if (colType === 'date' || colType === 'text') {
      // Try to parse as date (formats: "01 Sept 2026", "2026-09-01", etc.)
      const str = String(val)
      const dateMatch = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
      if (dateMatch) {
        const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 }
        const m = months[dateMatch[2].toLowerCase().slice(0, 3)]
        if (m !== undefined) return new Date(dateMatch[3], m, dateMatch[1]).getTime()
      }
      // Try ISO date format
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const d = Date.parse(str)
        if (!isNaN(d)) return d
      }
      return str.toLowerCase()
    }

    return String(val).toLowerCase()
  }, [])

  const sortedRows = useMemo(() => {
    if (!rows || rows.length === 0 || sorts.length === 0) return rows || []

    const colMap = {}
    columns.forEach((c) => {
      if (typeof c === 'object' && c.key) {
        colMap[c.key] = c.type || 'text'
      } else if (typeof c === 'string') {
        colMap[c] = 'text'
      }
    })

    return [...rows].sort((a, b) => {
      for (const { key, direction } of sorts) {
        const colType = colMap[key] || 'text'
        const aVal = parseValue(a[key], colType)
        const bVal = parseValue(b[key], colType)

        if (aVal === null && bVal === null) continue
        if (aVal === null) return direction === 'asc' ? 1 : -1
        if (bVal === null) return direction === 'asc' ? -1 : 1

        let cmp = 0
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          cmp = aVal - bVal
        } else {
          cmp = String(aVal).localeCompare(String(bVal))
        }
        if (cmp !== 0) return direction === 'asc' ? cmp : -cmp
      }
      return 0
    })
  }, [rows, columns, sorts, parseValue])

  return {
    sortedRows,
    sorts,
    handleColumnClick,
    removeSort,
    clearSorts,
    getSortIndex,
    getSortDirection,
  }
}

/**
 * Sort indicator for table headers
 * Shows: ▲ for asc, ▼ for desc, with optional priority number for multi-sort
 */
export function SortIndicator({ index, direction, multiSort }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-maroon-600 ml-1" aria-hidden="true">
      {multiSort && index > 0 && <span className="text-[0.5625rem] font-bold">{index + 1}</span>}
      {direction === 'desc' ? <ArrowDown size={13} strokeWidth={2.5} /> : <ArrowUp size={13} strokeWidth={2.5} />}
    </span>
  )
}

/**
 * Unsorted indicator - shows on hover to indicate column is sortable
 */
export function UnsortedIndicator() {
  return (
    <span className="inline-flex items-center text-gray-400 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
      <ChevronsUpDown size={14} strokeWidth={2} />
    </span>
  )
}

/**
 * Sortable table header cell with three-state sorting and hover indicators
 */
export function SortableTh({ colKey, label, type, onSort, sortIndex, sortDirection, multiSort, className = '' }) {
  const isSorted = sortIndex >= 0
  const isNumeric = type === 'money' || type === 'num'

  // Keyboard handler for accessibility
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSort(colKey, e)
    }
  }

  return (
    <th
      onClick={(e) => onSort(colKey, e)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="columnheader"
      aria-sort={isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`group px-4 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gold-400 ${isNumeric ? 'text-right' : ''} ${isSorted ? 'text-maroon-700 bg-maroon-50/50' : ''} ${className}`}
      title={tr("Click to sort (↓→↑→clear). Shift+Click for multi-column sort.")}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {isSorted
          ? <SortIndicator index={sortIndex} direction={sortDirection} multiSort={multiSort} />
          : <UnsortedIndicator />
        }
      </span>
    </th>
  )
}

/**
 * Sort panel showing active sorts with chips and multi-sort hint
 */
export function SortPanel({ sorts, columns, onToggle, onRemove, onClear }) {
  if (!sorts || sorts.length === 0) return null

  const getLabel = (key) => {
    const col = columns?.find((c) => (typeof c === 'object' ? c.key : c) === key)
    return typeof col === 'object' ? (col.label || col.key) : (col || key)
  }

  return (
    <div className="px-4 py-2.5 bg-maroon-50/50 border-b border-maroon-100 flex flex-wrap items-center gap-2">
      <span className="text-[0.75rem] text-gray-500 font-medium"><T>Sorted by</T>:</span>
      {sorts.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-maroon-200 text-[0.75rem] font-medium text-maroon-700 shadow-sm">
          {sorts.length > 1 && <span className="w-4 h-4 rounded-full bg-maroon-100 text-[0.625rem] font-bold grid place-items-center">{i + 1}</span>}
          {tr(getLabel(s.key))}
          <button onClick={() => onToggle(s.key, { shiftKey: true })} className="hover:text-maroon-900 p-0.5 rounded hover:bg-maroon-100 transition-colors" title={tr("Toggle direction")}>
            {s.direction === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
          </button>
          <button onClick={() => onRemove(s.key)} className="hover:text-red-600 p-0.5 rounded hover:bg-red-50 transition-colors ml-0.5" title={tr("Remove sort")}><X size={12} /></button>
        </span>
      ))}
      <button onClick={onClear} className="text-[0.75rem] text-gray-500 hover:text-red-600 ml-2 transition-colors"><T>Clear All</T></button>
      <span className="ml-auto text-[0.6875rem] text-gray-400 hidden sm:flex items-center gap-1">
        <Info size={12} />
        <T>Shift+Click column headers for multi-sort</T>
      </span>
    </div>
  )
}

/**
 * Complete sortable table header row
 */
export function SortableTableHeader({ columns, sorts, onSort, getSortIndex, getSortDirection }) {
  const multiSort = sorts.length > 1

  return (
    <tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
      {columns.map((col) => {
        const key = typeof col === 'object' ? col.key : col
        const label = typeof col === 'object' ? (col.label || col.key) : col
        const type = typeof col === 'object' ? col.type : 'text'
        const sortIndex = getSortIndex(key)
        const sortDirection = getSortDirection(key)

        return (
          <SortableTh
            key={key}
            colKey={key}
            label={tr(label)}
            type={type}
            onSort={onSort}
            sortIndex={sortIndex}
            sortDirection={sortDirection}
            multiSort={multiSort}
          />
        )
      })}
    </tr>
  )
}


// ═══════════════════════════════════════════════════════════════════════════════
// FILTERING SUPPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for combined sorting and filtering
 *
 * Column definition extended for filtering:
 * {
 *   key: 'status',
 *   label: 'Status',
 *   type: 'text',
 *   filterable: true,
 *   filterOptions: ['Confirmed', 'Pending', 'Completed', 'Cancelled']
 * }
 */
export function useFilterableSortableTable(rows, columns = [], initialSorts = [], initialFilters = {}) {
  const [sorts, setSorts] = useState(initialSorts)
  const [filters, setFilters] = useState(initialFilters) // { columnKey: [selectedValues] }

  // Sorting handlers (same as useSortableTable)
  const handleColumnClick = useCallback((colKey, e) => {
    setSorts((prev) => {
      const idx = prev.findIndex((s) => s.key === colKey)
      if (e?.shiftKey) {
        if (idx >= 0) {
          return prev.map((s, i) => i === idx ? { ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' } : s)
        }
        return [...prev, { key: colKey, direction: 'desc' }]
      }
      if (idx === 0 && prev.length === 1) {
        if (prev[0].direction === 'desc') {
          return [{ key: colKey, direction: 'asc' }]
        } else {
          return []
        }
      }
      return [{ key: colKey, direction: 'desc' }]
    })
  }, [])

  const removeSort = useCallback((colKey) => setSorts((prev) => prev.filter((s) => s.key !== colKey)), [])
  const clearSorts = useCallback(() => setSorts([]), [])
  const getSortIndex = useCallback((colKey) => sorts.findIndex((s) => s.key === colKey), [sorts])
  const getSortDirection = useCallback((colKey) => sorts.find((s) => s.key === colKey)?.direction, [sorts])

  // Filter handlers
  const setFilter = useCallback((colKey, values) => {
    setFilters((prev) => {
      if (!values || values.length === 0) {
        const { [colKey]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [colKey]: values }
    })
  }, [])

  const toggleFilterValue = useCallback((colKey, value) => {
    setFilters((prev) => {
      const current = prev[colKey] || []
      const newValues = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      if (newValues.length === 0) {
        const { [colKey]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [colKey]: newValues }
    })
  }, [])

  const clearFilter = useCallback((colKey) => {
    setFilters((prev) => {
      const { [colKey]: _, ...rest } = prev
      return rest
    })
  }, [])

  const clearAllFilters = useCallback(() => setFilters({}), [])

  const getFilterValues = useCallback((colKey) => filters[colKey] || [], [filters])
  const hasFilter = useCallback((colKey) => filters[colKey] && filters[colKey].length > 0, [filters])

  // Smart parsing for sorting (same as before)
  const parseValue = useCallback((val, colType) => {
    if (val == null || val === '' || val === '—' || val === '-') return null
    if (colType === 'money' || colType === 'num') {
      const n = typeof val === 'string' ? parseFloat(val.replace(/[₹,\s]/g, '')) : Number(val)
      return isNaN(n) ? null : n
    }
    if (colType === 'date' || colType === 'text') {
      const str = String(val)
      const dateMatch = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
      if (dateMatch) {
        const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 }
        const m = months[dateMatch[2].toLowerCase().slice(0, 3)]
        if (m !== undefined) return new Date(dateMatch[3], m, dateMatch[1]).getTime()
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const d = Date.parse(str)
        if (!isNaN(d)) return d
      }
      return str.toLowerCase()
    }
    return String(val).toLowerCase()
  }, [])

  // Apply filters then sorting
  const filteredSortedRows = useMemo(() => {
    if (!rows || rows.length === 0) return rows || []

    // Build column map
    const colMap = {}
    columns.forEach((c) => {
      if (typeof c === 'object' && c.key) {
        colMap[c.key] = c
      }
    })

    // Filter
    let result = rows
    const filterKeys = Object.keys(filters)
    if (filterKeys.length > 0) {
      result = rows.filter((row) => {
        return filterKeys.every((colKey) => {
          const filterVals = filters[colKey]
          if (!filterVals || filterVals.length === 0) return true
          const rowVal = row[colKey]
          // Handle null/undefined values
          if (rowVal == null || rowVal === '') {
            return filterVals.includes('(Empty)')
          }
          return filterVals.includes(String(rowVal))
        })
      })
    }

    // Sort
    if (sorts.length === 0) return result

    return [...result].sort((a, b) => {
      for (const { key, direction } of sorts) {
        const col = colMap[key]
        const colType = col?.type || 'text'
        const aVal = parseValue(a[key], colType)
        const bVal = parseValue(b[key], colType)

        if (aVal === null && bVal === null) continue
        if (aVal === null) return direction === 'asc' ? 1 : -1
        if (bVal === null) return direction === 'asc' ? -1 : 1

        let cmp = 0
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          cmp = aVal - bVal
        } else {
          cmp = String(aVal).localeCompare(String(bVal))
        }
        if (cmp !== 0) return direction === 'asc' ? cmp : -cmp
      }
      return 0
    })
  }, [rows, columns, filters, sorts, parseValue])

  return {
    // Sorted & filtered data
    filteredSortedRows,
    // Sort state & handlers
    sorts,
    handleColumnClick,
    removeSort,
    clearSorts,
    getSortIndex,
    getSortDirection,
    // Filter state & handlers
    filters,
    setFilter,
    toggleFilterValue,
    clearFilter,
    clearAllFilters,
    getFilterValues,
    hasFilter,
  }
}

/**
 * Filter dropdown menu for a column
 */
export function ColumnFilterDropdown({
  colKey,
  label,
  options = [],
  selectedValues = [],
  onToggle,
  onClear,
  onClose,
  sortDirection,
  onSort,
  position = { top: 0, left: 0 },
}) {
  const dropdownRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 mt-1 w-56 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden"
      style={{ top: position.top, left: position.left }}
    >
      {/* Sort options */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="text-[0.625rem] uppercase tracking-wide text-gray-400 mb-1.5"><T>Sort</T></div>
        <div className="flex gap-1">
          <button
            onClick={() => { onSort(colKey, {}); onClose() }}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[0.75rem] font-medium transition-colors ${sortDirection === 'desc' ? 'bg-maroon-100 text-maroon-700' : 'hover:bg-gray-100 text-gray-600'}`}
          >
            <ArrowDown size={12} /> <T>Desc</T>
          </button>
          <button
            onClick={() => { onSort(colKey, { shiftKey: false }); if (sortDirection === 'desc') onSort(colKey, {}); onClose() }}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[0.75rem] font-medium transition-colors ${sortDirection === 'asc' ? 'bg-maroon-100 text-maroon-700' : 'hover:bg-gray-100 text-gray-600'}`}
          >
            <ArrowUp size={12} /> <T>Asc</T>
          </button>
        </div>
      </div>

      {/* Filter options */}
      {options.length > 0 && (
        <div className="px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[0.625rem] uppercase tracking-wide text-gray-400"><T>Filter</T></div>
            {selectedValues.length > 0 && (
              <button onClick={onClear} className="text-[0.625rem] text-maroon-600 hover:text-maroon-700">
                <T>Clear</T>
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {options.map((opt) => {
              const val = typeof opt === 'object' ? opt.value : opt
              const displayLabel = typeof opt === 'object' ? opt.label : opt
              const isSelected = selectedValues.includes(val)
              return (
                <label
                  key={val}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-maroon-50 text-maroon-700' : 'hover:bg-gray-50 text-gray-700'}`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-maroon-600 border-maroon-600' : 'border-gray-300'}`}>
                    {isSelected && <Check size={12} className="text-white" />}
                  </span>
                  <span className="text-[0.8125rem]">{tr(displayLabel)}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* Apply button */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
        <button
          onClick={onClose}
          className="w-full py-1.5 rounded-lg bg-maroon-600 text-white text-[0.75rem] font-medium hover:bg-maroon-700 transition-colors"
        >
          <T>Done</T>
        </button>
      </div>
    </div>
  )
}

/**
 * Enhanced sortable/filterable table header cell
 */
export function SortableFilterableTh({
  colKey,
  label,
  type,
  filterable = false,
  filterOptions = [],
  onSort,
  sortIndex,
  sortDirection,
  multiSort,
  filterValues = [],
  onToggleFilter,
  onClearFilter,
  className = '',
}) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const thRef = useRef(null)

  const isSorted = sortIndex >= 0
  const isFiltered = filterValues.length > 0
  const isNumeric = type === 'money' || type === 'num'

  const handleClick = (e) => {
    if (filterable && filterOptions.length > 0) {
      // Show dropdown for filterable columns
      const rect = thRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.height, left: 0 })
      setShowDropdown(true)
    } else {
      // Regular sort for non-filterable columns
      onSort(colKey, e)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick(e)
    }
  }

  return (
    <th
      ref={thRef}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="columnheader"
      aria-sort={isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`group relative px-4 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gold-400 ${isNumeric ? 'text-right' : ''} ${isSorted || isFiltered ? 'text-maroon-700 bg-maroon-50/50' : ''} ${className}`}
      title={filterable ? tr("Click to sort and filter") : tr("Click to sort (↓→↑→clear). Shift+Click for multi-column sort.")}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {/* Filter indicator */}
        {isFiltered && (
          <span className="inline-flex items-center text-maroon-600 ml-1" aria-label={tr("Filtered")}>
            <Filter size={12} strokeWidth={2.5} />
            <span className="text-[0.5625rem] font-bold ml-0.5">{filterValues.length}</span>
          </span>
        )}
        {/* Sort indicator */}
        {isSorted
          ? <SortIndicator index={sortIndex} direction={sortDirection} multiSort={multiSort} />
          : !isFiltered && <UnsortedIndicator />
        }
        {/* Dropdown chevron for filterable */}
        {filterable && filterOptions.length > 0 && !isSorted && !isFiltered && (
          <span className="text-gray-400 ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronsUpDown size={12} />
          </span>
        )}
      </span>

      {/* Dropdown */}
      {showDropdown && (
        <ColumnFilterDropdown
          colKey={colKey}
          label={label}
          options={filterOptions}
          selectedValues={filterValues}
          onToggle={(val) => onToggleFilter(colKey, val)}
          onClear={() => onClearFilter(colKey)}
          onClose={() => setShowDropdown(false)}
          sortDirection={sortDirection}
          onSort={onSort}
          position={dropdownPos}
        />
      )}
    </th>
  )
}

/**
 * Filter panel showing active filters (similar to SortPanel)
 */
export function FilterPanel({ filters, columns, onClearFilter, onClearAll }) {
  const filterKeys = Object.keys(filters).filter((k) => filters[k]?.length > 0)
  if (filterKeys.length === 0) return null

  const getLabel = (key) => {
    const col = columns?.find((c) => (typeof c === 'object' ? c.key : c) === key)
    return typeof col === 'object' ? (col.label || col.key) : (col || key)
  }

  return (
    <div className="px-4 py-2.5 bg-blue-50/50 border-b border-blue-100 flex flex-wrap items-center gap-2">
      <span className="text-[0.75rem] text-gray-500 font-medium flex items-center gap-1">
        <Filter size={12} />
        <T>Filtered by</T>:
      </span>
      {filterKeys.map((key) => (
        <span key={key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-blue-200 text-[0.75rem] font-medium text-blue-700 shadow-sm">
          {tr(getLabel(key))}: {filters[key].length} {filters[key].length === 1 ? tr('value') : tr('values')}
          <button onClick={() => onClearFilter(key)} className="hover:text-red-600 p-0.5 rounded hover:bg-red-50 transition-colors ml-0.5" title={tr("Remove filter")}>
            <X size={12} />
          </button>
        </span>
      ))}
      <button onClick={onClearAll} className="text-[0.75rem] text-gray-500 hover:text-red-600 ml-2 transition-colors">
        <T>Clear All Filters</T>
      </button>
    </div>
  )
}

/**
 * Combined Sort & Filter panel
 */
export function SortFilterPanel({
  sorts,
  filters,
  columns,
  onToggleSort,
  onRemoveSort,
  onClearSorts,
  onClearFilter,
  onClearAllFilters,
}) {
  const hasSorts = sorts && sorts.length > 0
  const filterKeys = Object.keys(filters || {}).filter((k) => filters[k]?.length > 0)
  const hasFilters = filterKeys.length > 0

  if (!hasSorts && !hasFilters) return null

  const getLabel = (key) => {
    const col = columns?.find((c) => (typeof c === 'object' ? c.key : c) === key)
    return typeof col === 'object' ? (col.label || col.key) : (col || key)
  }

  return (
    <div className="px-4 py-2.5 bg-gradient-to-r from-maroon-50/50 to-blue-50/50 border-b border-gray-200 flex flex-wrap items-center gap-2">
      {/* Sorts */}
      {hasSorts && (
        <>
          <span className="text-[0.75rem] text-gray-500 font-medium"><T>Sorted</T>:</span>
          {sorts.map((s, i) => (
            <span key={s.key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-maroon-200 text-[0.75rem] font-medium text-maroon-700 shadow-sm">
              {sorts.length > 1 && <span className="w-4 h-4 rounded-full bg-maroon-100 text-[0.625rem] font-bold grid place-items-center">{i + 1}</span>}
              {tr(getLabel(s.key))}
              <button onClick={() => onToggleSort(s.key, { shiftKey: true })} className="hover:text-maroon-900 p-0.5 rounded hover:bg-maroon-100 transition-colors" title={tr("Toggle direction")}>
                {s.direction === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
              </button>
              <button onClick={() => onRemoveSort(s.key)} className="hover:text-red-600 p-0.5 rounded hover:bg-red-50 transition-colors ml-0.5" title={tr("Remove sort")}>
                <X size={12} />
              </button>
            </span>
          ))}
        </>
      )}

      {/* Divider */}
      {hasSorts && hasFilters && <span className="text-gray-300 mx-1">|</span>}

      {/* Filters */}
      {hasFilters && (
        <>
          <span className="text-[0.75rem] text-gray-500 font-medium flex items-center gap-1">
            <Filter size={11} /> <T>Filtered</T>:
          </span>
          {filterKeys.map((key) => (
            <span key={key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-blue-200 text-[0.75rem] font-medium text-blue-700 shadow-sm">
              {tr(getLabel(key))}: {filters[key].map((v) => tr(v)).join(', ')}
              <button onClick={() => onClearFilter(key)} className="hover:text-red-600 p-0.5 rounded hover:bg-red-50 transition-colors ml-0.5" title={tr("Remove filter")}>
                <X size={12} />
              </button>
            </span>
          ))}
        </>
      )}

      {/* Clear all */}
      <button
        onClick={() => { onClearSorts(); onClearAllFilters(); }}
        className="text-[0.75rem] text-gray-500 hover:text-red-600 ml-auto transition-colors"
      >
        <T>Clear All</T>
      </button>

      {/* Hint */}
      <span className="text-[0.6875rem] text-gray-400 hidden lg:flex items-center gap-1 ml-2">
        <Info size={11} />
        <T>Shift+Click headers for multi-sort</T>
      </span>
    </div>
  )
}
