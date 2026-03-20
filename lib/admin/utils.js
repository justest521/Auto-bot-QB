// lib/admin/utils.js — 共用工具函數
import { supabase } from '@/lib/supabase';

export function formatMonthLabel(date) {
  return date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
}

export function formatDayLabel(date) {
  return date.toLocaleString('en-US', { month: '2-digit', day: '2-digit' });
}

export function normalizeCustomerText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

export function scoreErpCustomer(row) {
  if (!row) return -1;
  let score = 0;
  if (row.customer_code) score += 50;
  if (row.company_name) score += 20;
  if (row.phone) score += 10;
  if (row.email) score += 10;
  if (row.tax_id) score += 10;
  if (row.customer_stage === 'customer') score += 20;
  if (row.customer_stage === 'vip') score += 25;
  if (row.source && row.source !== 'line') score += 10;
  return score;
}

export function choosePreferredErpCustomer(candidates, displayName) {
  if (!candidates?.length) return null;
  const normalizedDisplayName = normalizeCustomerText(displayName);
  const exactNamed = candidates.filter((row) => {
    const names = [row.name, row.company_name, row.display_name].map(normalizeCustomerText);
    return normalizedDisplayName && names.includes(normalizedDisplayName);
  });
  const source = exactNamed.length ? exactNamed : candidates;
  return [...source].sort((a, b) => scoreErpCustomer(b) - scoreErpCustomer(a))[0] || null;
}

export function cleanCsvValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return value;
}

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toDateValue(value) {
  const cleaned = cleanCsvValue(value);
  return cleaned || null;
}

export function normalizeRows(rows) {
  return Array.isArray(rows) ? rows.filter(Boolean) : [];
}

export function parseBatchNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ── Error detection helpers ──

export function isMissingColumnError(error) {
  return /column .* does not exist/i.test(error?.message || '');
}

export function isMissingRelationError(error) {
  return /(relation|table).*does not exist|schema cache/i.test(error?.message || '');
}

export function extractMissingRelation(error) {
  const message = error?.message || '';
  const match = message.match(/(?:relation|table)\s+'?("?[\w.]+"?)'?/i) || message.match(/table\s+'([^']+)'/i);
  if (match?.[1]) return String(match[1]).replace(/"/g, '');
  const cacheMatch = message.match(/table '([^']+)'/i);
  return cacheMatch?.[1] || null;
}

export function missingRelationResponse(error, fallbackTable) {
  const relation = extractMissingRelation(error) || fallbackTable || 'ERP 資料表';
  return Response.json({
    error: `目前缺少資料表 ${relation}，請先執行 ERP schema 後再操作。`,
  }, { status: 400 });
}

export function isNonDefaultInsertError(error) {
  return /cannot insert a non-DEFAULT value into column/i.test(error?.message || '');
}

export function extractRestrictedInsertColumn(error) {
  const message = error?.message || '';
  // Try "column X of relation" first, then fallback to "into column X"
  const match = message.match(/column\s+"?([\w]+)"?\s+of relation/i)
    || message.match(/into column\s+"?([\w]+)"?/i)
    || message.match(/column\s+"([\w]+)"/i);
  return match?.[1] || null;
}

export function extractMissingColumn(error) {
  const message = error?.message || '';
  const match = message.match(/column\s+(?:[\w"]+\.)?"?([\w]+)"?\s+does not exist/i);
  return match?.[1] || null;
}

// ── Insert helpers with column fallback ──

export async function insertSingleWithColumnFallback(table, payload, selectClause = '*') {
  let nextPayload = { ...payload };
  let attempts = 0;

  while (attempts < 10) {
    attempts += 1;
    const { data, error } = await supabase
      .from(table)
      .insert(nextPayload)
      .select(selectClause)
      .single();

    if (!error) {
      return { data, error: null, omittedColumns: Object.keys(payload).filter((key) => !(key in nextPayload)) };
    }
    if (!isNonDefaultInsertError(error)) {
      return { data: null, error, omittedColumns: [] };
    }
    const blockedColumn = extractRestrictedInsertColumn(error);
    if (!blockedColumn || !(blockedColumn in nextPayload)) {
      return { data: null, error, omittedColumns: [] };
    }
    const { [blockedColumn]: _removed, ...rest } = nextPayload;
    nextPayload = rest;
  }

  return { data: null, error: new Error(`Insert fallback exceeded for ${table}`), omittedColumns: [] };
}

export async function insertManyWithColumnFallback(table, rows) {
  if (!rows.length) return { error: null, omittedColumns: [] };

  let nextRows = rows.map((row) => ({ ...row }));
  let attempts = 0;

  while (attempts < 10) {
    attempts += 1;
    const { error } = await supabase.from(table).insert(nextRows);
    if (!error) {
      return { error: null, omittedColumns: Object.keys(rows[0] || {}).filter((key) => !(key in (nextRows[0] || {}))) };
    }
    if (!isNonDefaultInsertError(error)) {
      return { error, omittedColumns: [] };
    }
    const blockedColumn = extractRestrictedInsertColumn(error);
    if (!blockedColumn || !(blockedColumn in (nextRows[0] || {}))) {
      return { error, omittedColumns: [] };
    }
    nextRows = nextRows.map((row) => {
      const { [blockedColumn]: _removed, ...rest } = row;
      return rest;
    });
  }

  return { error: new Error(`Insert fallback exceeded for ${table}`), omittedColumns: [] };
}

// ── Bulk delete helper ──

export async function deleteAllRows(table, notNullColumn) {
  const { error } = await supabase
    .from(table)
    .delete()
    .not(notNullColumn, 'is', null);

  if (error && !/relation .* does not exist/i.test(error.message || '')) {
    throw error;
  }
}
