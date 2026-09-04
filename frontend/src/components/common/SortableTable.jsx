import React, { useMemo, useState, useCallback } from 'react'
import { ArrowUp, ArrowDown, X } from 'lucide-react'
import { T, tr } from '../../i18n/LanguageContext.jsx'

/**
 * Reusable multi-column sorting hook for tables
 * @param {Array} rows - Array of row data
 * @param {Array} columns - Array of {key, type} where type is 'text'|'money'|'num'|'date'
 * @param {Array} initialSorts - Optional initial sort state [{key, direction: 'asc'|'desc'}]
 * @returns {Object} { sortedRows, sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection }
 */
export function useSortableTable(rows, columns = [], initialSorts = []) {
  const [sorts, setSorts] = useState(initialSorts) // [{key, direction: 'asc'|'desc'}]

  const handleColumnClick = useCallback((colKey, e) => {
    setSorts((prev) => {
      const idx = prev.findIndex((s) => s.key === colKey)
      if (e?.shiftKey) {
        // Shift+Click: add or toggle secondary sort
        if (idx >= 0) {
          return prev.map((s, i) => i === idx ? { ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' } : s)
        }
        return [...prev, { key: colKey, direction: 'desc' }]
      }
      // Regular click: single column sort or toggle
      if (idx === 0 && prev.length === 1) {
        return [{ key: colKey, direction: prev[0].direction === 'asc' ? 'desc' : 'asc' }]
      }
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
 */
export function SortIndicator({ index, direction, multiSort }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-blue-600 ml-1">
      {multiSort && <span className="text-[0.5625rem] font-bold">{index + 1}</span>}
      {direction === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
    </span>
  )
}

/**
 * Sortable table header cell
 */
export function SortableTh({ colKey, label, type, onSort, sortIndex, sortDirection, className = '' }) {
  const isSorted = sortIndex >= 0
  const isNumeric = type === 'money' || type === 'num'

  return (
    <th
      onClick={(e) => onSort(colKey, e)}
      className={`px-4 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isNumeric ? 'text-right' : ''} ${isSorted ? 'text-blue-700 bg-blue-50/50' : ''} ${className}`}
      title={tr("Click to sort, Shift+Click to add secondary sort")}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isSorted && <SortIndicator index={sortIndex} direction={sortDirection} multiSort={sortIndex > 0 || sortDirection} />}
      </span>
    </th>
  )
}

/**
 * Sort panel showing active sorts with chips
 */
export function SortPanel({ sorts, columns, onToggle, onRemove, onClear }) {
  if (!sorts || sorts.length === 0) return null

  const getLabel = (key) => {
    const col = columns?.find((c) => (typeof c === 'object' ? c.key : c) === key)
    return typeof col === 'object' ? (col.label || col.key) : (col || key)
  }

  return (
    <div className="px-4 py-2.5 bg-blue-50/50 border-b border-blue-100 flex flex-wrap items-center gap-2">
      <span className="text-[0.75rem] text-gray-500 font-medium"><T>Sorted by</T>:</span>
      {sorts.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-blue-200 text-[0.75rem] font-medium text-blue-700">
          <span className="w-4 h-4 rounded-full bg-blue-100 text-[0.625rem] font-bold grid place-items-center">{i + 1}</span>
          {tr(getLabel(s.key))}
          <button onClick={() => onToggle(s.key, { shiftKey: true })} className="hover:text-blue-900">
            {s.direction === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
          </button>
          <button onClick={() => onRemove(s.key)} className="hover:text-red-600 ml-0.5"><X size={12} /></button>
        </span>
      ))}
      <button onClick={onClear} className="text-[0.75rem] text-gray-500 hover:text-red-600 ml-2"><T>Clear All</T></button>
    </div>
  )
}

/**
 * Complete sortable table header row
 */
export function SortableTableHeader({ columns, sorts, onSort, getSortIndex, getSortDirection }) {
  return (
    <tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
      {columns.map((col) => {
        const key = typeof col === 'object' ? col.key : col
        const label = typeof col === 'object' ? (col.label || col.key) : col
        const type = typeof col === 'object' ? col.type : 'text'
        const sortIndex = getSortIndex(key)
        const sortDirection = getSortDirection(key)
        const multiSort = sorts.length > 1

        return (
          <SortableTh
            key={key}
            colKey={key}
            label={tr(label)}
            type={type}
            onSort={onSort}
            sortIndex={sortIndex}
            sortDirection={sortDirection}
          />
        )
      })}
    </tr>
  )
}
