import { NextResponse } from 'next/server';
import { createRateLimiter } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
}

const shopLimiter = createRateLimiter({ windowMs: 60_000, max: 60, prefix: 'shop_products' });

// Brand mapping - extract from category prefix
const BRAND_MAPPING = {
  'Snap-on': 'Snap-on',
  'BAHCO': 'BAHCO',
  'Muc-Off': 'Muc-Off',
  '美國藍點': '美國藍點',
  'OTC': 'OTC',
  'QB TOOLS': 'QB TOOLS',
};

function extractBrand(category) {
  if (!category) return null;
  for (const [prefix, brand] of Object.entries(BRAND_MAPPING)) {
    if (category.startsWith(prefix)) {
      return brand;
    }
  }
  return null;
}

function getSortClause(sort) {
  switch (sort) {
    case 'price_asc':
      return 'tw_retail_price.asc';
    case 'price_desc':
      return 'tw_retail_price.desc';
    case 'newest':
      return 'created_at.desc';
    default:
      return 'created_at.desc';
  }
}

export async function GET(request) {
  const rl = shopLimiter(request);
  if (!rl.ok) return rl.response;

  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const category = searchParams.get('category') || '';
    const brand = searchParams.get('brand') || '';
    const status = searchParams.get('status') || 'Current,New Announced';
    const sort = searchParams.get('sort') || 'newest';
    const page = Math.max(0, parseInt(searchParams.get('page') || '1', 10) - 1);
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '24', 10)), 48);
    const offset = page * limit;

    // Build Supabase query
    const params = new URLSearchParams();
    params.set('select', 'id,item_number,description,tw_retail_price,product_status,category,image_url,weight_kg,origin_country');
    params.set('order', getSortClause(sort));
    params.set('offset', String(offset));
    params.set('limit', String(limit));

    // Price filter - only show items with tw_retail_price > 0
    params.set('tw_retail_price', 'gt.0');

    // Category filter
    if (category) {
      params.set('category', `eq.${category}`);
    } else if (brand) {
      params.set('category', `ilike.${brand}%`);
    }

    // Build combined OR/AND filter
    // Status filter + optional search — must be combined to avoid overwriting 'or' param
    const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
    if (q) {
      const escaped = q.replace(/['"]/g, '');
      // Search with status: use 'and' to combine status OR with search OR
      const statusFilter = statuses.length > 0
        ? `or(${statuses.map(s => `product_status.eq.${s}`).join(',')})`
        : '';
      const searchFilter = `or(item_number.ilike.%${escaped}%,description.ilike.%${escaped}%)`;
      if (statusFilter) {
        params.set('and', `(${statusFilter},${searchFilter})`);
      } else {
        params.set('or', `(item_number.ilike.%${escaped}%,description.ilike.%${escaped}%)`);
      }
    } else if (statuses.length > 0) {
      const statusFilters = statuses.map(s => `product_status.eq.${s}`).join(',');
      params.set('or', `(${statusFilters})`);
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

    const products = Array.isArray(data) ? data : [];
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      products,
      total,
      page: page + 1,
      totalPages,
      limit,
    });
  } catch (err) {
    console.error('Shop products API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
