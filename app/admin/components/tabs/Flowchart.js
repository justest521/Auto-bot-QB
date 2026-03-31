'use client';
import { useState, useEffect, useCallback } from 'react';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { apiGet } from '@/lib/admin/api';
import { useResponsive } from '@/lib/admin/helpers';

// ═══════════════════════════════════════════════════
// Layout: clean top-down, two parallel lanes
// Left lane = 客戶/銷售    Right lane = 廠商/採購
// Center = 商品/庫存
// ═══════════════════════════════════════════════════

const W = 116, H = 78, GX = 138, GY = 112;
const px = (col) => 50 + col * GX;
const py = (row) => 40 + row * GY;

const NODES = [
  // ── Row 0: Master Data ──
  { id: 'customers',  label: '客 戶', sub: '客戶主檔', icon: '👤', col: 1, row: 0, color: t.color.info, tab: 'customers' },
  { id: 'vendors',    label: '廠 商', sub: '廠商主檔', icon: '🏭', col: 4, row: 0, color: t.color.purple, tab: 'vendors' },
  { id: 'products',   label: '商 品', sub: '產品查價', icon: '📦', col: 6, row: 0, color: t.color.brand, tab: 'products' },

  // ── Row 1: Documents (銷售 left | 採購 right) ──
  { id: 'quotes',      label: '報價單',   sub: '建立報價',   icon: '📋', col: 0, row: 1, color: t.color.warning, tab: 'quotes' },
  { id: 'sales',       label: '銷 貨',    sub: '銷貨開立',   icon: '💰', col: 1, row: 1, color: t.color.warning, tab: 'sales_documents' },
  { id: 'returns_s',   label: '銷貨退回', sub: '退貨管理',   icon: '↩️', col: 2, row: 1, color: t.color.error, tab: 'returns' },
  { id: 'purchase',    label: '採 購',    sub: '採購單',     icon: '🛒', col: 4, row: 1, color: t.color.success, tab: 'purchase_orders' },
  { id: 'stock_in',    label: '進 貨',    sub: '進貨入庫',   icon: '📥', col: 5, row: 1, color: t.color.success, tab: 'stock_in' },
  { id: 'returns_p',   label: '進貨退出', sub: '退回廠商',   icon: '📤', col: 6, row: 1, color: t.color.error, tab: 'purchase_returns' },
  { id: 'adjustments', label: '調整商品', sub: '調整單',     icon: '🔧', col: 7, row: 1, color: t.color.info, tab: 'stock_adjustments' },

  // ── Row 2: Downstream actions ──
  { id: 'orders',     label: '訂 單',   sub: '確認訂購',   icon: '📝', col: 0, row: 2, color: t.color.warning, tab: 'orders' },
  { id: 'payments',   label: '收 款',   sub: '收款管理',   icon: '💵', col: 1, row: 2, color: t.color.warning, tab: 'payments' },
  { id: 'shipments',  label: '出 貨',   sub: '出貨管理',   icon: '🚚', col: 2, row: 2, color: t.color.warning, tab: 'shipments' },
  { id: 'vendor_pay', label: '付 款',   sub: '廠商付款',   icon: '🏦', col: 5, row: 2, color: t.color.success, tab: 'vendor_payments' },
  { id: 'stocktake',  label: '盤點精靈', sub: '盤點作業',   icon: '📊', col: 7, row: 2, color: t.color.info, tab: 'stocktake' },

  // ── Row 3: Reports ──
  { id: 'inventory', label: '庫存總覽', sub: '即時庫存',   icon: '🏬', col: 3, row: 3, color: t.color.info, tab: 'inventory' },
  { id: 'psi',      label: '進銷存報表', sub: '綜合報表', icon: '📈', col: 4, row: 3, color: t.color.info, tab: 'psi_report' },
  { id: 'finance',  label: '財務報表', sub: '損益分析',   icon: '📉', col: 5, row: 3, color: t.color.info, tab: 'financial_report' },

  // ── Row 4: Approvals (bottom center) ──
  { id: 'approvals', label: '審批簽核', sub: '簽核管理', icon: '✅', col: 3, row: 2, color: t.color.purple, tab: 'approvals' },
  { id: 'alerts',    label: '庫存警示', sub: '補貨建議', icon: '⚠️', col: 6, row: 2, color: t.color.error, tab: 'stock_alerts' },
  { id: 'profit',    label: '利潤分析', sub: '毛利統計', icon: '💎', col: 6, row: 3, color: t.color.info, tab: 'profit_analysis' },
];

