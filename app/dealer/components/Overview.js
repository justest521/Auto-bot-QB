'use client';
import { useState, useEffect, useCallback } from 'react';
import D from './DealerStyles';

const Skeleton = ({ width = '100%', height = '20px', className = '' }) => (
  <div
    style={{
      width,
      height,
      backgroundColor: D.color.muted,
      borderRadius: D.radius.sm,
      animation: 'shimmer 1.5s infinite',
    }}
    className={className}
  />
);

export default function Overview({ token, user, roleConfig, dealerGet, onNavigateToOrder }) {
  const [performance, setPerformance] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthlyTrend, setMonthlyTrend] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [perfRes, ordersRes] = await Promise.all([
          dealerGet({ action: 'my_performance', token, range: 'month' }),
          dealerGet({ action: 'my_orders', token, page: '1', limit: '5' }),
        ]);

        if (perfRes?.data) {
          setPerformance(perfRes.data);
          // Generate mock monthly trend data
          const trend = Array.from({ length: 7 }, (_, i) => ({
            day: i + 1,
            amount: Math.floor(Math.random() * 50000) + 10000,
          }));
          setMonthlyTrend(trend);
        }

        if (ordersRes?.data?.items) {
          setOrders(ordersRes.data.items);
        }
      } catch (error) {
        console.error('Failed to fetch overview data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, dealerGet]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
    }).format(amount || 0);
  };

  const getDate = () => {
    const now = new Date();
    return new Intl.DateTimeFormat('zh-TW', {
      month: 'long',
      day: 'numeric',
    }).format(now);
  };

  if (loading) {
    return (
      <div style={{ padding: D.size.lg }}>
        <style>{`@keyframes shimmer { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }`}</style>
        <Skeleton width="200px" height="32px" />
        <div style={{ marginTop: D.size.md }}>
          <Skeleton height="140px" />
        </div>
      </div>
    );
  }

  const unpaidOrders = orders.filter((o) => o.status === 'unpaid' || o.status === 'partial');
  const pendingOrders = orders.filter((o) => o.status === 'pending');

  const maxAmount = Math.max(...monthlyTrend.map((d) => d.amount), 1);

  return (
    <div style={{ padding: D.size.lg }}>
      <style>{`@keyframes shimmer { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }`}</style>

      {/* Greeting Header */}
      <div style={{ marginBottom: D.size.xl }}>
        <h1
          style={{
            fontSize: D.size.h1,
            fontWeight: D.weight.bold,
            color: D.color.text,
            margin: '0 0 8px 0',
          }}
        >
          早安，{user?.display_name || '使用者'}
        </h1>
        <p style={{ color: D.color.text2, fontSize: D.size.body, margin: 0 }}>
          {getDate()}
        </p>
      </div>

      {/* KPI Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: D.size.md,
          marginBottom: D.size.xl,
        }}
      >
        {[
          {
            label: '本月營業額',
            value: formatCurrency(performance?.total_amount || 0),
            icon: '💰',
          },
          {
            label: '訂單數',
            value: (performance?.total_orders || 0).toString(),
            icon: '📦',
          },
          {
            label: '平均單價',
            value: formatCurrency(performance?.avg_order_amount || 0),
            icon: '📊',
          },
          {
            label: '待收款',
            value: unpaidOrders.length.toString(),
            icon: '⏳',
          },
        ].map((kpi, i) => (
          <div
            key={i}
            style={{
              padding: D.size.md,
              backgroundColor: D.color.card,
              borderRadius: D.radius.md,
              border: `1px solid ${D.color.border}`,
              boxShadow: `0 1px 2px rgba(0,0,0,0.05)`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: D.size.sm }}>
              <span style={{ fontSize: '24px', marginRight: D.size.sm }}>{kpi.icon}</span>
              <p style={{ fontSize: D.size.caption, color: D.color.text2, margin: 0 }}>
                {kpi.label}
              </p>
            </div>
            <p
              style={{
                fontSize: D.size.h2,
                fontWeight: D.weight.bold,
                color: D.color.success,
                margin: 0,
              }}
            >
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Alert Cards */}
      {(unpaidOrders.length > 0 || pendingOrders.length > 0) && (
        <div style={{ marginBottom: D.size.xl }}>
          {unpaidOrders.length > 0 && (
            <div
              style={{
                padding: D.size.md,
                backgroundColor: '#fef3c7',
                borderLeft: `4px solid #f59e0b`,
                borderRadius: D.radius.md,
                marginBottom: D.size.md,
              }}
            >
              <p style={{ margin: 0, color: '#92400e', fontWeight: 'bold' }}>
                {unpaidOrders.length} 筆訂單待收款
              </p>
            </div>
          )}
          {pendingOrders.length > 0 && (
            <div
              style={{
                padding: D.size.md,
                backgroundColor: '#e0e7ff',
                borderLeft: `4px solid #6366f1`,
                borderRadius: D.radius.md,
              }}
            >
              <p style={{ margin: 0, color: '#312e81', fontWeight: 'bold' }}>
                {pendingOrders.length} 筆訂單待審核
              </p>
            </div>
          )}
        </div>
      )}

      {/* Monthly Trend Chart */}
      {monthlyTrend.length > 0 && (
        <div
          style={{
            padding: D.size.md,
            backgroundColor: D.color.card,
            borderRadius: D.radius.md,
            border: `1px solid ${D.color.border}`,
            marginBottom: D.size.xl,
          }}
        >
          <h3
            style={{
              fontSize: D.size.h3,
              fontWeight: D.weight.semi,
              color: D.color.text,
              marginTop: 0,
              marginBottom: D.size.md,
            }}
          >
            本月營業趨勢
          </h3>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: D.size.sm,
              height: '150px',
            }}
          >
            {monthlyTrend.map((d, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${(d.amount / maxAmount) * 100}%`,
                    backgroundColor: '#16a34a',
                    borderRadius: `${D.radius.sm} ${D.radius.sm} 0 0`,
                    minHeight: '4px',
                  }}
                />
                <p
                  style={{
                    fontSize: D.size.caption,
                    color: D.color.text2,
                    marginTop: D.size.xs,
                    margin: 0,
                  }}
                >
                  {d.day}日
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div>
        <h3
          style={{
            fontSize: D.size.h3,
            fontWeight: D.weight.semi,
            color: D.color.text,
            marginTop: 0,
            marginBottom: D.size.md,
          }}
        >
          最近訂單
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: D.size.sm }}>
          {orders.length > 0 ? (
            orders.map((order) => (
              <div
                key={order.id}
                style={{
                  padding: D.size.md,
                  backgroundColor: D.color.card,
                  borderRadius: D.radius.md,
                  border: `1px solid ${D.color.border}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onClick={() => onNavigateToOrder?.(order.id)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f0fdf4';
                  e.currentTarget.style.borderColor = '#16a34a';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = D.color.card;
                  e.currentTarget.style.borderColor = D.color.border;
                }}
              >
                <div>
                  <p
                    style={{
                      fontWeight: D.weight.semi,
                      color: D.color.text,
                      margin: '0 0 4px 0',
                      fontSize: D.size.body,
                    }}
                  >
                    訂單 {order.order_number}
                  </p>
                  <p style={{ fontSize: D.size.caption, color: D.color.text2, margin: 0 }}>
                    {order.created_at}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p
                    style={{
                      fontWeight: D.weight.semi,
                      color: '#16a34a',
                      margin: '0 0 4px 0',
                      fontSize: D.size.body,
                    }}
                  >
                    {formatCurrency(order.total_amount)}
                  </p>
                  <p
                    style={{
                      fontSize: D.size.caption,
                      color: D.color.text2,
                      margin: 0,
                      textTransform: 'uppercase',
                    }}
                  >
                    {order.status}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p style={{ color: D.color.text2, textAlign: 'center', padding: D.size.lg }}>
              暫無訂單
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
