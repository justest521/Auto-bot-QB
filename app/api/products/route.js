import { NextResponse } from 'next/server';
import { publicLimiter } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
}

export async function GET(request) {
  const rl = publicLimiter(request);
  if (!rl.ok) return rl.response;
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q') || '';
    const category = searchParams.get('category') || 'all';
    const page = parseInt(searchParams.get('page') || '0', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const offset = page * limit;

    const params = new URLSearchParams();
    params.set('select', 'item_number,description,tw_retail_price,product_status,category,replacement_model');
    params.set('product_status', 'eq.Current');
    params.set('order', 'item_number.asc');
    params.set('offset', String(offset));
    params.set('limit', String(limit));

    if (category && category !== 'all') {
      params.set('category', `eq.${category}`);
    }

    const trimmed = search.trim();
    if (trimmed) {
      const escaped = trimmed.replace(/['"]/g, '');
      const tsQuery = escaped.split(/\s+/).filter(Boolean).join(' & ');
      params.set('or', `(item_number.ilike.*${escaped}*,search_text.fts.${tsQuery})`);
    }

    const url = `${SUPABASE_URL}/rest/v1/quickbuy_products?${params}`;
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
    };

    const res = await fetch(url, { headers });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Supabase REST error:', res.status, errText);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    const total = parseInt(res.headers.get('content-range')?.split('/')[1] || '0', 10);
    const data = await res.json();

    return NextResponse.json({
      products: Array.isArray(data) ? data : [],
      total,
      page,
      limit,
      hasMore: (Array.isArray(data) ? data : []).length === limit,
    });
  } catch (err) {
    console.error('Products API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