// ═══ Arrows: only straight orthogonal lines ═══
// type: 'v' = vertical, 'h' = horizontal (default = auto)
// waypoints: array of [x,y] for L-shaped routing
const ARROWS = [
  // ── 客戶 → 銷售文件 ──
  { from: 'customers', to: 'quotes',  label: '' },
  { from: 'customers', to: 'sales',   label: '' },
  // ── 廠商 → 採購文件 ──
  { from: 'vendors', to: 'purchase',  label: '' },
  { from: 'vendors', to: 'stock_in',  label: '' },
  // ── 商品 → 調整 ──
  { from: 'products', to: 'returns_p', label: '' },
  { from: 'products', to: 'adjustments', label: '' },

  // ── 銷售鏈：報價→訂單, 銷貨→收款 ──
  { from: 'quotes', to: 'orders',    label: '轉訂單' },
  { from: 'sales',  to: 'payments',  label: '收款' },
  { from: 'sales',  to: 'shipments', label: '', route: 'down-right' },

  // ── 採購鏈 ──
  { from: 'stock_in', to: 'vendor_pay', label: '付款' },

  // ── 庫存匯入 ──
  { from: 'sales',       to: 'inventory', label: '-庫存',  route: 'down-right' },
  { from: 'stock_in',    to: 'inventory', label: '+庫存',  route: 'down-left' },
  { from: 'adjustments', to: 'inventory', label: '±調整',  route: 'down-left' },

  // ── 報表 ──
  { from: 'inventory', to: 'psi',     label: '' },
  { from: 'inventory', to: 'finance', label: '', route: 'right' },
];

const nodeMap = {};

