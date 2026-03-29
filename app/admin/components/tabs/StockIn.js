'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, exportCsv, getPresetDateRange } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';
import { useViewportWidth } from '@/lib/admin/helpers';
import { StatCard } from '../shared/ui';

/* ============================================================
   明細頁
   ============================================================ */
function StockInDetailView({ id, onBack }) {
  const [si, setSi] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await apiGet({ action: 'stock_in_detail', id });
        setSi(res.stock_in || null);
        setItems(res.items || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [id]);

  const handleConfirm = async () => {
    if (!confirm('確認進貨將自動增加庫存，確定？')) return;
    try {
      await apiPost({ action: 'confirm_stock_in', stock_in_id: id });
      const res = await apiGet({ action: 'stock_in_detail', id });
      setSi(res.stock_in || null);
    } catch (e) { alert(e.message); }
  };

  const cardStyle = { ...S.card, borderRadius: 10, border: '1px solid #eaeff5' };
  const thStyle = { textAlign: 'left', padding: '8px 10px', color: '#6b7280', fontWeight: 600, fontSize: 12, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13, verticalAlign: 'top' };

  if (loading) return <Loading />;
  if (!si) return <EmptyState text="找不到此進貨單" />;

  const totalQty = items.reduce((s, i) => s + (Number(i.qty_received) || 0), 0);
  const totalAmount = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0);

  return (
    <div>
      {/* 頂部列 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 13 }}>← 返回</button>
        <div style={{ flex: 1 }}>
          <div style={S.eyebrow}>Stock In Detail</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{si.stock_in_no || '進貨單明細'}</div>
        </div>
        <span style={S.tag(si.status === 'confirmed' ? 'green' : 'default')}>
          {si.status === 'confirmed' ? '已入庫' : '待確認'}
        </span>
        {si.status === 'pending' && (
          <button onClick={handleConfirm} style={{ ...S.btnPrimary, padding: '8px 20px', fontSize: 13 }}>確認入庫</button>
        )}
      </div>

      {/* 基本資訊 */}
      <div style={{ ...cardStyle, marginBottom: 16, padding: '16px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>進貨單號</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{si.stock_in_no || '-'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>進貨日期</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDate(si.stock_in_date)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>總金額</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981', ...S.mono }}>{fmtP(si.total_amount)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>狀態</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{si.status === 'confirmed' ? '已入庫' : '待確認'}</div>
          </div>
        </div>
        {si.remark && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>備註</div>
            <div style={{ fontSize: 13, color: '#374151' }}>{si.remark}</div>
          </div>
        )}
      </div>

      {/* 品項表格 */}
      <div style={{ ...cardStyle, padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
            進貨明細 <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>{items.length} 項 / {totalQty} 件</span>
          </div>
        </div>
        {items.length === 0 ? <EmptyState text="無明細項目" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 40 }}>#</th>
                  <th style={thStyle}>料號</th>
                  <th style={thStyle}>品名</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 60 }}>單位</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: 80 }}>數量</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: 100 }}>單價</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: 120 }}>小計</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.id || idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fafbfd' }}>
                    <td style={{ ...tdStyle, color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>{idx + 1}</td>
                    <td style={tdStyle}>
                      <span style={{ ...S.mono, fontWeight: 700, color: '#2563eb' }}>{item.item_number || '-'}</span>
                    </td>
                    <td style={tdStyle}>{item.description || '-'}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>{item.unit || '-'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', ...S.mono, fontWeight: 600 }}>{fmt(item.qty_received)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', ...S.mono }}>
                      {(Number(item.unit_cost) || 0) === 0
                        ? <span style={{ fontSize: 10, color: '#a855f7', fontWeight: 700, background: '#faf5ff', padding: '2px 8px', borderRadius: 4 }}>贈品</span>
                        : fmtP(item.unit_cost)
                      }
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', ...S.mono, fontWeight: 700, color: (Number(item.unit_cost) || 0) === 0 ? '#a855f7' : '#10b981' }}>
                      {(Number(item.unit_cost) || 0) === 0 ? '$0' : fmtP(item.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 合計 */}
        {items.length > 0 && (
          <div style={{ padding: '12px 8px 4px', borderTop: '2px solid #bfdbfe', marginTop: 4, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 20 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                小計 <span style={{ ...S.mono, fontWeight: 700, color: '#111827' }}>{fmtP(totalAmount)}</span>
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>({items.length} 項 / {totalQty} 件)</span>
              </div>
            </div>
            <div style={{ borderLeft: '3px solid #16a34a', paddingLeft: 16, textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginBottom: 2 }}>進貨合計</div>
              <div style={{ ...S.mono, fontSize: 22, fontWeight: 900, color: '#15803d', letterSpacing: -0.5 }}>{fmtP(totalAmount)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   列表主頁
   ============================================================ */
export default function StockIn() {
  const width = useViewportWidth(); const isMobile = width < 820;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true); const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ vendor_id: '', po_id: '', remark: '' });
  const [items, setItems] = useState([{ item_number: '', description: '', qty_received: 1, unit_cost: 0, line_total: 0, unit: '' }]);
  const [detailId, setDetailId] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [newVendorMode, setNewVendorMode] = useState(false);
  const [newVendorForm, setNewVendorForm] = useState({ vendor_name: '', contact_name: '', phone: '', mobile: '', tax_id: '', address: '', email: '', remark: '' });
  const [creatingVendor, setCreatingVendor] = useState(false);
  const loadVendors = useCallback(() => apiGet({ action: 'vendors', search: '', limit: 200 }).then(r => setVendors(r.vendors || [])).catch(() => {}), []);
  useEffect(() => { loadVendors(); }, []);

  const resetNewVendor = () => { setNewVendorMode(false); setNewVendorForm({ vendor_name: '', contact_name: '', phone: '', mobile: '', tax_id: '', address: '', email: '', remark: '' }); };
  const createVendorInline = async () => {
    if (!newVendorForm.vendor_name.trim()) return;
    setCreatingVendor(true);
    try {
      const res = await apiPost({ action: 'create_vendor', ...newVendorForm });
      if (res.vendor?.id) {
        await loadVendors();
        setForm(p => ({ ...p, vendor_id: res.vendor.id }));
        resetNewVendor();
      }
    } catch (e) { alert(e.message); }
    setCreatingVendor(false);
  };

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const load = useCallback(async (page = 1, q = search, st = statusF, df = dateFrom, dt = dateTo) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'stock_ins', page: String(page), search: q, status: st, date_from: df, date_to: dt })); } finally { setLoading(false); }
  }, [search, statusF, dateFrom, dateTo]);
  useEffect(() => { load(); }, []);

  const updateItem = (idx, key, val) => setItems(prev => { const next = [...prev]; next[idx] = { ...next[idx], [key]: val }; if (key === 'qty_received' || key === 'unit_cost') next[idx].line_total = Number(next[idx].qty_received || 0) * Number(next[idx].unit_cost || 0); return next; });

  const handleCreate = async () => { try { await apiPost({ action: 'create_stock_in', ...form, items: items.filter(i => i.item_number) }); setCreateOpen(false); setForm({ vendor_id: '', po_id: '', remark: '' }); setItems([{ item_number: '', description: '', qty_received: 1, unit_cost: 0, line_total: 0, unit: '' }]); resetNewVendor(); load(); } catch (e) { alert(e.message); } };
  const handleConfirm = async (id, e) => { e?.stopPropagation(); if (!confirm('確認進貨將自動增加庫存，確定？')) return; try { await apiPost({ action: 'confirm_stock_in', stock_in_id: id }); load(); } catch (e) { alert(e.message); } };

  const handleExport = async () => {
    try {
      const result = await apiGet({ action: 'stock_ins', page: '1', search: search, status: statusF, date_from: dateFrom, date_to: dateTo, limit: '9999', export: 'true' });
      const rows = result.rows || [];
      const columns = [
        { key: 'stock_in_no', label: '進貨單號' },
        { key: 'po_no', label: '採購單號' },
        { key: 'vendor_name', label: '廠商名稱' },
        { key: (row) => row.status === 'confirmed' ? '已入庫' : '待確認', label: '狀態' },
        { key: (row) => fmtDate(row.stock_in_date), label: '進貨日期' },
        { key: 'remark', label: '備註' },
      ];
      exportCsv(rows, columns, `進貨_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { alert(e.message); }
  };

  // ── 明細頁 ──
  if (detailId) {
    return <StockInDetailView id={detailId} onBack={() => { setDetailId(null); load(); }} />;
  }

  const sm = data.summary || {};
  const borderR = '1px solid #e5e7eb';
  const thStyle = { textAlign: 'left', padding: '10px 12px', color: '#6b7280', fontWeight: 600, fontSize: 12, borderBottom: '2px solid #e5e7eb', borderRight: borderR, whiteSpace: 'nowrap' };
  const tdStyle = { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', borderRight: '1px solid #f3f4f6', fontSize: 13, verticalAlign: 'middle' };
  const fmtDateOnly = (d) => { if (!d) return '-'; const dt = new Date(d + (d.includes('T') ? '' : 'T00:00:00')); return `${dt.getFullYear()}/${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`; };

  return (
    <div>
      <PageLead eyebrow="Stock In" title="進貨單" description="記錄廠商進貨入庫，確認後自動增加庫存。"
        action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button>
          <button onClick={() => setCreateOpen(true)} style={S.btnPrimary}>+ 新增進貨</button>
        </div>} />
      <div style={S.statGrid}>
        <StatCard code="PEND" label="待確認" value={fmt(sm.pending)} tone="blue" accent="#f59e0b" />
        <StatCard code="CONF" label="已入庫" value={fmt(sm.confirmed)} tone="blue" accent="#16a34a" />
      </div>

      {/* 篩選列 */}
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 13, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: '#6b7280', fontSize: 13 }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px', ...S.mono }} />
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ ...S.input, width: 150, fontSize: 13, padding: '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="pending">待確認</option>
            <option value="confirmed">已入庫</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, statusF, dateFrom, dateTo)} placeholder="搜尋..." style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 13, padding: '6px 10px' }} />
          <button onClick={() => load(1, search, statusF, dateFrom, dateTo)} style={{ ...S.btnPrimary, padding: '6px 18px', fontSize: 13 }}>查詢</button>
        </div>
      </div>

      {/* 表格列表 */}
      {loading ? <Loading /> : data.rows.length === 0 ? <EmptyState text="目前沒有進貨單" /> : (
        <div style={{ ...S.card, borderRadius: 10, border: '1px solid #eaeff5', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={thStyle}>進貨單號</th>
                  <th style={thStyle}>日期</th>
                  <th style={thStyle}>廠商</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>金額</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 80 }}>狀態</th>
                  <th style={thStyle}>備註</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: 100, borderRight: 'none' }}></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, idx) => (
                  <tr key={r.id}
                    onClick={() => setDetailId(r.id)}
                    style={{ background: idx % 2 === 0 ? '#fff' : '#fafbfd', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfd'}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 700, color: '#3b82f6', ...S.mono, fontSize: 13 }}>{r.stock_in_no || '-'}</span>
                    </td>
                    <td style={{ ...tdStyle, ...S.mono, fontSize: 13 }}>{fmtDateOnly(r.stock_in_date)}</td>
                    <td style={{ ...tdStyle, fontSize: 13, color: '#374151' }}>{r.vendor_name || '-'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', ...S.mono, fontWeight: 700, fontSize: 14 }}>
                      {r.total_amount ? fmtP(r.total_amount) : <span style={{ color: '#d1d5db' }}>-</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={S.tag(r.status === 'confirmed' ? 'green' : 'default')}>
                        {r.status === 'confirmed' ? '已入庫' : '待確認'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: '#6b7280', fontSize: 13, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.remark || '-'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', borderRight: 'none' }}>
                      {r.status === 'pending' && (
                        <button onClick={(e) => handleConfirm(r.id, e)} style={{ ...S.btnPrimary, padding: '5px 12px', fontSize: 12 }}>確認入庫</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pager page={data.page} limit={data.limit} total={data.total} onPageChange={(p) => load(p, search, statusF, dateFrom, dateTo)} />

      {/* 新增 Modal */}
      {createOpen && (() => {
        const formTotal = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
        const formQty = items.reduce((s, i) => s + (Number(i.qty_received) || 0), 0);
        const validItems = items.filter(i => i.item_number?.trim());
        const modalLabel = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' };
        const modalInput = { ...S.input, fontSize: 13, padding: '8px 10px', borderRadius: 8 };
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setCreateOpen(false)}>
            <div style={{ width: 'min(680px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 24px 70px rgba(8,12,20,0.25)' }} onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>新增進貨</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>建立進貨單</div>
                  </div>
                  <button onClick={() => setCreateOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontSize: 16, color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              </div>

              {/* Form body */}
              <div style={{ padding: '16px 24px' }}>
                {/* 新增廠商展開面板 */}
                {newVendorMode && (
                  <div style={{ background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>新增廠商</div>
                      <button type="button" onClick={resetNewVendor} style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>✕ 取消</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
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
                          <input value={newVendorForm[f.key]} onChange={e => setNewVendorForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} autoFocus={f.autoFocus} style={{ ...modalInput, width: '100%', fontSize: 12, padding: '6px 8px' }} />
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
                {/* Vendor + PO */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={modalLabel}>進貨廠商</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select value={form.vendor_id} onChange={(e) => setForm(p => ({ ...p, vendor_id: e.target.value }))} style={{ ...modalInput, flex: 1 }}>
                        <option value="">不指定廠商</option>
                        {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
                      </select>
                      {!newVendorMode && <button type="button" onClick={() => setNewVendorMode(true)} title="新增廠商" style={{ padding: '6px 10px', fontSize: 16, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1 }}>+</button>}
                    </div>
                  </div>
                  <div>
                    <label style={modalLabel}>關聯採購單 <span style={{ color: '#9ca3af', fontWeight: 400 }}>(選填)</span></label>
                    <input value={form.po_id} onChange={(e) => setForm(p => ({ ...p, po_id: e.target.value }))} placeholder="PO 編號" style={{ ...modalInput, width: '100%' }} />
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={modalLabel}>備註</label>
                  <input value={form.remark} onChange={(e) => setForm(p => ({ ...p, remark: e.target.value }))} placeholder="進貨備註..." style={{ ...modalInput, width: '100%' }} />
                </div>

                {/* Items */}
                <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937' }}>
                      進貨明細
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', marginLeft: 6 }}>{validItems.length} 項 / {formQty} 件</span>
                    </div>
                    {formTotal > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', ...S.mono }}>{fmtP(formTotal)}</span>}
                  </div>
                  {/* Column headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px 60px 80px 70px 28px', gap: 6, padding: '0 4px', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>料號</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>品名</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textAlign: 'center' }}>數量</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textAlign: 'center' }}>單位</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textAlign: 'right' }}>單價</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textAlign: 'right' }}>小計</span>
                    <span></span>
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {items.map((it, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px 60px 80px 70px 28px', gap: 6, alignItems: 'center', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 8px' }}>
                        <input value={it.item_number} onChange={(e) => updateItem(idx, 'item_number', e.target.value.toUpperCase())} style={{ ...S.input, fontSize: 12, padding: '5px 8px', ...S.mono, fontWeight: 600 }} placeholder="料號" />
                        <input value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} style={{ ...S.input, fontSize: 12, padding: '5px 8px' }} placeholder="品名" />
                        <input type="number" value={it.qty_received || ''} min={1} onChange={(e) => updateItem(idx, 'qty_received', e.target.value === '' ? '' : e.target.value)} onBlur={(e) => { if (!e.target.value) updateItem(idx, 'qty_received', 1); }} style={{ ...S.input, fontSize: 12, padding: '5px 4px', textAlign: 'center' }} />
                        <select value={it.unit || ''} onChange={(e) => updateItem(idx, 'unit', e.target.value)} style={{ ...S.input, fontSize: 11, padding: '5px 2px', textAlign: 'center', color: it.unit ? '#374151' : '#9ca3af' }}>
                          <option value="">—</option>
                          <option value="個">個</option>
                          <option value="組">組</option>
                          <option value="箱">箱</option>
                          <option value="瓶">瓶</option>
                          <option value="支">支</option>
                          <option value="條">條</option>
                          <option value="包">包</option>
                          <option value="片">片</option>
                          <option value="台">台</option>
                          <option value="套">套</option>
                          <option value="罐">罐</option>
                          <option value="盒">盒</option>
                          <option value="捲">捲</option>
                          <option value="張">張</option>
                          <option value="把">把</option>
                        </select>
                        <input type="number" value={it.unit_cost || ''} min={0} onChange={(e) => updateItem(idx, 'unit_cost', e.target.value === '' ? '' : e.target.value)} onBlur={(e) => { if (!e.target.value) updateItem(idx, 'unit_cost', 0); }} style={{ ...S.input, fontSize: 12, padding: '5px 6px', textAlign: 'right', ...S.mono }} />
                        <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'right' }}>
                          {(Number(it.unit_cost) || 0) === 0
                            ? <span style={{ fontSize: 10, color: '#a855f7', background: '#faf5ff', padding: '1px 6px', borderRadius: 4 }}>贈品</span>
                            : <span style={{ ...S.mono, color: '#059669' }}>{fmtP(it.line_total)}</span>
                          }
                        </div>
                        <button onClick={() => items.length > 1 && setItems(p => p.filter((_, i) => i !== idx))} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: items.length > 1 ? '#fee2e2' : 'transparent', color: items.length > 1 ? '#ef4444' : '#d1d5db', cursor: items.length > 1 ? 'pointer' : 'default', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setItems(p => [...p, { item_number: '', description: '', qty_received: 1, unit_cost: 0, line_total: 0, unit: '' }])} style={{ width: '100%', marginTop: 8, padding: '8px', fontSize: 12, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px dashed #93c5fd', borderRadius: 8, cursor: 'pointer' }}>+ 新增品項</button>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '14px 24px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10 }}>
                <button onClick={handleCreate} disabled={!validItems.length} style={{
                  flex: 2, padding: '12px', fontSize: 15, fontWeight: 700, color: '#fff', borderRadius: 10, border: 'none', cursor: validItems.length ? 'pointer' : 'default',
                  background: validItems.length ? '#16a34a' : '#d1d5db', boxShadow: validItems.length ? '0 2px 8px rgba(22,163,74,0.25)' : 'none', transition: 'all 0.15s',
                }}>建立進貨 ({validItems.length} 項)</button>
                <button onClick={() => setCreateOpen(false)} style={{ flex: 1, padding: '12px', fontSize: 14, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 10, cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
