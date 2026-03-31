'use client';

// QB Dealer Portal — Design Tokens (Light Theme)
// iPad-first responsive design with mobile fallback

const D = {};

D.font = {
  base: "'Noto Sans TC', 'Inter', -apple-system, sans-serif",
  mono: "'IBM Plex Mono', 'JetBrains Mono', monospace",
};

D.color = {
  // backgrounds
  bg: '#f5f6f7',
  card: '#ffffff',
  cardHover: '#fafbfc',
  muted: '#f9fafb',
  panel: '#f3f4f6',
  // brand
  brand: '#16a34a',
  brandLight: '#dcfce7',
  brandDim: 'rgba(22,163,74,0.08)',
  // status
  success: '#10b981',
  successDim: 'rgba(16,185,129,0.08)',
  warning: '#f59e0b',
  warningDim: 'rgba(245,158,11,0.08)',
  error: '#ef4444',
  errorDim: 'rgba(239,68,68,0.08)',
  info: '#3b82f6',
  infoDim: 'rgba(59,130,246,0.08)',
  // text
  text: '#111827',
  text2: '#374151',
  text3: '#6b7280',
  textDisabled: '#9ca3af',
  // border
  border: '#e5e7eb',
  borderLight: '#f0f2f5',
  // overlay
  overlay: 'rgba(0,0,0,0.4)',
};

D.size = {
  h1: 22,
  h2: 17,
  h3: 14,
  body: 13,
  caption: 12,
  tiny: 11,
  badge: 10,
};

D.weight = {
  normal: 400,
  medium: 500,
  semi: 600,
  bold: 700,
  black: 800,
};

D.radius = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  full: 999,
};

D.space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

// ── Component Presets ──

D.card = {
  background: D.color.card,
  border: `1px solid ${D.color.border}`,
  borderRadius: D.radius.lg,
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

D.cardActive = {
  ...D.card,
  borderColor: D.color.brand,
  boxShadow: '0 0 0 2px rgba(22,163,74,0.12)',
};

D.input = {
  background: D.color.card,
  border: `1px solid ${D.color.border}`,
  borderRadius: D.radius.md,
  padding: '10px 14px',
  color: D.color.text,
  fontSize: D.size.body,
  fontFamily: D.font.base,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

D.btnPrimary = {
  background: D.color.brand,
  color: '#fff',
  border: 'none',
  borderRadius: D.radius.md,
  padding: '10px 18px',
  fontWeight: D.weight.semi,
  cursor: 'pointer',
  fontSize: D.size.body,
  fontFamily: D.font.base,
  transition: 'background 0.15s, transform 0.1s',
};

D.btnGhost = {
  background: D.color.card,
  color: D.color.text2,
  border: `1px solid ${D.color.border}`,
  borderRadius: D.radius.md,
  padding: '9px 16px',
  cursor: 'pointer',
  fontSize: D.size.body,
  fontFamily: D.font.base,
  transition: 'border-color 0.15s, background 0.15s',
};

D.label = {
  fontSize: D.size.tiny,
  color: D.color.text3,
  fontFamily: D.font.mono,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontWeight: D.weight.medium,
};

D.mono = {
  fontFamily: D.font.mono,
  letterSpacing: '0.02em',
};

D.tag = (tone = 'default') => {
  const tones = {
    green: { bg: D.color.successDim, color: D.color.success, border: 'rgba(16,185,129,0.2)' },
    red: { bg: D.color.errorDim, color: D.color.error, border: 'rgba(239,68,68,0.2)' },
    amber: { bg: D.color.warningDim, color: D.color.warning, border: 'rgba(245,158,11,0.2)' },
    blue: { bg: D.color.infoDim, color: D.color.info, border: 'rgba(59,130,246,0.2)' },
    brand: { bg: D.color.brandDim, color: D.color.brand, border: 'rgba(22,163,74,0.2)' },
    default: { bg: D.color.muted, color: D.color.text3, border: D.color.border },
  };
  const s = tones[tone] || tones.default;
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: D.size.tiny,
    fontFamily: D.font.mono,
    fontWeight: D.weight.medium,
    borderRadius: D.radius.xs,
    padding: '2px 8px',
    background: s.bg,
    color: s.color,
    border: `1px solid ${s.border}`,
    whiteSpace: 'nowrap',
  };
};

// ── Pill filter preset ──
D.pill = (active = false, tone = 'brand') => {
  const base = {
    flexShrink: 0,
    padding: '6px 14px',
    borderRadius: D.radius.full,
    border: `1px solid ${D.color.border}`,
    background: D.color.card,
    fontSize: D.size.caption,
    color: D.color.text3,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontFamily: D.font.base,
    fontWeight: D.weight.medium,
  };
  if (!active) return base;
  const tones = {
    brand: { bg: D.color.brandDim, border: D.color.brand, color: D.color.brand },
    amber: { bg: D.color.warningDim, border: D.color.warning, color: D.color.warning },
    red: { bg: D.color.errorDim, border: D.color.error, color: D.color.error },
  };
  const s = tones[tone] || tones.brand;
  return { ...base, background: s.bg, borderColor: s.border, color: s.color, fontWeight: D.weight.semi };
};

// ── TabBar preset ──
D.tabBar = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  background: D.color.card,
  borderTop: `1px solid ${D.color.border}`,
  display: 'flex',
  padding: '8px 0',
  paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
  zIndex: 100,
};

D.tabItem = (active = false) => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 3,
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: '4px 0',
  color: active ? D.color.brand : D.color.textDisabled,
  fontSize: D.size.badge,
  fontFamily: D.font.base,
  fontWeight: active ? D.weight.semi : D.weight.normal,
  transition: 'color 0.15s',
});

// ── Health Ring Sizes ──
D.healthRing = {
  size: 40,
  strokeWidth: 3,
  radius: 16,
  circumference: 2 * Math.PI * 16, // ~100.53
};

// Global CSS string
D.globalCSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Sans+TC:wght@300;400;500;700&family=Inter:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{background:${D.color.bg};overflow-x:hidden}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.12);border-radius:3px}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
@keyframes grow{from{width:0}}
@keyframes slideDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
`;

export default D;
