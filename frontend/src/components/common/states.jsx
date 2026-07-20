import React from 'react'
import { RefreshCw } from 'lucide-react'

// Shared loading / error / empty state views so every admin screen distinguishes
// "still loading", "failed to load" (with Retry) and "genuinely empty" — instead
// of a failed request masquerading as a "no records" empty state.

export const LOAD_ERROR = "Couldn't load records — check your connection and retry."

// Block-level states for full-page / detail screens.
export function LoadingBlock({ label = 'Loading…' }) {
  return <div className="py-20 text-center text-gray-400 text-sm">{label}</div>
}

export function ErrorBlock({ message = LOAD_ERROR, onRetry }) {
  return (
    <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
      <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 max-w-md">{message}</div>
      {onRetry && (
        <button onClick={onRetry} className="btn-outline !py-2"><RefreshCw size={15} /> Retry</button>
      )}
    </div>
  )
}

// Row-level state that drops into a table <tbody>. Render it only when there are
// no data rows: shows Loading, then a distinct Error+Retry, else the empty text.
export function TableStates({ colSpan, loading, error, onRetry, empty = 'No records found.' }) {
  if (loading) {
    return <tr><td colSpan={colSpan} className="px-4 py-12 text-center text-gray-400 text-sm">Loading…</td></tr>
  }
  if (error) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-4 py-12 text-center">
          <div className="text-sm text-red-600 mb-3">{error}</div>
          {onRetry && (
            <button onClick={onRetry} className="btn-outline !py-1.5 mx-auto"><RefreshCw size={14} /> Retry</button>
          )}
        </td>
      </tr>
    )
  }
  return <tr><td colSpan={colSpan} className="px-4 py-12 text-center text-gray-400">{empty}</td></tr>
}
