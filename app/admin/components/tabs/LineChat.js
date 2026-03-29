'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import S from '@/lib/admin/styles';
import { useResponsive } from '@/lib/admin/helpers';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmtDate } from '@/lib/admin/helpers';
import { Loading, EmptyState } from '../shared/ui';

const LINE_GREEN = '#06c755';

export default function LineChat() {
  const { isMobile } = useResponsive();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [reply, setReply] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);
  const refreshRef = useRef(null);

  useEffect(() => {
    loadConversations();
    const onResize = () => {};
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 120);
    }
  }, [thread?.messages]);

  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current);
    if (!selected) return;
    refreshRef.current = setInterval(() => fetchThread(selected.line_user_id, true), 15000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [selected]);

  const loadConversations = async () => {
    setLoadingList(true);
    try {
      const res = await apiGet({ action: 'line_conversations' });
      setConversations(res.conversations || []);
    } catch {} finally { setLoadingList(false); }
  };

  const fetchThread = useCallback(async (lineUserId, silent = false) => {
    if (!silent) setLoadingThread(true);
    try {
      const res = await apiGet({ action: 'line_thread', line_user_id: lineUserId });
      setThread(res);
    } catch {} finally { setLoadingThread(false); }
  }, []);

  const handleSelect = (conv) => {
    setSelected(conv);
    setThread(null);
    fetchThread(conv.line_user_id);
  };

  const handleSend = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    try {
      await apiPost({ action: 'line_push_message', line_user_id: selected.line_user_id, message: reply });
      setReply('');
      await fetchThread(selected.line_user_id);
    } catch (e) { alert(e.message || '發送失敗'); }
    finally { setSending(false); }
  };

  const filtered = conversations.filter(c => c.display_name?.toLowerCase().includes(searchQ.toLowerCase()));

  const showList = !isMobile || !selected;
  const showChat = !isMobile || !!selected;

  const fmtTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (isToday) return time;
    if (isYesterday) return `昨天 ${time}`;
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${time}`;
  };

  const fmtDayLabel = (ts) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return '今天';
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return '昨天';
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', height: isMobile ? 'calc(100vh - 52px)' : 'calc(100vh - 52px)', background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', flexDirection: isMobile ? 'column' : 'row' }}>

      {/* ===== Left: Conversation List ===== */}
      {showList && (
        <div style={{ width: isMobile ? '100%' : 320, borderRight: isMobile ? 'none' : '1px solid #e5e7eb', borderBottom: isMobile && selected ? '1px solid #e5e7eb' : 'none', display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: 0, maxHeight: isMobile ? 'auto' : '100%' }}>
          <div style={{ padding: isMobile ? '10px 12px 8px' : '14px 16px 10px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: LINE_GREEN }}></div>
              <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: '#111827' }}>LINE 聊天</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>{conversations.length} 位</div>
            </div>
            <input
              value={searchQ} onChange={e => setSearchQ(e.target.value)}
              placeholder="搜尋用戶名稱..."
              style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: '100%', fontSize: 13, padding: isMobile ? '8px 12px' : '8px 12px', minHeight: isMobile ? 40 : 'auto' }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', maxHeight: isMobile ? '300px' : 'auto' }}>
            {loadingList ? <div style={{ padding: 30, textAlign: 'center' }}><Loading /></div> :
              filtered.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>沒有對話</div> :
              filtered.map(conv => {
                const isActive = selected?.line_user_id === conv.line_user_id;
                return (
                  <div key={conv.line_user_id} onClick={() => handleSelect(conv)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '8px 12px' : '10px 16px', cursor: 'pointer',
                      borderLeft: `3px solid ${isActive ? LINE_GREEN : 'transparent'}`,
                      background: isActive ? '#f0fdf4' : 'transparent',
                      transition: 'background 0.15s',
                      minHeight: isMobile ? 56 : 'auto',
                    }}
                    onMouseEnter={e => { if (!isActive && !isMobile) e.currentTarget.style.background = '#f9fafb'; }}
                    onMouseLeave={e => { if (!isActive && !isMobile) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ width: isMobile ? 36 : 42, height: isMobile ? 36 : 42, borderRadius: '50%', background: LINE_GREEN, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 15 : 17, fontWeight: 700, flexShrink: 0 }}>
                      {(conv.display_name || '?')[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.display_name}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0, marginLeft: 8, ...S.mono }}>{fmtTime(conv.last_at)}</div>
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.last_message?.substring(0, 40) || '...'}
                      </div>
                    </div>
                    <div style={{ background: LINE_GREEN, color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {conv.message_count}
                    </div>
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      {/* ===== Right: Chat Thread ===== */}
      {showChat && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fafbfc', minWidth: 0, height: isMobile && selected ? 'calc(100vh - 52px - 100px)' : 'auto' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, padding: isMobile ? '20px' : 0 }}>
              <div style={{ fontSize: 48, opacity: 0.15 }}>💬</div>
              <div style={{ fontSize: 15, color: '#9ca3af', textAlign: 'center' }}>{isMobile ? '選擇對話開始' : '點選左側用戶開始聊天'}</div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '8px 12px' : '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0, minHeight: isMobile ? 56 : 'auto' }}>
                {isMobile && (
                  <button onClick={() => setSelected(null)} style={{ ...S.btnGhost, padding: '6px 10px', fontSize: 13, minHeight: 36 }}>← 返回</button>
                )}
                <div style={{ width: isMobile ? 32 : 36, height: isMobile ? 32 : 36, borderRadius: '50%', background: LINE_GREEN, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 13 : 15, fontWeight: 700, flexShrink: 0 }}>
                  {(selected.display_name || '?')[0]}
                </div>
                <div>
                  <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 700, color: '#111827' }}>{selected.display_name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', ...S.mono }}>{thread?.total || selected.message_count} 則訊息</div>
                </div>
              </div>

              {/* Messages Area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '8px 12px' : '10px 16px', display: 'flex', flexDirection: 'column' }}>
                {loadingThread ? <div style={{ textAlign: 'center', padding: 40 }}><Loading /></div> :
                  (!thread?.messages || thread.messages.length === 0) ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>尚無訊息</div>
                  ) : (
                    <>
                      {thread.messages.map((msg, idx) => {
                        const prevMsg = thread.messages[idx - 1];
                        const showDay = idx === 0 || new Date(msg.created_at).toDateString() !== new Date(prevMsg?.created_at).toDateString();
                        const time = new Date(msg.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

                        return (
                          <div key={msg.id}>
                            {/* Day divider */}
                            {showDay && (
                              <div style={{ textAlign: 'center', margin: '16px 0 12px', position: 'relative' }}>
                                <span style={{ background: '#fafbfc', padding: '0 12px', fontSize: 11, color: '#9ca3af', position: 'relative', zIndex: 1 }}>
                                  {fmtDayLabel(msg.created_at)}
                                </span>
                                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: '#e5e7eb', zIndex: 0 }}></div>
                              </div>
                            )}

                            {/* Customer message (right side, blue) */}
                            {msg.user_message && (
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                                <div style={{ maxWidth: isMobile ? '85%' : '75%' }}>
                                  <div style={{ background: '#dbeafe', color: '#1e3a5f', padding: isMobile ? '8px 12px' : '10px 14px', borderRadius: '16px 16px 4px 16px', fontSize: isMobile ? 13 : 14, lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap', minHeight: isMobile ? 36 : 'auto' }}>
                                    {msg.user_message}
                                  </div>
                                  <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'right', marginTop: 3, ...S.mono }}>{time}</div>
                                </div>
                              </div>
                            )}

                            {/* AI / Admin response (left side) */}
                            {msg.ai_response && (
                              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 6 }}>
                                <div style={{ maxWidth: isMobile ? '85%' : '75%' }}>
                                  <div style={{
                                    background: msg.message_type === 'admin_push' ? '#dcfce7' : '#f3f4f6',
                                    color: msg.message_type === 'admin_push' ? '#166534' : '#374151',
                                    padding: isMobile ? '8px 12px' : '10px 14px', borderRadius: '16px 16px 16px 4px',
                                    fontSize: isMobile ? 13 : 14, lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap', minHeight: isMobile ? 36 : 'auto',
                                  }}>
                                    {msg.ai_response}
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 10, color: msg.message_type === 'admin_push' ? LINE_GREEN : '#9ca3af', fontWeight: msg.message_type === 'admin_push' ? 600 : 400 }}>
                                      {msg.message_type === 'admin_push' ? '管理員' : 'AI'}
                                    </span>
                                    {msg.response_time_ms && <span style={{ fontSize: 10, color: '#c4c9d2', ...S.mono }}>{msg.response_time_ms}ms</span>}
                                    <span style={{ fontSize: 10, color: '#c4c9d2', ...S.mono }}>{time}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div ref={chatEndRef} />
                    </>
                  )
                }
              </div>

              {/* Reply Input */}
              <div style={{ padding: isMobile ? '8px 12px' : '10px 16px', borderTop: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: isMobile ? 'flex-end' : 'center' }}>
                  <input
                    value={reply} onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="輸入訊息，Enter 發送..."
                    disabled={sending}
                    style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), flex: 1, fontSize: 14, padding: isMobile ? '8px 12px' : '8px 12px', borderRadius: 20, minHeight: isMobile ? 40 : 'auto' }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!reply.trim() || sending}
                    style={{
                      ...S.btnPrimary, padding: isMobile ? '8px 12px' : '8px 14px', borderRadius: 20, fontSize: isMobile ? 13 : 14,
                      background: LINE_GREEN, borderColor: LINE_GREEN, minHeight: isMobile ? 40 : 'auto',
                      opacity: !reply.trim() || sending ? 0.5 : 1,
                    }}
                  >
                    {sending ? '發...' : '發送'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
