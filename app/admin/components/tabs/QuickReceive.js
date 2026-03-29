'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP } from '@/lib/admin/helpers';
import { Loading, PageLead } from '../shared/ui';
import { useUnsavedGuard } from '../shared/UnsavedChangesGuard';

const MODES = [
  { key: 'csv', label: 'CSV 上傳', icon: '📄' },
  { key: 'image', label: 'PDF / 圖片', icon: '📷' },
  { key: 'text', label: '文字輸入', icon: '⌨️' },
];

// CSV 解析
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

  const colMap = {};
  headers.forEach((h, i) => {
    if (/料號|part|sku|item/.test(h)) colMap.part_no = i;
    else if (/品名|name|desc/.test(h)) colMap.name = i;
    else if (/數量|qty|quantity/.test(h)) colMap.qty = i;
    else if (/成本|cost|price|單價/.test(h)) colMap.cost = i;
  });

  // fallback: 如果沒猜到，用前 4 欄
  if (colMap.part_no === undefined) colMap.part_no = 0;
  if (colMap.name === undefined) colMap.name = 1;
  if (colMap.qty === undefined) colMap.qty = 2;
  if (colMap.cost === undefined) colMap.cost = 3;

  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    return {
      part_no: cols[colMap.part_no] || '',
      name: cols[colMap.name] || '',
      qty: Number(cols[colMap.qty]) || 1,
      cost: Number(cols[colMap.cost]) || 0,
    };
  }).filter(r => r.part_no);
}

// 文字快輸解析
function parseTextInput(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  return lines.map(line => {
    const m = line.trim().match(/^([A-Za-z0-9\-_]+)\s*[xX×]\s*(\d+)/);
    if (m) return { part_no: m[1], name: '', qty: Number(m[2]) || 1, cost: 0 };
    // fallback: 只有料號
    const word = line.trim().split(/\s+/)[0];
    if (word && /^[A-Za-z0-9\-_]+$/.test(word)) return { part_no: word, name: '', qty: 1, cost: 0 };
    return null;
  }).filter(Boolean);
}

