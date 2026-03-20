'use client';
import { useState, useEffect, useCallback } from 'react';
import { S } from '../shared/styles';
import { fmt, useViewportWidth } from '../shared/formatters';
import { apiGet } from '../shared/api';
import { Loading, EmptyState, PageLead, CsvImportButton } from '../shared/ui';


export function Vendors() {
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
