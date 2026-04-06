'use client';
import { useState, useMemo } from 'react';
import D from './DealerStyles';

const fmtNT = (n) => `NT$${Number(n || 0).toLocaleString()}`;
const fmtDate = (d) => { if (!d) return '--'; const x = new Date(d); return `${x.getFullYear()}/${String(x.getMonth()+1).padStart(2,'0')}/${String(x.getDate()).padStart(2,'0')}`; };

const SHIP_LABEL = { pending: '待出貨', shipped: '已出貨', delivered: '已送達', cancelled: '已取消' };
const STATUS_LABEL = { draft: '草稿', pending: '待確認', pending_review: '待審', confirmed: '已確認', approved: '已核准', processing: '處理中', shipped: '已出貨', delivered: '已送達', completed: '已完成', cancelled: '已取消' };
const STATUS_TONE = { draft: 'default', pending: 'amber', pending_review: 'blue', confirmed: 'blue', approved: 'blue', processing: 'amber', shipped: 'brand', delivered: 'green', completed: 'green', cancelled: 'red' };

const PAY_METHODS = [
  { id: 'cash', label: '現金' },
  { id: 'transfer', label: '匯款' },
  { id: 'credit_card', label: '信用卡' },
  { id: 'monthly', label: '月結' },
];

/* ── Parse customer info from remark ── */
function parseCustomerInfo(remark = '') {
  const idx = remark.indexOf('｜客戶資訊｜');
  if (idx === -1) return { name: '', phone: '', note: '' };
  const block = remark.slice(idx + 7);
  const name = (block.match(/姓名：([^・\s]+)/) || [])[1] || '';
  const phone = (block.match(/電話：([^・\s]+)/) || [])[1] || '';
  const note = (block.match(/備註：(.+)/) || [])[1] || '';
  return { name, phone, note };
}

