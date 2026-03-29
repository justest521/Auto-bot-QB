'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, useResponsive } from '@/lib/admin/helpers';
import { Loading, PageLead } from '../shared/ui';
import { useUnsavedGuard } from '../shared/UnsavedChangesGuard';

// ─── 檔案 SHA-256 hash ───
async function fileHash(file) {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── CSV 解析 ───
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

  if (colMap.part_no === undefined) colMap.part_no = 0;
  if (colMap.name === undefined) colMap.name = 1;
  if (colMap.qty === undefined) colMap.qty = 2;
  if (colMap.cost === undefined) colMap.cost = 3;

  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    return {
      part_no: (cols[colMap.part_no] || '').toUpperCase(),
      name: cols[colMap.name] || '',
      qty: Number(cols[colMap.qty]) || 1,
      cost: Number(cols[colMap.cost]) || 0,
    };
  }).filter(r => r.part_no);
}

// ─── Excel 解析 ───
async function parseExcel(arrayBuffer) {
  const XLSX = (await import('xlsx')).default || (await import('xlsx'));
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (!rows.length) return [];

  // 自動對應欄位
  const keys = Object.keys(rows[0]);
  const find = (patterns) => keys.find(k => patterns.some(p => p.test(k.toLowerCase()))) || null;
  const partCol = find([/料號/, /part/, /sku/, /item/]) || keys[0];
  const nameCol = find([/品名/, /name/, /desc/]) || keys[1];
  const qtyCol = find([/數量/, /qty/, /quantity/]) || keys[2];
  const costCol = find([/成本/, /cost/, /price/, /單價/]) || keys[3];

  return rows.map(r => ({
    part_no: String(r[partCol] || '').trim().toUpperCase(),
    name: String(r[nameCol] || '').trim(),
    qty: Number(r[qtyCol]) || 1,
    cost: Number(r[costCol]) || 0,
  })).filter(r => r.part_no);
}

// ─── 文字快輸解析 ───
function parseTextInput(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  return lines.map(line => {
    const m = line.trim().match(/^([A-Za-z0-9\-_]+)\s*[xX×]\s*(\d+)/);
    if (m) return { part_no: m[1].toUpperCase(), name: '', qty: Number(m[2]) || 1, cost: 0 };
    const word = line.trim().split(/\s+/)[0];
    if (word && /^[A-Za-z0-9\-_]+$/.test(word)) return { part_no: word.toUpperCase(), name: '', qty: 1, cost: 0 };
    return null;
  }).filter(Boolean);
}

