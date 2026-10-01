/**
 * useUrlState Hook
 *
 * Persists filter/search state in URL search parameters.
 * This ensures state survives navigation, page refresh, and can be bookmarked/shared.
 *
 * Usage:
 *   const [filters, setFilters] = useUrlState({
 *     q: '',
 *     status: '',
 *     start: '',
 *     end: '',
 *     page: 1,
 *   })
 *
 *   // Update a single filter
 *   setFilters({ q: 'search term' })
 *
 *   // Update multiple filters
 *   setFilters({ start: '2024-01-01', end: '2024-01-31' })
 *
 *   // Reset to defaults
 *   setFilters({ q: '', status: '', start: '', end: '', page: 1 })
 */

import { useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Custom hook for URL-based state persistence
 * @param {Object} defaults - Default values for each filter key
 * @returns {[Object, Function]} - Current state and setter function
 */
export function useUrlState(defaults) {
  const [searchParams, setSearchParams] = useSearchParams()

  // Stabilize defaults reference to prevent unnecessary re-renders
  const defaultsRef = useRef(defaults)
  defaultsRef.current = defaults

  // Parse current URL params into state object
  const state = useMemo(() => {
    const result = {}
    const defs = defaultsRef.current
    for (const key of Object.keys(defs)) {
      const urlValue = searchParams.get(key)
      const defaultValue = defs[key]

      if (urlValue === null || urlValue === '') {
        // Use default value if not in URL
        result[key] = defaultValue
      } else if (typeof defaultValue === 'number') {
        // Parse numbers
        result[key] = parseInt(urlValue, 10) || defaultValue
      } else {
        // String values
        result[key] = urlValue
      }
    }
    return result
  }, [searchParams])

  // Update URL params (only includes non-default values to keep URLs clean)
  const setState = useCallback((updates) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev)
      const defs = defaultsRef.current

      for (const [key, value] of Object.entries(updates)) {
        const defaultValue = defs[key]

        // Remove param if it matches default (keeps URLs clean)
        if (value === defaultValue || value === '' || value === null || value === undefined) {
          newParams.delete(key)
        } else {
          newParams.set(key, String(value))
        }
      }

      return newParams
    }, { replace: true }) // Use replace to avoid polluting browser history
  }, [setSearchParams])

  // Reset all filters to defaults
  const resetState = useCallback(() => {
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  return [state, setState, resetState]
}

/**
 * Helper hook for pages that need individual filter setters
 * Returns individual state values and setters that work like useState
 *
 * Usage:
 *   const { q, setQ, start, setStart, end, setEnd, resetFilters } = useFilterParams({
 *     q: '',
 *     start: '',
 *     end: '',
 *   })
 */
export function useFilterParams(defaults) {
  const [state, setState, resetState] = useUrlState(defaults)

  // Create individual setters for each key
  const setters = useMemo(() => {
    const result = {}
    for (const key of Object.keys(defaults)) {
      // Create setter name like setQ, setStart, setStatus
      const setterName = 'set' + key.charAt(0).toUpperCase() + key.slice(1)
      result[setterName] = (value) => {
        // Handle both direct values and event objects
        const newValue = value?.target !== undefined ? value.target.value : value
        setState({ [key]: newValue })
      }
    }
    return result
  }, [defaults, setState])

  return {
    ...state,
    ...setters,
    setFilters: setState,
    resetFilters: resetState,
  }
}

export default useUrlState
