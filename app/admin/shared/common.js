'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';

export const API = '/api/admin';
export const ADMIN_TOKEN_KEY = 'qb_admin_token';
export const SALES_DOCUMENT_FOCUS_KEY = 'qb_sales_document_focus';

export const fmt = n => n?.toLocaleString('zh-TW') || '0';
export const fmtMs = ms => !ms ? '-' : ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
export const fmtDate = d => d ? new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
export const fmtP = n => n ? `NT$${Number(n).toLocaleString()}` : '-';

export function todayInTaipei() {
  const now = new Date();
  const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return new Date(taipei.getFullYear(), taipei.getMonth(), taipei.getDate());
}

export function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPresetDateRange(preset) {
  const today = todayInTaipei();
  const start = new Date(today);
  const end = new Date(today);

  if (preset === 'week') {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
  } else if (preset === 'month') {
    start.setDate(1);
  } else if (preset === 'quarter') {
    const quarterStartMonth = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(quarterStartMonth, 1);
  } else if (preset === 'year') {
    start.setMonth(0, 1);
  }

  return {
    from: toDateInputValue(start),
    to: toDateInputValue(end),
  };
}

export function useViewportWidth() {
  const [width, setWidth] = useState(1400);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return width;
}

export async function authFetch(url, options = {}) {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ADMIN_TOKEN_KEY) : '';

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token || '',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
    throw new Error('Token 錯誤或已失效，請重新登入');
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;

    try {
      const data = await res.json();
      message = data?.error || message;
    } catch {
      try {
        message = await res.text();
      } catch {
        // Ignore response parse errors and use fallback message.
      }
    }

    throw new Error(message);
  }

  return res;
}

export async function apiGet(params = {}) {
  const p = new URLSearchParams(params);
  const res = await authFetch(`${API}?${p.toString()}`);
  return res.json();
}

export async function apiPost(body) {
  const res = await authFetch(API, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}

export function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result.map((value) => value.trim());
}

export function parseCsvText(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim() !== '');
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
}

export function normalizeSpreadsheetRows(rows) {
  return rows.filter((row) => Object.values(row || {}).some((value) => String(value ?? '').trim() !== ''));
}

export function mapCustomerStage(customerType) {
  const text = String(customerType || '').trim();
  if (text.includes('正式')) return 'customer';
  if (['潛在', '詢價', '準客'].some((keyword) => text.includes(keyword))) return 'prospect';
  return 'lead';
}

export function buildCustomerNotes(row) {
  const pairs = [
    ['電話', row['電話']],
    ['傳真', row['傳真']],
    ['職稱', row['職稱']],
    ['請款客戶', row['請款客戶']],
    ['客戶類型', row['客戶類型']],
    ['負責人', row['負責人']],
    ['客戶等級', row['客戶等級']],
    ['首次交易日', row['首次交易日']],
    ['合約起始日', row['合約起始日']],
    ['合約截止日', row['合約截止日']],
  ];
  return pairs.filter(([, value]) => value).map(([label, value]) => `${label}:${value}`).join(' | ');
}

export function buildProductDescription(row) {
  return [row['品名'], row['規格一'], row['規格二']].filter(Boolean).join(' ').trim();
}

export function buildProductSearchText(row) {
  return [row['品號'], row['品名'], row['規格一'], row['規格二'], row['商品分類'], row['主供應商']].filter(Boolean).join(' ').trim();
}

export function mapRowsForDataset(datasetId, rows) {
  if (!rows.length) return [];

  if (datasetId === 'erp_customers') {
    return rows.map((row) => ({
      customer_code: row.customer_code ?? row['客戶代號'] ?? '',
      name: row.name ?? row['主聯絡人'] ?? row['客戶簡稱'] ?? '',
      company_name: row.company_name ?? row['客戶簡稱'] ?? '',
      phone: row.phone ?? row['手機'] ?? row['電話'] ?? '',
      email: row.email ?? '',
      tax_id: row.tax_id ?? row['統一編號'] ?? '',
      address: row.address ?? row['送貨地址'] ?? '',
      source: row.source ?? 'import',
      display_name: row.display_name ?? row['客戶簡稱'] ?? '',
      customer_stage: row.customer_stage ?? mapCustomerStage(row['客戶類型']),
      status: row.status ?? 'active',
      notes: row.notes ?? buildCustomerNotes(row),
    }));
  }

  if (datasetId === 'erp_vendors') {
    return rows.map((row) => ({
      vendor_code: row.vendor_code ?? row['廠商代號'] ?? '',
      vendor_name: row.vendor_name ?? row['廠商簡稱'] ?? '',
      phone: row.phone ?? row['電話'] ?? '',
      fax: row.fax ?? row['傳真'] ?? '',
      contact_name: row.contact_name ?? row['聯絡人'] ?? '',
      contact_title: row.contact_title ?? row['職稱'] ?? '',
      mobile: row.mobile ?? row['手機'] ?? '',
      address: row.address ?? row['營業地址'] ?? '',
      tax_id: row.tax_id ?? row['統一編號'] ?? '',
    }));
  }

  if (datasetId === 'quickbuy_products') {
    return rows.map((row) => ({
      item_number: row.item_number ?? row['品號'] ?? '',
      description: row.description ?? buildProductDescription(row),
      tw_retail_price: row.tw_retail_price ?? row['零售價'] ?? 0,
      tw_reseller_price: row.tw_reseller_price ?? row['優惠價'] ?? 0,
      product_status: row.product_status ?? 'Current',
      category: row.category ?? row['商品分類'] ?? 'other',
      replacement_model: row.replacement_model ?? '',
      weight_kg: row.weight_kg ?? row['單位淨重'] ?? 0,
      origin_country: row.origin_country ?? '',
      search_text: row.search_text ?? buildProductSearchText(row),
    }));
  }

  if (datasetId === 'erp_sales_return_summary') {
    return rows.map((row) => {
      const docNo = String(row.doc_no ?? row['單號'] ?? '');
      return {
        doc_date: row.doc_date ?? row['日期'] ?? '',
        doc_no: docNo,
        doc_type: row.doc_type ?? (docNo.startsWith('退') ? 'return' : 'sale'),
        invoice_no: row.invoice_no ?? row['發票號碼'] ?? '',
        customer_name: row.customer_name ?? row['客戶簡稱'] ?? '',
        sales_name: row.sales_name ?? row['業務姓名'] ?? '',
        amount: row.amount ?? row['合計金額'] ?? 0,
        tax_amount: row.tax_amount ?? row['稅額'] ?? 0,
        total_amount: row.total_amount ?? row['總金額'] ?? 0,
      };
    });
  }

  if (datasetId === 'erp_profit_analysis') {
    return rows.map((row) => ({
      customer_name: row.customer_name ?? row['客戶簡稱'] ?? '',
      doc_date: row.doc_date ?? row['日期'] ?? '',
      doc_no: row.doc_no ?? row['單號'] ?? '',
      sales_name: row.sales_name ?? row['業務'] ?? '',
      amount: row.amount ?? row['金額'] ?? 0,
      cost: row.cost ?? row['成本'] ?? 0,
      gross_profit: row.gross_profit ?? row['毛利'] ?? 0,
      gross_margin: row.gross_margin ?? row['毛利率'] ?? '',
    }));
  }

  if (datasetId === 'erp_quotes') {
    return rows.map((row) => ({
      quote_no: row.quote_no ?? row['報價單號'] ?? '',
      customer_code: row.customer_code ?? row['客戶代號'] ?? '',
      quote_date: row.quote_date ?? row['報價日期'] ?? row['日期'] ?? '',
      valid_until: row.valid_until ?? row['有效期限'] ?? '',
      status: row.status ?? row['狀態'] ?? 'draft',
      subtotal: row.subtotal ?? row['小計'] ?? 0,
      discount_amount: row.discount_amount ?? row['折扣金額'] ?? 0,
      shipping_fee: row.shipping_fee ?? row['運費'] ?? 0,
      tax_amount: row.tax_amount ?? row['稅額'] ?? 0,
      total_amount: row.total_amount ?? row['總額'] ?? row['合計'] ?? 0,
      remark: row.remark ?? row['備註'] ?? '',
    }));
  }

  if (datasetId === 'erp_orders') {
    return rows.map((row) => ({
      order_no: row.order_no ?? row['訂單號'] ?? '',
      customer_code: row.customer_code ?? row['客戶代號'] ?? '',
      order_date: row.order_date ?? row['訂單日期'] ?? row['日期'] ?? '',
      status: row.status ?? row['狀態'] ?? 'confirmed',
      payment_status: row.payment_status ?? row['付款狀態'] ?? 'unpaid',
      shipping_status: row.shipping_status ?? row['出貨狀態'] ?? 'pending',
      subtotal: row.subtotal ?? row['小計'] ?? 0,
      discount_amount: row.discount_amount ?? row['折扣金額'] ?? 0,
      shipping_fee: row.shipping_fee ?? row['運費'] ?? 0,
      tax_amount: row.tax_amount ?? row['稅額'] ?? 0,
      total_amount: row.total_amount ?? row['總額'] ?? row['合計'] ?? 0,
      remark: row.remark ?? row['備註'] ?? '',
    }));
  }

  if (datasetId === 'qb_sales_history') {
    return rows.map((row) => ({
      sale_date: row.sale_date ?? row['銷貨日期'] ?? row['日期'] ?? '',
      slip_number: row.slip_number ?? row['銷貨單號'] ?? row['單號'] ?? '',
      invoice_number: row.invoice_number ?? row['發票號碼'] ?? '',
      customer_name: row.customer_name ?? row['客戶簡稱'] ?? '',
      sales_person: row.sales_person ?? row['業務'] ?? row['業務姓名'] ?? '',
      subtotal: row.subtotal ?? row['未稅金額'] ?? row['小計'] ?? 0,
      tax: row.tax ?? row['稅額'] ?? 0,
      total: row.total ?? row['總額'] ?? row['合計'] ?? 0,
      cost: row.cost ?? row['成本'] ?? 0,
      gross_profit: row.gross_profit ?? row['毛利'] ?? 0,
      profit_margin: row.profit_margin ?? row['毛利率'] ?? '',
    }));
  }

  return rows;
}

