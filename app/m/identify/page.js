'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

const API_BASE = '/api/admin';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('qb_admin_token') : null;

async function apiPost(body) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': getToken() || '' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function apiGet(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}?${qs}`, { headers: { 'x-admin-token': getToken() || '' } });
  return res.json();
}

// ── 壓縮圖片 ──
function compressImage(file, maxPx = 1600, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        const ratio = Math.min(maxPx / width, maxPx / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    };
    img.src = URL.createObjectURL(file);
  });
}

// ── 震動反饋 ──
function vibrate(pattern = 100) {
  try { navigator.vibrate?.(pattern); } catch {}
}

export default function MobileIdentify() {
  const [step, setStep] = useState('capture'); // capture | identifying | results
  const [authed, setAuthed] = useState(null);
  const [error, setError] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [identifying, setIdentifying] = useState(false);
  const [results, setResults] = useState([]);
  const [identifiedInfo, setIdentifiedInfo] = useState(null);

  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  // 認證檢查
  useEffect(() => {
    const token = getToken();
    if (!token) { setAuthed(false); return; }
    apiGet({ action: 'me' }).then(r => setAuthed(!!r.user)).catch(() => setAuthed(false));
  }, []);

  // ── 處理圖片上傳 ──
  const handleFile = useCallback(async (file) => {
    if (!file) return;

    // 顯示圖片預覽
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);

    setStep('identifying');
    setError('');
    setIdentifying(true);

    try {
      // 壓縮圖片
      let uploadFile = file;
      if (file.type.startsWith('image/')) {
        const compressed = await compressImage(file);
        uploadFile = new File([compressed], file.name, { type: 'image/jpeg' });
      }

      // 轉換為 base64
      const buffer = await uploadFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const binary = String.fromCharCode(...bytes);
      const base64 = btoa(binary);

      // 調用 AI 識別 API
      const identified = await apiPost({
        action: 'ai_identify_product',
        image: base64,
        prompt: '請辨識這張圖片中的工具或產品。請提供：1) 品牌名稱、2) 產品型號或名稱、3) 產品類別、4) 任何可見的文字或數字。以 JSON 格式回傳：{ "brand": "品牌", "model": "型號", "description": "描述", "keywords": ["關鍵字1", "關鍵字2"] }'
      });

      // 解析 AI 回應
      let aiData = null;
      if (typeof identified.result === 'string') {
        try {
          // 嘗試從文字中提取 JSON
          const jsonMatch = identified.result.match(/\{[\s\S]*\}/);
          aiData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch {
          aiData = null;
        }
      } else if (typeof identified.result === 'object') {
        aiData = identified.result;
      }

      if (!aiData) {
        setError('無法辨識產品，請重新拍照');
        setStep('capture');
        setIdentifying(false);
        return;
      }

      setIdentifiedInfo(aiData);

      // 根據 AI 結果搜尋資料庫
      const searchKeywords = (aiData.keywords || [])
        .concat([aiData.brand, aiData.model, aiData.description])
        .filter(Boolean)
        .join(' ');

      const searchResults = await apiGet({
        action: 'products',
        search: searchKeywords,
        limit: 10
      });

      const products = (searchResults.products || []).map((p, idx) => ({
        ...p,
        confidence: Math.max(
          aiData.brand && p.brand?.toLowerCase().includes(aiData.brand.toLowerCase()) ? 0.9 : 0,
          aiData.model && p.description?.toLowerCase().includes(aiData.model.toLowerCase()) ? 0.85 : 0,
          0.5 + (9 - idx) * 0.05 // 排名越前越高分
        ).toFixed(2)
      }));

      setResults(products);
      setStep('results');
      vibrate([50, 30, 80]);

    } catch (e) {
      setError(e.message || '識別失敗，請重試');
      setStep('capture');
    } finally {
      setIdentifying(false);
    }
  }, []);

  // ── 重新拍照 ──
  const retakePhoto = useCallback(() => {
    setImagePreview('');
    setResults([]);
    setIdentifiedInfo(null);
    setError('');
    setStep('capture');
  }, []);

  // ── 樣式定義 ──
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
        <div style={S.header}>📸 拍照辨物</div>
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

  // ── 拍照頁面 ──
  if (step === 'capture') {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <span>📸 QB 拍照辨物</span>
          <button onClick={() => window.location.href = '/m/stock-in'} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>← 進貨</button>
        </div>

        {error && (
          <div style={{ margin: '12px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#dc2626', fontSize: 13 }}>
            {error}
            <span onClick={() => setError('')} style={{ float: 'right', cursor: 'pointer' }}>✕</span>
          </div>
        )}

        <div style={S.card}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>📸</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 8 }}>拍照辨識工具</div>
            <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6 }}>
              對準工具或產品拍照<br/>
              AI 將自動辨識品牌、型號和規格
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => cameraRef.current?.click()}
              style={{ ...S.btn, fontSize: 18, padding: 20 }}
            >
              📱 拍照
            </button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={e => handleFile(e.target.files[0])}
              style={{ display: 'none' }}
            />

            <button
              onClick={() => fileRef.current?.click()}
              style={S.btnOutline}
            >
              🗂️ 從相簿選擇
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={e => handleFile(e.target.files[0])}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        <div style={{ ...S.card, background: '#f0fdf4', borderLeft: '4px solid #16a34a' }}>
          <div style={{ fontSize: 13, color: '#4b5563' }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>💡 提示</div>
            <div style={{ lineHeight: 1.6 }}>
              • 光線充足效果最佳<br/>
              • 包含產品標籤或標記<br/>
              • 拍攝整個工具或產品<br/>
              • 避免過度傾斜或模糊
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 識別中頁面 ──
  if (step === 'identifying') {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <span>📸 QB 拍照辨物</span>
        </div>

        {imagePreview && (
          <div style={{ margin: '12px', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <img src={imagePreview} alt="preview" style={{ width: '100%', display: 'block' }} />
          </div>
        )}

        <div style={{ ...S.card, textAlign: 'center', paddingTop: 40, paddingBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 1.5s infinite' }}>✨</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 8 }}>AI 正在辨識...</div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>請稍候，通常需要 3-5 秒</div>

          <div style={{ marginTop: 20, height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#16a34a', animation: 'loading 2s infinite', width: '30%' }} />
          </div>
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          @keyframes loading {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(500%); }
          }
        `}</style>
      </div>
    );
  }

  // ── 結果頁面 ──
  if (step === 'results') {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <span>📸 QB 拍照辨物</span>
          <button onClick={retakePhoto} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>重新拍照</button>
        </div>

        {imagePreview && (
          <div style={{ margin: '12px', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <img src={imagePreview} alt="preview" style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }} />
          </div>
        )}

        {identifiedInfo && (
          <div style={{ ...S.card, background: '#f0fdf4', borderLeft: '4px solid #16a34a' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d', marginBottom: 8 }}>✓ AI 辨識結果</div>
            <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.8 }}>
              {identifiedInfo.brand && <div><strong>品牌：</strong> {identifiedInfo.brand}</div>}
              {identifiedInfo.model && <div><strong>型號：</strong> {identifiedInfo.model}</div>}
              {identifiedInfo.description && <div><strong>描述：</strong> {identifiedInfo.description}</div>}
              {identifiedInfo.keywords && identifiedInfo.keywords.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong>關鍵字：</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {identifiedInfo.keywords.map((kw, idx) => (
                      <span key={idx} style={{ background: '#d1fae5', color: '#065f46', padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ ...S.card, paddingTop: 0, paddingBottom: 0 }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>
              🔍 匹配的產品 ({results.length})
            </div>
          </div>

          {results.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>未找到匹配的產品</div>
            </div>
          ) : (
            <div>
              {results.map((product, idx) => (
                <div key={idx} style={{ padding: '14px 16px', borderBottom: idx < results.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {product.image_url && (
                      <img
                        src={product.image_url}
                        alt={product.description}
                        style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', background: '#f3f4f6' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', flex: 1 }}>
                          {product.description || product.item_number}
                        </div>
                        <div style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#fff',
                          background: `rgba(22, 163, 74, ${Math.min(0.5 + parseFloat(product.confidence) / 2, 1)})`,
                          padding: '2px 8px',
                          borderRadius: 4
                        }}>
                          {Math.round(product.confidence * 100)}%
                        </div>
                      </div>

                      {product.brand && (
                        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                          📦 {product.brand}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
                          ${product.tw_reseller_price || product.tw_retail_price || '價格待定'}
                        </div>
                      </div>

                      <div style={{ fontSize: 11, color: '#9ca3af' }}>
                        SKU: {product.item_number}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      // 存儲選中的產品到 sessionStorage，供進貨頁面使用
                      sessionStorage.setItem('identified_product', JSON.stringify({
                        item_number: product.item_number,
                        description: product.description,
                        brand: product.brand,
                        price: product.tw_reseller_price || product.tw_retail_price,
                        qty: 1
                      }));
                      window.location.href = '/m/stock-in?from=identify';
                    }}
                    style={{
                      width: '100%',
                      marginTop: 10,
                      padding: '10px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#fff',
                      background: '#16a34a',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer'
                    }}
                  >
                    ✓ 加入進貨
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 20 }} />
      </div>
    );
  }

  return null;
}
