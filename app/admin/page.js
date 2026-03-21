'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';

const API = '/api/admin';
const ADMIN_TOKEN_KEY = 'qb_admin_token';
const SALES_DOCUMENT_FOCUS_KEY = 'qb_sales_document_focus';

const fmt = n => n?.toLocaleString('zh-TW') || '0';
const fmtMs = ms => !ms ? '-' : ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
const fmtDate = d => d ? new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
const fmtP = n => n ? `NT$${Number(n).toLocaleString()}` : '-';

function todayInTaipei() {
  const now = new Date();
  const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return new Date(taipei.getFullYear(), taipei.getMonth(), taipei.getDate());
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPresetDateRange(preset) {
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

function useViewportWidth() {
  const [width, setWidth] = useState(1400);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return width;
}

async function authFetch(url, options = {}) {
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

async function apiGet(params = {}) {
  const p = new URLSearchParams(params);
  const res = await authFetch(`${API}?${p.toString()}`);
  return res.json();
}

async function apiPost(body) {
  const res = await authFetch(API, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}

function parseCsvLine(line) {
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

function parseCsvText(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim() !== '');
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
}

function normalizeSpreadsheetRows(rows) {
  return rows.filter((row) => Object.values(row || {}).some((value) => String(value ?? '').trim() !== ''));
}

function mapCustomerStage(customerType) {
  const text = String(customerType || '').trim();
  if (text.includes('正式')) return 'customer';
  if (['潛在', '詢價', '準客'].some((keyword) => text.includes(keyword))) return 'prospect';
  return 'lead';
}

function buildCustomerNotes(row) {
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

function buildProductDescription(row) {
  return [row['品名'], row['規格一'], row['規格二']].filter(Boolean).join(' ').trim();
}

function buildProductSearchText(row) {
  return [row['品號'], row['品名'], row['規格一'], row['規格二'], row['商品分類'], row['主供應商']].filter(Boolean).join(' ').trim();
}

function mapRowsForDataset(datasetId, rows) {
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

async function parseImportFile(file, datasetId) {
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

const IMPORT_DATASETS = {
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

const IMPORT_BATCH_SIZE = {
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

function useCsvImport(datasetId, onImported) {
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
const S = {
  page: { minHeight: '100vh', background: '#fdfdfe', color: '#1a1d23', fontFamily: "'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  shell: { display: 'flex', minHeight: '100vh' },
  sidebar: { width: 260, background: '#ffffff', color: '#64748b', padding: '20px 0 20px', borderRight: '1px solid #F2F2F2', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#fdfdfe' },
  header: { height: 64, background: '#ffffff', borderBottom: '1px solid #F2F2F2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', position: 'sticky', top: 0, zIndex: 100 },
  content: { flex: 1, padding: '28px 32px 40px', minHeight: 'calc(100vh - 64px)' },
  card: { background: '#ffffff', border: '1px solid #F2F2F2', borderRadius: 18, padding: '20px 22px', marginBottom: 16, boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -4px -4px 12px rgba(255,255,255,0.8)', transition: 'all 0.25s ease' },
  panelMuted: { background: '#fdfdfe', border: '1px solid #F2F2F2', borderRadius: 14, padding: '14px 16px' },
  input: { background: '#ffffff', border: '1px solid #d1d9e0', borderRadius: 10, padding: '10px 14px', color: '#1a1d23', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: "'Noto Sans TC', sans-serif", transition: 'border-color 0.2s, box-shadow 0.2s' },
  btnPrimary: { background: '#009061', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif", letterSpacing: 0.2, boxShadow: '0 1px 3px rgba(0,144,97,0.3)', transition: 'background 0.15s, box-shadow 0.15s' },
  btnGhost: { background: '#fff', color: '#475569', border: '1px solid #d1d9e0', borderRadius: 10, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif", transition: 'border-color 0.15s, background 0.15s' },
  btnLine: { background: '#06c755', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 13, boxShadow: '0 1px 3px rgba(6,199,85,0.3)' },
  label: { color: '#64748b', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: 0.5 },
  mono: { fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace", letterSpacing: 0.3 },
  pageLead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, marginBottom: 24 },
  pageTitle: { fontSize: 24, fontWeight: 700, color: '#1a1d23', letterSpacing: -0.3, marginBottom: 4 },
  pageDesc: { fontSize: 14, color: '#64748b', lineHeight: 1.7, maxWidth: 760 },
  eyebrow: { fontSize: 11, color: '#009061', fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, ...{ fontFamily: "'SF Mono', 'Fira Code', monospace" } },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 },
  twoCol: { display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' },
  tag: (color) => ({ display: 'inline-block', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: color === 'green' ? '#ecfdf5' : color === 'red' ? '#fef2f2' : color === 'line' ? '#ecfdf5' : '#f1f5f9', color: color === 'green' ? '#059669' : color === 'red' ? '#dc2626' : color === 'line' ? '#059669' : '#475569', border: 'none' }),
};

/* ========================================= SHARED ========================================= */
function Loading() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div style={{ color: '#94a3b8', fontSize: 13 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#009061', marginRight: 8, animation: 'pulse 1.5s infinite' }} />載入中...</div></div>;
}
function EmptyState({ text }) {
  return <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8', fontSize: 13 }}>{text}</div>;
}
function StatusBanner({ text, tone = 'neutral' }) {
  if (!text) return null;
  const toneMap = {
    success: { background: '#ecfdf5', borderColor: '#a7f3d0', color: '#059669' },
    error: { background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626' },
    info: { background: '#ecfdf5', borderColor: '#a7f3d0', color: '#009061' },
    neutral: { background: '#fdfdfe', borderColor: '#e2e8f0', color: '#64748b' },
  };
  return <div style={{ ...S.card, padding: '14px 16px', ...(toneMap[tone] || toneMap.neutral) }}>{text}</div>;
}
function PageLead({ eyebrow, title, description, action }) {
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

function EnvHealth({ setTab }) {
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

function ProductEditModal({ product, onClose, onSaved }) {
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
function ImportStatus({ status }) {
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
function CsvImportButton({ datasetId, onImported, compact = false }) {
  const { status, busy, selectedFile, previewCount, batchProgress, recentImportHint, chooseFile, importSelected, clearSelection } = useCsvImport(datasetId, onImported);
  const panelWidth = compact ? 248 : 360;
  const panelMinHeight = compact ? 116 : 188;
  const statusMinHeight = compact ? (status ? 48 : 0) : 72;

  return (
    <div>
      {status && <ImportStatus status={status} />}
      <div style={selectedFile ? { ...S.panelMuted, padding: '12px 14px', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' } : {}}>
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
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <label style={{ ...S.btnGhost, padding: '8px 16px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  匯入
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
  );
}
function PanelHeader({ title, meta, badge }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1c2740' }}>{title}</div>
        {meta ? <div style={{ marginTop: 4, fontSize: 12, color: '#7b889b' }}>{meta}</div> : null}
      </div>
      {badge}
    </div>
  );
}
function Pager({ page, limit, total, onPageChange, onLimitChange }) {
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
function SaleDetailDrawer({ slipNumber, open, onClose }) {
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
function MiniDonut({ value, color }) {
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
function buildLinePath(values, width, height) {
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

function TrendChart({ monthly }) {
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
function TrendLineChart({ daily }) {
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
function StatCard({ code, label, value, sub, accent, tone = 'blue' }) {
  const toneColors = {
    blue: { accent: '#009061', bg: '#ecfdf5', light: '#6ee7b7' },
    green: { accent: '#059669', bg: '#ecfdf5', light: '#6ee7b7' },
    yellow: { accent: '#d97706', bg: '#fffbeb', light: '#fcd34d' },
    red: { accent: '#dc2626', bg: '#fef2f2', light: '#fca5a5' },
    navy: { accent: '#4f46e5', bg: '#eef2ff', light: '#a5b4fc' },
  };
  const t = toneColors[tone] || toneColors.blue;
  return (
    <div className="qb-card-hover" style={{ minWidth: 140, padding: '16px 18px 14px', position: 'relative', overflow: 'hidden', borderRadius: 14, background: '#ffffff', border: '1px solid #F2F2F2', boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -4px -4px 12px rgba(255,255,255,0.8)', cursor: 'pointer' }}>
      <div style={{ position: 'absolute', top: 12, right: 14, width: 32, height: 32, borderRadius: 8, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: t.accent, fontWeight: 700, ...S.mono }}>{code}</div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent || '#1a1d23', ...S.mono, letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>{sub}</div>}
    </div>
  );
}

/* ========================================= DASHBOARD ========================================= */
function Dashboard() {
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet({ action: 'stats' }).then(setStats).finally(() => setLoading(false)); }, []);
  if (loading) return <Loading />;
  const interaction = stats?.interaction_breakdown || {};
  const summaryItems = [
    [
      'AI 回覆效率',
      `最近樣本平均回覆時間約 ${fmtMs(stats?.avg_response_ms)}，${(interaction.fast_reply_rate || 0) >= 70 ? '整體反應偏快' : '仍有再優化空間'}`,
    ],
    [
      '產品命中情況',
      `近期查詢中有 ${interaction.matched_rate || 0}% 能直接命中產品資料，熱門料號集中在前十名排行。`,
    ],
    [
      '客戶回流比例',
      `最近互動客戶中約 ${interaction.repeat_customer_rate || 0}% 有重複詢價，適合追蹤高意圖名單。`,
    ],
  ];
  const actionItems = [
    {
      title: '確認今日查詢流量',
      desc: `今日累積 ${fmt(stats?.today_messages)} 筆查詢，檢查是否與預期流量一致。`,
      color: '#1976f3',
    },
    {
      title: '追蹤本週互動節奏',
      desc: `本週已有 ${fmt(stats?.week_messages)} 筆訊息，留意是否出現異常尖峰或回落。`,
      color: '#25c66f',
    },
    {
      title: '檢視熱門詢價產品',
      desc: stats?.top_products?.[0]
        ? `目前查詢最多的是 ${stats.top_products[0].item_number}，可優先準備對應銷售話術。`
        : '目前尚未累積足夠熱門產品資料，可待更多互動後再觀察。',
      color: '#ef4764',
    },
    {
      title: '確認後台與 webhook 狀態',
      desc: '部署後建議持續抽查 admin 登入與 LINE webhook 是否皆可正常使用。',
      color: '#f1be19',
    },
  ];
  return (
    <div>
      <PageLead
        eyebrow="Dashboard"
        title="營運儀表板"
        description="集中查看 Quick Buy Bot 的查詢量、客戶互動與熱門產品，整體結構參考經典 admin dashboard 的高資訊密度佈局。"
      />
      <div style={{ ...S.statGrid, gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : S.statGrid.gridTemplateColumns }}>
        <StatCard code="MSG_TD" label="今日查詢" value={fmt(stats?.today_messages)} sub="New orders" tone="blue" />
        <StatCard code="MSG_WK" label="本週查詢" value={fmt(stats?.week_messages)} sub="7-day volume" tone="green" />
        <StatCard code="USR" label="客戶數" value={fmt(stats?.total_customers)} sub="Unique contacts" tone="yellow" />
        <StatCard code="PERF" label="平均回覆" value={fmtMs(stats?.avg_response_ms)} sub="Response time" tone="red" />
      </div>
      <div style={{ ...S.twoCol, gridTemplateColumns: isTablet ? '1fr' : S.twoCol.gridTemplateColumns }}>
        <div style={S.card}>
          <PanelHeader title="熱門查詢產品" meta="最近互動中最常被詢問的產品料號" badge={<div style={{ ...S.tag('green') }}>TOP 10</div>} />
          {stats?.top_products?.length > 0 ? stats.top_products.map((p, i) => (
            <div key={p.item_number} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 100px', alignItems: 'center', padding: '11px 0', borderTop: i > 0 ? '1px solid #e6edf5' : 'none' }}>
              <div style={{ fontSize: 12, color: i < 3 ? '#1976f3' : '#95a2b3', fontWeight: 700, ...S.mono }}>#{i + 1}</div>
              <div style={{ fontSize: 13, color: '#203047', ...S.mono }}>{p.item_number}</div>
              <div style={{ fontSize: 13, color: '#129c59', fontWeight: 700, textAlign: 'right', ...S.mono }}>{p.count}次</div>
            </div>
          )) : <EmptyState text="等待客戶使用 Line Bot 後將顯示數據" />}
        </div>
        <div style={S.card}>
          <PanelHeader title="系統概況" meta="目前部署與營運摘要" badge={<div style={{ ...S.tag('line') }}>LIVE</div>} />
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>TOTAL_MESSAGES</div>
              <div style={{ fontSize: 28, color: '#1c2740', fontWeight: 700, ...S.mono }}>{fmt(stats?.total_messages)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>WEBHOOK</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#129c59' }}>Operational</div>
              </div>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>ADMIN</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1976f3' }}>Protected</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ ...S.twoCol, marginTop: 18, gridTemplateColumns: isTablet ? '1fr' : S.twoCol.gridTemplateColumns }}>
        <div style={S.card}>
          <PanelHeader title="查詢趨勢" meta="模擬營運視圖，呈現近期查詢量與客戶互動波動" badge={<div style={{ ...S.tag('') }}>TREND</div>} />
          <TrendChart monthly={stats?.trend_monthly} />
        </div>
        <div style={S.card}>
          <PanelHeader title="互動概況" meta="以 dashboard 模組方式呈現主要互動指標" badge={<div style={{ ...S.tag('green') }}>LIVE</div>} />
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ ...S.panelMuted, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
              <div>
                <MiniDonut value={interaction.matched_rate} color="#25c66f" />
                <div style={{ marginTop: 8, fontSize: 11, color: '#7b889b', ...S.mono }}>MATCHED</div>
              </div>
              <div>
                <MiniDonut value={interaction.repeat_customer_rate} color="#f1be19" />
                <div style={{ marginTop: 8, fontSize: 11, color: '#7b889b', ...S.mono }}>REPEAT</div>
              </div>
              <div>
                <MiniDonut value={interaction.fast_reply_rate} color="#ef4764" />
                <div style={{ marginTop: 8, fontSize: 11, color: '#7b889b', ...S.mono }}>FAST</div>
              </div>
            </div>
            <div style={{ ...S.panelMuted, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #dbe6f3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1c2740' }}>最近摘要</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#7b889b' }}>快速檢視目前營運狀態</div>
                </div>
                <div style={{ ...S.tag('line') }}>STATUS</div>
              </div>
              <div style={{ padding: '8px 16px' }}>
                {summaryItems.map(([title, desc], idx) => (
                  <div key={title} style={{ padding: '10px 0', borderTop: idx > 0 ? '1px solid #e6edf5' : 'none' }}>
                    <div style={{ fontSize: 13, color: '#1f2b41', fontWeight: 700 }}>{title}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: '#7b889b', lineHeight: 1.7 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ ...S.twoCol, marginTop: 18, gridTemplateColumns: isTablet ? '1fr' : S.twoCol.gridTemplateColumns }}>
        <div style={S.card}>
          <PanelHeader title="成長曲線" meta="以高密度圖表模塊補齊參考圖的 dashboard 視覺語言" badge={<div style={{ ...S.tag('') }}>REPORT</div>} />
          <TrendLineChart daily={stats?.trend_daily} />
        </div>
        <div style={S.card}>
          <PanelHeader title="待辦與提醒" meta="用於追蹤上線後的營運維護工作" badge={<div style={{ ...S.tag('red') }}>ACTION</div>} />
          <div style={{ display: 'grid', gap: 10 }}>
            {actionItems.map(({ title, desc, color }) => (
              <div key={title} style={{ ...S.panelMuted, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, background: color, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, color: '#1c2740', fontWeight: 700 }}>{title}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#7b889b', lineHeight: 1.7 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================= ERP REPORT CENTER ========================================= */
function RankingPanel({ title, rows, emptyText, valueLabel }) {
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

function ReportShortcut({ code, title, desc, onClick, tone = 'blue' }) {
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

function ReportCenter({ setTab }) {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet({ action: 'report_center' })
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  const counts = data?.counts || {};
  const rankings = data?.rankings || {};
  const returns = data?.returns || {};

  return (
    <div>
      <PageLead
        eyebrow="A1 Mapping"
        title="進銷存報表中心"
        description="用鼎新 A1 的邏輯整理我們現在的 ERP 模組，讓客戶、供應商、銷退貨、利潤與排行報表都能直接對應到現有系統。"
      />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="CUST" label="客戶主檔" value={fmt(counts.customers)} tone="blue" />
        <StatCard code="VNDR" label="供應商主檔" value={fmt(counts.vendors)} tone="green" />
        <StatCard code="RETN" label="銷退貨單" value={fmt(counts.sales_returns)} tone="yellow" />
        <StatCard code="PFT" label="利潤資料" value={fmt(counts.profit_rows)} tone="red" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={S.card}>
          <PanelHeader title="銷售報表" meta="鼎新 A1：銷售 / 銷退 / 利潤" />
          <div style={{ display: 'grid', gap: 10 }}>
            <ReportShortcut code="QUOT" title="報價明細表" desc={`目前 ${fmt(counts.quotes)} 筆報價，可查詢與轉單。`} onClick={() => setTab?.('quotes')} tone="blue" />
            <ReportShortcut code="ORDR" title="訂單明細表" desc={`目前 ${fmt(counts.orders)} 筆訂單，可接續出貨與銷貨。`} onClick={() => setTab?.('orders')} tone="green" />
            <ReportShortcut code="SALE" title="銷貨明細表" desc={`目前 ${fmt(counts.sales_documents)} 筆銷貨單，可點單號看內容。`} onClick={() => setTab?.('sales_documents')} tone="yellow" />
            <ReportShortcut code="RETN" title="銷退貨彙總表" desc={`銷貨 ${fmt(returns.saleCount)} 筆 / 退貨 ${fmt(returns.returnCount)} 筆。`} onClick={() => setTab?.('sales_returns')} tone="red" />
            <ReportShortcut code="PFT" title="銷售利潤分析表" desc="對應現有利潤分析頁，可看毛利與日期區間。" onClick={() => setTab?.('profit_analysis')} tone="blue" />
          </div>
        </div>

        <div style={S.card}>
          <PanelHeader title="基本資料" meta="鼎新 A1：客戶 / 供應商 / 商品" />
          <div style={{ display: 'grid', gap: 10 }}>
            <ReportShortcut code="CUST" title="客戶主檔" desc={`目前 ${fmt(counts.customers)} 位正式客戶。`} onClick={() => setTab?.('customers')} tone="blue" />
            <ReportShortcut code="VNDR" title="供應商主檔" desc={`目前 ${fmt(counts.vendors)} 家供應商。`} onClick={() => setTab?.('vendors')} tone="green" />
            <ReportShortcut code="ITEM" title="商品主檔 / 查價" desc="目前先對應產品查價頁，後續可升級成完整商品主檔。" onClick={() => setTab?.('products')} tone="yellow" />
            <ReportShortcut code="LINE" title="LINE 客戶對照" desc="把 LINE 詢價名單綁到正式客戶，對應 CRM/客服入口。" onClick={() => setTab?.('line_customers')} tone="red" />
          </div>
        </div>

        <div style={S.card}>
          <PanelHeader title="分析圖表" meta="鼎新 A1：十大客戶 / 業務銷售 / 排行" />
          <div style={{ display: 'grid', gap: 10 }}>
            <ReportShortcut code="DASH" title="儀表板" desc="綜合 KPI、趨勢、互動概況。" onClick={() => setTab?.('dashboard')} tone="blue" />
            <ReportShortcut code="IMPT" title="資料匯入中心" desc="CSV / XLSX 對應匯入客戶、供應商、報價、訂單、銷貨與報表資料。" onClick={() => setTab?.('imports')} tone="green" />
            <ReportShortcut code="MSG" title="客服/AI 對話紀錄" desc="雖然不是鼎新 A1 原生模組，但可對應客服紀錄與詢價來源。" onClick={() => setTab?.('messages')} tone="yellow" />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
        <RankingPanel title="十大客戶分析圖" rows={rankings.top_customers} emptyText="目前還沒有足夠的銷貨資料來排行客戶" valueLabel="銷售額" />
        <RankingPanel title="業務銷售排名表" rows={rankings.top_sales_people} emptyText="目前還沒有足夠的業務銷貨資料" valueLabel="銷售額" />
      </div>
    </div>
  );
}

/* ========================================= MESSAGES (AI Bot) ========================================= */
function Messages() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState({ messages: [], total: 0, page: 1, limit: 20 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const load = useCallback((page = 1, q = search) => {
    setLoading(true);
    apiGet({ action: 'messages', page: String(page), search: q }).then(setData).finally(() => setLoading(false));
  }, [search]);
  useEffect(() => { load(); }, []);
  return (
    <div>
      <PageLead eyebrow="Messages" title="AI 對話紀錄" description="集中檢視客戶提問、AI 回覆內容與回覆速度，適合追蹤 bot 的實際對話表現。" />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1, search)} placeholder="搜尋訊息內容、客戶名稱..." style={{ ...S.input, flex: 1 }} onFocus={e => e.target.style.borderColor = '#1976f3'} onBlur={e => e.target.style.borderColor = '#ccd6e3'} />
        <button onClick={() => load(1, search)} style={S.btnPrimary}>搜尋</button>
      </div>
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>共 {data.total} 筆紀錄</div>
      {loading ? <Loading /> : data.messages.map(msg => (
        <div key={msg.id} onClick={() => setExpanded(expanded === msg.id ? null : msg.id)} style={{ ...S.card, cursor: 'pointer', padding: '14px 18px', transition: 'border-color 0.2s, transform 0.2s', borderColor: expanded === msg.id ? '#94c3ff' : '#dbe3ee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={S.tag('green')}>{msg.display_name || '客戶'}</span>
              <span style={{ color: '#7b889b', fontSize: 11, ...S.mono }}>{fmtDate(msg.created_at)}</span>
            </div>
            <span style={{ color: '#7b889b', fontSize: 11, ...S.mono }}>{fmtMs(msg.response_time_ms)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#203047' }}><span style={{ color: '#7b889b' }}>Q: </span>{msg.user_message}</div>
          {expanded === msg.id && (
            <div style={{ background: '#f8fbff', border: '1px solid #dbe6f3', borderRadius: 10, padding: '14px 16px', marginTop: 10, fontSize: 12, color: '#617084', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              <span style={{ color: '#1976f3', fontSize: 11, ...S.mono }}>AI_RESPONSE</span>
              <div style={{ marginTop: 6, color: '#263246' }}>{msg.ai_response}</div>
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
        {data.page > 1 && <button onClick={() => load(data.page - 1)} style={S.btnGhost}>← 上一頁</button>}
        <span style={{ color: '#666', padding: '8px 0', fontSize: 12, ...S.mono }}>P{data.page}</span>
        {data.total > data.page * data.limit && <button onClick={() => load(data.page + 1)} style={S.btnGhost}>下一頁 →</button>}
      </div>
    </div>
  );
}

/* ========================================= CUSTOMERS ========================================= */
function FormalCustomers() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ customers: [], total: 0, page: 1, limit: 50, erp_ready: true, customer_stage_ready: false, latest_import: null });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedSlipNumber, setSelectedSlipNumber] = useState('');

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'formal_customers', page: String(page), search: q, limit: String(limit) });
      setData(result);
      const existingSelection = (result.customers || []).find((customer) => customer.id === selectedCustomerId);
      if (!existingSelection && result.customers?.[0]?.id) {
        setSelectedCustomerId(result.customers[0].id);
      }
      if (!result.customers?.length) {
        setSelectedCustomerId('');
        setDetail(null);
      }
    } finally {
      setLoading(false);
    }
  }, [search, pageSize, selectedCustomerId]);

  useEffect(() => { load(); }, []);

  const loadDetail = useCallback(async (erpCustomerId) => {
    if (!erpCustomerId) return;
    setDetailLoading(true);
    try {
      const result = await apiGet({ action: 'formal_customer_detail', erp_customer_id: erpCustomerId });
      setDetail(result);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      loadDetail(selectedCustomerId);
    }
  }, [selectedCustomerId, loadDetail]);

  const stageMeta = {
    lead: { label: '詢問名單', color: '' },
    prospect: { label: '潛在客戶', color: 'yellow' },
    customer: { label: '正式客戶', color: 'green' },
    vip: { label: 'VIP', color: 'red' },
  };
  const detailCustomer = detail?.customer;
  const summary = detail?.summary || {};

  const listPane = (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div style={{ ...S.panelMuted, background: '#ffffff' }}>
          <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>DB_CUSTOMERS</div>
          <div style={{ fontSize: 28, color: '#1c2740', fontWeight: 700, ...S.mono }}>{fmt(data.total)}</div>
        </div>
        <div style={{ ...S.panelMuted, background: '#ffffff' }}>
          <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>LATEST_IMPORT</div>
          <div style={{ fontSize: 28, color: '#1976f3', fontWeight: 700, ...S.mono }}>{fmt(data.latest_import?.count || 0)}</div>
        </div>
        <div style={{ ...S.panelMuted, background: '#ffffff' }}>
          <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>CHECKPOINT</div>
          <div style={{ fontSize: 14, color: data.latest_import?.count === data.total ? '#129c59' : '#f59e0b', fontWeight: 700 }}>
            {data.latest_import?.count === data.total ? '匯入筆數與資料庫一致' : '匯入筆數與目前資料庫不同步'}
          </div>
        </div>
      </div>
      {loading ? <Loading /> : data.customers.length === 0 ? <EmptyState text="目前沒有符合條件的正式客戶資料" /> : (
        isMobile ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {data.customers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                style={{ ...S.card, padding: '14px 16px', marginBottom: 0, textAlign: 'left', cursor: 'pointer', background: selectedCustomerId === customer.id ? '#f0f7ff' : '#fff', borderColor: selectedCustomerId === customer.id ? '#94c3ff' : '#dbe3ee' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, color: '#1c2740', fontWeight: 700 }}>{customer.company_name || customer.name || '未命名客戶'}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: '#617084', lineHeight: 1.7 }}>
                      <div><span style={{ color: '#7b889b', ...S.mono }}>CODE</span> {customer.customer_code || '-'}</div>
                      <div><span style={{ color: '#7b889b', ...S.mono }}>CONTACT</span> {customer.name || '-'}</div>
                      <div><span style={{ color: '#7b889b', ...S.mono }}>PHONE</span> {customer.phone || '-'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                    <span style={S.tag(stageMeta[customer.customer_stage]?.color || '')}>{stageMeta[customer.customer_stage]?.label || '詢問名單'}</span>
                    {customer.line_user_id ? <span style={S.tag('line')}>LINE 已連通</span> : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isTablet ? 'minmax(0,1.3fr) 100px 120px' : 'minmax(0,1.5fr) 140px 160px minmax(0,1fr)', gap: 12, padding: '14px 18px', borderBottom: '1px solid #F2F2F2', color: '#7b889b', fontSize: 12, fontWeight: 600 }}>
              <div>公司名稱</div>
              <div>聯絡人</div>
              <div>電話</div>
              {!isTablet && <div>地區</div>}
            </div>
            {data.customers.map((customer, idx) => (
              <button
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                style={{ display: 'grid', gridTemplateColumns: isTablet ? 'minmax(0,1.3fr) 100px 120px' : 'minmax(0,1.5fr) 140px 160px minmax(0,1fr)', gap: 12, padding: '14px 18px', alignItems: 'center', background: selectedCustomerId === customer.id ? '#ecfdf5' : idx % 2 === 1 ? '#f9fafb' : '#fff', borderWidth: '1px 0 0 0', borderStyle: 'solid', borderColor: '#F2F2F2', textAlign: 'left', cursor: 'pointer', width: '100%' }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: '#1a1d23', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.company_name || customer.name || '未命名客戶'}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, ...S.mono }}>{customer.customer_code || ''}</div>
                </div>
                <div style={{ fontSize: 14, color: '#475569' }}>{customer.name || '-'}</div>
                <div style={{ fontSize: 14, color: '#475569', ...S.mono }}>{customer.phone || '-'}</div>
                {!isTablet && <div style={{ fontSize: 14, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.address ? customer.address.slice(0, 6) : '-'}</div>}
              </button>
            ))}
          </div>
        )
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, pageSize)}
        onLimitChange={(nextLimit) => {
          setPageSize(nextLimit);
          load(1, search, nextLimit);
        }}
      />
    </>
  );

  return (
    <div>
      <PageLead
        eyebrow="Customers"
        title="客戶主檔"
        description="這裡顯示全部正式 ERP 客戶，不限是否來自 LINE。適合查看你匯入的一千多筆正式客戶資料。"
        action={<CsvImportButton datasetId="erp_customers" onImported={() => load(1, search, pageSize)} compact />}
      />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1, search, pageSize)}
          placeholder="搜尋客戶代號、姓名、公司、電話或 Email..."
          style={{ ...S.input, flex: 1 }}
        />
        <button onClick={() => load(1, search, pageSize)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.erp_ready && (
        <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>
          目前還找不到 `erp_customers` 資料表，請先建立 ERP 客戶主檔。
        </div>
      )}
      {isMobile ? (
        <div style={{ display: 'grid', gap: 16 }}>
          {listPane}
          <div style={S.card}>
            {detailLoading ? <Loading /> : !detailCustomer ? <EmptyState text="請先選擇一位正式客戶" /> : (
              <div style={{ display: 'grid', gap: 16 }}>
                <PanelHeader title={detailCustomer.company_name || detailCustomer.name || '客戶檔案'} meta={detailCustomer.customer_code || 'ERP customer'} badge={<div style={S.tag(stageMeta[detailCustomer.customer_stage]?.color || '')}>{stageMeta[detailCustomer.customer_stage]?.label || '詢問名單'}</div>} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  <StatCard code="QUOTE" label="報價" value={fmt(summary.quote_count)} tone="blue" />
                  <StatCard code="ORDER" label="訂單" value={fmt(summary.order_count)} tone="yellow" />
                  <StatCard code="SALE" label="銷貨" value={fmt(summary.sale_count)} tone="green" />
                  <StatCard code="MSG" label="LINE 互動" value={fmt(summary.line_message_count)} tone="red" />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={S.twoCol}>
          <div>{listPane}</div>
          <div style={{ position: 'sticky', top: 84 }}>
            <div style={S.card}>
              {detailLoading ? <Loading /> : !detailCustomer ? <EmptyState text="請先選擇一位正式客戶" /> : (
                <div style={{ display: 'grid', gap: 16 }}>
                  <PanelHeader
                    title={detailCustomer.company_name || detailCustomer.name || '客戶檔案'}
                    meta={detailCustomer.customer_code || 'ERP customer'}
                    badge={<div style={S.tag(stageMeta[detailCustomer.customer_stage]?.color || '')}>{stageMeta[detailCustomer.customer_stage]?.label || '詢問名單'}</div>}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: -8, marginBottom: 4 }}>
                    {detailCustomer.line_user_id ? <span style={S.tag('line')}>LINE 已連通</span> : <span style={S.tag('')}>ERP only</span>}
                    {detail?.line_profile ? <span style={S.tag('green')}>{detail.line_profile.display_name || 'LINE 客戶'}</span> : null}
                  </div>
                  <div style={{ fontSize: 14, color: '#617084', lineHeight: 1.8 }}>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>CONTACT</span> {detailCustomer.name || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>PHONE</span> {detailCustomer.phone || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>EMAIL</span> {detailCustomer.email || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>TAX_ID</span> {detailCustomer.tax_id || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>ADDRESS</span> {detailCustomer.address || '-'}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    <StatCard code="QUOTE" label="報價筆數" value={fmt(summary.quote_count)} sub={fmtP(summary.quote_total)} tone="blue" />
                    <StatCard code="ORDER" label="訂單筆數" value={fmt(summary.order_count)} sub={fmtP(summary.order_total)} tone="yellow" />
                    <StatCard code="SALE" label="銷貨筆數" value={fmt(summary.sale_count)} sub={fmtP(summary.sales_total)} tone="green" />
                    <StatCard code="GP" label="毛利" value={fmtP(summary.gross_profit_total)} sub={`訊息 ${fmt(summary.line_message_count)} 筆`} tone="red" />
                  </div>
                  <div style={S.panelMuted}>
                    <PanelHeader title="最近報價" meta="最近 5 張報價單" badge={<div style={S.tag('')}>{fmt(detail?.recent_quotes?.length || 0)} 筆</div>} />
                    {detail?.recent_quotes?.length ? detail.recent_quotes.map((row) => (
                      <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px', gap: 10, padding: '8px 0', borderTop: '1px solid #e6edf5', alignItems: 'center' }}>
                        <div style={{ color: '#1976f3', fontSize: 12, fontWeight: 700, ...S.mono }}>{row.quote_no || '-'}</div>
                        <div style={{ color: '#617084', fontSize: 12 }}>{row.quote_date || '-'} · {row.status || 'draft'}</div>
                        <div style={{ textAlign: 'right', color: '#1c2740', fontSize: 12, fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>
                      </div>
                    )) : <EmptyState text="目前沒有報價單資料" />}
                  </div>
                  <div style={S.panelMuted}>
                    <PanelHeader title="最近訂單" meta="最近 5 張訂單" badge={<div style={S.tag('')}>{fmt(detail?.recent_orders?.length || 0)} 筆</div>} />
                    {detail?.recent_orders?.length ? detail.recent_orders.map((row) => (
                      <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px', gap: 10, padding: '8px 0', borderTop: '1px solid #e6edf5', alignItems: 'center' }}>
                        <div style={{ color: '#1976f3', fontSize: 12, fontWeight: 700, ...S.mono }}>{row.order_no || '-'}</div>
                        <div style={{ color: '#617084', fontSize: 12 }}>{row.order_date || '-'} · {row.status || 'draft'}</div>
                        <div style={{ textAlign: 'right', color: '#1c2740', fontSize: 12, fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>
                      </div>
                    )) : <EmptyState text="目前沒有訂單資料" />}
                  </div>
                  <div style={S.panelMuted}>
                    <PanelHeader title="最近銷貨" meta="從 qb_sales_history 對應最近單據" badge={<div style={S.tag('green')}>{fmt(detail?.recent_sales?.length || 0)} 筆</div>} />
                    {detail?.recent_sales?.length ? detail.recent_sales.map((row) => (
                      <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px 90px', gap: 10, padding: '8px 0', borderTop: '1px solid #e6edf5', alignItems: 'center' }}>
                        <button onClick={() => setSelectedSlipNumber(row.slip_number)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: '#1976f3', fontSize: 12, fontWeight: 700, cursor: 'pointer', ...S.mono }}>{row.slip_number || '-'}</button>
                        <div style={{ color: '#617084', fontSize: 12 }}>{row.sale_date || '-'} · {row.sales_person || '-'}</div>
                        <div style={{ textAlign: 'right', color: '#129c59', fontSize: 12, fontWeight: 700, ...S.mono }}>{fmtP(row.total)}</div>
                        <div style={{ textAlign: 'right', color: '#1976f3', fontSize: 12, fontWeight: 700, ...S.mono }}>{fmtP(row.gross_profit)}</div>
                      </div>
                    )) : <EmptyState text="目前沒有銷貨資料" />}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <SaleDetailDrawer slipNumber={selectedSlipNumber} open={Boolean(selectedSlipNumber)} onClose={() => setSelectedSlipNumber('')} />
    </div>
  );
}

function Customers() {
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
  const [data, setData] = useState({ customers: [], total: 0, page: 1, limit: 20, erp_ready: true, customer_stage_ready: false });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedLineId, setSelectedLineId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [bindingLineId, setBindingLineId] = useState('');
  const [lookupKeyword, setLookupKeyword] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResults, setLookupResults] = useState([]);
  const [lookupError, setLookupError] = useState('');
  const [bindLoadingId, setBindLoadingId] = useState('');
  const [bindMessage, setBindMessage] = useState('');
  const [stageSaving, setStageSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    company_name: '',
    phone: '',
    email: '',
    tax_id: '',
    address: '',
    notes: '',
  });

  const load = useCallback(async (page = 1, q = search) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'customers', page: String(page), search: q });
      setData(result);

      const existingSelection = (result.customers || []).find((customer) => customer.line_user_id === selectedLineId);
      if (!existingSelection && result.customers?.[0]?.line_user_id) {
        setSelectedLineId(result.customers[0].line_user_id);
      }
      if (!result.customers?.length) {
        setSelectedLineId('');
        setDetail(null);
      }
    } finally {
      setLoading(false);
    }
  }, [search, selectedLineId]);

  useEffect(() => { load(); }, []);

  const loadDetail = useCallback(async (lineUserId) => {
    if (!lineUserId) return;
    setDetailLoading(true);
    try {
      const result = await apiGet({ action: 'customer_detail', line_user_id: lineUserId });
      setDetail(result);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedLineId) {
      loadDetail(selectedLineId);
    }
  }, [selectedLineId, loadDetail]);

  useEffect(() => {
    const linked = detail?.customer?.linked_customer;
    setProfileForm({
      name: linked?.name || '',
      company_name: linked?.company_name || '',
      phone: linked?.phone || '',
      email: linked?.email || '',
      tax_id: linked?.tax_id || '',
      address: linked?.address || '',
      notes: linked?.notes || '',
    });
    setEditingProfile(false);
  }, [detail]);

  useEffect(() => {
    if (!bindMessage) return undefined;
    const timer = setTimeout(() => setBindMessage(''), 2400);
    return () => clearTimeout(timer);
  }, [bindMessage]);

  const openBinder = (customer) => {
    setBindingLineId(customer.line_user_id || '');
    setLookupKeyword(customer.display_name || '');
    setLookupResults([]);
    setLookupError('');
    setBindMessage('');
  };

  const closeBinder = () => {
    setBindingLineId('');
    setLookupKeyword('');
    setLookupResults([]);
    setLookupError('');
  };

  const lookupErpCustomers = async () => {
    const keyword = lookupKeyword.trim();
    if (!keyword) {
      setLookupError('請先輸入正式客戶姓名、公司或電話');
      setLookupResults([]);
      return;
    }

    setLookupLoading(true);
    setLookupError('');
    setBindMessage('');

    try {
      const result = await apiGet({ action: 'erp_customer_lookup', search: keyword });
      if (!result.erp_ready) {
        setLookupResults([]);
        setLookupError('尚未建立 erp_customers 資料表，請先執行 ERP schema。');
        return;
      }

      setLookupResults(result.customers || []);
      if (!result.customers?.length) {
        setLookupError('找不到符合的正式客戶，請換姓名、公司名或電話再試一次。');
      }
    } catch (error) {
      setLookupResults([]);
      setLookupError(error.message || '正式客戶查詢失敗');
    } finally {
      setLookupLoading(false);
    }
  };

  const bindCustomer = async (customer, erpCustomer) => {
    setBindLoadingId(customer.line_user_id || '');
    setLookupError('');
    setBindMessage('');

    try {
      await apiPost({
        action: 'link_line_customer',
        line_user_id: customer.line_user_id,
        display_name: customer.display_name,
        erp_customer_id: erpCustomer.id,
      });
      setBindMessage(`已綁定到正式客戶：${erpCustomer.company_name || erpCustomer.name || '未命名客戶'}`);
      closeBinder();
      await load(data.page, search);
      await loadDetail(customer.line_user_id);
    } catch (error) {
      setLookupError(error.message || '綁定失敗');
    } finally {
      setBindLoadingId('');
    }
  };

  const hasErpProfile = (customer) => Boolean(customer?.linked_customer);
  const getCustomerStage = (customer) => customer?.linked_customer?.customer_stage || 'lead';
  const stageMeta = {
    lead: { label: '詢問名單', color: 'red' },
    prospect: { label: '潛在客戶', color: '' },
    customer: { label: '正式客戶', color: 'green' },
    vip: { label: 'VIP 客戶', color: 'line' },
  };
  const isFormalCustomerBound = (customer) => {
    const linked = customer?.linked_customer;
    if (!linked) return false;

    if (linked.customer_stage) {
      return linked.customer_stage === 'customer' || linked.customer_stage === 'vip';
    }

    const hasBusinessData = Boolean(
      linked.company_name ||
      linked.phone ||
      linked.email ||
      linked.tax_id
    );

    return hasBusinessData || (linked.source && linked.source !== 'line');
  };

  const updateCustomerStage = async (customerStage) => {
    const erpCustomerId = detailCustomer?.linked_customer?.id;
    if (!erpCustomerId) return;

    setStageSaving(true);
    try {
      await apiPost({
        action: 'update_customer_stage',
        erp_customer_id: erpCustomerId,
        customer_stage: customerStage,
      });
      await load(data.page, search);
      await loadDetail(detailCustomer.line_user_id);
      setBindMessage(`已更新客戶階段：${stageMeta[customerStage]?.label || customerStage}`);
    } catch (error) {
      setLookupError(error.message || '更新客戶階段失敗');
    } finally {
      setStageSaving(false);
    }
  };

  const saveCustomerProfile = async () => {
    const erpCustomerId = detailCustomer?.linked_customer?.id;
    if (!erpCustomerId) return;

    setProfileSaving(true);
    setEditingProfile(false);
    setBindMessage('已更新正式客戶資料');
    setDetail((prev) => prev ? {
      ...prev,
      customer: {
        ...prev.customer,
        linked_customer: {
          ...prev.customer.linked_customer,
          ...profileForm,
        },
      },
    } : prev);
    try {
      await apiPost({
        action: 'update_customer_profile',
        erp_customer_id: erpCustomerId,
        profile: profileForm,
      });
      await load(data.page, search);
      await loadDetail(detailCustomer.line_user_id);
    } catch (error) {
      setLookupError(error.message || '更新客戶資料失敗');
      setEditingProfile(true);
    } finally {
      setProfileSaving(false);
    }
  };

  const selectedCustomer = data.customers.find((customer) => customer.line_user_id === selectedLineId) || data.customers[0] || null;
  const detailCustomer = detail?.customer || selectedCustomer;
  const detailSummary = detail?.summary || { message_count: 0, quote_count: 0, order_count: 0, sale_count: 0, sales_total: 0 };
  const formalProfileComplete = detail?.formal_profile_complete ?? (detailCustomer ? isFormalCustomerBound(detailCustomer) : false);
  const currentStage = getCustomerStage(detailCustomer);
  const detailPanel = (
    <div style={{ ...S.card, padding: '16px 18px', position: isTablet ? 'relative' : 'sticky', top: isTablet ? 'auto' : 84 }}>
      {!detailCustomer ? (
        <EmptyState text="選一位客戶後，這裡會顯示客戶檔案與互動摘要" />
      ) : detailLoading ? (
        <Loading />
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1c2740' }}>{detailCustomer.display_name || '未命名客戶'}</div>
              <span style={S.tag('green')}>LINE</span>
              {detailCustomer.linked_customer
                ? <span style={S.tag(stageMeta[currentStage]?.color || '')}>{stageMeta[currentStage]?.label || '詢問名單'}</span>
                : <span style={S.tag('red')}>未綁定</span>}
            </div>
            <div style={{ fontSize: 13, color: '#617084', lineHeight: 1.7 }}>
              {detailCustomer.linked_customer
                ? `${detailCustomer.linked_customer.company_name || detailCustomer.linked_customer.name || '已建立 ERP 客戶'}`
                : '目前尚未建立正式客戶連結'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#7b889b', marginBottom: 6, ...S.mono }}>MSG</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1976f3', ...S.mono }}>{fmt(detailSummary.message_count)}</div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#7b889b', marginBottom: 6, ...S.mono }}>QUOTE</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1c2740', ...S.mono }}>{fmt(detailSummary.quote_count)}</div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#7b889b', marginBottom: 6, ...S.mono }}>ORDER</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1c2740', ...S.mono }}>{fmt(detailSummary.order_count)}</div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#7b889b', marginBottom: 6, ...S.mono }}>SALE</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1c2740', ...S.mono }}>{fmt(detailSummary.sale_count)}</div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 10, color: '#7b889b', marginBottom: 6, ...S.mono }}>REVENUE</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#129c59', ...S.mono }}>{fmtP(detailSummary.sales_total)}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ ...S.panelMuted, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>CUSTOMER_PROFILE</div>
              <div style={{ fontSize: 12, color: '#4f6178', lineHeight: 1.8 }}>
                <div><span style={{ color: '#7b889b', ...S.mono }}>LAST_CONTACT</span> {fmtDate(detailCustomer.last_contact_at || detailCustomer.created_at)}</div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>STATUS</span> {(detailCustomer.message_count || 0) > 1 ? '既有客戶' : '新客戶'}</div>
              </div>
            </div>

            {detailCustomer.linked_customer ? (
              <div style={{ ...S.panelMuted, background: '#f2fbf6', borderColor: '#c9edd7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#129c59', marginBottom: 8, ...S.mono }}>ERP_PROFILE</div>
                    <div style={{ fontSize: 15, color: '#1c2740', fontWeight: 700 }}>
                      {detailCustomer.linked_customer.company_name || detailCustomer.linked_customer.name || '未命名客戶'}
                    </div>
                  </div>
                  <button onClick={() => setEditingProfile(!editingProfile)} style={S.btnGhost}>
                    {editingProfile ? '取消編輯' : '編輯客戶資料'}
                  </button>
                </div>
                {editingProfile ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                      <input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="聯絡人姓名" style={S.input} />
                      <input value={profileForm.company_name} onChange={(e) => setProfileForm({ ...profileForm, company_name: e.target.value })} placeholder="公司名稱" style={S.input} />
                      <input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="電話" style={S.input} />
                      <input value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} placeholder="Email" style={S.input} />
                      <input value={profileForm.tax_id} onChange={(e) => setProfileForm({ ...profileForm, tax_id: e.target.value })} placeholder="統編" style={S.input} />
                      <input value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} placeholder="地址" style={S.input} />
                    </div>
                    <textarea
                      value={profileForm.notes}
                      onChange={(e) => setProfileForm({ ...profileForm, notes: e.target.value })}
                      placeholder="備註"
                      rows={3}
                      style={{ ...S.input, resize: 'vertical', lineHeight: 1.6 }}
                    />
                    <button onClick={saveCustomerProfile} style={S.btnPrimary} disabled={profileSaving}>
                      {profileSaving ? '儲存中...' : '儲存客戶資料'}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#617084', lineHeight: 1.8 }}>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>CONTACT</span> {detailCustomer.linked_customer.name || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>PHONE</span> {detailCustomer.linked_customer.phone || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>EMAIL</span> {detailCustomer.linked_customer.email || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>TAX_ID</span> {detailCustomer.linked_customer.tax_id || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>ADDRESS</span> {detailCustomer.linked_customer.address || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>NOTES</span> {detailCustomer.linked_customer.notes || '-'}</div>
                  </div>
                )}
                {detail?.customer_stage_ready ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 8, ...S.mono }}>CUSTOMER_STAGE</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {Object.entries(stageMeta).map(([value, meta]) => (
                        <button
                          key={value}
                          onClick={() => updateCustomerStage(value)}
                          disabled={stageSaving}
                          style={{
                            ...S.btnGhost,
                            padding: '7px 12px',
                            fontSize: 12,
                            background: currentStage === value ? '#edf5ff' : '#fff',
                            borderColor: currentStage === value ? '#94c3ff' : '#dbe3ee',
                            color: currentStage === value ? '#1976f3' : '#5b6779',
                          }}
                        >
                          {meta.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#617084', lineHeight: 1.7 }}>
                    目前資料庫還沒有 customer_stage 欄位，若要改用明確階段判定，請先補欄位 migration。
                  </div>
                )}
                {!formalProfileComplete && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#617084', lineHeight: 1.7 }}>
                    目前這筆還不是正式客戶。若要視為正式客戶，可把階段改成「正式客戶 / VIP」，並補齊公司、電話、Email 或統編。
                  </div>
                )}
              </div>
            ) : (
              <div style={{ ...S.panelMuted, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>ERP_BINDING</div>
                    <div style={{ fontSize: 13, color: '#4f6178', lineHeight: 1.7 }}>
                      目前尚未綁定正式客戶。綁定後，這位 LINE 客戶就能連到 ERP 客戶主檔、報價、訂單與銷貨資料。
                    </div>
                  </div>
                  <button onClick={() => bindingLineId === detailCustomer.line_user_id ? closeBinder() : openBinder(detailCustomer)} style={S.btnPrimary} disabled={!data.erp_ready}>
                    {bindingLineId === detailCustomer.line_user_id ? '收起綁定面板' : '綁定正式客戶'}
                  </button>
                </div>
                {bindingLineId === detailCustomer.line_user_id && (
                  <div style={{ ...S.panelMuted, display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
                      <input
                        value={lookupKeyword}
                        onChange={(e) => setLookupKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && lookupErpCustomers()}
                        placeholder="輸入正式客戶姓名、公司或電話..."
                        style={{ ...S.input, flex: 1 }}
                      />
                      <button onClick={lookupErpCustomers} style={S.btnGhost} disabled={lookupLoading}>
                        {lookupLoading ? '查詢中...' : '查 ERP 客戶'}
                      </button>
                    </div>
                    {lookupError && <div style={{ fontSize: 12, color: '#d1435b', lineHeight: 1.7 }}>{lookupError}</div>}
                    {lookupResults.length > 0 && (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {lookupResults.map((erpCustomer) => (
                          <div key={erpCustomer.id} style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                            <div>
                              <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700 }}>
                                {erpCustomer.company_name || erpCustomer.name || '未命名客戶'}
                              </div>
                      <div style={{ fontSize: 12, color: '#617084', lineHeight: 1.8, marginTop: 4 }}>
                        <div><span style={{ color: '#7b889b', ...S.mono }}>CONTACT</span> {erpCustomer.name || '-'}</div>
                        <div><span style={{ color: '#7b889b', ...S.mono }}>PHONE</span> {erpCustomer.phone || '-'}</div>
                        <div><span style={{ color: '#7b889b', ...S.mono }}>TAX_ID</span> {erpCustomer.tax_id || '-'}</div>
                        {erpCustomer.customer_stage && <div><span style={{ color: '#7b889b', ...S.mono }}>STAGE</span> {stageMeta[erpCustomer.customer_stage]?.label || erpCustomer.customer_stage}</div>}
                      </div>
                    </div>
                    <button onClick={() => bindCustomer(detailCustomer, erpCustomer)} style={S.btnPrimary} disabled={bindLoadingId === detailCustomer.line_user_id}>
                              {bindLoadingId === detailCustomer.line_user_id ? '綁定中...' : '綁定這位客戶'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={S.panelMuted}>
              <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 8, ...S.mono }}>RECENT_MESSAGES</div>
              {detail?.recent_messages?.length ? detail.recent_messages.map((message) => (
                <div key={message.id} style={{ padding: '8px 0', borderTop: '1px solid #e6edf5' }}>
                  <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 4, ...S.mono }}>{fmtDate(message.created_at)}</div>
                  <div style={{ fontSize: 12, color: '#1c2740', lineHeight: 1.6 }}>{message.user_message}</div>
                </div>
              )) : <EmptyState text="目前還沒有可顯示的最近訊息" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageLead
        eyebrow="LINE"
        title="LINE 客戶"
        description="這裡專門看來自 LINE 官方帳號的客戶名單，方便做人工綁定、查訊息和對應正式客戶。"
      />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1, search)}
          placeholder="搜尋客戶名稱或 LINE ID..."
          style={{ ...S.input, flex: 1 }}
          onFocus={(e) => e.target.style.borderColor = '#1976f3'}
          onBlur={(e) => e.target.style.borderColor = '#ccd6e3'}
        />
        <button onClick={() => load(1, search)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.erp_ready && (
        <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00', padding: '14px 16px' }}>
          目前還找不到 erp_customers 資料表，人工綁定功能需要先把 docs/erp-schema-v1.sql 跑進 Supabase。
        </div>
      )}
      {bindMessage && (
        <div style={{ ...S.card, background: '#edf9f2', borderColor: '#bdeccb', color: '#127248', padding: '14px 16px' }}>
          {bindMessage}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>共 {data.total} 位客戶</div>
      {loading ? <Loading /> : data.customers.length === 0 ? <EmptyState text="目前沒有符合條件的客戶資料" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1.25fr) minmax(340px, 0.9fr)', gap: 16, alignItems: 'start' }}>
          <div style={S.card}>
            {!isMobile && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) 110px 150px 110px', gap: 12, padding: '0 10px 10px', borderBottom: '1px solid #e6edf5', marginBottom: 8, color: '#7b889b', fontSize: 10, ...S.mono }}>
                <div>客戶</div>
                <div>狀態</div>
                <div>ERP</div>
                <div style={{ textAlign: 'right' }}>訊息數</div>
              </div>
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              {data.customers.map((customer) => {
                const selected = customer.line_user_id === selectedLineId;
                return (
                  <button
                    key={customer.id || customer.line_user_id}
                    onClick={() => setSelectedLineId(customer.line_user_id || '')}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: selected ? '#edf5ff' : '#fff',
                      border: `1px solid ${selected ? '#94c3ff' : '#dbe3ee'}`,
                      borderRadius: 12,
                      padding: '12px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr auto' : 'minmax(0, 1.6fr) 110px 150px 110px', gap: 12, alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 15, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {customer.display_name || '未命名客戶'}
                          </span>
                          <span style={S.tag('green')}>LINE</span>
                        </div>
                      <div style={{ fontSize: 12, color: '#617084', lineHeight: 1.6 }}>
                          {customer.linked_customer
                            ? `${customer.linked_customer.company_name || customer.linked_customer.name || '已建立 ERP 客戶'}`
                            : '尚未綁定正式客戶'}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: (customer.message_count || 0) > 1 ? '#129c59' : '#f59e0b', fontWeight: 700 }}>
                        {(customer.message_count || 0) > 1 ? '既有客戶' : '新客戶'}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {hasErpProfile(customer)
                          ? <span style={S.tag(stageMeta[getCustomerStage(customer)]?.color || '')}>
                              {stageMeta[getCustomerStage(customer)]?.label || '詢問名單'}
                            </span>
                          : <span style={S.tag('red')}>未綁定</span>}
                      </div>
                      <div style={{ textAlign: isMobile ? 'left' : 'right', fontSize: 16, color: '#1976f3', fontWeight: 700, ...S.mono }}>
                        {fmt(customer.message_count)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          {detailPanel}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
        {data.page > 1 && <button onClick={() => load(data.page - 1)} style={S.btnGhost}>← 上一頁</button>}
        <span style={{ color: '#666', padding: '8px 0', fontSize: 12, ...S.mono }}>P{data.page}</span>
        {data.total > data.page * data.limit && <button onClick={() => load(data.page + 1)} style={S.btnGhost}>下一頁 →</button>}
      </div>
    </div>
  );
}

/* ========================================= PRODUCT SEARCH ========================================= */
function ProductSearch() {
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
  const CATS = { all: '全部', wrench: '扳手', socket: '套筒', ratchet: '棘輪', screwdriver: '螺絲起子', plier: '鉗子', power_tool: '電動工具', torque_wrench: '扭力扳手', storage: '工具車/收納', light: '照明', diagnostic: '診斷', battery: '電池', tester: '測試儀', borescope: '內視鏡', jack_lift: '千斤頂', torque_multiplier: '扭力倍增器', tire_inflator: '打氣機', other: '其他' };
  const STATUS_OPTIONS = ['all', 'Current', 'Legacy', 'Discontinued'];
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState({ total_products: 0, current_products: 0, replacement_products: 0, category_count: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');
  const PAGE_SIZE = 25;

  const doSearch = useCallback(async (q, cat, status, pg = 0) => {
    setLoading(true);
    const data = await apiGet({
      action: 'products',
      q: q || '',
      category: cat || 'all',
      status: status || 'all',
      page: String(pg),
      limit: String(PAGE_SIZE),
    });
    setProducts(data.products || []);
    setTotal(data.total || 0);
    setSummary(data.summary || { total_products: 0, current_products: 0, replacement_products: 0, category_count: 0 });
    setLoading(false);
  }, []);

  useEffect(() => { const timer = setTimeout(() => { setPage(0); doSearch(search, category, statusFilter, 0); }, 300); return () => clearTimeout(timer); }, [search, category, statusFilter, doSearch]);
  const goPage = (pg) => { setPage(pg); doSearch(search, category, statusFilter, pg); };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageLead
        eyebrow="Product Master"
        title="商品主檔"
        description="這裡是正式 ERP 商品主檔，不只是查價，也用來維護商品狀態、分類、替代型號與價格。"
        action={<CsvImportButton datasetId="quickbuy_products" onImported={() => doSearch(search, category, statusFilter, page)} compact />}
      />
      {saveMessage ? <StatusBanner text={saveMessage} tone="success" /> : null}
      <div style={{ ...S.statGrid, marginBottom: 18 }}>
        <div style={S.panelMuted}><div style={S.label}>TOTAL_PRODUCTS</div><div style={{ fontSize: 26, fontWeight: 700, color: '#1c2740', ...S.mono }}>{fmt(summary.total_products)}</div></div>
        <div style={S.panelMuted}><div style={S.label}>CURRENT</div><div style={{ fontSize: 26, fontWeight: 700, color: '#129c59', ...S.mono }}>{fmt(summary.current_products)}</div></div>
        <div style={S.panelMuted}><div style={S.label}>WITH_REPLACEMENT</div><div style={{ fontSize: 26, fontWeight: 700, color: '#1976f3', ...S.mono }}>{fmt(summary.replacement_products)}</div></div>
        <div style={S.panelMuted}><div style={S.label}>CATEGORIES</div><div style={{ fontSize: 26, fontWeight: 700, color: '#1c2740', ...S.mono }}>{fmt(summary.category_count)}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋料號或關鍵字... (例: FDX71, wrench)" style={{ ...S.input, flex: 1, ...S.mono }} onFocus={e => e.target.style.borderColor = '#1976f3'} onBlur={e => e.target.style.borderColor = '#ccd6e3'} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.input, width: isMobile ? '100%' : 150 }}>
          {STATUS_OPTIONS.map((value) => <option key={value} value={value}>{value === 'all' ? '全部狀態' : value}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {Object.entries(CATS).map(([key, label]) => (
          <button key={key} onClick={() => setCategory(key)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11, color: category === key ? '#1976f3' : '#66768a', borderColor: category === key ? '#94c3ff' : '#d6deea', background: category === key ? '#edf5ff' : '#fff' }}>{label}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>主檔共 {fmt(total)} 筆 {totalPages > 1 && `· P${page + 1}/${totalPages}`}</div>
      {loading ? <Loading /> : products.length === 0 ? <EmptyState text={search ? '找不到符合的產品' : '輸入料號或關鍵字開始搜尋'} /> : (
        <>
          {!isMobile && <div style={{ display: 'flex', padding: '8px 16px', fontSize: 10, color: '#7b889b', ...S.mono, borderBottom: '1px solid #dbe3ee', marginBottom: 4 }}>
            <div style={{ width: 150 }}>ITEM_NO</div><div style={{ flex: 1 }}>DESCRIPTION</div><div style={{ width: 90, textAlign: 'right' }}>分類</div><div style={{ width: 110, textAlign: 'right' }}>狀態</div><div style={{ width: 100, textAlign: 'right' }}>牌價</div><div style={{ width: 100, textAlign: 'right' }}>經銷價</div><div style={{ width: 96, textAlign: 'right' }}>操作</div>
          </div>}
          {products.map(p => (
            <div key={p.item_number}>
              <div onClick={() => setExpanded(expanded === p.item_number ? null : p.item_number)} style={{ ...S.card, cursor: 'pointer', padding: '10px 16px', marginBottom: 2, display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 0, borderColor: expanded === p.item_number ? '#94c3ff' : '#dbe3ee' }}>
                <div style={{ width: isMobile ? '100%' : 150, fontWeight: 700, color: '#1976f3', fontSize: 13, ...S.mono }}>{p.item_number}</div>
                <div style={{ flex: 1, width: isMobile ? '100%' : 'auto', fontSize: 12, color: '#5f6f83', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap' }}>{p.description}</div>
                <div style={{ width: isMobile ? '100%' : 90, textAlign: isMobile ? 'left' : 'right' }}>{p.category && p.category !== 'other' && <span style={{ ...S.tag(''), fontSize: 10 }}>{CATS[p.category] || p.category}</span>}</div>
                <div style={{ width: isMobile ? '100%' : 110, textAlign: isMobile ? 'left' : 'right' }}><span style={S.tag(String(p.product_status || '').toLowerCase() === 'current' ? 'green' : '')}>{p.product_status || '-'}</span></div>
                <div style={{ width: isMobile ? '100%' : 100, textAlign: isMobile ? 'left' : 'right', fontSize: 13, color: '#273346', ...S.mono }}>{isMobile ? `牌價 ${fmtP(p.tw_retail_price)}` : fmtP(p.tw_retail_price)}</div>
                <div style={{ width: isMobile ? '100%' : 100, textAlign: isMobile ? 'left' : 'right', fontSize: 13, color: '#129c59', fontWeight: 700, ...S.mono }}>{isMobile ? `經銷價 ${fmtP(p.tw_reseller_price)}` : fmtP(p.tw_reseller_price)}</div>
                <div style={{ width: isMobile ? '100%' : 96, textAlign: isMobile ? 'left' : 'right' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingProduct(p); }}
                    style={{ ...S.btnGhost, padding: '6px 10px', fontSize: 12 }}
                  >
                    編輯
                  </button>
                </div>
              </div>
              {expanded === p.item_number && (
                <div style={{ background: '#f8fbff', border: '1px solid #dbe6f3', borderRadius: 10, padding: '14px 20px', marginBottom: 8, marginTop: -2, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  <div><div style={S.label}>US PRICE</div><div style={{ color: '#5f6f83', fontSize: 13, ...S.mono }}>{p.us_price ? `$${Number(p.us_price).toFixed(2)}` : '-'}</div></div>
                  <div><div style={S.label}>牌價</div><div style={{ color: '#273346', fontSize: 13, ...S.mono }}>{fmtP(p.tw_retail_price)}</div></div>
                  <div><div style={S.label}>經銷價</div><div style={{ color: '#129c59', fontSize: 13, fontWeight: 700, ...S.mono }}>{fmtP(p.tw_reseller_price)}</div></div>
                  <div><div style={S.label}>狀態</div><div style={{ color: '#5f6f83', fontSize: 13 }}>{p.product_status || '-'}</div></div>
                  <div><div style={S.label}>重量</div><div style={{ color: '#5f6f83', fontSize: 13, ...S.mono }}>{p.weight_kg ? `${p.weight_kg} kg` : '-'}</div></div>
                  <div><div style={S.label}>產地</div><div style={{ color: '#5f6f83', fontSize: 13, ...S.mono }}>{p.origin_country || '-'}</div></div>
                  <div><div style={S.label}>替代型號</div><div style={{ color: p.replacement_model ? '#1976f3' : '#8a96a8', fontSize: 13, ...S.mono }}>{p.replacement_model || '-'}</div></div>
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
            {page > 0 && <button onClick={() => goPage(page - 1)} style={S.btnGhost}>← 上一頁</button>}
            <span style={{ color: '#666', padding: '8px 0', fontSize: 12, ...S.mono }}>P{page + 1}/{totalPages}</span>
            {page < totalPages - 1 && <button onClick={() => goPage(page + 1)} style={S.btnGhost}>下一頁 →</button>}
          </div>
        </>
      )}
      <ProductEditModal
        product={editingProduct}
        onClose={() => setEditingProduct(null)}
        onSaved={async () => {
          setSaveMessage(`商品 ${editingProduct?.item_number || ''} 已更新`);
          await doSearch(search, category, statusFilter, page);
          setTimeout(() => setSaveMessage(''), 3000);
        }}
      />
    </div>
  );
}

/* ========================================= QUOTES ========================================= */
function QuoteCreateModal({ open, onClose, onCreated, tableReady = true }) {
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

function Quotes() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total_amount: 0, open_count: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [showCreate, setShowCreate] = useState(false);
  const [convertingId, setConvertingId] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [statusFilter, setStatusFilter] = useState('');

  const QUOTE_STATUS_MAP = { draft: '草稿', sent: '已發送', approved: '已核准', converted: '已轉單', closed: '已結案' };
  const QUOTE_STATUS_TONE = { draft: '', sent: 'blue', approved: 'green', converted: 'green', closed: '' };

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const params = { action: 'quotes', page: String(page), limit: String(limit), search: q };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (statusFilter) params.status = statusFilter;
      const result = await apiGet(params);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, pageSize, dateFrom, dateTo, statusFilter]);

  useEffect(() => { load(); }, []);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const doSearch = () => load(1, search, pageSize);

  const convertToOrder = async (quote) => {
    if (!confirm(`確定將報價單 ${quote.quote_no || ''} 轉為訂單？`)) return;
    setConvertingId(quote.id);
    setActionMessage('');
    try {
      const result = await apiPost({ action: 'convert_quote_to_order', quote_id: quote.id });
      setActionMessage(`已轉成訂單 ${result.order?.order_no || ''}`.trim());
      await load(1, search, pageSize);
    } catch (error) {
      setActionMessage(error.message || '報價轉訂單失敗');
    } finally {
      setConvertingId('');
    }
  };

  const duplicateQuote = async (quote) => {
    try {
      setActionMessage('');
      setActionMessage('複製中...');
      const detail = await apiGet({ action: 'quotes', page: '1', limit: '1', search: quote.quote_no || '' });
      const original = (detail.rows || [])[0] || quote;
      await apiPost({
        action: 'create_quote',
        customer_id: original.customer_id,
        quote_date: toDateInputValue(todayInTaipei()),
        valid_until: toDateInputValue(new Date(todayInTaipei().getTime() + 7 * 86400000)),
        status: 'draft',
        remark: `(複製自 ${original.quote_no || ''}) ${original.remark || ''}`.trim(),
        discount_amount: Number(original.discount_amount || 0),
        shipping_fee: Number(original.shipping_fee || 0),
        items: [],
      });
      setActionMessage('報價單已複製（明細請手動補充）');
      await load(1, search, pageSize);
    } catch (error) {
      setActionMessage(error.message || '複製報價單失敗');
    }
  };

  return (
    <div>
      <PageLead eyebrow="QUOTES" title="報價單" description="管理報價單，確認後可轉為訂單進入銷售流程。" action={<button onClick={() => data.table_ready && setShowCreate(true)} disabled={!data.table_ready} style={{ ...S.btnPrimary, opacity: data.table_ready ? 1 : 0.6, cursor: data.table_ready ? 'pointer' : 'not-allowed' }}>+ 新增報價單</button>} />
      {actionMessage ? (
        <div style={{ ...S.card, background: actionMessage.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: actionMessage.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: actionMessage.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 14 }}>
          {actionMessage}
        </div>
      ) : null}
      <div style={{ ...S.card, marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 12, background: datePreset === key ? '#1976f3' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#1976f3' : '#dbe3ee' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 140, fontSize: 12, padding: '5px 8px', ...S.mono }} />
          <span style={{ color: '#7b889b', fontSize: 12 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 140, fontSize: 12, padding: '5px 8px', ...S.mono }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.input, width: 110, fontSize: 12, padding: '5px 8px' }}>
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="sent">已發送</option>
            <option value="approved">已核准</option>
            <option value="converted">已轉單</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋單號、客戶或備註..." style={{ ...S.input, flex: 1 }} />
          <button onClick={doSearch} style={S.btnPrimary}>查詢</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 erp_quotes 資料表。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="QTOT" label="報價總數" value={fmt(data.total)} tone="blue" />
        <StatCard code="OPEN" label="待處理" value={fmt(data.summary?.open_count)} tone="yellow" />
        <StatCard code="AMT" label="本頁總額" value={fmtP(data.summary?.total_amount)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有報價單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '50px 130px minmax(0,1fr) 100px 100px' : '50px 150px minmax(0,1.2fr) 100px 100px 100px 120px minmax(0,1fr) 160px', gap: 10, padding: '12px 16px', borderBottom: '2px solid #e6edf5', color: '#7b889b', fontSize: 11, fontWeight: 600 }}>
            <div>序</div>
            <div>單號</div>
            <div>客戶</div>
            <div>日期</div>
            <div>狀態</div>
            {!isTablet && <div style={{ textAlign: 'right' }}>總金額</div>}
            {!isTablet && <div>有效期限</div>}
            {!isTablet && <div>備註</div>}
            <div style={{ textAlign: 'right' }}>操作</div>
          </div>
          {data.rows.map((row, idx) => {
            const statusKey = String(row.status || 'draft').toLowerCase();
            const isConverted = statusKey === 'converted';
            return (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '50px 130px minmax(0,1fr) 100px 100px' : '50px 150px minmax(0,1.2fr) 100px 100px 100px 120px minmax(0,1fr) 160px', gap: 10, padding: '12px 16px', borderTop: '1px solid #eef3f8', alignItems: 'center', background: idx % 2 === 0 ? '#fff' : '#fafbfd' }}>
                <div style={{ fontSize: 12, color: '#7b889b', ...S.mono }}>{((data.page - 1) * (data.limit || pageSize)) + idx + 1}</div>
                <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{row.quote_no || '-'}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#1c2740', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer?.company_name || row.customer?.name || '未綁定客戶'}</div>
                </div>
                <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.quote_date || '-'}</div>
                <div><span style={S.tag(QUOTE_STATUS_TONE[statusKey] || '')}>{QUOTE_STATUS_MAP[statusKey] || statusKey}</span></div>
                {!isTablet && <div style={{ fontSize: 13, color: '#129c59', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>}
                {!isTablet && <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.valid_until || '-'}</div>}
                {!isTablet && <div style={{ fontSize: 12, color: '#617084', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.remark || '-'}</div>}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {!isConverted && (
                    <button onClick={() => convertToOrder(row)} disabled={convertingId === row.id} style={{ ...S.btnGhost, padding: '5px 8px', fontSize: 11, opacity: convertingId === row.id ? 0.7 : 1 }}>
                      {convertingId === row.id ? '轉單中' : '轉訂單'}
                    </button>
                  )}
                  {isConverted && <span style={{ ...S.tag('green'), fontSize: 11 }}>已轉單</span>}
                  <button onClick={() => duplicateQuote(row)} title="複製報價單" style={{ ...S.btnGhost, padding: '5px 8px', fontSize: 11 }}>複製</button>
                  <button onClick={() => window.open(`/api/pdf?type=quote&id=${row.id}`, '_blank')} style={{ ...S.btnGhost, padding: '5px 8px', fontSize: 11 }}>PDF</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, pageSize)}
        onLimitChange={(nextLimit) => { setPageSize(nextLimit); load(1, search, nextLimit); }}
      />
      <QuoteCreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => load(1, search, pageSize)} tableReady={data.table_ready} />
    </div>
  );
}

/* ========================================= ORDERS ========================================= */
function Orders({ setTab }) {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total_amount: 0, pending_count: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [convertingId, setConvertingId] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');

  const ORDER_STATUS_MAP = { draft: '草稿', confirmed: '已確認', shipped: '已出貨', completed: '完成', cancelled: '已取消' };
  const PAY_STATUS_MAP = { unpaid: '未付款', partial: '部分付款', paid: '已付款' };
  const SHIP_STATUS_MAP = { pending: '待出貨', shipped: '已出貨', delivered: '已送達' };

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const params = { action: 'orders', page: String(page), limit: String(limit), search: q };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const result = await apiGet(params);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, pageSize, dateFrom, dateTo]);

  useEffect(() => { load(); }, []);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const doSearch = () => load(1, search, pageSize);

  const convertToSale = async (order) => {
    if (!confirm(`確定將訂單 ${order.order_no || ''} 轉為銷貨單？`)) return;
    setConvertingId(order.id);
    setActionMessage('');
    try {
      const result = await apiPost({ action: 'convert_order_to_sale', order_id: order.id });
      setActionMessage(`已轉成銷貨單 ${result.sale?.slip_number || ''}`.trim());
      if (typeof window !== 'undefined' && result.sale?.slip_number) {
        window.localStorage.setItem(SALES_DOCUMENT_FOCUS_KEY, result.sale.slip_number);
      }
      await load(1, search, pageSize);
      setTab?.('sales_documents');
    } catch (error) {
      setActionMessage(error.message || '訂單轉銷貨失敗');
    } finally {
      setConvertingId('');
    }
  };

  return (
    <div>
      <PageLead eyebrow="ORDERS" title="訂單" description="管理訂單、付款與出貨狀態，確認後可轉為銷貨單。" action={<CsvImportButton datasetId="erp_orders" onImported={() => load(1, search, pageSize)} compact />} />
      {actionMessage ? (
        <div style={{ ...S.card, background: actionMessage.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: actionMessage.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: actionMessage.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 14 }}>
          {actionMessage}
        </div>
      ) : null}
      <div style={{ ...S.card, marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 12, background: datePreset === key ? '#1976f3' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#1976f3' : '#dbe3ee' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 140, fontSize: 12, padding: '5px 8px', ...S.mono }} />
          <span style={{ color: '#7b889b', fontSize: 12 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 140, fontSize: 12, padding: '5px 8px', ...S.mono }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋訂單號、狀態、付款或出貨..." style={{ ...S.input, flex: 1 }} />
          <button onClick={doSearch} style={S.btnPrimary}>查詢</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 erp_orders 資料表。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="OTOT" label="訂單總數" value={fmt(data.total)} tone="blue" />
        <StatCard code="PEND" label="未完成" value={fmt(data.summary?.pending_count)} tone="yellow" />
        <StatCard code="AMT" label="本頁總額" value={fmtP(data.summary?.total_amount)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有訂單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '50px 140px minmax(0,1fr) 100px 100px 100px' : '50px 150px minmax(0,1.2fr) 100px 100px 100px 100px 110px 150px', gap: 10, padding: '12px 16px', borderBottom: '2px solid #e6edf5', color: '#7b889b', fontSize: 11, fontWeight: 600 }}>
            <div>序</div>
            <div>訂單號</div>
            <div>客戶</div>
            <div>日期</div>
            <div>狀態</div>
            {!isTablet && <div>付款</div>}
            {!isTablet && <div>出貨</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>總額</div>}
            <div style={{ textAlign: 'right' }}>操作</div>
          </div>
          {data.rows.map((row, idx) => {
            const statusKey = String(row.status || 'draft').toLowerCase();
            const payKey = String(row.payment_status || 'unpaid').toLowerCase();
            const shipKey = String(row.shipping_status || 'pending').toLowerCase();
            return (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '50px 140px minmax(0,1fr) 100px 100px 100px' : '50px 150px minmax(0,1.2fr) 100px 100px 100px 100px 110px 150px', gap: 10, padding: '12px 16px', borderTop: '1px solid #eef3f8', alignItems: 'center', background: idx % 2 === 0 ? '#fff' : '#fafbfd' }}>
                <div style={{ fontSize: 12, color: '#7b889b', ...S.mono }}>{((data.page - 1) * (data.limit || pageSize)) + idx + 1}</div>
                <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{row.order_no || '-'}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#1c2740', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer?.company_name || row.customer?.name || '未綁定客戶'}</div>
                </div>
                <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.order_date || '-'}</div>
                <div><span style={S.tag(statusKey === 'confirmed' ? 'green' : '')}>{ORDER_STATUS_MAP[statusKey] || statusKey}</span></div>
                {!isTablet && <div><span style={S.tag(payKey === 'paid' ? 'green' : payKey === 'partial' ? 'yellow' : '')}>{PAY_STATUS_MAP[payKey] || payKey}</span></div>}
                {!isTablet && <div><span style={S.tag(shipKey === 'shipped' || shipKey === 'delivered' ? 'green' : '')}>{SHIP_STATUS_MAP[shipKey] || shipKey}</span></div>}
                {!isTablet && <div style={{ fontSize: 13, color: '#129c59', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {shipKey === 'shipped' || shipKey === 'delivered' ? (
                    <span style={{ ...S.tag('green'), fontSize: 11 }}>已轉銷貨</span>
                  ) : (
                    <button onClick={() => convertToSale(row)} disabled={convertingId === row.id} style={{ ...S.btnGhost, padding: '5px 8px', fontSize: 11, opacity: convertingId === row.id ? 0.7 : 1 }}>
                      {convertingId === row.id ? '轉銷中' : '轉銷貨'}
                    </button>
                  )}
                  <button onClick={() => window.open(`/api/pdf?type=order&id=${row.id}`, '_blank')} style={{ ...S.btnGhost, padding: '5px 8px', fontSize: 11 }}>PDF</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, pageSize)}
        onLimitChange={(nextLimit) => { setPageSize(nextLimit); load(1, search, nextLimit); }}
      />
    </div>
  );
}

/* ========================================= SALES DOCUMENTS ========================================= */
function SalesDocuments() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { total: 0, gross_profit: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [selectedSlipNumber, setSelectedSlipNumber] = useState('');

  const load = useCallback(async (page = 1, q = search, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'sales_documents', page: String(page), limit: String(limit), search: q });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, pageSize]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const focusedSlip = window.localStorage.getItem(SALES_DOCUMENT_FOCUS_KEY);
    if (!focusedSlip) return;
    setSearch(focusedSlip);
    load(1, focusedSlip, pageSize);
    window.localStorage.removeItem(SALES_DOCUMENT_FOCUS_KEY);
  }, [load, pageSize]);

  return (
    <div>
      <PageLead eyebrow="Sales" title="銷貨單" description="查看實際銷貨單、發票號碼與毛利，並可點單號查看完整銷貨單內容。" action={<CsvImportButton datasetId="qb_sales_history" onImported={() => load(1, search, pageSize)} compact />} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, pageSize)} placeholder="搜尋銷貨單號、客戶、業務或發票..." style={{ ...S.input, flex: 1 }} />
        <button onClick={() => load(1, search, pageSize)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `qb_sales_history` 或目前資料不可讀。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="STOT" label="銷貨筆數" value={fmt(data.total)} tone="blue" />
        <StatCard code="REV" label="本頁營收" value={fmtP(data.summary?.total)} tone="green" />
        <StatCard code="GP" label="本頁毛利" value={fmtP(data.summary?.gross_profit)} tone="yellow" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有銷貨單資料" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '160px minmax(0,1.2fr) 110px 110px' : '170px minmax(0,1.3fr) 120px 120px 120px 120px 120px', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, ...S.mono }}>
            <div>銷貨單號</div>
            <div>客戶 / 發票</div>
            <div>日期</div>
            <div>業務</div>
            {!isTablet && <div style={{ textAlign: 'right' }}>未稅</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>總額</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>毛利</div>}
          </div>
          {data.rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '160px minmax(0,1.2fr) 110px 110px' : '170px minmax(0,1.3fr) 120px 120px 120px 120px 120px', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef3f8', alignItems: 'center' }}>
              <button onClick={() => setSelectedSlipNumber(row.slip_number)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', fontSize: 12, color: '#1976f3', fontWeight: 700, cursor: 'pointer', ...S.mono }}>
                {row.slip_number || '-'}
              </button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer_name || '未命名客戶'}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.6 }}>
                  <span style={{ color: '#7b889b', ...S.mono }}>INV</span> {row.invoice_number || '-'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.sale_date || '-'}</div>
              <div style={{ fontSize: 12, color: '#617084' }}>{row.sales_person || '-'}</div>
              {!isTablet && <div style={{ fontSize: 13, color: '#1c2740', textAlign: 'right', ...S.mono }}>{fmtP(row.subtotal)}</div>}
              {!isTablet && <div style={{ fontSize: 13, color: '#129c59', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total)}</div>}
              {!isTablet && <div style={{ fontSize: 13, color: '#1976f3', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.gross_profit)}
                <button onClick={() => window.open(`/api/pdf?type=sale&id=${row.id}`, '_blank')} style={{ ...S.btnGhost, padding: '3px 6px', fontSize: 10, marginLeft: 6 }}>PDF</button>
              </div>}
            </div>
          ))}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, pageSize)}
        onLimitChange={(nextLimit) => { setPageSize(nextLimit); load(1, search, nextLimit); }}
      />
      <SaleDetailDrawer slipNumber={selectedSlipNumber} open={Boolean(selectedSlipNumber)} onClose={() => setSelectedSlipNumber('')} />
    </div>
  );
}

/* ========================================= PROMOTIONS ========================================= */
function Promotions() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', note: '', items: '' });
  const load = () => { apiGet({ action: 'promotions' }).then(d => setPromos(d.promotions || [])).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const submit = async () => {
    const items = form.items.split('\n').filter(Boolean).map(line => {
      const match = line.match(/^([A-Za-z0-9-]+)\s*[→=:]\s*(?:NT\$?)([\d,]+)(?:\s*[（(](.+)[)）])?/);
      if (!match) return null;
      return { item_number: match[1].toUpperCase(), promo_price: parseInt(match[2].replace(/,/g, '')), promo_note: match[3] || null };
    }).filter(Boolean);
    const res = await apiPost({ action: 'create_promotion', ...form, items });
    if (!res.error) { setShowForm(false); setForm({ name: '', start_date: '', end_date: '', note: '', items: '' }); load(); }
  };
  const toggle = async (id, active) => { await apiPost({ action: 'toggle_promotion', id, is_active: !active }); load(); };
  return (
    <div>
      <PageLead eyebrow="Campaigns" title="活動管理" description="建立與切換促銷活動，集中管理優惠商品與檔期資訊。" action={<button onClick={() => setShowForm(!showForm)} style={S.btnPrimary}>{showForm ? '取消' : '+ 新增活動'}</button>} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>共 {promos.length} 個活動</div>
      </div>
      {showForm && (
        <div style={{ ...S.card, borderColor: '#10b98130', marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', marginBottom: 18 }}>NEW_PROMOTION</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div><label style={S.label}>活動名稱</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="四月工具月" style={S.input} /></div>
            <div><label style={S.label}>備註</label><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="滿 10,000 免運" style={S.input} /></div>
            <div><label style={S.label}>開始日期</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={S.input} /></div>
            <div><label style={S.label}>結束日期</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={S.input} /></div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={S.label}>活動商品（每行格式：型號 → 價格（備註））</label>
            <textarea value={form.items} onChange={e => setForm({ ...form, items: e.target.value })} placeholder={`ATECH3FR250B → 28000\nTPGDL2000 → 8500（買一送充氣嘴組）`} rows={5} style={{ ...S.input, resize: 'vertical', ...S.mono, fontSize: 12, lineHeight: 1.6 }} />
          </div>
          <button onClick={submit} style={S.btnPrimary}>建立活動</button>
        </div>
      )}
      {loading ? <Loading /> : promos.map(p => (
        <div key={p.id} style={{ ...S.card, borderColor: p.is_active ? '#bdeccb' : '#dbe3ee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1c2740' }}>{p.name}</span>
              <span style={S.tag(p.is_active ? 'green' : 'red')}>{p.is_active ? 'ACTIVE' : 'CLOSED'}</span>
            </div>
            <button onClick={() => toggle(p.id, p.is_active)} style={{ ...S.btnGhost, color: p.is_active ? '#f87171' : '#4ade80', borderColor: p.is_active ? '#ef444425' : '#22c55e25', fontSize: 12 }}>{p.is_active ? '關閉' : '啟用'}</button>
          </div>
          <div style={{ color: '#6f7d90', fontSize: 12, marginTop: 6, ...S.mono }}>{p.start_date} → {p.end_date}{p.note ? ` · ${p.note}` : ''}</div>
          {p.quickbuy_promotion_items?.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid #e6edf5', paddingTop: 10 }}>
              {p.quickbuy_promotion_items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0', fontSize: 12 }}>
                  <span style={{ color: '#1976f3', ...S.mono, width: 140 }}>{item.item_number}</span>
                  <span style={{ color: '#129c59', ...S.mono }}>NT${fmt(item.promo_price)}</span>
                  {item.promo_note && <span style={{ color: '#77859a' }}>({item.promo_note})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {!loading && promos.length === 0 && !showForm && <EmptyState text="尚無活動，點「+ 新增活動」建立" />}
    </div>
  );
}

/* ========================================= PRICING RULES ========================================= */
function PricingRules() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  useEffect(() => { apiGet({ action: 'pricing' }).then(d => setRules(d.rules)).finally(() => setLoading(false)); }, []);
  const save = async () => { await apiPost({ action: 'update_pricing', rules }); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  if (loading || !rules) return <Loading />;
  return (
    <div style={{ maxWidth: 560, width: '100%' }}>
      <PageLead eyebrow="Pricing" title="報價規則" description="維護後台內部報價參數，快速調整折扣、免運門檻與提示文字。" />
      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', marginBottom: 20, ...S.mono }}>PRICING_CONFIG</div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>預設折扣比例</label><div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}><input type="number" step="0.01" min="0" max="1" value={rules.default_discount} onChange={e => setRules({ ...rules, default_discount: parseFloat(e.target.value) })} style={{ ...S.input, width: isMobile ? '100%' : 120, textAlign: 'center', ...S.mono }} /><span style={{ color: '#6f7d90', fontSize: 12 }}>= {Math.round(rules.default_discount * 100)} 折（內部參考）</span></div></div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>免運門檻 (NT$)</label><input type="number" step="100" value={rules.free_shipping_threshold} onChange={e => setRules({ ...rules, free_shipping_threshold: parseInt(e.target.value) })} style={{ ...S.input, width: 160, ...S.mono }} /></div>
        <div style={{ marginBottom: 18 }}><label style={S.label}>優惠提示文字</label><input value={rules.promo_hint_text || '✨ 私訊享優惠價'} onChange={e => setRules({ ...rules, promo_hint_text: e.target.value })} style={S.input} /></div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
          <label style={{ color: '#617084', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={rules.show_retail_price} onChange={e => setRules({ ...rules, show_retail_price: e.target.checked })} style={{ accentColor: '#1976f3' }} />顯示建議售價</label>
          <label style={{ color: '#617084', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={rules.show_promo_hint} onChange={e => setRules({ ...rules, show_promo_hint: e.target.checked })} style={{ accentColor: '#1976f3' }} />顯示優惠提示</label>
        </div>
        <button onClick={save} style={{ ...S.btnPrimary, background: saved ? '#129c59' : 'linear-gradient(180deg, #2d8cff 0%, #1976f3 100%)', transition: 'background 0.3s', width: '100%', padding: '11px 0', fontSize: 14 }}>{saved ? '✓ SAVED' : '儲存設定'}</button>
      </div>
    </div>
  );
}

/* ========================================= VENDORS ========================================= */
function Vendors() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState({ vendors: [], total: 0, page: 1, limit: 20, table_ready: true });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async (page = 1, q = search) => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'vendors', page: String(page), search: q });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageLead
        eyebrow="Vendors"
        title="廠商主檔"
        description="查看供應商主檔、聯絡窗口與統編資訊，後續可接採購與補貨流程。"
        action={<CsvImportButton datasetId="erp_vendors" onImported={() => load(1, search)} compact />}
      />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search)} placeholder="搜尋廠商名稱、代號或聯絡人..." style={{ ...S.input, flex: 1 }} />
        <button onClick={() => load(1, search)} style={S.btnPrimary}>搜尋</button>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `erp_vendors` 資料表，請先跑 [`docs/erp-auxiliary-tables.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-auxiliary-tables.sql) 後再匯入廠商資料。</div>}
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>共 {fmt(data.total)} 筆廠商</div>
      {loading ? <Loading /> : data.vendors.length === 0 ? <EmptyState text="目前沒有廠商資料" /> : data.vendors.map((vendor) => (
        <div key={vendor.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '160px minmax(0, 1fr) 160px', gap: 12, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>VENDOR_CODE</div>
              <div style={{ fontSize: 14, color: '#1976f3', fontWeight: 700, ...S.mono }}>{vendor.vendor_code || '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: 15, color: '#1c2740', fontWeight: 700 }}>{vendor.vendor_name || '未命名廠商'}</div>
              <div style={{ fontSize: 12, color: '#617084', lineHeight: 1.8, marginTop: 6 }}>
                <div><span style={{ color: '#7b889b', ...S.mono }}>CONTACT</span> {vendor.contact_name || '-'}</div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>PHONE</span> {vendor.phone || vendor.mobile || '-'}</div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>ADDRESS</span> {vendor.address || '-'}</div>
              </div>
            </div>
            <div style={S.panelMuted}>
              <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>TAX_ID</div>
              <div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{vendor.tax_id || '-'}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ========================================= SALES RETURNS ========================================= */
function SalesReturns() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const initialRange = getPresetDateRange('today');
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { amount: 0, tax: 0, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [rangePreset, setRangePreset] = useState('today');
  const [pageSize, setPageSize] = useState(50);
  const [selectedSlipNumber, setSelectedSlipNumber] = useState('');

  const load = useCallback(async (page = 1, q = search, from = dateFrom, to = dateTo, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({
        action: 'sales_returns',
        page: String(page),
        limit: String(limit),
        search: q,
        date_from: from,
        date_to: to,
      });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo, pageSize]);

  useEffect(() => { load(); }, []);

  const applyPreset = (preset) => {
    if (preset === 'custom') {
      setRangePreset('custom');
      return;
    }
    const range = getPresetDateRange(preset);
    setRangePreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    load(1, search, range.from, range.to, pageSize);
  };

  return (
    <div>
      <PageLead
        eyebrow="Returns"
        title="銷退貨彙總"
        description="查看銷貨與退貨單據彙總，快速掌握單號、客戶與發票資訊。"
        action={<CsvImportButton datasetId="erp_sales_return_summary" onImported={() => load(1, search, dateFrom, dateTo, pageSize)} compact />}
      />
      <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, dateFrom, dateTo, pageSize)} placeholder="搜尋單號、客戶、業務或發票..." style={{ ...S.input, flex: 1 }} />
          <button onClick={() => load(1, search, dateFrom, dateTo, pageSize)} style={S.btnPrimary}>搜尋</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            ['today', '今日'],
            ['week', '週'],
            ['month', '月'],
            ['quarter', '季'],
            ['year', '年'],
            ['custom', '自選'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => applyPreset(value)}
              style={{
                ...S.btnGhost,
                padding: '6px 12px',
                fontSize: 12,
                background: rangePreset === value ? '#edf5ff' : '#fff',
                borderColor: rangePreset === value ? '#94c3ff' : '#dbe3ee',
                color: rangePreset === value ? '#1976f3' : '#5b6779',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <input type="date" value={dateFrom} onChange={(e) => { setRangePreset('custom'); setDateFrom(e.target.value); }} style={{ ...S.input, maxWidth: isMobile ? '100%' : 180 }} />
          <input type="date" value={dateTo} onChange={(e) => { setRangePreset('custom'); setDateTo(e.target.value); }} style={{ ...S.input, maxWidth: isMobile ? '100%' : 180 }} />
          <button onClick={() => load(1, search, dateFrom, dateTo, pageSize)} style={S.btnGhost}>套用區間</button>
          <button onClick={() => applyPreset('today')} style={S.btnGhost}>回到今日</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `erp_sales_return_summary` 資料表，請先跑 [`docs/erp-auxiliary-tables.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-auxiliary-tables.sql) 再匯入銷退貨 CSV。</div>}
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>
        共 {fmt(data.total)} 筆單據{dateFrom || dateTo ? ` · ${dateFrom || '...'} → ${dateTo || '...'}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="AMT" label="未稅金額" value={fmtP(data.summary?.amount)} tone="blue" />
        <StatCard code="TAX" label="稅額" value={fmtP(data.summary?.tax)} tone="yellow" />
        <StatCard code="TOTAL" label="總金額" value={fmtP(data.summary?.total)} tone="green" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有銷退貨資料" /> : isMobile ? data.rows.map((row) => (
        <div key={row.id} style={{ ...S.card, padding: '12px 16px', marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, alignItems: 'center' }}>
            <div>
              {row.doc_type === 'return' ? (
                <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{row.doc_no}</div>
              ) : (
                <button
                  onClick={() => setSelectedSlipNumber(row.doc_no)}
                  style={{ background: 'none', border: 0, padding: 0, fontSize: 12, color: '#1976f3', fontWeight: 700, cursor: 'pointer', ...S.mono }}
                >
                  {row.doc_no}
                </button>
              )}
              <div style={{ marginTop: 6 }}>{row.doc_type === 'return' ? <span style={S.tag('red')}>退貨</span> : <span style={S.tag('green')}>銷貨</span>}</div>
            </div>
            <div>
              <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700 }}>{row.customer_name || '未命名客戶'}</div>
              <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.7 }}>
                <div><span style={{ color: '#7b889b', ...S.mono }}>DATE</span> {row.doc_date || '-'}</div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>SALES</span> {row.sales_name || '-'}</div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>INVOICE</span> {row.invoice_no || '-'}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>AMOUNT</div>
                <div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{fmtP(row.amount)}</div>
              </div>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>TOTAL</div>
                <div style={{ fontSize: 14, color: '#129c59', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>
              </div>
            </div>
          </div>
        </div>
      )) : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '96px 150px minmax(0,1fr) 110px 120px' : '96px 160px minmax(0,1.2fr) 110px 150px 130px 130px', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, ...S.mono }}>
            <div>單別</div>
            <div>單號</div>
            <div>客戶 / 發票</div>
            <div>日期</div>
            <div>業務</div>
            {!isTablet && <div style={{ textAlign: 'right' }}>未稅金額</div>}
            {!isTablet && <div style={{ textAlign: 'right' }}>總金額</div>}
          </div>
          {data.rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? '96px 150px minmax(0,1fr) 110px 120px' : '96px 160px minmax(0,1.2fr) 110px 150px 130px 130px', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef3f8', alignItems: 'center' }}>
              <div>{row.doc_type === 'return' ? <span style={S.tag('red')}>退貨</span> : <span style={S.tag('green')}>銷貨</span>}</div>
              {row.doc_type === 'return' ? (
                <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{row.doc_no}</div>
              ) : (
                <button
                  onClick={() => setSelectedSlipNumber(row.doc_no)}
                  style={{ background: 'none', border: 0, padding: 0, fontSize: 12, color: '#1976f3', fontWeight: 700, textAlign: 'left', cursor: 'pointer', ...S.mono }}
                >
                  {row.doc_no}
                </button>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer_name || '未命名客戶'}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.6 }}>
                  <span style={{ color: '#7b889b', ...S.mono }}>INVOICE</span> {row.invoice_no || '-'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.doc_date || '-'}</div>
              <div style={{ fontSize: 12, color: '#617084' }}>{row.sales_name || '-'}</div>
              {!isTablet && <div style={{ fontSize: 13, color: '#1c2740', textAlign: 'right', ...S.mono }}>{fmtP(row.amount)}</div>}
              {!isTablet && <div style={{ fontSize: 13, color: '#129c59', fontWeight: 700, textAlign: 'right', ...S.mono }}>{fmtP(row.total_amount)}</div>}
            </div>
          ))}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, dateFrom, dateTo, pageSize)}
        onLimitChange={(nextLimit) => {
          setPageSize(nextLimit);
          load(1, search, dateFrom, dateTo, nextLimit);
        }}
      />
      <SaleDetailDrawer slipNumber={selectedSlipNumber} open={Boolean(selectedSlipNumber)} onClose={() => setSelectedSlipNumber('')} />
    </div>
  );
}

/* ========================================= PROFIT ANALYSIS ========================================= */
function ProfitAnalysis() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const isTablet = width < 1180;
  const initialRange = getPresetDateRange('today');
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20, table_ready: true, summary: { amount: 0, cost: 0, gross_profit: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [rangePreset, setRangePreset] = useState('today');
  const [pageSize, setPageSize] = useState(50);
  const [selectedSlipNumber, setSelectedSlipNumber] = useState('');

  const load = useCallback(async (page = 1, q = search, from = dateFrom, to = dateTo, limit = pageSize) => {
    setLoading(true);
    try {
      const result = await apiGet({
        action: 'profit_analysis',
        page: String(page),
        limit: String(limit),
        search: q,
        date_from: from,
        date_to: to,
      });
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo, pageSize]);

  useEffect(() => { load(); }, []);
  const applyPreset = (preset) => {
    if (preset === 'custom') {
      setRangePreset('custom');
      return;
    }
    const range = getPresetDateRange(preset);
    setRangePreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    load(1, search, range.from, range.to, pageSize);
  };

  const marginPct = data.summary?.amount ? `${((data.summary.gross_profit / data.summary.amount) * 100).toFixed(1)}%` : '-';

  return (
    <div>
      <PageLead
        eyebrow="Profit"
        title="利潤分析"
        description="查看銷貨利潤彙總、成本與毛利，方便先做營運分析與排行基礎。"
        action={<CsvImportButton datasetId="erp_profit_analysis" onImported={() => load(1, search, dateFrom, dateTo, pageSize)} compact />}
      />
      <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, dateFrom, dateTo, pageSize)} placeholder="搜尋客戶、單號或業務..." style={{ ...S.input, flex: 1 }} />
          <button onClick={() => load(1, search, dateFrom, dateTo, pageSize)} style={S.btnPrimary}>搜尋</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            ['today', '今日'],
            ['week', '週'],
            ['month', '月'],
            ['quarter', '季'],
            ['year', '年'],
            ['custom', '自選'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => applyPreset(value)}
              style={{
                ...S.btnGhost,
                padding: '6px 12px',
                fontSize: 12,
                background: rangePreset === value ? '#edf5ff' : '#fff',
                borderColor: rangePreset === value ? '#94c3ff' : '#dbe3ee',
                color: rangePreset === value ? '#1976f3' : '#5b6779',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <input type="date" value={dateFrom} onChange={(e) => { setRangePreset('custom'); setDateFrom(e.target.value); }} style={{ ...S.input, maxWidth: isMobile ? '100%' : 180 }} />
          <input type="date" value={dateTo} onChange={(e) => { setRangePreset('custom'); setDateTo(e.target.value); }} style={{ ...S.input, maxWidth: isMobile ? '100%' : 180 }} />
          <button onClick={() => load(1, search, dateFrom, dateTo, pageSize)} style={S.btnGhost}>套用區間</button>
          <button onClick={() => applyPreset('today')} style={S.btnGhost}>回到今日</button>
        </div>
      </div>
      {!data.table_ready && <div style={{ ...S.card, background: '#fff8eb', borderColor: '#f7d699', color: '#8a5b00' }}>尚未建立 `erp_profit_analysis` 資料表，請先跑 [`docs/erp-auxiliary-tables.sql`](/Users/tungyiwu/Desktop/AI/Auto%20QB/Auto-bot-QB/docs/erp-auxiliary-tables.sql) 再匯入利潤分析 CSV。</div>}
      <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 12, ...S.mono }}>
        共 {fmt(data.total)} 筆分析資料{dateFrom || dateTo ? ` · ${dateFrom || '...'} → ${dateTo || '...'}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard code="SALES" label="銷貨金額" value={fmtP(data.summary?.amount)} tone="blue" />
        <StatCard code="COST" label="成本" value={fmtP(data.summary?.cost)} tone="yellow" />
        <StatCard code="GP" label="毛利" value={fmtP(data.summary?.gross_profit)} tone="green" />
        <StatCard code="GM" label="毛利率" value={marginPct} tone="red" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有利潤分析資料" /> : isMobile ? data.rows.map((row) => (
        <div key={row.id} style={{ ...S.card, padding: '12px 16px', marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700 }}>{row.customer_name || '未命名客戶'}</div>
              <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.7 }}>
                <div>
                  <span style={{ color: '#7b889b', ...S.mono }}>DOC</span>{' '}
                  {row.doc_no ? (
                    <button
                      onClick={() => setSelectedSlipNumber(row.doc_no)}
                      style={{ background: 'none', border: 0, padding: 0, color: '#1976f3', fontWeight: 700, cursor: 'pointer', ...S.mono }}
                    >
                      {row.doc_no}
                    </button>
                  ) : '-'}
                </div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>DATE</span> {row.doc_date || '-'}</div>
                <div><span style={{ color: '#7b889b', ...S.mono }}>SALES</span> {row.sales_name || '-'}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>AMOUNT</div>
                <div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{fmtP(row.amount)}</div>
              </div>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>COST</div>
                <div style={{ fontSize: 14, color: '#1c2740', ...S.mono }}>{fmtP(row.cost)}</div>
              </div>
              <div style={S.panelMuted}>
                <div style={{ fontSize: 11, color: '#7b889b', marginBottom: 6, ...S.mono }}>GROSS</div>
                <div style={{ fontSize: 14, color: '#129c59', fontWeight: 700, ...S.mono }}>{fmtP(row.gross_profit)}</div>
              </div>
            </div>
          </div>
        </div>
      )) : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? 'minmax(0,1.2fr) 120px 120px 120px' : 'minmax(0,1.4fr) 110px 140px 140px 140px 120px', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, ...S.mono }}>
            <div>客戶 / 單號</div>
            {!isTablet && <div>日期</div>}
            {!isTablet && <div>業務</div>}
            <div style={{ textAlign: 'right' }}>銷貨金額</div>
            <div style={{ textAlign: 'right' }}>成本</div>
            <div style={{ textAlign: 'right' }}>毛利</div>
            {!isTablet && <div style={{ textAlign: 'right' }}>毛利率</div>}
          </div>
          {data.rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isTablet ? 'minmax(0,1.2fr) 120px 120px 120px' : 'minmax(0,1.4fr) 110px 140px 140px 140px 120px', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef3f8', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#1c2740', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer_name || '未命名客戶'}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 4, lineHeight: 1.6 }}>
                  <span style={{ color: '#7b889b', ...S.mono }}>DOC</span>{' '}
                  {row.doc_no ? (
                    <button
                      onClick={() => setSelectedSlipNumber(row.doc_no)}
                      style={{ background: 'none', border: 0, padding: 0, color: '#1976f3', fontWeight: 700, cursor: 'pointer', ...S.mono }}
                    >
                      {row.doc_no}
                    </button>
                  ) : '-'}
                  {isTablet ? ` · ${row.doc_date || '-'}` : ''}
                </div>
              </div>
              {!isTablet && <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.doc_date || '-'}</div>}
              {!isTablet && <div style={{ fontSize: 12, color: '#617084' }}>{row.sales_name || '-'}</div>}
              <div style={{ fontSize: 13, color: '#1c2740', textAlign: 'right', ...S.mono }}>{fmtP(row.amount)}</div>
              <div style={{ fontSize: 13, color: '#1c2740', textAlign: 'right', ...S.mono }}>{fmtP(row.cost)}</div>
              <div style={{ fontSize: 13, color: '#129c59', fontWeight: 700, textAlign: 'right', ...S.mono }}>{fmtP(row.gross_profit)}</div>
              {!isTablet && <div style={{ fontSize: 12, color: '#617084', textAlign: 'right', ...S.mono }}>{row.gross_margin || '-'}</div>}
            </div>
          ))}
        </div>
      )}
      <Pager
        page={data.page || 1}
        limit={data.limit || pageSize}
        total={data.total || 0}
        onPageChange={(nextPage) => load(nextPage, search, dateFrom, dateTo, pageSize)}
        onLimitChange={(nextLimit) => {
          setPageSize(nextLimit);
          load(1, search, dateFrom, dateTo, nextLimit);
        }}
      />
      <SaleDetailDrawer slipNumber={selectedSlipNumber} open={Boolean(selectedSlipNumber)} onClose={() => setSelectedSlipNumber('')} />
    </div>
  );
}

/* ========================================= IMPORT CENTER ========================================= */
function ImportCenter() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet({ action: 'import_history' });
      setHistory(result.history || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const resetBusinessData = useCallback(async () => {
    const confirmation = typeof window === 'undefined'
      ? ''
      : window.prompt('這會清空 ERP 主資料、交易資料、銷貨/報表資料，但保留 LINE 與系統設定。\n\n請輸入 RESET ERP 確認：', '');

    if (confirmation !== 'RESET ERP') {
      setResetStatus('已取消清空作業');
      return;
    }

    setResetting(true);
    setResetStatus('');

    try {
      const result = await apiPost({ action: 'reset_erp_business_data', confirmation });
      setResetStatus(`已清空 ${fmt((result.cleared_tables || []).length)} 張 ERP 業務資料表`);
      await loadHistory();
    } catch (error) {
      setResetStatus(error.message || '清空作業失敗');
    } finally {
      setResetting(false);
    }
  }, [loadHistory]);

  return (
    <div>
      <PageLead eyebrow="Import" title="資料匯入" description="直接從後台匯入 CSV 或 Excel，不用再進 Supabase Table Editor。支援我們整理好的 import-ready CSV，也支援原始 .xlsx 檔案。" />
      <div style={{ ...S.card, marginBottom: 18, background: '#fff8eb', borderColor: '#f7d699' }}>
        <PanelHeader title="安全重置" meta="交付新店或重新初始化前，可先清空 ERP 業務資料。這個動作會保留 LINE 客戶、訊息、系統設定與匯入歷史。" badge={<div style={S.tag('red')}>Danger Zone</div>} />
        {resetStatus ? (
          <div style={{ ...S.panelMuted, marginBottom: 12, background: resetStatus.includes('已清空') ? '#edf9f2' : '#fff4f4', borderColor: resetStatus.includes('已清空') ? '#bdeccb' : '#ffc7cf', color: resetStatus.includes('已清空') ? '#127248' : '#d1435b' }}>
            {resetStatus}
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: '#8a5b00', lineHeight: 1.8 }}>
            清空範圍：商品、正式客戶、廠商、報價、訂單、銷貨、銷退貨、利潤分析。
            <br />
            保留範圍：LINE 客戶、LINE 訊息、系統設定、AI Prompt、匯入歷史。
          </div>
          <button onClick={resetBusinessData} disabled={resetting} style={{ ...S.btnGhost, borderColor: '#f0b86d', color: '#8a5b00', background: '#fff' }}>
            {resetting ? '清空中...' : '清空 ERP 業務資料'}
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 14 }}>
        {Object.entries(IMPORT_DATASETS).map(([datasetId, dataset]) => (
          <div key={datasetId} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 16, color: '#1c2740', fontWeight: 700 }}>{dataset.title}</div>
                <div style={{ fontSize: 12, color: '#617084', marginTop: 6, lineHeight: 1.7 }}>{dataset.desc}</div>
                <div style={{ fontSize: 11, color: '#7b889b', marginTop: 8, ...S.mono }}>{dataset.fields}</div>
              </div>
              <div style={{ minWidth: 150, textAlign: 'right' }}>
                <CsvImportButton datasetId={datasetId} onImported={loadHistory} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...S.card, marginTop: 18 }}>
        <PanelHeader title="匯入歷史" meta="保留最近的資料更換紀錄，方便回查誰在什麼時候換過哪一包資料。" badge={<div style={{ ...S.tag('') }}>{fmt(history.length)} 筆</div>} />
        {loading ? <Loading /> : history.length === 0 ? <EmptyState text="目前還沒有匯入紀錄" /> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {history.map((entry, index) => {
              const dataset = IMPORT_DATASETS[entry.dataset];
              return (
                <div key={`${entry.imported_at || 'history'}-${index}`} style={{ ...S.panelMuted, display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, color: '#1c2740', fontWeight: 700 }}>
                      {dataset?.title || entry.dataset || '未知資料集'}
                    </div>
                    <div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>{fmtDate(entry.imported_at)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#617084', lineHeight: 1.7 }}>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>FILE</span> {entry.file_name || '-'}</div>
                    <div><span style={{ color: '#7b889b', ...S.mono }}>ROWS</span> {fmt(entry.count || 0)} 筆</div>
                    {'inserted' in entry || 'updated' in entry ? (
                      <div><span style={{ color: '#7b889b', ...S.mono }}>DETAIL</span> 新增 {fmt(entry.inserted || 0)} / 更新 {fmt(entry.updated || 0)}</div>
                    ) : null}
                    <div><span style={{ color: '#7b889b', ...S.mono }}>BY</span> {entry.imported_by || 'admin'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ========================================= AI PROMPT 設定 ========================================= */
function AIPrompt() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    apiGet({ action: 'ai_prompt' })
      .then((data) => { setPrompt(data.prompt || ''); })
      .finally(() => setLoading(false));
    Promise.all([
      apiGet({ action: 'chat_history_stats' }),
      apiGet({ action: 'stats' }),
    ]).then(([history, dashboard]) => {
      setStats({
        chatHistory: history.total || 0,
        aiMessages: dashboard.total_messages || 0,
      });
    });
  }, []);

  const save = async () => {
    await apiPost({ action: 'update_ai_prompt', prompt });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <Loading />;
  return (
    <div>
      <PageLead eyebrow="Prompt" title="AI Prompt 設定" description="調整 Bot 的回覆風格與客服 SOP，這裡的內容會直接影響下一次對話生成。" />

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard code="HIST" label="歷史對話" value={fmt(stats.chatHistory)} sub="匯入的 Line 對話" accent="#06c755" />
          <StatCard code="AI" label="AI 回覆" value={fmt(stats.aiMessages)} sub="Bot 自動回覆" accent="#10b981" />
        </div>
      )}

      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', ...S.mono }}>AI_SYSTEM_PROMPT</div>
          <div style={{ ...S.tag('green') }}>Claude Sonnet</div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={S.label}>AI 回覆的 System Prompt — 控制 Bot 的回覆風格和行為</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={20}
            style={{ ...S.input, resize: 'vertical', ...S.mono, fontSize: 12, lineHeight: 1.8 }}
            placeholder="輸入 AI 的 system prompt..."
          />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row' }}>
          <button onClick={save} style={{ ...S.btnPrimary, flex: 1, background: saved ? '#22c55e' : '#10b981', transition: 'background 0.3s', padding: '11px 0', fontSize: 14 }}>{saved ? '✓ SAVED' : '儲存 Prompt'}</button>
          <div style={{ fontSize: 11, color: '#6f7d90', ...S.mono }}>{prompt.length} 字</div>
        </div>
      </div>

      <div style={{ ...S.card, borderColor: '#dbe3ee' }}>
        <div style={{ color: '#6f7d90', fontSize: 11, lineHeight: 1.9, ...S.mono }}>
          <span style={{ color: '#4f6178' }}>// 使用說明</span><br/>
          // 修改後立即生效，AI 下次回覆就會套用新 prompt<br/>
          // 建議包含：角色設定、回覆風格、報價格式、SOP 流程<br/>
          // 可從「歷史對話」分頁參考真人客服的回覆方式<br/>
          // prompt 越精確，AI 回覆品質越好
        </div>
      </div>
    </div>
  );
}

/* ========================================= LINE 歷史對話 ========================================= */
function ChatHistory() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState(null);
  const PAGE_SIZE = 30;

  const load = useCallback(async (q = search, pg = 0) => {
    setLoading(true);
    const data = await apiGet({
      action: 'chat_history',
      search: q,
      page: String(pg),
      limit: String(PAGE_SIZE),
    });
    setMessages(data.messages || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    load();
    apiGet({ action: 'chat_history_stats' }).then(setStats);
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const goPage = (pg) => { setPage(pg); load(search, pg); };

  return (
    <div>
      <PageLead eyebrow="LINE Archive" title="歷史對話" description="檢視匯入的 LINE 對話資料，方便回顧真人客服風格與客戶常見需求。" />

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard code="TOTAL" label="總訊息數" value={fmt(stats.total)} sub="all messages" accent="#06c755" />
          <StatCard code="USER" label="客戶訊息" value={fmt(stats.user)} sub="from customers" accent="#06c755" />
          <StatCard code="ACCT" label="官方回覆" value={fmt(stats.account)} sub="from staff" accent="#06c755" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setPage(0); load(search, 0); } }} placeholder="搜尋對話內容、客戶名稱、客服名稱..." style={{ ...S.input, flex: 1 }} onFocus={e => e.target.style.borderColor = '#06c755'} onBlur={e => e.target.style.borderColor = '#ccd6e3'} />
        <button onClick={() => { setPage(0); load(search, 0); }} style={S.btnLine}>搜尋</button>
      </div>

      <div style={{ fontSize: 11, color: '#6f7d90', marginBottom: 12, ...S.mono }}>共 {fmt(total)} 筆 {totalPages > 1 && `· P${page + 1}/${totalPages}`}</div>

      {loading ? <Loading /> : messages.length === 0 ? <EmptyState text="沒有找到對話記錄" /> : messages.map(msg => (
        <div key={msg.id} style={{ ...S.card, padding: '12px 18px', marginBottom: 6, borderLeftColor: msg.sender_type === 'User' ? '#3b82f6' : '#06c755', borderLeftWidth: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 6, flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={S.tag(msg.sender_type === 'User' ? '' : 'line')}>{msg.sender_type === 'User' ? '客戶' : '客服'}</span>
              <span style={{ fontSize: 12, color: '#2b3750' }}>{msg.display_name}</span>
              {msg.sender_name && msg.sender_type === 'Account' && <span style={{ fontSize: 11, color: '#7c899b' }}>({msg.sender_name})</span>}
            </div>
            <span style={{ color: '#7b889b', fontSize: 11, ...S.mono }}>{msg.message_date} {msg.message_time}</span>
          </div>
          <div style={{ fontSize: 13, color: msg.sender_type === 'User' ? '#2b3750' : '#129c59', lineHeight: 1.6 }}>{msg.content}</div>
        </div>
      ))}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
          {page > 0 && <button onClick={() => goPage(page - 1)} style={S.btnGhost}>← 上一頁</button>}
          <span style={{ color: '#666', padding: '8px 0', fontSize: 12, ...S.mono }}>P{page + 1}/{totalPages}</span>
          {page < totalPages - 1 && <button onClick={() => goPage(page + 1)} style={S.btnGhost}>下一頁 →</button>}
        </div>
      )}
    </div>
  );
}

/* ========================================= INVENTORY 庫存管理 ========================================= */
function Inventory() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState({ items: [], total: 0, page: 0, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [adjOpen, setAdjOpen] = useState(null);
  const [adjQty, setAdjQty] = useState('');
  const [adjType, setAdjType] = useState('in');
  const [adjNotes, setAdjNotes] = useState('');

  const load = useCallback(async (page = 0, q = search, f = filter) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'inventory', page: String(page), search: q, filter: f, limit: '30' })); } finally { setLoading(false); }
  }, [search, filter]);

  useEffect(() => { load(); }, []);

  const handleAdjust = async () => {
    if (!adjOpen || !adjQty) return;
    try {
      await apiPost({ action: 'inventory_adjust', item_number: adjOpen, movement_type: adjType, quantity: adjQty, notes: adjNotes });
      setAdjOpen(null); setAdjQty(''); setAdjNotes('');
      load(data.page, search, filter);
    } catch (e) { alert(e.message); }
  };

  const sm = data.summary || {};
  return (
    <div>
      <PageLead eyebrow="Inventory" title="庫存管理" description="即時掌握所有商品庫存量、安全庫存水位，並可手動進行入庫/出庫異動。" />
      <div style={S.statGrid}>
        <StatCard code="ALL" label="總商品數" value={fmt(sm.total_products)} tone="blue" />
        <StatCard code="LOW" label="低於安全水位" value={fmt(sm.low_stock)} tone="blue" accent="#f59e0b" />
        <StatCard code="OUT" label="零庫存商品" value={fmt(sm.out_of_stock)} tone="blue" accent="#ef4444" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(0, search, filter)} placeholder="搜尋料號或品名..." style={{ ...S.input, flex: 1 }} />
        <select value={filter} onChange={(e) => { setFilter(e.target.value); load(0, search, e.target.value); }} style={{ ...S.input, width: isMobile ? '100%' : 160 }}>
          <option value="all">全部</option>
          <option value="low_stock">低庫存</option>
          <option value="out_of_stock">零庫存</option>
        </select>
        <button onClick={() => load(0, search, filter)} style={S.btnPrimary}>搜尋</button>
      </div>
      {loading ? <Loading /> : data.items.length === 0 ? <EmptyState text="沒有符合條件的商品" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
            <thead><tr style={{ background: '#f1f5fa' }}>
              {['料號','品名','分類','庫存','安全水位','狀態','操作'].map(h => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#6b7a8d', fontWeight: 700, borderBottom: '1px solid #dbe3ee' }}>{h}</th>)}
            </tr></thead>
            <tbody>{data.items.map(it => (
              <tr key={it.item_number} style={{ borderBottom: '1px solid #edf0f5' }}>
                <td style={{ padding: '10px 12px', ...S.mono, color: '#1976f3', fontWeight: 600 }}>{it.item_number}</td>
                <td style={{ padding: '10px 12px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.description || '-'}</td>
                <td style={{ padding: '10px 12px', color: '#617084' }}>{it.category || '-'}</td>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: Number(it.stock_qty || 0) <= 0 ? '#ef4444' : Number(it.stock_qty) <= Number(it.safety_stock) ? '#f59e0b' : '#16a34a' }}>{it.stock_qty ?? 0}</td>
                <td style={{ padding: '10px 12px', color: '#617084' }}>{it.safety_stock ?? 0}</td>
                <td style={{ padding: '10px 12px' }}><span style={S.tag(it.product_status === 'Current' ? 'green' : 'default')}>{it.product_status || '-'}</span></td>
                <td style={{ padding: '10px 12px' }}><button onClick={() => setAdjOpen(it.item_number)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 12 }}>異動</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search, filter)} />
      {adjOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 400, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>庫存異動 — {adjOpen}</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>異動類型</label>
              <select value={adjType} onChange={(e) => setAdjType(e.target.value)} style={S.input}>
                <option value="in">入庫 (增加)</option>
                <option value="out">出庫 (減少)</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>數量</label>
              <input type="number" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} style={S.input} placeholder="輸入數量" min="1" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>備註</label>
              <input value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} style={S.input} placeholder="選填" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setAdjOpen(null)} style={S.btnGhost}>取消</button>
              <button onClick={handleAdjust} style={S.btnPrimary}>確認異動</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= PAYMENTS 收款管理 ========================================= */
function Payments() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState({ payments: [], total: 0, page: 0, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ order_id: '', amount: '', payment_method: 'transfer', payment_date: '', bank_last5: '', notes: '' });

  const load = useCallback(async (page = 0, q = search, st = statusF) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'payments', page: String(page), search: q, status: st })); } finally { setLoading(false); }
  }, [search, statusF]);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try {
      await apiPost({ action: 'create_payment', ...form });
      setCreateOpen(false); setForm({ order_id: '', amount: '', payment_method: 'transfer', payment_date: '', bank_last5: '', notes: '' });
      load();
    } catch (e) { alert(e.message); }
  };

  const handleConfirm = async (id) => {
    try { await apiPost({ action: 'confirm_payment', payment_id: id }); load(); } catch (e) { alert(e.message); }
  };

  const sm = data.summary || {};
  const methodLabel = (m) => ({ transfer: '匯款', cash: '現金', check: '支票', card: '信用卡' })[m] || m || '-';

  return (
    <div>
      <PageLead eyebrow="Payments" title="收款管理" description="記錄客戶付款、確認收款狀態，自動更新訂單付款進度。"
        action={<button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增收款</button>} />
      <div style={S.statGrid}>
        <StatCard code="PEND" label="待確認" value={fmt(sm.pending)} tone="blue" accent="#f59e0b" />
        <StatCard code="CONF" label="已確認" value={fmt(sm.confirmed)} tone="blue" accent="#16a34a" />
        <StatCard code="AMT" label="已收金額" value={fmtP(sm.total_confirmed_amount)} tone="blue" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(0, search, statusF)} placeholder="搜尋收款單號..." style={{ ...S.input, flex: 1 }} />
        <select value={statusF} onChange={(e) => { setStatusF(e.target.value); load(0, search, e.target.value); }} style={{ ...S.input, width: isMobile ? '100%' : 140 }}>
          <option value="">全部狀態</option>
          <option value="pending">待確認</option>
          <option value="confirmed">已確認</option>
        </select>
        <button onClick={() => load(0, search, statusF)} style={S.btnPrimary}>搜尋</button>
      </div>
      {loading ? <Loading /> : data.payments.length === 0 ? <EmptyState text="目前沒有收款記錄" /> : data.payments.map(p => (
        <div key={p.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '140px 100px 120px minmax(0,1fr) 100px', gap: 12, alignItems: 'center' }}>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>PAY_NO</div><div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', ...S.mono }}>{p.payment_number || '-'}</div></div>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>AMOUNT</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtP(p.amount)}</div></div>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>METHOD</div><div style={{ fontSize: 13 }}>{methodLabel(p.payment_method)}</div></div>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>DATE</div><div style={{ fontSize: 12 }}>{fmtDate(p.payment_date || p.created_at)}</div></div>
            <div>{p.status === 'pending' ? <button onClick={() => handleConfirm(p.id)} style={{ ...S.btnPrimary, padding: '6px 14px', fontSize: 12 }}>確認</button> : <span style={S.tag('green')}>已確認</span>}</div>
          </div>
        </div>
      ))}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search, statusF)} />
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>新增收款記錄</h3>
            {[
              { key: 'order_id', label: '訂單 ID (qb_sales_history)', type: 'text' },
              { key: 'amount', label: '金額', type: 'number' },
              { key: 'payment_date', label: '付款日期', type: 'date' },
              { key: 'bank_last5', label: '帳號末五碼', type: 'text' },
              { key: 'notes', label: '備註', type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={S.label}>{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={S.input} />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>付款方式</label>
              <select value={form.payment_method} onChange={(e) => setForm(prev => ({ ...prev, payment_method: e.target.value }))} style={S.input}>
                <option value="transfer">匯款</option><option value="cash">現金</option><option value="check">支票</option><option value="card">信用卡</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button>
              <button onClick={handleCreate} style={S.btnPrimary}>建立收款</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= SHIPMENTS 出貨管理 ========================================= */
function Shipments() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState({ shipments: [], total: 0, page: 0, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ order_id: '', carrier: '', tracking_no: '', shipping_address: '', remark: '' });

  const load = useCallback(async (page = 0, q = search, st = statusF) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'shipments', page: String(page), search: q, status: st })); } finally { setLoading(false); }
  }, [search, statusF]);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try { await apiPost({ action: 'create_shipment', ...form }); setCreateOpen(false); setForm({ order_id: '', carrier: '', tracking_no: '', shipping_address: '', remark: '' }); load(); } catch (e) { alert(e.message); }
  };

  const handleStatus = async (id, status) => {
    try { await apiPost({ action: 'update_shipment_status', shipment_id: id, status }); load(); } catch (e) { alert(e.message); }
  };

  const sm = data.summary || {};
  const statusLabel = (s) => ({ pending: '待出貨', shipped: '已出貨', delivered: '已送達', cancelled: '已取消' })[s] || s;
  const statusColor = (s) => ({ pending: 'default', shipped: 'green', delivered: 'green', cancelled: 'red' })[s] || 'default';

  return (
    <div>
      <PageLead eyebrow="Shipments" title="出貨管理" description="追蹤訂單出貨進度、物流資訊與到貨狀態。"
        action={<button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 建立出貨</button>} />
      <div style={S.statGrid}>
        <StatCard code="PEND" label="待出貨" value={fmt(sm.pending)} tone="blue" accent="#f59e0b" />
        <StatCard code="SHIP" label="已出貨" value={fmt(sm.shipped)} tone="blue" accent="#3b82f6" />
        <StatCard code="DELV" label="已送達" value={fmt(sm.delivered)} tone="blue" accent="#16a34a" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(0, search, statusF)} placeholder="搜尋出貨單號或物流單號..." style={{ ...S.input, flex: 1 }} />
        <select value={statusF} onChange={(e) => { setStatusF(e.target.value); load(0, search, e.target.value); }} style={{ ...S.input, width: isMobile ? '100%' : 140 }}>
          <option value="">全部狀態</option><option value="pending">待出貨</option><option value="shipped">已出貨</option><option value="delivered">已送達</option>
        </select>
        <button onClick={() => load(0, search, statusF)} style={S.btnPrimary}>搜尋</button>
      </div>
      {loading ? <Loading /> : data.shipments.length === 0 ? <EmptyState text="目前沒有出貨記錄" /> : data.shipments.map(s => (
        <div key={s.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '130px 120px minmax(0,1fr) 130px 120px', gap: 12, alignItems: 'center' }}>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>SHIP_NO</div><div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', ...S.mono }}>{s.shipment_no || '-'}</div></div>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>CARRIER</div><div style={{ fontSize: 13 }}>{s.carrier || '-'}</div></div>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>TRACKING</div><div style={{ fontSize: 13, ...S.mono }}>{s.tracking_no || '-'}</div></div>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>DATE</div><div style={{ fontSize: 12 }}>{fmtDate(s.ship_date || s.created_at)}</div></div>
            <div>
              <span style={S.tag(statusColor(s.status))}>{statusLabel(s.status)}</span>
              {s.status === 'pending' && <button onClick={() => handleStatus(s.id, 'shipped')} style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11, marginLeft: 6 }}>出貨</button>}
              {s.status === 'shipped' && <button onClick={() => handleStatus(s.id, 'delivered')} style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11, marginLeft: 6 }}>送達</button>}
            </div>
          </div>
        </div>
      ))}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search, statusF)} />
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>建立出貨單</h3>
            {[
              { key: 'order_id', label: '訂單 ID (erp_orders)', type: 'text' },
              { key: 'carrier', label: '物流商', type: 'text' },
              { key: 'tracking_no', label: '物流單號', type: 'text' },
              { key: 'shipping_address', label: '送貨地址', type: 'text' },
              { key: 'remark', label: '備註', type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={S.label}>{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={S.input} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button>
              <button onClick={handleCreate} style={S.btnPrimary}>建立出貨</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= RETURNS 退貨管理 ========================================= */
function Returns() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState({ returns: [], total: 0, page: 0, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ customer_id: '', reason: '', remark: '' });
  const [items, setItems] = useState([{ item_number: '', description: '', qty_returned: 1, unit_price: 0, line_total: 0 }]);

  const load = useCallback(async (page = 0, q = search, st = statusF) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'returns', page: String(page), search: q, status: st })); } finally { setLoading(false); }
  }, [search, statusF]);

  useEffect(() => { load(); }, []);

  const updateItem = (idx, key, val) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      if (key === 'qty_returned' || key === 'unit_price') {
        next[idx].line_total = Number(next[idx].qty_returned || 0) * Number(next[idx].unit_price || 0);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    try {
      await apiPost({ action: 'create_return', ...form, items: items.filter(i => i.item_number) });
      setCreateOpen(false); setForm({ customer_id: '', reason: '', remark: '' });
      setItems([{ item_number: '', description: '', qty_returned: 1, unit_price: 0, line_total: 0 }]);
      load();
    } catch (e) { alert(e.message); }
  };

  const handleApprove = async (id) => {
    try { await apiPost({ action: 'approve_return', return_id: id }); load(); } catch (e) { alert(e.message); }
  };

  const sm = data.summary || {};
  const statusLabel = (s) => ({ pending: '待審核', approved: '已核准', rejected: '已拒絕', refunded: '已退款' })[s] || s;
  const statusColor = (s) => ({ pending: 'default', approved: 'green', rejected: 'red', refunded: 'green' })[s] || 'default';

  return (
    <div>
      <PageLead eyebrow="Returns" title="退貨管理" description="管理客戶退貨申請、審核退貨並自動回補庫存。"
        action={<button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 建立退貨</button>} />
      <div style={S.statGrid}>
        <StatCard code="PEND" label="待審核" value={fmt(sm.pending)} tone="blue" accent="#f59e0b" />
        <StatCard code="APVD" label="已核准" value={fmt(sm.approved)} tone="blue" accent="#16a34a" />
        <StatCard code="REFN" label="退款總額" value={fmtP(sm.total_refund)} tone="blue" accent="#ef4444" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(0, search, statusF)} placeholder="搜尋退貨單號或原因..." style={{ ...S.input, flex: 1 }} />
        <select value={statusF} onChange={(e) => { setStatusF(e.target.value); load(0, search, e.target.value); }} style={{ ...S.input, width: isMobile ? '100%' : 140 }}>
          <option value="">全部狀態</option><option value="pending">待審核</option><option value="approved">已核准</option><option value="rejected">已拒絕</option>
        </select>
        <button onClick={() => load(0, search, statusF)} style={S.btnPrimary}>搜尋</button>
      </div>
      {loading ? <Loading /> : data.returns.length === 0 ? <EmptyState text="目前沒有退貨記錄" /> : data.returns.map(r => (
        <div key={r.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '130px 120px minmax(0,1fr) 100px 120px', gap: 12, alignItems: 'center' }}>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>RTN_NO</div><div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', ...S.mono }}>{r.return_no || '-'}</div></div>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>REFUND</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtP(r.refund_amount)}</div></div>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>REASON</div><div style={{ fontSize: 12, color: '#617084' }}>{r.reason || '-'}</div></div>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>DATE</div><div style={{ fontSize: 12 }}>{fmtDate(r.return_date || r.created_at)}</div></div>
            <div>
              <span style={S.tag(statusColor(r.status))}>{statusLabel(r.status)}</span>
              {r.status === 'pending' && <button onClick={() => handleApprove(r.id)} style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11, marginLeft: 6 }}>核准</button>}
            </div>
          </div>
        </div>
      ))}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search, statusF)} />
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 560, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>建立退貨單</h3>
            <div style={{ marginBottom: 12 }}><label style={S.label}>客戶 ID (選填)</label><input value={form.customer_id} onChange={(e) => setForm(p => ({ ...p, customer_id: e.target.value }))} style={S.input} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>退貨原因</label><input value={form.reason} onChange={(e) => setForm(p => ({ ...p, reason: e.target.value }))} style={S.input} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>備註</label><input value={form.remark} onChange={(e) => setForm(p => ({ ...p, remark: e.target.value }))} style={S.input} /></div>
            <div style={{ marginBottom: 8 }}><label style={S.label}>退貨明細</label></div>
            {items.map((it, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px 80px 80px', gap: 6, marginBottom: 6 }}>
                <input value={it.item_number} onChange={(e) => updateItem(idx, 'item_number', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="料號" />
                <input value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="品名" />
                <input type="number" value={it.qty_returned} onChange={(e) => updateItem(idx, 'qty_returned', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="數量" />
                <input type="number" value={it.unit_price} onChange={(e) => updateItem(idx, 'unit_price', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="單價" />
                <div style={{ fontSize: 12, padding: '10px 4px', color: '#617084' }}>{fmtP(it.line_total)}</div>
              </div>
            ))}
            <button onClick={() => setItems(p => [...p, { item_number: '', description: '', qty_returned: 1, unit_price: 0, line_total: 0 }])} style={{ ...S.btnGhost, fontSize: 12, marginBottom: 16 }}>+ 新增品項</button>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button>
              <button onClick={handleCreate} style={S.btnPrimary}>建立退貨</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= INQUIRIES 詢價管理 ========================================= */
function Inquiries() {
  const width = useViewportWidth();
  const isMobile = width < 820;
  const [data, setData] = useState({ inquiries: [], total: 0, page: 0, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ customer_id: '', subject: '', description: '', priority: 'normal' });

  const load = useCallback(async (page = 0, q = search, st = statusF) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'inquiries', page: String(page), search: q, status: st })); } finally { setLoading(false); }
  }, [search, statusF]);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try { await apiPost({ action: 'create_inquiry', ...form }); setCreateOpen(false); setForm({ customer_id: '', subject: '', description: '', priority: 'normal' }); load(); } catch (e) { alert(e.message); }
  };

  const handleStatus = async (id, status) => {
    try { await apiPost({ action: 'update_inquiry_status', inquiry_id: id, status }); load(); } catch (e) { alert(e.message); }
  };

  const sm = data.summary || {};
  const statusLabel = (s) => ({ open: '待處理', quoted: '已報價', closed: '已結案', cancelled: '已取消' })[s] || s;
  const statusColor = (s) => ({ open: 'default', quoted: 'green', closed: 'green', cancelled: 'red' })[s] || 'default';
  const priorityColor = (p) => ({ high: 'red', urgent: 'red', normal: 'default', low: 'green' })[p] || 'default';

  return (
    <div>
      <PageLead eyebrow="Inquiries" title="詢價管理" description="追蹤客戶詢價需求，可轉報價單進入正式交易流程。"
        action={<button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增詢價</button>} />
      <div style={S.statGrid}>
        <StatCard code="OPEN" label="待處理" value={fmt(sm.open)} tone="blue" accent="#f59e0b" />
        <StatCard code="QUOT" label="已報價" value={fmt(sm.quoted)} tone="blue" accent="#3b82f6" />
        <StatCard code="CLSD" label="已結案" value={fmt(sm.closed)} tone="blue" accent="#16a34a" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(0, search, statusF)} placeholder="搜尋詢價單號或主旨..." style={{ ...S.input, flex: 1 }} />
        <select value={statusF} onChange={(e) => { setStatusF(e.target.value); load(0, search, e.target.value); }} style={{ ...S.input, width: isMobile ? '100%' : 140 }}>
          <option value="">全部狀態</option><option value="open">待處理</option><option value="quoted">已報價</option><option value="closed">已結案</option>
        </select>
        <button onClick={() => load(0, search, statusF)} style={S.btnPrimary}>搜尋</button>
      </div>
      {loading ? <Loading /> : data.inquiries.length === 0 ? <EmptyState text="目前沒有詢價記錄" /> : data.inquiries.map(inq => (
        <div key={inq.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '130px minmax(0,1fr) 80px 100px 140px', gap: 12, alignItems: 'center' }}>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>INQ_NO</div><div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', ...S.mono }}>{inq.inquiry_no || '-'}</div></div>
            <div><div style={{ fontSize: 14, fontWeight: 600, color: '#1c2740' }}>{inq.subject || '-'}</div><div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>{(inq.description || '').slice(0, 80)}{(inq.description || '').length > 80 ? '...' : ''}</div></div>
            <div><span style={S.tag(priorityColor(inq.priority))}>{inq.priority || 'normal'}</span></div>
            <div><div style={{ fontSize: 12 }}>{fmtDate(inq.inquiry_date || inq.created_at)}</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={S.tag(statusColor(inq.status))}>{statusLabel(inq.status)}</span>
              {inq.status === 'open' && <button onClick={() => handleStatus(inq.id, 'quoted')} style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11 }}>已報價</button>}
              {inq.status === 'quoted' && <button onClick={() => handleStatus(inq.id, 'closed')} style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11 }}>結案</button>}
            </div>
          </div>
        </div>
      ))}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search, statusF)} />
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>新增詢價</h3>
            <div style={{ marginBottom: 12 }}><label style={S.label}>客戶 ID (選填)</label><input value={form.customer_id} onChange={(e) => setForm(p => ({ ...p, customer_id: e.target.value }))} style={S.input} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>主旨 *</label><input value={form.subject} onChange={(e) => setForm(p => ({ ...p, subject: e.target.value }))} style={S.input} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>說明</label><textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} style={{ ...S.input, minHeight: 80 }} /></div>
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>優先度</label>
              <select value={form.priority} onChange={(e) => setForm(p => ({ ...p, priority: e.target.value }))} style={S.input}>
                <option value="low">低</option><option value="normal">一般</option><option value="high">高</option><option value="urgent">緊急</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button>
              <button onClick={handleCreate} style={S.btnPrimary}>建立詢價</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= PURCHASE ORDERS 採購單 ========================================= */
function PurchaseOrders() {
  const width = useViewportWidth(); const isMobile = width < 820;
  const [data, setData] = useState({ rows: [], total: 0, page: 0, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true); const [search, setSearch] = useState(''); const [statusF, setStatusF] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedPo, setExpandedPo] = useState(null);
  const [poItems, setPoItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [emailDialog, setEmailDialog] = useState(null); // { po, vendor_email }
  const [emailTo, setEmailTo] = useState('');
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ vendor_id: '', expected_date: '', remark: '' });
  const [items, setItems] = useState([{ item_number: '', description: '', qty: 1, unit_cost: 0, line_total: 0 }]);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (page = 0, q = search, st = statusF) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'purchase_orders', page: String(page), search: q, status: st })); } finally { setLoading(false); }
  }, [search, statusF]);
  useEffect(() => { load(); }, []);

  const updateItem = (idx, key, val) => setItems(prev => { const next = [...prev]; next[idx] = { ...next[idx], [key]: val }; if (key === 'qty' || key === 'unit_cost') next[idx].line_total = Number(next[idx].qty || 0) * Number(next[idx].unit_cost || 0); return next; });

  const handleCreate = async () => { try { await apiPost({ action: 'create_purchase_order', ...form, items: items.filter(i => i.item_number) }); setCreateOpen(false); setForm({ vendor_id: '', expected_date: '', remark: '' }); setItems([{ item_number: '', description: '', qty: 1, unit_cost: 0, line_total: 0 }]); load(); } catch (e) { alert(e.message); } };
  const handleConfirm = async (id) => { try { await apiPost({ action: 'confirm_purchase_order', po_id: id }); load(); } catch (e) { alert(e.message); } };

  const toggleExpand = async (poId) => {
    if (expandedPo === poId) { setExpandedPo(null); return; }
    setExpandedPo(poId);
    setLoadingItems(true);
    try {
      const res = await apiGet({ action: 'po_items', po_id: poId });
      setPoItems(res.items || []);
    } catch { setPoItems([]); }
    finally { setLoadingItems(false); }
  };

  const sm = data.summary || {};
  const statusLabel = (s) => ({ draft: '草稿', sent: '已寄出', confirmed: '已確認', shipped: '已出貨', received: '已到貨', rejected: '退回', cancelled: '已取消' })[s] || s;
  const statusColor = (s) => ({ draft: 'default', sent: 'blue', confirmed: 'green', shipped: 'blue', received: 'green', rejected: 'red', cancelled: 'red' })[s] || 'default';

  const handleSendEmail = async (po) => {
    // Get vendor email if available
    let vendorEmail = '';
    if (po.vendor_id) {
      try {
        const res = await apiGet({ action: 'vendors', search: '', limit: '1', id: String(po.vendor_id) });
        vendorEmail = res?.rows?.[0]?.email || '';
      } catch {}
    }
    setEmailTo(vendorEmail);
    setEmailDialog(po);
  };

  const confirmSendEmail = async () => {
    if (!emailTo.trim()) { setMsg('請輸入收件人 email'); return; }
    setSending(true); setMsg('');
    try {
      const res = await fetch('/api/po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_po_email', po_id: emailDialog.id, to_email: emailTo.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMsg(data.message || '已寄出');
      setEmailDialog(null);
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setSending(false); }
  };

  const handleExport = async (poId) => {
    try {
      const res = await fetch('/api/po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export_po', po_id: poId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Download Excel
      const link = document.createElement('a');
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${data.excel_base64}`;
      link.download = data.filename;
      link.click();
      setMsg('Excel 已下載');
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div>
      <PageLead eyebrow="Purchase Orders" title="採購單" description="建立對廠商的採購訂單，確認後可轉進貨單入庫。"
        action={<button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增採購單</button>} />
      {msg && <div style={{ ...S.card, background: msg.includes('失敗') || msg.includes('錯誤') ? '#fef2f2' : '#edfdf3', borderColor: msg.includes('失敗') || msg.includes('錯誤') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') || msg.includes('錯誤') ? '#dc2626' : '#15803d', marginBottom: 14, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}
      <div style={S.statGrid}>
        <StatCard code="DFT" label="草稿" value={fmt(sm.draft)} tone="blue" />
        <StatCard code="SENT" label="已寄出" value={fmt(sm.sent)} tone="blue" accent="#6366f1" />
        <StatCard code="CNF" label="已確認" value={fmt(sm.confirmed)} tone="blue" accent="#3b82f6" />
        <StatCard code="SHIP" label="已出貨" value={fmt(sm.shipped)} tone="blue" accent="#f59e0b" />
        <StatCard code="RCV" label="已到貨" value={fmt(sm.received)} tone="blue" accent="#16a34a" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(0, search, statusF)} placeholder="搜尋採購單號..." style={{ ...S.input, flex: 1 }} />
        <select value={statusF} onChange={(e) => { setStatusF(e.target.value); load(0, search, e.target.value); }} style={{ ...S.input, width: isMobile ? '100%' : 140 }}><option value="">全部</option><option value="draft">草稿</option><option value="sent">已寄出</option><option value="confirmed">已確認</option><option value="shipped">已出貨</option><option value="received">已到貨</option><option value="rejected">退回</option></select>
        <button onClick={() => load(0, search, statusF)} style={S.btnPrimary}>搜尋</button>
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有採購單" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '130px 100px 100px 120px minmax(0,1fr) 140px auto', gap: 12, alignItems: 'center', cursor: 'pointer' }} onClick={() => toggleExpand(r.id)}>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>PO_NO</div><div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', ...S.mono }}>{r.po_no || '-'}</div></div>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>DATE</div><div style={{ fontSize: 12 }}>{fmtDate(r.po_date)}</div></div>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>AMOUNT</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtP(r.total_amount)}</div></div>
            <div><span style={S.tag(statusColor(r.status))}>{statusLabel(r.status)}</span></div>
            <div style={{ fontSize: 12, color: '#617084' }}>{r.remark || '-'}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => handleExport(r.id)} style={{ ...S.btnGhost, padding: '5px 10px', fontSize: 11 }}>匯出</button>
              {(r.status === 'draft' || r.status === 'confirmed') && <button onClick={() => handleSendEmail(r)} style={{ ...S.btnPrimary, padding: '5px 10px', fontSize: 11, background: '#6366f1' }}>寄給原廠</button>}
              {r.status === 'draft' && <button onClick={() => handleConfirm(r.id)} style={{ ...S.btnGhost, padding: '5px 10px', fontSize: 11 }}>確認</button>}
              {(r.status === 'confirmed' || r.status === 'shipped') && <button onClick={() => { setForm({ vendor_id: r.vendor_id || '', expected_date: '', remark: `採購單 ${r.po_no} 進貨` }); }} style={{ ...S.btnGhost, padding: '5px 10px', fontSize: 11 }}>轉進貨</button>}
            </div>
            <span style={{ fontSize: 16, color: '#9ca3af', transition: 'transform 0.2s', transform: expandedPo === r.id ? 'rotate(180deg)' : 'rotate(0)' }}>{'\u25B2'}</span>
          </div>
          {expandedPo === r.id && (
            <div style={{ marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1c2740', marginBottom: 10 }}>採購明細</div>
              {loadingItems ? <div style={{ fontSize: 12, color: '#9ca3af' }}>載入中...</div> : poItems.length === 0 ? <div style={{ fontSize: 12, color: '#9ca3af' }}>沒有明細項目</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px', color: '#7b889b', fontWeight: 600 }}>料號</th>
                    <th style={{ padding: '8px 10px', color: '#7b889b', fontWeight: 600 }}>品名</th>
                    <th style={{ padding: '8px 10px', color: '#7b889b', fontWeight: 600, textAlign: 'right' }}>單價</th>
                    <th style={{ padding: '8px 10px', color: '#7b889b', fontWeight: 600, textAlign: 'center' }}>數量</th>
                    <th style={{ padding: '8px 10px', color: '#7b889b', fontWeight: 600, textAlign: 'right' }}>小計</th>
                  </tr></thead>
                  <tbody>{poItems.map((item, i) => (
                    <tr key={item.id || i} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1976f3', ...S.mono }}>{item.item_number || '-'}</td>
                      <td style={{ padding: '8px 10px', color: '#374151' }}>{item.description || '-'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', ...S.mono }}>{fmtP(item.unit_cost)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>{item.qty}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#059669', ...S.mono }}>{fmtP(item.line_total)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          )}
        </div>
      ))}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search, statusF)} />
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 560, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>新增採購單</h3>
            <div style={{ marginBottom: 12 }}><label style={S.label}>廠商 ID (erp_vendors)</label><input value={form.vendor_id} onChange={(e) => setForm(p => ({ ...p, vendor_id: e.target.value }))} style={S.input} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>預計到貨日</label><input type="date" value={form.expected_date} onChange={(e) => setForm(p => ({ ...p, expected_date: e.target.value }))} style={S.input} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>備註</label><input value={form.remark} onChange={(e) => setForm(p => ({ ...p, remark: e.target.value }))} style={S.input} /></div>
            <div style={{ marginBottom: 8 }}><label style={S.label}>採購明細</label></div>
            {items.map((it, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px 80px 80px', gap: 6, marginBottom: 6 }}>
                <input value={it.item_number} onChange={(e) => updateItem(idx, 'item_number', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="料號" />
                <input value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="品名" />
                <input type="number" value={it.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="數量" />
                <input type="number" value={it.unit_cost} onChange={(e) => updateItem(idx, 'unit_cost', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="單價" />
                <div style={{ fontSize: 12, padding: '10px 4px', color: '#617084' }}>{fmtP(it.line_total)}</div>
              </div>
            ))}
            <button onClick={() => setItems(p => [...p, { item_number: '', description: '', qty: 1, unit_cost: 0, line_total: 0 }])} style={{ ...S.btnGhost, fontSize: 12, marginBottom: 16 }}>+ 新增品項</button>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button><button onClick={handleCreate} style={S.btnPrimary}>建立採購單</button></div>
          </div>
        </div>
      )}
      {emailDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>寄送採購單給原廠</h3>
            <p style={{ fontSize: 13, color: '#617084', margin: '0 0 16px' }}>採購單 <b>{emailDialog.po_no}</b> 將以 Excel 附件寄出，原廠可透過信件中的按鈕直接回覆接單/出貨。</p>
            <div style={{ marginBottom: 12 }}><label style={S.label}>收件人 Email *</label><input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} style={S.input} placeholder="supplier@example.com" type="email" /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEmailDialog(null)} style={S.btnGhost}>取消</button>
              <button onClick={confirmSendEmail} disabled={sending} style={{ ...S.btnPrimary, opacity: sending ? 0.7 : 1, background: '#6366f1' }}>{sending ? '寄送中...' : '寄出'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= STOCK IN 進貨單 ========================================= */
function StockIn() {
  const width = useViewportWidth(); const isMobile = width < 820;
  const [data, setData] = useState({ rows: [], total: 0, page: 0, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true); const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ vendor_id: '', po_id: '', remark: '' });
  const [items, setItems] = useState([{ item_number: '', description: '', qty_received: 1, unit_cost: 0, line_total: 0 }]);

  const load = useCallback(async (page = 0, q = search) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'stock_ins', page: String(page), search: q })); } finally { setLoading(false); }
  }, [search]);
  useEffect(() => { load(); }, []);

  const updateItem = (idx, key, val) => setItems(prev => { const next = [...prev]; next[idx] = { ...next[idx], [key]: val }; if (key === 'qty_received' || key === 'unit_cost') next[idx].line_total = Number(next[idx].qty_received || 0) * Number(next[idx].unit_cost || 0); return next; });

  const handleCreate = async () => { try { await apiPost({ action: 'create_stock_in', ...form, items: items.filter(i => i.item_number) }); setCreateOpen(false); setForm({ vendor_id: '', po_id: '', remark: '' }); setItems([{ item_number: '', description: '', qty_received: 1, unit_cost: 0, line_total: 0 }]); load(); } catch (e) { alert(e.message); } };
  const handleConfirm = async (id) => { if (!confirm('確認進貨將自動增加庫存，確定？')) return; try { await apiPost({ action: 'confirm_stock_in', stock_in_id: id }); load(); } catch (e) { alert(e.message); } };

  const sm = data.summary || {};
  return (
    <div>
      <PageLead eyebrow="Stock In" title="進貨單" description="記錄廠商進貨入庫，確認後自動增加商品庫存數量。"
        action={<button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增進貨</button>} />
      <div style={S.statGrid}>
        <StatCard code="PEND" label="待確認" value={fmt(sm.pending)} tone="blue" accent="#f59e0b" />
        <StatCard code="CONF" label="已入庫" value={fmt(sm.confirmed)} tone="blue" accent="#16a34a" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(0, search)} placeholder="搜尋進貨單號..." style={{ ...S.input, flex: 1 }} />
        <button onClick={() => load(0, search)} style={S.btnPrimary}>搜尋</button>
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有進貨單" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '130px 100px 120px 100px minmax(0,1fr) 100px', gap: 12, alignItems: 'center' }}>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>SI_NO</div><div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', ...S.mono }}>{r.stock_in_no || '-'}</div></div>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>DATE</div><div style={{ fontSize: 12 }}>{fmtDate(r.stock_in_date)}</div></div>
            <div><div style={{ fontSize: 11, color: '#7b889b', ...S.mono }}>AMOUNT</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtP(r.total_amount)}</div></div>
            <div><span style={S.tag(r.status === 'confirmed' ? 'green' : 'default')}>{r.status === 'confirmed' ? '已入庫' : '待確認'}</span></div>
            <div style={{ fontSize: 12, color: '#617084' }}>{r.remark || '-'}</div>
            <div>{r.status === 'pending' && <button onClick={() => handleConfirm(r.id)} style={{ ...S.btnPrimary, padding: '6px 14px', fontSize: 12 }}>確認入庫</button>}</div>
          </div>
        </div>
      ))}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search)} />
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 560, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>新增進貨單</h3>
            <div style={{ marginBottom: 12 }}><label style={S.label}>廠商 ID</label><input value={form.vendor_id} onChange={(e) => setForm(p => ({ ...p, vendor_id: e.target.value }))} style={S.input} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>採購單 ID (選填)</label><input value={form.po_id} onChange={(e) => setForm(p => ({ ...p, po_id: e.target.value }))} style={S.input} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>備註</label><input value={form.remark} onChange={(e) => setForm(p => ({ ...p, remark: e.target.value }))} style={S.input} /></div>
            <div style={{ marginBottom: 8 }}><label style={S.label}>進貨明細</label></div>
            {items.map((it, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px 80px 80px', gap: 6, marginBottom: 6 }}>
                <input value={it.item_number} onChange={(e) => updateItem(idx, 'item_number', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="料號" />
                <input value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="品名" />
                <input type="number" value={it.qty_received} onChange={(e) => updateItem(idx, 'qty_received', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="數量" />
                <input type="number" value={it.unit_cost} onChange={(e) => updateItem(idx, 'unit_cost', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="成本" />
                <div style={{ fontSize: 12, padding: '10px 4px', color: '#617084' }}>{fmtP(it.line_total)}</div>
              </div>
            ))}
            <button onClick={() => setItems(p => [...p, { item_number: '', description: '', qty_received: 1, unit_cost: 0, line_total: 0 }])} style={{ ...S.btnGhost, fontSize: 12, marginBottom: 16 }}>+ 新增品項</button>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button><button onClick={handleCreate} style={S.btnPrimary}>建立進貨</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= PURCHASE RETURNS 進貨退出 ========================================= */
function PurchaseReturns() {
  const width = useViewportWidth(); const isMobile = width < 820;
  const [data, setData] = useState({ rows: [], total: 0, page: 0, limit: 30 });
  const [loading, setLoading] = useState(true); const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ vendor_id: '', reason: '', remark: '' });
  const [items, setItems] = useState([{ item_number: '', description: '', qty_returned: 1, unit_cost: 0, line_total: 0 }]);

  const load = useCallback(async (page = 0, q = search) => { setLoading(true); try { setData(await apiGet({ action: 'purchase_returns', page: String(page), search: q })); } finally { setLoading(false); } }, [search]);
  useEffect(() => { load(); }, []);
  const updateItem = (idx, key, val) => setItems(prev => { const next = [...prev]; next[idx] = { ...next[idx], [key]: val }; if (key === 'qty_returned' || key === 'unit_cost') next[idx].line_total = Number(next[idx].qty_returned || 0) * Number(next[idx].unit_cost || 0); return next; });
  const handleCreate = async () => { try { await apiPost({ action: 'create_purchase_return', ...form, items: items.filter(i => i.item_number) }); setCreateOpen(false); load(); } catch (e) { alert(e.message); } };

  return (
    <div>
      <PageLead eyebrow="Purchase Returns" title="進貨退出" description="將已進貨商品退回廠商，自動扣減庫存。"
        action={<button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 建立退出</button>} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(0, search)} placeholder="搜尋退出單號..." style={{ ...S.input, flex: 1 }} />
        <button onClick={() => load(0, search)} style={S.btnPrimary}>搜尋</button>
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有進貨退出單" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '130px 100px 120px minmax(0,1fr)', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', ...S.mono }}>{r.return_no || '-'}</div>
            <div style={{ fontSize: 12 }}>{fmtDate(r.return_date)}</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtP(r.total_amount)}</div>
            <div style={{ fontSize: 12, color: '#617084' }}>{r.reason || '-'}</div>
          </div>
        </div>
      ))}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search)} />
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 560, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>建立進貨退出</h3>
            <div style={{ marginBottom: 12 }}><label style={S.label}>廠商 ID</label><input value={form.vendor_id} onChange={(e) => setForm(p => ({ ...p, vendor_id: e.target.value }))} style={S.input} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>退貨原因</label><input value={form.reason} onChange={(e) => setForm(p => ({ ...p, reason: e.target.value }))} style={S.input} /></div>
            <div style={{ marginBottom: 8 }}><label style={S.label}>退出明細</label></div>
            {items.map((it, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px 80px 80px', gap: 6, marginBottom: 6 }}>
                <input value={it.item_number} onChange={(e) => updateItem(idx, 'item_number', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="料號" />
                <input value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="品名" />
                <input type="number" value={it.qty_returned} onChange={(e) => updateItem(idx, 'qty_returned', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="數量" />
                <input type="number" value={it.unit_cost} onChange={(e) => updateItem(idx, 'unit_cost', e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="成本" />
                <div style={{ fontSize: 12, padding: '10px 4px', color: '#617084' }}>{fmtP(it.line_total)}</div>
              </div>
            ))}
            <button onClick={() => setItems(p => [...p, { item_number: '', description: '', qty_returned: 1, unit_cost: 0, line_total: 0 }])} style={{ ...S.btnGhost, fontSize: 12, marginBottom: 16 }}>+ 新增品項</button>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button><button onClick={handleCreate} style={S.btnPrimary}>建立退出</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= VENDOR PAYMENTS 付款單 ========================================= */
function VendorPayments() {
  const width = useViewportWidth(); const isMobile = width < 820;
  const [data, setData] = useState({ rows: [], total: 0, page: 0, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true); const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ vendor_id: '', amount: '', payment_method: 'transfer', payment_date: '', bank_info: '', remark: '' });

  const load = useCallback(async (page = 0, q = search) => { setLoading(true); try { setData(await apiGet({ action: 'vendor_payments', page: String(page), search: q })); } finally { setLoading(false); } }, [search]);
  useEffect(() => { load(); }, []);
  const handleCreate = async () => { try { await apiPost({ action: 'create_vendor_payment', ...form }); setCreateOpen(false); setForm({ vendor_id: '', amount: '', payment_method: 'transfer', payment_date: '', bank_info: '', remark: '' }); load(); } catch (e) { alert(e.message); } };
  const handleConfirm = async (id) => { try { await apiPost({ action: 'confirm_vendor_payment', payment_id: id }); load(); } catch (e) { alert(e.message); } };

  const sm = data.summary || {};
  return (
    <div>
      <PageLead eyebrow="Vendor Payments" title="付款單" description="管理對廠商的付款記錄，追蹤應付帳款。"
        action={<button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增付款</button>} />
      <div style={S.statGrid}>
        <StatCard code="PEND" label="待確認" value={fmt(sm.pending)} tone="blue" accent="#f59e0b" />
        <StatCard code="CONF" label="已付款" value={fmt(sm.confirmed)} tone="blue" accent="#16a34a" />
        <StatCard code="AMT" label="已付總額" value={fmtP(sm.total_paid)} tone="blue" />
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有付款記錄" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '130px 100px 120px 100px minmax(0,1fr) 100px', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', ...S.mono }}>{r.payment_no || '-'}</div>
            <div style={{ fontSize: 12 }}>{fmtDate(r.payment_date)}</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtP(r.amount)}</div>
            <div><span style={S.tag(r.status === 'confirmed' ? 'green' : 'default')}>{r.status === 'confirmed' ? '已付款' : '待確認'}</span></div>
            <div style={{ fontSize: 12, color: '#617084' }}>{r.remark || '-'}</div>
            <div>{r.status === 'pending' && <button onClick={() => handleConfirm(r.id)} style={{ ...S.btnPrimary, padding: '6px 14px', fontSize: 12 }}>確認</button>}</div>
          </div>
        </div>
      ))}
      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search)} />
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>新增付款單</h3>
            {[{ key: 'vendor_id', label: '廠商 ID', type: 'text' }, { key: 'amount', label: '金額', type: 'number' }, { key: 'payment_date', label: '付款日期', type: 'date' }, { key: 'bank_info', label: '銀行/帳號資訊', type: 'text' }, { key: 'remark', label: '備註', type: 'text' }].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}><label style={S.label}>{f.label}</label><input type={f.type} value={form[f.key]} onChange={(e) => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={S.input} /></div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button><button onClick={handleCreate} style={S.btnPrimary}>建立付款</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= STOCKTAKE 盤點 ========================================= */
function Stocktake() {
  const [data, setData] = useState({ rows: [], total: 0, page: 0, limit: 30 });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailItems, setDetailItems] = useState([]);

  const load = useCallback(async (page = 0) => { setLoading(true); try { setData(await apiGet({ action: 'stocktakes', page: String(page) })); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, []);

  const handleCreate = async () => { try { const r = await apiPost({ action: 'create_stocktake', remark: '' }); load(); if (r.stocktake?.id) openDetail(r.stocktake.id); } catch (e) { alert(e.message); } };
  const openDetail = async (id) => { const r = await apiGet({ action: 'stocktake_detail', id }); setDetail(r.stocktake); setDetailItems(r.items || []); };
  const updateActual = async (itemId, val) => { await apiPost({ action: 'update_stocktake_item', item_id: itemId, actual_qty: val }); setDetailItems(prev => prev.map(i => i.id === itemId ? { ...i, actual_qty: Number(val), diff_qty: Number(val) - i.system_qty } : i)); };
  const handleComplete = async () => { if (!detail?.id) return; if (!confirm('確認盤點將自動調整庫存，確定？')) return; try { await apiPost({ action: 'complete_stocktake', stocktake_id: detail.id }); setDetail(null); load(); } catch (e) { alert(e.message); } };

  return (
    <div>
      <PageLead eyebrow="Stocktake" title="盤點精靈" description="建立盤點單自動載入商品系統庫存，輸入實際數量後確認即可調整差異。"
        action={<button onClick={handleCreate} style={S.btnPrimary}>+ 新增盤點</button>} />
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有盤點記錄" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10, cursor: 'pointer' }} onClick={() => r.status !== 'completed' && openDetail(r.id)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><span style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', ...S.mono }}>{r.stocktake_no}</span><span style={{ marginLeft: 12, fontSize: 12, color: '#617084' }}>{fmtDate(r.stocktake_date)}</span></div>
            <span style={S.tag(r.status === 'completed' ? 'green' : 'default')}>{r.status === 'completed' ? '已完成' : r.status === 'counting' ? '盤點中' : '草稿'}</span>
          </div>
        </div>
      ))}
      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 700, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>盤點 {detail.stocktake_no}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {detail.status !== 'completed' && <button onClick={handleComplete} style={S.btnPrimary}>確認盤點</button>}
                <button onClick={() => setDetail(null)} style={S.btnGhost}>關閉</button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#617084', marginBottom: 12 }}>共 {detailItems.length} 品項，差異 {detailItems.filter(i => i.diff_qty !== 0).length} 項</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                <thead><tr style={{ background: '#f1f5fa' }}>{['料號','品名','系統數量','實際數量','差異'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#6b7a8d', fontWeight: 700, borderBottom: '1px solid #dbe3ee' }}>{h}</th>)}</tr></thead>
                <tbody>{detailItems.map(it => (
                  <tr key={it.id} style={{ borderBottom: '1px solid #edf0f5', background: it.diff_qty !== 0 ? '#fff8eb' : 'transparent' }}>
                    <td style={{ padding: '8px 10px', ...S.mono, color: '#1976f3' }}>{it.item_number}</td>
                    <td style={{ padding: '8px 10px' }}>{it.description || '-'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{it.system_qty}</td>
                    <td style={{ padding: '8px 10px' }}>{detail.status !== 'completed' ? <input type="number" defaultValue={it.actual_qty} onBlur={(e) => updateActual(it.id, e.target.value)} style={{ ...S.input, width: 70, padding: '4px 8px', fontSize: 12, textAlign: 'right' }} /> : it.actual_qty}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: it.diff_qty > 0 ? '#16a34a' : it.diff_qty < 0 ? '#ef4444' : '#617084' }}>{it.diff_qty > 0 ? '+' : ''}{it.diff_qty}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= STOCK ADJUSTMENTS 調整單 ========================================= */
function StockAdjustments() {
  const width = useViewportWidth(); const isMobile = width < 820;
  const [data, setData] = useState({ rows: [], total: 0, page: 0, limit: 30 });
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ reason: '', remark: '' });
  const [items, setItems] = useState([{ item_number: '', description: '', adjust_qty: 0 }]);

  const load = useCallback(async (page = 0) => { setLoading(true); try { setData(await apiGet({ action: 'stock_adjustments', page: String(page) })); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, []);
  const handleCreate = async () => { try { await apiPost({ action: 'create_stock_adjustment', ...form, items: items.filter(i => i.item_number) }); setCreateOpen(false); setForm({ reason: '', remark: '' }); setItems([{ item_number: '', description: '', adjust_qty: 0 }]); load(); } catch (e) { alert(e.message); } };

  return (
    <div>
      <PageLead eyebrow="Adjustments" title="調整單" description="手動調整商品庫存數量（正數增加、負數減少），記錄調整原因。"
        action={<button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增調整</button>} />
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有調整記錄" /> : data.rows.map(r => (
        <div key={r.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><span style={{ fontSize: 13, fontWeight: 700, color: '#1976f3', ...S.mono }}>{r.adjustment_no}</span><span style={{ marginLeft: 12, fontSize: 12, color: '#617084' }}>{fmtDate(r.adjustment_date)}</span></div>
            <div style={{ fontSize: 12, color: '#617084' }}>{r.reason || '-'}</div>
          </div>
        </div>
      ))}
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 500, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>新增調整單</h3>
            <div style={{ marginBottom: 12 }}><label style={S.label}>調整原因</label><input value={form.reason} onChange={(e) => setForm(p => ({ ...p, reason: e.target.value }))} style={S.input} /></div>
            <div style={{ marginBottom: 8 }}><label style={S.label}>調整明細 (正數=增加, 負數=減少)</label></div>
            {items.map((it, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 6, marginBottom: 6 }}>
                <input value={it.item_number} onChange={(e) => setItems(p => { const n = [...p]; n[idx] = { ...n[idx], item_number: e.target.value }; return n; })} style={{ ...S.input, fontSize: 12 }} placeholder="料號" />
                <input value={it.description} onChange={(e) => setItems(p => { const n = [...p]; n[idx] = { ...n[idx], description: e.target.value }; return n; })} style={{ ...S.input, fontSize: 12 }} placeholder="品名" />
                <input type="number" value={it.adjust_qty} onChange={(e) => setItems(p => { const n = [...p]; n[idx] = { ...n[idx], adjust_qty: e.target.value }; return n; })} style={{ ...S.input, fontSize: 12 }} placeholder="±數量" />
              </div>
            ))}
            <button onClick={() => setItems(p => [...p, { item_number: '', description: '', adjust_qty: 0 }])} style={{ ...S.btnGhost, fontSize: 12, marginBottom: 16 }}>+ 新增品項</button>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button><button onClick={handleCreate} style={S.btnPrimary}>確認調整</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= PSI REPORT 進銷存報表 ========================================= */
function PSIReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async (df = dateFrom, dt = dateTo) => { setLoading(true); try { setData(await apiGet({ action: 'psi_report', date_from: df, date_to: dt })); } finally { setLoading(false); } }, [dateFrom, dateTo]);
  useEffect(() => { load(); }, []);

  const d = data || {};
  return (
    <div>
      <PageLead eyebrow="PSI Report" title="進銷存報表" description="銷貨、進貨、退貨金額彙總，掌握進銷存整體狀況。" />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...S.input, width: 160 }} />
        <span style={{ color: '#7b889b' }}>~</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...S.input, width: 160 }} />
        <button onClick={() => load(dateFrom, dateTo)} style={S.btnPrimary}>查詢</button>
        <button onClick={() => { setDateFrom(''); setDateTo(''); load('', ''); }} style={S.btnGhost}>全部</button>
      </div>
      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div style={{ ...S.card }}><div style={{ fontSize: 11, color: '#7b889b', marginBottom: 8, fontWeight: 700 }}>銷貨</div><div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{fmtP(d.sales_total)}</div><div style={{ fontSize: 12, color: '#617084', marginTop: 8 }}>成本 {fmtP(d.sales_cost)} | 毛利 {fmtP(d.sales_profit)}</div></div>
          <div style={{ ...S.card }}><div style={{ fontSize: 11, color: '#7b889b', marginBottom: 8, fontWeight: 700 }}>進貨</div><div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>{fmtP(d.purchase_total)}</div></div>
          <div style={{ ...S.card }}><div style={{ fontSize: 11, color: '#7b889b', marginBottom: 8, fontWeight: 700 }}>銷貨退回</div><div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{fmtP(d.sales_return_total)}</div></div>
          <div style={{ ...S.card }}><div style={{ fontSize: 11, color: '#7b889b', marginBottom: 8, fontWeight: 700 }}>進貨退出</div><div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{fmtP(d.purchase_return_total)}</div></div>
          <div style={{ ...S.card, gridColumn: '1 / -1', background: '#f0f7ff', borderColor: '#b8d4f5' }}><div style={{ fontSize: 11, color: '#7b889b', marginBottom: 8, fontWeight: 700 }}>淨銷貨 (銷貨 - 銷退)</div><div style={{ fontSize: 26, fontWeight: 700, color: '#1976f3' }}>{fmtP((d.sales_total || 0) - (d.sales_return_total || 0))}</div><div style={{ fontSize: 13, color: '#617084', marginTop: 6 }}>淨進貨 (進貨 - 進退) {fmtP((d.purchase_total || 0) - (d.purchase_return_total || 0))}</div></div>
        </div>
      )}
    </div>
  );
}

/* ========================================= FINANCIAL REPORT 財務報表 ========================================= */
function FinancialReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async (df = dateFrom, dt = dateTo) => { setLoading(true); try { setData(await apiGet({ action: 'financial_report', date_from: df, date_to: dt })); } finally { setLoading(false); } }, [dateFrom, dateTo]);
  useEffect(() => { load(); }, []);

  const d = data || {};
  return (
    <div>
      <PageLead eyebrow="Financial Report" title="財務報表" description="應收帳款、應付帳款與淨現金流概覽。" />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...S.input, width: 160 }} />
        <span style={{ color: '#7b889b' }}>~</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...S.input, width: 160 }} />
        <button onClick={() => load(dateFrom, dateTo)} style={S.btnPrimary}>查詢</button>
        <button onClick={() => { setDateFrom(''); setDateTo(''); load('', ''); }} style={S.btnGhost}>全部</button>
      </div>
      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div style={{ ...S.card }}><div style={{ fontSize: 11, color: '#16a34a', marginBottom: 8, fontWeight: 700 }}>銷貨收入</div><div style={{ fontSize: 22, fontWeight: 700 }}>{fmtP(d.revenue)}</div><div style={{ fontSize: 12, color: '#617084', marginTop: 8 }}>已收 {fmtP(d.received)}</div></div>
          <div style={{ ...S.card, background: d.receivable > 0 ? '#fff8eb' : '#f0fff4' }}><div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8, fontWeight: 700 }}>應收帳款</div><div style={{ fontSize: 22, fontWeight: 700, color: d.receivable > 0 ? '#f59e0b' : '#16a34a' }}>{fmtP(d.receivable)}</div></div>
          <div style={{ ...S.card }}><div style={{ fontSize: 11, color: '#3b82f6', marginBottom: 8, fontWeight: 700 }}>進貨支出</div><div style={{ fontSize: 22, fontWeight: 700 }}>{fmtP(d.purchase)}</div><div style={{ fontSize: 12, color: '#617084', marginTop: 8 }}>已付 {fmtP(d.paid)}</div></div>
          <div style={{ ...S.card, background: d.payable > 0 ? '#fff0f0' : '#f0fff4' }}><div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8, fontWeight: 700 }}>應付帳款</div><div style={{ fontSize: 22, fontWeight: 700, color: d.payable > 0 ? '#ef4444' : '#16a34a' }}>{fmtP(d.payable)}</div></div>
          <div style={{ ...S.card, gridColumn: '1 / -1', background: d.net_cash >= 0 ? '#f0f7ff' : '#fff0f0', borderColor: d.net_cash >= 0 ? '#b8d4f5' : '#f5b8b8' }}><div style={{ fontSize: 11, color: '#7b889b', marginBottom: 8, fontWeight: 700 }}>淨現金流 (已收 - 已付)</div><div style={{ fontSize: 28, fontWeight: 700, color: d.net_cash >= 0 ? '#1976f3' : '#ef4444' }}>{fmtP(d.net_cash)}</div></div>
        </div>
      )}
    </div>
  );
}

/* ========================================= DEALER MANAGEMENT ========================================= */
function DealerUsers() {
  const ROLE_MAP = { dealer: '經銷商', sales: '業務', technician: '維修技師' };
  const ROLE_TONE = { dealer: 'blue', sales: '', technician: 'green' };
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', display_name: '', role: 'dealer', company_name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [permSaving, setPermSaving] = useState(null);

  const load = async () => { setLoading(true); try { setData(await apiGet({ action: 'dealer_users' })); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const createUser = async () => {
    setSaving(true); setMsg('');
    try {
      await apiPost({ action: 'create_dealer_user', ...form });
      setMsg('帳號建立成功');
      setShowCreate(false);
      setForm({ username: '', password: '', display_name: '', role: 'dealer', company_name: '', phone: '', email: '' });
      await load();
    } catch (e) { setMsg(e.message); } finally { setSaving(false); }
  };

  const toggleStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    await apiPost({ action: 'update_dealer_user', user_id: user.id, status: newStatus });
    await load();
  };

  const resetPw = async (user) => {
    const pw = prompt(`重設 ${user.display_name} 的密碼為：`, '1234');
    if (!pw) return;
    await apiPost({ action: 'update_dealer_user', user_id: user.id, new_password: pw });
    alert('密碼已重設');
  };

  const togglePerm = async (user, field) => {
    setPermSaving(user.id + field);
    try {
      await apiPost({ action: 'update_dealer_user', user_id: user.id, [field]: !user[field] });
      await load();
    } finally { setPermSaving(null); }
  };

  const changeRole = async (user, newRole) => {
    await apiPost({ action: 'update_dealer_user', user_id: user.id, role: newRole });
    await load();
  };

  const changePriceLevel = async (user, level) => {
    await apiPost({ action: 'update_dealer_user', user_id: user.id, price_level: level });
    await load();
  };

  const PermToggle = ({ user, field, label }) => {
    const on = !!user[field];
    const isSaving = permSaving === user.id + field;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
        <span style={{ fontSize: 12, color: '#617084' }}>{label}</span>
        <button onClick={() => togglePerm(user, field)} disabled={isSaving} style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', background: on ? '#22c55e' : '#d1d5db', position: 'relative', transition: 'background 0.2s' }}>
          <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </button>
      </div>
    );
  };

  return (
    <div>
      <PageLead eyebrow="DEALER USERS" title="經銷商/業務帳號" description="管理帳號、角色與權限。點擊帳號展開權限設定。" action={<button onClick={() => setShowCreate(!showCreate)} style={S.btnPrimary}>{showCreate ? '取消' : '+ 新增帳號'}</button>} />
      {msg && <div style={{ ...S.card, background: msg.includes('失敗') || msg.includes('錯誤') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') || msg.includes('錯誤') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') || msg.includes('錯誤') ? '#b42318' : '#15803d', marginBottom: 14 }}>{msg}</div>}
      {showCreate && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
            <div><label style={S.label}>帳號 *</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={S.input} placeholder="小寫英數" /></div>
            <div><label style={S.label}>密碼 *</label><input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={S.input} placeholder="至少 4 碼" /></div>
            <div><label style={S.label}>姓名 *</label><input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} style={S.input} /></div>
            <div><label style={S.label}>角色</label><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={S.input}><option value="dealer">經銷商</option><option value="sales">業務</option><option value="technician">維修技師</option></select></div>
            <div><label style={S.label}>公司</label><input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} style={S.input} /></div>
            <div><label style={S.label}>電話</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={S.input} /></div>
          </div>
          <button onClick={createUser} disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? '建立中...' : '建立帳號'}</button>
        </div>
      )}
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="尚無帳號" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr) 100px 130px 100px 160px', gap: 10, padding: '12px 16px', borderBottom: '2px solid #e6edf5', color: '#7b889b', fontSize: 11, fontWeight: 600 }}>
            <div>帳號</div><div>姓名 / 公司</div><div>角色</div><div>電話</div><div>狀態</div><div>操作</div>
          </div>
          {data.rows.map((u, idx) => (
            <div key={u.id}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr) 100px 130px 100px 160px', gap: 10, padding: '12px 16px', borderTop: '1px solid #eef3f8', alignItems: 'center', background: expandedId === u.id ? '#f0f7ff' : idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}>
                <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{u.username}</div>
                <div><div style={{ fontSize: 13, fontWeight: 600, color: '#1c2740' }}>{u.display_name}</div>{u.company_name && <div style={{ fontSize: 11, color: '#617084' }}>{u.company_name}</div>}</div>
                <div><span style={S.tag(ROLE_TONE[u.role] || '')}>{ROLE_MAP[u.role] || u.role}</span></div>
                <div style={{ fontSize: 12, color: '#617084' }}>{u.phone || '-'}</div>
                <div><span style={S.tag(u.status === 'active' ? 'green' : '')}>{u.status === 'active' ? '啟用' : '停用'}</span></div>
                <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => toggleStatus(u)} style={{ ...S.btnGhost, padding: '4px 8px', fontSize: 11 }}>{u.status === 'active' ? '停用' : '啟用'}</button>
                  <button onClick={() => resetPw(u)} style={{ ...S.btnGhost, padding: '4px 8px', fontSize: 11 }}>重設密碼</button>
                </div>
              </div>
              {expandedId === u.id && (
                <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #e6edf5', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                  <div style={{ ...S.card, padding: '16px', background: '#fff' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1c2740', marginBottom: 12 }}>權限設定</div>
                    <PermToggle user={u} field="can_see_stock" label="查看庫存" />
                    <PermToggle user={u} field="can_place_order" label="下單權限" />
                    <PermToggle user={u} field="notify_on_arrival" label="到貨通知" />
                  </div>
                  <div style={{ ...S.card, padding: '16px', background: '#fff' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1c2740', marginBottom: 12 }}>角色與價格</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                      <span style={{ fontSize: 12, color: '#617084' }}>角色</span>
                      <select value={u.role} onChange={(e) => changeRole(u, e.target.value)} style={{ ...S.input, width: 'auto', padding: '4px 8px', fontSize: 12 }}>
                        <option value="dealer">經銷商</option><option value="sales">業務</option><option value="technician">維修技師</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                      <span style={{ fontSize: 12, color: '#617084' }}>價格等級</span>
                      <select value={u.price_level || 'reseller'} onChange={(e) => changePriceLevel(u, e.target.value)} style={{ ...S.input, width: 'auto', padding: '4px 8px', fontSize: 12 }}>
                        <option value="cost">成本價</option><option value="reseller">經銷價</option><option value="retail">零售價</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ ...S.card, padding: '16px', background: '#fff' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1c2740', marginBottom: 12 }}>帳號資訊</div>
                    <div style={{ fontSize: 11, color: '#617084', display: 'grid', gap: 4 }}>
                      <div>Email: {u.email || '-'}</div>
                      <div>LINE: {u.line_user_id ? '已綁定' : '未綁定'}</div>
                      <div>上次登入: {u.last_login_at ? u.last_login_at.slice(0, 16).replace('T', ' ') : '從未登入'}</div>
                      <div>建立日期: {u.created_at ? u.created_at.slice(0, 10) : '-'}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DealerOrders() {
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [consolidating, setConsolidating] = useState(false);
  const [msg, setMsg] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [expandedId, setExpandedId] = useState(null);
  const [editingStatus, setEditingStatus] = useState({});
  const [editingRemark, setEditingRemark] = useState({});

  const STATUS_MAP = { pending: '待處理', confirmed: '已確認', purchasing: '採購中', partial_arrived: '部分到貨', arrived: '已到貨', shipped: '已出貨', completed: '已完成', cancelled: '已取消' };
  const STATUS_TONE = { pending: 'yellow', confirmed: 'blue', purchasing: 'blue', arrived: 'green', shipped: 'green', completed: 'green', cancelled: '' };

  const load = async () => { setLoading(true); try { setData(await apiGet({ action: 'dealer_orders', status: statusFilter })); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [statusFilter]);

  const toggleSelect = (id) => setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const selectAll = () => {
    const pendingIds = data.rows.filter((r) => r.status === 'pending').map((r) => r.id);
    setSelected(selected.length === pendingIds.length ? [] : pendingIds);
  };

  const consolidate = async () => {
    if (!selected.length) return;
    if (!confirm(`確定將 ${selected.length} 筆訂單彙整為採購單？`)) return;
    setConsolidating(true); setMsg('');
    try {
      const result = await apiPost({ action: 'consolidate_orders_to_po', order_ids: selected });
      setMsg(result.message || '採購單建立成功');
      setSelected([]);
      await load();
    } catch (e) { setMsg(e.message); } finally { setConsolidating(false); }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await apiPost({ action: 'update_dealer_order', order_id: orderId, status: newStatus });
      setMsg('訂單狀態已更新');
      await load();
    } catch (e) { setMsg(e.message); }
  };

  const updateOrderRemark = async (orderId, remark) => {
    try {
      await apiPost({ action: 'update_dealer_order', order_id: orderId, remark });
      setMsg('備註已更新');
      await load();
    } catch (e) { setMsg(e.message); }
  };

  const updateItemQty = async (item, newQty) => {
    if (newQty < 0) return;
    try {
      await apiPost({ action: 'update_dealer_order_item', item_id: item.id, qty: newQty, unit_price: item.unit_price });
      await load();
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div>
      <PageLead eyebrow="DEALER ORDERS" title="經銷商訂單" description="點擊訂單展開明細，可即時編輯數量、狀態與備註。可勾選彙整為採購單。" action={selected.length > 0 ? <button onClick={consolidate} disabled={consolidating} style={{ ...S.btnPrimary, opacity: consolidating ? 0.7 : 1 }}>{consolidating ? '彙整中...' : `彙整 ${selected.length} 筆 → 採購單`}</button> : null} />
      {msg && <div style={{ ...S.card, background: msg.includes('失敗') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') ? '#b42318' : '#15803d', marginBottom: 14 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['', '全部'], ['pending', '待處理'], ['purchasing', '採購中'], ['arrived', '已到貨'], ['shipped', '已出貨']].map(([key, label]) => (
          <button key={key} onClick={() => { setStatusFilter(key); setSelected([]); }} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 12, background: statusFilter === key ? '#1976f3' : '#fff', color: statusFilter === key ? '#fff' : '#4b5563', borderColor: statusFilter === key ? '#1976f3' : '#dbe3ee' }}>{label}</button>
        ))}
      </div>
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="沒有訂單" /> : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 140px minmax(0,1fr) 100px 100px 110px 60px', gap: 10, padding: '12px 16px', borderBottom: '2px solid #e6edf5', color: '#7b889b', fontSize: 11, fontWeight: 600 }}>
            <div><input type="checkbox" checked={selected.length > 0 && selected.length === data.rows.filter((r) => r.status === 'pending').length} onChange={selectAll} /></div>
            <div>訂單號</div><div>下單人</div><div>日期</div><div>狀態</div><div style={{ textAlign: 'right' }}>金額</div><div></div>
          </div>
          {data.rows.map((row, idx) => {
            const isExpanded = expandedId === row.id;
            return (
              <div key={row.id}>
                <div style={{ display: 'grid', gridTemplateColumns: '40px 140px minmax(0,1fr) 100px 100px 110px 60px', gap: 10, padding: '12px 16px', borderTop: '1px solid #eef3f8', alignItems: 'center', background: isExpanded ? '#f0f7ff' : selected.includes(row.id) ? '#edf5ff' : idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : row.id)}>
                  <div onClick={(e) => e.stopPropagation()}>{row.status === 'pending' && <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleSelect(row.id)} />}</div>
                  <div style={{ fontSize: 12, color: '#1976f3', fontWeight: 700, ...S.mono }}>{row.order_no || '-'}</div>
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: '#1c2740' }}>{row.dealer?.display_name || '-'}</div><div style={{ fontSize: 11, color: '#617084' }}>{row.dealer?.company_name || ''} {row.dealer?.role ? `(${row.dealer.role === 'dealer' ? '經銷' : row.dealer.role === 'sales' ? '業務' : '技師'})` : ''}</div></div>
                  <div style={{ fontSize: 12, color: '#617084', ...S.mono }}>{row.order_date || '-'}</div>
                  <div><span style={S.tag(STATUS_TONE[row.status] || '')}>{STATUS_MAP[row.status] || row.status}</span></div>
                  <div style={{ fontSize: 13, color: '#129c59', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(row.total_amount)}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>{isExpanded ? '\u25B2' : '\u25BC'}</div>
                </div>
                {isExpanded && (
                  <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #e6edf5' }}>
                    {/* Order Items Detail */}
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1c2740', marginBottom: 10 }}>訂單明細</div>
                    <div style={{ ...S.card, padding: 0, overflow: 'hidden', marginBottom: 16, background: '#fff' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr) 90px 90px 90px 80px', gap: 8, padding: '8px 14px', borderBottom: '1px solid #e6edf5', color: '#7b889b', fontSize: 10, fontWeight: 600 }}>
                        <div>料號</div><div>品名</div><div>單價</div><div>數量</div><div>小計</div><div>操作</div>
                      </div>
                      {(row.items || []).map((item) => (
                        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr) 90px 90px 90px 80px', gap: 8, padding: '10px 14px', borderTop: '1px solid #f0f3f7', alignItems: 'center', fontSize: 12 }}>
                          <div style={{ color: '#1976f3', fontWeight: 600, ...S.mono }}>{item.item_number_snapshot}</div>
                          <div style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description_snapshot || '-'}</div>
                          <div style={{ color: '#617084', ...S.mono }}>{fmtP(item.unit_price)}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button onClick={() => updateItemQty(item, item.qty - 1)} style={{ ...S.btnGhost, padding: '2px 6px', fontSize: 11, minWidth: 24 }}>-</button>
                            <span style={{ ...S.mono, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                            <button onClick={() => updateItemQty(item, item.qty + 1)} style={{ ...S.btnGhost, padding: '2px 6px', fontSize: 11, minWidth: 24 }}>+</button>
                          </div>
                          <div style={{ color: '#129c59', fontWeight: 600, ...S.mono }}>{fmtP(item.line_total || item.unit_price * item.qty)}</div>
                          <div>{item.qty > 0 && <button onClick={() => { if (confirm('刪除此品項？')) updateItemQty(item, 0); }} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: 10, color: '#ef4444', borderColor: '#fecdd3' }}>刪除</button>}</div>
                        </div>
                      ))}
                    </div>

                    {/* Status + Remark Edit */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
                      <div>
                        <label style={{ ...S.label, marginBottom: 6 }}>變更狀態</label>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {Object.entries(STATUS_MAP).map(([k, v]) => (
                            <button key={k} onClick={() => updateOrderStatus(row.id, k)} disabled={row.status === k} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 11, background: row.status === k ? '#1976f3' : '#fff', color: row.status === k ? '#fff' : '#4b5563', borderColor: row.status === k ? '#1976f3' : '#dbe3ee', opacity: row.status === k ? 1 : 0.8 }}>{v}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={{ ...S.label, marginBottom: 6 }}>備註</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input defaultValue={row.remark || ''} onChange={(e) => setEditingRemark({ ...editingRemark, [row.id]: e.target.value })} style={{ ...S.input, flex: 1, fontSize: 12 }} placeholder="訂單備註" />
                          <button onClick={() => updateOrderRemark(row.id, editingRemark[row.id] ?? row.remark)} style={{ ...S.btnPrimary, padding: '6px 14px', fontSize: 12 }}>儲存</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ========== Announcements Manager ==========
function Announcements() {
  const [anns, setAnns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', type: 'info', priority: 0, target_roles: [] });
  const [msg, setMsg] = useState('');

  const TYPE_MAP = { info: '一般', warning: '警告', success: '成功', urgent: '緊急' };
  const TYPE_TONE = { info: 'blue', warning: 'yellow', success: 'green', urgent: 'red' };
  const ROLE_OPTIONS = [
    { value: 'dealer', label: '經銷商' },
    { value: 'sales', label: '業務' },
    { value: 'technician', label: '技師' },
  ];
  const ROLE_LABEL = { dealer: '經銷商', sales: '業務', technician: '技師' };
  const ROLE_TONE = { dealer: 'blue', sales: 'yellow', technician: 'green' };
  const toggleRole = (role) => {
    setForm(f => ({ ...f, target_roles: f.target_roles.includes(role) ? f.target_roles.filter(r => r !== role) : [...f.target_roles, role] }));
  };

  const load = async () => { setLoading(true); try { const res = await apiGet({ action: 'announcements' }); setAnns(res.announcements || []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await apiPost({ action: 'create_announcement', ...form });
      setMsg('公告已發布');
      setShowCreate(false);
      setForm({ title: '', content: '', type: 'info', priority: 0, target_roles: [] });
      await load();
    } catch (e) { setMsg(e.message); }
  };

  const toggleActive = async (ann) => {
    await apiPost({ action: 'update_announcement', announcement_id: ann.id, is_active: !ann.is_active });
    await load();
  };

  const deleteAnn = async (ann) => {
    if (!confirm(`確定刪除公告「${ann.title}」？`)) return;
    await apiPost({ action: 'delete_announcement', announcement_id: ann.id });
    await load();
  };

  return (
    <div>
      <PageLead eyebrow="ANNOUNCEMENTS" title="公告管理" description="發布公告給經銷商/業務/技師，會顯示在他們的入口頁面頂部。" action={<button onClick={() => setShowCreate(!showCreate)} style={S.btnPrimary}>{showCreate ? '取消' : '+ 發布公告'}</button>} />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 14 }}>{msg}</div>}
      {showCreate && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
            <div><label style={S.label}>標題 *</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={S.input} placeholder="公告標題" /></div>
            <div><label style={S.label}>類型</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={S.input}><option value="info">一般</option><option value="warning">警告</option><option value="success">成功</option><option value="urgent">緊急</option></select></div>
            <div><label style={S.label}>優先級 (數字越大越前)</label><input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} style={S.input} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><label style={S.label}>內容</label><textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ ...S.input, minHeight: 80 }} placeholder="公告內容（可留空）" /></div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>可見角色（不選 = 全部可見）</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {ROLE_OPTIONS.map(r => (
                <button key={r.value} onClick={() => toggleRole(r.value)} style={{ padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '2px solid', borderColor: form.target_roles.includes(r.value) ? '#6366f1' : '#e5e7eb', background: form.target_roles.includes(r.value) ? '#6366f1' : '#fff', color: form.target_roles.includes(r.value) ? '#fff' : '#617084', transition: 'all 0.15s' }}>{r.label}</button>
              ))}
            </div>
          </div>
          <button onClick={create} style={S.btnPrimary}>發布公告</button>
        </div>
      )}
      {loading ? <Loading /> : anns.length === 0 ? <EmptyState text="沒有公告" /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {anns.map((ann) => (
            <div key={ann.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 14, opacity: ann.is_active ? 1 : 0.5 }}>
              <span style={S.tag(TYPE_TONE[ann.type] || 'blue')}>{TYPE_MAP[ann.type] || ann.type}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1c2740' }}>{ann.title}</div>
                {ann.content && <div style={{ fontSize: 12, color: '#617084', marginTop: 4 }}>{ann.content}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: '#9ca3af', ...S.mono }}>{ann.created_at?.slice(0, 16).replace('T', ' ')}</span>
                  {ann.target_roles && ann.target_roles.length > 0 ? ann.target_roles.map(r => (
                    <span key={r} style={S.tag(ROLE_TONE[r] || 'blue')}>{ROLE_LABEL[r] || r}</span>
                  )) : <span style={S.tag('')}>全部</span>}
                </div>
              </div>
              <span style={S.tag(ann.is_active ? 'green' : '')}>{ann.is_active ? '啟用' : '停用'}</span>
              <button onClick={() => toggleActive(ann)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 11 }}>{ann.is_active ? '停用' : '啟用'}</button>
              <button onClick={() => deleteAnn(ann)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 11, color: '#ef4444', borderColor: '#fecdd3' }}>刪除</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========================================= CRM LEADS 商機管線 ========================================= */
function CRMLeads() {
  const width = useViewportWidth(); const isMobile = width < 820;
  const [data, setData] = useState({ rows: [], total: 0, pipeline: {} });
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ customer_name: '', contact_name: '', phone: '', email: '', source: 'manual', expected_amount: 0, notes: '' });
  const [msg, setMsg] = useState('');

  const STAGES = [
    { id: 'new', label: '新線索', color: '#6366f1' },
    { id: 'qualified', label: '已確認', color: '#3b82f6' },
    { id: 'proposition', label: '提案中', color: '#f59e0b' },
    { id: 'negotiation', label: '議價中', color: '#f97316' },
    { id: 'won', label: '成交', color: '#16a34a' },
    { id: 'lost', label: '流失', color: '#ef4444' },
  ];
  const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.id, s]));
  const SOURCE_LABELS = { manual: '手動', line: 'LINE', website: '網站', referral: '轉介', dealer: '經銷商' };

  const load = async (stage = stageFilter) => {
    setLoading(true);
    try { const res = await apiGet({ action: 'crm_leads', stage }); setData(res); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.customer_name.trim()) { setMsg('請輸入客戶名稱'); return; }
    try { await apiPost({ action: 'create_lead', ...form }); setCreateOpen(false); setForm({ customer_name: '', contact_name: '', phone: '', email: '', source: 'manual', expected_amount: 0, notes: '' }); setMsg('線索已建立'); await load(); } catch (e) { setMsg(e.message); }
  };

  const updateStage = async (lead, newStage) => {
    try { await apiPost({ action: 'update_lead', lead_id: lead.id, stage: newStage }); await load(); } catch (e) { setMsg(e.message); }
  };

  const p = data.pipeline || {};

  return (
    <div>
      <PageLead eyebrow="CRM PIPELINE" title="商機管線" description="追蹤從線索到成交的完整流程，參考 Odoo CRM 邏輯。" action={<button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增線索</button>} />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 14, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      {/* Pipeline Kanban Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)', gap: 8, marginBottom: 20 }}>
        {STAGES.map(s => (
          <div key={s.id} onClick={() => { setStageFilter(stageFilter === s.id ? '' : s.id); load(stageFilter === s.id ? '' : s.id); }} style={{ ...S.card, cursor: 'pointer', textAlign: 'center', padding: '14px 8px', borderLeft: `3px solid ${s.color}`, background: stageFilter === s.id ? `${s.color}10` : '#fff' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, ...S.mono }}>{p[s.id] || 0}</div>
            <div style={{ fontSize: 11, color: '#617084', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Win rate bar */}
      <div style={{ ...S.card, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 12, color: '#617084' }}>成交率</span>
        <div style={{ flex: 1, background: '#f0f0f0', borderRadius: 999, height: 8, overflow: 'hidden' }}>
          <div style={{ width: `${p.win_rate || 0}%`, background: 'linear-gradient(90deg, #16a34a, #22c55e)', height: '100%', borderRadius: 999, transition: 'width 0.5s' }} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', ...S.mono }}>{p.win_rate || 0}%</span>
        <span style={{ fontSize: 12, color: '#617084' }}>成交金額</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1e3a5f', ...S.mono }}>NT${(p.total_won_amount || 0).toLocaleString()}</span>
      </div>

      {/* Lead list */}
      {loading ? <Loading /> : (data.rows || []).length === 0 ? <EmptyState text="沒有線索" /> : (data.rows || []).map(lead => (
        <div key={lead.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ ...S.tag(STAGE_MAP[lead.stage]?.color ? '' : 'blue'), background: STAGE_MAP[lead.stage]?.color || '#6366f1', color: '#fff', fontSize: 11 }}>{STAGE_MAP[lead.stage]?.label || lead.stage}</span>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1c2740' }}>{lead.customer_name}</div>
              <div style={{ fontSize: 11, color: '#617084' }}>{lead.contact_name || ''} {lead.phone ? `· ${lead.phone}` : ''}</div>
            </div>
            <span style={S.tag('')}>{SOURCE_LABELS[lead.source] || lead.source}</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a5f', ...S.mono }}>NT${Number(lead.expected_amount || 0).toLocaleString()}</div>
              <div style={{ fontSize: 10, color: '#9ca3af', ...S.mono }}>{lead.created_at?.slice(0, 10)}</div>
            </div>
            {/* Stage transition buttons */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {lead.stage !== 'won' && lead.stage !== 'lost' && (
                <>
                  {STAGES.filter(s => s.id !== lead.stage && s.id !== 'lost').map(s => (
                    <button key={s.id} onClick={() => updateStage(lead, s.id)} style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 10, borderColor: s.color, color: s.color }}>{s.label}</button>
                  ))}
                  <button onClick={() => updateStage(lead, 'lost')} style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 10, borderColor: '#ef4444', color: '#ef4444' }}>流失</button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}

      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 480, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>新增線索</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div><label style={S.label}>客戶名稱 *</label><input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} style={S.input} /></div>
              <div><label style={S.label}>聯絡人</label><input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} style={S.input} /></div>
              <div><label style={S.label}>電話</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={S.input} /></div>
              <div><label style={S.label}>Email</label><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={S.input} /></div>
              <div><label style={S.label}>來源</label><select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} style={S.input}><option value="manual">手動</option><option value="line">LINE</option><option value="website">網站</option><option value="referral">轉介</option><option value="dealer">經銷商</option></select></div>
              <div><label style={S.label}>預估金額</label><input type="number" value={form.expected_amount} onChange={e => setForm(f => ({ ...f, expected_amount: Number(e.target.value) }))} style={S.input} /></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>備註</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...S.input, minHeight: 60 }} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button><button onClick={handleCreate} style={S.btnPrimary}>建立線索</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= STOCK ALERTS 庫存警示 ========================================= */
function StockAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => { setLoading(true); try { const res = await apiGet({ action: 'stock_alerts' }); setAlerts(res.alerts || []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const URGENCY = { critical: { label: '缺貨', color: '#dc2626', bg: '#fef2f2' }, high: { label: '偏低', color: '#f59e0b', bg: '#fffbeb' }, medium: { label: '注意', color: '#3b82f6', bg: '#ecfdf5' } };

  return (
    <div>
      <PageLead eyebrow="STOCK ALERTS" title="庫存警示" description="低於安全庫存的商品一覽，參考 Odoo 自動補貨規則。" action={<button onClick={load} style={S.btnGhost}>重新整理</button>} />
      <div style={S.statGrid}>
        <StatCard code="CRIT" label="缺貨" value={alerts.filter(a => a.urgency === 'critical').length} tone="red" />
        <StatCard code="LOW" label="偏低" value={alerts.filter(a => a.urgency === 'high').length} tone="yellow" />
        <StatCard code="WARN" label="注意" value={alerts.filter(a => a.urgency === 'medium').length} tone="blue" />
      </div>
      {loading ? <Loading /> : alerts.length === 0 ? <EmptyState text="所有商品庫存正常" /> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f8fafc' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#7b889b', fontWeight: 600 }}>狀態</th>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#7b889b', fontWeight: 600 }}>料號</th>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#7b889b', fontWeight: 600 }}>品名</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#7b889b', fontWeight: 600 }}>現有庫存</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#7b889b', fontWeight: 600 }}>安全庫存</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#7b889b', fontWeight: 600 }}>缺口</th>
          </tr></thead>
          <tbody>{alerts.map((a, i) => {
            const u = URGENCY[a.urgency] || URGENCY.medium;
            return (
              <tr key={i} style={{ borderTop: '1px solid #f0f0f0', background: u.bg }}>
                <td style={{ padding: '10px 12px' }}><span style={{ ...S.tag(''), background: u.color, color: '#fff', fontSize: 10 }}>{u.label}</span></td>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1976f3', ...S.mono }}>{a.item_number}</td>
                <td style={{ padding: '10px 12px' }}>{a.description || '-'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: a.stock_qty <= 0 ? '#dc2626' : '#f59e0b', ...S.mono }}>{a.stock_qty}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...S.mono }}>{a.safety_stock}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626', ...S.mono }}>-{a.deficit}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
    </div>
  );
}

/* ========================================= REORDER SUGGESTIONS 補貨建議 ========================================= */
function ReorderSuggestions() {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [msg, setMsg] = useState('');

  const load = async () => { setLoading(true); try { const res = await apiGet({ action: 'reorder_suggestions', status: 'pending' }); setSuggestions(res.suggestions || []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const generate = async () => { setLoading(true); try { await apiGet({ action: 'reorder_suggestions', generate: '1', status: 'pending' }); await load(); setMsg('已掃描庫存並產生補貨建議'); } catch (e) { setMsg(e.message); } };

  const convertToPO = async () => {
    if (!selected.length) return;
    try {
      const res = await apiPost({ action: 'reorder_to_po', suggestion_ids: selected });
      setMsg(res.message || '採購單已建立');
      setSelected([]);
      await load();
    } catch (e) { setMsg(e.message); }
  };

  const dismiss = async (id) => {
    try { await apiPost({ action: 'dismiss_reorder', suggestion_id: id }); await load(); } catch (e) { setMsg(e.message); }
  };

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelected(prev => prev.length === suggestions.length ? [] : suggestions.map(s => s.id));

  return (
    <div>
      <PageLead eyebrow="REORDER" title="補貨建議" description="根據安全庫存自動產生補貨建議，可勾選轉為採購單。參考 Odoo 補貨規則。" action={
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={generate} style={S.btnGhost}>掃描庫存</button>
          {selected.length > 0 && <button onClick={convertToPO} style={S.btnPrimary}>轉採購單 ({selected.length})</button>}
        </div>
      } />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 14, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}
      {loading ? <Loading /> : suggestions.length === 0 ? <EmptyState text="目前沒有補貨建議，點擊「掃描庫存」檢查" /> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f8fafc' }}>
            <th style={{ padding: '10px 12px', textAlign: 'center', width: 40 }}><input type="checkbox" checked={selected.length === suggestions.length} onChange={toggleAll} /></th>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#7b889b', fontWeight: 600 }}>料號</th>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#7b889b', fontWeight: 600 }}>品名</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#7b889b', fontWeight: 600 }}>現有</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#7b889b', fontWeight: 600 }}>安全</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#7b889b', fontWeight: 600 }}>建議採購</th>
            <th style={{ padding: '10px 12px', textAlign: 'center', color: '#7b889b', fontWeight: 600 }}>操作</th>
          </tr></thead>
          <tbody>{suggestions.map(s => (
            <tr key={s.id} style={{ borderTop: '1px solid #f0f0f0' }}>
              <td style={{ padding: '10px 12px', textAlign: 'center' }}><input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleSelect(s.id)} /></td>
              <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1976f3', ...S.mono }}>{s.item_number}</td>
              <td style={{ padding: '10px 12px' }}>{s.description || '-'}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: s.current_stock <= 0 ? '#dc2626' : '#f59e0b', fontWeight: 700, ...S.mono }}>{s.current_stock}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', ...S.mono }}>{s.safety_stock}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a', ...S.mono }}>{s.suggested_qty}</td>
              <td style={{ padding: '10px 12px', textAlign: 'center' }}><button onClick={() => dismiss(s.id)} style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 10 }}>略過</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

/* ========================================= INVOICES 發票管理 ========================================= */
function Invoices() {
  const width = useViewportWidth(); const isMobile = width < 820;
  const [data, setData] = useState({ rows: [], total: 0, summary: {} });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [payDialog, setPayDialog] = useState(null);
  const [payAmount, setPayAmount] = useState('');

  const load = async (status = statusFilter) => {
    setLoading(true);
    try { const res = await apiGet({ action: 'invoices', status }); setData(res); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const STATUS_MAP = {
    draft: { label: '草稿', color: '#9ca3af' },
    sent: { label: '已寄送', color: '#3b82f6' },
    unpaid: { label: '未付款', color: '#f59e0b' },
    partial: { label: '部分付款', color: '#f97316' },
    paid: { label: '已付清', color: '#16a34a' },
    overdue: { label: '逾期', color: '#dc2626' },
    cancelled: { label: '已取消', color: '#6b7280' },
  };

  const handlePay = async () => {
    if (!payDialog || !payAmount || Number(payAmount) <= 0) return;
    try {
      await apiPost({ action: 'record_payment', invoice_id: payDialog.id, amount: Number(payAmount), payment_method: 'transfer' });
      setMsg('付款已記錄'); setPayDialog(null); setPayAmount(''); await load();
    } catch (e) { setMsg(e.message); }
  };

  const s = data.summary || {};

  return (
    <div>
      <PageLead eyebrow="INVOICES" title="發票管理" description="管理發票開立、付款狀態追蹤，參考 Odoo 會計模組。" />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 14, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      <div style={S.statGrid}>
        <StatCard code="UNPD" label="未付款" value={fmtP(s.unpaid_amount)} tone="yellow" />
        <StatCard code="PAID" label="已收款" value={fmtP(s.paid_amount)} tone="green" />
        <StatCard code="OVRD" label="逾期" value={fmtP(s.overdue_amount)} tone="red" />
        <StatCard code="TOTL" label="發票數" value={data.total} tone="blue" />
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => { setStatusFilter(''); load(''); }} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 11, background: !statusFilter ? '#1e3a5f' : '#fff', color: !statusFilter ? '#fff' : '#617084' }}>全部</button>
        {Object.entries(STATUS_MAP).map(([k, v]) => (
          <button key={k} onClick={() => { setStatusFilter(k); load(k); }} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 11, borderColor: v.color, background: statusFilter === k ? v.color : '#fff', color: statusFilter === k ? '#fff' : v.color }}>{v.label}</button>
        ))}
      </div>

      {loading ? <Loading /> : (data.rows || []).length === 0 ? <EmptyState text="沒有發票資料" /> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f8fafc' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#7b889b', fontWeight: 600 }}>發票號</th>
            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#7b889b', fontWeight: 600 }}>客戶</th>
            <th style={{ padding: '10px 12px', textAlign: 'center', color: '#7b889b', fontWeight: 600 }}>狀態</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#7b889b', fontWeight: 600 }}>金額</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#7b889b', fontWeight: 600 }}>已付</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', color: '#7b889b', fontWeight: 600 }}>餘額</th>
            <th style={{ padding: '10px 12px', textAlign: 'center', color: '#7b889b', fontWeight: 600 }}>到期日</th>
            <th style={{ padding: '10px 12px', textAlign: 'center', color: '#7b889b', fontWeight: 600 }}>操作</th>
          </tr></thead>
          <tbody>{(data.rows || []).map(inv => {
            const st = STATUS_MAP[inv.status] || STATUS_MAP.draft;
            const balance = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0);
            return (
              <tr key={inv.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1976f3', ...S.mono }}>{inv.invoice_no || '-'}</td>
                <td style={{ padding: '10px 12px' }}>{inv.customer_name || '-'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}><span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: 10 }}>{st.label}</span></td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(inv.total_amount)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a', ...S.mono }}>{fmtP(inv.paid_amount)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: balance > 0 ? '#dc2626' : '#16a34a', ...S.mono }}>{fmtP(balance)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, ...S.mono }}>{inv.due_date?.slice(0, 10) || '-'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {balance > 0 && inv.status !== 'cancelled' && (
                    <button onClick={() => { setPayDialog(inv); setPayAmount(String(balance)); }} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 10 }}>收款</button>
                  )}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      )}

      {payDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 400, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>記錄收款</h3>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#617084' }}>發票：{payDialog.invoice_no} / 餘額：{fmtP(Number(payDialog.total_amount || 0) - Number(payDialog.paid_amount || 0))}</div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>收款金額</label><input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} style={S.input} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setPayDialog(null)} style={S.btnGhost}>取消</button>
              <button onClick={handlePay} style={S.btnPrimary}>確認收款</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= APPROVALS 簽核審批 ========================================= */
function Approvals() {
  const [data, setData] = useState({ rows: [], total: 0, pending_count: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [msg, setMsg] = useState('');
  const [noteDialog, setNoteDialog] = useState(null);
  const [note, setNote] = useState('');

  const load = async (status = statusFilter) => {
    setLoading(true);
    try { const res = await apiGet({ action: 'approvals', status }); setData(res); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const STATUS_MAP = {
    pending: { label: '待審核', color: '#f59e0b' },
    approved: { label: '已核准', color: '#16a34a' },
    rejected: { label: '已駁回', color: '#dc2626' },
  };
  const TYPE_MAP = {
    purchase_order: '採購單', quote: '報價單', order: '訂單', expense: '費用', other: '其他',
  };

  const handleProcess = async (approval, decision) => {
    if (decision === 'rejected' && !note.trim()) {
      setNoteDialog(approval); return;
    }
    try {
      await apiPost({ action: 'process_approval', approval_id: approval.id, decision, note: note || '' });
      setMsg(decision === 'approved' ? '已核准' : '已駁回');
      setNoteDialog(null); setNote('');
      await load();
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div>
      <PageLead eyebrow="APPROVALS" title="簽核審批" description="集中管理採購單、報價單等文件的核准流程，參考 Odoo 審批模組。" />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 14, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      <div style={S.statGrid}>
        <StatCard code="PEND" label="待審核" value={data.pending_count || 0} tone="yellow" />
        <StatCard code="TOTL" label="全部" value={data.total} tone="blue" />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(STATUS_MAP).map(([k, v]) => (
          <button key={k} onClick={() => { setStatusFilter(k); load(k); }} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 11, borderColor: v.color, background: statusFilter === k ? v.color : '#fff', color: statusFilter === k ? '#fff' : v.color }}>{v.label}</button>
        ))}
      </div>

      {loading ? <Loading /> : (data.rows || []).length === 0 ? <EmptyState text="沒有審批記錄" /> : (data.rows || []).map(a => {
        const st = STATUS_MAP[a.status] || STATUS_MAP.pending;
        return (
          <div key={a.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: 11 }}>{st.label}</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1c2740' }}>{TYPE_MAP[a.doc_type] || a.doc_type} — {a.doc_no || a.doc_id}</div>
                <div style={{ fontSize: 11, color: '#617084' }}>申請人：{a.requester_name || '-'} · {a.created_at?.slice(0, 10)}</div>
                {a.note && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>備註：{a.note}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a5f', ...S.mono }}>{fmtP(a.amount)}</div>
              </div>
              {a.status === 'pending' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleProcess(a, 'approved')} style={{ ...S.btnPrimary, padding: '5px 14px', fontSize: 12 }}>核准</button>
                  <button onClick={() => { setNoteDialog(a); setNote(''); }} style={{ ...S.btnGhost, padding: '5px 14px', fontSize: 12, borderColor: '#dc2626', color: '#dc2626' }}>駁回</button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {noteDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 420, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>駁回原因</h3>
            <div style={{ marginBottom: 12 }}><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="請說明駁回原因..." style={{ ...S.input, minHeight: 80 }} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setNoteDialog(null)} style={S.btnGhost}>取消</button>
              <button onClick={() => handleProcess(noteDialog, 'rejected')} style={{ ...S.btnPrimary, background: '#dc2626' }}>確認駁回</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= TICKETS 客服工單 ========================================= */
function Tickets() {
  const [data, setData] = useState({ rows: [], total: 0, summary: {} });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', source: 'admin' });
  const [detail, setDetail] = useState(null);
  const [replies, setReplies] = useState([]);
  const [replyText, setReplyText] = useState('');

  const load = async (status = statusFilter) => {
    setLoading(true);
    try { const res = await apiGet({ action: 'tickets', status }); setData(res); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const STATUS_MAP = {
    open: { label: '開立', color: '#3b82f6' },
    in_progress: { label: '處理中', color: '#f59e0b' },
    resolved: { label: '已解決', color: '#16a34a' },
    closed: { label: '已關閉', color: '#6b7280' },
  };
  const PRIORITY_MAP = {
    low: { label: '低', color: '#9ca3af' },
    medium: { label: '中', color: '#3b82f6' },
    high: { label: '高', color: '#f59e0b' },
    urgent: { label: '緊急', color: '#dc2626' },
  };

  const handleCreate = async () => {
    if (!form.title.trim()) { setMsg('請輸入工單標題'); return; }
    try { await apiPost({ action: 'create_ticket', ...form }); setCreateOpen(false); setForm({ title: '', description: '', priority: 'medium', source: 'admin' }); setMsg('工單已建立'); await load(); } catch (e) { setMsg(e.message); }
  };

  const openDetail = async (ticket) => {
    try {
      const res = await apiGet({ action: 'ticket_detail', ticket_id: ticket.id });
      setDetail(res.ticket || ticket);
      setReplies(res.replies || []);
    } catch (e) { setMsg(e.message); }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !detail) return;
    try {
      await apiPost({ action: 'reply_ticket', ticket_id: detail.id, content: replyText, sender_type: 'admin', sender_name: '管理員' });
      setReplyText('');
      await openDetail(detail);
      await load();
    } catch (e) { setMsg(e.message); }
  };

  const updateStatus = async (ticketId, newStatus) => {
    try { await apiPost({ action: 'update_ticket', ticket_id: ticketId, status: newStatus }); setMsg('狀態已更新'); if (detail?.id === ticketId) await openDetail({ id: ticketId }); await load(); } catch (e) { setMsg(e.message); }
  };

  const sm = data.summary || {};

  return (
    <div>
      <PageLead eyebrow="HELPDESK" title="客服工單" description="客服工單管理，可結合 LINE 訊息自動建立。參考 Odoo Helpdesk。" action={<button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增工單</button>} />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 14, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      <div style={S.statGrid}>
        <StatCard code="OPEN" label="開立" value={sm.open || 0} tone="blue" />
        <StatCard code="PROG" label="處理中" value={sm.in_progress || 0} tone="yellow" />
        <StatCard code="DONE" label="已解決" value={sm.resolved || 0} tone="green" />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => { setStatusFilter(''); load(''); }} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 11, background: !statusFilter ? '#1e3a5f' : '#fff', color: !statusFilter ? '#fff' : '#617084' }}>全部</button>
        {Object.entries(STATUS_MAP).map(([k, v]) => (
          <button key={k} onClick={() => { setStatusFilter(k); load(k); }} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 11, borderColor: v.color, background: statusFilter === k ? v.color : '#fff', color: statusFilter === k ? '#fff' : v.color }}>{v.label}</button>
        ))}
      </div>

      {/* Ticket detail panel */}
      {detail && (
        <div style={{ ...S.card, padding: '16px', marginBottom: 16, borderLeft: `3px solid ${STATUS_MAP[detail.status]?.color || '#3b82f6'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#1c2740' }}>{detail.title}</span>
              <span style={{ marginLeft: 10, ...S.tag(''), background: STATUS_MAP[detail.status]?.color || '#3b82f6', color: '#fff', fontSize: 10 }}>{STATUS_MAP[detail.status]?.label || detail.status}</span>
              <span style={{ marginLeft: 6, ...S.tag(''), background: PRIORITY_MAP[detail.priority]?.color || '#3b82f6', color: '#fff', fontSize: 10 }}>{PRIORITY_MAP[detail.priority]?.label || detail.priority}</span>
            </div>
            <button onClick={() => setDetail(null)} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 11 }}>關閉</button>
          </div>
          {detail.description && <div style={{ fontSize: 13, color: '#617084', marginBottom: 12, padding: '10px', background: '#f8fafc', borderRadius: 6 }}>{detail.description}</div>}
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>來源：{detail.source || '-'} · 建立：{detail.created_at?.slice(0, 16)} · {detail.customer_name ? `客戶：${detail.customer_name}` : ''}</div>

          {/* Status actions */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {detail.status !== 'resolved' && <button onClick={() => updateStatus(detail.id, 'resolved')} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 11, borderColor: '#16a34a', color: '#16a34a' }}>標記已解決</button>}
            {detail.status !== 'closed' && detail.status === 'resolved' && <button onClick={() => updateStatus(detail.id, 'closed')} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 11, borderColor: '#6b7280', color: '#6b7280' }}>關閉工單</button>}
            {detail.status === 'open' && <button onClick={() => updateStatus(detail.id, 'in_progress')} style={{ ...S.btnGhost, padding: '4px 12px', fontSize: 11, borderColor: '#f59e0b', color: '#f59e0b' }}>開始處理</button>}
          </div>

          {/* Replies */}
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1c2740', marginBottom: 10 }}>回覆記錄 ({replies.length})</div>
            {replies.map((r, i) => (
              <div key={i} style={{ marginBottom: 8, padding: '10px 12px', background: r.sender_type === 'admin' ? '#ecfdf5' : '#f8fafc', borderRadius: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: r.sender_type === 'admin' ? '#1976f3' : '#617084' }}>{r.sender_name || r.sender_type}</span>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>{r.created_at?.slice(0, 16)}</span>
                </div>
                <div style={{ color: '#374151' }}>{r.content}</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="輸入回覆..." style={{ ...S.input, flex: 1 }} onKeyDown={e => e.key === 'Enter' && handleReply()} />
              <button onClick={handleReply} style={S.btnPrimary}>送出</button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket list */}
      {loading ? <Loading /> : (data.rows || []).length === 0 ? <EmptyState text="沒有工單" /> : (data.rows || []).map(t => {
        const st = STATUS_MAP[t.status] || STATUS_MAP.open;
        const pr = PRIORITY_MAP[t.priority] || PRIORITY_MAP.medium;
        return (
          <div key={t.id} style={{ ...S.card, padding: '14px 16px', marginBottom: 8, cursor: 'pointer', borderLeft: `3px solid ${st.color}` }} onClick={() => openDetail(t)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: 11 }}>{st.label}</span>
              <span style={{ ...S.tag(''), background: pr.color, color: '#fff', fontSize: 10 }}>{pr.label}</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1c2740' }}>{t.title}</div>
                <div style={{ fontSize: 11, color: '#617084' }}>{t.customer_name || t.source || '-'} · {t.created_at?.slice(0, 10)}</div>
              </div>
              {t.reply_count > 0 && <span style={{ ...S.tag(''), fontSize: 10 }}>{t.reply_count} 回覆</span>}
            </div>
          </div>
        );
      })}

      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 480, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>新增工單</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={S.label}>標題 *</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={S.input} /></div>
              <div><label style={S.label}>優先度</label><select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={S.input}><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="urgent">緊急</option></select></div>
              <div><label style={S.label}>來源</label><select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} style={S.input}><option value="admin">管理員</option><option value="line">LINE</option><option value="email">Email</option><option value="phone">電話</option></select></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>描述</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...S.input, minHeight: 80 }} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button onClick={() => setCreateOpen(false)} style={S.btnGhost}>取消</button><button onClick={handleCreate} style={S.btnPrimary}>建立工單</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================= SIDEBAR & LAYOUT ========================================= */
const SECTION_ICONS = {
  'ERP 總覽': '\u25C9',
  'ERP 主檔資料': '\u2630',
  'ERP 採購進貨': '\u2B07',
  'ERP 銷售出貨': '\u2B06',
  'ERP 倉儲管理': '\u2338',
  'ERP 分析報表': '\u2637',
  'CRM 客戶管線': '\u2764',
  'ERP 財務會計': '\u2696',
  'ERP 審批簽核': '\u2611',
  '客服工單': '\u260E',
  '經銷商入口': '\u263A',
  'LINE 與系統': '\u269B',
};

const SECTIONS = [
  {
    title: 'ERP 總覽',
    tabs: [
      { id: 'env_health', label: '環境檢查', code: 'HEAL' },
      { id: 'report_center', label: '進銷存報表', code: 'A1' },
      { id: 'dashboard', label: '儀表板', code: 'DASH' },
    ],
  },
  {
    title: 'ERP 主檔資料',
    tabs: [
      { id: 'customers', label: '客戶主檔', code: 'CUST' },
      { id: 'products', label: '產品查價', code: 'SRCH' },
      { id: 'vendors', label: '廠商主檔', code: 'VNDR' },
      { id: 'line_customers', label: 'LINE 客戶', code: 'LINE' },
    ],
  },
  {
    title: 'ERP 採購進貨',
    tabs: [
      { id: 'purchase_orders', label: '採購單', code: 'PO' },
      { id: 'stock_in', label: '進貨單', code: 'SI' },
      { id: 'purchase_returns', label: '進貨退出', code: 'PRTN' },
      { id: 'vendor_payments', label: '付款單', code: 'VP' },
    ],
  },
  {
    title: 'ERP 銷售出貨',
    tabs: [
      { id: 'inquiries', label: '詢價單', code: 'INQ' },
      { id: 'quotes', label: '報價單', code: 'QUOT' },
      { id: 'orders', label: '訂單', code: 'ORDR' },
      { id: 'sales_documents', label: '銷貨單', code: 'SALE' },
      { id: 'shipments', label: '出貨管理', code: 'SHIP' },
      { id: 'returns', label: '退貨管理', code: 'RTN' },
      { id: 'payments', label: '收款管理', code: 'PAY' },
      { id: 'promotions', label: '活動管理', code: 'PRMO' },
      { id: 'pricing', label: '報價規則', code: 'PRCE' },
    ],
  },
  {
    title: 'ERP 倉儲管理',
    tabs: [
      { id: 'inventory', label: '庫存總覽', code: 'INVT' },
      { id: 'stock_alerts', label: '庫存警示', code: 'ALRT' },
      { id: 'reorder', label: '補貨建議', code: 'REOD' },
      { id: 'stocktake', label: '盤點作業', code: 'STTK' },
      { id: 'stock_adjustments', label: '調整單', code: 'ADJ' },
    ],
  },
  {
    title: 'ERP 分析報表',
    tabs: [
      { id: 'psi_report', label: '進銷存報表', code: 'PSI' },
      { id: 'financial_report', label: '財務報表', code: 'FIN' },
      { id: 'sales_returns', label: '銷退貨彙總', code: 'RETN' },
      { id: 'profit_analysis', label: '利潤分析', code: 'PFT' },
      { id: 'imports', label: '資料匯入', code: 'IMPT' },
    ],
  },
  {
    title: 'CRM 客戶管線',
    accent: '#ec4899',
    tabs: [
      { id: 'crm_leads', label: '商機管線', code: 'CRM' },
    ],
  },
  {
    title: 'ERP 財務會計',
    accent: '#0d9488',
    tabs: [
      { id: 'invoices', label: '發票管理', code: 'INV' },
    ],
  },
  {
    title: 'ERP 審批簽核',
    accent: '#7c3aed',
    tabs: [
      { id: 'approvals', label: '簽核審批', code: 'APPR' },
    ],
  },
  {
    title: '客服工單',
    accent: '#0891b2',
    tabs: [
      { id: 'tickets', label: '工單管理', code: 'TCKT' },
    ],
  },
  {
    title: '經銷商入口',
    accent: '#8b5cf6',
    tabs: [
      { id: 'dealer_users', label: '帳號管理', code: 'DUSR' },
      { id: 'dealer_orders', label: '經銷商訂單', code: 'DORD' },
      { id: 'announcements', label: '公告管理', code: 'ANN' },
    ],
  },
  {
    title: 'LINE 與系統',
    accent: '#06c755',
    tabs: [
      { id: 'messages', label: 'AI 對話紀錄', code: 'MSG' },
      { id: 'ai_prompt', label: 'AI Prompt 設定', code: 'AI' },
      { id: 'chat_history', label: '歷史對話', code: 'HIST' },
    ],
  },
];

const FAV_STORAGE_KEY = 'qb_admin_favorites';
const COLLAPSED_STORAGE_KEY = 'qb_admin_collapsed';

function useFavorites() {
  const [favs, setFavs] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(FAV_STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const toggle = (tabId) => {
    setFavs((prev) => {
      const next = prev.includes(tabId) ? prev.filter((id) => id !== tabId) : [...prev, tabId];
      try { window.localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  return { favs, toggle, isFav: (id) => favs.includes(id) };
}

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) || '{}'); } catch { return {}; }
  });
  const toggle = (title) => {
    setCollapsed((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      try { window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  return { collapsed, toggle };
}

const TAB_COMPONENTS = {
  env_health: EnvHealth,
  report_center: ReportCenter,
  dashboard: Dashboard,
  customers: FormalCustomers,
  line_customers: Customers,
  quotes: Quotes,
  orders: Orders,
  sales_documents: SalesDocuments,
  messages: Messages,
  products: ProductSearch,
  imports: ImportCenter,
  vendors: Vendors,
  sales_returns: SalesReturns,
  profit_analysis: ProfitAnalysis,
  promotions: Promotions,
  pricing: PricingRules,
  inventory: Inventory,
  payments: Payments,
  shipments: Shipments,
  returns: Returns,
  inquiries: Inquiries,
  ai_prompt: AIPrompt,
  chat_history: ChatHistory,
  purchase_orders: PurchaseOrders,
  stock_in: StockIn,
  purchase_returns: PurchaseReturns,
  vendor_payments: VendorPayments,
  stocktake: Stocktake,
  stock_adjustments: StockAdjustments,
  psi_report: PSIReport,
  financial_report: FinancialReport,
  dealer_users: DealerUsers,
  dealer_orders: DealerOrders,
  announcements: Announcements,
  crm_leads: CRMLeads,
  stock_alerts: StockAlerts,
  reorder: ReorderSuggestions,
  invoices: Invoices,
  approvals: Approvals,
  tickets: Tickets,
};

export default function AdminPage() {
  const width = useViewportWidth();
  const isTablet = width < 1180;
  const isMobile = width < 820;
  const [token, setToken] = useState('');
  const [isAuthed, setIsAuthed] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState('report_center');
  const [sidebarStats, setSidebarStats] = useState(null);
  const [pendingBadges, setPendingBadges] = useState({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const { favs, toggle: toggleFav, isFav } = useFavorites();
  const { collapsed, toggle: toggleCollapsed } = useCollapsed();
  const ActiveTab = TAB_COMPONENTS[tab] || Dashboard;

  useEffect(() => {
    const saved = window.localStorage.getItem(ADMIN_TOKEN_KEY);
    if (saved) {
      setToken(saved);
      setAuthLoading(true);
      apiGet({ action: 'stats' })
        .then((data) => {
          setIsAuthed(true);
          setAuthError('');
          setSidebarStats({
            products: data?.total_messages ?? '-',
            chats: data?.total_messages ?? '-',
          });
          // 取得產品數和歷史對話數
          Promise.all([
            apiGet({ action: 'products', limit: '1' }).catch(() => null),
            apiGet({ action: 'chat_history_stats' }).catch(() => null),
          ]).then(([prodRes, chatRes]) => {
            setSidebarStats({
              products: prodRes?.total ?? '-',
              chats: chatRes?.total ?? '-',
            });
          });
        })
        .catch((error) => {
          window.localStorage.removeItem(ADMIN_TOKEN_KEY);
          setAuthError(error.message || '登入失敗，請重新輸入 Token');
        })
        .finally(() => setAuthLoading(false));
    }
  }, []);

  // Fetch pending badge counts for sidebar (all sections)
  useEffect(() => {
    if (!isAuthed) return;
    const fetchBadges = () => {
      apiGet({ action: 'pending_badges' })
        .then((res) => {
          setPendingBadges(res || {});
        })
        .catch(() => {});
    };
    fetchBadges();
    const interval = setInterval(fetchBadges, 60000);
    return () => clearInterval(interval);
  }, [isAuthed, tab]);

  const login = async () => {
    const trimmed = token.trim();
    if (!trimmed) return;
    setAuthLoading(true);
    setAuthError('');
    window.localStorage.setItem(ADMIN_TOKEN_KEY, trimmed);
    try {
      await apiGet({ action: 'stats' });
      setIsAuthed(true);
    } catch (error) {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
      setAuthError(error.message || '登入失敗，請確認 Token');
      setIsAuthed(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    setIsAuthed(false);
    setToken('');
    setAuthError('');
  };

  if (!isAuthed) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(135deg, #ecfdf5 0%, #fdfdfe 50%, #d1fae5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 440, background: '#ffffff', borderRadius: 20, padding: '36px 32px', color: '#1a1d23', boxShadow: '0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #F2F2F2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: '#009061', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, ...S.mono }}>QB</div>
            <div>
              <div style={{ color: '#1a1d23', fontSize: 18, fontWeight: 700 }}>Auto-bot QB</div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>管理後台登入</div>
            </div>
          </div>
          <div style={{ color: '#64748b', fontSize: 14, marginBottom: 20, lineHeight: 1.7 }}>請輸入管理後台 Token，進入查價、活動管理與對話監控介面。</div>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            placeholder="ADMIN_TOKEN"
            style={{ ...S.input }}
          />
          {authError && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>{authError}</div>}
          <button onClick={login} disabled={authLoading} style={{ ...S.btnPrimary, width: '100%', marginTop: 16, padding: '12px 20px', fontSize: 14, opacity: authLoading ? 0.7 : 1, cursor: authLoading ? 'wait' : 'pointer' }}>
            {authLoading ? '驗證中...' : '進入後台'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{`
        html,body{background:#fdfdfe!important;margin:0;padding:0}
        body > div:first-child{min-height:100vh;background:#fdfdfe}
        *{box-sizing:border-box}
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <style>{`
        .qb-sb-item{transition:all 0.2s ease}
        .qb-sb-item:hover{background:rgba(0,144,97,0.06)!important;backdrop-filter:blur(8px);box-shadow:0 2px 12px rgba(0,144,97,0.08), inset 0 1px 0 rgba(255,255,255,0.7);border-color:rgba(0,144,97,0.1)!important}
        .qb-sb-star{opacity:0;transition:opacity 0.15s}
        .qb-sb-item:hover .qb-sb-star{opacity:1}
        .qb-sb-star.is-fav{opacity:1;color:#f59e0b!important}
        .qb-sb-section-hdr{transition:all 0.2s ease}
        .qb-sb-section-hdr:hover{background:rgba(0,144,97,0.04);backdrop-filter:blur(8px);box-shadow:0 1px 8px rgba(0,144,97,0.06), inset 0 1px 0 rgba(255,255,255,0.6)}
        .qb-sb-search:focus{border-color:#009061!important;box-shadow:0 0 0 3px rgba(0,144,97,0.1)!important}
        .qb-sb::-webkit-scrollbar{width:3px}
        .qb-sb::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}
        .qb-sb::-webkit-scrollbar-track{background:transparent}
        input:focus,select:focus,textarea:focus{border-color:#009061!important;box-shadow:0 0 0 3px rgba(0,144,97,0.08)!important}
        .qb-card-hover:hover{background:#E8F2EE!important;border-color:#E8F2EE!important;box-shadow:0 4px 16px rgba(0,144,97,0.12), 6px 6px 16px rgba(0,0,0,0.04)!important;transform:translateY(-1px)}
        .qb-card-hover{transition:all 0.25s ease;cursor:pointer}
        .qb-content>div>div[style*="border-radius"]{transition:all 0.25s ease}
        .qb-content>div>div[style*="border-radius"]:hover{background:#E8F2EE!important;border-color:#E8F2EE!important;box-shadow:0 4px 16px rgba(0,144,97,0.12)!important;transform:translateY(-1px)}
        .qb-content table tr{transition:background 0.2s ease}
        .qb-content table tbody tr:hover{background:#E8F2EE!important}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes badgeGlow{0%,100%{box-shadow:0 0 4px rgba(239,68,68,0.3)}50%{box-shadow:0 0 12px rgba(239,68,68,0.6)}}
      `}</style>
      <div style={{ ...S.shell, flexDirection: isTablet ? 'column' : 'row' }}>
        {/* ===== SIDEBAR ===== */}
        <div className="qb-sb" style={{ ...S.sidebar, width: isTablet ? '100%' : (sidebarCollapsed ? 68 : S.sidebar.width), height: isTablet ? 'auto' : S.sidebar.height, position: isTablet ? 'relative' : S.sidebar.position, transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)', overflow: isTablet ? 'visible' : 'hidden auto' }}>
          {/* Logo + collapse toggle */}
          <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #F2F2F2', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
              <div style={{ width: 38, height: 38, minWidth: 38, borderRadius: 12, background: '#009061', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14, ...S.mono }}>QB</div>
              {!sidebarCollapsed && <div style={{ whiteSpace: 'nowrap' }}>
                <div style={{ color: '#1a1d23', fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>Auto-bot QB</div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>ERP Console</div>
              </div>}
            </div>
            {!isTablet && <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, padding: '4px 6px', borderRadius: 6, transition: 'color 0.15s' }} title={sidebarCollapsed ? '展開' : '收合'}>{sidebarCollapsed ? '\u276F' : '\u276E'}</button>}
          </div>

          {/* Search bar (only when expanded) */}
          {!sidebarCollapsed && (
            <div style={{ padding: '4px 14px 10px' }}>
              <input
                className="qb-sb-search"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="搜尋功能..."
                style={{ width: '100%', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px', color: '#1a1d23', fontSize: 13, outline: 'none', fontFamily: "'Noto Sans TC', sans-serif", transition: 'border-color 0.2s, box-shadow 0.2s' }}
              />
            </div>
          )}

          {/* Favorites section */}
          {!sidebarCollapsed && favs.length > 0 && !sidebarSearch && (
            <div>
              <div style={{ padding: '10px 16px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#f59e0b' }}>{'\u2605'}</span>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: 0.5 }}>我的最愛</span>
              </div>
              {SECTIONS.flatMap((s) => s.tabs).filter((t) => favs.includes(t.id)).map((t) => (
                <div key={`fav-${t.id}`} className="qb-sb-item" onClick={() => setTab(t.id)} style={{ padding: '8px 16px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, color: tab === t.id ? '#009061' : '#475569', background: tab === t.id ? '#ecfdf5' : 'transparent', borderRadius: 8, margin: '1px 8px', transition: 'all 0.15s', fontWeight: tab === t.id ? 600 : 400 }}>
                  <span style={{ fontSize: 9, color: tab === t.id ? '#009061' : '#94a3b8', ...S.mono, width: 34, flexShrink: 0 }}>{t.code}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                </div>
              ))}
              <div style={{ height: 1, background: '#E8F2EE', margin: '8px 16px' }} />
            </div>
          )}

          {/* Main sections */}
          {(() => {
            const sq = sidebarSearch.trim().toLowerCase();
            const filteredSections = sq
              ? SECTIONS.map((s) => ({ ...s, tabs: s.tabs.filter((t) => t.label.toLowerCase().includes(sq) || t.code.toLowerCase().includes(sq)) })).filter((s) => s.tabs.length > 0)
              : SECTIONS;
            return filteredSections.map((section, si) => {
              const isCollapsed = !sq && collapsed[section.title];
              const sectionIcon = SECTION_ICONS[section.title] || '\u25CB';
              const hasActiveTab = section.tabs.some((t) => t.id === tab);
              return (
                <div key={section.title}>
                  <div
                    className="qb-sb-section-hdr"
                    onClick={() => !sidebarCollapsed && toggleCollapsed(section.title)}
                    style={{ padding: sidebarCollapsed ? '10px 0' : '10px 16px 8px 12px', borderTop: 'none', marginTop: si > 0 ? 4 : 0, cursor: sidebarCollapsed ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, transition: 'background 0.12s', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', margin: sidebarCollapsed ? 0 : '0 4px', background: hasActiveTab ? '#f8fafc' : 'transparent' }}
                  >
                    <span style={{ fontSize: 15, color: hasActiveTab ? (section.accent || '#009061') : '#94a3b8', transition: 'color 0.2s', minWidth: sidebarCollapsed ? 'auto' : 18, textAlign: 'center' }}>{sectionIcon}</span>
                    {!sidebarCollapsed && <>
                      <span style={{ fontSize: 14, color: hasActiveTab ? '#1a1d23' : '#64748b', fontWeight: 600, letterSpacing: 0.1, flex: 1 }}>{section.title}</span>
                      {(() => { if (!isCollapsed) return null; const sectionBadge = section.tabs.reduce((s, t) => s + (pendingBadges[t.id] || 0), 0); return sectionBadge > 0 ? <span style={{ background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 999, minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', animation: 'pulse 2s infinite' }}>{sectionBadge}</span> : null; })()}
                      <span style={{ fontSize: 10, color: '#cbd5e1', transition: 'transform 0.2s', display: 'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', width: 20, textAlign: 'center', flexShrink: 0 }}>{'\u25BE'}</span>
                    </>}
                  </div>
                  {!sidebarCollapsed && !isCollapsed && (
                    <div style={{ display: isTablet ? 'grid' : 'block', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', padding: '0 8px' }}>
                      {section.tabs.map((t) => {
                        const isActive = tab === t.id;
                        return (
                        <div
                          key={t.id}
                          className="qb-sb-item"
                          onClick={() => setTab(t.id)}
                          style={{ padding: '9px 14px 9px 20px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, color: isActive ? '#009061' : '#475569', background: isActive ? '#ecfdf5' : 'transparent', borderRadius: 10, margin: '1px 0', transition: 'all 0.15s', fontWeight: isActive ? 600 : 400 }}
                        >
                          <span style={{ fontSize: 10, color: isActive ? '#6ee7b7' : '#cbd5e1', flexShrink: 0 }}>{'\u2514'}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                          {pendingBadges[t.id] > 0 && (
                            <span style={{ background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 999, minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{pendingBadges[t.id]}</span>
                          )}
                          <span className={`qb-sb-star${isFav(t.id) ? ' is-fav' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFav(t.id); }} style={{ fontSize: 11, color: '#cbd5e1', cursor: 'pointer', width: 20, textAlign: 'center', flexShrink: 0 }} title={isFav(t.id) ? '取消最愛' : '加入最愛'}>{isFav(t.id) ? '\u2605' : '\u2606'}</span>
                        </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Collapsed mode: show icon-only for active tab */}
                  {sidebarCollapsed && section.tabs.map((t) => (
                    <div key={t.id} onClick={() => setTab(t.id)} title={t.label} style={{ padding: '8px 0', cursor: 'pointer', textAlign: 'center', color: tab === t.id ? '#009061' : '#94a3b8', background: tab === t.id ? '#ecfdf5' : 'transparent', borderRadius: 8, fontSize: 9, ...S.mono, transition: 'all 0.15s', letterSpacing: 0, position: 'relative', margin: '1px 6px' }}>{t.code}{pendingBadges[t.id] > 0 && <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />}</div>
                  ))}
                </div>
              );
            });
          })()}

          {/* System status (only expanded) */}
          {!sidebarCollapsed && (
            <div style={{ padding: '16px 16px 0', borderTop: '1px solid #F2F2F2', marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 8, letterSpacing: 0.5 }}>SYSTEM</div>
              <div style={{ background: '#fdfdfe', border: '1px solid #F2F2F2', borderRadius: 12, padding: '12px 14px', fontSize: 12, color: '#64748b', display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>產品</span><span style={{ color: '#1a1d23', fontWeight: 600, ...S.mono }}>{sidebarStats?.products?.toLocaleString?.() ?? '...'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>對話</span><span style={{ color: '#1a1d23', fontWeight: 600, ...S.mono }}>{sidebarStats?.chats?.toLocaleString?.() ?? '...'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Webhook</span><span style={{ color: '#059669', fontWeight: 600, ...S.mono }}>ON</span></div>
              </div>
            </div>
          )}
        </div>

        {/* ===== MAIN CONTENT ===== */}
        <div style={S.main}>
          <div style={S.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div>
                <div style={{ color: '#1a1d23', fontWeight: 700, fontSize: 16 }}>Auto-bot QB 管理後台</div>
                {!isMobile && <div style={{ color: '#94a3b8', fontSize: 12 }}>ERP · CRM · LINE Bot</div>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!isMobile && <div style={{ fontSize: 11, color: '#64748b', ...S.mono, background: '#f1f5f9', padding: '5px 12px', borderRadius: 8, fontWeight: 500 }}>{tab}</div>}
              <button onClick={logout} style={{ ...S.btnGhost, padding: '7px 14px', fontSize: 12, borderRadius: 8 }}>登出</button>
            </div>
          </div>

          <div className="qb-content" style={{ ...S.content, padding: isMobile ? '18px 14px 30px' : isTablet ? '22px 18px 34px' : S.content.padding }}>
            <ActiveTab setTab={setTab} />
          </div>
        </div>
      </div>
    </div>
  );
}
