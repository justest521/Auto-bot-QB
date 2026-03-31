'use client';
import { useMemo } from 'react';
import D from './DealerStyles';

export default function OrderDetail({ order, token, onBack, onRefresh }) {
  const timelineEvents = useMemo(() => {
    const events = [];

    if (order.created_at) {
      events.push({
        label: '訂單建立',
        timestamp: order.created_at,
        type: 'done',
      });
    }

    if (order.status >= 1) {
      events.push({
        label: '送審',
        timestamp: order.review_at || order.created_at,
        type: 'done',
      });
    }

    if (order.status >= 2) {
      events.push({
        label: '審核通過',
        timestamp: order.approved_at || order.created_at,
        type: 'done',
      });
    }

    if (order.status >= 3) {
      events.push({
        label: '庫存確認',
        timestamp: order.processing_at || order.created_at,
        type: 'done',
      });
      events.push({
        label: '銷貨單開立',
        timestamp: order.processing_at || order.created_at,
        type: 'done',
      });
    }

    if (order.paid_amount > 0) {
      events.push({
        label: `收款記錄 (${formatCurrency(order.paid_amount)})`,
        timestamp: order.payment_date || order.created_at,
        type: 'done',
      });
    }

    if (order.remaining_amount > 0) {
      events.push({
        label: `尾款待收 (${formatCurrency(order.remaining_amount)})`,
        timestamp: null,
        type: 'action',
      });
    }

    if (order.shipping_status !== 'pending') {
      events.push({
        label: '出貨',
        timestamp: order.shipment?.shipped_at || order.created_at,
        type: 'done',
      });
    }

    return events;
  }, [order]);

  const progressPercent = order.total_amount > 0
    ? Math.round((order.paid_amount / order.total_amount) * 100)
    : 0;

  const alertType = !order.line_bound ? 'line' : order.payment_status === 'overdue' ? 'payment' : null;

  return (
    <div style={{ ...styles.container, backgroundColor: D.color.bg }}>
      {/* Header with back button */}
      <div style={styles.header}>
        {onBack && (
          <button onClick={onBack} style={styles.backBtn} aria-label="Back">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={D.color.text} strokeWidth="2">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div>
          <div style={{ ...D.label, color: D.color.text3, fontSize: D.size.caption }}>
            訂單編號
          </div>
          <div style={{ color: D.color.text, fontSize: D.size.h2, fontWeight: 600, marginTop: 4 }}>
            {order.order_no}
          </div>
        </div>
      </div>

      {/* Alert Banner */}
      {alertType && (
        <div style={{ ...styles.alertBanner, backgroundColor: D.color.warning + '15', borderColor: D.color.warning }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill={D.color.warning} style={{ flexShrink: 0 }}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m1 15h-2v-2h2v2m0-4h-2V7h2v6z" />
          </svg>
          <span style={{ color: D.color.warning, fontSize: D.size.body, fontWeight: 500 }}>
            {alertType === 'line' ? '客戶尚未綁定LINE' : '逾期未收款'}
          </span>
        </div>
      )}

      {/* Payment Progress Card */}
      <div style={{ ...styles.card, backgroundColor: D.color.card }}>
        <div style={styles.cardHeader}>
          <span style={{ color: D.color.text, fontSize: D.size.h3, fontWeight: 600 }}>
            付款進度
          </span>
          <span style={{ color: D.color.text3, fontSize: D.size.body }}>
            {progressPercent}%
          </span>
        </div>

        <div style={styles.progressBar}>
          <div style={{
            ...styles.progressFill,
            width: `${progressPercent}%`,
            backgroundColor: D.color.brand,
          }} />
        </div>

        <div style={styles.paymentGrid}>
          <div>
            <div style={{ color: D.color.text3, fontSize: D.size.caption }}>合計</div>
            <div style={{ color: D.color.text, fontSize: D.size.h3, fontWeight: 600, marginTop: 4 }}>
              {formatCurrency(order.total_amount)}
            </div>
          </div>
          <div>
            <div style={{ color: D.color.text3, fontSize: D.size.caption }}>已付款</div>
            <div style={{ color: D.color.success, fontSize: D.size.h3, fontWeight: 600, marginTop: 4 }}>
              {formatCurrency(order.paid_amount)}
            </div>
          </div>
          <div>
            <div style={{ color: D.color.text3, fontSize: D.size.caption }}>待收款</div>
            <div style={{ color: D.color.warning, fontSize: D.size.h3, fontWeight: 600, marginTop: 4 }}>
              {formatCurrency(order.remaining_amount)}
            </div>
          </div>
          <div>
            <div style={{ color: D.color.text3, fontSize: D.size.caption }}>訂單日期</div>
            <div style={{ color: D.color.text, fontSize: D.size.h3, fontWeight: 600, marginTop: 4 }}>
              {formatDate(order.order_date)}
            </div>
          </div>
        </div>
      </div>

      {/* Info Chips - 2x2 Grid */}
      <div style={styles.chipGrid}>
        <div style={{ ...styles.chip, backgroundColor: D.color.card }}>
          <div style={{ color: D.color.text3, fontSize: D.size.caption }}>客戶名稱</div>
          <div style={{ color: D.color.text, fontSize: D.size.body, fontWeight: 500, marginTop: 6 }}>
            {order.customer_name}
          </div>
          {order.customer_company && (
            <div style={{ color: D.color.text3, fontSize: D.size.caption, marginTop: 4 }}>
              {order.customer_company}
            </div>
          )}
        </div>
        <div style={{ ...styles.chip, backgroundColor: D.color.card }}>
          <div style={{ color: D.color.text3, fontSize: D.size.caption }}>銷售員</div>
          <div style={{ color: D.color.text, fontSize: D.size.body, fontWeight: 500, marginTop: 6 }}>
            {order.salesperson_name}
          </div>
        </div>
        <div style={{ ...styles.chip, backgroundColor: D.color.card }}>
          <div style={{ color: D.color.text3, fontSize: D.size.caption }}>訂單日期</div>
          <div style={{ color: D.color.text, fontSize: D.size.body, fontWeight: 500, marginTop: 6 }}>
            {formatDate(order.order_date)}
          </div>
        </div>
        <div style={{ ...styles.chip, backgroundColor: D.color.card }}>
          <div style={{ color: D.color.text3, fontSize: D.size.caption }}>出貨狀態</div>
          <div style={{ color: D.color.text, fontSize: D.size.body, fontWeight: 500, marginTop: 6 }}>
            {getShippingLabel(order.shipping_status)}
          </div>
          {order.shipment?.tracking_number && (
            <div style={{ color: D.color.text3, fontSize: D.size.caption, marginTop: 4 }}>
              {order.shipment.tracking_number}
            </div>
          )}
        </div>
      </div>

      {/* Product List */}
      <div style={{ ...styles.card, backgroundColor: D.color.card }}>
        <div style={{ color: D.color.text, fontSize: D.size.h3, fontWeight: 600, marginBottom: 16 }}>
          商品
        </div>
        <div>
          {order.items?.map((item, idx) => (
            <div key={idx} style={{ ...styles.productItem, borderBottomColor: idx < order.items.length - 1 ? D.color.border : 'transparent' }}>
              <div style={styles.productIcon}>
                {item.icon ? (
                  <img src={item.icon} alt="" style={{ width: '100%', height: '100%' }} />
                ) : (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: D.color.info + '30',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: D.size.caption,
                    color: D.color.info,
                    fontWeight: 600,
                  }}>
                    商
                  </div>
                )}
              </div>
              <div style={styles.productInfo}>
                <div style={{ color: D.color.text, fontSize: D.size.body, fontWeight: 500 }}>
                  {item.description_snapshot}
                </div>
                <div style={{ color: D.color.text3, fontSize: D.size.caption, marginTop: 4 }}>
                  SKU: {item.item_number_snapshot}
                </div>
              </div>
              <div style={styles.productPrice}>
                <div style={{ color: D.color.text, fontSize: D.size.body, fontWeight: 600, textAlign: 'right' }}>
                  {formatCurrency(item.line_total)}
                </div>
                <div style={{ color: D.color.text3, fontSize: D.size.caption, marginTop: 4, textAlign: 'right' }}>
                  ×{item.qty} @ {formatCurrency(item.unit_price)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ ...styles.card, backgroundColor: D.color.card }}>
        <div style={{ color: D.color.text, fontSize: D.size.h3, fontWeight: 600, marginBottom: 20 }}>
          訂單紀錄
        </div>
        <div style={styles.timeline}>
          {timelineEvents.map((event, idx) => (
            <div key={idx} style={styles.timelineItem}>
              <div style={{
                ...styles.timelineDot,
                backgroundColor: event.type === 'action' ? 'transparent' : D.color.success,
                borderColor: event.type === 'action' ? D.color.info : 'transparent',
                borderWidth: event.type === 'action' ? 2 : 0,
              }}>
                {event.type === 'action' && (
                  <div style={{
                    ...styles.pulsingDot,
                    backgroundColor: D.color.info,
                  }} />
                )}
              </div>
              {idx < timelineEvents.length - 1 && (
                <div style={{
                  ...styles.timelineLine,
                  backgroundColor: D.color.border,
                }} />
              )}
              <div style={styles.timelineContent}>
                <div style={{ color: D.color.text, fontSize: D.size.body, fontWeight: 500 }}>
                  {event.label}
                </div>
                {event.timestamp && (
                  <div style={{ color: D.color.text3, fontSize: D.size.caption, marginTop: 4 }}>
                    {formatDate(event.timestamp)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div style={{
        ...styles.actionBar,
        backgroundColor: D.color.card,
        borderTopColor: D.color.border,
      }}>
        <button style={{
          ...D.btnGhost,
          color: D.color.text2,
          borderColor: D.color.border,
          flex: 1,
          marginRight: 12,
        }}>
          登記付款
        </button>
        <button style={{
          ...D.btnPrimary,
          backgroundColor: D.color.brand,
          color: '#ffffff',
          flex: 1,
        }}>
          下一步
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 20,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  alertBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    borderRadius: D.radius.lg,
    marginBottom: 16,
    border: `1px solid ${D.color.warning}40`,
  },
  card: {
    borderRadius: D.radius.lg,
    padding: 16,
    marginBottom: 16,
    border: `1px solid ${D.color.border}`,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: D.color.bg,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.6s ease-out',
  },
  paymentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 16,
  },
  chipGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
    marginBottom: 16,
  },
  chip: {
    borderRadius: D.radius.md,
    padding: 12,
    border: `1px solid ${D.color.border}`,
  },
  productItem: {
    display: 'flex',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
  },
  productIcon: {
    width: 48,
    height: 48,
    borderRadius: D.radius.md,
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: D.color.bg,
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
  },
  productPrice: {
    flexShrink: 0,
    textAlign: 'right',
  },
  timeline: {
    position: 'relative',
    paddingLeft: 32,
  },
  timelineItem: {
    position: 'relative',
    marginBottom: 20,
  },
  timelineDot: {
    position: 'absolute',
    left: -32,
    top: 2,
    width: 12,
    height: 12,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    position: 'absolute',
    left: -26,
    top: 16,
    width: 2,
    height: 20,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  timelineContent: {
    paddingTop: 2,
  },
  actionBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    padding: 16,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    gap: 12,
    zIndex: 10,
  },
};

function formatCurrency(amount) {
  return `NT$${(amount || 0).toLocaleString('zh-TW')}`;
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function getShippingLabel(status) {
  const labels = {
    pending: '待出貨',
    shipped: '已出貨',
    delivered: '已送達',
    cancelled: '已取消',
  };
  return labels[status] || status;
}