// ─── 圖片壓縮（超過限制自動縮小） ───
function compressImage(file, maxBytes = 2.5 * 1024 * 1024) {
  return new Promise((resolve) => {
    if (file.size <= maxBytes) { resolve(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      // 第一步：縮小尺寸（最大邊 1600px，辨識夠用）
      const MAX_DIM = 1600;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      // 第二步：逐步降低品質直到符合大小
      const tryQuality = (q) => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          if (blob.size <= maxBytes || q <= 0.2) {
            resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
          } else {
            tryQuality(q - 0.1);
          }
        }, 'image/jpeg', q);
      };
      tryQuality(0.7);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// ─── 檔案類型偵測 ───
function detectFileType(file) {
  const name = file.name?.toLowerCase() || '';
  const type = file.type?.toLowerCase() || '';
  if (name.endsWith('.csv') || name.endsWith('.txt') || type === 'text/csv') return 'csv';
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || type.includes('spreadsheet') || type.includes('excel')) return 'excel';
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  if (type.startsWith('image/')) return 'image';
  return 'unknown';
}

// ─── 檔案類型標籤 ───
const FILE_TYPE_LABELS = { csv: 'CSV', excel: 'Excel', pdf: 'PDF', image: '圖片' };

export default function QuickReceive({ setTab }) {
  const { isMobile, isTablet } = useResponsive();
  const { setDirty } = useUnsavedGuard();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [vendors, setVendors] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [newVendorMode, setNewVendorMode] = useState(false);
  const [newVendorForm, setNewVendorForm] = useState({ vendor_name: '', contact_name: '', phone: '', mobile: '', tax_id: '', address: '', email: '', remark: '' });
  const [creatingVendor, setCreatingVendor] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [taxExtra, setTaxExtra] = useState(true);
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [uploadedFileName, setUploadedFileName] = useState('');
  const dragCounter = useRef(0);
  const [preview, setPreview] = useState(null);       // { items: [], rawItems: [], rawCols: [], source, detectedCols: [], colMap: {} }
  const [previewChecked, setPreviewChecked] = useState(new Set());
  const [colMap, setColMap] = useState({ part_no: 'part_no', name: 'name', qty: 'qty', cost: 'cost' });

  // dirty tracking
  useEffect(() => {
    setDirty(items.length > 0);
  }, [items, setDirty]);

  // load vendors
  const loadVendors = useCallback(() => apiGet({ action: 'vendors', search: '', limit: 200 }).then(res => setVendors(res.vendors || [])).catch(() => {}), []);
  useEffect(() => { loadVendors(); }, []);

  const resetNewVendor = () => { setNewVendorMode(false); setNewVendorForm({ vendor_name: '', contact_name: '', phone: '', mobile: '', tax_id: '', address: '', email: '', remark: '' }); };
  const createVendorInline = async () => {
    if (!newVendorForm.vendor_name.trim()) return;
    setCreatingVendor(true);
    try {
      const res = await apiPost({ action: 'create_vendor', ...newVendorForm });
      if (res.vendor?.id) {
        await loadVendors();
        setSelectedVendor(res.vendor.id);
        resetNewVendor();
      }
    } catch (e) { alert(e.message); }
    setCreatingVendor(false);
  };

  // ── 比對品項（含品項記憶自動帶入）──
  const matchItems = useCallback(async (rawItems, vendorId) => {
    if (!rawItems.length) return;
    setMatching(true);
    try {
      // 1. 載入品項記憶
      const partNos = rawItems.map(i => (i.part_no || '').toUpperCase()).filter(Boolean);
      let vendorMap = {};  // source_part_no → { item_name, last_cost, times_used }
      let costMap = {};    // item_number → { last_cost, avg_cost, item_name }
      try {
        const memRes = await apiGet({ action: 'item_memory', vendor_id: vendorId || '', item_numbers: partNos.join(',') });
        (memRes.vendor_mappings || []).forEach(m => { vendorMap[m.source_part_no?.toUpperCase()] = m; });
        (memRes.cost_history || []).forEach(m => { costMap[m.item_number?.toUpperCase()] = m; });
      } catch (_) {}

      // 2. 逐筆比對
      const matched = await Promise.all(rawItems.map(async (item) => {
        const partNo = (item.part_no || '').toUpperCase();
        const vmem = vendorMap[partNo];   // 供應商記憶
        const cmem = costMap[partNo];     // 全域成本歷史
        try {
          const res = await apiGet({ action: 'quick_receive_match', part_no: partNo });
          const product = res.product;

          // 優先順序：原始解析值 > 供應商記憶 > 產品資料 > 全域歷史
          const name = item.name || vmem?.item_name || product?.description || cmem?.item_name || '';
          const cost = item.cost || vmem?.last_cost || Number(product?.tw_reseller_price || product?.us_price || 0) || cmem?.last_cost || 0;

          return {
            ...item,
            name, cost,
            stock_qty: product?.stock_qty || 0,
            safety_stock: product?.safety_stock || null,
            matched: !!product,
            waiting_orders: res.waitingOrders || [],
            from_memory: !item.cost && (!!vmem?.last_cost || !!cmem?.last_cost),
            memory_source: vmem ? `${vmem.times_used}次進貨` : cmem ? '歷史成本' : null,
          };
        } catch {
          // 比對失敗但有記憶 → 仍帶入記憶值
          return {
            ...item,
            name: item.name || vmem?.item_name || cmem?.item_name || '',
            cost: item.cost || vmem?.last_cost || cmem?.last_cost || 0,
            matched: false, waiting_orders: [],
            from_memory: !!vmem?.last_cost || !!cmem?.last_cost,
            memory_source: vmem ? `${vmem.times_used}次進貨` : cmem ? '歷史成本' : null,
          };
        }
      }));
      setItems(matched);
      setCheckedItems(new Set(matched.map((_, i) => i)));
    } finally {
      setMatching(false);
    }
  }, []);

  // ── 統一檔案處理 ──
  const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB (Vercel body limit)
  const handleFile = async (inputFile) => {
    if (!inputFile) return;
    let file = inputFile;
    const fileType = detectFileType(file);

    // PDF 超過 10MB 警告（FormData 上傳沒有 JSON 限制，但太大解析會慢）
    if (fileType === 'pdf' && file.size > 10 * 1024 * 1024) {
      setError(`PDF 太大（${(file.size / 1024 / 1024).toFixed(1)}MB），建議不超過 10MB`);
      return;
    }

    setLoading(true);
    setError('');
    setUploadedFileName(file.name);

    try {
      // 超大圖片壓縮（>8MB 時才壓，FormData 上傳已不受 4.5MB JSON 限制）
      if (fileType === 'image' && file.size > 8 * 1024 * 1024) {
        setMsg('圖片較大，自動壓縮中...');
        file = await compressImage(file, 4 * 1024 * 1024);
        setMsg(`已壓縮至 ${(file.size / 1024 / 1024).toFixed(1)}MB`);
      }

      let parsed = [];
      let source = fileType;
      let detectedCols = [];

      if (fileType === 'csv') {
        const text = await file.text();
        parsed = parseCsv(text);
        if (!parsed.length) { setError('無法解析 CSV，請確認格式'); setLoading(false); return; }
        detectedCols = ['料號', '品名', '數量', '成本'].filter((_, i) => parsed.some(p => [p.part_no, p.name, p.qty, p.cost][i]));

      } else if (fileType === 'excel') {
        const buf = await file.arrayBuffer();
        parsed = await parseExcel(buf);
        if (!parsed.length) { setError('無法解析 Excel，請確認格式'); setLoading(false); return; }
        detectedCols = ['料號', '品名', '數量', '成本'].filter((_, i) => parsed.some(p => [p.part_no, p.name, p.qty, p.cost][i]));

      } else if (fileType === 'pdf' || fileType === 'image') {
        // 使用 FormData 上傳，繞過 JSON 4.5MB body 限制
        const fd = new FormData();
        fd.append('file', file);
        const token = typeof window !== 'undefined' ? window.localStorage.getItem('qb_admin_token') : '';
        const uploadRes = await fetch('/api/admin/upload', {
          method: 'POST',
          headers: { 'x-admin-token': token || '' },
          body: fd,
        });
        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error || `上傳失敗 (${uploadRes.status})`);
        }
        const res = await uploadRes.json();
        const METHOD_LABELS = { cache: '快取命中，秒速載入！', 'text-haiku': 'PDF 文字快速解析完成', 'ai-vision': 'AI 圖像辨識完成' };
        if (res.method) setMsg(METHOD_LABELS[res.method] || '解析完成');
        if (res.error) { setError(res.error); setLoading(false); return; }
        parsed = (res.items || []).map(i => ({
          part_no: (i.part_no || '').toUpperCase(),
          name: i.name || '',
          qty: Number(i.qty) || 1,
          cost: Number(i.cost) || 0,
        })).filter(i => i.part_no);
        if (!parsed.length) { setError('AI 無法從檔案中辨識品項'); setLoading(false); return; }
        detectedCols = ['料號', '品名', '數量', '成本'].filter((_, i) => parsed.some(p => [p.part_no, p.name, p.qty, p.cost][i]));

      } else {
        setError(`不支援的檔案格式：${file.name}`);
        setLoading(false);
        return;
      }

      // 顯示預覽讓使用者勾選
      setPreview({ items: parsed, source, detectedCols });
      setPreviewChecked(new Set(parsed.map((_, i) => i)));
      setColMap({ part_no: 'part_no', name: 'name', qty: 'qty', cost: 'cost' }); // 重設對應
    } catch (err) {
      setError(`檔案處理失敗: ${err.message}`);
    }
    setLoading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  // ── 取得對應後的預覽項目 ──
  const getMappedItems = () => {
    if (!preview) return [];
    return preview.items.map(item => ({
      part_no: (String(item[colMap.part_no] || '') || '').toUpperCase(),
      name: String(item[colMap.name] || ''),
      qty: Number(item[colMap.qty]) || 1,
      cost: Number(item[colMap.cost]) || 0,
    }));
  };

  // ── 確認預覽，進行比對 ──
  const confirmPreview = async () => {
    if (!preview) return;
    const mapped = getMappedItems();
    const selected = mapped.filter((_, i) => previewChecked.has(i)).filter(i => i.part_no);
    if (!selected.length) { setError('請至少勾選一項'); return; }
    setPreview(null);
    setLoading(true);
    await matchItems(selected, selectedVendor);
    setLoading(false);
  };

  // ── Drag 事件 ──
  const onDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setDragging(true); };
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragging(false); } };
  const onDrop = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current = 0; setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); };

  // ── 文字解析 ──
  const handleTextParse = async () => {
    const parsed = parseTextInput(textInput);
    if (!parsed.length) { setError('無法解析文字，格式範例：AB1234 x5'); return; }
    setError('');
    const detectedCols = ['料號', '數量'];
    setPreview({ items: parsed, source: 'text', detectedCols });
    setPreviewChecked(new Set(parsed.map((_, i) => i)));
    setColMap({ part_no: 'part_no', name: 'name', qty: 'qty', cost: 'cost' });
  };

  // ── 更新 / 刪除 ──
  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };
  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setCheckedItems(prev => {
      const next = new Set();
      prev.forEach(i => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1); });
      return next;
    });
  };

  const addManualItem = () => {
    const newIdx = items.length;
    setItems(prev => [...prev, { part_no: '', name: '', qty: 1, cost: 0, matched: false, waiting_orders: [] }]);
    setCheckedItems(prev => new Set([...prev, newIdx]));
  };

  const toggleCheck = (idx) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedItems.size === items.length) setCheckedItems(new Set());
    else setCheckedItems(new Set(items.map((_, i) => i)));
  };

  // ── 一鍵入庫 ──
  const checkedCount = [...checkedItems].filter(i => i < items.length).length;
  const checkedItemsList = items.filter((_, i) => checkedItems.has(i));
  const handleStockIn = async () => {
    if (!checkedItemsList.length) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiPost({
        action: 'quick_stock_in',
        items: checkedItemsList.map(i => ({
          part_no: (i.part_no || '').toUpperCase(),
          name: i.name,
          qty: Number(i.qty) || 1,
          cost: Number(i.cost) || 0,
          safety_stock: i.safety_stock != null ? Number(i.safety_stock) : null,
          waiting_orders: i.waiting_orders || [],
        })),
        vendor_id: selectedVendor || null,
        note,
      });
      if (res.error) { setError(res.error); setSubmitting(false); return; }
      setDirty(false);
      setMsg(`入庫完成！進貨單號 ${res.stock_in_no || ''}，共 ${res.count || checkedItemsList.length} 項`);
      setItems([]);
      setCheckedItems(new Set());
      setTextInput('');
      setNote('');
      setUploadedFileName('');
      setTimeout(() => setMsg(''), 4000);
    } catch (err) {
      setError('入庫失敗: ' + err.message);
    }
    setSubmitting(false);
  };

  const totalQty = checkedItemsList.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const subtotal = checkedItemsList.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.cost) || 0), 0);
  const taxAmount = taxExtra ? Math.round(subtotal * 0.05) : 0;
  const totalCost = subtotal + taxAmount;
  const totalWaiting = checkedItemsList.reduce((s, i) => s + (i.waiting_orders?.length || 0), 0);

  const cardStyle = { ...S.card, borderRadius: 10, border: '1px solid #eaeff5' };
  const thStyle = { textAlign: 'left', padding: '8px 10px', color: '#6b7280', fontWeight: 600, fontSize: 12, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13, verticalAlign: 'top' };

  return (
    <div>
      <PageLead eyebrow="Quick Receive" title="快速進貨" description="上傳檔案、拍照或手打料號，一鍵完成入庫並推進等待訂單。" />

      {msg && <div style={{ ...cardStyle, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 12, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}
      {error && <div style={{ ...cardStyle, background: '#fff1f2', borderColor: '#fecdd3', color: '#b42318', marginBottom: 12, cursor: 'pointer' }} onClick={() => setError('')}>{error}</div>}

      {/* ── 統一拖曳上傳區 ── */}
      <div style={{ ...cardStyle, marginBottom: 16, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>上傳檔案</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>支援 CSV、Excel、PDF、圖片 — 系統自動偵測格式並解析</div>
          </div>
          {uploadedFileName && !loading && (
            <div style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6', padding: '4px 10px', borderRadius: 6 }}>
              已上傳：{uploadedFileName}
            </div>
          )}
        </div>
        <div
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#3b82f6' : '#d1d5db'}`,
            borderRadius: 12,
            padding: '44px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? '#eff6ff' : '#fafbfd',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 8, lineHeight: 1 }}>{dragging ? '\uD83D\uDCE5' : '\uD83D\uDCC1'}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: dragging ? '#2563eb' : '#374151', marginBottom: 6 }}>
            {dragging ? '放開以上傳檔案' : '拖曳檔案到這裡'}
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>或點擊選擇檔案</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
            {[
              { label: 'CSV', color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Excel', color: '#0d9488', bg: '#f0fdfa' },
              { label: 'PDF', color: '#dc2626', bg: '#fef2f2' },
              { label: '圖片', color: '#7c3aed', bg: '#f5f3ff' },
            ].map(t => (
              <span key={t.label} style={{ fontSize: 11, fontWeight: 600, color: t.color, background: t.bg, padding: '2px 10px', borderRadius: 10 }}>{t.label}</span>
            ))}
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls,image/*,.pdf" onChange={e => handleFile(e.target.files?.[0])} style={{ display: 'none' }} />
      </div>

      {/* ── 文字輸入區 ── */}
      <div style={{ ...cardStyle, marginBottom: 16, padding: '20px 24px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>手動輸入料號</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
          每行一個品項，格式：<code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>料號 x數量</code>
        </div>
        <textarea
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          placeholder={'AB1234 x5\nBP-5678 x10\nKRADD26T x1'}
          rows={5}
          style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) , resize: 'vertical', fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 13, lineHeight: 1.8, marginBottom: 10  }}
        />
        <button onClick={handleTextParse} disabled={!textInput.trim() || loading} style={{ ...S.btnPrimary, padding: '8px 20px' }}>
          {loading ? '解析中...' : '解析並比對'}
        </button>
      </div>

      {/* ── 解析預覽 ── */}
      {preview && !loading && (() => {
        const FIELD_OPTIONS = [
          { value: 'part_no', label: '料號' },
          { value: 'name', label: '品名' },
          { value: 'qty', label: '數量' },
          { value: 'cost', label: '成本' },
        ];
        const TARGET_COLS = [
          { key: 'part_no', label: '料號', required: true },
          { key: 'name', label: '品名' },
          { key: 'qty', label: '數量', align: 'right' },
          { key: 'cost', label: '成本', align: 'right' },
        ];
        const mapped = getMappedItems();
        const selectStyle = { padding: '3px 6px', fontSize: 11, border: '1px solid #c7d2fe', borderRadius: 4, background: '#fff', color: '#1e40af', fontWeight: 600, cursor: 'pointer', outline: 'none' };

        return (
          <div style={{ ...cardStyle, marginBottom: 16, padding: '16px 20px', border: '2px solid #3b82f6', background: '#f8faff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e40af' }}>
                  解析預覽
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginLeft: 8 }}>
                    來源：{FILE_TYPE_LABELS[preview.source] || preview.source}
                  </span>
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>共 {preview.items.length} 項</span>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  偵測到欄位：{preview.detectedCols.map(c => (
                    <span key={c} style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, color: '#2563eb', background: '#dbeafe', padding: '1px 8px', borderRadius: 10, marginRight: 4 }}>{c}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setPreview(null)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 12, color: '#6b7280' }}>取消</button>
                <button onClick={confirmPreview} disabled={previewChecked.size === 0} style={{
                  ...S.btnPrimary, padding: '6px 18px', fontSize: 13, fontWeight: 700,
                  background: previewChecked.size > 0 ? '#2563eb' : '#94a3b8',
                }}>
                  確認匯入 ({previewChecked.size} 項)
                </button>
              </div>
            </div>

            {/* 欄位對應 */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 12px', background: '#eef2ff', borderRadius: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#4338ca' }}>欄位對應</span>
              {TARGET_COLS.map(tc => (
                <div key={tc.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{tc.label}{tc.required ? '*' : ''}：</span>
                  <select value={colMap[tc.key]} onChange={e => setColMap(prev => ({ ...prev, [tc.key]: e.target.value }))} style={selectStyle}>
                    {FIELD_OPTIONS.map(fo => (
                      <option key={fo.value} value={fo.value}>{fo.label}</option>
                    ))}
                    <option value="_skip">（跳過）</option>
                  </select>
                </div>
              ))}
            </div>

            <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
              <div style={S.tableScroll}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: '#eef2ff', zIndex: 1 }}>
                    <th style={{ ...thStyle, textAlign: 'center', width: 36, borderBottom: '2px solid #c7d2fe' }}>
                      <input type="checkbox"
                        checked={previewChecked.size === preview.items.length}
                        onChange={e => {
                          if (e.target.checked) setPreviewChecked(new Set(preview.items.map((_, i) => i)));
                          else setPreviewChecked(new Set());
                        }}
                        style={{ width: 15, height: 15, accentColor: '#3b82f6', cursor: 'pointer' }}
                      />
                    </th>
                    <th style={{ ...thStyle, textAlign: 'center', width: 36, borderBottom: '2px solid #c7d2fe' }}>#</th>
                    <th style={{ ...thStyle, borderBottom: '2px solid #c7d2fe' }}>料號</th>
                    <th style={{ ...thStyle, borderBottom: '2px solid #c7d2fe' }}>品名</th>
                    <th style={{ ...thStyle, textAlign: 'right', width: 70, borderBottom: '2px solid #c7d2fe' }}>數量</th>
                    <th style={{ ...thStyle, textAlign: 'right', width: 90, borderBottom: '2px solid #c7d2fe' }}>成本</th>
                  </tr>
                </thead>
                <tbody>
                  {mapped.map((item, idx) => {
                    const checked = previewChecked.has(idx);
                    return (
                      <tr key={idx}
                        onClick={() => setPreviewChecked(prev => { const s = new Set(prev); if (s.has(idx)) s.delete(idx); else s.add(idx); return s; })}
                        style={{ background: checked ? (idx % 2 === 0 ? '#fff' : '#f8faff') : '#f9fafb', opacity: checked ? 1 : 0.45, cursor: 'pointer', transition: 'all 0.1s' }}
                      >
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <input type="checkbox" checked={checked} readOnly style={{ width: 14, height: 14, accentColor: '#3b82f6', cursor: 'pointer' }} />
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>{idx + 1}</td>
                        <td style={tdStyle}>
                          <span style={{ ...S.mono, fontWeight: 700, color: item.part_no ? '#1e40af' : '#ef4444', fontSize: 13 }}>{item.part_no || '(空)'}</span>
                        </td>
                        <td style={{ ...tdStyle, color: '#4b5563', fontSize: 12 }}>{item.name || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', ...S.mono, fontWeight: 600, fontSize: 13 }}>{item.qty}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', ...S.mono, color: item.cost > 0 ? '#374151' : '#d1d5db', fontSize: 12 }}>{item.cost > 0 ? fmtP(item.cost) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>
          </div>
        );
      })()}

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
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
              進貨明細 <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>{checkedCount} / {items.length} 項 / {totalQty} 件</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(() => { const memCount = items.filter(i => i.from_memory).length; return memCount > 0 ? (
                <span style={{ fontSize: 12, color: '#8b5cf6', fontWeight: 600, background: '#f5f3ff', padding: '3px 10px', borderRadius: 6 }}>
                  {memCount} 筆記憶帶入
                </span>
              ) : null; })()}
              {totalWaiting > 0 && (
                <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, background: '#fef3c7', padding: '3px 10px', borderRadius: 6 }}>
                  {totalWaiting} 筆等待訂單
                </span>
              )}
              <button onClick={addManualItem} style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>+ 手動新增</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={S.tableScroll}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'center', width: 36 }}>
                    <input type="checkbox" checked={checkedItems.size === items.length && items.length > 0} onChange={toggleAll} style={{ width: 15, height: 15, accentColor: '#3b82f6', cursor: 'pointer' }} />
                  </th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 40 }}>序</th>
                  <th style={thStyle}>料號</th>
                  <th style={thStyle}>品名</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: 70 }}>數量</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: 100 }}>成本</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: 100 }}>小計</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: 80 }}>安全庫存</th>
                  <th style={{ ...thStyle, width: 180 }}>等待訂單</th>
                  <th style={{ ...thStyle, width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} style={{ background: !checkedItems.has(idx) ? '#f9fafb' : idx % 2 === 0 ? '#fff' : '#fafbfd', opacity: checkedItems.has(idx) ? 1 : 0.5, transition: 'opacity 0.15s' }}>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <input type="checkbox" checked={checkedItems.has(idx)} onChange={() => toggleCheck(idx)} style={{ width: 15, height: 15, accentColor: '#3b82f6', cursor: 'pointer' }} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>{idx + 1}</td>
                    <td style={tdStyle}>
                      <span style={{ ...S.mono, fontWeight: 700, color: item.matched ? '#2563eb' : '#374151' }}>{item.part_no}</span>
                      {!item.matched && <span style={{ fontSize: 10, color: '#f59e0b', marginLeft: 6, background: '#fef3c7', padding: '1px 6px', borderRadius: 4 }}>新品</span>}
                    </td>
                    <td style={tdStyle}>
                      <input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) , padding: '3px 6px', fontSize: 12  }} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <input type="number" value={item.qty || ''} min={1} onChange={e => updateItem(idx, 'qty', e.target.value === '' ? '' : Number(e.target.value))} onBlur={e => { if (!e.target.value) updateItem(idx, 'qty', 1); }} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) , width: 60, textAlign: 'right', padding: '3px 6px', fontSize: 13  }} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                        {item.from_memory && <span title={item.memory_source || '記憶'} style={{ fontSize: 10, color: '#8b5cf6', background: '#f5f3ff', padding: '1px 5px', borderRadius: 3, cursor: 'help', whiteSpace: 'nowrap' }}>記憶</span>}
                        <input type="number" value={item.cost || ''} min={0} onChange={e => updateItem(idx, 'cost', e.target.value === '' ? '' : Number(e.target.value))} onBlur={e => { if (!e.target.value) updateItem(idx, 'cost', 0); }} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) , width: 90, textAlign: 'right', padding: '3px 6px', fontSize: 13  }} />
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {(Number(item.cost) || 0) === 0
                        ? <span style={{ fontSize: 11, color: '#a855f7', fontWeight: 700, background: '#faf5ff', padding: '2px 8px', borderRadius: 4 }}>贈品</span>
                        : <span style={{ ...S.mono, fontWeight: 700, color: '#10b981' }}>{fmtP((Number(item.qty) || 0) * (Number(item.cost) || 0))}</span>
                      }
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <input type="number" value={item.safety_stock ?? ''} min={0} placeholder="自動" onChange={e => updateItem(idx, 'safety_stock', e.target.value === '' ? null : Number(e.target.value))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: 65, textAlign: 'right', padding: '3px 6px', fontSize: 12, color: '#6b7280' }} />
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
            </table></div>
          </div>

          {/* 合計列 */}
          <div style={{ padding: '12px 8px 4px', borderTop: '2px solid #bfdbfe', marginTop: 4, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#374151', userSelect: 'none' }}>
              <input type="checkbox" checked={taxExtra} onChange={e => setTaxExtra(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#3b82f6', cursor: 'pointer' }} />
              稅額外加 5%
            </label>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                小計 <span style={{ ...S.mono, fontWeight: 700, color: '#111827' }}>{fmtP(subtotal)}</span>
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>({checkedCount} 項 / {totalQty} 件)</span>
              </div>
              {taxExtra && (
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  稅金 5% <span style={{ ...S.mono, fontWeight: 600, color: '#374151' }}>{fmtP(taxAmount)}</span>
                </div>
              )}
            </div>
            <div style={{ borderLeft: '3px solid #16a34a', paddingLeft: 16, textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginBottom: 2 }}>進貨合計{taxExtra ? '（含稅）' : ''}</div>
              <div style={{ ...S.mono, fontSize: 22, fontWeight: 900, color: '#15803d', letterSpacing: -0.5 }}>{fmtP(totalCost)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── 底部操作列 ── */}
      {items.length > 0 && !loading && !matching && (
        <div style={{ ...cardStyle, padding: '16px 20px' }}>
          {/* 新增廠商展開面板 */}
          {newVendorMode && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>新增廠商</div>
                <button type="button" onClick={resetNewVendor} style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>✕ 取消</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {[
                  { key: 'vendor_name', label: '廠商名稱 *', ph: '必填', autoFocus: true },
                  { key: 'contact_name', label: '聯絡人', ph: '選填' },
                  { key: 'phone', label: '電話', ph: '選填' },
                  { key: 'mobile', label: '手機', ph: '選填' },
                  { key: 'tax_id', label: '統一編號', ph: '8 碼' },
                  { key: 'email', label: 'Email', ph: '選填' },
                  { key: 'address', label: '地址', ph: '選填' },
                  { key: 'remark', label: '備註', ph: '選填' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#4b5563', marginBottom: 2, display: 'block' }}>{f.label}</label>
                    <input value={newVendorForm[f.key]} onChange={e => setNewVendorForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} autoFocus={f.autoFocus} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) , fontSize: 12, padding: '6px 8px', width: '100%'  }} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button type="button" onClick={createVendorInline} disabled={creatingVendor || !newVendorForm.vendor_name.trim()}
                  style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700, color: '#fff', background: creatingVendor || !newVendorForm.vendor_name.trim() ? '#d1d5db' : '#16a34a', border: 'none', borderRadius: 8, cursor: creatingVendor ? 'wait' : 'pointer' }}>
                  {creatingVendor ? '建立中...' : '建立廠商'}
                </button>
                <button type="button" onClick={resetNewVendor} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ ...S.label, marginBottom: 4 }}>廠商（選填）</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={selectedVendor} onChange={e => setSelectedVendor(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) , fontSize: 13, flex: 1  }}>
                  <option value="">不指定廠商</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
                </select>
                {!newVendorMode && <button type="button" onClick={() => setNewVendorMode(true)} title="新增廠商" style={{ padding: '6px 10px', fontSize: 16, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer', lineHeight: 1 }}>+</button>}
              </div>
            </div>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label style={{ ...S.label, marginBottom: 4 }}>備註（選填）</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="進貨備註..." style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) , fontSize: 13  }} />
            </div>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-end', paddingTop: 18 }}>
              <button onClick={handleStockIn} disabled={submitting || checkedCount === 0} style={{
                ...S.btnPrimary, padding: '12px 32px', fontSize: 15, fontWeight: 700,
                background: submitting ? '#94a3b8' : checkedCount === 0 ? '#d1d5db' : '#16a34a',
                boxShadow: submitting || checkedCount === 0 ? 'none' : '0 2px 8px rgba(22,163,74,0.3)',
              }}>
                {submitting ? '入庫中...' : `一鍵入庫 (${checkedCount} 項)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
