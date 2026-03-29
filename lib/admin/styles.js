// ═══════════════════════════════════════════════════════════
//  QB ERP — 全域樣式 + RWD 響應式支援
// ═══════════════════════════════════════════════════════════

const S = {
  // ── 基底 ──
  page: { minHeight: '100vh', background: '#f5f6f7', color: '#111827', fontFamily: "'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  shell: { display: 'flex', minHeight: '100vh' },
  sidebar: { width: 250, background: '#ffffff', color: '#6b7280', padding: '16px 0 12px', borderRight: '1px solid #e5e7eb', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#f5f6f7' },
  header: { minHeight: 52, background: '#ffffff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 28px', position: 'sticky', top: 0, zIndex: 100 },
  content: { flex: 1, padding: '20px 28px 32px', minHeight: 'calc(100vh - 52px)' },

  // ── 卡片與面板 ──
  card: { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.25s ease' },
  panelMuted: { background: '#eeeeee', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px' },

  // ── 表單元素 ──
  input: { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 12px', color: '#111827', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: "'Noto Sans TC', sans-serif", transition: 'border-color 0.2s, box-shadow 0.2s' },
  btnPrimary: { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif", letterSpacing: 0.2, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'background 0.15s, box-shadow 0.15s' },
  btnGhost: { background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif", transition: 'border-color 0.15s, background 0.15s' },
  btnLine: { background: '#06c755', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13, boxShadow: '0 1px 3px rgba(6,199,85,0.3)' },
  label: { color: '#6b7280', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, letterSpacing: 0.5 },
  mono: { fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace", letterSpacing: 0.3 },

  // ── 頁面結構 ──
  pageLead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 16 },
  pageTitle: { fontSize: 20, fontWeight: 700, color: '#111827', letterSpacing: -0.3, marginBottom: 2 },
  pageDesc: { fontSize: 13, color: '#6b7280', lineHeight: 1.6, maxWidth: 760 },
  eyebrow: { fontSize: 11, color: '#16a34a', fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4, fontFamily: "'SF Mono', 'Fira Code', monospace" },

  // ── Grid ──
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 },
  twoCol: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, alignItems: 'start' },

  // ── Tag ──
  tag: (color) => ({ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: color === 'green' ? '#dcfce7' : color === 'red' ? '#fee2e2' : color === 'line' ? '#dcfce7' : color === 'gray' ? '#f9fafb' : '#f3f4f6', color: color === 'green' ? '#16a34a' : color === 'red' ? '#ef4444' : color === 'line' ? '#16a34a' : color === 'gray' ? '#b0b7c3' : '#374151', border: 'none' }),

  // ═══════════════════════════════════════════════════════════
  //  RWD 響應式工具
  // ═══════════════════════════════════════════════════════════

  // 手機版覆蓋樣式：傳入 isMobile 回傳對應樣式
  mobile: {
    // 手機版 header：縮小 padding
    header: { padding: '6px 14px', minHeight: 48 },
    // 手機版 content：縮小 padding + 底部留空給 bottomNav
    content: { padding: '14px 12px 90px' },
    // 手機版 card：縮小 padding
    card: { padding: '12px 14px', borderRadius: 10 },
    // 手機版 input：加大觸控區域
    input: { padding: '10px 12px', fontSize: 14, minHeight: 44 },
    // 手機版 button：加大觸控區域
    btnPrimary: { padding: '12px 16px', fontSize: 14, minHeight: 44, width: '100%' },
    btnGhost: { padding: '10px 14px', fontSize: 14, minHeight: 44 },
    // 手機版 stat grid：2 欄
    statGrid: { gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
    // 手機版 twoCol：單欄堆疊
    twoCol: { gridTemplateColumns: '1fr' },
    // 手機版 pageLead：堆疊
    pageLead: { flexDirection: 'column', gap: 10 },
  },

  // 平板版覆蓋
  tablet: {
    header: { padding: '6px 18px' },
    content: { padding: '18px 16px 32px' },
    statGrid: { gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' },
    twoCol: { gridTemplateColumns: '1fr 1fr' },
  },

  // ── 響應式合併工具函式 ──
  // 用法: S.r(S.card, isMobile, S.mobile.card)
  // 或:   S.responsive(S.card, { isMobile, isTablet })
  r: (base, condition, override) => condition ? { ...base, ...override } : base,

  responsive: (base, { isMobile, isTablet } = {}) => {
    const key = Object.keys(S).find(k => S[k] === base);
    if (!key) return base;
    if (isMobile && S.mobile?.[key]) return { ...base, ...S.mobile[key] };
    if (isTablet && S.tablet?.[key]) return { ...base, ...S.tablet[key] };
    return base;
  },

  // ── 底部導航列 ──
  bottomNav: {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
    background: '#ffffff', borderTop: '1px solid #e5e7eb',
    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    padding: '4px 0 calc(4px + env(safe-area-inset-bottom))',
    boxShadow: '0 -2px 10px rgba(0,0,0,0.06)',
  },
  bottomNavItem: (active) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '6px 12px', cursor: 'pointer', fontSize: 10, fontWeight: active ? 700 : 400,
    color: active ? '#16a34a' : '#9ca3af', background: 'none', border: 'none',
    minWidth: 56, transition: 'color 0.15s',
  }),
  bottomNavIcon: (active) => ({
    fontSize: 20, lineHeight: 1, color: active ? '#16a34a' : '#9ca3af',
  }),

  // ── 手機抽屜式 sidebar（全螢幕覆蓋）──
  mobileDrawer: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,
    display: 'flex', flexDirection: 'column',
  },
  mobileDrawerBackdrop: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.4)', zIndex: 10000,
  },
  mobileDrawerPanel: {
    position: 'fixed', top: 0, left: 0, bottom: 0, width: '85%', maxWidth: 320,
    background: '#fff', zIndex: 10001, overflowY: 'auto',
    boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
    padding: '16px 0 12px',
    transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
  },

  // ── 手機版表格→卡片 ──
  mobileCard: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
    padding: '12px 14px', marginBottom: 8,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  mobileCardRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '3px 0', fontSize: 13,
  },
  mobileCardLabel: { color: '#6b7280', fontSize: 12, flexShrink: 0, minWidth: 60 },
  mobileCardValue: { color: '#111827', fontWeight: 500, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  // ── 手機版 Modal → 全螢幕 / 底部抽屜 ──
  mobileModal: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: '#f5f6f7', zIndex: 10000, overflowY: 'auto',
    display: 'flex', flexDirection: 'column',
  },
  mobileModalHeader: {
    position: 'sticky', top: 0, zIndex: 10,
    background: '#fff', borderBottom: '1px solid #e5e7eb',
    padding: '12px 16px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', minHeight: 48,
  },
  mobileModalBody: { flex: 1, padding: '16px 14px 90px', overflowY: 'auto' },
  mobileModalFooter: {
    position: 'sticky', bottom: 0, background: '#fff',
    borderTop: '1px solid #e5e7eb', padding: '12px 16px',
    paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
  },

  // ── 底部抽屜（半螢幕）──
  bottomSheet: {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10001,
    background: '#fff', borderRadius: '16px 16px 0 0',
    boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
    maxHeight: '85vh', overflowY: 'auto',
    paddingBottom: 'env(safe-area-inset-bottom)',
    transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
  },
  bottomSheetHandle: {
    width: 40, height: 4, borderRadius: 2, background: '#d1d5db',
    margin: '8px auto 4px',
  },

  // ── 表格橫向可滑動容器 ──
  tableScroll: {
    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
    margin: '0 -14px', padding: '0 14px',
  },
};

export default S;
