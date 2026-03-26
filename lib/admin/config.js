// lib/admin/config.js — quickbuy_config 操作
import { supabase } from '@/lib/supabase';
import { isMissingColumnError } from './utils';

let cachedQuickbuyConfigState = null;

export async function getQuickbuyConfigState() {
  if (cachedQuickbuyConfigState) return cachedQuickbuyConfigState;

  const attempts = [
    { keyColumn: 'config_key', valueColumn: 'config_value' },
    { keyColumn: 'key', valueColumn: 'value' },
  ];

  for (const attempt of attempts) {
    const { error } = await supabase
      .from('quickbuy_config')
      .select(`${attempt.keyColumn},${attempt.valueColumn}`)
      .limit(1);

    if (!error) {
      cachedQuickbuyConfigState = attempt;
      return cachedQuickbuyConfigState;
    }
    if (!isMissingColumnError(error)) throw error;
  }

  throw new Error('quickbuy_config 缺少可用的 key/value 欄位');
}

export async function getQuickbuyConfigEntry(configKey) {
  const state = await getQuickbuyConfigState();
  const { data, error } = await supabase
    .from('quickbuy_config')
    .select(state.valueColumn)
    .eq(state.keyColumn, configKey)
    .maybeSingle();

  if (error) throw error;
  return data?.[state.valueColumn];
}

export async function upsertQuickbuyConfigEntry(configKey, configValue) {
  const state = await getQuickbuyConfigState();
  const { error } = await supabase
    .from('quickbuy_config')
    .upsert(
      { [state.keyColumn]: configKey, [state.valueColumn]: configValue },
      { onConflict: state.keyColumn }
    );
  if (error) throw error;
}

export async function getImportHistory() {
  const value = await getQuickbuyConfigEntry('admin_import_history');
  return Array.isArray(value) ? value : [];
}

export async function appendImportHistory(entry) {
  const history = await getImportHistory();
  const nextHistory = [entry, ...history].slice(0, 30);
  await upsertQuickbuyConfigEntry('admin_import_history', nextHistory);
}
