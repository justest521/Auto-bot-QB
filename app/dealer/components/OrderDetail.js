'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import D from './DealerStyles';

const fmtNT = (n) => `NT$${Number(n || 0).toLocaleString()}`;
const fmtDate = (d) => { if (!d) return '--'; const x = new Date(d); return `${x.getFullYear()}/${String(x.getMonth()+1).padStart(2,'0')}/${String(x.getDate()).padStart(2,'0')}`; };

const STATUS_LABEL = { draft: '草稿', pending: '待確認', pending_review: '待審', confirmed: '已確認', approved: '已核准', processing: '處理中', shipped: '已出貨', delivered: '已送達', completed: '已完成', cancelled: '已取消' };
const STATUS_TONE = { draft: 'default', pending: 'amber', pending_review: 'blue', confirmed: 'blue', approved: 'blue', processing: 'amber', shipped: 'brand', delivered: 'green', completed: 'green', cancelled: 'red' };

const PAY_METHODS = [
  { id: 'cash', label: '現金' },
  { id: 'transfer', label: '匯款' },
  { id: 'credit_card', label: '信用卡' },
  { id: 'monthly', label: '月結' },
];

/* ── Parse customer info block from remark ── */
function parseCustomerInfo(remark = '') {
  const idx = remark.indexOf('｜客戶資訊｜');
  if (idx === -1) return {};
  const block = remark.slice(idx + 7);
  return {
    name:    (block.match(/姓名：([^・\n]+)/) || [])[1]?.trim() || '',
    phone:   (block.match(/電話：([^・\n]+)/) || [])[1]?.trim() || '',
    email:   (block.match(/Email：([^・\n]+)/) || [])[1]?.trim() || '',
    address: (block.match(/地址：([^・\n]+)/) || [])[1]?.trim() || '',
    note:    (block.match(/備註：([^・\n]+)/) || [])[1]?.trim() || '',
  };
}

