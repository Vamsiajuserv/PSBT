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
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(value) {
  if (!value || !value.trim()) return { valid: true, error: null } // Email is usually optional
  if (!emailPattern.test(value)) return { valid: false, error: 'Invalid email format' }
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
