'use client';
import { useState, useMemo } from 'react';
import D from './DealerStyles';

const fmtNT = (n) => `NT$${Number(n || 0).toLocaleString()}`;

/* ── Health Score ── */
const calcHealth = (o) => {
  let s = 50;
  switch (o.status) {
    case 'draft': case 'pending_review': s = 25; break;
    case 'approved': s = 45; break;
    case 'processing': s = 55; break;
    case 'shipped': s = 75; break;
    case 'delivered': case 'completed': s = 95; break;
    case 'cancelled': s = 10; break;
  }
  if (o.payment_status === 'partial') s -= 15;
  else if (o.payment_status === 'unpaid') s -= 30;
  return Math.max(0, Math.min(100, s));
};

const healthColor = (s) => {
  if (s < 40) return D.color.error;
  if (s < 70) return D.color.warning;
  if (s < 90) return D.color.info;
  return D.color.success;
};

/* ── SVG Health Ring ── */
function HealthRing({ score, size = 44 }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  const col = healthColor(score);
  return (
    <svg width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={D.color.borderLight} strokeWidth="2.5" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth="2.5"
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: `${size/2}px ${size/2}px`, transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x={size/2} y={size/2} textAnchor="middle" dy="0.35em"
        style={{ fontSize: 11, fontWeight: 700, fill: D.color.text, fontFamily: D.font.mono }}>
        {score}
      </text>
    </svg>
  );
}

/* ── Status helpers ── */
const STATUS_TAG = {
  draft: { label: '草稿', tone: 'default' },
  pending_review: { label: '待審', tone: 'blue' },
  approved: { label: '已核准', tone: 'blue' },
  processing: { label: '處理中', tone: 'amber' },
  shipped: { label: '已出貨', tone: 'brand' },
  delivered: { label: '已送達', tone: 'green' },
  completed: { label: '已完成', tone: 'green' },
  cancelled: { label: '已取消', tone: 'red' },
};
const PAY_TAG = {
  unpaid: { label: '待收款', tone: 'red' },
  partial: { label: '部分收款', tone: 'amber' },
  paid: { label: '已結清', tone: 'green' },
};

/* ── Payment Progress Bar ── */
function PayBar({ paid, total }) {
  const pct = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
  const col = pct >= 100 ? D.color.success : pct > 50 ? D.color.brand : pct > 0 ? D.color.warning : D.color.border;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <div style={{ flex: 1, height: 4, background: D.color.borderLight, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 2, transition: 'width 0.4s ease', animation: 'grow 0.6s ease' }} />
      </div>
      <span style={{ fontSize: 10, color: D.color.text3, fontFamily: D.font.mono, fontWeight: D.weight.semi, minWidth: 32, textAlign: 'right' }}>
        {Math.round(pct)}%
      </span>
    </div>
  );
}

