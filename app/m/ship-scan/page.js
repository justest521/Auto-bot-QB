'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

const API_BASE = '/api/admin';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('qb_admin_token') : null;

async function apiGet(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}?${qs}`, { headers: { 'x-admin-token': getToken() || '' } });
  return res.json();
}

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

// ── 音效管理器 ──
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }
  if (_audioCtx?.state === 'suspended') _audioCtx.resume().catch(() => {});
  return _audioCtx;
}

// ── 震動反饋 ──
function vibrate(pattern = 100) {
  try { navigator.vibrate?.(pattern); } catch {}
}

// ── 成功掃碼音效 ──
function beepSuccess() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch {}
  vibrate([50, 30, 80]);
}

// ── 失敗掃碼音效 ──
function beepError() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.value = 600;
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {}
  vibrate([100, 50, 100]);
}

export default function MobileShipmentScan() {
  const [authed, setAuthed] = useState(null);
  const [step, setStep] = useState('search'); // search | scanning | done
  const [orderInput, setOrderInput] = useState('');
  const [order, setOrder] = useState(null);
  const [scannedItems, setScannedItems] = useState(new Map()); // itemId -> { item, scannedQty }
  const [scanInput, setScanInput] = useState('');
  const [scanError, setScanError] = useState('');
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const scanInputRef = useRef(null);

  // 認證檢查
  useEffect(() => {
    const token = getToken();
    if (!token) { setAuthed(false); return; }
    apiGet({ action: 'me' }).then(r => setAuthed(!!r.user)).catch(() => setAuthed(false));
  }, []);

  // 自動聚焦掃描輸入
  useEffect(() => {
    if (step === 'scanning') {
      scanInputRef.current?.focus();
    }
  }, [step]);

  // 搜尋訂單
  const handleSearchOrder = useCallback(async (e) => {
    e.preventDefault();
    if (!orderInput.trim()) return;

    setSearching(true);
    setScanError('');
    setScannedItems(new Map());
    try {
      const result = await apiGet({ action: 'order_detail', id: orderInput.trim() });
      if (result.error) {
        setScanError(`找不到訂單: ${result.error}`);
        setOrder(null);
      } else {
        setOrder(result);
        setStep('scanning');
        setTimeout(() => scanInputRef.current?.focus(), 100);
      }
    } catch (err) {
      setScanError(`搜尋失敗: ${err.message}`);
      setOrder(null);
    } finally {
      setSearching(false);
    }
  }, [orderInput]);

  // 處理掃描輸入
  const handleScan = useCallback(async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const code = scanInput.trim();
    if (!code) return;
    setScanInput('');

    if (!order || !order.items) {
      setScanError('訂單資訊不完整');
      beepError();
      return;
    }

    // 尋找匹配的商品
    let matched = false;
    const newScannedItems = new Map(scannedItems);

    for (const item of order.items) {
      // 嘗試按品號、barcode 或其他識別碼匹配
      if (item.item_number === code || item.barcode === code || item.sku === code) {
        matched = true;
        const current = newScannedItems.get(item.id) || { item, scannedQty: 0 };
        const newQty = current.scannedQty + 1;

        // 檢查是否超出訂單數量
        const orderQty = item.quantity || 1;
        if (newQty > orderQty) {
          setScanError(`[警告] 商品 ${item.item_number} 掃描數量 (${newQty}) 超過訂單數量 (${orderQty})`);
          beepError();
          return;
        }

        newScannedItems.set(item.id, { item, scannedQty: newQty });
        setScannedItems(newScannedItems);
        setScanError('');
        beepSuccess();
        break;
      }
    }

    if (!matched) {
      setScanError(`[不符] 掃描碼 "${code}" 未在訂單中找到`);
      beepError();
    }
  }, [order, scannedItems]);

  // 計算進度
  const calculateProgress = () => {
    if (!order || !order.items) return { scanned: 0, total: 0, percent: 0 };
    let totalQty = 0;
    let scannedQty = 0;
    order.items.forEach(item => {
      const qty = item.quantity || 1;
      totalQty += qty;
      const scanned = scannedItems.get(item.id)?.scannedQty || 0;
      scannedQty += scanned;
    });
    return { scanned: scannedQty, total: totalQty, percent: totalQty > 0 ? Math.round((scannedQty / totalQty) * 100) : 0 };
  };

  // 檢查是否全部掃描完成
  const isCompleted = () => {
    if (!order || !order.items) return false;
    for (const item of order.items) {
      const qty = item.quantity || 1;
      const scanned = scannedItems.get(item.id)?.scannedQty || 0;
      if (scanned < qty) return false;
    }
    return true;
  };

  // 提交出貨
  const handleShipment = useCallback(async () => {
    if (!order) return;

    setSubmitting(true);
    setScanError('');
    try {
      const result = await apiPost({
        action: 'update_shipment_status',
        order_id: order.id,
        status: 'shipped',
        scanned_items: Array.from(scannedItems.entries()).map(([itemId, data]) => ({
          item_id: itemId,
          scanned_qty: data.scannedQty
        }))
      });

      if (result.error) {
        setScanError(`出貨失敗: ${result.error}`);
      } else {
        setMessage(`✅ 訂單 ${order.id} 已成功出貨\n${result.message || ''}`);
        setStep('done');
        beepSuccess();
      }
    } catch (err) {
      setScanError(`出貨失敗: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }, [order, scannedItems]);

  // 返回搜尋
  const handleBackToSearch = () => {
    setStep('search');
    setOrder(null);
    setScannedItems(new Map());
    setOrderInput('');
    setScanError('');
    setScanInput('');
  };

  const progress = calculateProgress();
  const completed = isCompleted();

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
        <div style={S.header}>📦 出貨掃描</div>
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
        <span>📦 出貨掃描</span>
        {step !== 'search' && (
          <button onClick={handleBackToSearch} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>返回</button>
        )}
      </div>

      {scanError && (
        <div style={{ margin: '12px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#dc2626', fontSize: 13 }}>
          {scanError}
        </div>
      )}

      {/* ══════ 訂單搜尋 ══════ */}
      {step === 'search' && (
        <>
          <div style={S.card}>
            <form onSubmit={handleSearchOrder} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="輸入或掃描訂單號..."
                value={orderInput}
                onChange={(e) => setOrderInput(e.target.value)}
                style={{ ...S.input, flex: 1 }}
                autoFocus
              />
              <button type="submit" disabled={searching} style={{
                padding: '8px 14px', fontSize: 14, fontWeight: 700, color: '#fff',
                background: searching ? '#d1d5db' : '#16a34a', border: 'none', borderRadius: 8, cursor: 'pointer'
              }}>
                {searching ? '...' : '搜尋'}
              </button>
            </form>
          </div>

          <div style={{ ...S.card, textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, color: '#6b7280' }}>輸入訂單號開始出貨掃描</div>
          </div>
        </>
      )}

      {/* ══════ 掃描進行中 ══════ */}
      {step === 'scanning' && order && (
        <>
          {/* 訂單資訊 */}
          <div style={S.card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
              訂單 #{order.id}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              客戶: {order.customer_name || 'N/A'}
            </div>
          </div>

          {/* 進度條 */}
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>掃描進度</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
                {progress.scanned}/{progress.total} ({progress.percent}%)
              </span>
            </div>
            <div style={{
              width: '100%', height: 24, background: '#e5e7eb', borderRadius: 12, overflow: 'hidden'
            }}>
              <div style={{
                width: `${progress.percent}%`, height: '100%', background: '#16a34a',
                transition: 'width 0.3s ease', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 11, fontWeight: 700
              }}>
                {progress.percent > 10 && `${progress.percent}%`}
              </div>
            </div>
          </div>

          {/* 掃描輸入（隱藏但可聚焦） */}
          <input
            ref={scanInputRef}
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={handleScan}
            style={{ position: 'absolute', left: '-9999px' }}
            placeholder="掃描商品"
          />

          {/* 訂單項目列表 */}
          <div style={S.card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>
              訂單項目
            </div>
            {order.items && order.items.map((item) => {
              const scanned = scannedItems.get(item.id)?.scannedQty || 0;
              const qty = item.quantity || 1;
              const matched = scanned === qty;
              const isPartial = scanned > 0 && scanned < qty;

              return (
                <div key={item.id} style={{
                  padding: '12px', marginBottom: 8, borderRadius: 10, border: '2px solid',
                  borderColor: matched ? '#10b981' : isPartial ? '#f59e0b' : '#e5e7eb',
                  background: matched ? '#ecfdf5' : isPartial ? '#fffbeb' : '#f9fafb',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>
                      {item.name || item.item_number}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                      品號: {item.item_number}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: 14, fontWeight: 700,
                      color: matched ? '#10b981' : isPartial ? '#f59e0b' : '#9ca3af'
                    }}>
                      {scanned}/{qty}
                    </div>
                    <div style={{
                      fontSize: 11, color: '#6b7280',
                      marginTop: 2
                    }}>
                      {matched ? '✓ 完成' : isPartial ? '⚠ 部分' : '- 未掃'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 出貨按鈕 */}
          {completed && (
            <div style={{ ...S.card, marginTop: 0 }}>
              <button
                onClick={handleShipment}
                disabled={submitting}
                style={{
                  ...S.btn,
                  background: submitting ? '#d1d5db' : '#16a34a',
                  fontSize: 18
                }}
              >
                {submitting ? '處理中...' : '出貨完成'}
              </button>
            </div>
          )}

          {/* 掃描提示 */}
          <div style={{
            ...S.card,
            marginTop: 0,
            textAlign: 'center',
            padding: '12px 16px',
            background: completed ? '#dcfce7' : '#fef3c7'
          }}>
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              color: completed ? '#15803d' : '#92400e'
            }}>
              {completed ? '✅ 所有項目已掃描完成' : '📱 點擊此區域後掃描商品'}
            </div>
          </div>
        </>
      )}

      {/* ══════ 完成 ══════ */}
      {step === 'done' && (
        <div style={S.card}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#15803d', whiteSpace: 'pre-line', marginBottom: 16 }}>
              {message}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={handleBackToSearch} style={S.btn}>
              繼續出貨
            </button>
            <button onClick={() => window.location.href = '/admin'} style={S.btnOutline}>
              回 ERP 後台
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
