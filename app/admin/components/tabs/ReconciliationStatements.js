'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtP, exportCsv, getPresetDateRange, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';

const DEFAULT_COLUMN_WIDTHS = {
  'statement_no': 140,
  'customer_name': 150,
  'period_start': 160,
  'net_amount': 120,
  'current_balance': 120,
  'status': 100,
  'action': 90,
};

function StatCard({ code, label, value, tone }) {
  const TONE_MAP = {
    red: { bg: '#fee2e2', color: '#dc2626' },
    yellow: { bg: '#fef3c7', color: '#d97706' },
    blue: { bg: '#dbeafe', color: '#2563eb' },
    green: { bg: '#dcfce7', color: '#16a34a' },
    gray: { bg: '#f3f4f6', color: '#6b7280' },
  };
  const t = TONE_MAP[tone] || TONE_MAP.gray;
  return (
    <div style={{ ...S.card, padding: '16px', textAlign: 'center', borderTop: `3px solid ${t.color}` }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: t.color, ...S.mono }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function ReconciliationStatements() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState({ rows: [], total: 0, summary: {} });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [msg, setMsg] = useState('');
  const [detailDialog, setDetailDialog] = useState(null);
  const [generateDialog, setGenerateDialog] = useState(false);
  const [genCustomer, setGenCustomer] = useState('');
  const [genPeriodStart, setGenPeriodStart] = useState('');
  const [genPeriodEnd, setGenPeriodEnd] = useState('');
  const { gridTemplate, ResizableHeader } = useResizableColumns('reconciliation_statements', DEFAULT_COLUMN_WIDTHS);

  const STATUS_MAP = {
    draft: { label: '草稿', color: '#9ca3af' },
    sent: { label: '已寄送', color: '#3b82f6' },
    confirmed: { label: '已確認', color: '#16a34a' },
    disputed: { label: '爭議中', color: '#dc2626' },
  };

  const load = async (status = statusFilter, q = search) => {
    setLoading(true);
    try {
      const params = { action: 'reconciliation_statements', status, search: q };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await apiGet(params);
      setData(res);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const doSearch = () => load(statusFilter, search);

  const handleGenerate = async () => {
    if (!genCustomer || !genPeriodStart || !genPeriodEnd) return;
    try {
      await apiPost({
        action: 'generate_reconciliation',
        customer_id: genCustomer,
        period_start: genPeriodStart,
        period_end: genPeriodEnd
      });
      setMsg('對帳單已產生');
      setGenerateDialog(false);
      setGenCustomer('');
      setGenPeriodStart('');
      setGenPeriodEnd('');
      await load();
    } catch (e) { setMsg(e.message); }
  };

  const handleStatusChange = async (statementId, newStatus) => {
    try {
      await apiPost({ action: 'update_reconciliation_status', id: statementId, status: newStatus });
      setMsg('狀態已更新');
      setDetailDialog(null);
      await load();
    } catch (e) { setMsg(e.message); }
  };

  const handleExport = async () => {
    try {
      const params = { action: 'reconciliation_statements', status: statusFilter, limit: '9999', export: 'true', search };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const all = await apiGet(params);
      exportCsv(all.rows || [], [
        { key: 'statement_no', label: '對帳單號' },
        { key: 'customer_name', label: '客戶' },
        { key: 'period_start', label: '期間開始' },
        { key: 'period_end', label: '期間結束' },
        { key: 'status', label: '狀態' },
        { key: 'net_amount', label: '淨額' },
        { key: 'current_balance', label: '目前餘額' },
      ], `對帳單清單_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { alert('匯出失敗'); }
  };

  const s = data.summary || {};

  return (
    <div>
      <PageLead eyebrow="RECONCILIATION" title="對帳單管理" description="管理客戶對帳單產生與確認。"
        action={<button onClick={() => setGenerateDialog(true)} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnGhost) }}>產生對帳單</button>} />
      {msg && <div style={{ ...S.card, background: '#edfdf3', borderColor: '#bbf7d0', color: '#15803d', marginBottom: 10, cursor: 'pointer' }} onClick={() => setMsg('')}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 8 : 12 }}>
        <StatCard code="DRFT" label="草稿" value={s.draft_count || 0} tone="gray" />
        <StatCard code="SENT" label="已寄送" value={s.sent_count || 0} tone="blue" />
        <StatCard code="CNFD" label="已確認" value={s.confirmed_count || 0} tone="green" />
        <StatCard code="DISP" label="爭議中" value={s.disputed_count || 0} tone="red" />
      </div>

      {/* Unified filter card */}
      <div style={{ ...S.card, marginBottom: 10, padding: isMobile ? '12px 14px' : '10px 16px' }}>
        <div style={{ display: 'flex', gap: isMobile ? 6 : 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: isMobile ? '6px 12px' : '6px 14px', fontSize: isMobile ? 12 : 13, background: datePreset === key ? '#3b82f6' : '#fff', color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? '#3b82f6' : '#e5e7eb' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: isMobile ? 'calc(50% - 4px)' : 150, fontSize: 13, padding: isMobile ? '8px 10px' : '6px 10px', ...S.mono }} />
          {!isMobile && <span style={{ color: '#6b7280', fontSize: 13 }}>~</span>}
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: isMobile ? 'calc(50% - 4px)' : 150, fontSize: 13, padding: isMobile ? '8px 10px' : '6px 10px', ...S.mono }} />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); load(e.target.value, search); }} style={{ ...S.input, width: isMobile ? '100%' : 150, fontSize: 13, padding: isMobile ? '8px 10px' : '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="sent">已寄送</option>
            <option value="confirmed">已確認</option>
            <option value="disputed">爭議中</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋對帳單號、客戶..." style={{ ...S.input, flex: isMobile ? '1 1 100%' : '1 1 auto', minWidth: isMobile ? 0 : 160, fontSize: 13, padding: isMobile ? '8px 10px' : '6px 10px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: isMobile ? '8px 16px' : '6px 18px', fontSize: 13 }}>查詢</button>
          <button onClick={handleExport} style={{ ...S.btnGhost, padding: isMobile ? '8px 16px' : '6px 18px', fontSize: 13 }}>匯出 CSV</button>
        </div>
      </div>

      {loading ? <Loading /> : (data.rows || []).length === 0 ? <EmptyState text="沒有對帳單資料" /> : isMobile ? (
        <div>
          {(data.rows || []).map(stmt => {
            const st = STATUS_MAP[stmt.status] || STATUS_MAP.draft;
            return (
              <div key={stmt.id} style={{ ...S.card, padding: '12px 16px', marginBottom: 8, cursor: 'pointer' }} onClick={() => setDetailDialog(stmt)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', ...S.mono }}>{stmt.statement_no || '-'}</div>
                    <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>{stmt.customer_name || '-'}</div>
                  </div>
                  <span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: 10, padding: '3px 8px', borderRadius: 4 }}>{st.label}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12, color: '#6b7280', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #e5e7eb' }}>
                  <div><span style={{ color: '#6b7280' }}>期間</span><div style={{ fontSize: 12, fontWeight: 700, color: '#111827', ...S.mono }}>{stmt.period_start?.slice(0, 10)} ~ {stmt.period_end?.slice(0, 10)}</div></div>
                  <div><span style={{ color: '#6b7280' }}>淨額</span><div style={{ fontSize: 14, fontWeight: 700, color: '#111827', ...S.mono }}>{fmtP(stmt.net_amount)}</div></div>
                  <div><span style={{ color: '#6b7280' }}>目前餘額</span><div style={{ fontSize: 14, fontWeight: 700, color: stmt.current_balance > 0 ? '#dc2626' : '#16a34a', ...S.mono }}>{fmtP(stmt.current_balance)}</div></div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...S.card, padding: 0, overflow: 'auto', border: '1px solid #d1d5db' }}>
          <ResizableHeader headers={[
            { label: '對帳單號', align: 'left' },
            { label: '客戶', align: 'left' },
            { label: '期間', align: 'left' },
            { label: '淨額', align: 'right' },
            { label: '目前餘額', align: 'right' },
            { label: '狀態', align: 'center' },
            { label: '操作', align: 'center' },
          ]} />
          {(data.rows || []).map((stmt, idx) => {
            const st = STATUS_MAP[stmt.status] || STATUS_MAP.draft;
            const cell = { padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' };
            const cCenter = { ...cell, justifyContent: 'center' };
            const cRight = { ...cell, justifyContent: 'flex-end' };
            const cellLast = { ...cell, borderRight: 'none', justifyContent: 'center' };
            return (
              <div
                key={stmt.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: gridTemplate,
                  borderBottom: '1px solid #e5e7eb',
                  background: idx % 2 === 0 ? '#fff' : '#fafbfd',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f7ff')}
                onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfd')}
                onClick={() => setDetailDialog(stmt)}
              >
                <div style={{ ...cell, fontWeight: 600, color: '#3b82f6', ...S.mono }}>
                  {stmt.statement_no || '-'}
                </div>
                <div style={cell}>
                  {stmt.customer_name || '-'}
                </div>
                <div style={{ ...cell, fontSize: 12, ...S.mono }}>
                  {stmt.period_start?.slice(0, 10)} ~ {stmt.period_end?.slice(0, 10)}
                </div>
                <div style={{ ...cRight, fontWeight: 700, ...S.mono }}>
                  {fmtP(stmt.net_amount)}
                </div>
                <div style={{ ...cRight, fontWeight: 700, color: stmt.current_balance > 0 ? '#dc2626' : '#16a34a', ...S.mono }}>
                  {fmtP(stmt.current_balance)}
                </div>
                <div style={cCenter}>
                  <span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: 10 }}>{st.label}</span>
                </div>
                <div style={cellLast}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDetailDialog(stmt); }}
                    style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 10 }}
                  >
                    詳情
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Generate Dialog */}
      {generateDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: isMobile ? '90vw' : 400, maxWidth: '90vw', borderRadius: 14, padding: isMobile ? '16px 18px' : '16px 18px 20px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>產生對帳單</h3>
            <div style={{ marginBottom: 12 }}><label style={S.label}>客戶</label><input type="text" value={genCustomer} onChange={e => setGenCustomer(e.target.value)} placeholder="選擇或搜尋客戶..." style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>期間開始</label><input type="date" value={genPeriodStart} onChange={e => setGenPeriodStart(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>期間結束</label><input type="date" value={genPeriodEnd} onChange={e => setGenPeriodEnd(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
              <button onClick={() => { setGenerateDialog(false); setGenCustomer(''); setGenPeriodStart(''); setGenPeriodEnd(''); }} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' } : S.btnGhost) }}>取消</button>
              <button onClick={handleGenerate} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnPrimary) }}>產生</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      {detailDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ ...S.card, width: isMobile ? '90vw' : 600, maxWidth: '90vw', borderRadius: 14, padding: isMobile ? '16px 18px' : '20px 24px', maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{detailDialog.statement_no}</h3>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{detailDialog.customer_name} / {detailDialog.period_start?.slice(0, 10)} ~ {detailDialog.period_end?.slice(0, 10)}</div>
              </div>
              <button onClick={() => setDetailDialog(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#9ca3af' }}>×</button>
            </div>

            {/* Header info */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>淨額</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginTop: 4, ...S.mono }}>{fmtP(detailDialog.net_amount)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>目前餘額</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: detailDialog.current_balance > 0 ? '#dc2626' : '#16a34a', marginTop: 4, ...S.mono }}>{fmtP(detailDialog.current_balance)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>狀態</div>
                <div style={{ marginTop: 4 }}><span style={{ ...S.tag(''), background: STATUS_MAP[detailDialog.status]?.color || '#9ca3af', color: '#fff', fontSize: 11, padding: '4px 10px', borderRadius: 4 }}>{STATUS_MAP[detailDialog.status]?.label || '未知'}</span></div>
              </div>
            </div>

            {/* Items table */}
            {detailDialog.items && detailDialog.items.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>對帳項目</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ background: '#f9fafb' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11 }}>類型</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11 }}>單據號</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11 }}>日期</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11 }}>說明</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: 11 }}>金額</th>
                    </tr></thead>
                    <tbody>{detailDialog.items.map((item, idx) => (
                      <tr key={idx} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '8px 10px' }}>{item.source_type || '-'}</td>
                        <td style={{ padding: '8px 10px', ...S.mono }}>{item.source_no || '-'}</td>
                        <td style={{ padding: '8px 10px', ...S.mono, fontSize: 11 }}>{item.source_date?.slice(0, 10) || '-'}</td>
                        <td style={{ padding: '8px 10px' }}>{item.description || '-'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, ...S.mono }}>{fmtP(item.amount)}</td>
                      </tr>
                    ))}</tbody>
                    <tfoot><tr style={{ background: '#f9fafb', fontWeight: 700 }}>
                      <td colSpan="4" style={{ padding: '8px 10px', textAlign: 'right' }}>小計</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', ...S.mono }}>{fmtP(detailDialog.items.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</td>
                    </tr></tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
              {detailDialog.status === 'draft' && (
                <button onClick={() => handleStatusChange(detailDialog.id, 'sent')} style={{ ...S.btnPrimary, flex: '1 1 auto', minWidth: 120 }}>寄送客戶</button>
              )}
              {detailDialog.status === 'sent' && (
                <button onClick={() => handleStatusChange(detailDialog.id, 'confirmed')} style={{ ...S.btnPrimary, flex: '1 1 auto', minWidth: 120 }}>客戶確認</button>
              )}
              {['draft', 'sent', 'confirmed'].includes(detailDialog.status) && (
                <button onClick={() => handleStatusChange(detailDialog.id, 'disputed')} style={{ ...S.btnGhost, flex: '1 1 auto', minWidth: 120, color: '#dc2626', borderColor: '#fca5a5' }}>標記爭議</button>
              )}
              <button onClick={() => setDetailDialog(null)} style={{ ...S.btnGhost, flex: '1 1 auto', minWidth: 80 }}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
