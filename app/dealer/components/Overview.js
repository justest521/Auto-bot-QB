'use client';
import { useState, useEffect } from 'react';
import D from './DealerStyles';

const fmtNT = (n) => `NT$${Number(n || 0).toLocaleString()}`;

export default function Overview({ token, user, roleConfig, dealerGet, onNavigateToOrder }) {
  const [perf, setPerf] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [p, o] = await Promise.all([
          dealerGet({ action: 'my_performance', token, range: 'month' }),
          dealerGet({ action: 'my_orders', token, page: '1', limit: '5' }),
        ]);
        setPerf(p);
        setOrders(o.orders || []);
      } catch (e) { console.error('Overview load:', e); }
      finally { setLoading(false); }
    })();
  }, [token]);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? '早安' : hour < 18 ? '午安' : '晚安';
  const dateStr = `${now.getMonth() + 1} 月 ${now.getDate()} 日`;

  const unpaidCount = orders.filter(o => o.payment_status === 'unpaid' || o.payment_status === 'partial').length;
  const pendingCount = orders.filter(o => o.status === 'pending_review').length;
  const trend = perf?.monthly_trend || [];
  const maxTrend = Math.max(...trend.map(m => m.amount), 1);

  const STATUS_LABEL = { draft: '草稿', pending_review: '待審', approved: '已核准', processing: '處理中', shipped: '已出貨', delivered: '已送達', completed: '已完成', cancelled: '已取消' };
  const PAY_LABEL = { unpaid: '未收款', partial: '部分收款', paid: '已結清' };

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: i === 1 ? 32 : 80, background: D.color.muted, borderRadius: D.radius.lg, marginBottom: 12, animation: 'fadeIn 0.6s ease infinite alternate' }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 0 40px' }}>
      {/* ── Greeting ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: D.weight.bold, color: D.color.text, letterSpacing: -0.5 }}>
          {greeting}，{user?.display_name || user?.username || 'User'}
        </div>
        <div style={{ fontSize: D.size.caption, color: D.color.text3, marginTop: 4, ...D.mono }}>{dateStr}</div>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'REVENUE', title: '本月營業額', value: fmtNT(perf?.total_amount), accent: D.color.brand },
          { label: 'ORDERS', title: '訂單數', value: String(perf?.total_orders || 0), accent: D.color.info },
          { label: 'AVG PRICE', title: '平均單價', value: fmtNT(perf?.avg_order_amount), accent: D.color.brand },
          { label: 'UNPAID', title: '待收款', value: String(unpaidCount), accent: unpaidCount > 0 ? D.color.warning : D.color.textDisabled },
        ].map((kpi, idx) => (
          <div key={idx} style={{
            ...D.card,
            padding: '16px 14px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* accent top bar */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: kpi.accent, borderRadius: `${D.radius.lg}px ${D.radius.lg}px 0 0` }} />
            <div style={{ ...D.label, fontSize: 9, marginBottom: 10, marginTop: 2 }}>{kpi.label}</div>
            <div style={{ fontSize: 22, fontWeight: D.weight.black, color: D.color.text, ...D.mono, lineHeight: 1.1, marginBottom: 4 }}>{kpi.value}</div>
            <div style={{ fontSize: D.size.tiny, color: D.color.text3 }}>{kpi.title}</div>
          </div>
        ))}
      </div>

      {/* ── Alerts ── */}
      {(unpaidCount > 0 || pendingCount > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {unpaidCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: D.color.warningDim, border: `1px solid rgba(245,158,11,0.2)`, borderRadius: D.radius.md }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: D.color.warning, flexShrink: 0 }} />
              <div style={{ fontSize: D.size.body, color: '#92400e', fontWeight: D.weight.semi }}>{unpaidCount} 筆訂單待收款</div>
            </div>
          )}
          {pendingCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: D.color.infoDim, border: `1px solid rgba(59,130,246,0.2)`, borderRadius: D.radius.md }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: D.color.info, flexShrink: 0 }} />
              <div style={{ fontSize: D.size.body, color: '#1e40af', fontWeight: D.weight.semi }}>{pendingCount} 筆訂單待審核</div>
            </div>
          )}
        </div>
      )}

      {/* ── Monthly Trend ── */}
      {trend.length > 0 && (
        <div style={{ ...D.card, padding: '16px', marginBottom: 20 }}>
          <div style={{ ...D.label, fontSize: 9, marginBottom: 14 }}>MONTHLY TREND</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
            {trend.map((m, i) => {
              const pct = maxTrend > 0 ? (m.amount / maxTrend) * 100 : 0;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: '100%', maxWidth: 36, minHeight: 4,
                    height: `${Math.max(pct, 4)}%`,
                    background: i === trend.length - 1 ? D.color.brand : D.color.brandLight,
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.4s ease',
                  }} />
                  <div style={{ fontSize: 9, color: D.color.text3, marginTop: 4, ...D.mono }}>{m.month?.slice(5) || ''}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Recent Orders ── */}
      <div style={{ ...D.label, fontSize: 9, marginBottom: 10 }}>RECENT ORDERS</div>
      {orders.length === 0 ? (
        <div style={{ ...D.card, padding: '40px 20px', textAlign: 'center' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={D.color.textDisabled} strokeWidth={1.5} strokeLinecap="round" style={{ marginBottom: 8 }}>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <div style={{ color: D.color.textDisabled, fontSize: D.size.body }}>暫無訂單</div>
          <div style={{ color: D.color.textDisabled, fontSize: D.size.tiny, marginTop: 4 }}>本月尚未有新訂單紀錄</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {orders.map(o => (
            <div key={o.id} onClick={() => onNavigateToOrder?.(o.id)} style={{
              ...D.card,
              padding: '12px 14px',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderLeft: `3px solid ${o.payment_status === 'paid' ? D.color.success : o.payment_status === 'partial' ? D.color.warning : D.color.border}`,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: D.size.body, fontWeight: D.weight.semi, color: D.color.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.customer_name || o.customer_company || o.order_no || `#${o.id}`}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <span style={D.tag(o.status === 'completed' || o.status === 'delivered' ? 'green' : o.status === 'cancelled' ? 'red' : 'default')}>
                    {STATUS_LABEL[o.status] || o.status}
                  </span>
                  {o.payment_status && o.payment_status !== 'paid' && (
                    <span style={D.tag(o.payment_status === 'partial' ? 'amber' : 'red')}>
                      {PAY_LABEL[o.payment_status] || o.payment_status}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                <div style={{ fontSize: D.size.h3, fontWeight: D.weight.bold, color: D.color.text, ...D.mono }}>{fmtNT(o.total_amount)}</div>
                <div style={{ fontSize: D.size.tiny, color: D.color.text3, ...D.mono, marginTop: 2 }}>{(o.order_date || o.created_at || '').slice(5, 10)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
