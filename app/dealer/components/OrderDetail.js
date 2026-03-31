'use client';
import { useMemo } from 'react';
import D from './DealerStyles';

const fmtNT = (n) => `NT$${Number(n || 0).toLocaleString()}`;
const fmtDate = (d) => { if (!d) return '--'; const x = new Date(d); return `${x.getFullYear()}/${String(x.getMonth()+1).padStart(2,'0')}/${String(x.getDate()).padStart(2,'0')}`; };

const SHIP_LABEL = { pending: '待出貨', shipped: '已出貨', delivered: '已送達', cancelled: '已取消' };
const STATUS_LABEL = { draft: '草稿', pending_review: '待審', approved: '已核准', processing: '處理中', shipped: '已出貨', delivered: '已送達', completed: '已完成', cancelled: '已取消' };
const STATUS_TONE = { draft: 'default', pending_review: 'blue', approved: 'blue', processing: 'amber', shipped: 'brand', delivered: 'green', completed: 'green', cancelled: 'red' };

export default function OrderDetail({ order, token, onBack, onRefresh }) {
  if (!order) return null;

  const pct = order.total_amount > 0 ? Math.round(((order.paid_amount || 0) / order.total_amount) * 100) : 0;
  const remaining = (order.total_amount || 0) - (order.paid_amount || 0);

  /* ── Build timeline ── */
  const timeline = useMemo(() => {
    const ev = [];
    if (order.created_at) ev.push({ label: '訂單建立', time: order.created_at, done: true });
    if (['pending_review','approved','processing','shipped','delivered','completed'].includes(order.status))
      ev.push({ label: '送審', time: order.review_at || order.created_at, done: true });
    if (['approved','processing','shipped','delivered','completed'].includes(order.status))
      ev.push({ label: '審核通過', time: order.approved_at || order.created_at, done: true });
    if (['processing','shipped','delivered','completed'].includes(order.status)) {
      ev.push({ label: '處理中', time: order.processing_at || order.created_at, done: true });
    }
    if ((order.paid_amount || 0) > 0)
      ev.push({ label: `收款 ${fmtNT(order.paid_amount)}`, time: order.payment_date || order.created_at, done: true });
    if (remaining > 0)
      ev.push({ label: `待收尾款 ${fmtNT(remaining)}`, time: null, done: false });
    if (['shipped','delivered','completed'].includes(order.status))
      ev.push({ label: '已出貨', time: order.shipment?.shipped_at || order.created_at, done: true });
    return ev;
  }, [order]);

  return (
    <div style={{ padding: 16, paddingBottom: 100, background: D.color.bg, minHeight: '100%' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={D.color.text2} strokeWidth="2" strokeLinecap="round"><path d="M15 19l-7-7 7-7" /></svg>
          </button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ ...D.sectionLabel, marginBottom: 2 }}>ORDER</div>
          <div style={{ fontSize: D.size.h2, fontWeight: D.weight.bold, color: D.color.text }}>{order.order_no || `#${order.id}`}</div>
        </div>
        <span style={D.tag(STATUS_TONE[order.status] || 'default')}>{STATUS_LABEL[order.status] || order.status}</span>
      </div>

      {/* ── Alert Banner ── */}
      {order.payment_status === 'unpaid' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 16,
          background: D.color.warningDim, border: '1px solid rgba(245,158,11,0.18)', borderRadius: D.radius.md,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: D.color.warning, flexShrink: 0 }} />
          <span style={{ fontSize: D.size.body, color: '#92400e', fontWeight: D.weight.semi }}>此訂單尚未收到任何款項</span>
        </div>
      )}

      {/* ── Payment Progress Card ── */}
      <div style={{ ...D.card, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ ...D.sectionLabel, marginBottom: 0 }}>PAYMENT</span>
          <span style={{ fontSize: D.size.caption, color: D.color.text3, fontFamily: D.font.mono, fontWeight: D.weight.semi }}>{pct}%</span>
        </div>
        {/* Progress bar */}
        <div style={{ height: 6, background: D.color.borderLight, borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{
            height: '100%', borderRadius: 3, transition: 'width 0.6s ease',
            width: `${pct}%`, background: pct >= 100 ? D.color.success : pct > 0 ? D.color.brand : 'transparent',
          }} />
        </div>
        {/* 2x2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[
            { label: '合計', value: fmtNT(order.total_amount), color: D.color.text },
            { label: '已付款', value: fmtNT(order.paid_amount), color: D.color.success },
            { label: '待收款', value: fmtNT(remaining), color: remaining > 0 ? D.color.warning : D.color.text3 },
            { label: '訂單日期', value: fmtDate(order.order_date), color: D.color.text },
          ].map((c, i) => (
            <div key={i}>
              <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: D.size.h3, fontWeight: D.weight.bold, color: c.color, fontFamily: D.font.mono }}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Info Chips ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {[
          { label: '客戶', value: order.customer_name, sub: order.customer_company },
          { label: '銷售員', value: order.salesperson_name || '--' },
          { label: '出貨狀態', value: SHIP_LABEL[order.shipping_status] || '待出貨', sub: order.shipment?.tracking_number },
          { label: '付款方式', value: order.payment_method || '--' },
        ].map((chip, i) => (
          <div key={i} style={{ ...D.card, padding: '10px 12px' }}>
            <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginBottom: 4 }}>{chip.label}</div>
            <div style={{ fontSize: D.size.body, fontWeight: D.weight.semi, color: D.color.text, lineHeight: 1.3 }}>{chip.value}</div>
            {chip.sub && <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginTop: 2 }}>{chip.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Product List ── */}
      <div style={{ ...D.card, padding: 16, marginBottom: 12 }}>
        <div style={{ ...D.sectionLabel, marginBottom: 14 }}>ITEMS</div>
        {(order.items || []).map((item, idx) => (
          <div key={idx} style={{
            display: 'flex', gap: 10, paddingBottom: 12, marginBottom: idx < (order.items?.length || 0) - 1 ? 12 : 0,
            borderBottom: idx < (order.items?.length || 0) - 1 ? `1px solid ${D.color.borderLight}` : 'none',
          }}>
            {/* Icon placeholder */}
            <div style={{
              width: 40, height: 40, borderRadius: D.radius.sm, flexShrink: 0,
              background: D.color.infoDim, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: D.color.info, fontWeight: D.weight.bold, fontFamily: D.font.mono,
            }}>
              {(item.item_number_snapshot || '').slice(0, 3)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: D.size.body, fontWeight: D.weight.medium, color: D.color.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.description_snapshot || item.item_number_snapshot}
              </div>
              <div style={{ fontSize: D.size.tiny, color: D.color.text3, fontFamily: D.font.mono, marginTop: 3 }}>
                x{item.qty} @ {fmtNT(item.unit_price)}
              </div>
            </div>
            <div style={{ fontSize: D.size.body, fontWeight: D.weight.bold, color: D.color.text, fontFamily: D.font.mono, flexShrink: 0, lineHeight: '40px' }}>
              {fmtNT(item.line_total)}
            </div>
          </div>
        ))}
        {(!order.items || order.items.length === 0) && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: D.color.textDisabled, fontSize: D.size.body }}>尚無商品資料</div>
        )}
      </div>

      {/* ── Timeline ── */}
      <div style={{ ...D.card, padding: 16, marginBottom: 12 }}>
        <div style={{ ...D.sectionLabel, marginBottom: 16 }}>TIMELINE</div>
        <div style={{ paddingLeft: 20, position: 'relative' }}>
          {timeline.map((ev, idx) => (
            <div key={idx} style={{ position: 'relative', paddingBottom: idx < timeline.length - 1 ? 20 : 0, paddingLeft: 16 }}>
              {/* Dot */}
              <div style={{
                position: 'absolute', left: -20, top: 3,
                width: 10, height: 10, borderRadius: '50%',
                background: ev.done ? D.color.success : 'transparent',
                border: ev.done ? 'none' : `2px solid ${D.color.info}`,
              }}>
                {!ev.done && <div style={{ width: 4, height: 4, borderRadius: '50%', background: D.color.info, position: 'absolute', top: 1, left: 1, animation: 'pulse 1.5s infinite' }} />}
              </div>
              {/* Line */}
              {idx < timeline.length - 1 && (
                <div style={{ position: 'absolute', left: -15, top: 16, width: 1, height: 'calc(100% - 12px)', background: D.color.borderLight }} />
              )}
              <div style={{ fontSize: D.size.body, fontWeight: D.weight.medium, color: D.color.text, lineHeight: 1.3 }}>{ev.label}</div>
              {ev.time && <div style={{ fontSize: D.size.tiny, color: D.color.text3, fontFamily: D.font.mono, marginTop: 2 }}>{fmtDate(ev.time)}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom Action Bar ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        display: 'flex', gap: 10, padding: '12px 16px',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderTop: `1px solid ${D.color.border}`,
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}>
        <button style={{ ...D.btnGhost, flex: 1, textAlign: 'center' }}>登記付款</button>
        <button style={{ ...D.btnPrimary, flex: 1, textAlign: 'center' }}>聯絡客戶</button>
      </div>
    </div>
  );
}