export default function QuickReceive({ setTab }) {
  const { setDirty } = useUnsavedGuard();
  const [mode, setMode] = useState('csv');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [vendors, setVendors] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  // dirty tracking
  useEffect(() => {
    setDirty(items.length > 0);
  }, [items, setDirty]);

  // load vendors
  useEffect(() => {
    apiGet({ action: 'vendors', search: '', limit: 200 })
      .then(res => setVendors(res.vendors || []))
      .catch(() => {});
  }, []);

  // 比對每個品項的產品資訊 + 等待訂單
  const matchItems = useCallback(async (rawItems) => {
    if (!rawItems.length) return;
    setMatching(true);
    try {
      const matched = await Promise.all(rawItems.map(async (item) => {
        try {
          const res = await apiGet({ action: 'quick_receive_match', part_no: item.part_no });
          const product = res.product;
          return {
            ...item,
            name: item.name || product?.description || '',
            cost: item.cost || Number(product?.cost_price || product?.tw_reseller_price || 0),
            stock_qty: product?.stock_qty || 0,
            matched: !!product,
            waiting_orders: res.waitingOrders || [],
          };
        } catch {
          return { ...item, matched: false, waiting_orders: [] };
        }
      }));
      setItems(matched);
    } finally {
      setMatching(false);
    }
  }, []);

  // CSV file upload
  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (!parsed.length) { setError('無法解析 CSV，請確認格式'); setLoading(false); return; }
      await matchItems(parsed);
    } catch (err) {
      setError('CSV 讀取失敗: ' + err.message);
    }
    setLoading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  // Image/PDF upload → AI parse
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await apiPost({ action: 'parse_receive_image', base64, mime: file.type });
      if (res.error) { setError(res.error); setLoading(false); return; }
      const parsed = (res.items || []).map(i => ({
        part_no: i.part_no || '',
        name: i.name || '',
        qty: Number(i.qty) || 1,
        cost: Number(i.cost) || 0,
      })).filter(i => i.part_no);
      if (!parsed.length) { setError('AI 無法從圖片中辨識品項'); setLoading(false); return; }
      await matchItems(parsed);
    } catch (err) {
      setError('圖片解析失敗: ' + err.message);
    }
    setLoading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  // 文字解析
  const handleTextParse = async () => {
    const parsed = parseTextInput(textInput);
    if (!parsed.length) { setError('無法解析文字，格式範例：AB1234 x5'); return; }
    setLoading(true);
    setError('');
    await matchItems(parsed);
    setLoading(false);
  };

  // 更新單行
  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  // 刪除單行
  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  // 一鍵入庫
  const handleStockIn = async () => {
    if (!items.length) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiPost({
        action: 'quick_stock_in',
        items: items.map(i => ({
          part_no: i.part_no,
          name: i.name,
          qty: Number(i.qty) || 1,
          cost: Number(i.cost) || 0,
          waiting_orders: i.waiting_orders || [],
        })),
        vendor_id: selectedVendor || null,
        note,
      });
      if (res.error) { setError(res.error); setSubmitting(false); return; }
      setDirty(false);
      setMsg(`入庫完成！進貨單號 ${res.stock_in_no || ''}，共 ${res.count || items.length} 項`);
      setItems([]);
      setTextInput('');
      setNote('');
      setTimeout(() => setMsg(''), 4000);
    } catch (err) {
      setError('入庫失敗: ' + err.message);
    }
    setSubmitting(false);
  };

  const totalQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const totalCost = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.cost) || 0), 0);
  const totalWaiting = items.reduce((s, i) => s + (i.waiting_orders?.length || 0), 0);

  const cardStyle = { ...S.card, borderRadius: 10, border: '1px solid #eaeff5' };
  const thStyle = { textAlign: 'left', padding: '8px 10px', color: '#6b7280', fontWeight: 600, fontSize: 12, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13, verticalAlign: 'top' };

  return (
    <div>
      <PageLead eyebrow="Quick Receive" title="快速進貨" description="上傳 CSV、拍照或手打料號，一鍵完成入庫並推進等待訂單。" />

      {msg && <div style={{ ...cardStyle, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 12, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}
      {error && <div style={{ ...cardStyle, background: '#fff1f2', borderColor: '#fecdd3', color: '#b42318', marginBottom: 12, cursor: 'pointer' }} onClick={() => setError('')}>{error}</div>}

      {/* ── 模式切換 ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {MODES.map(m => (
          <button key={m.key} onClick={() => setMode(m.key)} style={{
            ...S.btnGhost, padding: '10px 20px', fontSize: 14, fontWeight: 600,
            background: mode === m.key ? '#eff6ff' : '#fff',
            borderColor: mode === m.key ? '#3b82f6' : '#e5e7eb',
            color: mode === m.key ? '#2563eb' : '#374151',
          }}>
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* ── 輸入區 ── */}
      <div style={{ ...cardStyle, marginBottom: 16, padding: '20px 24px' }}>
        {mode === 'csv' && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>上傳 CSV 檔案</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>CSV 第一列為表頭，系統會自動對應「料號、品名、數量、成本」欄位</div>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCsvUpload} style={{ fontSize: 13 }} />
          </div>
        )}

        {mode === 'image' && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>上傳圖片或 PDF</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>系統會用 AI 辨識進貨單/送貨單上的品項、數量和金額</div>
            <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleImageUpload} style={{ fontSize: 13 }} />
          </div>
        )}

        {mode === 'text' && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>手動輸入料號</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>每行一個品項，格式：<code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>料號 x數量</code></div>
            <textarea
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder={'AB1234 x5\nBP-5678 x10\nKRADD26T x1'}
              rows={6}
              style={{ ...S.input, resize: 'vertical', fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 13, lineHeight: 1.8, marginBottom: 10 }}
            />
            <button onClick={handleTextParse} disabled={!textInput.trim() || loading} style={{ ...S.btnPrimary, padding: '8px 20px' }}>
              {loading ? '解析中...' : '解析並比對'}
            </button>
          </div>
        )}
      </div>

      {/* ── 載入中 ── */}
      {(loading || matching) && (
        <div style={{ ...cardStyle, padding: 30, textAlign: 'center', marginBottom: 16 }}>
          <Loading />
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>{matching ? '正在比對產品與訂單...' : '解析中...'}</div>
        </div>
      )}

      {/* ── 品項預覽表格 ── */}
      {items.length > 0 && !loading && !matching && (
        <div style={{ ...cardStyle, marginBottom: 16, padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>進貨明細 <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>{items.length} 項 / {totalQty} 件</span></div>
            {totalWaiting > 0 && (
              <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, background: '#fef3c7', padding: '3px 10px', borderRadius: 6 }}>
                {totalWaiting} 筆等待訂單
              </span>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>料號</th>
                  <th style={thStyle}>品名</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: 70 }}>數量</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: 100 }}>成本</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: 100 }}>小計</th>
                  <th style={{ ...thStyle, width: 180 }}>等待訂單</th>
                  <th style={{ ...thStyle, width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fafbfd' }}>
                    <td style={tdStyle}>
                      <span style={{ ...S.mono, fontWeight: 700, color: item.matched ? '#2563eb' : '#dc2626' }}>{item.part_no}</span>
                      {!item.matched && <span style={{ fontSize: 10, color: '#dc2626', marginLeft: 4 }}>未對應</span>}
                    </td>
                    <td style={tdStyle}>
                      <input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} style={{ ...S.input, padding: '3px 6px', fontSize: 12 }} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <input type="number" value={item.qty} min={1} onChange={e => updateItem(idx, 'qty', Number(e.target.value) || 1)} style={{ ...S.input, width: 60, textAlign: 'right', padding: '3px 6px', fontSize: 13 }} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <input type="number" value={item.cost} min={0} onChange={e => updateItem(idx, 'cost', Number(e.target.value) || 0)} style={{ ...S.input, width: 90, textAlign: 'right', padding: '3px 6px', fontSize: 13 }} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', ...S.mono, fontWeight: 700, color: '#10b981' }}>
                      {fmtP((Number(item.qty) || 0) * (Number(item.cost) || 0))}
                    </td>
                    <td style={tdStyle}>
                      {item.waiting_orders?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {item.waiting_orders.map((o, oi) => (
                            <div key={oi} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#f59e0b', fontWeight: 700 }}>{o.order_no}</span>
                              <span style={{ color: '#6b7280' }}>{o.customer_name}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: '#d1d5db' }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span onClick={() => removeItem(idx)} style={{ cursor: 'pointer', color: '#ef4444', fontSize: 16 }}>×</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 合計列 */}
          <div style={{ padding: '12px 8px 4px', borderTop: '2px solid #bfdbfe', marginTop: 4, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 20 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>小計 <span style={{ ...S.mono, fontWeight: 700, color: '#111827' }}>{fmtP(totalCost)}</span> <span style={{ fontSize: 11, color: '#9ca3af' }}>({items.length} 項 / {totalQty} 件)</span></div>
            </div>
            <div style={{ borderLeft: '3px solid #16a34a', paddingLeft: 16, textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginBottom: 2 }}>進貨合計</div>
              <div style={{ ...S.mono, fontSize: 22, fontWeight: 900, color: '#15803d', letterSpacing: -0.5 }}>{fmtP(totalCost)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── 底部操作列 ── */}
      {items.length > 0 && !loading && !matching && (
        <div style={{ ...cardStyle, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ ...S.label, marginBottom: 4 }}>廠商（選填）</label>
            <select value={selectedVendor} onChange={e => setSelectedVendor(e.target.value)} style={{ ...S.input, fontSize: 13 }}>
              <option value="">不指定廠商</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
            </select>
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={{ ...S.label, marginBottom: 4 }}>備註（選填）</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="進貨備註..." style={{ ...S.input, fontSize: 13 }} />
          </div>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-end', paddingTop: 18 }}>
            <button onClick={handleStockIn} disabled={submitting || items.length === 0} style={{
              ...S.btnPrimary, padding: '12px 32px', fontSize: 15, fontWeight: 700,
              background: submitting ? '#94a3b8' : '#16a34a',
              boxShadow: submitting ? 'none' : '0 2px 8px rgba(22,163,74,0.3)',
            }}>
              {submitting ? '入庫中...' : `⚡ 一鍵入庫 (${items.length} 項)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