export async function parseImportFile(file, datasetId) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.csv')) {
    const text = await file.text();
    return mapRowsForDataset(datasetId, parseCsvText(text));
  }

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return mapRowsForDataset(datasetId, normalizeSpreadsheetRows(rawRows));
  }

  throw new Error('目前只支援 CSV / XLSX / XLS 檔案');
}

export const IMPORT_DATASETS = {
  quickbuy_products: {
    title: '商品資料',
    desc: '直接更新後台查價與 LIFF 搜尋使用的商品資料。',
    fields: 'item_number, description, tw_retail_price, tw_reseller_price...',
  },
  erp_customers: {
    title: '客戶資料',
    desc: 'merge 進正式客戶主檔，保留既有 LINE 綁定與客戶階段。',
    fields: 'customer_code, name, company_name, phone...',
  },
  erp_vendors: {
    title: '廠商資料',
    desc: '更新廠商主檔與供應商聯絡資訊。',
    fields: 'vendor_code, vendor_name, phone...',
  },
  erp_sales_return_summary: {
    title: '銷退貨彙總',
    desc: '更新銷貨/退貨摘要，供後台彙總與查詢使用。',
    fields: 'doc_date, doc_no, doc_type, customer_name...',
  },
  erp_profit_analysis: {
    title: '利潤分析',
    desc: '更新毛利分析資料，做營運統計和客戶利潤追蹤。',
    fields: 'customer_name, doc_date, doc_no, amount...',
  },
  erp_quotes: {
    title: '報價單',
    desc: '匯入 ERP 報價單抬頭資料，供報價查詢與轉單流程使用。',
    fields: 'quote_no, customer_code, quote_date, valid_until...',
  },
  erp_orders: {
    title: '訂單',
    desc: '匯入 ERP 訂單抬頭資料，供訂單追蹤與出貨流程使用。',
    fields: 'order_no, customer_code, order_date, status...',
  },
  qb_sales_history: {
    title: '銷貨單',
    desc: '匯入銷貨單抬頭資料，供銷貨單查詢與毛利檢視使用。',
    fields: 'sale_date, slip_number, invoice_number, customer_name...',
  },
};

export const IMPORT_BATCH_SIZE = {
  default: 400,
  quickbuy_products: 800,
  erp_sales_return_summary: 800,
  erp_profit_analysis: 800,
  qb_sales_history: 600,
  erp_quotes: 500,
  erp_orders: 500,
  erp_vendors: 400,
  erp_customers: 300,
};