export default function Flowchart({ setTab }) {
  const { isMobile } = useResponsive();
  const [hovered, setHovered] = useState(null);
  const [stats, setStats] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const [qRes, oRes, poRes] = await Promise.all([
          apiGet({ action: 'quotes', page: '1', limit: '1' }),
          apiGet({ action: 'orders', page: '1', limit: '1' }),
          apiGet({ action: 'purchase_orders', page: '1', limit: '1' }),
        ]);
        setStats({ quotes: qRes.total || 0, orders: oRes.total || 0, purchase: poRes.total || 0 });
      } catch (e) { /* */ }
    })();
  }, []);

  NODES.forEach(n => { nodeMap[n.id] = n; });

  const totalW = 50 + 8 * GX + 20;
  const totalH = 40 + 4 * GY + 20;

  // Helper: node center + edges
  const nc = (id) => {
    const n = nodeMap[id];
    if (!n) return { x: 0, y: 0, t: 0, b: 0, l: 0, r: 0 };
    const x = px(n.col) + W / 2, y = py(n.row) + H / 2;
    return { x, y, t: py(n.row), b: py(n.row) + H, l: px(n.col), r: px(n.col) + W };
  };

  // Build arrow path (orthogonal only)
  const buildPath = (arrow) => {
    const f = nc(arrow.from), to = nc(arrow.to);
    if (!f.x || !to.x) return null;
    const fn = nodeMap[arrow.from], tn = nodeMap[arrow.to];

    // Same column → vertical
    if (fn.col === tn.col) {
      const x = f.x;
      return { path: `M ${x} ${f.b} L ${x} ${to.t}`, lx: x, ly: (f.b + to.t) / 2 };
    }
    // Same row → horizontal
    if (fn.row === tn.row) {
      if (tn.col > fn.col) {
        const y = f.y;
        return { path: `M ${f.r} ${y} L ${to.l} ${y}`, lx: (f.r + to.l) / 2, ly: y - 10 };
      } else {
        const y = f.y;
        return { path: `M ${f.l} ${y} L ${to.r} ${y}`, lx: (f.l + to.r) / 2, ly: y - 10 };
      }
    }
    // Different row & col → L-shaped
    if (fn.row < tn.row) {
      // Go down first, then horizontal
      const midY = f.b + (to.t - f.b) / 2;
      if (tn.col > fn.col) {
        return {
          path: `M ${f.x} ${f.b} L ${f.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.t}`,
          lx: (f.x + to.x) / 2, ly: midY - 10,
        };
      } else {
        return {
          path: `M ${f.x} ${f.b} L ${f.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.t}`,
          lx: (f.x + to.x) / 2, ly: midY - 10,
        };
      }
    }
    // up
    const midY = to.b + (f.t - to.b) / 2;
    return {
      path: `M ${f.x} ${f.t} L ${f.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.b}`,
      lx: (f.x + to.x) / 2, ly: midY - 10,
    };
  };

  const ROW_BANDS = [
    { row: 0, label: '基礎資料', color: t.color.textMuted },
    { row: 1, label: '單據作業', color: t.color.warning },
    { row: 2, label: '後續處理', color: t.color.success },
    { row: 3, label: '報表總覽', color: t.color.info },
  ];

  // Section bracket lines
  const BRACKETS = [
    { label: '客戶 / 銷售', cols: [0, 2], row: 1, color: t.color.warning },
    { label: '廠商 / 採購', cols: [4, 6], row: 1, color: t.color.success },
    { label: '倉儲', cols: [7, 7], row: 1, color: t.color.info },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={S.eyebrow}>SYSTEM FLOWCHART</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.color.textPrimary }}>系統流程圖</div>
        </div>
        <div style={{ fontSize: t.fontSize.caption, color: t.color.textDisabled }}>點擊節點跳轉對應功能</div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { color: t.color.warning, label: '銷售出貨' },
          { color: t.color.success, label: '採購進貨' },
          { color: t.color.info, label: '倉儲管理' },
          { color: t.color.purple, label: '審批簽核' },
          { color: t.color.info, label: '分析報表' },
          { color: t.color.error, label: '退貨 / 警示' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
            <span style={{ fontSize: t.fontSize.caption, color: t.color.textMuted, fontWeight: t.fontWeight.semibold }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Flowchart */}
      <div style={{ background: '#fff', borderRadius: t.radius.lg, border: `1px solid ${t.color.border}`, overflow: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', ...(isMobile ? { WebkitOverflowScrolling: 'touch' } : {}) }}>
        <div style={{ position: 'relative', width: isMobile ? 'min-content' : totalW, minHeight: totalH, margin: '0 auto', padding: '10px 0', minWidth: '100%' }}>

          {/* SVG layer */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: totalW, height: totalH, pointerEvents: 'none' }}>
            <defs>
              <marker id="ah" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
                <polygon points="0 0, 7 2.5, 0 5" fill={t.color.textMuted} />
              </marker>
              <marker id="ah-hi" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
                <polygon points="0 0, 7 2.5, 0 5" fill={t.color.info} />
              </marker>
            </defs>

            {/* Row bands */}
            {ROW_BANDS.map(rb => (
              <rect key={rb.row} x={20} y={py(rb.row) - 8} width={totalW - 40} height={H + 16} rx={10} fill={rb.color} opacity={0.035} />
            ))}

            {/* Section bracket labels */}
            {BRACKETS.map((br, i) => {
              const x1 = px(br.cols[0]);
              const x2 = px(br.cols[1]) + W;
              const y = py(br.row) - 16;
              return (
                <g key={i}>
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke={br.color} strokeWidth={2} opacity={0.3} />
                  <line x1={x1} y1={y} x2={x1} y2={y + 6} stroke={br.color} strokeWidth={2} opacity={0.3} />
                  <line x1={x2} y1={y} x2={x2} y2={y + 6} stroke={br.color} strokeWidth={2} opacity={0.3} />
                  <text x={(x1 + x2) / 2} y={y - 6} textAnchor="middle" fontSize={13} fontWeight={700} fill={br.color} opacity={0.6}>
                    {br.label}
                  </text>
                </g>
              );
            })}

            {/* Arrows */}
            {ARROWS.map((arrow, i) => {
              const result = buildPath(arrow);
              if (!result) return null;
              const hi = hovered === arrow.from || hovered === arrow.to;
              return (
                <g key={i}>
                  <path
                    d={result.path}
                    fill="none"
                    stroke={hi ? t.color.info : t.color.border}
                    strokeWidth={hi ? 2.5 : 1.5}
                    markerEnd={hi ? 'url(#ah-hi)' : 'url(#ah)'}
                    style={{ transition: 'all 0.2s' }}
                  />
                  {arrow.label && (
                    <g>
                      <rect x={result.lx - 24} y={result.ly - 9} width={48} height={16} rx={3} fill="#fff" opacity={0.9} />
                      <text x={result.lx} y={result.ly + 3} textAnchor="middle" fontSize={11} fontWeight={700} fill={hi ? t.color.info : t.color.textMuted}>{arrow.label}</text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Row labels */}
          {ROW_BANDS.map(rb => (
            <div key={rb.row} style={{
              position: 'absolute', left: 20, top: py(rb.row) + H / 2 - 12,
              fontSize: t.fontSize.caption, fontWeight: t.fontWeight.bold, color: rb.color, opacity: 0.5,
              writingMode: 'vertical-rl', letterSpacing: 2,
            }}>
              {rb.label}
            </div>
          ))}

          {/* Node cards */}
          {NODES.map(node => {
            const x = px(node.col), y = py(node.row);
            const hi = hovered === node.id;
            const count = stats[node.id];
            return (
              <div
                key={node.id}
                onClick={() => setTab?.(node.tab)}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  position: 'absolute', left: x, top: y, width: W, height: H,
                  borderRadius: t.radius.lg,
                  background: hi ? `${node.color}0c` : '#fff',
                  border: `2px solid ${hi ? node.color : t.color.border}`,
                  boxShadow: hi ? `0 6px 20px ${node.color}18` : '0 1px 4px rgba(0,0,0,0.04)',
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                  transition: 'all 0.15s ease',
                  transform: hi ? 'translateY(-2px) scale(1.05)' : 'none',
                  zIndex: hi ? 10 : 1,
                }}
              >
                <div style={{ fontSize: 22, lineHeight: 1 }}>{node.icon}</div>
                <div style={{ fontSize: t.fontSize.h3, fontWeight: 800, color: node.color, marginTop: 2 }}>{node.label}</div>
                <div style={{ fontSize: t.fontSize.tiny, color: t.color.textDisabled, fontWeight: t.fontWeight.medium }}>{node.sub}</div>
                {count > 0 && (
                  <div style={{
                    position: 'absolute', top: -6, right: -6,
                    background: node.color, color: '#fff',
                    fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.bold, padding: '2px 6px', borderRadius: t.radius.lg,
                    minWidth: 20, textAlign: 'center', boxShadow: `0 2px 6px ${node.color}40`,
                  }}>{count}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Compact workflow summary */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
        {[
          { icon: '📦', label: '銷售', text: '報價→訂單→銷貨→出貨→收款', bg: t.color.warningBg, border: '#fde68a', color: t.color.textMuted },
          { icon: '🏭', label: '採購', text: '缺貨→採購→進貨入庫→付款', bg: t.color.successBg, border: t.color.border, color: t.color.brand },
          { icon: '🔄', label: '退貨', text: '銷退→加庫存 ｜ 進退→扣庫存', bg: t.color.infoBg, border: t.color.infoBg, color: t.color.info },
          { icon: '✅', label: '審批', text: '訂單/採購/銷貨→送審→通過', bg: t.color.warningBg, border: t.color.borderLight, color: '#6b21a8' },
        ].map(c => (
          <div key={c.label} style={{ flex: isMobile ? 1 : 1, minWidth: isMobile ? '100%' : 200, background: c.bg, border: `1px solid ${c.border}`, borderRadius: t.radius.lg, padding: '10px 14px' }}>
            <span style={{ fontSize: t.fontSize.body, fontWeight: 800, color: c.color }}>{c.icon} {c.label}</span>
            <span style={{ fontSize: t.fontSize.caption, color: c.color, marginLeft: 8, opacity: 0.8 }}>{c.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
