import { NextResponse } from 'next/server';
import { createRateLimiter } from '@/lib/security/rate-limit';
import { getSupabaseConfig } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1';

const statsLimiter = createRateLimiter({ windowMs: 60_000, max: 60, prefix: 'shop_stats' });

// Brand detection based on category prefix
const BRAND_PREFIXES = {
  'Snap-on': 'Snap-on',
  'BAHCO': 'BAHCO',
  '美國藍點': 'Blue Point',
  'Muc-Off': 'Muc-Off',
  'OTC': 'OTC',
  'BOSCH': 'Bosch',
};

function detectBrand(category) {
  if (!category) return 'Other';
  for (const [prefix, brand] of Object.entries(BRAND_PREFIXES)) {
    if (category.startsWith(prefix)) {
      return brand;
    }
  }
  return 'Other';
}

export async function GET(request) {
  const rl = statsLimiter(request);
  if (!rl.ok) return rl.response;

  try {
    const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseConfig();
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
    };

    // Fetch products (minimal columns for performance)
    const productsUrl = `${SUPABASE_URL}/rest/v1/quickbuy_products?select=id,category,product_status,created_at&limit=200000`;
    const productsRes = await fetch(productsUrl, { headers });

    if (!productsRes.ok) {
      const errText = await productsRes.text();
      console.error('Supabase REST error:', productsRes.status, errText);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    const allProducts = await productsRes.json();
    const products = Array.isArray(allProducts) ? allProducts : [];

    // Calculate statistics
    const total_products = products.length;

    // Brand counts
    const brandCountsMap = new Map();
    const categoryCountsMap = new Map();
    const statusCountsMap = new Map();
    const uniqueBrands = new Set();
    const uniqueCategories = new Set();

    let newProductsCount = 0;

    for (const product of products) {
      const brand = detectBrand(product.category);
      const category = product.category || 'Unknown';
      const status = product.product_status || 'Unknown';

      // Brand counts
      uniqueBrands.add(brand);
      brandCountsMap.set(brand, (brandCountsMap.get(brand) || 0) + 1);

      // Category counts
      uniqueCategories.add(category);
      categoryCountsMap.set(category, (categoryCountsMap.get(category) || 0) + 1);

      // Status counts
      statusCountsMap.set(status, (statusCountsMap.get(status) || 0) + 1);

      // New products (check if created in last 30 days)
      if (product.created_at) {
        const createdAt = new Date(product.created_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (createdAt > thirtyDaysAgo) {
          newProductsCount++;
        }
      }
    }

    // Format brand counts as object
    const brand_counts = {};
    for (const [brand, count] of brandCountsMap.entries()) {
      brand_counts[brand] = count;
    }

    // Format category counts as array
    const category_counts = Array.from(categoryCountsMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // Format status counts as object
    const status_counts = {};
    for (const [status, count] of statusCountsMap.entries()) {
      status_counts[status] = count;
    }

    const stats = {
      total_products,
      total_brands: uniqueBrands.size,
      total_categories: uniqueCategories.size,
      brand_counts,
      category_counts,
      new_products_count: newProductsCount,
      status_counts,
    };

    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    console.error('Shop stats API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
