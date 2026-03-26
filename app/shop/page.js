'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const CATEGORIES = [
  { name: '棘輪扳手 & 套筒', slug: '棘輪扳手 & 套筒', icon: '🔧' },
  { name: '扳手', slug: '扳手', icon: '🔨' },
  { name: '螺絲起子', slug: '螺絲起子', icon: '🪛' },
  { name: '鉗子', slug: '鉗子', icon: '🔩' },
  { name: '工具箱/收納', slug: '工具箱/收納', icon: '📦' },
  { name: '電動工具', slug: '電動工具', icon: '⚡' },
  { name: '氣動工具', slug: '氣動工具', icon: '💨' },
  { name: '診斷設備', slug: '診斷設備', icon: '📊' },
];

const BRANDS = ['Snap-on', 'Blue Point', 'BAHCO', 'OTC'];

const SERVICE_CARDS = [
  { title: '加盟經銷', icon: '🤝' },
  { title: '產品型錄', icon: '📋' },
  { title: '品牌專區', icon: '🏪' },
  { title: 'LINE 諮詢', icon: '💬' },
  { title: '保固服務', icon: '✓' },
  { title: '維修校正', icon: '🔧' },
];

const NEWS_ITEMS = [
  { date: '2026.03.26', title: '新品上市：Snap-on 最新棘輪扳手系列', category: ' 新商品' },
  { date: '2026.03.20', title: '春季優惠活動開始', category: '優惠資訊' },
  { date: '2026.03.15', title: '維修校正服務擴大範圍', category: '服務更新' },
  { date: '2026.03.10', title: 'Blue Point 專業級工具組合折扣', category: '優惠資訊' },
  { date: '2026.03.05', title: '新會員註冊享首購優惠', category: '會員優惠' },
];

function formatPrice(price) {
  return `NT$${price.toLocaleString('zh-TW')}`;
}

function HeroSlider() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      gradient: 'linear-gradient(135deg, #ED1C24 0%, #C71419 100%)',
      heading: 'Snap-on 專業工具',
      subheading: '台灣官方授權經銷商',
    },
    {
      gradient: 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)',
      heading: '品質保證',
      subheading: '正品行貨 快速出貨',
    },
    {
      gradient: 'linear-gradient(135deg, #ED1C24 0%, #333333 100%)',
      heading: 'LINE 諮詢',
      subheading: '專業團隊隨時為您服務',
    },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="home-hero-slider">
      {slides.map((slide, idx) => (
        <div
          key={idx}
          className={`hero-slide ${idx === currentSlide ? 'active' : ''}`}
          style={{ background: slide.gradient }}
        >
          <div className="hero-slide-content">
            <h1 className="hero-slide-heading">{slide.heading}</h1>
            <p className="hero-slide-subheading">{slide.subheading}</p>
            <Link href="/shop/products" className="hero-slide-cta">
              商品一覽 →
            </Link>
          </div>
        </div>
      ))}

      <div className="hero-slider-dots">
        {slides.map((_, idx) => (
          <button
            key={idx}
            className={`hero-slider-dot ${idx === currentSlide ? 'active' : ''}`}
            onClick={() => setCurrentSlide(idx)}
            aria-label={`スライド ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceCardsSection() {
  return (
    <section className="home-service-cards">
      <div className="shop-container">
        <div className="service-cards-grid">
          {SERVICE_CARDS.map((card, idx) => (
            <div key={idx} className="service-card">
              <div className="service-card-icon">{card.icon}</div>
              <div className="service-card-title">{card.title}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NewsSection() {
  return (
    <section className="home-section">
      <div className="shop-container">
        <div className="section-heading">
          <div className="section-heading-en">NEWS & INFORMATION</div>
          <h2 className="section-heading-ja">最新消息</h2>
          <div className="section-heading-line"></div>
        </div>

        <div className="news-list">
          {NEWS_ITEMS.map((item, idx) => (
            <a key={idx} href="#" className="news-item">
              <div className="news-item-date">{item.date}</div>
              <div className="news-item-content">
                <span className="news-item-category">{item.category}</span>
                <span className="news-item-title">{item.title}</span>
              </div>
              <div className="news-item-arrow">→</div>
            </a>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <Link href="#" className="section-link">
            更多最新消息 →
          </Link>
        </div>
      </div>
    </section>
  );
}

function NewProductsSection() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNewProducts = async () => {
      try {
        const res = await fetch('/api/shop/products?status=New Announced&limit=10&page=1');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setProducts(data.products || []);
      } catch (err) {
        console.error('Error fetching products:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchNewProducts();
  }, []);

  if (loading || products.length === 0) return null;

  return (
    <section className="home-section">
      <div className="shop-container">
        <div className="section-heading">
          <div className="section-heading-en">NEW PRODUCTS</div>
          <h2 className="section-heading-ja">新品上市</h2>
          <div className="section-heading-line"></div>
        </div>

        <div className="home-products-carousel">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/shop/products/${product.id}`}
              className="home-product-card"
            >
              <div className="home-product-image">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.description} />
                ) : (
                  <div className="product-image-placeholder">🔧</div>
                )}
                {product.product_status === 'New Announced' && (
                  <div className="home-product-badge">新品</div>
                )}
              </div>
              <div className="home-product-info">
                <div className="home-product-number">{product.item_number}</div>
                <div className="home-product-desc">{product.description}</div>
                <div className="home-product-price">{formatPrice(product.tw_retail_price)}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductLineupSection() {
  return (
    <section className="home-section">
      <div className="shop-container">
        <div className="section-heading">
          <div className="section-heading-en">PRODUCT LINEUP</div>
          <h2 className="section-heading-ja">產品專區</h2>
          <div className="section-heading-line"></div>
        </div>

        <div className="home-lineup-grid">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              href={`/shop/products?category=${encodeURIComponent(cat.slug)}`}
              className="home-lineup-card"
            >
              <div className="home-lineup-icon">{cat.icon}</div>
              <div className="home-lineup-title">{cat.name}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function FamilyBrandsSection() {
  return (
    <section className="home-section" style={{ backgroundColor: '#f9f9f9' }}>
      <div className="shop-container">
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '24px', textAlign: 'center', color: '#333' }}>
          ファミリーブランド
        </h2>
        <div className="family-brands-row">
          {BRANDS.map((brand) => (
            <Link
              key={brand}
              href={`/shop/products?brand=${encodeURIComponent(brand === 'Blue Point' ? '美國藍點' : brand)}`}
              className="family-brand-item"
            >
              <span>{brand}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function InfoBlocksSection() {
  const infoBlocks = [
    { title: '產品購買方式', en: 'HOW TO BUY', icon: '🛍️' },
    { title: '維修與校正', en: 'REPAIR', icon: '🔧' },
    { title: 'LINE 即時諮詢', en: 'LINE SUPPORT', icon: '💬' },
  ];

  return (
    <section className="home-section">
      <div className="shop-container">
        <div className="home-info-blocks">
          {infoBlocks.map((block, idx) => (
            <a key={idx} href="#" className="info-block">
              <div className="info-block-icon">{block.icon}</div>
              <div className="info-block-en">{block.en}</div>
              <div className="info-block-title">{block.title}</div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function ShopHome() {
  return (
    <main>
      <HeroSlider />
      <ServiceCardsSection />
      <NewsSection />
      <NewProductsSection />
      <ProductLineupSection />
      <FamilyBrandsSection />
      <InfoBlocksSection />
    </main>
  );
}
