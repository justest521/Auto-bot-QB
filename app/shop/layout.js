'use client';

import './shop.css';
import { CartProvider } from './components/CartProvider';
import ShopHeader from './components/ShopHeader';

export default function ShopLayout({ children }) {
  return (
    <CartProvider>
      <div className="shop-wrapper">
        {/* Header with search & cart */}
        <ShopHeader />

        {/* Main Content */}
        <main className="shop-main" style={{ minHeight: '60vh', backgroundColor: '#ffffff' }}>
          {children}
        </main>

        {/* Shop Footer - Snap-on Japan Style */}
        <footer className="shop-footer">
          <div className="footer-content">
            {/* Column 1: Company Info */}
            <div className="footer-column">
              <h3 className="footer-column-title">QuickBuy Tools</h3>
              <p className="footer-column-text">
                台灣 Snap-on、Blue Point 官方授權經銷商。提供專業工具、設備與服務。
              </p>
              <div className="footer-social">
                <a href="https://line.me/R/ti/p/@quickbuy" title="LINE" className="footer-social-link">LINE</a>
              </div>
            </div>

            {/* Column 2: Product & Service */}
            <div className="footer-column">
              <h3 className="footer-column-title">產品與服務</h3>
              <ul className="footer-link-list">
                <li><a href="/shop/products" className="footer-link">全部商品</a></li>
                <li><a href="/shop/products?category=棘輪扳手 & 套筒" className="footer-link">棘輪扳手</a></li>
                <li><a href="/shop/products?category=扳手" className="footer-link">扳手</a></li>
                <li><a href="/shop/products?category=螺絲起子" className="footer-link">螺絲起子</a></li>
                <li><a href="/shop/products?category=診斷設備" className="footer-link">診斷設備</a></li>
              </ul>
            </div>

            {/* Column 3: Brand */}
            <div className="footer-column">
              <h3 className="footer-column-title">品牌</h3>
              <ul className="footer-link-list">
                <li><a href="/shop/products?brand=Snap-on" className="footer-link">Snap-on</a></li>
                <li><a href="/shop/products?brand=美國藍點" className="footer-link">Blue Point</a></li>
                <li><a href="/shop/products?brand=BAHCO" className="footer-link">BAHCO</a></li>
                <li><a href="/shop/products?brand=OTC" className="footer-link">OTC</a></li>
                <li><a href="/shop/products?brand=Muc-Off" className="footer-link">Muc-Off</a></li>
              </ul>
            </div>

            {/* Column 4: Support & Contact */}
            <div className="footer-column">
              <h3 className="footer-column-title">顧客支援</h3>
              <ul className="footer-link-list">
                <li><a href="#" className="footer-link">聯絡我們</a></li>
                <li><a href="#" className="footer-link">常見問題</a></li>
                <li><a href="#" className="footer-link">保固說明</a></li>
                <li><a href="#" className="footer-link">維修校正</a></li>
              </ul>
              <div style={{ marginTop: '16px', fontSize: '12px', color: '#999' }}>
                營業時間: 週一～週五 09:00-18:00<br/>
                Email: support@quickbuy.tw
              </div>
            </div>
          </div>

          <div className="footer-divider"></div>
          <div className="footer-bottom">
            <div className="footer-copyright">
              © 2026 QuickBuy Tools. All rights reserved. | Snap-on, Blue Point are registered trademarks.
            </div>
          </div>
        </footer>
      </div>
    </CartProvider>
  );
}
