'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { useResponsive } from '@/lib/admin/helpers';
import { apiGet } from '@/lib/admin/api';
import { fmtDate, fmtMs, getPresetDateRange } from '@/lib/admin/helpers';
import { Loading, PageLead } from '../shared/ui';

export default function Messages() {
  const { isMobile } = useResponsive();
  const [data, setData] = useState({ messages: [], total: 0, page: 1, limit: 20 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const tableRef = useRef(null);
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  useEffect(() => {
    const handler = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        setExpanded(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const load = useCallback((page = 1, q = search) => {
    setLoading(true);
    apiGet({ action: 'messages', page: String(page), search: q, date_from: dateFrom, date_to: dateTo }).then(setData).finally(() => setLoading(false));
  }, [search, dateFrom, dateTo]);
  useEffect(() => { load(); }, []);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const doSearch = () => load(1, search);
  return (
    <div>
      <PageLead eyebrow="Messages" title="AI 對話紀錄" description="集中檢視客戶提問、AI 回覆內容與回覆速度，適合追蹤 bot 的實際對話表現。" />
      <div style={{ ...S.card, marginBottom: 10, padding: isMobile ? '8px 12px' : '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: isMobile ? '6px 12px' : '6px 14px', fontSize: t.fontSize.body, background: datePreset === key ? t.color.link : t.color.bgCard, color: datePreset === key ? '#fff' : '#4b5563', borderColor: datePreset === key ? t.color.link : t.color.border, minHeight: isMobile ? 40 : 'auto' }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: isMobile ? '100%' : 150, fontSize: t.fontSize.body, padding: isMobile ? '6px 12px' : '6px 10px', ...S.mono, minHeight: isMobile ? 40 : 'auto' }} />
          <span style={{ color: t.color.textMuted, fontSize: t.fontSize.body }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: isMobile ? '100%' : 150, fontSize: t.fontSize.body, padding: isMobile ? '6px 12px' : '6px 10px', ...S.mono, minHeight: isMobile ? 40 : 'auto' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜尋訊息內容、客戶名稱..." style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), flex: 1, minWidth: 160, fontSize: t.fontSize.body, padding: isMobile ? '6px 12px' : '6px 10px', minHeight: isMobile ? 40 : 'auto' }} />
          <button onClick={doSearch} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}), padding: isMobile ? '6px 12px' : '6px 16px', fontSize: t.fontSize.body, minHeight: isMobile ? 40 : 'auto' }}>查詢</button>
        </div>
      </div>
      <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 10, ...S.mono }}>共 {data.total} 筆紀錄</div>
      {loading ? <Loading /> : <div ref={tableRef}>{data.messages.map(msg => (
        <div key={msg.id} onClick={() => setExpanded(expanded === msg.id ? null : msg.id)} style={{ ...S.card, cursor: 'pointer', padding: isMobile ? '8px 12px' : '10px 16px', marginBottom: 10, transition: 'border-color 0.2s, transform 0.2s', borderColor: expanded === msg.id ? '#93c5fd' : t.color.border, minHeight: isMobile ? 44 : 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 8, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={S.tag('green')}>{msg.display_name || '客戶'}</span>
              <span style={{ color: t.color.textMuted, fontSize: t.fontSize.tiny, ...S.mono }}>{fmtDate(msg.created_at)}</span>
            </div>
            <span style={{ color: t.color.textMuted, fontSize: t.fontSize.tiny, ...S.mono }}>{fmtMs(msg.response_time_ms)}</span>
          </div>
          <div style={{ fontSize: t.fontSize.body, color: t.color.textPrimary, wordBreak: 'break-word' }}><span style={{ color: t.color.textMuted }}>Q: </span>{msg.user_message}</div>
          {expanded === msg.id && (
            <div style={{ background: t.color.infoBg, border: `1px solid ${t.color.border}`, borderRadius: t.radius.md, padding: isMobile ? '8px 12px' : '10px 16px', marginTop: 10, fontSize: t.fontSize.caption, color: t.color.textSecondary, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              <span style={{ color: t.color.link, fontSize: t.fontSize.tiny, ...S.mono }}>AI_RESPONSE</span>
              <div style={{ marginTop: 6, color: t.color.textSecondary }}>{msg.ai_response}</div>
            </div>
          )}
        </div>
      ))}</div>}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {data.page > 1 && <button onClick={() => load(data.page - 1)} style={{ ...S.btnGhost, minHeight: isMobile ? 40 : 'auto' }}>← 上一頁</button>}
        <span style={{ color: t.color.textMuted, padding: '8px 0', fontSize: t.fontSize.caption, ...S.mono }}>P{data.page}</span>
        {data.total > data.page * data.limit && <button onClick={() => load(data.page + 1)} style={{ ...S.btnGhost, minHeight: isMobile ? 40 : 'auto' }}>下一頁 →</button>}
      </div>
    </div>
  );
}
