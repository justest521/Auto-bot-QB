'use client';
import { useState, useMemo } from 'react';
import D from './DealerStyles';

const calculateHealthScore = (order) => {
  let score = 50;

  // Status-based score
  switch (order.status) {
    case 'draft':
    case 'pending_review':
      score = 25;
      break;
    case 'approved':
      score = 45;
      break;
    case 'processing':
      score = 55;
      break;
    case 'shipped':
      score = 75;
      break;
    case 'delivered':
    case 'completed':
      score = 95;
      break;
    case 'cancelled':
      score = 10;
      break;
  }

  // Payment status adjustment
  if (order.payment_status === 'partial') {
    score -= 15;
  } else if (order.payment_status === 'unpaid') {
    score -= 30;
  }

  // LINE binding penalty
  if (!order.line_user_id) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
};

const getHealthScoreColor = (score) => {
  if (score < 40) return D.color.error;
  if (score < 70) return D.color.warning;
  if (score < 90) return D.color.info;
  return D.color.success;
};

const getStatusTagColor = (status, paymentStatus, lineUserId) => {
  if (!lineUserId) return D.color.error;
  if (paymentStatus === 'unpaid' || paymentStatus === 'partial') return D.color.warning;
  if (status === 'shipped' || status === 'delivered' || status === 'completed')
    return D.color.success;
  if (status === 'pending_review' || status === 'approved') return D.color.info;
  return D.color.base;
};

const getStatusLabel = (status, paymentStatus, lineUserId) => {
  if (!lineUserId) return '未綁LINE';
  if (paymentStatus === 'unpaid') return '待收款';
  if (paymentStatus === 'partial') return '待收尾款';
  if (status === 'shipped') return '已出貨';
  if (status === 'delivered' || status === 'completed') return '已完成';
  if (status === 'pending_review' || status === 'approved') return '審核中';
  return '處理中';
};

const HealthScoreRing = ({ score, size = 48 }) => {
  const radius = size / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getHealthScoreColor(score);

  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={D.color.border}
        strokeWidth="2"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: `${size / 2}px ${size / 2}px` }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dy="0.3em"
        style={{
          fontSize: '10px',
          fontWeight: 600,
          fill: D.color.text,
          fontFamily: D.font.family,
        }}
      >
        {score}
      </text>
    </svg>
  );
};

