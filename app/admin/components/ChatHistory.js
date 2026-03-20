'use client';
import { useState, useEffect, useCallback } from 'react';
import { S } from '../shared/styles';
import { fmt, useViewportWidth } from '../shared/formatters';
import { apiGet } from '../shared/api';
import { Loading, EmptyState, PageLead } from '../shared/ui';
import { StatCard } from '../components/Dashboard';


export function ChatHistory() {
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

/* ========================================= SIDEBAR & LAYOUT ========================================= */
