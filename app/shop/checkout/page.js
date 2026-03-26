'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCart } from '../components/CartProvider';


function formatPrice(price) {
  return `NT$${price.toLocaleString('zh-TW')}`;
}

function generateOrderNumber() {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
}

export default function CheckoutPage() {
  const { cart, getCartTotal, clearCart } = useCart();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    lineId: '',
    notes: '',
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successOrder, setSuccessOrder] = useState(null);

  useEffect(() => {
    if (cart.length === 0 && !successOrder) {
      // Redirect to products if cart is empty and no successful order
      if (typeof window !== 'undefined') {
        const timer = setTimeout(() => {
          window.location.href = '/shop/products';
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [cart, successOrder]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = '姓名為必填項';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = '電話為必填項';
    } else if (!/^[0-9\-+() ]{7,}$/.test(formData.phone)) {
      newErrors.phone = '請輸入有效的電話號碼';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = '請輸入有效的電子郵件地址';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const orderData = {
        customer: {
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          lineId: formData.lineId,
        },
        items: cart.map((item) => ({
          id: item.id,
          item_number: item.item_number,
          description: item.description,
          quantity: item.quantity,
          price: item.tw_retail_price,
          subtotal: item.tw_retail_price * item.quantity,
        })),
        notes: formData.notes,
        total: getCartTotal(),
      };

      const res = await fetch('/api/shop/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      if (!res.ok) {
        throw new Error('訂單提交失敗，請稍後重試');
      }

      const responseData = await res.json();
      const orderNumber = responseData.orderId || generateOrderNumber();

      setSuccessOrder(orderNumber);
      clearCart();
    } catch (err) {
      console.error('Order submission error:', err);
      setErrors({
        submit: err.message || '訂單提交失敗，請稍後重試',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLineInquiry = () => {
    const itemsList = cart
      .map((item) => `${item.item_number} - ${item.description} x${item.quantity}`)
      .join('\n');

    const message = `商品詢問：\n${itemsList}\n\n訂購人：${formData.name}\n電話：${formData.phone}`;
    const encodedMessage = encodeURIComponent(message);

    window.open(
      `https://line.me/ti/p/YOUR_LINE_ID`,
      '_blank'
    );
  };

  // Show empty state if cart is empty and no successful order
  if (cart.length === 0 && !successOrder) {
    return (
      <main className="shop-container">
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">購物車是空的</div>
          <div className="empty-state-text">
            3 秒後將返回商品列表...
          </div>
        </div>
      </main>
    );
  }

  // Show success state
  if (successOrder) {
    return (
      <main className="shop-container">
        <div className="checkout-success">
          <div className="checkout-success-icon">✓</div>
          <div className="checkout-success-title">感謝您的訂單！</div>
          <div className="checkout-success-message">
            我們已收到您的訂單，將盡快與您聯繫確認。
          </div>
          <div className="checkout-success-order-number">
            訂單編號: {successOrder}
          </div>
          <div style={{ marginTop: '1.5rem', fontSize: '0.95rem', color: '#065f46' }}>
            您將在 24 小時內收到訂單確認
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <Link href="/shop/products" className="btn btn-primary btn-lg">
            繼續購物
          </Link>
        </div>
      </main>
    );
  }

  const subtotal = getCartTotal();
  const shipping = 0;
  const total = subtotal + shipping;

  return (
    <main className="shop-container">
      <h1 style={{ marginBottom: '2rem', fontSize: '1.875rem', fontWeight: 700 }}>
        結帳
      </h1>

      <div className="checkout-wrapper">
        {/* Main Content */}
        <div className="checkout-main">
          {/* Order Review */}
          <div className="checkout-section">
            <h2 className="checkout-section-title">訂單摘要</h2>
            <div className="checkout-order-items">
              {cart.map((item) => (
                <div key={item.id} className="checkout-order-item">
                  <div className="checkout-order-item-image">
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
                          fontSize: '1.25rem',
                        }}
                      >
                        🔧
                      </div>
                    )}
                  </div>
                  <div className="checkout-order-item-info">
                    <div className="checkout-order-item-name">
                      {item.description}
                    </div>
                    <div className="checkout-order-item-details">
                      <span>{item.item_number}</span>
                      <span>數量: {item.quantity}</span>
                    </div>
                  </div>
                  <div className="checkout-order-item-price">
                    {formatPrice(item.tw_retail_price * item.quantity)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Customer Information Form */}
          <form onSubmit={handleSubmitOrder} className="checkout-section">
            <h2 className="checkout-section-title">訂購人資訊</h2>

            {errors.submit && (
              <div
                style={{
                  background: '#fee2e2',
                  border: '1px solid #dc2626',
                  color: '#991b1b',
                  padding: '1rem',
                  borderRadius: '0.375rem',
                  marginBottom: '1rem',
                }}
              >
                {errors.submit}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                姓名
                <span className="form-label-required">*</span>
              </label>
              <input
                type="text"
                name="name"
                className="form-input"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="請輸入您的姓名"
              />
              {errors.name && <div className="form-error">{errors.name}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">
                電話
                <span className="form-label-required">*</span>
              </label>
              <input
                type="tel"
                name="phone"
                className="form-input"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="例: 02-1234-5678 或 0912-345-678"
              />
              {errors.phone && <div className="form-error">{errors.phone}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">電子郵件</label>
              <input
                type="email"
                name="email"
                className="form-input"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="example@email.com"
              />
              {errors.email && <div className="form-error">{errors.email}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">LINE ID</label>
              <input
                type="text"
                name="lineId"
                className="form-input"
                value={formData.lineId}
                onChange={handleInputChange}
                placeholder="您的 LINE ID (選填)"
              />
            </div>

            <div className="form-group">
              <label className="form-label">備註說明</label>
              <textarea
                name="notes"
                className="form-textarea"
                value={formData.notes}
                onChange={handleInputChange}
                placeholder="如有特殊需求或備註，請在此說明..."
              ></textarea>
            </div>

            <div className="checkout-actions">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-primary btn-lg"
                style={{
                  width: '100%',
                  opacity: isSubmitting ? 0.7 : 1,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                {isSubmitting && <div className="loading-spinner"></div>}
                {isSubmitting ? '提交中...' : '送出訂單'}
              </button>

              <button
                type="button"
                onClick={handleLineInquiry}
                disabled={isSubmitting}
                className="btn btn-secondary btn-lg"
                style={{ width: '100%' }}
              >
                透過 LINE 詢問
              </button>

              <Link
                href="/shop/products"
                className="btn btn-outline"
                style={{
                  width: '100%',
                  color: '#1f2937',
                  borderColor: '#1f2937',
                  textAlign: 'center',
                }}
              >
                返回購物
              </Link>
            </div>
          </form>
        </div>

        {/* Order Summary Sidebar */}
        <div
          style={{
            background: '#f3f4f6',
            padding: '1.5rem',
            borderRadius: '0.5rem',
            height: 'fit-content',
            position: 'sticky',
            top: '1rem',
          }}
        >
          <div
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              marginBottom: '1rem',
              color: '#1f2937',
            }}
          >
            訂單金額
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '1rem 0',
              borderBottom: '1px solid #e5e7eb',
              fontSize: '0.95rem',
            }}
          >
            <span style={{ color: '#6b7280' }}>小計</span>
            <span style={{ fontWeight: 600, color: '#1f2937' }}>
              {formatPrice(subtotal)}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '1rem 0',
              borderBottom: '1px solid #e5e7eb',
              fontSize: '0.95rem',
            }}
          >
            <span style={{ color: '#6b7280' }}>運費</span>
            <span style={{ fontWeight: 600, color: '#1f2937' }}>
              {shipping === 0 ? '免運' : formatPrice(shipping)}
            </span>
          </div>

          <div
            style={{
              marginTop: '1rem',
              paddingTop: '1rem',
              borderTop: '2px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '1.25rem',
              fontWeight: 700,
              color: '#1f2937',
            }}
          >
            <span>總計</span>
            <span style={{ color: '#dc2626' }}>
              {formatPrice(total)}
            </span>
          </div>

          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              color: '#1e40af',
              textAlign: 'center',
            }}
          >
            提交訂單後，我們將盡快與您聯繫確認
          </div>
        </div>
      </div>
    </main>
  );
}
