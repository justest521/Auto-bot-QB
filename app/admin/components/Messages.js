'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { S } from '../shared/styles';
import { useViewportWidth, fmt, fmtP, fmtDate, fmtMs, getPresetDateRange, toDateInputValue, todayInTaipei } from '../shared/formatters';
import { apiGet, apiPost, SALES_DOCUMENT_FOCUS_KEY } from '../shared/api';
import { Loading, EmptyState, StatusBanner, PageLead, Pager, PanelHeader, CsvImportButton, ProductEditModal } from '../shared/ui';

export function Messages() {
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