/* ── Customer search dropdown (sales role only) ── */
function CustomerSearch({ token, dealerGet, dealerPost, onSelect }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (q.length < 1) { setResults([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await dealerGet({ action: 'search_customers', token, q });
        setResults(res.customers || []);
        setOpen(true);
      } catch {}
      finally { setLoading(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  const handleCreate = async () => {
    if (!q.trim()) return;
    try {
      const res = await dealerPost({ action: 'create_customer', token, name: q.trim() });
      if (res?.customer) { onSelect(res.customer); setQ(''); setOpen(false); }
    } catch { alert('新增失敗'); }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={D.color.textDisabled} strokeWidth="2" strokeLinecap="round"
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input type="text" placeholder="搜尋主系統客戶名稱、電話、統編..." value={q}
          onChange={e => { setQ(e.target.value); }}
          onFocus={() => results.length > 0 && setOpen(true)}
          style={{ ...D.input, fontSize: D.size.caption, paddingLeft: 30, padding: '7px 10px 7px 30px' }}
          autoComplete="off"
        />
        {loading && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: D.color.text3 }}>…</span>}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 400, background: '#fff', border: `1px solid ${D.color.border}`, borderRadius: D.radius.md, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
          {results.map(c => (
            <div key={c.id} onMouseDown={() => { onSelect(c); setQ(''); setOpen(false); }}
              style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: `1px solid ${D.color.borderLight}` }}
              onMouseEnter={e => e.currentTarget.style.background = D.color.muted}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <div style={{ fontWeight: D.weight.semi, fontSize: D.size.caption, color: D.color.text }}>{c.company_name || c.name}</div>
              <div style={{ fontSize: 10, color: D.color.text3, marginTop: 2, display: 'flex', gap: 10 }}>
                {c.phone && <span>📞 {c.phone}</span>}
                {c.tax_id && <span>統編 {c.tax_id}</span>}
                {c.address && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>📍 {c.address}</span>}
              </div>
            </div>
          ))}
          {!loading && results.length === 0 && q.length > 0 && (
            <div onMouseDown={handleCreate}
              style={{ padding: '9px 12px', cursor: 'pointer', fontSize: D.size.caption, color: D.color.brand, fontWeight: D.weight.semi, display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              新增「{q}」並同步到主系統
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrderDetail({ order, token, user, dealerGet, dealerPost, onBack, onRefresh }) {
  // ── All hooks must run unconditionally (no early return before hooks) ──
  const canSearchCustomers = user?.role === 'sales' || user?.role === 'technician';

  const [form, setForm] = useState({
    customer_id: '',
    end_customer_name: '',
    end_customer_phone: '',
    end_customer_email: '',
    end_customer_address: '',
    payment_method: '',
    dealer_note: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [linkedCustomer, setLinkedCustomer] = useState(null);
  const [formInitialized, setFormInitialized] = useState(false);

  // Initialize form from order data (runs when order.id changes)
  useEffect(() => {
    if (!order) return;
    const ci = parseCustomerInfo(order.remark || '');
    const lc = order.linked_customer;
    setForm({
      customer_id: order.customer_id || '',
      end_customer_name:    ci.name    || lc?.company_name || lc?.name    || '',
      end_customer_phone:   ci.phone   || lc?.phone   || '',
      end_customer_email:   ci.email   || lc?.email   || '',
      end_customer_address: ci.address || lc?.address || '',
      payment_method: order.payment_method || '',
      dealer_note: ci.note || '',
    });
    setLinkedCustomer(lc || (order.customer_id ? { id: order.customer_id, company_name: '' } : null));
    setFormInitialized(true);
  }, [order?.id]);

  // ── Now safe to early return ──
  if (!order) return null;

  const pct = order.total_amount > 0 ? Math.round(((order.paid_amount || 0) / order.total_amount) * 100) : 0;
  const remaining = (order.total_amount || 0) - (order.paid_amount || 0);
  const isNewOrder = ['pending', 'draft', 'pending_review'].includes(order.status);
  const needsInfo = !form.payment_method || !form.end_customer_name;

  const handleSelectCustomer = (c) => {
    setLinkedCustomer(c);
    setForm(f => ({
      ...f,
      customer_id: c.id,
      end_customer_name: c.company_name || c.name || f.end_customer_name,
      end_customer_phone: c.phone || f.end_customer_phone,
      end_customer_email: c.email || f.end_customer_email,
      end_customer_address: c.address || f.end_customer_address,
    }));
  };

  const handleSave = async () => {
    if (!dealerPost) return;
    setSaving(true);
    try {
      await dealerPost({ action: 'update_my_order', token, order_id: order.id, ...form });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onRefresh && onRefresh();
    } catch (e) { console.error(e); alert('儲存失敗'); }
    finally { setSaving(false); }
  };

  /* ── Timeline ── */
  const timeline = useMemo(() => {
    const ev = [];
    ev.push({ label: '訂單建立', sub: fmtDate(order.created_at), done: true });
    if (['pending_review','confirmed','approved','processing','shipped','delivered','completed'].includes(order.status))
      ev.push({ label: '主系統收到訂單', sub: fmtDate(order.review_at || order.created_at), done: true });
    if (['confirmed','approved','processing','shipped','delivered','completed'].includes(order.status))
      ev.push({ label: '庫存確認', sub: fmtDate(order.approved_at), done: true });
    if (['processing','shipped','delivered','completed'].includes(order.status))
      ev.push({ label: '備貨處理中', sub: fmtDate(order.processing_at), done: true });
    if ((order.paid_amount || 0) > 0)
      ev.push({ label: `已收款 ${fmtNT(order.paid_amount)}`, sub: fmtDate(order.payment_date), done: true, accent: D.color.success });
    if (['shipped','delivered','completed'].includes(order.status))
      ev.push({ label: '已出貨', sub: fmtDate(order.shipment?.shipped_at), done: true });
    if (['delivered','completed'].includes(order.status))
      ev.push({ label: '已送達完成', sub: fmtDate(order.delivered_at), done: true, accent: D.color.success });
    // Pending
    if (!['shipped','delivered','completed','cancelled'].includes(order.status))
      ev.push({ label: '等待出貨安排', done: false });
    if (remaining > 0 && order.status !== 'cancelled')
      ev.push({ label: `待收尾款 ${fmtNT(remaining)}`, done: false, accent: D.color.warning });
    return ev;
  }, [order]);

  const F = ({ label, children, span = 1 }) => (
    <div style={{ gridColumn: `span ${span}` }}>
      <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div style={{ padding: 16, paddingBottom: 60, background: D.color.bg, minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
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

      {/* Alert: needs info */}
      {isNewOrder && needsInfo && (
        <div style={{ display: 'flex', gap: 10, padding: '10px 14px', marginBottom: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: D.radius.md }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <span style={{ fontSize: D.size.body, color: '#92400e', fontWeight: D.weight.semi }}>請填寫客戶資訊與結帳方式，以完成銷售流程</span>
        </div>
      )}

      {/* ── Customer Info & Payment Card ── */}
      <div style={{ ...D.card, padding: 16, marginBottom: 12 }}>
        <div style={{ ...D.sectionLabel, marginBottom: 14 }}>客戶資訊 & 結帳方式</div>

        {/* Sales / Technician role: search + linked customer badge */}
        {canSearchCustomers && dealerGet && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginBottom: 4 }}>
              搜尋主系統客戶
              {linkedCustomer?.id && <span style={{ marginLeft: 8, color: D.color.brand }}>✓ 已連結</span>}
            </div>
            {linkedCustomer?.id && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: D.color.brandDim, borderRadius: D.radius.md, marginBottom: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={D.color.brand} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: D.size.caption, color: D.color.brand, fontWeight: D.weight.semi }}>
                    {linkedCustomer.company_name || linkedCustomer.name || '已連結客戶'}
                  </span>
                  {linkedCustomer.tax_id && <span style={{ marginLeft: 8, fontSize: 10, color: D.color.text3 }}>統編 {linkedCustomer.tax_id}</span>}
                  {linkedCustomer.phone && <span style={{ marginLeft: 8, fontSize: 10, color: D.color.text3 }}>📞 {linkedCustomer.phone}</span>}
                </div>
                <button onClick={() => { setLinkedCustomer(null); setForm(f => ({ ...f, customer_id: '' })); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.color.brand, fontSize: 14, padding: '0 4px' }}>×</button>
              </div>
            )}
            <CustomerSearch token={token} dealerGet={dealerGet} dealerPost={dealerPost} onSelect={handleSelectCustomer} />
          </div>
        )}

        {/* Fields grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <F label="客戶姓名 / 公司名稱">
            <input type="text" placeholder="輸入客戶名稱" value={form.end_customer_name}
              onChange={e => setForm(f => ({ ...f, end_customer_name: e.target.value }))}
              style={{ ...D.input, fontSize: D.size.caption, padding: '7px 10px' }} />
          </F>
          <F label="聯絡電話">
            <input type="tel" placeholder="電話號碼" value={form.end_customer_phone}
              onChange={e => setForm(f => ({ ...f, end_customer_phone: e.target.value }))}
              style={{ ...D.input, fontSize: D.size.caption, padding: '7px 10px' }} />
          </F>
          <F label="Email">
            <input type="email" placeholder="電子郵件（選填）" value={form.end_customer_email}
              onChange={e => setForm(f => ({ ...f, end_customer_email: e.target.value }))}
              style={{ ...D.input, fontSize: D.size.caption, padding: '7px 10px' }} />
          </F>
          <F label="送貨地址">
            <input type="text" placeholder="送貨地址（選填）" value={form.end_customer_address}
              onChange={e => setForm(f => ({ ...f, end_customer_address: e.target.value }))}
              style={{ ...D.input, fontSize: D.size.caption, padding: '7px 10px' }} />
          </F>
        </div>

        {/* Payment method */}
        <F label="結帳方式">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {PAY_METHODS.map(m => (
              <button key={m.id} onClick={() => setForm(f => ({ ...f, payment_method: m.id }))}
                style={{
                  padding: '6px 18px', borderRadius: D.radius.full, cursor: 'pointer', fontSize: D.size.caption, fontWeight: D.weight.semi, transition: 'all 0.15s',
                  border: `1px solid ${form.payment_method === m.id ? D.color.brand : D.color.border}`,
                  background: form.payment_method === m.id ? D.color.brandDim : D.color.card,
                  color: form.payment_method === m.id ? D.color.brand : D.color.text2,
                }}>
                {m.label}
              </button>
            ))}
          </div>
        </F>

        {/* Note */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginBottom: 4 }}>備註（選填）</div>
          <input type="text" placeholder="特殊需求、備注等" value={form.dealer_note}
            onChange={e => setForm(f => ({ ...f, dealer_note: e.target.value }))}
            style={{ ...D.input, fontSize: D.size.caption, padding: '7px 10px' }} />
        </div>

        <button onClick={handleSave} disabled={saving}
          style={{ ...D.btnPrimary, width: '100%', padding: '11px', fontWeight: D.weight.bold, marginTop: 14, opacity: saving ? 0.6 : 1 }}>
          {saving ? '儲存中...' : saved ? '✓ 已儲存' : '儲存資訊'}
        </button>
      </div>

      {/* ── Payment Status Card ── */}
      <div style={{ ...D.card, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ ...D.sectionLabel, marginBottom: 0 }}>付款狀況</span>
          <span style={{ fontSize: D.size.caption, color: D.color.text3, fontFamily: D.font.mono }}>{pct}%</span>
        </div>
        <div style={{ height: 6, background: D.color.borderLight, borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: pct >= 100 ? D.color.success : pct > 0 ? D.color.brand : 'transparent', transition: 'width 0.6s' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: '訂單金額', value: fmtNT(order.total_amount), color: D.color.text },
            { label: '已付款', value: fmtNT(order.paid_amount), color: D.color.success },
            { label: '待收款', value: fmtNT(remaining), color: remaining > 0 ? D.color.warning : D.color.text3 },
            { label: '訂單日期', value: fmtDate(order.order_date || order.created_at), color: D.color.text },
          ].map((c, i) => (
            <div key={i}>
              <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginBottom: 3 }}>{c.label}</div>
              <div style={{ fontSize: D.size.h3, fontWeight: D.weight.bold, color: c.color, fontFamily: D.font.mono }}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Items ── */}
      <div style={{ ...D.card, padding: 16, marginBottom: 12 }}>
        <div style={{ ...D.sectionLabel, marginBottom: 14 }}>訂購商品</div>
        {(order.items || []).map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 10, paddingBottom: 12, marginBottom: idx < (order.items.length - 1) ? 12 : 0, borderBottom: idx < (order.items.length - 1) ? `1px solid ${D.color.borderLight}` : 'none', alignItems: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: D.radius.sm, flexShrink: 0, background: item.po_ref === '[PREORDER]' ? '#fffbeb' : D.color.infoDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: item.po_ref === '[PREORDER]' ? '#d97706' : D.color.info, fontWeight: D.weight.bold, fontFamily: D.font.mono, border: item.po_ref === '[PREORDER]' ? '1px solid #fde68a' : 'none' }}>
              {item.po_ref === '[PREORDER]' ? '預定' : (item.item_number_snapshot || '').slice(0, 3)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: D.size.body, fontWeight: D.weight.medium, color: D.color.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description_snapshot || item.item_number_snapshot}</div>
              <div style={{ fontSize: D.size.tiny, color: D.color.text3, fontFamily: D.font.mono, marginTop: 2 }}>{item.item_number_snapshot} · x{item.qty} @ {fmtNT(item.unit_price)}</div>
            </div>
            <div style={{ fontSize: D.size.body, fontWeight: D.weight.bold, color: D.color.text, fontFamily: D.font.mono, flexShrink: 0 }}>{fmtNT(item.line_total)}</div>
          </div>
        ))}
        {(!order.items || order.items.length === 0) && <div style={{ textAlign: 'center', padding: '20px 0', color: D.color.textDisabled }}>尚無商品資料</div>}
        <div style={{ borderTop: `1px solid ${D.color.borderLight}`, paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'flex-end', gap: 16, alignItems: 'baseline' }}>
          <span style={{ fontSize: D.size.caption, color: D.color.text3 }}>合計</span>
          <span style={{ fontSize: D.size.h3, fontWeight: D.weight.black, color: D.color.brand, fontFamily: D.font.mono }}>{fmtNT(order.total_amount)}</span>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div style={{ ...D.card, padding: 16 }}>
        <div style={{ ...D.sectionLabel, marginBottom: 16 }}>訂單進度</div>
        <div style={{ paddingLeft: 20, position: 'relative' }}>
          {timeline.map((ev, idx) => (
            <div key={idx} style={{ position: 'relative', paddingBottom: idx < timeline.length - 1 ? 18 : 0, paddingLeft: 16 }}>
              <div style={{ position: 'absolute', left: -20, top: 3, width: 10, height: 10, borderRadius: '50%', background: ev.done ? (ev.accent || D.color.success) : 'transparent', border: ev.done ? 'none' : `2px solid ${D.color.border}` }} />
              {idx < timeline.length - 1 && <div style={{ position: 'absolute', left: -15, top: 16, width: 1, height: 'calc(100% - 12px)', background: D.color.borderLight }} />}
              <div style={{ fontSize: D.size.body, fontWeight: ev.done ? D.weight.medium : D.weight.normal, color: ev.done ? D.color.text : D.color.text3 }}>{ev.label}</div>
              {ev.sub && ev.sub !== '--' && <div style={{ fontSize: D.size.tiny, color: D.color.text3, fontFamily: D.font.mono, marginTop: 2 }}>{ev.sub}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
