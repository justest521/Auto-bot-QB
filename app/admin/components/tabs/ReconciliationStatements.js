'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtP, exportCsv, getPresetDateRange, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';

const DEFAULT_COLUMN_WIDTHS = [50, 140, 150, 160, 120, 120, 100, 90];

function StatCard({ code, label, value, tone }) {
  const TONE_MAP = {
    red: { bg: t.color.errorBg, color: t.color.error },
    yellow: { bg: t.color.warningBg, color: '#d97706' },
    blue: { bg: t.color.infoBg, color: t.color.link },
    green: { bg: t.color.successBg, color: t.color.brand },
    gray: { bg: '#f3f4f6', color: t.color.textMuted },
  };
  const tone_style = TONE_MAP[tone] || TONE_MAP.gray;
  return (
    <div style={{ ...S.card, padding: '16px', textAlign: 'center', borderTop: `3px solid ${tone_style.color}` }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone_style.color, ...S.mono }}>{value}</div>
      <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginTop: 4 }}>{label}</div>
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
    draft: { label: '草稿', color: t.color.textDisabled },
    sent: { label: '已寄送', color: t.color.link },
    confirmed: { label: '已確認', color: t.color.brand },
    disputed: { label: '爭議中', color: t.color.error },
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
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: isMobile ? '6px 12px' : '6px 14px', fontSize: isMobile ? t.fontSize.caption : t.fontSize.body, background: datePreset === key ? t.color.link : t.color.bgCard, color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? t.color.link : t.color.border }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: isMobile ? 'calc(50% - 4px)' : 150, fontSize: t.fontSize.body, padding: isMobile ? '8px 10px' : '6px 10px', ...S.mono }} />
          {!isMobile && <span style={{ color: t.color.textMuted, fontSize: t.fontSize.body }}>~</span>}
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, width: isMobile ? 'calc(50% - 4px)' : 150, fontSize: t.fontSize.body, padding: isMobile ? '8px 10px' : '6px 10px', ...S.mono }} />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); load(e.target.value, search); }} style={{ ...S.input, width: isMobile ? '100%' : 150, fontSize: t.fontSize.body, padding: isMobile ? '8px 10px' : '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="sent">已寄送</option>
            <option value="confirmed">已確認</option>
            <option value="disputed">爭議中</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋對帳單號、客戶..." style={{ ...S.input, flex: isMobile ? '1 1 100%' : '1 1 auto', minWidth: isMobile ? 0 : 160, fontSize: t.fontSize.body, padding: isMobile ? '8px 10px' : '6px 10px' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, padding: isMobile ? '8px 16px' : '6px 18px', fontSize: t.fontSize.body }}>查詢</button>
          <button onClick={handleExport} style={{ ...S.btnGhost, padding: isMobile ? '8px 16px' : '6px 18px', fontSize: t.fontSize.body }}>匯出 CSV</button>
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
                    <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>{stmt.statement_no || '-'}</div>
                    <div style={{ fontSize: t.fontSize.caption, color: t.color.textSecondary, marginTop: 4 }}>{stmt.customer_name || '-'}</div>
                  </div>
                  <span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: t.fontSize.tiny, padding: '3px 8px', borderRadius: t.radius.sm }}>{st.label}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: t.fontSize.caption, color: t.color.textMuted, marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${t.color.border}` }}>
                  <div><span style={{ color: t.color.textMuted }}>期間</span><div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, ...S.mono }}>{stmt.period_start?.slice(0, 10)} ~ {stmt.period_end?.slice(0, 10)}</div></div>
                  <div><span style={{ color: t.color.textMuted }}>淨額</span><div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, ...S.mono }}>{fmtP(stmt.net_amount)}</div></div>
                  <div><span style={{ color: t.color.textMuted }}>目前餘額</span><div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: stmt.current_balance > 0 ? t.color.error : t.color.brand, ...S.mono }}>{fmtP(stmt.current_balance)}</div></div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...S.card, padding: 0, overflow: 'auto', border: `1px solid ${t.color.border}` }}>
          <ResizableHeader headers={[
            { label: '序', align: 'center' },
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
            const cell = { padding: '8px 10px', borderRight: `1px solid ${t.color.border}`, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' };
            const cCenter = { ...cell, justifyContent: 'center' };
            const cRight = { ...cell, justifyContent: 'flex-end' };
            const cellLast = { ...cell, borderRight: 'none', justifyContent: 'center' };
            return (
              <div
                key={stmt.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: gridTemplate,
                  borderBottom: `1px solid ${t.color.border}`,
                  background: idx % 2 === 0 ? t.color.bgCard : '#fafbfd',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f7ff')}
                onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? t.color.bgCard : '#fafbfd')}
                onClick={() => setDetailDialog(stmt)}
              >
                <div style={{ ...cCenter, fontSize: t.fontSize.body, color: t.color.textMuted, ...S.mono }}>{idx + 1}</div>
                <div style={{ ...cell, fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: t.color.link, ...S.mono }}>
                  {stmt.statement_no || '-'}
                </div>
                <div style={{ ...cell, fontSize: t.fontSize.body }}>
                  <span style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, fontWeight: t.fontWeight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stmt.customer_name || '-'}</span>
                </div>
                <div style={{ ...cell, fontSize: t.fontSize.body, ...S.mono }}>
                  {stmt.period_start?.slice(0, 10)} ~ {stmt.period_end?.slice(0, 10)}
                </div>
                <div style={{ ...cRight, fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, ...S.mono }}>
                  {fmtP(stmt.net_amount)}
                </div>
                <div style={{ ...cRight, fontSize: t.fontSize.body, fontWeight: t.fontWeight.bold, color: stmt.current_balance > 0 ? t.color.error : t.color.brand, ...S.mono }}>
                  {fmtP(stmt.current_balance)}
                </div>
                <div style={cCenter}>
                  <span style={{ ...S.tag(''), background: st.color, color: '#fff', fontSize: t.fontSize.tiny }}>{st.label}</span>
                </div>
                <div style={cellLast}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDetailDialog(stmt); }}
                    style={{ ...S.btnGhost, padding: '3px 10px', fontSize: t.fontSize.tiny }}
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
        <div style={{ ...p.modalOverlay }}>
          <div style={{ ...p.modalBody(isMobile ? 'sm' : 'md'), width: isMobile ? '90vw' : 400, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: t.fontSize.h2 }}>產生對帳單</h3>
            <div style={{ marginBottom: 12 }}><label style={S.label}>客戶</label><input type="text" value={genCustomer} onChange={e => setGenCustomer(e.target.value)} placeholder="選擇或搜尋客戶..." style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>期間開始</label><input type="date" value={genPeriodStart} onChange={e => setGenPeriodStart(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} /></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>期間結束</label><input type="date" value={genPeriodEnd} onChange={e => setGenPeriodEnd(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), ...S.mono }} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
              <button onClick={() => { setGenerateDialog(false); setGenCustomer(''); setGenPeriodStart(''); setGenPeriodEnd(''); }} style={{ ...(isMobile ? { ...S.mobile.btnPrimary, background: '#f3f4f6', color: t.color.textMuted, border: `1px solid ${t.color.border}` } : S.btnGhost) }}>取消</button>
              <button onClick={handleGenerate} style={{ ...(isMobile ? S.mobile.btnPrimary : S.btnPrimary) }}>產生</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      {detailDialog && (
        <div style={{ ...p.modalOverlay, padding: '16px' }}>
          <div style={{ ...p.modalBody(isMobile ? 'sm' : 'lg'), width: isMobile ? '90vw' : 600, maxWidth: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold }}>{detailDialog.statement_no}</h3>
                <div style={{ fontSize: t.fontSize.body, color: t.color.textMuted, marginTop: 4 }}>{detailDialog.customer_name} / {detailDialog.period_start?.slice(0, 10)} ~ {detailDialog.period_end?.slice(0, 10)}</div>
              </div>
              <button onClick={() => setDetailDialog(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: t.color.textDisabled }}>×</button>
            </div>

            {/* Header info */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${t.color.border}` }}>
              <div>
                <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, textTransform: 'uppercase' }}>淨額</div>
                <div style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginTop: 4, ...S.mono }}>{fmtP(detailDialog.net_amount)}</div>
              </div>
              <div>
                <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, textTransform: 'uppercase' }}>目前餘額</div>
                <div style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: detailDialog.current_balance > 0 ? t.color.error : t.color.brand, marginTop: 4, ...S.mono }}>{fmtP(detailDialog.current_balance)}</div>
              </div>
              <div>
                <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, textTransform: 'uppercase' }}>狀態</div>
                <div style={{ marginTop: 4 }}><span style={{ ...S.tag(''), background: STATUS_MAP[detailDialog.status]?.color || t.color.textDisabled, color: '#fff', fontSize: t.fontSize.tiny, padding: '4px 10px', borderRadius: t.radius.sm }}>{STATUS_MAP[detailDialog.status]?.label || '未知'}</span></div>
              </div>
            </div>

            {/* Items table */}
            {detailDialog.items && detailDialog.items.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold }}>對帳項目</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.fontSize.caption }}>
                    <thead><tr style={{ background: t.color.bgMuted }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: t.color.textMuted, fontWeight: t.fontWeight.semibold, fontSize: t.fontSize.tiny }}>類型</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: t.color.textMuted, fontWeight: t.fontWeight.semibold, fontSize: t.fontSize.tiny }}>單據號</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: t.color.textMuted, fontWeight: t.fontWeight.semibold, fontSize: t.fontSize.tiny }}>日期</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: t.color.textMuted, fontWeight: t.fontWeight.semibold, fontSize: t.fontSize.tiny }}>說明</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', color: t.color.textMuted, fontWeight: t.fontWeight.semibold, fontSize: t.fontSize.tiny }}>金額</th>
                    </tr></thead>
                    <tbody>{detailDialog.items.map((item, idx) => (
                      <tr key={idx} style={{ borderTop: `1px solid ${t.color.borderLight}` }}>
                        <td style={{ padding: '8px 10px' }}>{item.source_type || '-'}</td>
                        <td style={{ padding: '8px 10px', ...S.mono }}>{item.source_no || '-'}</td>
                        <td style={{ padding: '8px 10px', ...S.mono, fontSize: t.fontSize.tiny }}>{item.source_date?.slice(0, 10) || '-'}</td>
                        <td style={{ padding: '8px 10px' }}>{item.description || '-'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: t.fontWeight.bold, ...S.mono }}>{fmtP(item.amount)}</td>
                      </tr>
                    ))}</tbody>
                    <tfoot><tr style={{ background: t.color.bgMuted, fontWeight: t.fontWeight.bold }}>
                      <td colSpan="4" style={{ padding: '8px 10px', textAlign: 'right' }}>小計</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', ...S.mono }}>{fmtP(detailDialog.items.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</td>
                    </tr></tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, paddingTop: 16, borderTop: `1px solid ${t.color.border}` }}>
              {detailDialog.status === 'draft' && (
                <button onClick={() => handleStatusChange(detailDialog.id, 'sent')} style={{ ...S.btnPrimary, flex: '1 1 auto', minWidth: 120 }}>寄送客戶</button>
              )}
              {detailDialog.status === 'sent' && (
                <button onClick={() => handleStatusChange(detailDialog.id, 'confirmed')} style={{ ...S.btnPrimary, flex: '1 1 auto', minWidth: 120 }}>客戶確認</button>
              )}
              {['draft', 'sent', 'confirmed'].includes(detailDialog.status) && (
                <button onClick={() => handleStatusChange(detailDialog.id, 'disputed')} style={{ ...S.btnGhost, flex: '1 1 auto', minWidth: 120, color: t.color.error, borderColor: '#fca5a5' }}>標記爭議</button>
              )}
              <button onClick={() => setDetailDialog(null)} style={{ ...S.btnGhost, flex: '1 1 auto', minWidth: 80 }}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
