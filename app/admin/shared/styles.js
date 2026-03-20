'use client';

export const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(180deg, #e9eef5 0%, #f5f7fb 220px)', color: '#192434', fontFamily: "'Noto Sans TC', 'SF Mono', monospace, sans-serif" },
  shell: { display: 'flex', minHeight: '100vh' },
  sidebar: { width: 248, background: 'linear-gradient(180deg, #1d2636 0%, #101723 100%)', color: '#c6d0df', padding: '18px 0 20px', boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.04)', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  header: { height: 64, background: 'rgba(255,255,255,0.92)', borderBottom: '1px solid #d8e0ea', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)' },
  content: { flex: 1, padding: '26px 28px 40px', minHeight: 'calc(100vh - 64px)' },
  card: { background: '#ffffff', border: '1px solid #dbe3ee', borderRadius: 14, padding: '18px 20px', marginBottom: 18, boxShadow: '0 10px 28px rgba(20, 35, 60, 0.06)' },
  panelMuted: { background: '#f8fbff', border: '1px solid #dbe6f3', borderRadius: 12, padding: '14px 16px' },
  input: { background: '#fff', border: '1px solid #ccd6e3', borderRadius: 10, padding: '10px 14px', color: '#152033', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: "'Noto Sans TC', sans-serif", transition: 'border-color 0.2s, box-shadow 0.2s', boxShadow: 'inset 0 1px 2px rgba(17,24,39,0.04)' },
  btnPrimary: { background: 'linear-gradient(180deg, #2d8cff 0%, #1976f3 100%)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif", letterSpacing: 0.2, boxShadow: '0 8px 18px rgba(25,118,243,0.22)' },
  btnGhost: { background: '#fff', color: '#5b6779', border: '1px solid #ccd6e3', borderRadius: 10, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontFamily: "'Noto Sans TC', sans-serif" },
  btnLine: { background: 'linear-gradient(180deg, #19c767 0%, #06b755 100%)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13, boxShadow: '0 8px 18px rgba(6,183,85,0.2)' },
  label: { color: '#6d7a8b', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, letterSpacing: 0.9, textTransform: 'uppercase' },
  mono: { fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: 0.5 },
  pageLead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, marginBottom: 18 },
  pageTitle: { fontSize: 28, fontWeight: 700, color: '#172337', letterSpacing: -0.6, marginBottom: 6 },
  pageDesc: { fontSize: 13, color: '#718096', lineHeight: 1.7, maxWidth: 760 },
  eyebrow: { fontSize: 11, color: '#1976f3', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, ...{ fontFamily: "'SF Mono', 'Fira Code', monospace" } },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 },
  twoCol: { display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' },
  tag: (color) => ({ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: color === 'green' ? '#ddf7ea' : color === 'red' ? '#ffe3e6' : color === 'line' ? '#def8ea' : '#edf2f7', color: color === 'green' ? '#129c59' : color === 'red' ? '#d1435b' : color === 'line' ? '#06a14d' : '#63758a', border: `1px solid ${color === 'green' ? '#bdeccb' : color === 'red' ? '#ffc7cf' : color === 'line' ? '#bcefd2' : '#d9e2ec'}` }),
};