export default function OrderDetail({ order, token, dealerPost, onBack, onRefresh }) {
  if (!order) return null;

  const pct = order.total_amount > 0 ? Math.round(((order.paid_amount || 0) / order.total_amount) * 100) : 0;
  const remaining = (order.total_amount || 0) - (order.paid_amount || 0);

  const customerInfo = parseCustomerInfo(order.remark || '');

  const [form, setForm] = useState({
    end_customer_name: customerInfo.name,
    end_customer_phone: customerInfo.phone,
    payment_method: order.payment_method || '',
    dealer_note: customerInfo.note,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isNewOrder = ['pending', 'draft', 'pending_review'].includes(order.status);
  const needsInfo = !form.payment_method || !form.end_customer_name;

  const handleSave = async () => {
    if (!dealerPost) return;
    setSaving(true);
    try {
      await dealerPost({ action: 'update_my_order', token, order_id: order.id, ...form });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onRefresh && onRefresh();
    } catch (e) { console.error(e); alert('儲存失敗'); }
    finally { setSaving(false); }
  };

  /* ── Build timeline ── */
  const timeline = useMemo(() => {
    const ev = [];
    ev.push({ label: '訂單建立', time: order.created_at, done: true, color: D.color.success });
    if (['pending_review','confirmed','approved','processing','shipped','delivered','completed'].includes(order.status))
      ev.push({ label: '主系統收到訂單', time: order.review_at || order.created_at, done: true, color: D.color.success });
    if (['confirmed','approved','processing','shipped','delivered','completed'].includes(order.status))
      ev.push({ label: '已確認庫存', time: order.approved_at || order.created_at, done: true, color: D.color.success });
    if (['processing','shipped','delivered','completed'].includes(order.status))
      ev.push({ label: '備貨處理中', time: order.processing_at, done: true, color: D.color.success });
    if ((order.paid_amount || 0) > 0)
      ev.push({ label: `已收款 ${fmtNT(order.paid_amount)}`, time: order.payment_date, done: true, color: D.color.success });
    if (['shipped','delivered','completed'].includes(order.status))
      ev.push({ label: '已出貨', time: order.shipment?.shipped_at, done: true, color: D.color.success });
    if (['delivered','completed'].includes(order.status))
      ev.push({ label: '已送達', time: order.delivered_at, done: true, color: D.color.success });
    // Pending steps
    if (!['shipped','delivered','completed','cancelled'].includes(order.status))
      ev.push({ label: '安排出貨', time: null, done: false });
    if (remaining > 0)
      ev.push({ label: `待收尾款 ${fmtNT(remaining)}`, time: null, done: false, color: D.color.warning });
    return ev;
  }, [order]);

  return (
    <div style={{ padding: 16, paddingBottom: 100, background: D.color.bg, minHeight: '100%' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={D.color.text2} strokeWidth="2" strokeLinecap="round"><path d="M15 19l-7-7 7-7" /></svg>
          </button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ ...D.sectionLabel, marginBottom: 2 }}>ORDER</div>
          <div style={{ fontSize: D.size.h2, fontWeight: D.weight.bold, color: D.color.text, fontFamily: D.font.mono }}>{order.order_no || `#${order.id?.slice(0,8)}`}</div>
        </div>
        <span style={D.tag(STATUS_TONE[order.status] || 'default')}>{STATUS_LABEL[order.status] || order.status}</span>
      </div>

      {/* ── Alert: needs info ── */}
      {isNewOrder && needsInfo && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 12,
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: D.radius.md,
        }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <span style={{ fontSize: D.size.body, color: '#92400e', fontWeight: D.weight.semi }}>請填寫客戶資訊與結帳方式，以完成銷售流程</span>
        </div>
      )}

      {/* ── Customer Info + Payment Method Form ── */}
      <div style={{ ...D.card, padding: 16, marginBottom: 12 }}>
        <div style={{ ...D.sectionLabel, marginBottom: 14 }}>客戶資訊 & 結帳方式</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginBottom: 4 }}>客戶姓名</div>
            <input
              type="text"
              placeholder="輸入客戶姓名"
              value={form.end_customer_name}
              onChange={e => setForm(f => ({ ...f, end_customer_name: e.target.value }))}
              style={{ ...D.input, fontSize: D.size.caption, padding: '7px 10px' }}
            />
          </div>
          <div>
            <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginBottom: 4 }}>聯絡電話</div>
            <input
              type="tel"
              placeholder="電話號碼"
              value={form.end_customer_phone}
              onChange={e => setForm(f => ({ ...f, end_customer_phone: e.target.value }))}
              style={{ ...D.input, fontSize: D.size.caption, padding: '7px 10px' }}
            />
          </div>
        </div>

        {/* Payment method pills */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginBottom: 6 }}>結帳方式</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PAY_METHODS.map(m => (
              <button key={m.id} onClick={() => setForm(f => ({ ...f, payment_method: m.id }))}
                style={{
                  padding: '6px 16px', borderRadius: D.radius.full, cursor: 'pointer',
                  fontSize: D.size.caption, fontWeight: D.weight.semi, transition: 'all 0.15s',
                  border: `1px solid ${form.payment_method === m.id ? D.color.brand : D.color.border}`,
                  background: form.payment_method === m.id ? D.color.brandDim : D.color.card,
                  color: form.payment_method === m.id ? D.color.brand : D.color.text2,
                }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginBottom: 4 }}>備註（選填）</div>
          <input
            type="text"
            placeholder="特殊需求、送貨地址等"
            value={form.dealer_note}
            onChange={e => setForm(f => ({ ...f, dealer_note: e.target.value }))}
            style={{ ...D.input, fontSize: D.size.caption, padding: '7px 10px' }}
          />
        </div>

        <button onClick={handleSave} disabled={saving}
          style={{ ...D.btnPrimary, width: '100%', padding: '10px', fontWeight: D.weight.bold, opacity: saving ? 0.6 : 1 }}>
          {saving ? '儲存中...' : saved ? '✓ 已儲存' : '儲存資訊'}
        </button>
      </div>

      {/* ── Payment Progress Card ── */}
      <div style={{ ...D.card, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ ...D.sectionLabel, marginBottom: 0 }}>付款狀況</span>
          <span style={{ fontSize: D.size.caption, color: D.color.text3, fontFamily: D.font.mono, fontWeight: D.weight.semi }}>{pct}%</span>
        </div>
        <div style={{ height: 6, background: D.color.borderLight, borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ height: '100%', borderRadius: 3, transition: 'width 0.6s ease', width: `${pct}%`, background: pct >= 100 ? D.color.success : pct > 0 ? D.color.brand : 'transparent' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[
            { label: '訂單金額', value: fmtNT(order.total_amount), color: D.color.text },
            { label: '已付款', value: fmtNT(order.paid_amount), color: D.color.success },
            { label: '待收款', value: fmtNT(remaining), color: remaining > 0 ? D.color.warning : D.color.text3 },
            { label: '訂單日期', value: fmtDate(order.order_date || order.created_at), color: D.color.text },
          ].map((c, i) => (
            <div key={i}>
              <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: D.size.h3, fontWeight: D.weight.bold, color: c.color, fontFamily: D.font.mono }}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Product List ── */}
      <div style={{ ...D.card, padding: 16, marginBottom: 12 }}>
        <div style={{ ...D.sectionLabel, marginBottom: 14 }}>訂購商品</div>
        {(order.items || []).map((item, idx) => (
          <div key={idx} style={{
            display: 'flex', gap: 10, paddingBottom: 12, marginBottom: idx < (order.items?.length || 0) - 1 ? 12 : 0,
            borderBottom: idx < (order.items?.length || 0) - 1 ? `1px solid ${D.color.borderLight}` : 'none',
            alignItems: 'center',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: D.radius.sm, flexShrink: 0,
              background: item.po_ref === '[PREORDER]' ? '#fffbeb' : D.color.infoDim,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: item.po_ref === '[PREORDER]' ? '#d97706' : D.color.info,
              fontWeight: D.weight.bold, fontFamily: D.font.mono,
              border: item.po_ref === '[PREORDER]' ? '1px solid #fde68a' : 'none',
            }}>
              {item.po_ref === '[PREORDER]' ? '預定' : (item.item_number_snapshot || '').slice(0, 3)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: D.size.body, fontWeight: D.weight.medium, color: D.color.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.description_snapshot || item.item_number_snapshot}
              </div>
              <div style={{ fontSize: D.size.tiny, color: D.color.text3, fontFamily: D.font.mono, marginTop: 2 }}>
                {item.item_number_snapshot} · x{item.qty} @ {fmtNT(item.unit_price)}
              </div>
            </div>
            <div style={{ fontSize: D.size.body, fontWeight: D.weight.bold, color: D.color.text, fontFamily: D.font.mono, flexShrink: 0 }}>
              {fmtNT(item.line_total)}
            </div>
          </div>
        ))}
        {(!order.items || order.items.length === 0) && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: D.color.textDisabled, fontSize: D.size.body }}>尚無商品資料</div>
        )}
        <div style={{ borderTop: `1px solid ${D.color.borderLight}`, paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'flex-end', gap: 20 }}>
          <div style={{ fontSize: D.size.caption, color: D.color.text3 }}>合計</div>
          <div style={{ fontSize: D.size.h3, fontWeight: D.weight.black, color: D.color.brand, fontFamily: D.font.mono }}>{fmtNT(order.total_amount)}</div>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div style={{ ...D.card, padding: 16, marginBottom: 12 }}>
        <div style={{ ...D.sectionLabel, marginBottom: 16 }}>訂單進度</div>
        <div style={{ paddingLeft: 20, position: 'relative' }}>
          {timeline.map((ev, idx) => (
            <div key={idx} style={{ position: 'relative', paddingBottom: idx < timeline.length - 1 ? 20 : 0, paddingLeft: 16 }}>
              <div style={{
                position: 'absolute', left: -20, top: 3,
                width: 10, height: 10, borderRadius: '50%',
                background: ev.done ? (ev.color || D.color.success) : 'transparent',
                border: ev.done ? 'none' : `2px solid ${D.color.border}`,
              }}>
                {!ev.done && <div style={{ width: 4, height: 4, borderRadius: '50%', background: D.color.text3, position: 'absolute', top: 1, left: 1 }} />}
              </div>
              {idx < timeline.length - 1 && (
                <div style={{ position: 'absolute', left: -15, top: 16, width: 1, height: 'calc(100% - 12px)', background: D.color.borderLight }} />
              )}
              <div style={{ fontSize: D.size.body, fontWeight: ev.done ? D.weight.medium : D.weight.normal, color: ev.done ? D.color.text : D.color.text3, lineHeight: 1.3 }}>{ev.label}</div>
              {ev.time && <div style={{ fontSize: D.size.tiny, color: D.color.text3, fontFamily: D.font.mono, marginTop: 2 }}>{fmtDate(ev.time)}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
