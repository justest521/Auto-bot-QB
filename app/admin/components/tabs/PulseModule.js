'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard } from '../shared/ui';

// ══════════════════════════════════════════════════════
// MOREYOU PULSE — AI Sentiment Analysis Module
// ══════════════════════════════════════════════════════

const SUB_TABS = [
  { id: 'dashboard', label: '總覽', icon: '📊' },
  { id: 'posts', label: '貼文', icon: '📝' },
  { id: 'topics', label: '議題', icon: '🏷️' },
  { id: 'alerts', label: '警示', icon: '🔔' },
  { id: 'sources', label: '資料源', icon: '📡' },
  { id: 'lexicons', label: '詞庫', icon: '📚' },
  { id: 'tenants', label: '租戶', icon: '🏢' },
];

const SENTIMENT_MAP = {
  positive: { label: '正面', color: t.color.brand },
  negative: { label: '負面', color: t.color.error },
  neutral: { label: '中立', color: t.color.textMuted },
  mixed: { label: '混合', color: t.color.warning },
};

/* ── Tag component ── */
function Tag({ label, color }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: t.fontSize.badge,
      fontWeight: t.fontWeight.semibold,
      color,
      background: `${color}14`,
      border: `1px solid ${color}30`,
      borderRadius: t.radius.pill,
      padding: '2px 10px',
      whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

/* ── Modal Shell ── */
function Modal({ open, onClose, title, children, width = 520 }) {
  const { isMobile } = useResponsive();
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
      <div style={{
        position: 'relative', background: '#fff', borderRadius: isMobile ? '16px 16px 0 0' : 16,
        width: isMobile ? '100%' : width, maxHeight: '85vh', overflow: 'auto',
        padding: isMobile ? '20px 16px' : '28px 32px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        ...(isMobile ? { position: 'fixed', bottom: 0, left: 0, right: 0 } : {}),
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: t.fontSize.h1, color: t.color.textMuted, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Form Field ── */
function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textMuted, marginBottom: 4 }}>
        {label}{required && <span style={{ color: t.color.error, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

/* ── Volume Trend Bar Chart ── */
function VolumeTrendChart({ data, height = 200 }) {
  if (!data || !Array.isArray(data) || data.length === 0) return <div style={{ textAlign: 'center', color: t.color.textMuted, padding: 20 }}>無數據</div>;

  const maxValue = Math.max(...data.map(d => d.count || 0), 1);

  return (
    <div>
      <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 1, marginBottom: 12 }}>過去 30 日貼文量趨勢</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, padding: '0 2px' }}>
        {data.map((d, i) => {
          const h = maxValue > 0 ? (d.count / maxValue) * (height - 24) : 0;
          const date = new Date(d.date);
          const label = `${(date.getMonth() + 1)}-${date.getDate()}`;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
              <div style={{
                width: '70%',
                height: Math.max(h, 2),
                background: t.color.brand,
                borderRadius: '3px 3px 0 0',
                transition: 'height 0.4s ease',
                opacity: i === data.length - 1 ? 1 : 0.75,
              }} title={`${label}: ${d.count} 貼文`} />
              <div style={{ fontSize: t.fontSize.tiny, color: t.color.textDisabled, marginTop: 4, ...S.mono }}>{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Sentiment Pie Chart (simple bars) ── */
function SentimentBreakdown({ data }) {
  if (!data) return null;
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;

  return (
    <div>
      <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 1, marginBottom: 12 }}>情緒分佈</div>
      {Object.entries(SENTIMENT_MAP).map(([key, meta]) => {
        const count = data[key] || 0;
        const pct = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
        return (
          <div key={key} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.medium, color: meta.color }}>{meta.label}</span>
              <span style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, ...S.mono }}>{count} ({pct}%)</span>
            </div>
            <div style={{ height: 6, background: t.color.bgMuted, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: meta.color, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Dashboard Tab ── */
function DashboardTab() {
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, trendRes] = await Promise.all([
        apiGet({ action: 'pulse_dashboard' }),
        apiGet({ action: 'pulse_volume_trend' }),
      ]);
      setData({ dashboard: dashRes, trend: Array.isArray(trendRes) ? trendRes : [] });
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <Loading />;

  const d = data?.dashboard || {};
  const trend = data?.trend || [];

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 12, marginBottom: 20 }}>
        {[
          { label: '總貼文數', value: d.total_posts || 0, color: t.color.brand },
          { label: '正面比例', value: `${d.positive_pct || 0}%`, color: t.color.brand },
          { label: '負面比例', value: `${d.negative_pct || 0}%`, color: t.color.error },
          { label: '議題數', value: d.topic_count || 0, color: t.color.link },
        ].map((c, i) => (
          <div key={i} style={{ ...S.card, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c.color }} />
            <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, color: t.color.textMuted, letterSpacing: 0.8, marginBottom: 8, marginTop: 2 }}>{c.label}</div>
            <div style={{ fontSize: isMobile ? t.fontSize.h2 : 24, fontWeight: t.fontWeight.bold, color: c.color, ...S.mono }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ ...S.card }}>
          <VolumeTrendChart data={trend} />
        </div>
        <div style={{ ...S.card }}>
          <SentimentBreakdown data={d.sentiment_breakdown} />
        </div>
      </div>

      {/* Source Distribution */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 12 }}>資料源分佈</div>
        {d.sources && Object.entries(d.sources).map(([source, count]) => {
          const total = Object.values(d.sources).reduce((a, b) => a + b, 0) || 1;
          const pct = ((count / total) * 100).toFixed(0);
          return (
            <div key={source} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.medium, color: t.color.textSecondary }}>{source}</span>
                <span style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, ...S.mono }}>{count} ({pct}%)</span>
              </div>
              <div style={{ height: 6, background: t.color.bgMuted, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: t.color.link, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Alerts */}
      <div style={{ ...S.card }}>
        <div style={{ fontSize: t.fontSize.h3, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 12 }}>最近警示</div>
        {Array.isArray(d.recent_alerts) && d.recent_alerts.length > 0 ? (
          <div>
            {d.recent_alerts.slice(0, 5).map((alert, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < d.recent_alerts.length - 1 ? `1px solid ${t.color.borderLight}` : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary }}>{alert.title}</div>
                  <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginTop: 2 }}>{fmtDate(alert.created_at, 'YYYY-MM-DD HH:mm')}</div>
                </div>
                <Tag label={alert.type} color={alert.type === 'critical' ? t.color.error : alert.type === 'warning' ? t.color.warning : t.color.info} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: t.color.textMuted, padding: 20, fontSize: t.fontSize.caption }}>暫無警示</div>
        )}
      </div>
    </div>
  );
}

/* ── Posts Tab ── */
function PostsTab() {
  const { isMobile, isTablet } = useResponsive();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedPost, setSelectedPost] = useState(null);
  const [page, setPage] = useState(1);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet({
        action: 'pulse_posts',
        search,
        sentiment: sentimentFilter,
        source: sourceFilter,
        date_from: dateFrom,
        date_to: dateTo,
        page,
        limit: 20,
      });
      setPosts(res.posts || []);
    } catch (e) {
      console.error('Posts load error:', e);
    } finally {
      setLoading(false);
    }
  }, [search, sentimentFilter, sourceFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  return (
    <div>
      {/* Filters */}
      <div style={{ ...S.card, marginBottom: 16, padding: '12px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
          <input type="text" placeholder="搜尋內容..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ ...S.input, fontSize: t.fontSize.caption, padding: '6px 10px' }} />
          <select value={sentimentFilter} onChange={(e) => { setSentimentFilter(e.target.value); setPage(1); }} style={{ ...S.input, fontSize: t.fontSize.caption, padding: '6px 10px' }}>
            <option value="">全部情緒</option>
            {Object.entries(SENTIMENT_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }} style={{ ...S.input, fontSize: t.fontSize.caption, padding: '6px 10px' }}>
            <option value="">全部資料源</option>
            <option value="twitter">Twitter</option>
            <option value="facebook">Facebook</option>
            <option value="line">LINE</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 10 }}>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} style={{ ...S.input, fontSize: t.fontSize.caption, padding: '6px 10px' }} />
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} style={{ ...S.input, fontSize: t.fontSize.caption, padding: '6px 10px' }} />
          <button onClick={() => { setSearch(''); setSentimentFilter(''); setSourceFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }} style={{ ...S.btnGhost, fontSize: t.fontSize.caption, padding: '6px 10px' }}>清除篩選</button>
        </div>
      </div>

      {/* Posts List */}
      {loading ? <Loading /> : posts.length === 0 ? <EmptyState title="無貼文" description="符合條件的貼文未找到" /> : (
        <>
          {posts.map((post, i) => (
            <div key={post.id} onClick={() => setSelectedPost(post)} style={{ ...S.card, cursor: 'pointer', marginBottom: 10, transition: 'all 0.2s', ':hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.1)' } }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.content || post.title}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {(() => { const s = Array.isArray(post.sentiment) ? post.sentiment[0]?.sentiment : post.sentiment; return <Tag label={SENTIMENT_MAP[s]?.label || '未分類'} color={SENTIMENT_MAP[s]?.color || t.color.textMuted} />; })()}
                    <span style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>{post.source_type || post.source}</span>
                    <span style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>{fmtDate(post.created_at)}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, ...S.mono }}>{Array.isArray(post.sentiment) ? post.sentiment[0]?.confidence_score || '-' : post.engagement_score || '-'}</div>
                </div>
              </div>
            </div>
          ))}
          <Pager currentPage={page} onPageChange={setPage} />
        </>
      )}

      {/* Detail Modal */}
      <Modal open={!!selectedPost} onClose={() => setSelectedPost(null)} title="貼文詳情">
        {selectedPost && (
          <div>
            <Field label="內容">
              <div style={{ ...S.panelMuted, padding: 12, wordBreak: 'break-word' }}>{selectedPost.content}</div>
            </Field>
            <Field label="情緒分析">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <div style={{ ...S.panelMuted, padding: 10 }}>
                  <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 4 }}>主要情緒</div>
                  <div style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: SENTIMENT_MAP[selectedPost.sentiment]?.color }}>{SENTIMENT_MAP[selectedPost.sentiment]?.label}</div>
                  <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginTop: 2 }}>信心度: {selectedPost.confidence_score}%</div>
                </div>
                <div style={{ ...S.panelMuted, padding: 10 }}>
                  <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginBottom: 4 }}>互動得分</div>
                  <div style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>{selectedPost.engagement_score}</div>
                </div>
              </div>
            </Field>
            <Field label="資料源">
              <div style={{ ...S.panelMuted, padding: 10 }}>{selectedPost.source}</div>
            </Field>
            <Field label="發佈時間">
              <div style={{ ...S.panelMuted, padding: 10 }}>{fmtDate(selectedPost.created_at, 'YYYY-MM-DD HH:mm:ss')}</div>
            </Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setSelectedPost(null)} style={{ ...S.btnGhost, flex: 1 }}>關閉</button>
              <button style={{ ...S.btnPrimary, flex: 1 }}>編輯標籤</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ── Topics Tab ── */