export function useCsvImport(datasetId, onImported) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preparedRows, setPreparedRows] = useState([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [batchProgress, setBatchProgress] = useState(null);
  const [recentImportHint, setRecentImportHint] = useState(null);

  const loadImportHint = useCallback(async (file) => {
    try {
      const result = await apiGet({ action: 'import_history' });
      const history = result.history || [];
      const sameFile = history.find((entry) => entry.dataset === datasetId && entry.file_name === file.name);
      const sameDataset = history.find((entry) => entry.dataset === datasetId);

      if (sameFile) {
        setRecentImportHint({
          type: 'same_file',
          text: `${IMPORT_DATASETS[datasetId]?.title || datasetId} 曾於 ${fmtDate(sameFile.imported_at)} 匯入同檔案 ${file.name}，上次筆數 ${fmt(sameFile.count || 0)}。`,
        });
        return;
      }

      if (sameDataset) {
        setRecentImportHint({
          type: 'same_dataset',
          text: `${IMPORT_DATASETS[datasetId]?.title || datasetId} 最近一次匯入時間是 ${fmtDate(sameDataset.imported_at)}，檔名 ${sameDataset.file_name || '-'}。`,
        });
        return;
      }

      setRecentImportHint(null);
    } catch {
      setRecentImportHint(null);
    }
  }, [datasetId]);

  const chooseFile = useCallback(async (file) => {
    if (!file) return;

    try {
      const rows = await parseImportFile(file, datasetId);
      if (!rows.length) throw new Error('檔案沒有可匯入的資料列');
      setSelectedFile(file);
      setPreparedRows(rows);
      setPreviewCount(rows.length);
      setBatchProgress(null);
      setStatus('');
      await loadImportHint(file);
    } catch (error) {
      setSelectedFile(null);
      setPreparedRows([]);
      setPreviewCount(0);
      setBatchProgress(null);
      setRecentImportHint(null);
      setStatus(error.message || '檔案解析失敗');
    }
  }, [datasetId, loadImportHint]);

  const importSelected = useCallback(async () => {
    if (!selectedFile || !preparedRows.length) return;

    if (recentImportHint?.type === 'same_file') {
      const confirmed = typeof window === 'undefined'
        ? true
        : window.confirm(`這個檔案之前已經匯入過。\n\n${recentImportHint.text}\n\n確定還要再次匯入嗎？`);

      if (!confirmed) {
        setStatus('已取消重複匯入');
        return;
      }
    }

    if (recentImportHint?.type === 'same_dataset') {
      const confirmed = typeof window === 'undefined'
        ? true
        : window.confirm(`這個資料集最近已經匯入過。\n\n${recentImportHint.text}\n\n確定要覆蓋目前資料嗎？`);

      if (!confirmed) {
        setStatus('已取消重複匯入');
        return;
      }
    }

    setBusy(true);
    setStatus('');

    try {
      const rows = preparedRows;
      const batchSize = IMPORT_BATCH_SIZE[datasetId] || IMPORT_BATCH_SIZE.default;
      const batchTotal = Math.max(1, Math.ceil(rows.length / batchSize));
      let totalCount = 0;
      let totalInserted = 0;
      let totalUpdated = 0;

      for (let batchIndex = 0; batchIndex < batchTotal; batchIndex += 1) {
        const start = batchIndex * batchSize;
        const end = start + batchSize;
        const chunk = rows.slice(start, end);
        const processed = Math.min(end, rows.length);
        const percent = Math.min(100, Math.round((processed / rows.length) * 100));

        setBatchProgress({
          current: batchIndex + 1,
          total: batchTotal,
          processed,
          all: rows.length,
          percent,
        });
        setStatus(`${IMPORT_DATASETS[datasetId]?.title || datasetId} 匯入中，第 ${batchIndex + 1}/${batchTotal} 批...`);

        const result = await apiPost({
          action: 'import_csv_dataset',
          dataset: datasetId,
          file_name: selectedFile.name,
          rows: chunk,
          batch_index: batchIndex,
          batch_total: batchTotal,
          total_count: rows.length,
        });

        totalCount += Number(result.count || chunk.length);
        totalInserted += Number(result.inserted || 0);
        totalUpdated += Number(result.updated || 0);
      }

      const detailText = totalInserted || totalUpdated
        ? `，新增 ${fmt(totalInserted)} / 更新 ${fmt(totalUpdated)}`
        : '';
      setStatus(`${IMPORT_DATASETS[datasetId]?.title || datasetId} 匯入完成，檔案 ${selectedFile.name}，共 ${fmt(rows.length)} 筆${detailText}`);
      setSelectedFile(null);
      setPreparedRows([]);
      setPreviewCount(0);
      setBatchProgress(null);
      setRecentImportHint(null);
      if (onImported) await onImported();
    } catch (error) {
      setBatchProgress(null);
      setStatus(error.message || '匯入失敗');
    } finally {
      setBusy(false);
    }
  }, [datasetId, onImported, preparedRows, recentImportHint, selectedFile]);

  useEffect(() => {
    if (!status) return undefined;
    const timer = setTimeout(() => setStatus(''), 5200);
    return () => clearTimeout(timer);
  }, [status]);

  return {
    status,
    busy,
    selectedFile,
    previewCount,
    batchProgress,
    recentImportHint,
    chooseFile,
    importSelected,
    clearSelection: () => {
      setSelectedFile(null);
      setPreparedRows([]);
      setPreviewCount(0);
      setBatchProgress(null);
      setRecentImportHint(null);
    },
  };
}

/* ========================================= STYLES ========================================= */
export const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(180deg, #e9eef5 0%, #f5f7fb 220px)', color: '#192434', fontFamily: "'Noto Sans TC', 'SF Mono', monospace, sans-serif" },
  shell: { display: 'flex', minHeight: '100vh' },
  sidebar: { width: 248, background: 'linear-gradient(180deg, #1d2636 0%, #101723 100%)', color: '#c6d0df', padding: '18px 0 20px', boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.04)', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  header: { height: 64, background: 'rgba(255,255,255,0.92)', borderBottom: '1px solid #d8e0ea', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)' },
  content: { flex: 1, padding: '26px 28px 40px', minHeight: 'calc(100vh - 64px)' },
  card: { background: '#ffffff', border: '1px solid #dbe3ee', borderRadius: 14, padding: '18px 20px', marginBottom: 18, boxShadow: '0 10px 28px rgba(20, 35, 60, 0.06)' },
  panelMuted: { background: '#f8fbff', border: '1px solid #dbe6f3', borderRadius: 12, padding: '14px 16px' },
  input: { background: '#fff', border: '1px solid #ccd6e3', borderRadius: 10, padding: '10px 14px', color: '#152033', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: "'Noto Sans TC', sans-serif", transition: 'border-color 0.2s, box-shadow 0.2s', boxShadow: 'inset 0 1px 2px rgba(17,24,39,0.04)' },
  btnPrimary: { background: 'linear-gradient(180deg, #2d8cff 0%, #1976f3 100%)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif", letterSpacing: 0.2, boxShadow: '0 8px 18px rgba(25,118,243,0.22)' },
  btnGhost: { background: '#fff', color: '#5b6779', border: '1px solid #ccd6e3', borderRadius: 10, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif" },
  btnLine: { background: 'linear-gradient(180deg, #19c767 0%, #06b755 100%)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13, boxShadow: '0 8px 18px rgba(6,183,85,0.2)' },
  label: { color: '#6d7a8b', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, letterSpacing: 0.9, textTransform: 'uppercase' },
  mono: { fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: 0.5 },
  pageLead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, marginBottom: 18 },
  pageTitle: { fontSize: 28, fontWeight: 700, color: '#172337', letterSpacing: -0.6, marginBottom: 6 },
  pageDesc: { fontSize: 13, color: '#718096', lineHeight: 1.7, maxWidth: 760 },
  eyebrow: { fontSize: 11, color: '#1976f3', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, ...{ fontFamily: "'SF Mono', 'Fira Code', monospace" } },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 },
  twoCol: { display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' },
  tag: (color) => ({ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: color === 'green' ? '#ddf7ea' : color === 'red' ? '#ffe3e6' : color === 'line' ? '#def8ea' : '#edf2f7', color: color === 'green' ? '#129c59' : color === 'red' ? '#d1435b' : color === 'line' ? '#06a14d' : '#63758a', border: `1px solid ${color === 'green' ? '#bdeccb' : color === 'red' ? '#ffc7cf' : color === 'line' ? '#bcefd2' : '#d9e2ec'}` }),
};

/* ========================================= SHARED ========================================= */
export function Loading() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div style={{ color: '#7e8a9b', fontSize: 12, ...S.mono }}><span style={{ color: '#1976f3' }}>●</span> loading...</div></div>;
}
export function EmptyState({ text }) {
  return <div style={{ textAlign: 'center', padding: '40px 0', color: '#8a96a8', fontSize: 12, ...S.mono }}>{text}</div>;
}
export function StatusBanner({ text, tone = 'neutral' }) {
  if (!text) return null;
  const toneMap = {
    success: { background: '#edf9f2', borderColor: '#bdeccb', color: '#127248' },
    error: { background: '#fff4f4', borderColor: '#ffc7cf', color: '#d1435b' },
    info: { background: '#edf5ff', borderColor: '#94c3ff', color: '#1976f3' },
    neutral: { background: '#f8fbff', borderColor: '#dbe6f3', color: '#617084' },
  };
  return <div style={{ ...S.card, padding: '14px 16px', ...(toneMap[tone] || toneMap.neutral) }}>{text}</div>;
}
export function PageLead({ eyebrow, title, description, action }) {
  return (
    <div style={S.pageLead}>
      <div>
        {eyebrow && <div style={S.eyebrow}>{eyebrow}</div>}
        <div style={S.pageTitle}>{title}</div>
        {description && <div style={S.pageDesc}>{description}</div>}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function EnvHealth({ setTab }) {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'env_health' });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shortcuts = [
    { tab: 'customers', label: '客戶主檔' },
    { tab: 'quotes', label: '報價單' },
    { tab: 'orders', label: '訂單' },
    { tab: 'sales_documents', label: '銷貨單' },
    { tab: 'imports', label: '資料匯入' },
  ];

  return (
    <div>
      <PageLead
        eyebrow="Environment"
        title="ERP 環境檢查"
        description="這裡會直接檢查目前資料庫有哪些 ERP 表已建立、哪些模組仍未就緒。之後你不用再靠錯誤訊息猜。"
        action={<button onClick={load} style={S.btnPrimary}>重新檢查</button>}
      />
      {loading ? <Loading /> : data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
            <StatCard code="READY" label="已就緒表數" value={fmt(data.summary?.ready_count)} sub={`共 ${fmt(data.summary?.total_count)} 張表`} tone="green" />
            <StatCard code="MISS" label="未就緒表數" value={fmt((data.summary?.total_count || 0) - (data.summary?.ready_count || 0))} tone="red" />
            <StatCard code="BOOT" label="快速入口" value="ERP" sub="可直接跳到各模組檢查" tone="blue" />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            {shortcuts.map((item) => (
              <button key={item.tab} onClick={() => setTab?.(item.tab)} style={S.btnGhost}>{item.label}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {Object.entries(data.groups || {}).map(([key, group]) => (
              <div key={key} style={S.card}>
                <PanelHeader
                  title={group.label}
                  meta={group.ready ? '本區模組已基本就緒' : '本區仍有缺表，建議先補 schema'}
                  badge={<div style={S.tag(group.ready ? 'green' : 'red')}>{group.ready ? 'READY' : 'MISSING'}</div>}
                />
                <div style={{ display: 'grid', gap: 8 }}>
                  {group.items.map((item) => (
                    <div key={item.name} style={{ ...S.panelMuted, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '220px 1fr 100px', gap: 10, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, color: '#1c2740', fontWeight: 700 }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>{item.name}</div>
                      </div>
                      <div style={{ fontSize: 12, color: item.ready ? '#617084' : '#b45309' }}>
                        {item.ready ? `可讀取，現有 ${fmt(item.count)} 筆` : item.error}
                      </div>
                      <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                        <span style={S.tag(item.ready ? 'green' : 'red')}>{item.ready ? '可用' : '缺少'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : <EmptyState text="目前無法取得環境檢查結果" />}
    </div>
  );
}

export function ProductEditModal({ product, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    description: product?.description || '',
    us_price: product?.us_price ?? '',
    tw_retail_price: product?.tw_retail_price ?? 0,
    tw_reseller_price: product?.tw_reseller_price ?? 0,
    product_status: product?.product_status || 'Current',
    category: product?.category || 'other',
    replacement_model: product?.replacement_model || '',
    weight_kg: product?.weight_kg ?? '',
    origin_country: product?.origin_country || '',
    search_text: product?.search_text || '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!product) return null;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiPost({
        action: 'update_product_master',
        item_number: product.item_number,
        product: form,
      });
      await onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || '商品更新失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 240, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ width: 'min(760px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 18, padding: '24px 22px 28px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={S.eyebrow}>Product Master</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1c2740' }}>編輯商品主檔</div>
            <div style={{ fontSize: 12, color: '#7b889b', marginTop: 6 }}>{product.item_number}</div>
          </div>
          <button onClick={onClose} style={S.btnGhost}>關閉</button>
        </div>
        {error ? <StatusBanner text={error} tone="error" /> : null}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={S.label}>品名 / 描述</label><textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} rows={3} style={{ ...S.input, resize: 'vertical' }} /></div>
          <div><label style={S.label}>US PRICE</label><input value={form.us_price} onChange={(e) => setForm((current) => ({ ...current, us_price: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>牌價</label><input type="number" value={form.tw_retail_price} onChange={(e) => setForm((current) => ({ ...current, tw_retail_price: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>經銷價</label><input type="number" value={form.tw_reseller_price} onChange={(e) => setForm((current) => ({ ...current, tw_reseller_price: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>狀態</label><input value={form.product_status} onChange={(e) => setForm((current) => ({ ...current, product_status: e.target.value }))} style={S.input} /></div>
          <div><label style={S.label}>分類</label><input value={form.category} onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))} style={S.input} /></div>
          <div><label style={S.label}>替代型號</label><input value={form.replacement_model} onChange={(e) => setForm((current) => ({ ...current, replacement_model: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>重量(kg)</label><input value={form.weight_kg} onChange={(e) => setForm((current) => ({ ...current, weight_kg: e.target.value }))} style={{ ...S.input, ...S.mono }} /></div>
          <div><label style={S.label}>產地</label><input value={form.origin_country} onChange={(e) => setForm((current) => ({ ...current, origin_country: e.target.value }))} style={S.input} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={S.label}>搜尋索引</label><textarea value={form.search_text} onChange={(e) => setForm((current) => ({ ...current, search_text: e.target.value }))} rows={3} style={{ ...S.input, resize: 'vertical', ...S.mono }} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={S.btnGhost}>取消</button>
          <button onClick={save} disabled={saving} style={S.btnPrimary}>{saving ? '儲存中...' : '儲存商品'}</button>
        </div>
      </div>
    </div>
  );
}
export function ImportStatus({ status }) {
  if (!status) return null;
  const success = status.includes('完成');
  const pending = status.includes('匯入中');
  return (
    <div style={{
      ...S.panelMuted,
      background: success ? '#edf9f2' : pending ? '#edf5ff' : '#fff4f4',
      borderColor: success ? '#bdeccb' : pending ? '#94c3ff' : '#ffc7cf',
      color: success ? '#127248' : pending ? '#1976f3' : '#d1435b',
    }}>
      {status}
    </div>
  );
}
export function CsvImportButton({ datasetId, onImported, compact = false }) {
  const { status, busy, selectedFile, previewCount, batchProgress, recentImportHint, chooseFile, importSelected, clearSelection } = useCsvImport(datasetId, onImported);
  const panelWidth = compact ? 248 : 360;
  const panelMinHeight = compact ? 116 : 188;
  const statusMinHeight = compact ? (status ? 48 : 0) : 72;

  return (
    <div style={{ width: '100%', maxWidth: panelWidth, minWidth: compact ? 220 : 320 }}>
      <div style={{ display: 'grid', gap: 8, justifyItems: 'stretch' }}>
        <div style={{ minHeight: statusMinHeight }}>
          <ImportStatus status={status} />
        </div>
        <div style={{ ...S.panelMuted, minHeight: panelMinHeight, padding: compact ? '12px 14px' : S.panelMuted.padding, textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {selectedFile ? (
            <>
              <div>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>FILE_PREVIEW</div>
                <div style={{ fontSize: 12, color: '#1c2740', fontWeight: 700, wordBreak: 'break-word' }}>{selectedFile.name}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>預計匯入 {fmt(previewCount)} 筆</div>
                {recentImportHint ? (
                  <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: '#fff8eb', border: '1px solid #f7d699', color: '#8a5b00', fontSize: 12, lineHeight: 1.6 }}>
                    {recentImportHint.text}
                  </div>
                ) : null}
                {batchProgress ? (
                  <>
                    <div style={{ fontSize: compact ? 11 : 12, color: '#1976f3', marginTop: 8, lineHeight: 1.6 }}>
                      匯入進度 {batchProgress.current}/{batchProgress.total} 批 · {fmt(batchProgress.processed)}/{fmt(batchProgress.all)} 筆 · {batchProgress.percent}%
                    </div>
                    <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: '#dbe7f7', overflow: 'hidden' }}>
                      <div style={{ width: `${batchProgress.percent}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #2d8cff 0%, #19c767 100%)', transition: 'width 0.2s ease' }} />
                    </div>
                  </>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: compact ? 'flex-end' : 'flex-start', flexWrap: compact ? 'wrap' : 'nowrap' }}>
                <button onClick={importSelected} disabled={busy} style={{ ...S.btnPrimary, padding: compact ? '8px 14px' : S.btnPrimary.padding, fontSize: compact ? 12 : 13 }}>
                  {busy && batchProgress ? `匯入中 ${batchProgress.current}/${batchProgress.total}` : busy ? '匯入中...' : '確認匯入'}
                </button>
                <button onClick={clearSelection} disabled={busy} style={{ ...S.btnGhost, padding: compact ? '8px 12px' : S.btnGhost.padding, fontSize: compact ? 12 : 13 }}>取消</button>
              </div>
            </>
          ) : (
            <>
              <div>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>FILE_PREVIEW</div>
                <div style={{ fontSize: 12, color: '#94a1b2', lineHeight: 1.7 }}>尚未選擇檔案</div>
              </div>
              <div style={{ display: 'flex', justifyContent: compact ? 'flex-end' : 'flex-start' }}>
                <label style={{ ...(compact ? { ...S.btnGhost, padding: '8px 14px', fontSize: 12 } : S.btnPrimary), display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  選擇檔案
                  <input
                    type="file"
                    accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel"
                    style={{ display: 'none' }}
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      chooseFile(file);
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export function PanelHeader({ title, meta, badge }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1c2740' }}>{title}</div>
        {meta ? <div style={{ marginTop: 4, fontSize: 12, color: '#7b889b' }}>{meta}</div> : null}
      </div>
      {badge}
    </div>
  );
}
export function Pager({ page, limit, total, onPageChange, onLimitChange }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (limit || 20)));

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>每頁</span>
        <select value={limit} onChange={(e) => onLimitChange(Number(e.target.value))} style={{ ...S.input, width: 90, padding: '8px 10px' }}>
          {[20, 50, 100, 200].map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} style={S.btnGhost}>← 上一頁</button>
        <span style={{ color: '#666', fontSize: 12, ...S.mono }}>P{page} / {totalPages}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} style={S.btnGhost}>下一頁 →</button>
      </div>
    </div>
  );
}
export function SaleDetailDrawer({ slipNumber, open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !slipNumber) return;
    setLoading(true);
    setError('');
    apiGet({ action: 'sale_detail', slip_number: slipNumber })
      .then(setDetail)
      .catch((err) => setError(err.message || '讀取銷貨單失敗'))
      .finally(() => setLoading(false));
  }, [open, slipNumber]);

  if (!open) return null;

  const sale = detail?.sale;
  const invoice = detail?.invoice;
  const items = detail?.items || [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 'min(720px, 100vw)', height: '100vh', background: '#f6f9fc', boxShadow: '-18px 0 50px rgba(18,26,42,0.2)', padding: '24px 22px 28px', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={S.eyebrow}>Sales Detail</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1c2740' }}>{slipNumber}</div>
            <div style={{ fontSize: 12, color: '#7b889b', marginTop: 6 }}>完整銷貨單檢視</div>
          </div>
          <button onClick={onClose} style={S.btnGhost}>關閉</button>
        </div>
        {loading ? <Loading /> : error ? <ImportStatus status={error} /> : sale ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div style={S.panelMuted}><div style={S.label}>客戶</div><div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700 }}>{sale.customer_name || '-'}</div></div>
              <div style={S.panelMuted}><div style={S.label}>銷貨日期</div><div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{sale.sale_date || '-'}</div></div>
              <div style={S.panelMuted}><div style={S.label}>業務</div><div style={{ fontSize: 14, color: '#1c2740' }}>{sale.sales_person || '-'}</div></div>
              <div style={S.panelMuted}><div style={S.label}>發票號碼</div><div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{sale.invoice_number || '-'}</div></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div style={S.panelMuted}><div style={S.label}>未稅</div><div style={{ fontSize: 18, color: '#1c2740', fontWeight: 700, ...S.mono }}>{fmtP(sale.subtotal)}</div></div>
              <div style={S.panelMuted}><div style={S.label}>稅額</div><div style={{ fontSize: 18, color: '#1c2740', fontWeight: 700, ...S.mono }}>{fmtP(sale.tax)}</div></div>
              <div style={S.panelMuted}><div style={S.label}>總額</div><div style={{ fontSize: 18, color: '#129c59', fontWeight: 700, ...S.mono }}>{fmtP(sale.total)}</div></div>
              <div style={S.panelMuted}><div style={S.label}>毛利</div><div style={{ fontSize: 18, color: '#1976f3', fontWeight: 700, ...S.mono }}>{fmtP(sale.gross_profit)}</div></div>
            </div>
            {invoice ? (
              <div style={S.card}>
                <PanelHeader title="發票資訊" meta="來自 qb_invoices" badge={<div style={S.tag('green')}>INVOICE</div>} />
                <div style={{ fontSize: 12, color: '#617084', lineHeight: 1.8 }}>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>NUMBER</span> {invoice.invoice_number || '-'}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>TYPE</span> {invoice.invoice_type || '-'}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>COMPANY</span> {invoice.company_name || '-'}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>TAX_ID</span> {invoice.tax_id || '-'}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>AMOUNT</span> {fmtP(invoice.amount)}</div>
                  <div><span style={{ color: '#7b889b', ...S.mono }}>ISSUED</span> {fmtDate(invoice.issued_at)}</div>
                </div>
              </div>
            ) : null}
            <div style={S.card}>
              <PanelHeader title="商品明細" meta="若訂單明細已進 qb_order_items，這裡會直接列出。" badge={<div style={S.tag(items.length ? 'green' : 'red')}>{items.length ? `${fmt(items.length)} 筆` : '目前無明細'}</div>} />
              {items.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0,1fr) 80px 100px 110px', gap: 12, color: '#7b889b', fontSize: 10, ...S.mono, borderBottom: '1px solid #e6edf5', paddingBottom: 8 }}>
                    <div>品號</div><div>品名</div><div style={{ textAlign: 'right' }}>數量</div><div style={{ textAlign: 'right' }}>單價</div><div style={{ textAlign: 'right' }}>小計</div>
                  </div>
                  {items.map((item) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '140px minmax(0,1fr) 80px 100px 110px', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #eef3f8' }}>
                      <div style={{ color: '#1976f3', fontSize: 12, fontWeight: 700, ...S.mono }}>{item.item_number || '-'}</div>
                      <div style={{ color: '#1c2740', fontSize: 13 }}>{item.description || '-'}</div>
                      <div style={{ color: '#617084', textAlign: 'right', ...S.mono }}>{fmt(item.quantity)}</div>
                      <div style={{ color: '#617084', textAlign: 'right', ...S.mono }}>{fmtP(item.unit_price)}</div>
                      <div style={{ color: '#129c59', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(item.subtotal)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="目前這張銷貨單還沒有對應的商品明細資料。若後續把 qb_order_items 補齊，這裡會直接顯示。" />
              )}
            </div>
          </div>
        ) : <EmptyState text="找不到這張銷貨單" />}
      </div>
    </div>
  );
}
export function MiniDonut({ value, color }) {
  const safeValue = Math.max(0, Math.min(100, value || 0));
  const degrees = Math.round((safeValue / 100) * 360);
  return (
    <div
      style={{
        width: 66,
        height: 66,
        borderRadius: '50%',
        background: `conic-gradient(${color} ${degrees}deg, #e8eef6 ${degrees}deg 360deg)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto',
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1c2740', fontSize: 12, fontWeight: 700, ...S.mono }}>
        {safeValue}%
      </div>
    </div>
  );
}
export function buildLinePath(values, width, height) {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  const step = safeValues.length > 1 ? width / (safeValues.length - 1) : width;

  return safeValues
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * (height - 10) - 5;
      return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
    })
    .join(' ');
}

export function TrendChart({ monthly }) {
  const messageSeries = monthly?.map((item) => item.count) || [];
  const customerSeries = monthly?.map((item) => item.customers) || [];
  const messagePath = buildLinePath(messageSeries, 640, 180);
  const customerPath = buildLinePath(customerSeries, 640, 180);
  const messageArea = `${messagePath} L640 220 L0 220 Z`;
  const customerArea = `${customerPath} L640 220 L0 220 Z`;

  return (
    <div style={{ height: 240, borderRadius: 14, background: 'linear-gradient(180deg, #f9fbff 0%, #f0f5fb 100%)', border: '1px solid #dbe6f3', padding: 16, overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: '16px 16px 38px', backgroundImage: 'linear-gradient(#edf2f8 1px, transparent 1px), linear-gradient(90deg, #edf2f8 1px, transparent 1px)', backgroundSize: '100% 46px, 72px 100%', borderRadius: 10 }} />
      <svg viewBox="0 0 640 220" style={{ position: 'relative', width: '100%', height: '100%' }}>
        <defs>
          <linearGradient id="areaBlue" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#38a8ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#38a8ff" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="areaGray" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#93a4bb" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#93a4bb" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d={messageArea} fill="url(#areaBlue)" />
        <path d={customerArea} fill="url(#areaGray)" />
        <path d={messagePath} fill="none" stroke="#1696f3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d={customerPath} fill="none" stroke="#c2ccd8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ position: 'absolute', left: 22, right: 20, bottom: 12, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', color: '#8090a5', fontSize: 11, ...S.mono }}>
        {(monthly || []).map((item) => (
          <div key={item.label}>{item.label}</div>
        ))}
      </div>
    </div>
  );
}
export function TrendLineChart({ daily }) {
  const counts = daily?.map((item) => item.count) || [];
  const path = buildLinePath(counts, 560, 150);
  const max = Math.max(...(counts.length ? counts : [0]), 1);
  const step = counts.length > 1 ? 560 / (counts.length - 1) : 560;

  return (
    <div style={{ height: 240, borderRadius: 14, background: 'linear-gradient(180deg, #1db5d9 0%, #1798cf 100%)', padding: 18, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 18, borderRadius: 12, backgroundImage: 'linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px)', backgroundSize: '100% 44px' }} />
      <svg viewBox="0 0 560 180" style={{ position: 'relative', width: '100%', height: '100%' }}>
        <path d={path} fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {counts.map((value, idx) => {
          const x = idx * step;
          const y = 150 - (value / max) * 140 - 5;
          return <circle key={idx} cx={x} cy={y} r="4.5" fill="#fff" />;
        })}
      </svg>
      <div style={{ position: 'absolute', left: 18, right: 18, bottom: 12, display: 'grid', gridTemplateColumns: `repeat(${Math.max((daily || []).length, 1)}, 1fr)`, color: 'rgba(255,255,255,0.78)', fontSize: 10, ...S.mono }}>
        {(daily || []).map((item) => (
          <div key={item.label}>{item.label}</div>
        ))}
      </div>
    </div>
  );
}
export function StatCard({ code, label, value, sub, accent, tone = 'blue' }) {
  const palette = {
    blue: ['#16a7d8', '#0c8bc2'],
    green: ['#31c764', '#18a74d'],
    yellow: ['#f1be19', '#dea000'],
    red: ['#ef4764', '#d52f54'],
    navy: ['#4d6fff', '#2f4dde'],
  };
  const [start, end] = palette[tone] || palette.blue;
  return (
    <div style={{ minWidth: 165, padding: '18px 18px 16px', position: 'relative', overflow: 'hidden', borderRadius: 14, background: `linear-gradient(135deg, ${start} 0%, ${end} 100%)`, color: '#fff', boxShadow: '0 16px 34px rgba(20,35,60,0.12)' }}>
      <div style={{ position: 'absolute', top: 14, right: 16, fontSize: 10, color: 'rgba(255,255,255,0.55)', ...S.mono }}>{code}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.76)', marginBottom: 10, letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent || '#fff', ...S.mono, letterSpacing: -1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.86)', marginTop: 8 }}>{sub}</div>}
      <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.16)', fontSize: 11, color: 'rgba(255,255,255,0.88)', fontWeight: 600 }}>More info</div>
    </div>
  );
}


export function RankingPanel({ title, rows, emptyText, valueLabel }) {
  return (
    <div style={S.card}>
      <PanelHeader title={title} meta="鼎新 A1 對照分析" />
      {rows?.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((row, index) => (
            <div key={`${title}-${row.name}-${index}`} style={{ ...S.panelMuted, display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) 130px 120px', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: 999, background: index < 3 ? '#edf5ff' : '#f4f7fb', color: index < 3 ? '#1976f3' : '#7b889b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, ...S.mono }}>
                {index + 1}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>毛利 {fmtP(row.gross_profit)}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 13, color: '#129c59', fontWeight: 700, ...S.mono }}>{fmtP(row.total)}</div>
              <div style={{ textAlign: 'right', fontSize: 11, color: '#7b889b', ...S.mono }}>{valueLabel}</div>
            </div>
          ))}
        </div>
      ) : <EmptyState text={emptyText} />}
    </div>
  );
}


export function ReportShortcut({ code, title, desc, onClick, tone = 'blue' }) {
  const tones = {
    blue: ['#edf5ff', '#94c3ff', '#1976f3'],
    green: ['#edfdf3', '#bbf7d0', '#16a34a'],
    yellow: ['#fff8eb', '#f7d699', '#d97706'],
    red: ['#fff1f2', '#fecdd3', '#e11d48'],
  };
  const [bg, border, color] = tones[tone] || tones.blue;
  return (
    <button onClick={onClick} style={{ ...S.card, width: '100%', textAlign: 'left', cursor: 'pointer', background: bg, borderColor: border, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color, ...S.mono }}>{code}</div>
          <div style={{ fontSize: 18, color: '#1c2740', fontWeight: 700, marginTop: 8 }}>{title}</div>
          <div style={{ fontSize: 12, color: '#617084', marginTop: 8, lineHeight: 1.7 }}>{desc}</div>
        </div>
        <div style={{ ...S.tag(''), color }}>{'前往'}</div>
      </div>
    </button>
  );
}


export function QuoteCreateModal({ open, onClose, onCreated, tableReady = true }) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [productLoading, setProductLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => {
    const today = getPresetDateRange('today').from;
    const validUntil = toDateInputValue(new Date(todayInTaipei().getTime() + 7 * 86400000));
    return {
      quote_date: today,
      valid_until: validUntil,
      status: 'draft',
      remark: '',
      discount_amount: 0,
      shipping_fee: 0,
      items: [],
    };
  });

  useEffect(() => {
    if (!open) return;
    setError('');
  }, [open]);

  const searchCustomers = async () => {
    if (!customerSearch.trim()) return;
    setCustomerLoading(true);
    try {
      const result = await apiGet({ action: 'formal_customers', page: '1', limit: '10', search: customerSearch.trim() });
      setCustomerResults(result.customers || []);
    } finally {
      setCustomerLoading(false);
    }
  };

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch('');
    setCustomerResults([]);
  };

  const searchProducts = async () => {
    if (!productSearch.trim()) return;
    setProductLoading(true);
    try {
      const result = await apiGet({ action: 'products', q: productSearch.trim(), category: 'all', page: '0', limit: '10' });
      setProductResults(result.products || []);
    } finally {
      setProductLoading(false);
    }
  };

  const addProduct = (product) => {
    setForm((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          product_id: null,
          item_number_snapshot: product.item_number || '',
          description_snapshot: product.description || '',
          qty: 1,
          unit_price: Number(product.tw_reseller_price || product.tw_retail_price || 0),
        },
      ],
    }));
    setProductSearch('');
    setProductResults([]);
  };

  const updateItem = (index, key, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
  };

  const removeItem = (index) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const subtotal = form.items.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.unit_price || 0)), 0);
  const taxableBase = Math.max(0, subtotal - Number(form.discount_amount || 0) + Number(form.shipping_fee || 0));
  const taxAmount = Math.round(taxableBase * 0.05);
  const totalAmount = taxableBase + taxAmount;

  const submit = async () => {
    if (!tableReady) {
      setError('目前尚未建立 erp_quotes / erp_quote_items，請先執行 ERP schema。');
      return;
    }
    if (!selectedCustomer?.id) {
      setError('請先選擇正式客戶');
      return;
    }
    if (!form.items.length) {
      setError('請至少加入一筆商品');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiPost({
        action: 'create_quote',
        customer_id: selectedCustomer.id,
        quote_date: form.quote_date,
        valid_until: form.valid_until,
        status: form.status,
        remark: form.remark,
        discount_amount: Number(form.discount_amount || 0),
        shipping_fee: Number(form.shipping_fee || 0),
        items: form.items,
      });
      onCreated?.();
      onClose?.();
    } catch (err) {
      setError(err.message || '建立報價單失敗');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.46)', zIndex: 220, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ width: 'min(1100px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#f6f9fc', borderRadius: 18, padding: '24px 22px 28px', boxShadow: '0 24px 70px rgba(8,12,20,0.3)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={S.eyebrow}>Create Quote</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1c2740' }}>建立報價單</div>
            <div style={{ fontSize: 12, color: '#7b889b', marginTop: 6 }}>先建立基本報價單，之後就能往訂單與銷貨流程接。</div>
          </div>
          <button onClick={onClose} style={S.btnGhost}>關閉</button>
        </div>
        {error ? <div style={{ ...S.card, background: '#fff1f2', borderColor: '#fecdd3', color: '#b42318', marginBottom: 14 }}>{error}</div> : null}
        {!tableReady ? (
          <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00', marginBottom: 14 }}>
            目前尚未建立 `erp_quotes` / `erp_quote_items`，請先跑 [`/Users/tungyiwu/Desktop/AI/Auto QB/Auto-bot-QB/docs/erp-schema-v1.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-schema-v1.sql)。
          </div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={S.card}>
              <PanelHeader title="選擇客戶" meta="先綁正式客戶，再建立報價。" badge={selectedCustomer ? <div style={S.tag('green')}>已選客戶</div> : null} />
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchCustomers()} placeholder="搜尋公司、聯絡人或電話..." style={{ ...S.input, flex: 1 }} />
                <button onClick={searchCustomers} style={S.btnPrimary}>搜尋</button>
              </div>
              {customerLoading ? <Loading /> : customerResults.length > 0 ? (
                <div style={{ display: 'grid', gap: 8, maxHeight: 230, overflowY: 'auto', paddingRight: 4 }}>
                  {customerResults.map((customer) => (
                    <button key={customer.id} onClick={() => selectCustomer(customer)} style={{ ...S.panelMuted, width: '100%', textAlign: 'left', cursor: 'pointer', border: `1px solid ${selectedCustomer?.id === customer.id ? '#94c3ff' : '#dbe3ee'}`, background: selectedCustomer?.id === customer.id ? '#edf5ff' : '#fff' }}>
                      <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700 }}>{customer.company_name || customer.name || '未命名客戶'}</div>
                      <div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>{customer.customer_code || '-'} · {customer.phone || '-'}</div>
                    </button>
                  ))}
                </div>
              ) : selectedCustomer ? (
                <div style={{ ...S.panelMuted, borderColor: '#bde6c9', background: '#f4fbf6', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#129c59', fontWeight: 700, ...S.mono }}>SELECTED CUSTOMER</div>
                      <div style={{ fontSize: 16, color: '#1c2740', fontWeight: 700, marginTop: 6 }}>{selectedCustomer.company_name || selectedCustomer.name || '未命名客戶'}</div>
                    </div>
                    <button onClick={() => setSelectedCustomer(null)} style={{ ...S.btnGhost, padding: '6px 10px', fontSize: 12 }}>更換客戶</button>
                  </div>
                  <div style={{ fontSize: 12, color: '#617084' }}>
                    {selectedCustomer.customer_code || '-'} · {selectedCustomer.phone || '-'}
                  </div>
                </div>
              ) : <div style={{ fontSize: 12, color: '#7b889b' }}>輸入關鍵字後搜尋正式客戶</div>}
            </div>

            <div style={S.card}>
              <PanelHeader title="報價明細" meta="用商品搜尋快速加入明細，或直接調整數量與單價。" badge={<div style={S.tag('')}>{fmt(form.items.length)} 項</div>} />
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchProducts()} placeholder="搜尋料號或品名..." style={{ ...S.input, flex: 1, ...S.mono }} />
                <button onClick={searchProducts} style={S.btnPrimary}>找商品</button>
              </div>
              {productLoading ? <Loading /> : productResults.length > 0 ? (
                <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                  {productResults.map((product) => (
                    <button key={product.item_number} onClick={() => addProduct(product)} style={{ ...S.panelMuted, width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                      <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{product.item_number}</div>
                      <div style={{ fontSize: 13, color: '#1c2740', marginTop: 4 }}>{product.description || '-'}</div>
                      <div style={{ fontSize: 12, color: '#129c59', marginTop: 4, ...S.mono }}>{fmtP(product.tw_reseller_price || product.tw_retail_price)}</div>
                    </button>
                  ))}
                </div>
              ) : null}
              {form.items.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {form.items.map((item, index) => (
                    <div key={`${item.item_number_snapshot}-${index}`} style={{ ...S.panelMuted, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px 120px 100px', gap: 10, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{item.item_number_snapshot || '-'}</div>
                        <div style={{ fontSize: 13, color: '#1c2740', marginTop: 4 }}>{item.description_snapshot || '-'}</div>
                      </div>
                      <input type="number" min="1" value={item.qty} onChange={(e) => updateItem(index, 'qty', Number(e.target.value || 1))} style={{ ...S.input, textAlign: 'center', ...S.mono }} />
                      <input type="number" min="0" value={item.unit_price} onChange={(e) => updateItem(index, 'unit_price', Number(e.target.value || 0))} style={{ ...S.input, textAlign: 'right', ...S.mono }} />
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ fontSize: 13, color: '#129c59', fontWeight: 700, textAlign: 'right', ...S.mono }}>{fmtP(Number(item.qty || 0) * Number(item.unit_price || 0))}</div>
                        <button onClick={() => removeItem(index)} style={{ ...S.btnGhost, color: '#e24d4d', borderColor: '#ffd5d5', padding: '6px 10px', fontSize: 12 }}>移除</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState text="目前還沒有商品明細，先搜尋商品加入。" />}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <div style={S.card}>
              <PanelHeader title="報價抬頭" meta="設定日期、狀態與補充備註。" />
              <div style={{ display: 'grid', gap: 12 }}>
                <div><label style={S.label}>報價日期</label><input type="date" value={form.quote_date} onChange={(e) => setForm((current) => ({ ...current, quote_date: e.target.value }))} style={S.input} /></div>
                <div><label style={S.label}>有效期限</label><input type="date" value={form.valid_until} onChange={(e) => setForm((current) => ({ ...current, valid_until: e.target.value }))} style={S.input} /></div>
                <div><label style={S.label}>狀態</label><select value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))} style={S.input}><option value="draft">draft</option><option value="sent">sent</option><option value="approved">approved</option></select></div>
                <div><label style={S.label}>備註</label><textarea value={form.remark} onChange={(e) => setForm((current) => ({ ...current, remark: e.target.value }))} rows={4} style={{ ...S.input, resize: 'vertical' }} /></div>
              </div>
            </div>
            <div style={S.card}>
              <PanelHeader title="金額摘要" meta="系統會自動算小計、稅額與總額。" />
              <div style={{ display: 'grid', gap: 12 }}>
                <div><label style={S.label}>折扣金額</label><input type="number" min="0" value={form.discount_amount} onChange={(e) => setForm((current) => ({ ...current, discount_amount: Number(e.target.value || 0) }))} style={{ ...S.input, ...S.mono }} /></div>
                <div><label style={S.label}>運費</label><input type="number" min="0" value={form.shipping_fee} onChange={(e) => setForm((current) => ({ ...current, shipping_fee: Number(e.target.value || 0) }))} style={{ ...S.input, ...S.mono }} /></div>
                <div style={{ ...S.panelMuted, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>小計</span><strong style={S.mono}>{fmtP(subtotal)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>稅額 (5%)</span><strong style={S.mono}>{fmtP(taxAmount)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#129c59', fontWeight: 700 }}><span>總額</span><strong style={S.mono}>{fmtP(totalAmount)}</strong></div>
                </div>
                <button onClick={submit} disabled={saving || !tableReady} style={{ ...S.btnPrimary, width: '100%', opacity: saving || !tableReady ? 0.7 : 1 }}>{saving ? '建立中...' : '建立報價單'}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