const PaymentProgressBar = ({ paid, total }) => {
  const percentage = total > 0 ? (paid / total) * 100 : 0;
  const score = Math.round(percentage / 10) * 10;
  const color = getHealthScoreColor(score);

  return (
    <div
      style={{
        width: '100%',
        height: 6,
        backgroundColor: D.color.border,
        borderRadius: D.radius.sm,
        overflow: 'hidden',
        marginBottom: 8,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${percentage}%`,
          backgroundColor: color,
          transition: 'width 0.3s ease',
        }}
      />
      <div
        style={{
          fontSize: 12,
          color: D.color.textSecondary,
          marginTop: 4,
          fontFamily: D.font.family,
        }}
      >
        {Math.round(percentage)}% 已收
      </div>
    </div>
  );
};

const OrderCard = ({ order, isSelected, onSelect }) => {
  const score = calculateHealthScore(order);
  const percentage = order.total_amount > 0 ? (order.paid_amount / order.total_amount) * 100 : 0;
  const statusLabel = getStatusLabel(order.status, order.payment_status, order.line_user_id);

  return (
    <div
      onClick={() => onSelect(order.id)}
      style={{
        ...D.card,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        backgroundColor: isSelected ? D.color.surfaceHover : D.color.surface,
        borderColor: isSelected ? D.color.brand : D.color.border,
        borderWidth: isSelected ? 2 : 1,
        borderStyle: 'solid',
        padding: D.spacing[3],
        marginBottom: D.spacing[2],
        animation: 'fadeIn 0.3s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = D.color.surfaceHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isSelected ? D.color.surfaceHover : D.color.surface;
      }}
    >
      {/* Header: Name + Health Score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: D.spacing[2] }}>
        <div>
          <div
            style={{
              fontSize: D.fontSize.base,
              fontWeight: 600,
              color: D.color.text,
              marginBottom: 4,
              fontFamily: D.font.family,
            }}
          >
            {order.customer_name}
          </div>
          <div
            style={{
              fontSize: D.fontSize.sm,
              color: D.color.textSecondary,
              fontFamily: D.font.mono,
              letterSpacing: '0.5px',
            }}
          >
            #{order.order_no}
          </div>
        </div>
        <HealthScoreRing score={score} size={48} />
      </div>

      {/* Status Tag */}
      <div style={{ marginBottom: D.spacing[2] }}>
        <span
          style={{
            ...D.tag,
            backgroundColor: getStatusTagColor(order.status, order.payment_status, order.line_user_id),
            color: D.color.white,
            fontSize: D.fontSize.xs,
            padding: `${D.spacing[1]} ${D.spacing[1.5]}`,
            display: 'inline-block',
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Payment Progress */}
      <PaymentProgressBar paid={order.paid_amount || 0} total={order.total_amount} />

      {/* Footer: Amount + Date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: D.fontSize.xs, color: D.color.textSecondary, marginBottom: 4, fontFamily: D.font.family }}>
            金額
          </div>
          <div
            style={{
              fontSize: D.fontSize.lg,
              fontWeight: 700,
              color: D.color.brand,
              fontFamily: D.font.family,
            }}
          >
            NT${order.total_amount?.toLocaleString() || '0'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: D.fontSize.xs, color: D.color.textSecondary, marginBottom: 4, fontFamily: D.font.family }}>
            訂單日期
          </div>
          <div
            style={{
              fontSize: D.fontSize.sm,
              color: D.color.text,
              fontFamily: D.font.family,
            }}
          >
            {new Date(order.order_date).toLocaleDateString('zh-TW')}
          </div>
        </div>
      </div>
    </div>
  );
};

const SectionDivider = ({ title }) => (
  <div style={{ display: 'flex', alignItems: 'center', margin: `${D.spacing[4]} 0 ${D.spacing[2]} 0` }}>
    <div
      style={{
        flex: 1,
        height: 1,
        backgroundColor: D.color.border,
      }}
    />
    <div
      style={{
        fontSize: D.fontSize.sm,
        fontWeight: 600,
        color: D.color.textSecondary,
        padding: `0 ${D.spacing[2]}`,
        fontFamily: D.font.family,
      }}
    >
      {title}
    </div>
    <div
      style={{
        flex: 1,
        height: 1,
        backgroundColor: D.color.border,
      }}
    />
  </div>
);

const FilterPill = ({ label, isActive, onClick }) => (
  <button
    onClick={onClick}
    style={{
      ...D.pill,
      backgroundColor: isActive ? D.color.brand : D.color.surface,
      color: isActive ? D.color.white : D.color.text,
      border: `1px solid ${isActive ? D.color.brand : D.color.border}`,
      padding: `${D.spacing[1]} ${D.spacing[2]}`,
      fontSize: D.fontSize.sm,
      fontFamily: D.font.family,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      transition: 'all 0.2s ease',
    }}
    onMouseEnter={(e) => {
      if (!isActive) e.currentTarget.style.backgroundColor = D.color.surfaceHover;
    }}
    onMouseLeave={(e) => {
      if (!isActive) e.currentTarget.style.backgroundColor = D.color.surface;
    }}
  >
    {label}
  </button>
);

export default function OrderList({
  token,
  orders = [],
  loading = false,
  selectedOrderId = null,
  onSelectOrder = () => {},
  onRefresh = () => {},
}) {
  const [activeFilter, setActiveFilter] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');

  const filters = ['全部', '待收款', '本週出貨', '已完成'];

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (activeFilter !== '全部') {
        if (
          activeFilter === '待收款' &&
          order.payment_status === 'paid'
        )
          return false;
        if (activeFilter === '本週出貨' && order.status !== 'shipped')
          return false;
        if (activeFilter === '已完成' && order.status !== 'completed')
          return false;
      }

      if (
        searchQuery &&
        !order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !order.order_no.includes(searchQuery)
      ) {
        return false;
      }

      return true;
    });
  }, [orders, activeFilter, searchQuery]);

  const groupedOrders = useMemo(() => {
    const pending = filteredOrders.filter(
      (o) => ['draft', 'pending_review', 'approved'].includes(o.status)
    );
    const processing = filteredOrders.filter(
      (o) => ['processing', 'shipped'].includes(o.status)
    );

    return { pending, processing };
  }, [filteredOrders]);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: D.color.background,
      }}
    >
      {/* Search Bar */}
      <div
        style={{
          padding: D.spacing[3],
          borderBottom: `1px solid ${D.color.border}`,
        }}
      >
        <input
          type="text"
          placeholder="搜尋客戶名稱或訂單號"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: D.spacing[2],
            fontSize: D.fontSize.sm,
            border: `1px solid ${D.color.border}`,
            borderRadius: D.radius.md,
            backgroundColor: D.color.surface,
            color: D.color.text,
            fontFamily: D.font.family,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Filter Pills */}
      <div
        style={{
          display: 'flex',
          gap: D.spacing[2],
          padding: D.spacing[3],
          borderBottom: `1px solid ${D.color.border}`,
          overflowX: 'auto',
        }}
      >
        {filters.map((filter) => (
          <FilterPill
            key={filter}
            label={filter}
            isActive={activeFilter === filter}
            onClick={() => setActiveFilter(filter)}
          />
        ))}
      </div>

      {/* Orders List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: D.spacing[3],
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: D.spacing[4], color: D.color.textSecondary }}>
            加載中...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: D.spacing[4], color: D.color.textSecondary }}>
            未找到訂單
          </div>
        ) : (
          <>
            {groupedOrders.pending.length > 0 && (
              <>
                <SectionDivider title="需要處理" />
                {groupedOrders.pending.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isSelected={selectedOrderId === order.id}
                    onSelect={onSelectOrder}
                  />
                ))}
              </>
            )}

            {groupedOrders.processing.length > 0 && (
              <>
                <SectionDivider title="進行中" />
                {groupedOrders.processing.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isSelected={selectedOrderId === order.id}
                    onSelect={onSelectOrder}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
