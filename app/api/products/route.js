import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://izfxiaufbwrlmifrbdiv.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q') || '';
    const category = searchParams.get('category') || 'all';
    const page = parseInt(searchParams.get('page') || '0', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const offset = page * limit;

    let query = supabase
      .from('quickbuy_products')
      .select('item_number, description, tw_retail_price, product_status, category, replacement_model', { count: 'exact' })
      .eq('product_status', 'Current')
      .order('item_number', { ascending: true })
      .range(offset, offset + limit - 1);

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    if (search.trim()) {
      const escaped = search.trim().replace(/['"]/g, '');
      // Try item_number match or full-text search
      query = query.or(`item_number.ilike.%${escaped}%,search_text.fts.${escaped.split(/\s+/).join(' & ')}`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Products query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      products: data || [],
      total: count || 0,
      page,
      limit,
      hasMore: (data || []).length === limit,
    });
  } catch (err) {
    console.error('Products API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
