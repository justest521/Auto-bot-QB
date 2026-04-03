'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Brand data
const BRANDS = [
  { name: 'Snap-on', slug: 'Snap-on', color: '#ED1C24' },
  { name: 'BAHCO', slug: 'BAHCO', color: '#FF6B35' },
  { name: 'Blue Point', slug: '美國藍點', color: '#1E40AF' },
  { name: 'Bosch', slug: 'Bosch', color: '#1F2937' },
  { name: 'OTC Tools', slug: 'OTC', color: '#7C3AED' },
  { name: 'Muc-Off', slug: 'Muc-Off', color: '#059669' },
];

// Categories - using real categories from DB
const CATEGORIES = [
  { name: '套筒系列', slug: 'Snap-on 套筒系列' },
  { name: '扳手系列', slug: 'Snap-on 扳手系列' },
  { name: '工具車', slug: 'Snap-on 工具車' },
  { name: '系統櫃', slug: 'Snap-on 系統櫃' },
  { name: '鉗子系列', slug: 'BAHCO 鉗子系列' },
  { name: '起子系列', slug: 'BAHCO 起子系列' },
];

// Service cards data
const SERVICE_CARDS = [
  {
    id: 1,
    title: '經銷合作',
    description: '成為授權經銷商',
    icon: 'partnership', // SVG icon name
  },
  {
    id: 2,
    title: '保固服務',
    description: '專業的產品保固',
    icon: 'warranty',
  },
  {
    id: 3,
    title: 'LINE 即時諮詢',
    description: '專業團隊隨時服務',
    icon: 'chat',
  },
];