/* ── Order Card ── */
function OrderCard({ order, isSelected, onSelect }) {
  const score = calcHealth(order);
  const st = STATUS_TAG[order.status] || STATUS_TAG.draft;
  const pt = PAY_TAG[order.payment_status] || PAY_TAG.unpaid;

  return (
    <div
      onClick={() => onSelect(order.id)}
      style={{
        ...D.card,
        padding: '14px 16px',
        cursor: 'pointer',
        borderColor: isSelected ? D.color.brand : D.color.border,
        boxShadow: isSelected ? '0 0 0 2px rgba(22,163,74,0.10), ' + D.shadow.md : D.shadow.card,
        marginBottom: 8,
        animation: 'fadeUp 0.3s ease forwards',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Left accent strip */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: isSelected ? D.color.brand : order.payment_status === 'paid' ? D.color.success : order.payment_status === 'partial' ? D.color.warning : 'transparent',
        borderRadius: '12px 0 0 12px',
      }} />

      {/* Row 1: Name + Health Ring */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: D.size.h3, fontWeight: D.weight.bold, color: D.color.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {order.customer_name || order.customer_company || `#${order.id}`}
          </div>
          <div style={{ fontSize: D.size.tiny, color: D.color.text3, fontFamily: D.font.mono, marginTop: 3, letterSpacing: '0.03em' }}>
            {order.order_no || `ORD-${order.id}`}
          </div>
        </div>
        <HealthRing score={score} size={44} />
      </div>

      {/* Row 2: Tags */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={D.tag(st.tone)}>{st.label}</span>
        {order.payment_status !== 'paid' && <span style={D.tag(pt.tone)}>{pt.label}</span>}
      </div>

      {/* Row 3: Payment bar */}
      <PayBar paid={order.paid_amount || 0} total={order.total_amount || 0} />

      {/* Row 4: Amount + Date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 }}>
        <div style={{ fontSize: D.size.h2, fontWeight: D.weight.black, color: D.color.text, fontFamily: D.font.mono, lineHeight: 1 }}>
          {fmtNT(order.total_amount)}
        </div>
        <div style={{ fontSize: D.size.tiny, color: D.color.text3, fontFamily: D.font.mono }}>
          {(order.order_date || order.created_at || '').slice(5, 10)}
        </div>
      </div>
    </div>
  );
}

/* ── Section divider ── */
function Section({ title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 8px' }}>
      <span style={{ ...D.sectionLabel, marginBottom: 0 }}>{title}</span>
      {count > 0 && (
        <span style={{
          fontSize: 10, fontFamily: D.font.mono, fontWeight: D.weight.bold,
          color: D.color.brand, background: D.color.brandDim,
          padding: '1px 7px', borderRadius: D.radius.full, lineHeight: '16px',
        }}>{count}</span>
      )}
      <div style={{ flex: 1, height: 1, background: D.color.borderLight }} />
    </div>
  );
}

/* ── Main component ── */
export default function OrderList({ token, orders = [], loading = false, selectedOrderId = null, onSelectOrder = () => {}, onRefresh = () => {}, onNewOrder = null }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const FILTERS = [
    { id: 'all', label: '全部' },
    { id: 'unpaid', label: '待收款' },
    { id: 'shipped', label: '已出貨' },
    { id: 'done', label: '已完成' },
  ];

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (filter === 'unpaid' && o.payment_status === 'paid') return false;
      if (filter === 'shipped' && o.status !== 'shipped') return false;
      if (filter === 'done' && o.status !== 'completed' && o.status !== 'delivered') return false;
      if (search) {
        const q = search.toLowerCase();
        const name   = (o.customer_name || '').toLowerCase();
        const no     = (o.order_no || '').toLowerCase();
        const remark = (o.remark || '').toLowerCase();
        if (!name.includes(q) && !no.includes(q) && !remark.includes(q)) return false;
      }
      return true;
    });
  }, [orders, filter, search]);

  const grouped = useMemo(() => {
    const pending = filtered.filter(o => ['draft', 'pending_review', 'approved'].includes(o.status));
    const active = filtered.filter(o => ['processing', 'shipped'].includes(o.status));
    const done = filtered.filter(o => ['delivered', 'completed', 'cancelled'].includes(o.status));
    return { pending, active, done };
  }, [filtered]);

  /* ── Skeleton loading ── */
  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{
            height: 120, background: `linear-gradient(90deg, ${D.color.muted} 25%, ${D.color.borderLight} 50%, ${D.color.muted} 75%)`,
            backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
            borderRadius: D.radius.lg, marginBottom: 8,
          }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: D.color.bg }}>
      {/* ── Search + New button ── */}
      <div style={{ padding: '12px 16px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={D.color.textDisabled} strokeWidth="2" strokeLinecap="round"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text" placeholder="搜尋客戶或訂單號..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...D.input, paddingLeft: 36, fontSize: D.size.caption, background: D.color.muted, border: `1px solid transparent` }}
          />
        </div>
        {onNewOrder && (
          <button onClick={onNewOrder}
            style={{ ...D.btnPrimary, padding: '8px 14px', fontSize: D.size.caption, whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新增訂單
          </button>
        )}
      </div>

      {/* ── Filter pills ── */}
      <div style={{ display: 'flex', gap: 6, padding: '4px 16px 12px', overflowX: 'auto' }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={D.pill(filter === f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: D.color.borderLight }} />

      {/* ── List ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 16px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={D.color.textDisabled} strokeWidth={1.5} strokeLinecap="round" style={{ marginBottom: 10 }}>
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <div style={{ color: D.color.textDisabled, fontSize: D.size.body, fontWeight: D.weight.medium }}>未找到訂單</div>
          </div>
        ) : (
          <>
            {grouped.pending.length > 0 && (
              <>
                <Section title="PENDING" count={grouped.pending.length} />
                {grouped.pending.map(o => (
                  <OrderCard key={o.id} order={o} isSelected={selectedOrderId === o.id} onSelect={onSelectOrder} />
                ))}
              </>
            )}
            {grouped.active.length > 0 && (
              <>
                <Section title="ACTIVE" count={grouped.active.length} />
                {grouped.active.map(o => (
                  <OrderCard key={o.id} order={o} isSelected={selectedOrderId === o.id} onSelect={onSelectOrder} />
                ))}
              </>
            )}
            {grouped.done.length > 0 && (
              <>
                <Section title="COMPLETED" count={grouped.done.length} />
                {grouped.done.map(o => (
                  <OrderCard key={o.id} order={o} isSelected={selectedOrderId === o.id} onSelect={onSelectOrder} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
