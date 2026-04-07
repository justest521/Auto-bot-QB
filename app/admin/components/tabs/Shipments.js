'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP, fmtDate, exportCsv, getPresetDateRange, useResponsive } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, Pager, StatCard } from '../shared/ui';
import { useResizableColumns } from '../shared/ResizableTable';

const STATUS_MAP = { pending: '待出貨', packed: '已包裝', shipped: '已出貨', delivered: '已送達', returned: '已退回', cancelled: '已取消' };
const STATUS_COLOR = { pending: t.color.warning, packed: t.color.purple, shipped: t.color.link, delivered: t.color.brand, returned: t.color.error, cancelled: t.color.textMuted };
const cardStyle = { ...S.card, borderRadius: t.radius.lg, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #eaeff5' };
const labelStyle = { fontSize: t.fontSize.caption, fontWeight: t.fontWeight.semibold, color: '#b0b8c4', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 };

// ========== 出貨單明細頁 ==========
function ShipmentDetailView({ shipment: initShip, onBack, onRefresh }) {
  const { isMobile } = useResponsive();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [processing, setProcessing] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await apiGet({ action: 'shipment_detail', shipment_id: initShip.id });
        setDetail(result);
      } catch (e) {
        setMsg(e.message || '無法取得出貨單明細');
      } finally {
        setLoading(false);
      }
    })();
  }, [initShip.id]);

  const ship = detail?.shipment || initShip;
  const items = detail?.items || [];
  const order = detail?.order;
  const customer = detail?.customer;
  const statusKey = ship.status || 'pending';

  const updateStatus = async (newStatus, notifyLine = false) => {
    if (!confirm(`確定將狀態改為「${STATUS_MAP[newStatus]}」？`)) return;
    setProcessing(newStatus); setMsg('');
    try {
      await apiPost({ action: 'update_shipment_status', shipment_id: ship.id, status: newStatus, notify_line: notifyLine });
      setMsg(`已更新為 ${STATUS_MAP[newStatus]}`);
      const result = await apiGet({ action: 'shipment_detail', shipment_id: ship.id });
      setDetail(result);
      if (onRefresh) onRefresh();
    } catch (e) { setMsg(e.message || '更新失敗'); }
    finally { setProcessing(''); }
  };

  // Status flow buttons
  const nextActions = [];
  if (statusKey === 'pending') nextActions.push({ status: 'shipped', label: '標記出貨', color: t.color.link, notify: true });
  if (statusKey === 'shipped') nextActions.push({ status: 'delivered', label: '標記送達', color: t.color.brand, notify: true });
  if (statusKey !== 'cancelled' && statusKey !== 'delivered' && statusKey !== 'returned') nextActions.push({ status: 'cancelled', label: '取消出貨', color: t.color.error, notify: false });
  if (statusKey === 'delivered') nextActions.push({ status: 'returned', label: '退回', color: t.color.error, notify: false });

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', padding: isMobile ? '0' : '0 12px' }}>
      {/* Header */}
      <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: t.radius.md, border: '1px solid #e5e7eb', background: t.color.bgCard, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: t.color.textMuted, transition: 'all 0.15s', flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }} onMouseLeave={e => { e.currentTarget.style.background = t.color.bgCard; }}>&larr;</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: isMobile ? 16 : 22, fontWeight: 800, color: t.color.textPrimary, ...S.mono, letterSpacing: -0.5 }}>{ship.shipment_no || '-'}</span>
              <span style={{ padding: '3px 10px', borderRadius: t.radius.pill, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, background: `${STATUS_COLOR[statusKey] || t.color.textMuted}14`, color: STATUS_COLOR[statusKey] || t.color.textMuted, border: `1px solid ${STATUS_COLOR[statusKey] || t.color.textMuted}30` }}>
                {STATUS_MAP[statusKey] || statusKey}
              </span>
            </div>
            <div style={{ fontSize: t.fontSize.body, color: t.color.textDisabled, marginTop: 4, ...S.mono }}>
              {fmtDate(ship.ship_date || ship.created_at)}
              {ship.carrier && <span style={{ color: '#d1d5db' }}> &middot; </span>}
              {ship.carrier && <span>{ship.carrier}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {nextActions.map(a => (
            <button key={a.status} onClick={() => updateStatus(a.status, a.notify)} disabled={!!processing}
              style={{ ...(isMobile ? { flex: 1, minHeight: 44, minWidth: 0 } : {}), padding: isMobile ? '9px 12px' : '9px 22px', borderRadius: t.radius.lg, border: a.status === 'cancelled' || a.status === 'returned' ? `1px solid ${a.color}40` : 'none', background: a.status === 'cancelled' || a.status === 'returned' ? t.color.bgCard : `linear-gradient(135deg, ${a.color}, ${a.color}dd)`, color: a.status === 'cancelled' || a.status === 'returned' ? a.color : t.color.bgCard, fontSize: isMobile ? 12 : 14, fontWeight: t.fontWeight.bold, cursor: 'pointer', opacity: processing ? 0.7 : 1, transition: 'all 0.15s', boxShadow: a.status === 'cancelled' || a.status === 'returned' ? 'none' : `0 2px 8px ${a.color}40` }}>
              {processing === a.status ? '處理中...' : a.label}
            </button>
          ))}
        </div>
      </div>

      {msg && <div style={{ ...cardStyle, background: msg.includes('失敗') || msg.includes('錯誤') ? '#fff1f2' : '#edfdf3', borderColor: msg.includes('失敗') || msg.includes('錯誤') ? '#fecdd3' : '#bbf7d0', color: msg.includes('失敗') || msg.includes('錯誤') ? '#b42318' : '#15803d', marginBottom: 10, padding: '10px 16px', fontSize: t.fontSize.h3 }}>{msg}</div>}

      {loading ? <Loading /> : (
        isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Items */}
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f2f5' }}>
                <span style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textDisabled }}>出貨品項</span>
                <span style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.medium, color: '#b0b8c4', marginLeft: 8 }}>{items.length} 項</span>
              </div>
              {items.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {items.map((item, i) => (
                    <div key={item.id || i} style={{ padding: '12px 16px', borderTop: i > 0 ? '1px solid #f3f5f7' : 'none', background: t.color.bgCard }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>料號</span>
                        <span style={{ ...S.mono, fontSize: t.fontSize.body, color: t.color.textSecondary }}>{item.item_number || '-'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>品名</span>
                        <span style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.semibold, color: '#1f2937' }}>{item.description || '-'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>訂購數</span>
                        <span style={{ ...S.mono, fontSize: t.fontSize.body, color: t.color.textMuted }}>{item.order_qty || '-'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>出貨數</span>
                        <span style={{ ...S.mono, fontSize: t.fontSize.body, fontWeight: 800, color: '#059669' }}>{item.qty_shipped || 0}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: t.fontSize.tiny, color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>單價</span>
                        <span style={{ ...S.mono, fontSize: t.fontSize.body, color: t.color.textMuted }}>{fmtP(item.unit_price)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '50px 20px', textAlign: 'center', color: '#c4cad3', fontSize: t.fontSize.h3 }}>尚無出貨品項明細</div>
              )}
            </div>

            {/* Status timeline */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>狀態流程</div>
              <div style={{ display: 'flex', gap: 0, alignItems: 'center', flexWrap: 'wrap' }}>
                {['pending', 'shipped', 'delivered'].map((st, i) => {
                  const isActive = ['pending', 'packed', 'shipped', 'delivered'].indexOf(statusKey) >= i;
                  const isCurrent = statusKey === st;
                  return (
                    <div key={st} style={{ display: 'flex', alignItems: 'center' }}>
                      {i > 0 && <div style={{ width: 40, height: 2, background: isActive ? t.color.brand : t.color.border }} />}
                      <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, background: isCurrent ? STATUS_COLOR[st] : isActive ? t.color.successBg : '#f3f4f6', color: isCurrent ? t.color.bgCard : isActive ? '#15803d' : t.color.textDisabled, border: isCurrent ? 'none' : `2px solid ${isActive ? '#86efac' : t.color.border}` }}>
                        {i + 1}
                      </div>
                      <span style={{ marginLeft: 6, fontSize: t.fontSize.caption, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? STATUS_COLOR[st] : isActive ? '#15803d' : t.color.textDisabled }}>{STATUS_MAP[st]}</span>
                    </div>
                  );
                })}
                {(statusKey === 'cancelled' || statusKey === 'returned') && (
                  <div style={{ display: 'flex', alignItems: 'center', marginLeft: 16 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: t.fontSize.h3, background: t.color.errorBg, color: t.color.error }}>✕</div>
                    <span style={{ marginLeft: 6, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.error }}>{STATUS_MAP[statusKey]}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Logistics card */}
            <div style={{ ...cardStyle, padding: '10px 16px' }}>
              <div style={labelStyle}>物流資訊</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: '出貨單號', value: ship.shipment_no, mono: true },
                  { label: '物流商', value: ship.carrier },
                  { label: '追蹤編號', value: ship.tracking_no, mono: true },
                  { label: '出貨日期', value: fmtDate(ship.ship_date || ship.created_at), mono: true },
                  { label: '送貨地址', value: ship.shipping_address },
                  { label: '備註', value: ship.remark },
                ].filter(f => f.value).map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                    <span style={{ fontSize: t.fontSize.caption, color: '#b0b8c4', flexShrink: 0, fontWeight: t.fontWeight.medium }}>{f.label}</span>
                    <span style={{ fontSize: t.fontSize.h3, color: '#1f2937', textAlign: 'right', fontWeight: t.fontWeight.medium, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Order card */}
            {order && (
              <div style={{ ...cardStyle, padding: '10px 16px' }}>
                <div style={labelStyle}>關聯訂單</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: t.color.textPrimary, marginBottom: 10, ...S.mono }}>{order.order_no || '-'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: '訂單日期', value: order.order_date, mono: true },
                    { label: '訂單狀態', value: order.status },
                    { label: '出貨狀態', value: order.shipping_status },
                    { label: '訂單金額', value: fmtP(order.total_amount), mono: true },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                      <span style={{ fontSize: t.fontSize.caption, color: '#b0b8c4', flexShrink: 0, fontWeight: t.fontWeight.medium }}>{f.label}</span>
                      <span style={{ fontSize: t.fontSize.h3, color: '#1f2937', textAlign: 'right', fontWeight: t.fontWeight.medium, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Customer card */}
            {customer && (
              <div style={{ ...cardStyle, padding: '10px 16px' }}>
                <div style={labelStyle}>客戶資訊</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: t.color.textPrimary, marginBottom: 10, lineHeight: 1.3 }}>{customer.company_name || customer.name || '未命名客戶'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: '聯絡人', value: customer.name },
                    { label: '電話', value: customer.phone, mono: true },
                    { label: '地址', value: customer.address },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                      <span style={{ fontSize: t.fontSize.caption, color: '#b0b8c4', flexShrink: 0, fontWeight: t.fontWeight.medium }}>{f.label}</span>
                      <span style={{ fontSize: t.fontSize.h3, color: '#1f2937', textAlign: 'right', fontWeight: t.fontWeight.medium, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 10, alignItems: 'start' }}>
            {/* Left: Items */}
            <div>
              <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f2f5' }}>
                  <span style={{ fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold, color: t.color.textDisabled }}>出貨品項</span>
                  <span style={{ fontSize: t.fontSize.body, fontWeight: t.fontWeight.medium, color: '#b0b8c4', marginLeft: 8 }}>{items.length} 項</span>
                </div>
                {items.length > 0 ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '100px minmax(0,1fr) 75px 75px 90px', gap: 8, padding: '8px 16px', background: '#f8f9fb', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: '#b0b8c4', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      <div>料號</div><div>品名</div><div style={{ textAlign: 'center' }}>訂購數</div><div style={{ textAlign: 'center' }}>出貨數</div><div style={{ textAlign: 'right' }}>單價</div>
                    </div>
                    {items.map((item, i) => (
                      <div key={item.id || i} style={{ display: 'grid', gridTemplateColumns: '100px minmax(0,1fr) 75px 75px 90px', gap: 8, padding: '10px 16px', borderTop: '1px solid #f3f5f7', background: t.color.bgCard, transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = t.color.bgCard}>
                        <div style={{ ...S.mono, fontSize: t.fontSize.h3, color: t.color.textSecondary }}>{item.item_number || '-'}</div>
                        <div style={{ fontWeight: t.fontWeight.semibold, fontSize: t.fontSize.h3, color: '#1f2937', lineHeight: 1.4 }}>{item.description || '-'}</div>
                        <div style={{ textAlign: 'center', ...S.mono, fontSize: t.fontSize.h3, color: t.color.textMuted }}>{item.order_qty || '-'}</div>
                        <div style={{ textAlign: 'center', ...S.mono, fontSize: t.fontSize.h3, fontWeight: 800, color: '#059669' }}>{item.qty_shipped || 0}</div>
                        <div style={{ textAlign: 'right', ...S.mono, fontSize: t.fontSize.h3, color: t.color.textMuted }}>{fmtP(item.unit_price)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '50px 20px', textAlign: 'center', color: '#c4cad3', fontSize: t.fontSize.h3 }}>尚無出貨品項明細</div>
                )}
              </div>

              {/* Status timeline */}
              <div style={{ ...cardStyle, padding: '10px 16px' }}>
                <div style={labelStyle}>狀態流程</div>
                <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
                  {['pending', 'shipped', 'delivered'].map((st, i) => {
                    const isActive = ['pending', 'packed', 'shipped', 'delivered'].indexOf(statusKey) >= i;
                    const isCurrent = statusKey === st;
                    return (
                      <div key={st} style={{ display: 'flex', alignItems: 'center' }}>
                        {i > 0 && <div style={{ width: 40, height: 2, background: isActive ? t.color.brand : t.color.border }} />}
                        <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, background: isCurrent ? STATUS_COLOR[st] : isActive ? t.color.successBg : '#f3f4f6', color: isCurrent ? t.color.bgCard : isActive ? '#15803d' : t.color.textDisabled, border: isCurrent ? 'none' : `2px solid ${isActive ? '#86efac' : t.color.border}` }}>
                          {i + 1}
                        </div>
                        <span style={{ marginLeft: 6, fontSize: t.fontSize.caption, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? STATUS_COLOR[st] : isActive ? '#15803d' : t.color.textDisabled }}>{STATUS_MAP[st]}</span>
                      </div>
                    );
                  })}
                  {(statusKey === 'cancelled' || statusKey === 'returned') && (
                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 16 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: t.fontSize.h3, background: t.color.errorBg, color: t.color.error }}>✕</div>
                      <span style={{ marginLeft: 6, fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: t.color.error }}>{STATUS_MAP[statusKey]}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Logistics card */}
              <div style={{ ...cardStyle, padding: '10px 16px' }}>
                <div style={labelStyle}>物流資訊</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: '出貨單號', value: ship.shipment_no, mono: true },
                    { label: '物流商', value: ship.carrier },
                    { label: '追蹤編號', value: ship.tracking_no, mono: true },
                    { label: '出貨日期', value: fmtDate(ship.ship_date || ship.created_at), mono: true },
                    { label: '送貨地址', value: ship.shipping_address },
                    { label: '備註', value: ship.remark },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                      <span style={{ fontSize: t.fontSize.caption, color: '#b0b8c4', flexShrink: 0, fontWeight: t.fontWeight.medium }}>{f.label}</span>
                      <span style={{ fontSize: t.fontSize.h3, color: '#1f2937', textAlign: 'right', fontWeight: t.fontWeight.medium, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order card */}
              {order && (
                <div style={{ ...cardStyle, padding: '10px 16px' }}>
                  <div style={labelStyle}>關聯訂單</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: t.color.textPrimary, marginBottom: 10, ...S.mono }}>{order.order_no || '-'}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: '訂單日期', value: order.order_date, mono: true },
                      { label: '訂單狀態', value: order.status },
                      { label: '出貨狀態', value: order.shipping_status },
                      { label: '訂單金額', value: fmtP(order.total_amount), mono: true },
                    ].filter(f => f.value).map((f, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                        <span style={{ fontSize: t.fontSize.caption, color: '#b0b8c4', flexShrink: 0, fontWeight: t.fontWeight.medium }}>{f.label}</span>
                        <span style={{ fontSize: t.fontSize.h3, color: '#1f2937', textAlign: 'right', fontWeight: t.fontWeight.medium, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer card */}
              {customer && (
                <div style={{ ...cardStyle, padding: '10px 16px' }}>
                  <div style={labelStyle}>客戶資訊</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: t.color.textPrimary, marginBottom: 10, lineHeight: 1.3 }}>{customer.company_name || customer.name || '未命名客戶'}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: '聯絡人', value: customer.name },
                      { label: '電話', value: customer.phone, mono: true },
                      { label: '地址', value: customer.address },
                    ].filter(f => f.value).map((f, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f5f6f8' }}>
                        <span style={{ fontSize: t.fontSize.caption, color: '#b0b8c4', flexShrink: 0, fontWeight: t.fontWeight.medium }}>{f.label}</span>
                        <span style={{ fontSize: t.fontSize.h3, color: '#1f2937', textAlign: 'right', fontWeight: t.fontWeight.medium, ...(f.mono ? S.mono : {}), wordBreak: 'break-all' }}>{f.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ========== 出貨管理主元件 ==========
export default function Shipments() {
  const { isMobile } = useResponsive();
  const [data, setData] = useState({ shipments: [], total: 0, page: 1, limit: 30, summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getPresetDateRange('month').from);
  const [dateTo, setDateTo] = useState(() => getPresetDateRange('month').to);
  const [datePreset, setDatePreset] = useState('month');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ order_id: '', carrier: '', tracking_no: '', shipping_address: '', remark: '' });
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [pageSize, setPageSize] = useState(20);

  const { gridTemplate, ResizableHeader } = useResizableColumns('shipments_list', [40, 160, 140, 100, 200, 100, 100, 160]);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else { const range = getPresetDateRange(preset); setDateFrom(range.from); setDateTo(range.to); }
  };

  const load = useCallback(async (page = 1, q = search, st = statusF, df = dateFrom, dt = dateTo) => {
    setLoading(true);
    try { setData(await apiGet({ action: 'shipments', page: String(page), limit: String(pageSize), search: q, status: st, date_from: df, date_to: dt })); } finally { setLoading(false); }
  }, [search, statusF, dateFrom, dateTo, pageSize]);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try { await apiPost({ action: 'create_shipment', ...form }); setCreateOpen(false); setForm({ order_id: '', carrier: '', tracking_no: '', shipping_address: '', remark: '' }); load(); } catch (e) { alert(e.message); }
  };

  const handleStatus = async (e, id, status) => {
    e.stopPropagation();
    try { await apiPost({ action: 'update_shipment_status', shipment_id: id, status, notify_line: true }); load(); } catch (e2) { alert(e2.message); }
  };

  const handleExport = async () => {
    try {
      const result = await apiGet({ action: 'shipments', page: '1', search, status: statusF, date_from: dateFrom, date_to: dateTo, limit: '9999', export: 'true' });
      const rows = result.shipments || [];
      const columns = [
        { key: 'shipment_no', label: '出貨單號' },
        { key: 'customer_name', label: '客戶' },
        { key: (row) => (STATUS_MAP[row.status] || row.status), label: '狀態' },
        { key: (row) => row.ship_date || (row.created_at ? row.created_at.slice(0, 10) : '-'), label: '出貨日期' },
        { key: 'carrier', label: '物流商' },
        { key: 'tracking_no', label: '物流單號' },
        { key: 'remark', label: '備註' },
      ];
      exportCsv(rows, columns, `出貨_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { alert(e.message); }
  };

  // ★ 明細頁
  if (selectedShipment) {
    return (
      <ShipmentDetailView
        shipment={selectedShipment}
        onBack={() => { setSelectedShipment(null); load(); }}
        onRefresh={() => load()}
      />
    );
  }

  const sm = data.summary || {};

  return (
    <div>
      <PageLead eyebrow="Shipments" title="出貨管理" description="追蹤訂單出貨進度、物流資訊與到貨狀態。"
        action={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleExport} style={S.btnGhost}>匯出 CSV</button>
          <button onClick={() => setCreateOpen(true)} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}) }}>+ 建立出貨</button>
        </div>} />

      <div style={{ ...S.statGrid, gap: 10, marginBottom: 10, gridTemplateColumns: isMobile ? '1fr 1fr' : S.statGrid.gridTemplateColumns }}>
        <StatCard code="PEND" label="待出貨" value={fmt(sm.pending)} tone="blue" accent={t.color.warning} />
        <StatCard code="SHIP" label="已出貨" value={fmt(sm.shipped)} tone="blue" accent={t.color.link} />
        <StatCard code="DELV" label="已送達" value={fmt(sm.delivered)} tone="blue" accent={t.color.brand} />
      </div>

      {/* Filter bar */}
      <div style={{ ...S.card, marginBottom: 10, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['month', '本月'], ['quarter', '本季'], ['year', '本年'], ['all', '全部']].map(([key, label]) => (
            <button key={key} onClick={() => applyDatePreset(key)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: t.fontSize.body, background: datePreset === key ? t.color.link : t.color.bgCard, color: datePreset === key ? t.color.bgCard : '#4b5563', borderColor: datePreset === key ? t.color.link : t.color.border }}>{label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); }} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: isMobile ? '100%' : 150, fontSize: t.fontSize.body, padding: '6px 10px', ...S.mono }} />
          <span style={{ color: t.color.textMuted, fontSize: t.fontSize.body, display: isMobile ? 'none' : 'inline' }}>~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); }} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: isMobile ? '100%' : 150, fontSize: t.fontSize.body, padding: '6px 10px', ...S.mono }} />
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), width: isMobile ? '100%' : 150, fontSize: t.fontSize.body, padding: '6px 10px' }}>
            <option value="">全部狀態</option>
            <option value="pending">待出貨</option>
            <option value="shipped">已出貨</option>
            <option value="delivered">已送達</option>
            <option value="cancelled">已取消</option>
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search, statusF, dateFrom, dateTo)} placeholder="搜尋..." style={{ ...S.input, ...(isMobile ? S.mobile.input : {}), flex: 1, minWidth: 160, fontSize: t.fontSize.body, padding: '6px 10px' }} />
          <button onClick={() => load(1, search, statusF, dateFrom, dateTo)} style={{ ...S.btnPrimary, ...(isMobile ? S.mobile.btnPrimary : {}), padding: '6px 18px', fontSize: t.fontSize.body }}>查詢</button>
        </div>
      </div>

      {/* Shipment list as table or cards */}
      {loading ? <Loading /> : data.shipments.length === 0 ? <EmptyState text="目前沒有出貨記錄" /> : (
        isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.shipments.map((s, idx) => (
              <div key={s.id} onClick={() => setSelectedShipment(s)} style={{ ...S.mobileCard, padding: '12px', cursor: 'pointer' }}>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>出貨單號</span>
                  <span style={{ ...S.mobileCardValue, fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono }}>{s.shipment_no || '-'}</span>
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>客戶</span>
                  <span style={S.mobileCardValue}>{s.customer_name || '-'}</span>
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>物流商</span>
                  <span style={S.mobileCardValue}>{s.carrier || '-'}</span>
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>追蹤編號</span>
                  <span style={{ ...S.mobileCardValue, ...S.mono }}>{s.tracking_no || '-'}</span>
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>出貨日期</span>
                  <span style={{ ...S.mobileCardValue, ...S.mono }}>{s.ship_date || (s.created_at ? s.created_at.slice(0, 10) : '-')}</span>
                </div>
                <div style={S.mobileCardRow}>
                  <span style={S.mobileCardLabel}>狀態</span>
                  <span style={S.mobileCardValue}><span style={{ padding: '3px 10px', borderRadius: t.radius.pill, fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, background: `${STATUS_COLOR[s.status] || t.color.textMuted}14`, color: STATUS_COLOR[s.status] || t.color.textMuted, border: `1px solid ${STATUS_COLOR[s.status] || t.color.textMuted}30` }}>{STATUS_MAP[s.status] || s.status}</span></span>
                </div>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e5e7eb', display: 'flex', gap: 6, flexDirection: 'column' }}>
                  {s.status === 'pending' && <button onClick={(e) => handleStatus(e, s.id, 'shipped')} style={{ ...S.btnGhost, minHeight: 44, width: '100%', borderColor: '#93c5fd', color: t.color.link }}>出貨</button>}
                  {s.status === 'shipped' && <button onClick={(e) => handleStatus(e, s.id, 'delivered')} style={{ ...S.btnGhost, minHeight: 44, width: '100%', borderColor: '#86efac', color: t.color.brand }}>送達</button>}
                  {s.status !== 'cancelled' && s.status !== 'delivered' && s.status !== 'returned' && <button onClick={(e) => handleStatus(e, s.id, 'cancelled')} style={{ ...S.btnGhost, minHeight: 44, width: '100%', borderColor: '#fecaca', color: t.color.error }}>取消</button>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ ...S.card, padding: 0, overflowX: 'auto', border: '1px solid #d1d5db' }}>
            {/* Table header */}
            <ResizableHeader headers={[
              { label: '#', align: 'center' },
              { label: '出貨單號', align: 'center' },
              { label: '客戶', align: 'center' },
              { label: '物流商', align: 'center' },
              { label: '追蹤編號', align: 'center' },
              { label: '出貨日期', align: 'center' },
              { label: '狀態', align: 'center' },
              { label: '操作', align: 'center' },
            ]} />
            {/* Table rows */}
            {data.shipments.map((s, idx) => {
              const cell = { padding: '8px 10px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', fontSize: t.fontSize.body };
              const cCenter = { ...cell, justifyContent: 'center' };
              const cLastCell = { ...cell, borderRight: 'none' };
              const cLastCenterCell = { ...cCenter, borderRight: 'none' };
              return (
              <div key={s.id} onClick={() => setSelectedShipment(s)}
                style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: 0, background: t.color.bgCard, cursor: 'pointer', transition: 'background 0.1s', borderBottom: idx < data.shipments.length - 1 ? '1px solid #e5e7eb' : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = t.color.bgCard}>
                <div style={{ color: '#b0b8c4', fontWeight: t.fontWeight.medium, ...cCenter }}>{(data.page * (data.limit || pageSize)) + idx + 1}</div>
                <div style={{ fontWeight: t.fontWeight.bold, color: t.color.link, ...S.mono, ...cCenter }}>{s.shipment_no || '-'}</div>
                <div style={{ color: t.color.textSecondary, ...cell }}>{s.customer_name || '-'}</div>
                <div style={{ color: t.color.textSecondary, ...cell }}>{s.carrier || '-'}</div>
                <div style={{ color: t.color.textSecondary, ...S.mono, ...cell }}>{s.tracking_no || '-'}</div>
                <div style={{ color: t.color.textMuted, ...S.mono, ...cCenter }}>{s.ship_date || (s.created_at ? s.created_at.slice(0, 10) : '-')}</div>
                <div style={{ ...cCenter }}>
                  <span style={{ padding: '3px 10px', borderRadius: t.radius.pill, fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, background: `${STATUS_COLOR[s.status] || t.color.textMuted}14`, color: STATUS_COLOR[s.status] || t.color.textMuted, border: `1px solid ${STATUS_COLOR[s.status] || t.color.textMuted}30` }}>
                    {STATUS_MAP[s.status] || s.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center', ...cLastCenterCell }}>
                  {s.status === 'pending' && <button onClick={(e) => handleStatus(e, s.id, 'shipped')} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: t.fontSize.tiny, borderColor: '#93c5fd', color: t.color.link }}>出貨</button>}
                  {s.status === 'shipped' && <button onClick={(e) => handleStatus(e, s.id, 'delivered')} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: t.fontSize.tiny, borderColor: '#86efac', color: t.color.brand }}>送達</button>}
                  {s.status !== 'cancelled' && s.status !== 'delivered' && s.status !== 'returned' && <button onClick={(e) => handleStatus(e, s.id, 'cancelled')} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: t.fontSize.tiny, borderColor: '#fecaca', color: t.color.error }}>取消</button>}
                </div>
              </div>
              );
            })}
          </div>
        )
      )}

      <div style={{ marginTop: 12 }}>
        <Pager page={data.page} limit={data.limit || pageSize} total={data.total} onPageChange={(p) => load(p, search, statusF, dateFrom, dateTo)} />
      </div>

      {/* Create modal */}
      {createOpen && (
        <div style={{ ...(isMobile ? S.mobileModalOverlay : { position: 'fixed', inset: 0, background: t.color.overlay, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }) }}>
          <div style={{ ...S.card, ...(isMobile ? S.mobileModal : {}), width: isMobile ? undefined : 440, maxWidth: '90vw', borderRadius: isMobile ? 0 : 14, padding: isMobile ? '16px' : '16px 18px 20px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: t.fontSize.h2, fontWeight: t.fontWeight.bold }}>建立出貨單</h3>
            {[
              { key: 'order_id', label: '訂單 ID', type: 'text' },
              { key: 'carrier', label: '物流商', type: 'text' },
              { key: 'tracking_no', label: '物流單號', type: 'text' },
              { key: 'shipping_address', label: '送貨地址', type: 'text' },
              { key: 'remark', label: '備註', type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={S.label}>{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={{ ...S.input, ...(isMobile ? S.mobile.input : {}) }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: isMobile ? 'stretch' : 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
              <button onClick={() => setCreateOpen(false)} style={{ ...S.btnGhost, ...(isMobile ? { minHeight: 44, flex: 1 } : {}) }}>取消</button>
              <button onClick={handleCreate} style={{ ...S.btnPrimary, ...(isMobile ? { minHeight: 44, flex: 1 } : {}) }}>建立出貨</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
