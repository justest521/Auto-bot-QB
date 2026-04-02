'use client';
import { useState, useEffect } from 'react';
import D from './DealerStyles';

const fmtNT = (n) => `NT$${Number(n || 0).toLocaleString()}`;

const STATUS_BADGE = {
  arrived: { label: '已到貨', color: D.color.success },
  shipped: { label: '配送中', color: D.color.info },
  partial_arrived: { label: '已取貨', color: D.color.warning },
};

export default function ArrivalsNotify({ token, dealerGet, dealerPost }) {
  const [arrivals, setArrivals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifying, setNotifying] = useState({});

  const fetchArrivals = async () => {
    setLoading(true);
    try {
      const data = await dealerGet({ action: 'my_arrivals', token });
      setArrivals(data?.orders || []);
    } catch (err) {
      console.error('Failed to fetch arrivals:', err);
      setArrivals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArrivals();
  }, []);

  const handleNotifyCustomer = async (orderId) => {
    setNotifying(prev => ({ ...prev, [orderId]: true }));
    try {
      await dealerPost({
        action: 'notify_customer_arrival',
        token,
        order_id: orderId,
      });
      // Refresh list after notification
      await fetchArrivals();
    } catch (err) {
      console.error('Failed to notify customer:', err);
    } finally {
      setNotifying(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const handlePickupConfirm = async (orderId) => {
    try {
      await dealerPost({
        action: 'confirm_pickup',
        token,
        order_id: orderId,
      });
      await fetchArrivals();
    } catch (err) {
      console.error('Failed to confirm pickup:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <div style={{ fontSize: D.size.body, color: D.color.text2 }}>
          載入中...
        </div>
      </div>
    );
  }

  if (arrivals.length === 0) {
    return (
      <div style={{
        padding: 32,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}>
        <div style={{ fontSize: 48 }}>📦</div>
        <div style={{
          fontSize: D.size.h3,
          color: D.color.text3,
          fontWeight: D.weight.medium,
        }}>
          目前沒有到貨通知
        </div>
        <button
          onClick={fetchArrivals}
          style={{
            ...D.btnPrimary,
            marginTop: 8,
          }}
        >
          重新整理
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 12px 80px', minHeight: '100vh', background: D.color.bg }}>
      {/* Refresh Button */}
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={fetchArrivals}
          disabled={loading}
          style={{
            ...D.btnGhost,
            width: '100%',
            color: D.color.brand,
            borderColor: D.color.brand,
          }}
        >
          ↻ 重新整理
        </button>
      </div>

      {/* Arrivals List */}
      <div>
        {arrivals.map((order) => {
          const badge = STATUS_BADGE[order.status] || STATUS_BADGE.arrived;
          const items = order.items || [];
          const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

          return (
            <div
              key={order.id}
              style={{
                ...D.card,
                padding: 14,
                marginBottom: 10,
                animation: 'fadeUp 0.3s ease forwards',
              }}
            >
              {/* Header: Order ID + Status + Date */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 12,
              }}>
                <div>
                  <div style={{
                    fontSize: D.size.h3,
                    fontWeight: D.weight.semi,
                    color: D.color.text,
                  }}>
                    {order.order_number}
                  </div>
                  <div style={{
                    fontSize: D.size.caption,
                    color: D.color.text3,
                    marginTop: 2,
                  }}>
                    {new Date(order.arrived_at || order.date).toLocaleDateString('zh-TW')}
                  </div>
                </div>
                <div style={{
                  ...D.tag(badge === STATUS_BADGE.arrived ? 'green' : 'amber'),
                  display: 'inline-block',
                }}>
                  {badge.label}
                </div>
              </div>

              {/* Items List */}
              <div style={{
                backgroundColor: D.color.muted,
                borderRadius: D.radius.md,
                padding: 10,
                marginBottom: 12,
              }}>
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingBottom: idx < items.length - 1 ? 10 : 0,
                      borderBottom: idx < items.length - 1 ? `1px solid ${D.color.border}` : 'none',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: D.size.body,
                        color: D.color.text,
                        fontWeight: D.weight.medium,
                      }}>
                        {item.name}
                      </div>
                      <div style={{
                        fontSize: D.size.caption,
                        color: D.color.text3,
                        marginTop: 2,
                      }}>
                        × {item.quantity}
                      </div>
                    </div>
                    <div style={{
                      fontSize: D.size.body,
                      fontWeight: D.weight.semi,
                      color: D.color.text,
                      textAlign: 'right',
                      minWidth: 80,
                    }}>
                      {fmtNT(item.price * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Amount */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 12,
                borderBottom: `1px solid ${D.color.border}`,
                marginBottom: 12,
              }}>
                <span style={{ fontSize: D.size.body, color: D.color.text2 }}>
                  訂單合計
                </span>
                <span style={{
                  fontSize: D.size.h3,
                  fontWeight: D.weight.bold,
                  color: D.color.brand,
                }}>
                  {fmtNT(totalAmount)}
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                gap: 8,
              }}>
                <button
                  onClick={() => handleNotifyCustomer(order.id)}
                  disabled={notifying[order.id]}
                  style={{
                    ...D.btnPrimary,
                    flex: 1,
                    opacity: notifying[order.id] ? 0.6 : 1,
                    cursor: notifying[order.id] ? 'not-allowed' : 'pointer',
                  }}
                >
                  {notifying[order.id] ? '通知中...' : '通知客戶 (LINE@)'}
                </button>
                <button
                  onClick={() => handlePickupConfirm(order.id)}
                  style={{
                    ...D.btnGhost,
                    flex: 1,
                  }}
                >
                  確認取貨
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
