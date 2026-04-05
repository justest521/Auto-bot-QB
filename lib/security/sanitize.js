// lib/security/sanitize.js — Input sanitization utilities

/**
 * Strip HTML tags and dangerous characters from a string
 */
export function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<[^>]*>/g, '')           // Remove HTML tags
    .replace(/javascript:/gi, '')       // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '')        // Remove event handlers (onclick=, etc.)
    .replace(/data:\s*text\/html/gi, '') // Remove data:text/html
    .trim();
}

/**
 * Sanitize an object's string values recursively (for POST body)
 * Preserves non-string values (numbers, booleans, null, arrays)
 */
export function sanitizeBody(obj, depth = 0) {
  if (depth > 10) return obj; // Prevent deep recursion attacks
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return stripHtml(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;

  if (Array.isArray(obj)) {
    return obj.slice(0, 1000).map(item => sanitizeBody(item, depth + 1)); // Cap array size
  }

  if (typeof obj === 'object') {
    const cleaned = {};
    const keys = Object.keys(obj).slice(0, 200); // Cap object keys
    for (const key of keys) {
      const cleanKey = stripHtml(key);
      cleaned[cleanKey] = sanitizeBody(obj[key], depth + 1);
    }
    return cleaned;
  }

  return obj;
}

/**
 * Validate and constrain pagination params
 */
export function safePagination(searchParams, { maxLimit = 100, defaultLimit = 20 } = {}) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(searchParams.get('limit') || String(defaultLimit), 10) || defaultLimit));
  return { page, limit };
}

/**
 * Validate search input — cap length, strip dangerous chars
 */
export function safeSearch(str, maxLength = 200) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLength).replace(/[<>{}]/g, '').trim();
}

/**
 * Escape special characters for PostgREST filter values (.or(), .ilike(), etc.)
 * Prevents filter injection via crafted search strings.
 */
export function escapePostgrestValue(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\/g, '\\\\')   // backslash first
    .replace(/,/g, '\\,')     // comma (PostgREST OR separator)
    .replace(/\(/g, '\\(')    // open paren
    .replace(/\)/g, '\\)')    // close paren
    .replace(/\./g, '\\.')    // dot (PostgREST operator separator)
    .replace(/:/g, '\\:');    // colon
}

/**
 * Validate that a value is a safe ID (UUID or numeric)
 */
export function safeId(val) {
  if (typeof val !== 'string') return '';
  // Allow UUID format or numeric IDs
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) return val;
  if (/^\d{1,20}$/.test(val)) return val;
  if (/^[a-zA-Z0-9_-]{1,50}$/.test(val)) return val;
  return '';
}
