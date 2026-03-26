'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '../../components/CartProvider';


function formatPrice(price) {
  return `NT$${price.toLocaleString('zh-TW')}`;
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addToCart } = useCart();

  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addedToCart, setAddedToCart] = useState(false);

  const productId = params.id;

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        // Fetch all products to find the one with matching ID
        const res = await fetch(
          `/api/shop/products?limit=1000&page=1`
        );
        if (!res.ok) throw new Error('Failed to fetch product');
        const data = await res.json();

        const found = data.products?.find((p) => p.id.toString() === productId);
        if (!found) throw new Error('Product not found');

        setProduct(found);
      } catch (err) {
        console.error('Error fetching product:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (productId) {
      fetchProduct();
    }
  }, [productId]);

  const handleAddToCart = () => {
    if (product) {
      addToCart(product, quantity);
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    }
  };

  const handleQuantityChange = (value) => {
    const num = Math.max(1, Math.min(999, parseInt(value || '1', 10)));
    setQuantity(num);
  };

  if (loading) {
    return (
      <main className="shop-container">
        <div className="loading-state">
          <span className="loading-message">
            <div className="loading-spinner"></div>
            載入商品中...
          </span>
        </div>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="shop-container">
        <div className="empty-state">
          <div className="empty-state-icon">⚠️</div>
          <div className="empty-state-title">商品未找到</div>
          <div className="empty-state-text">
            {error || '無法找到您要查看的商品'}
          </div>
          <Link href="/shop/products" className="btn btn-primary">
            返回商品列表
          </Link>
        </div>
      </main>
    );
  }

  const [imageError, setImageError] = useState(false);

  return (
    <main className="shop-container">
      {/* Breadcrumb */}
      <div className="product-detail-breadcrumb">
        <Link href="/shop" className="breadcrumb-item">
          首頁
        </Link>
        <span className="breadcrumb-separator">/</span>
        <Link href="/shop/products" className="breadcrumb-item">
          產品
        </Link>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-item">
          {product.category || '其他'}
        </span>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-item active">{product.item_number}</span>
      </div>

      {/* Product Detail - Two Column */}
      <div className="product-detail-section">
        {/* Left: Image */}
        <div className="product-detail-image-column">
          <div className="product-detail-image-container">
            {!imageError && product.image_url ? (
              <img
                src={product.image_url}
                alt={product.description}
                className="product-detail-main-image"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="product-image-placeholder">🔧</div>
            )}
            {product.product_status === 'New Announced' && (
              <div className="product-detail-badge">新品</div>
            )}
          </div>
        </div>

        {/* Right: Info */}
        <div className="product-detail-info-column">
          <div className="product-detail-model-number">
            {product.item_number}
          </div>
          <h1 className="product-detail-title">
            {product.description}
          </h1>

          {/* Price & Spec Table */}
          <table className="product-detail-spec-table">
            <tbody>
              <tr>
                <td className="spec-label">產品編號</td>
                <td className="spec-value">{product.item_number}</td>
              </tr>
              <tr>
                <td className="spec-label">售價（含稅）</td>
                <td className="spec-value price">{formatPrice(product.tw_retail_price)}</td>
              </tr>
              {product.category && (
                <tr>
                  <td className="spec-label">規格</td>
                  <td className="spec-value">{product.category}</td>
                </tr>
              )}
              {product.origin_country && (
                <tr>
                  <td className="spec-label">其他</td>
                  <td className="spec-value">{product.origin_country}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Quantity Selector */}
          <div className="product-detail-quantity-section">
            <span className="quantity-label">數量</span>
            <div className="quantity-controls">
              <button
                className="quantity-btn"
                onClick={() => handleQuantityChange(quantity - 1)}
              >
                −
              </button>
              <input
                type="number"
                className="quantity-input"
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                min="1"
                max="999"
              />
              <button
                className="quantity-btn"
                onClick={() => handleQuantityChange(quantity + 1)}
              >
                +
              </button>
            </div>
          </div>

          {/* Success Message */}
          {addedToCart && (
            <div className="product-detail-success">
              ✓ 已加入購物車
            </div>
          )}

          {/* CTA Buttons */}
          <div className="product-detail-actions">
            <button
              onClick={handleAddToCart}
              className="btn btn-primary btn-lg"
            >
              加入購物車
            </button>
            <a
              href="https://line.me/R/ti/p/@quickbuy"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-lg"
            >
              LINE 詢問
            </a>
          </div>
        </div>
      </div>

      {/* Additional Specifications */}
      <section className="product-detail-additional-specs">
        <h2 className="product-detail-spec-heading">詳細規格</h2>
        <table className="product-detail-full-specs">
          <thead>
            <tr>
              <th>規格項目</th>
              <th>規格值</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>商品編號</td>
              <td>{product.item_number}</td>
            </tr>
            <tr>
              <td>商品名稱</td>
              <td>{product.description}</td>
            </tr>
            <tr>
              <td>分類</td>
              <td>{product.category || '未分類'}</td>
            </tr>
            <tr>
              <td>狀態</td>
              <td>
                {product.product_status === 'New Announced' ? (
                  <span style={{ color: '#dc2626', fontWeight: '600' }}>
                    新品上市
                  </span>
                ) : (
                  '現貨供應'
                )}
              </td>
            </tr>
            <tr>
              <td>零售價</td>
              <td>{formatPrice(product.tw_retail_price)}</td>
            </tr>
            {product.origin_country && (
              <tr>
                <td>原產地</td>
                <td>{product.origin_country}</td>
              </tr>
            )}
            {product.weight_kg && (
              <tr>
                <td>重量</td>
                <td>{product.weight_kg} kg</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Back Link */}
      <div className="product-detail-back">
        <Link href="/shop/products" className="btn btn-outline">
          ← 返回商品列表
        </Link>
      </div>
    </main>
  );
}
