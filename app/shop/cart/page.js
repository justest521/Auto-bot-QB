'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCart } from '../components/CartProvider';


function formatPrice(price) {
  return `NT$${price.toLocaleString('zh-TW')}`;
}

export default function CartPage() {
  const { cart, removeFromCart, updateQuantity, getCartTotal } = useCart();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <main className="shop-container">
        <div className="loading-state">
          <span className="loading-message">
            <div className="loading-spinner"></div>
            載入購物車中...
          </span>
        </div>
      </main>
    );
  }

  if (cart.length === 0) {
    return (
      <main className="shop-container">
        <h1 style={{ marginBottom: '2rem', fontSize: '1.875rem', fontWeight: 700 }}>
          購物車
        </h1>
        <div className="cart-empty">
          <div className="cart-empty-icon">🛒</div>
          <div className="cart-empty-title">購物車是空的</div>
          <div className="cart-empty-text">
            還沒有選擇任何商品，趕快去瀏覽我們的優質商品吧！
          </div>
          <Link href="/shop/products" className="btn btn-primary btn-lg">
            瀏覽商品
          </Link>
        </div>
      </main>
    );
  }

  const subtotal = getCartTotal();
  const shipping = subtotal > 0 ? 0 : 0; // Free shipping example
  const total = subtotal + shipping;

  return (
    <main className="shop-container">
      <h1 style={{ marginBottom: '2rem', fontSize: '1.875rem', fontWeight: 700 }}>
        購物車
      </h1>

      <div className="cart-wrapper">
        {/* Cart Items */}
        <div className="cart-items">
          {cart.map((item) => (
            <div key={item.id} className="cart-item">
              <div className="cart-item-image">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.description} />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#f3f4f6',
                      fontSize: '1.5rem',
                    }}
                  >
                    🔧
                  </div>
                )}
              </div>

              <div className="cart-item-details">
                <div className="cart-item-name">{item.description}</div>
                <div className="cart-item-number">
                  編號: {item.item_number}
                </div>
                <div className="cart-item-price">
                  {formatPrice(item.tw_retail_price)}
                </div>

                <div className="cart-item-quantity">
                  <span className="cart-item-quantity-label">數量:</span>
                  <div className="cart-item-quantity-controls">
                    <button
                      className="cart-item-quantity-btn"
                      onClick={() =>
                        updateQuantity(item.id, item.quantity - 1)
                      }
                    >
                      −
                    </button>
                    <input
                      type="number"
                      className="cart-item-quantity-input"
                      value={item.quantity}
                      onChange={(e) => {
                        const val = Math.max(
                          1,
                          Math.min(999, parseInt(e.target.value || '1', 10))
                        );
                        updateQuantity(item.id, val);
                      }}
                      min="1"
                      max="999"
                    />
                    <button
                      className="cart-item-quantity-btn"
                      onClick={() =>
                        updateQuantity(item.id, item.quantity + 1)
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="cart-item-actions">
                <div className="cart-item-subtotal">
                  {formatPrice(
                    item.tw_retail_price * item.quantity
                  )}
                </div>
                <button
                  className="cart-item-remove"
                  onClick={() => removeFromCart(item.id)}
                >
                  移除
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Cart Summary */}
        <div className="cart-summary">
          <div className="cart-summary-title">訂單摘要</div>

          <div className="cart-summary-row">
            <span className="cart-summary-label">小計</span>
            <span className="cart-summary-value">
              {formatPrice(subtotal)}
            </span>
          </div>

          <div className="cart-summary-row">
            <span className="cart-summary-label">運費</span>
            <span className="cart-summary-value">
              {shipping === 0 ? '免運' : formatPrice(shipping)}
            </span>
          </div>

          <div className="cart-summary-total">
            <span>總計</span>
            <span className="cart-summary-total-amount">
              {formatPrice(total)}
            </span>
          </div>

          <div className="cart-actions">
            <Link
              href="/shop/checkout"
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
            >
              前往結帳
            </Link>
            <Link
              href="/shop/products"
              className="btn btn-outline"
              style={{
                width: '100%',
                color: '#1f2937',
                borderColor: '#1f2937',
              }}
            >
              繼續購物
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
