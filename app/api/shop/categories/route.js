import { NextResponse } from 'next/server';
import { createRateLimiter } from '@/lib/security/rate-limit';
import { getSupabaseConfig } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1';

const shopLimiter = createRateLimiter({ windowMs: 60_000, max: 60, prefix: 'shop_categories' });

// In-memory cache for categories (5 minute TTL)
let categoryCache = null;
let categorysCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[\s\-_]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function fetchCategoriesFromDB() {
  try {
    const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseConfig();
    // Fetch all distinct categories with product counts
    const params = new URLSearchParams();
    params.set('select', 'category,count(*)');
    params.set('product_status', 'in.(Current,New Announced)');
    params.set('tw_retail_price', 'gt.0');
    params.set('group_by', 'category');

    const url = `${SUPABASE_URL}/rest/v1/quickbuy_products?${params}`;
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(url, { headers });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Supabase categories query failed:', res.status, errText);
      return null;
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error fetching categories from DB:', err);
    return null;
  }
}

function buildCategoryResponse(categoryData) {
  if (!Array.isArray(categoryData) || categoryData.length === 0) {
    return { brands: [], totalProducts: 0 };
  }

  // Group categories by brand
  const brandMap = new Map();
  let totalProducts = 0;

  for (const item of categoryData) {
    const category = item.category || 'other';
    const count = parseInt(item.count, 10) || 0;
    totalProducts += count;

    const brand = extractBrand(category) || 'other';
    if (!brandMap.has(brand)) {
      brandMap.set(brand, { name: brand, slug: slugify(brand), categories: [] });
    }

    brandMap.get(brand).categories.push({
      name: category,
      slug: slugify(category),
      count,
    });
  }

  // Sort categories within each brand by name
  for (const brandData of brandMap.values()) {
    brandData.categories.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Sort brands: branded first (alphabetically), then 'other' last
  const brands = Array.from(brandMap.values()).sort((a, b) => {
    if (a.name === 'other') return 1;
    if (b.name === 'other') return -1;
    return a.name.localeCompare(b.name);
  });

  return {
    brands,
    totalProducts,
  };
}

export async function GET(request) {
  const rl = shopLimiter(request);
  if (!rl.ok) return rl.response;

  try {
    const now = Date.now();

    // Check cache
    if (categoryCache && now - categorysCacheTime < CACHE_TTL) {
      return NextResponse.json(categoryCache, {
        headers: {
          'Cache-Control': 'public, max-age=300',
          'X-Cache': 'HIT',
        },
      });
    }

    // Fetch fresh data
    const categoryData = await fetchCategoriesFromDB();
    if (!categoryData) {
      // Return cached data if available, even if expired
      if (categoryCache) {
        return NextResponse.json(categoryCache, {
          headers: {
            'Cache-Control': 'public, max-age=60',
            'X-Cache': 'STALE',
          },
        });
      }
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }

    // Build response
    const response = buildCategoryResponse(categoryData);

    // Update cache
    categoryCache = response;
    categorysCacheTime = now;

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=300',
        'X-Cache': 'MISS',
      },
    });
  } catch (err) {
    console.error('Shop categories API error:', err);

    // Return cached data if available on error
    if (categoryCache) {
      return NextResponse.json(categoryCache, {
        headers: {
          'Cache-Control': 'public, max-age=60',
          'X-Cache': 'ERROR',
        },
      });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
