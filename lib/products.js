import { supabase } from './supabase';

export async function searchProducts(query, options = {}) {
  const { statusFilter = null, maxResults = 10 } = options;

  // 1. 精確型號匹配
  const { data: exactMatch } = await supabase
    .from('quickbuy_products')
    .select('*')
    .ilike('item_number', query.trim())
    .limit(1);

  if (exactMatch?.length > 0) {
    return { type: 'exact', products: exactMatch };
  }

  // 2. RPC 全文搜尋
  const { data: searchResults, error } = await supabase
    .rpc('search_quickbuy_products', {
      search_query: query,
      status_filter: statusFilter,
      max_results: maxResults,
    });

  if (!error && searchResults?.length > 0) {
    return { type: 'search', products: searchResults };
  }

  // 3. ILIKE 模糊搜尋 fallback
  const { data: fallbackResults } = await supabase
    .from('quickbuy_products')
    .select('item_number, description, tw_retail_price, tw_reseller_price, product_status, origin_country, category')
    .or(`item_number.ilike.%${query}%,description.ilike.%${query}%`)
    .order('tw_retail_price', { ascending: false })
    .limit(maxResults);

  return {
    type: fallbackResults?.length ? 'fuzzy' : 'none',
    products: fallbackResults || [],
  };
}
