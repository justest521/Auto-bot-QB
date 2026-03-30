'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { apiGet } from '@/lib/admin/api';

const FOCUS_KEYS = {
  sale: 'qb_sales_document_focus',
  po: 'qb_purchase_order_focus',
  order: 'qb_order_focus',
  quote: 'qb_quote_focus',
  shipment: 'qb_shipment_focus',
};

const TAB_NAMES = {
  sale: 'sales_documents',
  po: 'purchase_orders',
  order: 'orders',
  quote: 'quotes',
  shipment: 'shipments',
  payment: '收款管理',
  invoice: 'accounts_receivable',
};

function fmtTime(t) {
  if (!t) return '';
  const d = new Date(t);
  if (isNaN(d.getTime())) return typeof t === 'string' ? t.slice(0, 10) : '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * DocumentTimeline — 共用的完整單據關聯鏈時間軸
 * @param {{ type: 'quote'|'order'|'sale'|'invoice', id: string, setTab?: function, title?: string }} props
 */
export function DocumentTimeline({ type, id, setTab, title = '單據記錄' }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!type || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiGet({ action: 'document_chain', type, id });
        if (!cancelled) setEntries(res.chain || []);
      } catch (_) {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [type, id]);

  if (loading) return <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>載入記錄中...</div>;
  if (!entries.length) return <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>暫無記錄</div>;

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#111827', marginBottom: 10 }}>{title}</div>
      <div style={{ position: 'relative', paddingLeft: 18 }}>
        {entries.map((e, i) => {
          const isLast = i === entries.length - 1;
          const isCurrent = e.status === 'current' || e.status === 'warning';
          return (
            <div key={i} style={{ position: 'relative', paddingBottom: isLast ? 0 : 14, minHeight: isLast ? 'auto' : 28 }}>
              {!isLast && <div style={{ position: 'absolute', left: -11, top: 10, width: 2, bottom: 0, background: '#e5e7eb' }} />}
              <div style={{ position: 'absolute', left: -14, top: 3, width: isCurrent ? 10 : 8, height: isCurrent ? 10 : 8, borderRadius: '50%', background: e.dot, border: '2px solid #fff', boxShadow: isCurrent ? `0 0 0 3px ${e.dot}25` : `0 0 0 1.5px ${e.dot}30` }} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', lineHeight: 1.3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: e.status === 'done' ? '#1f2937' : e.status === 'rejected' ? '#dc2626' : isCurrent ? '#1d4ed8' : '#9ca3af' }}>{e.label}</span>
                {e.ref && (() => {
                  const focusKey = FOCUS_KEYS[e.refType];
                  const tabName = TAB_NAMES[e.refType];
                  const clickHandler = focusKey && tabName && setTab ? () => { window.localStorage.setItem(focusKey, e.ref); setTab(tabName); } : null;
                  return <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', ...S.mono, cursor: clickHandler ? 'pointer' : 'default', textDecoration: clickHandler ? 'underline' : 'none' }} onClick={clickHandler}>{e.ref}</span>;
                })()}
                {e.detail && <span style={{ fontSize: 11, fontWeight: 600, color: e.detailColor || (e.status === 'done' ? '#6b7280' : e.status === 'warning' ? '#92400e' : '#9ca3af'), background: isCurrent || e.status === 'warning' ? `${e.dot}14` : 'transparent', padding: isCurrent || e.status === 'warning' ? '1px 6px' : 0, borderRadius: 4 }}>{e.detail}</span>}
              </div>
              {e.badges && e.badges.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                  {e.badges.map((b, bi) => (
                    <span key={bi} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}>{b.item} {b.text}</span>
                  ))}
                </div>
              )}
              {e.note && <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: e.lineSent ? '#16a34a' : '#d97706', background: e.lineSent ? '#f0fdf4' : '#fffbeb', padding: '2px 8px', borderRadius: 4, display: 'inline-block', border: `1px solid ${e.lineSent ? '#bbf7d0' : '#fde68a'}` }}>{e.note}</div>}
              {e.time && <div style={{ fontSize: 10, color: '#b0b5bf', marginTop: 1, ...S.mono }}>{fmtTime(e.time)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
