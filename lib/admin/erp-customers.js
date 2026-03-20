// lib/admin/erp-customers.js — ERP 客戶 column state 管理
import { supabase } from '@/lib/supabase';
import { isMissingColumnError, extractMissingColumn } from './utils';

const ERP_CUSTOMER_DESIRED_COLUMNS = [
  'id', 'customer_code', 'name', 'company_name', 'phone', 'email',
  'tax_id', 'address', 'line_user_id', 'source', 'status',
  'display_name', 'customer_stage', 'notes',
];

let cachedErpCustomerColumnState = null;

export async function getErpCustomerColumnState() {
  if (cachedErpCustomerColumnState) return cachedErpCustomerColumnState;

  const columns = [...ERP_CUSTOMER_DESIRED_COLUMNS];

  while (columns.length > 0) {
    const { error } = await supabase
      .from('erp_customers')
      .select(columns.join(','))
      .limit(1);

    if (!error) {
      const available = new Set(columns);
      cachedErpCustomerColumnState = {
        columns: columns.join(','),
        stageReady: available.has('customer_stage'),
        lineReady: available.has('line_user_id'),
        displayReady: available.has('display_name'),
        available,
      };
      return cachedErpCustomerColumnState;
    }

    if (!isMissingColumnError(error)) throw error;

    const missingColumn = extractMissingColumn(error);
    if (!missingColumn) throw error;

    const nextColumns = columns.filter((c) => c !== missingColumn);
    if (nextColumns.length === columns.length) throw error;
    columns.splice(0, columns.length, ...nextColumns);
  }

  cachedErpCustomerColumnState = {
    columns: 'id',
    stageReady: false,
    lineReady: false,
    displayReady: false,
    available: new Set(['id']),
  };
  return cachedErpCustomerColumnState;
}

export async function runErpCustomerQuery(buildQuery) {
  const columnState = await getErpCustomerColumnState();
  const result = await buildQuery(columnState.columns);
  return {
    ...result,
    stageReady: columnState.stageReady,
    lineReady: columnState.lineReady,
    displayReady: columnState.displayReady,
  };
}
