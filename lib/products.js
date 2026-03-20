import { supabase } from './supabase';

export async function searchProducts(query, options = {}) {
  const { statusFilter = 'Current', maxResults = 10 } = options;
  const trimmed = (query || '').trim();
  if (!trimmed) return { type: 'none', products: [] };

  const cleaned = trimmed.replace(/['"]/g, '');
  const selectCols = 'item_number, description, tw_retail_price, tw_reseller_price, product_status, origin_country, category, replacement_model';

  // 1. 精確型號匹配
  let exactQuery = supabase
    .from('quickbuy_products')
    .select(selectCols)
    .ilike('item_number', cleaned)
    .limit(1);
  if (statusFilter) exactQuery = exactQuery.eq('product_status', statusFilter);

  const { data: exactMatch } = await exactQuery;
  if (exactMatch?.length > 0) {
    return { type: 'exact', products: exactMatch };
  }

  // 2. 模糊料號 + 全文搜尋
  const tsQuery = cleaned.split(/\s+/).filter(Boolean).join(' & ');
  let searchQuery = supabase
    .from('quickbuy_products')
    .select(selectCols)
    .or(`item_number.ilike.%${cleaned}%,search_text.fts.${tsQuery}`)
    .order('tw_retail_price', { ascending: false })
    .limit(maxResults);
  if (statusFilter) searchQuery = searchQuery.eq('product_status', statusFilter);

  const { data: searchResults } = await searchQuery;
  if (searchResults?.length > 0) {
    return { type: 'search', products: searchResults };
  }

  // 3. ILIKE 描述模糊搜尋 fallback
  let fallbackQuery = supabase
    .from('quickbuy_products')
    .select(selectCols)
    .ilike('description', `%${cleaned}%`)
    .order('tw_retail_price', { ascending: false })
    .limit(maxResults);
  if (statusFilter) fallbackQuery = fallbackQuery.eq('product_status', statusFilter);

  const { data: fallbackResults } = await fallbackQuery;
  return {
    type: fallbackResults?.length ? 'fuzzy' : 'none',
    products: fallbackResults || [],
  };
}
