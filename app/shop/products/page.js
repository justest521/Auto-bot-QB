'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const PRICE_RANGES = [
  { label: '1,000 以下', min: 0, max: 1000 },
  { label: '1,000 - 5,000', min: 1000, max: 5000 },
  { label: '5,000 - 15,000', min: 5000, max: 15000 },
  { label: '15,000 以上', min: 15000, max: Infinity },
];

const BRANDS = ['Snap-on', '美國藍點', 'BAHCO', 'Muc-Off', 'OTC', 'QB TOOLS'];

const CATEGORIES = [
  '棘輪扳手 & 套筒',
  '扳手',
  '螺絲起子',
  '鉗子',
  '工具箱/收納',
  '電動工具',
  '氣動工具',
  '診斷設備',
];

function formatPrice(price) {
  return `NT$${price.toLocaleString('zh-TW')}`;
}

function ProductCard({ product }) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="product-listing-card">
      <div className="product-listing-image">
        {!imageError && product.image_url ? (
          <img
            src={product.image_url}
            alt={product.description}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="product-image-placeholder">🔧</div>
        )}
        {product.product_status === 'New Announced' && (
          <div className="product-listing-badge">新品</div>
        )}
      </div>
      <div className="product-listing-content">
        <div className="product-listing-number">{product.item_number}</div>
        <div className="product-listing-description">{product.description}</div>
        <div className="product-listing-price">{formatPrice(product.tw_retail_price)}</div>
        <div className="product-listing-actions">
          <Link href={`/shop/products/${product.id}`} className="product-listing-btn">
            製品詳細
          </Link>
          <button className="product-listing-cart-btn" title="加入購物車">
            🛒
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedBrands, setExpandedBrands] = useState(new Set(BRANDS));

  // Get current filters from URL
  const q = searchParams.get('q') || '';
  const category = searchParams.get('category') || '';
  const brand = searchParams.get('brand') || '';
  const sort = searchParams.get('sort') || 'newest';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const priceRange = searchParams.get('priceRange') || '';

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/shop/categories');
        if (!res.ok) throw new Error('Failed to fetch categories');
        const data = await res.json();
        setCategories(data.brands || []);
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };

    fetchCategories();
  }, []);

  // Fetch products
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (q) params.append('q', q);
        if (category) params.append('category', category);
        if (brand) params.append('brand', brand);
        if (sort) params.append('sort', sort);
        params.append('page', String(page));
        params.append('limit', '24');

        const res = await fetch(`/api/shop/products?${params}`);
        if (!res.ok) throw new Error('Failed to fetch products');
        const data = await res.json();
        setProducts(data.products || []);
        setTotalCount(data.total || 0);
        setTotalPages(data.totalPages || 1);
      } catch (err) {
        console.error('Error fetching products:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [q, category, brand, sort, page]);

  const handleSearch = (value) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set('q', value);
    } else {
      params.delete('q');
    }
    params.set('page', '1');
    router.push(`/shop/products?${params}`);
  };

  const handleBrandFilter = (selectedBrand) => {
    const params = new URLSearchParams(searchParams);
    if (params.get('brand') === selectedBrand) {
      params.delete('brand');
    } else {
      params.set('brand', selectedBrand);
    }
    params.delete('category');
    params.set('page', '1');
    router.push(`/shop/products?${params}`);
  };

  const handleCategoryFilter = (selectedCategory) => {
    const params = new URLSearchParams(searchParams);
    if (params.get('category') === selectedCategory) {
      params.delete('category');
    } else {
      params.set('category', selectedCategory);
    }
    params.delete('brand');
    params.set('page', '1');
    router.push(`/shop/products?${params}`);
  };

  const handleSortChange = (newSort) => {
    const params = new URLSearchParams(searchParams);
    params.set('sort', newSort);
    params.set('page', '1');
    router.push(`/shop/products?${params}`);
  };

  const handlePageChange = (newPage) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(newPage));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    router.push(`/shop/products?${params}`);
  };

  const toggleBrandExpand = (brandName) => {
    setExpandedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brandName)) {
        next.delete(brandName);
      } else {
        next.add(brandName);
      }
      return next;
    });
  };

  const getSortLabel = (sortValue) => {
    switch (sortValue) {
      case 'newest':
        return '最新上架';
      case 'price_asc':
        return '價格低到高';
      case 'price_desc':
        return '價格高到低';
      default:
        return '最新上架';
    }
  };

  return (
    <div className="products-page-wrapper">
      {/* Filter Sidebar */}
      <aside className={`filter-sidebar ${filterOpen ? 'active' : ''}`}>
        <div className="filter-group">
          <button
            className="filter-group-title"
            onClick={() => setFilterOpen(false)}
            style={{ display: 'none', marginBottom: '1rem' }}
          >
            ✕ 關閉篩選
          </button>

          {/* Brand Filter */}
          <div>
            <div className="filter-group-title">品牌</div>
            <div className="filter-items">
              {BRANDS.map((b) => (
                <label key={b} className="filter-item">
                  <input
                    type="checkbox"
                    className="filter-checkbox"
                    checked={brand === b}
                    onChange={() => handleBrandFilter(b)}
                  />
                  <span className="filter-label">{b}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="filter-group">
            <div className="filter-group-title">分類</div>
            {categories.map((b) => (
              <div key={b.name} style={{ marginBottom: '1rem' }}>
                <button
                  className="filter-group-title"
                  onClick={() => toggleBrandExpand(b.name)}
                  style={{
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  {b.name} {expandedBrands.has(b.name) ? '▼' : '▶'}
                </button>
                {expandedBrands.has(b.name) && (
                  <div className="filter-items category-subcategory">
                    {b.categories.map((cat) => (
                      <label key={cat.name} className="filter-item">
                        <input
                          type="checkbox"
                          className="filter-checkbox"
                          checked={category === cat.name}
                          onChange={() => handleCategoryFilter(cat.name)}
                        />
                        <span className="filter-label">{cat.name}</span>
                        <span className="filter-count">({cat.count})</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Price Filter */}
        <div className="filter-group">
          <div className="filter-group-title">價格範圍</div>
          <div className="filter-items">
            {PRICE_RANGES.map((range) => (
              <label key={range.label} className="filter-item">
                <input
                  type="radio"
                  name="price"
                  className="filter-checkbox"
                  checked={priceRange === `${range.min}-${range.max}`}
                  onChange={() => {
                    const params = new URLSearchParams(searchParams);
                    if (range.max === Infinity) {
                      params.set('priceRange', `${range.min}-999999`);
                    } else {
                      params.set('priceRange', `${range.min}-${range.max}`);
                    }
                    params.set('page', '1');
                    router.push(`/shop/products?${params}`);
                  }}
                />
                <span className="filter-label">{range.label}</span>
              </label>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="products-main">
        {/* Search Bar */}
        <div className="search-bar-wrapper">
          <input
            type="text"
            placeholder="搜尋商品名稱或編號..."
            className="search-bar"
            defaultValue={q}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch(e.target.value);
              }
            }}
            onBlur={(e) => {
              if (e.target.value !== q) {
                handleSearch(e.target.value);
              }
            }}
          />
        </div>

        {/* Controls */}
        <div className="products-controls">
          <div className="products-count">
            {loading ? '載入中...' : `找到 ${totalCount.toLocaleString()} 件商品`}
          </div>
          <div>
            <select
              className="sort-select"
              value={sort}
              onChange={(e) => handleSortChange(e.target.value)}
            >
              <option value="newest">最新上架</option>
              <option value="price_asc">價格低到高</option>
              <option value="price_desc">價格高到低</option>
            </select>
          </div>
        </div>

        {/* Products Grid */}
        {loading ? (
          <div className="loading-state">
            <span className="loading-message">
              <div className="loading-spinner"></div>
              載入中...
            </span>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-state-icon">⚠️</div>
            <div className="empty-state-title">載入錯誤</div>
            <div className="empty-state-text">{error}</div>
          </div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-title">找不到商品</div>
            <div className="empty-state-text">
              嘗試調整搜尋條件或篩選條件
            </div>
          </div>
        ) : (
          <div className="products-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="pagination-btn"
              disabled={page === 1}
              onClick={() => handlePageChange(page - 1)}
            >
              ← 上一頁
            </button>
            <div style={{ padding: '0.5rem 1rem', alignSelf: 'center', fontSize: '14px', color: '#64748b' }}>
              第 {page} / {totalPages} 頁
            </div>
            <button
              className="pagination-btn"
              disabled={page >= totalPages}
              onClick={() => handlePageChange(page + 1)}
            >
              下一頁 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <main className="shop-container">
      <Suspense fallback={<div className="loading-state"><span className="loading-message">載入中...</span></div>}>
        <ProductsContent />
      </Suspense>
    </main>
  );
}
