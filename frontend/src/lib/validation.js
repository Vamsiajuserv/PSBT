/**
 * Form Validation Utilities
 * Provides consistent validation across all forms in the application.
 */

// ── Name Validation ──
// Allows alphabets, spaces, and common name characters (no numbers)
export const namePattern = /^[A-Za-z\s.'()-]+$/
export const namePatternTelugu = /^[A-Za-z\s.'()\u0C00-\u0C7F-]+$/ // Includes Telugu characters

export function validateName(value) {
  if (!value || !value.trim()) return { valid: false, error: 'Name is required' }
  if (/\d/.test(value)) return { valid: false, error: 'Name cannot contain numbers' }
  if (!namePattern.test(value) && !namePatternTelugu.test(value)) {
    return { valid: false, error: 'Name contains invalid characters' }
  }
  if (value.trim().length < 2) return { valid: false, error: 'Name must be at least 2 characters' }
  return { valid: true, error: null }
}

// Sanitize name input - remove numbers as user types
export function sanitizeName(value) {
  return value.replace(/[0-9]/g, '')
}

// ── Phone Validation ──
// Allows only digits, exactly 10 digits for Indian mobile numbers
export const phonePattern = /^[6-9]\d{9}$/

export function validatePhone(value) {
  if (!value || !value.trim()) return { valid: false, error: 'Phone number is required' }
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 10) return { valid: false, error: 'Phone number must be exactly 10 digits' }
  if (!phonePattern.test(digits)) return { valid: false, error: 'Invalid Indian mobile number (must start with 6-9)' }
  return { valid: true, error: null }
}

// Sanitize phone input - remove non-digits as user types
export function sanitizePhone(value) {
  return value.replace(/\D/g, '').slice(0, 10)
}

// ── Email Validation ──
// DEF-003: Stricter email pattern that rejects special characters like !#$%
// Only allows: letters, numbers, dots, underscores, hyphens before @
export const emailPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/

export function validateEmail(value) {
  if (!value || !value.trim()) return { valid: true, error: null } // Email is usually optional
  const trimmed = value.trim()
  // Check for invalid special characters
  if (/[!#$%^&*()+=\[\]{};':"\\|,<>\/?]/.test(trimmed.split('@')[0])) {
    return { valid: false, error: 'Email contains invalid special characters' }
  }
  if (!emailPattern.test(trimmed)) return { valid: false, error: 'Invalid email format' }
  return { valid: true, error: null }
}

// ── Amount/Number Validation ──
export function validateAmount(value, { min = 0, max = Infinity, required = false } = {}) {
  if (!value && value !== 0) {
    return required ? { valid: false, error: 'Amount is required' } : { valid: true, error: null }
  }
  const num = Number(value)
  if (isNaN(num)) return { valid: false, error: 'Must be a valid number' }
  if (num < min) return { valid: false, error: `Amount must be at least ${min}` }
  if (num > max) return { valid: false, error: `Amount cannot exceed ${max}` }
  return { valid: true, error: null }
}

// Sanitize amount input - allow only digits and decimal point
export function sanitizeAmount(value) {
  return value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
}

// ── Quantity Validation ──
export function validateQuantity(value, { min = 1, max = 10000, required = false } = {}) {
  if (!value && value !== 0) {
    return required ? { valid: false, error: 'Quantity is required' } : { valid: true, error: null }
  }
  const num = parseInt(value, 10)
  if (isNaN(num) || num !== Number(value)) return { valid: false, error: 'Must be a whole number' }
  if (num < min) return { valid: false, error: `Quantity must be at least ${min}` }
  if (num > max) return { valid: false, error: `Quantity cannot exceed ${max}` }
  return { valid: true, error: null }
}

// ── Item Name Validation (for Hundi items, materials, etc.) ──
// Allows letters, spaces, common characters, but no numbers
export const itemNamePattern = /^[A-Za-z\s.'(),/&\u0C00-\u0C7F-]+$/

export function validateItemName(value) {
  if (!value || !value.trim()) return { valid: false, error: 'Item name is required' }
  if (/\d/.test(value)) return { valid: false, error: 'Item name cannot contain numbers' }
  return { valid: true, error: null }
}

// Sanitize item name - remove numbers as user types
export function sanitizeItemName(value) {
  return value.replace(/[0-9]/g, '')
}

// ── PAN Validation ──
export const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/

export function validatePAN(value) {
  if (!value || !value.trim()) return { valid: true, error: null } // PAN is optional unless required
  const upper = value.toUpperCase().trim()
  if (!panPattern.test(upper)) return { valid: false, error: 'Invalid PAN format (e.g. ABCDE1234F)' }
  return { valid: true, error: null }
}

// Sanitize PAN - uppercase, alphanumeric only, max 10 chars
export function sanitizePAN(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
}

// ── Vehicle Number Validation ──
export const vehiclePattern = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{1,4}$/

export function validateVehicle(value) {
  if (!value || !value.trim()) return { valid: true, error: null }
  const upper = value.toUpperCase().replace(/[\s-]/g, '')
  if (!vehiclePattern.test(upper)) return { valid: false, error: 'Invalid vehicle number format' }
  return { valid: true, error: null }
}

// Sanitize vehicle number - uppercase, remove spaces
export function sanitizeVehicle(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// ── Generic Input Handlers ──
// These can be used with onChange to sanitize input in real-time

export function handleNameInput(e, setter) {
  const sanitized = sanitizeName(e.target.value)
  setter(sanitized)
}

export function handlePhoneInput(e, setter) {
  const sanitized = sanitizePhone(e.target.value)
  setter(sanitized)
}

export function handleAmountInput(e, setter) {
  const sanitized = sanitizeAmount(e.target.value)
  setter(sanitized)
}

export function handleItemNameInput(e, setter) {
  const sanitized = sanitizeItemName(e.target.value)
  setter(sanitized)
}

export function handlePANInput(e, setter) {
  const sanitized = sanitizePAN(e.target.value)
  setter(sanitized)
}

export function handleVehicleInput(e, setter) {
  const sanitized = sanitizeVehicle(e.target.value)
  setter(sanitized)
}

// ── UTR/Transaction Reference Validation ──
// UPI UTR is typically 12-22 alphanumeric characters
export const utrPattern = /^[A-Za-z0-9]{12,22}$/

export function validateUTR(value, { required = false } = {}) {
  if (!value || !value.trim()) {
    return required ? { valid: false, error: 'Transaction reference is required' } : { valid: true, error: null }
  }
  const trimmed = value.trim().replace(/\s/g, '')
  if (trimmed.length < 12) return { valid: false, error: 'UTR must be at least 12 characters' }
  if (trimmed.length > 22) return { valid: false, error: 'UTR cannot exceed 22 characters' }
  if (!utrPattern.test(trimmed)) return { valid: false, error: 'UTR must be alphanumeric only' }
  return { valid: true, error: null }
}

// Sanitize UTR - uppercase, alphanumeric only
export function sanitizeUTR(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 22)
}

export function handleUTRInput(e, setter) {
  const sanitized = sanitizeUTR(e.target.value)
  setter(sanitized)
}

// ── Bank Reference/Challan Validation ──
export function validateBankRef(value, { required = false } = {}) {
  if (!value || !value.trim()) {
    return required ? { valid: false, error: 'Bank reference is required' } : { valid: true, error: null }
  }
  const trimmed = value.trim()
  if (trimmed.length < 3) return { valid: false, error: 'Reference must be at least 3 characters' }
  if (trimmed.length > 50) return { valid: false, error: 'Reference cannot exceed 50 characters' }
  return { valid: true, error: null }
}

// ── IFSC Code Validation ──
export const ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/

export function validateIFSC(value) {
  if (!value || !value.trim()) return { valid: true, error: null }
  const upper = value.toUpperCase().trim()
  if (!ifscPattern.test(upper)) return { valid: false, error: 'Invalid IFSC code format' }
  return { valid: true, error: null }
}

export function sanitizeIFSC(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11)
}

// ── Form Field Validation Wrapper ──
// Returns CSS class for invalid state
export function getFieldClass(isValid, baseClass = 'input') {
  return isValid === false ? `${baseClass} border-red-400 focus:border-red-500 focus:ring-red-200` : baseClass
}

// ── Bulk Validation ──
// Validate multiple fields at once
export function validateForm(fields) {
  const errors = {}
  let isValid = true

  for (const [key, { value, validator, options }] of Object.entries(fields)) {
    const result = validator(value, options)
    if (!result.valid) {
      errors[key] = result.error
      isValid = false
    }
  }

  return { isValid, errors }
}

// ── Password Validation ──
// DEF-011: Password must have letters AND numbers, not just special characters
export const PASSWORD_MIN_LENGTH = 6

export function validatePassword(value, { required = true } = {}) {
  if (!value) {
    return required ? { valid: false, error: 'Password is required' } : { valid: true, error: null }
  }

  if (value.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` }
  }

  // Must contain at least one letter
  if (!/[A-Za-z]/.test(value)) {
    return { valid: false, error: 'Password must contain at least one letter' }
  }

  // Must contain at least one number
  if (!/[0-9]/.test(value)) {
    return { valid: false, error: 'Password must contain at least one number' }
  }

  return { valid: true, error: null }
}

// Get password strength indicator
export function getPasswordStrength(value) {
  if (!value) return { level: 0, label: '', color: '' }

  let score = 0
  if (value.length >= 6) score++
  if (value.length >= 8) score++
  if (/[A-Z]/.test(value)) score++
  if (/[a-z]/.test(value)) score++
  if (/[0-9]/.test(value)) score++
  if (/[^A-Za-z0-9]/.test(value)) score++ // Special chars

  if (score <= 2) return { level: 1, label: 'Weak', color: 'text-red-600' }
  if (score <= 4) return { level: 2, label: 'Fair', color: 'text-amber-600' }
  return { level: 3, label: 'Strong', color: 'text-emerald-600' }
}

// ── Date Range Validation ──
// Validates that start date is before end date and within reasonable bounds
const MAX_DATE_RANGE_DAYS = 366 // Maximum allowed date range

export function validateDateRange(startDate, endDate, { maxDays = MAX_DATE_RANGE_DAYS, required = false } = {}) {
  // Handle empty values
  if (!startDate && !endDate) {
    return required
      ? { valid: false, error: 'Date range is required' }
      : { valid: true, error: null }
  }

  if (startDate && !endDate) {
    return { valid: false, error: 'End date is required when start date is provided' }
  }

  if (!startDate && endDate) {
    return { valid: false, error: 'Start date is required when end date is provided' }
  }

  // Parse dates
  const start = new Date(startDate)
  const end = new Date(endDate)

  // Check for invalid dates
  if (isNaN(start.getTime())) {
    return { valid: false, error: 'Invalid start date' }
  }
  if (isNaN(end.getTime())) {
    return { valid: false, error: 'Invalid end date' }
  }

  // Start must be before or equal to end
  if (start > end) {
    return { valid: false, error: 'Start date cannot be after end date' }
  }

  // Check date range limit
  const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24))
  if (diffDays > maxDays) {
    return { valid: false, error: `Date range cannot exceed ${maxDays} days` }
  }

  return { valid: true, error: null, diffDays }
}

// Validate that a date is not in the future
export function validateNotFutureDate(value) {
  if (!value) return { valid: true, error: null }
  const date = new Date(value)
  const today = new Date()
  today.setHours(23, 59, 59, 999) // End of today
  if (date > today) {
    return { valid: false, error: 'Date cannot be in the future' }
  }
  return { valid: true, error: null }
}

// Validate that a date is not in the past (for bookings)
export function validateNotPastDate(value, { allowToday = true } = {}) {
  if (!value) return { valid: true, error: null }
  const date = new Date(value)
  const today = new Date()
  if (allowToday) {
    today.setHours(0, 0, 0, 0) // Start of today
  } else {
    today.setHours(23, 59, 59, 999) // End of today
  }
  if (date < today) {
    return { valid: false, error: 'Date cannot be in the past' }
  }
  return { valid: true, error: null }
}
