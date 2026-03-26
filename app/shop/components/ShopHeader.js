'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from './CartProvider';

const CATEGORIES = [
  { name: '棘輪扳手 & 套筒', slug: '棘輪扳手 & 套筒' },
  { name: '扳手', slug: '扳手' },
  { name: '螺絲起子', slug: '螺絲起子' },
  { name: '鉗子', slug: '鉗子' },
  { name: '工具箱/收納', slug: '工具箱/收納' },
  { name: '電動工具', slug: '電動工具' },
  { name: '氣動工具', slug: '氣動工具' },
  { name: '診斷設備', slug: '診斷設備' },
];

const BRANDS = [
  { name: 'Snap-on', slug: 'Snap-on' },
  { name: 'Blue Point', slug: '美國藍點' },
  { name: 'BAHCO', slug: 'BAHCO' },
  { name: 'OTC', slug: 'OTC' },
  { name: 'Muc-Off', slug: 'Muc-Off' },
];

export default function ShopHeader() {
  const router = useRouter();
  const { totalItems } = useCart();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      router.push(`/shop/products?q=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
      setMobileMenuOpen(false);
    }
  };

  const handleSearchClick = () => {
    if (searchQuery.trim()) {
      router.push(`/shop/products?q=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
      setMobileMenuOpen(false);
    }
  };

  const handleCartClick = () => {
    router.push('/shop/cart');
    setMobileMenuOpen(false);
  };

  const toggleDropdown = (name) => {
    setOpenDropdown(openDropdown === name ? null : name);
  };

  const handleCategorySelect = (slug) => {
    router.push(`/shop/products?category=${encodeURIComponent(slug)}`);
    setMobileMenuOpen(false);
  };

  const handleBrandSelect = (slug) => {
    router.push(`/shop/products?brand=${encodeURIComponent(slug)}`);
    setMobileMenuOpen(false);
  };

  return (
    <header className="shop-header-container">
      {/* Top Utility Bar */}
      <div className="header-utility-bar">
        <div className="header-utility-content">
          <a href="#" className="header-utility-link">品牌介紹</a>
          <span className="header-utility-separator">|</span>
          <a href="#" className="header-utility-link">保固說明</a>
          <span className="header-utility-separator">|</span>
          <a href="#" className="header-utility-link">聯絡我們</a>
        </div>
      </div>

      {/* Main Header */}
      <div className="header-main">
        <div className="header-main-content">
          {/* Logo */}
          <a href="/shop" className="header-logo-snapon">
            <div className="header-logo-text">QuickBuy<br/>Tools</div>
          </a>

          {/* Search Bar */}
          <div className="header-search-wrapper">
            <div className="search-box-snapon">
              <input
                type="text"
                placeholder="搜尋產品名稱或料號..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleSearchKeyPress}
                className="search-input-snapon"
                aria-label="搜尋商品"
              />
              <button
                onClick={handleSearchClick}
                className="search-button-snapon"
                aria-label="搜尋"
              >
                🔍
              </button>
            </div>
          </div>

          {/* Right Section - Cart & Mobile Menu */}
          <div className="header-actions">
            <button
              onClick={handleCartClick}
              className="header-cart-button"
              aria-label={`購物車 (${totalItems} 項商品)`}
            >
              🛒
              {totalItems > 0 && (
                <span className="header-cart-badge">{totalItems > 99 ? '99+' : totalItems}</span>
              )}
            </button>

            <button
              className="header-mobile-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="開啟選單"
              aria-expanded={mobileMenuOpen}
            >
              ☰
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Bar */}
      <nav className={`header-nav ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="header-nav-content">
          {/* Home Link */}
          <a href="/shop" className="header-nav-item">
            首頁
          </a>

          {/* Products Dropdown */}
          <div className="header-nav-dropdown-wrapper">
            <button
              className="header-nav-item header-nav-dropdown-trigger"
              onClick={() => toggleDropdown('products')}
            >
              製品情報 <span className="dropdown-arrow">▼</span>
            </button>
            {(openDropdown === 'products' || typeof window !== 'undefined' && window.innerWidth > 768) && (
              <div className="header-nav-dropdown-menu">
                <div className="dropdown-menu-content">
                  {CATEGORIES.map((cat) => (
                    <a
                      key={cat.slug}
                      href={`/shop/products?category=${encodeURIComponent(cat.slug)}`}
                      className="dropdown-menu-item"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {cat.name}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Brands Dropdown */}
          <div className="header-nav-dropdown-wrapper">
            <button
              className="header-nav-item header-nav-dropdown-trigger"
              onClick={() => toggleDropdown('brands')}
            >
              品牌專區 <span className="dropdown-arrow">▼</span>
            </button>
            {(openDropdown === 'brands' || typeof window !== 'undefined' && window.innerWidth > 768) && (
              <div className="header-nav-dropdown-menu">
                <div className="dropdown-menu-content">
                  {BRANDS.map((brand) => (
                    <a
                      key={brand.slug}
                      href={`/shop/products?brand=${encodeURIComponent(brand.slug)}`}
                      className="dropdown-menu-item"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {brand.name}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* News Link */}
          <a href="/shop" className="header-nav-item">
            最新消息
          </a>

          {/* FAQ Link */}
          <a href="/shop" className="header-nav-item">
            常見問題
          </a>

          {/* LINE Link */}
          <a href="https://line.me/R/ti/p/@quickbuy" className="header-nav-item" target="_blank" rel="noopener noreferrer">
            LINE 聯絡
          </a>
        </div>
      </nav>
    </header>
  );
}