function TopicsTab() {
  const { isMobile, isTablet } = useResponsive();
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTopic, setEditingTopic] = useState(null);
  const [formData, setFormData] = useState({ keyword: '', aliases: '', category: '' });

  const loadTopics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'pulse_topics' });
      setTopics(res.topics || []);
    } catch (e) {
      console.error('Topics load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  const handleSave = async () => {
    try {
      await apiPost({
        action: 'pulse_upsert_topic',
        id: editingTopic?.id,
        keyword: formData.keyword,
        aliases: formData.aliases.split(',').map(a => a.trim()).filter(Boolean),
        category: formData.category,
      });
      setEditingTopic(null);
      setFormData({ keyword: '', aliases: '', category: '' });
      loadTopics();
    } catch (e) {
      console.error('Save topic error:', e);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => { setEditingTopic({}); setFormData({ keyword: '', aliases: '', category: '' }); }} style={{ ...S.btnPrimary }}>新增議題</button>
      </div>

      {loading ? <Loading /> : topics.length === 0 ? <EmptyState title="無議題" description="暫無議題資料" /> : (
        <>
          {topics.map((topic) => (
            <div key={topic.id} style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, marginBottom: 6 }}>{topic.keyword}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                    {Array.isArray(topic.aliases) && topic.aliases.map((alias, i) => (
                      <Tag key={i} label={alias} color={t.color.textMuted} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>{topic.category}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 120, height: 6, background: t.color.bgMuted, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${topic.trending_score || 0}%`, background: t.color.warning, transition: 'width 0.4s ease' }} />
                      </div>
                      <span style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, ...S.mono, minWidth: 30 }}>{topic.post_count}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => { setEditingTopic(topic); setFormData({ keyword: topic.keyword, aliases: topic.aliases?.join(', ') || '', category: topic.category }); }} style={{ ...S.btnGhost, fontSize: t.fontSize.caption, padding: '4px 8px' }}>編輯</button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Edit Modal */}
      <Modal open={!!editingTopic} onClose={() => setEditingTopic(null)} title={editingTopic?.id ? '編輯議題' : '新增議題'}>
        <Field label="關鍵字" required>
          <input type="text" value={formData.keyword} onChange={(e) => setFormData({ ...formData, keyword: e.target.value })} style={S.input} placeholder="如：產品缺陷" />
        </Field>
        <Field label="別名（逗號分隔）">
          <input type="text" value={formData.aliases} onChange={(e) => setFormData({ ...formData, aliases: e.target.value })} style={S.input} placeholder="如：品質問題, 瑕疵" />
        </Field>
        <Field label="分類">
          <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} style={S.input}>
            <option value="">選擇分類</option>
            <option value="product">產品</option>
            <option value="service">服務</option>
            <option value="price">價格</option>
            <option value="delivery">配送</option>
            <option value="other">其他</option>
          </select>
        </Field>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => setEditingTopic(null)} style={{ ...S.btnGhost, flex: 1 }}>取消</button>
          <button onClick={handleSave} style={{ ...S.btnPrimary, flex: 1 }}>保存</button>
        </div>
      </Modal>
    </div>
  );
}

/* ── Alerts Tab ── */
function AlertsTab() {
  const { isMobile, isTablet } = useResponsive();
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingAlert, setEditingAlert] = useState(null);
  const [formData, setFormData] = useState({ name: '', rule_type: '', threshold: '', sentiment: '', notify_channel: '' });

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const [alertsRes, historyRes] = await Promise.all([
        apiGet({ action: 'pulse_alerts' }),
        apiGet({ action: 'pulse_alert_history', limit: 10 }),
      ]);
      setAlerts(alertsRes.alerts || []);
      setHistory(historyRes.history || []);
    } catch (e) {
      console.error('Alerts load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleSave = async () => {
    try {
      await apiPost({
        action: 'pulse_upsert_alert',
        id: editingAlert?.id,
        name: formData.name,
        rule_type: formData.rule_type,
        threshold: parseInt(formData.threshold),
        sentiment: formData.sentiment,
        notify_channel: formData.notify_channel,
      });
      setEditingAlert(null);
      setFormData({ name: '', rule_type: '', threshold: '', sentiment: '', notify_channel: '' });
      loadAlerts();
    } catch (e) {
      console.error('Save alert error:', e);
    }
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
        {/* Rules */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, margin: 0 }}>警示規則</h3>
            <button onClick={() => { setEditingAlert({}); setFormData({ name: '', rule_type: '', threshold: '', sentiment: '', notify_channel: '' }); }} style={{ ...S.btnPrimary, fontSize: t.fontSize.caption, padding: '4px 12px' }}>新增</button>
          </div>
          {loading ? <Loading /> : alerts.length === 0 ? <EmptyState title="無規則" description="暫無警示規則" /> : (
            <>
              {alerts.map((alert) => (
                <div key={alert.id} style={{ ...S.card, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, marginBottom: 4 }}>{alert.name}</div>
                      <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, marginBottom: 4 }}>{alert.rule_type}: {alert.threshold}% {alert.sentiment}</div>
                      <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>通知: {alert.notify_channel}</div>
                    </div>
                    <button onClick={() => { setEditingAlert(alert); setFormData({ name: alert.name, rule_type: alert.rule_type, threshold: alert.threshold.toString(), sentiment: alert.sentiment, notify_channel: alert.notify_channel }); }} style={{ ...S.btnGhost, fontSize: t.fontSize.caption, padding: '4px 8px' }}>編輯</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* History */}
        <div>
          <h3 style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, margin: '0 0 16px' }}>警示歷史</h3>
          {history.length === 0 ? <EmptyState title="無警示" description="暫無警示記錄" /> : (
            <>
              {history.map((item, i) => (
                <div key={i} style={{ ...S.card, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, marginBottom: 2 }}>{item.title}</div>
                      <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted }}>{fmtDate(item.triggered_at, 'YYYY-MM-DD HH:mm')}</div>
                    </div>
                    <Tag label={item.severity || 'info'} color={item.severity === 'critical' ? t.color.error : item.severity === 'warning' ? t.color.warning : t.color.info} />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <Modal open={!!editingAlert} onClose={() => setEditingAlert(null)} title={editingAlert?.id ? '編輯規則' : '新增規則'}>
        <Field label="規則名稱" required>
          <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} style={S.input} placeholder="如：負面貼文激增" />
        </Field>
        <Field label="規則類型" required>
          <select value={formData.rule_type} onChange={(e) => setFormData({ ...formData, rule_type: e.target.value })} style={S.input}>
            <option value="">選擇類型</option>
            <option value="sentiment_spike">情緒突增</option>
            <option value="volume_surge">貼文激增</option>
            <option value="keyword_mention">關鍵字提及</option>
          </select>
        </Field>
        <Field label="閾值(%)" required>
          <input type="number" value={formData.threshold} onChange={(e) => setFormData({ ...formData, threshold: e.target.value })} style={S.input} placeholder="如：30" />
        </Field>
        <Field label="情緒類型">
          <select value={formData.sentiment} onChange={(e) => setFormData({ ...formData, sentiment: e.target.value })} style={S.input}>
            <option value="">全部</option>
            <option value="negative">負面</option>
            <option value="positive">正面</option>
          </select>
        </Field>
        <Field label="通知管道" required>
          <select value={formData.notify_channel} onChange={(e) => setFormData({ ...formData, notify_channel: e.target.value })} style={S.input}>
            <option value="">選擇管道</option>
            <option value="email">Email</option>
            <option value="line">LINE</option>
            <option value="slack">Slack</option>
          </select>
        </Field>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => setEditingAlert(null)} style={{ ...S.btnGhost, flex: 1 }}>取消</button>
          <button onClick={handleSave} style={{ ...S.btnPrimary, flex: 1 }}>保存</button>
        </div>
      </Modal>
    </div>
  );
}

/* ── Sources Tab ── */
function SourcesTab() {
  const { isMobile, isTablet } = useResponsive();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingSource, setEditingSource] = useState(null);
  const [formData, setFormData] = useState({ name: '', platform: '', config: '' });

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'pulse_data_sources' });
      setSources(res.sources || []);
    } catch (e) {
      console.error('Sources load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const handleSave = async () => {
    try {
      await apiPost({
        action: 'pulse_upsert_source',
        id: editingSource?.id,
        name: formData.name,
        platform: formData.platform,
        config: formData.config,
      });
      setEditingSource(null);
      setFormData({ name: '', platform: '', config: '' });
      loadSources();
    } catch (e) {
      console.error('Save source error:', e);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => { setEditingSource({}); setFormData({ name: '', platform: '', config: '' }); }} style={{ ...S.btnPrimary }}>新增資料源</button>
      </div>

      {loading ? <Loading /> : sources.length === 0 ? <EmptyState title="無資料源" description="暫無資料源配置" /> : (
        <>
          {sources.map((source) => (
            <div key={source.id} style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, marginBottom: 4 }}>{source.name}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <Tag label={source.platform} color={t.color.link} />
                    <span style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>爬取狀態: {source.crawl_status || 'idle'}</span>
                  </div>
                  <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>最後更新: {fmtDate(source.last_crawl_at, 'YYYY-MM-DD HH:mm')}</div>
                </div>
                <button onClick={() => { setEditingSource(source); setFormData({ name: source.name, platform: source.platform, config: source.config }); }} style={{ ...S.btnGhost, fontSize: t.fontSize.caption, padding: '4px 8px' }}>編輯</button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Edit Modal */}
      <Modal open={!!editingSource} onClose={() => setEditingSource(null)} title={editingSource?.id ? '編輯資料源' : '新增資料源'}>
        <Field label="來源名稱" required>
          <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} style={S.input} placeholder="如：品牌官方頻道" />
        </Field>
        <Field label="平台" required>
          <select value={formData.platform} onChange={(e) => setFormData({ ...formData, platform: e.target.value })} style={S.input}>
            <option value="">選擇平台</option>
            <option value="twitter">Twitter</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="line">LINE</option>
            <option value="web">Web</option>
          </select>
        </Field>
        <Field label="配置 (JSON)">
          <textarea value={formData.config} onChange={(e) => setFormData({ ...formData, config: e.target.value })} style={{ ...S.input, minHeight: 100, fontFamily: t.font.mono, fontSize: t.fontSize.caption }} placeholder={'{"keywords": [], "hashtags": []}'} />
        </Field>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => setEditingSource(null)} style={{ ...S.btnGhost, flex: 1 }}>取消</button>
          <button onClick={handleSave} style={{ ...S.btnPrimary, flex: 1 }}>保存</button>
        </div>
      </Modal>
    </div>
  );
}

/* ── Lexicons Tab ── */
function LexiconsTab() {
  const { isMobile, isTablet } = useResponsive();
  const [lexicons, setLexicons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLexicon, setEditingLexicon] = useState(null);
  const [formData, setFormData] = useState({ term: '', aliases: '', category: '', sentiment: '' });

  const loadLexicons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'pulse_lexicons' });
      setLexicons(res.lexicons || []);
    } catch (e) {
      console.error('Lexicons load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLexicons();
  }, [loadLexicons]);

  const handleSave = async () => {
    try {
      await apiPost({
        action: 'pulse_upsert_lexicon',
        id: editingLexicon?.id,
        term: formData.term,
        aliases: formData.aliases.split(',').map(a => a.trim()).filter(Boolean),
        category: formData.category,
        sentiment: formData.sentiment,
      });
      setEditingLexicon(null);
      setFormData({ term: '', aliases: '', category: '', sentiment: '' });
      loadLexicons();
    } catch (e) {
      console.error('Save lexicon error:', e);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('確定刪除？')) return;
    try {
      await apiPost({ action: 'pulse_delete_lexicon', id });
      loadLexicons();
    } catch (e) {
      console.error('Delete lexicon error:', e);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => { setEditingLexicon({}); setFormData({ term: '', aliases: '', category: '', sentiment: '' }); }} style={{ ...S.btnPrimary }}>新增詞彙</button>
      </div>

      {loading ? <Loading /> : lexicons.length === 0 ? <EmptyState title="無詞彙" description="暫無詞彙資料" /> : (
        <>
          {lexicons.map((lex) => (
            <div key={lex.id} style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, marginBottom: 4 }}>{lex.term}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                    <Tag label={lex.category} color={t.color.link} />
                    <Tag label={SENTIMENT_MAP[lex.sentiment]?.label || '未分類'} color={SENTIMENT_MAP[lex.sentiment]?.color || t.color.textMuted} />
                  </div>
                  {lex.aliases && lex.aliases.length > 0 && (
                    <div style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>別名: {lex.aliases.join(', ')}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => { setEditingLexicon(lex); setFormData({ term: lex.term, aliases: lex.aliases?.join(', ') || '', category: lex.category, sentiment: lex.sentiment }); }} style={{ ...S.btnGhost, fontSize: t.fontSize.caption, padding: '4px 8px' }}>編輯</button>
                  <button onClick={() => handleDelete(lex.id)} style={{ ...S.btnGhost, fontSize: t.fontSize.caption, padding: '4px 8px', color: t.color.error }}>刪除</button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Edit Modal */}
      <Modal open={!!editingLexicon} onClose={() => setEditingLexicon(null)} title={editingLexicon?.id ? '編輯詞彙' : '新增詞彙'}>
        <Field label="詞彙" required>
          <input type="text" value={formData.term} onChange={(e) => setFormData({ ...formData, term: e.target.value })} style={S.input} placeholder="如：優質" />
        </Field>
        <Field label="別名（逗號分隔）">
          <input type="text" value={formData.aliases} onChange={(e) => setFormData({ ...formData, aliases: e.target.value })} style={S.input} placeholder="如：高質, 卓越" />
        </Field>
        <Field label="分類" required>
          <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} style={S.input}>
            <option value="">選擇分類</option>
            <option value="quality">品質</option>
            <option value="delivery">配送</option>
            <option value="service">服務</option>
            <option value="price">價格</option>
            <option value="design">設計</option>
          </select>
        </Field>
        <Field label="情緒分析" required>
          <select value={formData.sentiment} onChange={(e) => setFormData({ ...formData, sentiment: e.target.value })} style={S.input}>
            <option value="">選擇情緒</option>
            <option value="positive">正面</option>
            <option value="negative">負面</option>
            <option value="neutral">中立</option>
          </select>
        </Field>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => setEditingLexicon(null)} style={{ ...S.btnGhost, flex: 1 }}>取消</button>
          <button onClick={handleSave} style={{ ...S.btnPrimary, flex: 1 }}>保存</button>
        </div>
      </Modal>
    </div>
  );
}

/* ── Tenants Tab ── */
function TenantsTab() {
  const { isMobile, isTablet } = useResponsive();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTenant, setEditingTenant] = useState(null);
  const [formData, setFormData] = useState({ name: '', plan: '', monthly_quota: '', used_quota: '' });

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet({ action: 'pulse_tenants' });
      setTenants(res.tenants || []);
    } catch (e) {
      console.error('Tenants load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const handleSave = async () => {
    try {
      await apiPost({
        action: 'pulse_upsert_tenant',
        id: editingTenant?.id,
        name: formData.name,
        plan: formData.plan,
        monthly_quota: parseInt(formData.monthly_quota),
      });
      setEditingTenant(null);
      setFormData({ name: '', plan: '', monthly_quota: '', used_quota: '' });
      loadTenants();
    } catch (e) {
      console.error('Save tenant error:', e);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => { setEditingTenant({}); setFormData({ name: '', plan: '', monthly_quota: '', used_quota: '' }); }} style={{ ...S.btnPrimary }}>新增租戶</button>
      </div>

      {loading ? <Loading /> : tenants.length === 0 ? <EmptyState title="無租戶" description="暫無租戶資料" /> : (
        <>
          {tenants.map((tenant) => {
            const usageRate = tenant.monthly_quota > 0 ? ((tenant.used_quota / tenant.monthly_quota) * 100).toFixed(0) : 0;
            return (
              <div key={tenant.id} style={{ ...S.card, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: t.color.textPrimary, marginBottom: 4 }}>{tenant.name}</div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
                      <Tag label={tenant.plan} color={tenant.plan === 'premium' ? t.color.warning : t.color.link} />
                      <span style={{ fontSize: t.fontSize.caption, color: t.color.textMuted }}>配額使用: {tenant.used_quota} / {tenant.monthly_quota}</span>
                    </div>
                    <div style={{ height: 6, background: t.color.bgMuted, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${usageRate}%`, background: usageRate > 80 ? t.color.error : usageRate > 50 ? t.color.warning : t.color.brand, transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, marginTop: 4, textAlign: 'right' }}>{usageRate}% 已使用</div>
                  </div>
                  <button onClick={() => { setEditingTenant(tenant); setFormData({ name: tenant.name, plan: tenant.plan, monthly_quota: tenant.monthly_quota.toString(), used_quota: tenant.used_quota.toString() }); }} style={{ ...S.btnGhost, fontSize: t.fontSize.caption, padding: '4px 8px' }}>編輯</button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Edit Modal */}
      <Modal open={!!editingTenant} onClose={() => setEditingTenant(null)} title={editingTenant?.id ? '編輯租戶' : '新增租戶'}>
        <Field label="租戶名稱" required>
          <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} style={S.input} placeholder="如：品牌 A" />
        </Field>
        <Field label="服務方案" required>
          <select value={formData.plan} onChange={(e) => setFormData({ ...formData, plan: e.target.value })} style={S.input}>
            <option value="">選擇方案</option>
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="premium">Premium</option>
          </select>
        </Field>
        <Field label="每月配額" required>
          <input type="number" value={formData.monthly_quota} onChange={(e) => setFormData({ ...formData, monthly_quota: e.target.value })} style={S.input} placeholder="如：100000" />
        </Field>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => setEditingTenant(null)} style={{ ...S.btnGhost, flex: 1 }}>取消</button>
          <button onClick={handleSave} style={{ ...S.btnPrimary, flex: 1 }}>保存</button>
        </div>
      </Modal>
    </div>
  );
}

/* ── Main Component ── */
export default function PulseModule() {
  const { isMobile, isTablet } = useResponsive();
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div>
      <PageLead eyebrow="MoreYou Pulse" title="AI 輿情分析" description="產業垂直 AI 輿情監測、情緒分析、趨勢追蹤。" />

      {/* Sub-tab Navigation */}
      <div style={{
        display: 'flex',
        gap: isMobile ? 6 : 12,
        marginBottom: 20,
        borderBottom: `1px solid ${t.color.border}`,
        overflowX: 'auto',
        scrollBehavior: 'smooth',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 10,
      }}>
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: t.fontSize.caption,
              fontWeight: activeTab === tab.id ? t.fontWeight.semibold : t.fontWeight.normal,
              color: activeTab === tab.id ? t.color.brand : t.color.textMuted,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === tab.id ? `2px solid ${t.color.brand}` : 'none',
              transition: 'color 0.2s, border-color 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: t.fontSize.body }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'dashboard' && <DashboardTab />}
      {activeTab === 'posts' && <PostsTab />}
      {activeTab === 'topics' && <TopicsTab />}
      {activeTab === 'alerts' && <AlertsTab />}
      {activeTab === 'sources' && <SourcesTab />}
      {activeTab === 'lexicons' && <LexiconsTab />}
      {activeTab === 'tenants' && <TenantsTab />}
    </div>
  );
}
