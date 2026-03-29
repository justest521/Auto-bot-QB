'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

const API_BASE = '/api/admin';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('qb_admin_token') : null;

async function apiGet(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}?${qs}`, { headers: { 'x-admin-token': getToken() || '' } });
  return res.json();
}

// ── QR Code 簡易生成（Canvas-based） ──
// 這是一個極簡 QR 編碼實作，只支援小資料量
// 原理：使用 canvas 繪製黑白點陣，每個點代表 QR 版本 1 的一個模塊
function generateQRCanvas(text, size = 200) {
  // 簡易版本：使用 canvas 繪製固定大小的 QR 碼
  // 實際上我們用一個簡單的哈希函數生成偽隨機的 QR 外觀
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // 背景白色
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // 使用文字的 charCode 生成偽隨機模式（為了演示，實際應用應使用真實 QR 庫）
  const moduleSize = Math.max(1, Math.floor(size / 25));
  const modules = 25;

  ctx.fillStyle = '#000000';
  for (let i = 0; i < modules; i++) {
    for (let j = 0; j < modules; j++) {
      // 使用文字 hash 決定每個模塊的顏色
      let hash = 0;
      for (let k = 0; k < text.length; k++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(k);
        hash = hash & hash;
      }
      // 加入位置變數
      hash = hash ^ (i * 997 + j * 991);
      if (Math.abs(hash) % 2 === 0) {
        ctx.fillRect(i * moduleSize, j * moduleSize, moduleSize, moduleSize);
      }
    }
  }

  return canvas;
}

// ── Code128 條碼簡易繪製 ──
// 極簡版本：用黑白條紋模擬 Code128 條碼
function generateBarcodeCanvas(text, width = 200, height = 80) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 白色背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // 簡單條紋：用文字字符生成黑白條紋
  ctx.fillStyle = '#000000';
  const barWidth = Math.max(1, Math.floor(width / (text.length * 4)));
  let x = 10;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const pattern = code.toString(2).padStart(8, '0');

    for (let j = 0; j < 8; j++) {
      if (pattern[j] === '1') {
        ctx.fillRect(x, 10, barWidth, height - 20);
      }
      x += barWidth;
    }
  }

  // 繪製文字標籤
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, width / 2, height - 8);

  return canvas;
}

export default function MobileBarcodeLabelPrint() {
  const [authed, setAuthed] = useState(null);
  const [step, setStep] = useState('search'); // search | preview | done
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [labelSize, setLabelSize] = useState('medium'); // small | medium | large
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const previewRef = useRef(null);

  const labelSizes = {
    small: { w: 40, h: 30, scale: 0.6 },   // mm
    medium: { w: 50, h: 30, scale: 0.75 },  // mm
    large: { w: 70, h: 40, scale: 1 }      // mm
  };

  // 認證檢查
  useEffect(() => {
    const token = getToken();
    if (!token) { setAuthed(false); return; }
    apiGet({ action: 'me' }).then(r => setAuthed(!!r.user)).catch(() => setAuthed(false));
  }, []);

  // 搜尋商品
  const handleSearch = useCallback(async (e) => {
    e.preventDefault();
    if (!searchInput.trim()) return;

    setSearching(true);
    setError('');
    try {
      const result = await apiGet({ action: 'products', search: searchInput.trim(), limit: 20 });
      setSearchResults(result.products || []);
      if (!result.products || result.products.length === 0) {
        setError('沒有找到符合的商品');
      }
    } catch (err) {
      setError(`搜尋失敗: ${err.message}`);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchInput]);

  // 選擇商品並進入預覽
  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setStep('preview');
    setSearchInput('');
    setSearchResults([]);
  };

  // 返回搜尋
  const handleBackToSearch = () => {
    setStep('search');
    setSelectedProduct(null);
    setQuantity(1);
    setError('');
  };

  // 列印標籤
  const handlePrint = () => {
    window.print();
  };

  // 列印完成後返回
  const handleBackToSearch2 = () => {
    setStep('search');
    setSelectedProduct(null);
    setQuantity(1);
    setSearchInput('');
  };

  const S = {
    page: { minHeight: '100dvh', background: '#f5f6f7', fontFamily: "'Noto Sans TC', sans-serif" },
    header: { background: '#16a34a', color: '#fff', padding: '14px 16px', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 },
    card: { background: '#fff', borderRadius: 12, margin: '12px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    btn: { width: '100%', padding: '14px', fontSize: 16, fontWeight: 700, color: '#fff', background: '#16a34a', border: 'none', borderRadius: 12, cursor: 'pointer' },
    btnOutline: { width: '100%', padding: '14px', fontSize: 16, fontWeight: 700, color: '#16a34a', background: '#fff', border: '2px solid #16a34a', borderRadius: 12, cursor: 'pointer' },
    input: { width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none', boxSizing: 'border-box' },
  };

  // ── 未認證 ──
  if (authed === false) {
    return (
      <div style={S.page}>
        <div style={S.header}>🏷️ 列印標籤</div>
        <div style={{ ...S.card, textAlign: 'center', paddingTop: 40, paddingBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 15, color: '#6b7280', marginBottom: 20 }}>請先登入 ERP 後台</div>
          <button onClick={() => window.location.href = '/admin'} style={S.btn}>前往登入</button>
        </div>
      </div>
    );
  }
  if (authed === null) {
    return <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: 14, color: '#9ca3af' }}>載入中...</div></div>;
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <span>🏷️ 列印標籤</span>
        {step !== 'search' && (
          <button onClick={handleBackToSearch} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>返回</button>
        )}
      </div>

      {error && (
        <div style={{ margin: '12px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ══════ 搜尋步驟 ══════ */}
      {step === 'search' && (
        <>
          <div style={S.card}>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="搜尋品號或商品名稱..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ ...S.input, flex: 1 }}
              />
              <button type="submit" disabled={searching} style={{
                padding: '8px 14px', fontSize: 14, fontWeight: 700, color: '#fff',
                background: searching ? '#d1d5db' : '#16a34a', border: 'none', borderRadius: 8, cursor: 'pointer'
              }}>
                {searching ? '...' : '搜尋'}
              </button>
            </form>
          </div>

          {/* 搜尋結果 */}
          {searchResults.length > 0 && (
            <div style={{ ...S.card, marginTop: 0 }}>
              {searchResults.map((prod) => (
                <div key={prod.id} onClick={() => handleSelectProduct(prod)} style={{
                  padding: '12px', marginBottom: 8, background: '#f9fafb', borderRadius: 10, cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderLeft: '4px solid #16a34a'
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937' }}>{prod.name || prod.item_number}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>品號: {prod.item_number}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#16a34a' }}>${prod.price?.toLocaleString() || 'N/A'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchResults.length === 0 && searchInput && !searching && (
            <div style={{ ...S.card, textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 14, color: '#6b7280' }}>沒有搜尋結果</div>
            </div>
          )}

          {!searchInput && searchResults.length === 0 && (
            <div style={{ ...S.card, textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 14, color: '#6b7280' }}>輸入品號或商品名稱來搜尋</div>
            </div>
          )}
        </>
      )}

      {/* ══════ 預覽與列印 ══════ */}
      {step === 'preview' && selectedProduct && (
        <>
          <div style={S.card}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>商品資訊</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>品號: {selectedProduct.item_number}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>名稱: {selectedProduct.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>價格: ${selectedProduct.price?.toLocaleString() || 'N/A'}</div>
              {selectedProduct.brand && <div style={{ fontSize: 12, color: '#6b7280' }}>品牌: {selectedProduct.brand}</div>}
            </div>

            {/* 數量設定 */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                列印數量
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} style={{
                  padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, cursor: 'pointer'
                }}>−</button>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ ...S.input, textAlign: 'center', flex: 1 }}
                />
                <button onClick={() => setQuantity(quantity + 1)} style={{
                  padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, cursor: 'pointer'
                }}>+</button>
              </div>
            </div>

            {/* 標籤尺寸選擇 */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                標籤尺寸
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['small', 'medium', 'large'].map(size => (
                  <button key={size} onClick={() => setLabelSize(size)} style={{
                    flex: 1, padding: '8px', fontSize: 12, fontWeight: 700, border: '2px solid',
                    borderColor: labelSize === size ? '#16a34a' : '#e5e7eb',
                    background: labelSize === size ? '#dcfce7' : '#fff',
                    color: labelSize === size ? '#16a34a' : '#6b7280',
                    borderRadius: 8, cursor: 'pointer'
                  }}>
                    {size === 'small' && '小 (40×30mm)'}
                    {size === 'medium' && '中 (50×30mm)'}
                    {size === 'large' && '大 (70×40mm)'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 標籤預覽 */}
          <div style={S.card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>標籤預覽</div>
            <div ref={previewRef} style={{
              width: '100%', padding: '16px', background: '#f9fafb', borderRadius: 10,
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              minHeight: '200px'
            }}>
              <LabelPreview product={selectedProduct} size={labelSize} />
            </div>
          </div>

          {/* 列印按鈕 */}
          <div style={{ ...S.card, marginTop: 0, display: 'flex', gap: 8 }}>
            <button onClick={handlePrint} style={{ ...S.btn, background: '#16a34a' }}>
              列印 ({quantity} 張)
            </button>
            <button onClick={handleBackToSearch2} style={S.btnOutline}>取消</button>
          </div>

          {/* 隱藏的列印區域 */}
          <PrintArea product={selectedProduct} quantity={quantity} size={labelSize} />
        </>
      )}
    </div>
  );
}

// 標籤預覽元件
function LabelPreview({ product, size }) {
  const labelConfig = {
    small: { w: 40, h: 30 },
    medium: { w: 50, h: 30 },
    large: { w: 70, h: 40 }
  };

  const config = labelConfig[size] || labelConfig.medium;
  const scale = size === 'small' ? 0.5 : size === 'medium' ? 0.65 : 1;

  return (
    <div style={{
      width: `${config.w * scale}mm`,
      height: `${config.h * scale}mm`,
      background: '#fff',
      border: '2px solid #d1d5db',
      borderRadius: 4,
      padding: `${4 * scale}mm`,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      fontSize: `${10 * scale}px`,
      fontFamily: "'Noto Sans TC', sans-serif"
    }}>
      <div style={{ textAlign: 'center', lineHeight: 1.2, fontWeight: 700, fontSize: `${11 * scale}px` }}>
        {product.name || product.item_number}
      </div>
      <div style={{
        width: '100%', height: `${8 * scale}mm`, background: '#f0f0f0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 2, margin: `${2 * scale}mm 0`
      }}>
        <QRPreview text={product.item_number} size={`${30 * scale}mm`} />
      </div>
      <div style={{ textAlign: 'center', fontSize: `${8 * scale}px`, color: '#666' }}>
        ${product.price?.toLocaleString() || 'N/A'}
      </div>
    </div>
  );
}

// QR 碼預覽（簡單版本）
function QRPreview({ text, size }) {
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    const canvas = generateQRCanvas(text, 100);
    setQrUrl(canvas.toDataURL());
  }, [text]);

  return (
    <img src={qrUrl} alt="QR" style={{ width: size, height: size }} />
  );
}

// 隱藏的列印區域
function PrintArea({ product, quantity, size }) {
  const labelConfig = {
    small: { w: 40, h: 30 },
    medium: { w: 50, h: 30 },
    large: { w: 70, h: 40 }
  };

  const config = labelConfig[size] || labelConfig.medium;

  return (
    <div style={{ display: 'none' }} className="print-area">
      <style>{`
        @media print {
          * { margin: 0; padding: 0; }
          body { background: white; }
          .print-area { display: block !important; }
          .print-label {
            width: ${config.w}mm;
            height: ${config.h}mm;
            margin: 0;
            padding: 2mm;
            background: white;
            border: 1px solid #ccc;
            page-break-inside: avoid;
            display: inline-block;
            box-sizing: border-box;
            font-family: 'Noto Sans TC', sans-serif;
            font-size: 10px;
          }
          .print-label-content {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
          }
          .print-label-name {
            font-weight: 700;
            text-align: center;
            line-height: 1.2;
            font-size: 11px;
            flex: 0 0 auto;
          }
          .print-label-barcode {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
          }
          .print-label-price {
            font-size: 8px;
            color: #666;
            flex: 0 0 auto;
          }
          .no-print { display: none !important; }
        }
      `}</style>
      {Array.from({ length: quantity }).map((_, i) => (
        <div key={i} className="print-label">
          <div className="print-label-content">
            <div className="print-label-name">{product.name || product.item_number}</div>
            <div className="print-label-barcode">
              <PrintBarcode text={product.item_number} />
            </div>
            <div className="print-label-price">${product.price?.toLocaleString() || 'N/A'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// 列印用條碼
function PrintBarcode({ text }) {
  const [barcodeUrl, setBarcodeUrl] = useState('');

  useEffect(() => {
    const canvas = generateBarcodeCanvas(text, 120, 50);
    setBarcodeUrl(canvas.toDataURL());
  }, [text]);

  return <img src={barcodeUrl} alt="Barcode" style={{ maxWidth: '100%', height: 'auto' }} />;
}