// Icon components - SVG based, no emoji
function IconPartnership() {
  return (
    <svg className="qb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconWarranty() {
  return (
    <svg className="qb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg className="qb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg className="qb-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg className="qb-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconTrendingUp() {
  return (
    <svg className="qb-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 17" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

// Hero Banner Component
function HeroBanner() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/shop/products?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const quickSearchTags = ['Snap-on', 'BAHCO', '藍點工具', '診斷設備'];

  return (
    <section className="qb-hero">
      <div className="qb-hero-container">
        <div className="qb-hero-content">
          <h1 className="qb-hero-title">
            一站購齊
            <br />
            專業工具與設備
          </h1>
          <p className="qb-hero-subtitle">
            台灣官方授權代理 Snap-on、BAHCO、Blue Point、Bosch、OTC Tools、Muc-Off
            <br />
            提供超過 122,000 項商品，品質保證、快速出貨
          </p>

          <form onSubmit={handleSearch} className="qb-search-form">
            <div className="qb-search-input-wrapper">
              <input
                type="text"
                className="qb-search-input"
                placeholder="搜尋商品名稱、型號或品牌..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="qb-search-button">
                <IconSearch />
                <span>搜尋</span>
              </button>
            </div>
          </form>

          <div className="qb-quick-search">
            <span className="qb-quick-label">快速搜尋:</span>
            <div className="qb-quick-tags">
              {quickSearchTags.map((tag) => (
                <Link
                  key={tag}
                  href={`/shop/products?q=${encodeURIComponent(tag)}`}
                  className="qb-quick-tag"
                >
                  {tag}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Stats Row Component
function StatsRow() {
  const [stats, setStats] = useState({
    products: 122483,
    brands: 6,
    categories: 74,
    years: 25,
  });

  return (
    <section className="qb-stats">
      <div className="qb-container">
        <div className="qb-stats-grid">
          <div className="qb-stat-card">
            <div className="qb-stat-icon-wrapper">
              <IconTrendingUp />
            </div>
            <div className="qb-stat-value">122,000+</div>
            <div className="qb-stat-label">全站商品</div>
          </div>

          <div className="qb-stat-card">
            <div className="qb-stat-icon-wrapper">
              <svg className="qb-stat-icon" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <div className="qb-stat-value">{stats.brands}</div>
            <div className="qb-stat-label">代理品牌</div>
          </div>

          <div className="qb-stat-card">
            <div className="qb-stat-icon-wrapper">
              <svg className="qb-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </div>
            <div className="qb-stat-value">{stats.categories}</div>
            <div className="qb-stat-label">商品分類</div>
          </div>

          <div className="qb-stat-card">
            <div className="qb-stat-icon-wrapper">
              <svg className="qb-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
              </svg>
            </div>
            <div className="qb-stat-value">25+</div>
            <div className="qb-stat-label">服務年資</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Brand Showcase Component
function BrandShowcase() {
  return (
    <section className="qb-brands">
      <div className="qb-container">
        <h2 className="qb-section-title">代理品牌</h2>
        <p className="qb-section-subtitle">全球頂級工具品牌，品質保證</p>

        <div className="qb-brands-grid">
          {BRANDS.map((brand) => (
            <Link
              key={brand.slug}
              href={`/shop/products?brand=${encodeURIComponent(brand.slug)}`}
              className="qb-brand-card"
              style={{ '--brand-color': brand.color }}
            >
              <div className="qb-brand-logo">{brand.name}</div>
              <div className="qb-brand-hover">
                瀏覽 {brand.name} 商品
                <IconChevronRight />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// Category Grid Component
function CategoryGrid() {
  return (
    <section className="qb-categories">
      <div className="qb-container">
        <h2 className="qb-section-title">熱門分類</h2>
        <p className="qb-section-subtitle">找到你需要的工具</p>

        <div className="qb-category-grid">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              href={`/shop/products?category=${encodeURIComponent(cat.slug)}`}
              className="qb-category-card"
            >
              <div className="qb-category-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
              </div>
              <h3 className="qb-category-name">{cat.name}</h3>
              <div className="qb-category-arrow">
                <IconChevronRight />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// New Products Carousel Component
function NewProductsCarousel() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await fetch('/api/shop/products?status=New Announced&limit=12&page=1&sort=newest');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setProducts(data.products || []);
      } catch (err) {
        console.error('Error fetching new products:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  if (loading) {
    return (
      <section className="qb-new-products">
        <div className="qb-container">
          <h2 className="qb-section-title">新品上市</h2>
          <p className="qb-section-subtitle">最新推出的工具和設備</p>
          <div className="qb-loading">載入中...</div>
        </div>
      </section>
    );
  }

  if (products.length === 0) {
    return null;
  }

  return (
    <section className="qb-new-products">
      <div className="qb-container">
        <h2 className="qb-section-title">新品上市</h2>
        <p className="qb-section-subtitle">最新推出的工具和設備</p>

        <div className="qb-products-carousel">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/shop/products/${product.id}`}
              className="qb-product-card"
            >
              <div className="qb-product-image">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.description}
                    loading="lazy"
                  />
                ) : (
                  <div className="qb-product-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    </svg>
                  </div>
                )}
                {product.product_status === 'New Announced' && (
                  <div className="qb-product-badge">新品</div>
                )}
              </div>

              <div className="qb-product-info">
                <div className="qb-product-number">{product.item_number}</div>
                <h4 className="qb-product-title">{product.description}</h4>
                <div className="qb-product-price">
                  NT${(product.tw_retail_price || 0).toLocaleString('zh-TW')}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// Service Cards Component
function ServiceSection() {
  return (
    <section className="qb-services">
      <div className="qb-container">
        <h2 className="qb-section-title">我們提供的服務</h2>

        <div className="qb-service-grid">
          {SERVICE_CARDS.map((service) => {
            let IconComponent = null;
            if (service.icon === 'partnership') {
              IconComponent = IconPartnership;
            } else if (service.icon === 'warranty') {
              IconComponent = IconWarranty;
            } else if (service.icon === 'chat') {
              IconComponent = IconChat;
            }

            return (
              <div key={service.id} className="qb-service-card">
                <div className="qb-service-icon">
                  {IconComponent && <IconComponent />}
                </div>
                <h3 className="qb-service-title">{service.title}</h3>
                <p className="qb-service-description">{service.description}</p>
                <div className="qb-service-arrow">
                  <IconChevronRight />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// CTA Banner Component
function CTABanner() {
  return (
    <section className="qb-cta-banner">
      <div className="qb-container">
        <div className="qb-cta-content">
          <h2 className="qb-cta-title">成為我們的經銷合作夥伴</h2>
          <p className="qb-cta-subtitle">
            加入台灣最信賴的專業工具經銷商，獲得獨家支援和優惠
          </p>
          <div className="qb-cta-buttons">
            <Link href="#contact" className="qb-cta-primary">
              聯絡我們
            </Link>
            <Link href="/shop/products" className="qb-cta-secondary">
              瀏覽全部商品
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// Main Export
export default function ShopHome() {
  return (
    <main className="qb-shop-home">
      <HeroBanner />
      <StatsRow />
      <BrandShowcase />
      <CategoryGrid />
      <NewProductsCarousel />
      <ServiceSection />
      <CTABanner />
    </main>
  );
}
