'use client';
import { useState, useEffect } from 'react';
import D from './DealerStyles';

export default function MoreMenu({ token, user, roleConfig, dealerGet, dealerPost, onLogout }) {
  const [notifications, setNotifications] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await dealerGet({ action: 'my_notifications', token });
        setNotifications((res?.data || []).slice(0, 10));
      } catch (e) { console.error('Notifications:', e); }
    })();
  }, [token, dealerGet]);

  const handleChangePw = async () => {
    if (newPw !== confirmPw) { alert('密碼不符合'); return; }
    if (newPw.length < 6) { alert('密碼至少6個字符'); return; }
    setPwLoading(true);
    try {
      await dealerPost({ action: 'change_password', token, new_password: newPw });
      alert('密碼已變更');
      setNewPw(''); setConfirmPw(''); setShowPassword(false);
    } catch (e) { alert('變更密碼失敗'); console.error(e); }
    finally { setPwLoading(false); }
  };

  const ROLE_LABEL = { dealer: '經銷商', sales: '業務', technician: '維修技師' };

  const getInitials = (name) => (name || '?').split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const formatTime = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 1) return '剛剛';
    if (hrs < 24) return `${hrs}小時前`;
    return `${Math.floor(hrs / 24)}天前`;
  };

  const NOTIF_ICON = {
    order: { char: 'O', color: D.color.info },
    payment: { char: '$', color: D.color.success },
    alert: { char: '!', color: D.color.error },
    notification: { char: 'i', color: D.color.warning },
  };

  return (
    <div style={{ padding: '20px 0 40px', maxWidth: 560, margin: '0 auto' }}>

      {/* ── Profile Card ── */}
      <div style={{ ...D.card, padding: '24px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
          {/* Avatar */}
          <div style={{
            width: 56, height: 56, borderRadius: D.radius.full, flexShrink: 0,
            background: `linear-gradient(135deg, ${D.color.brand}, #22c55e)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 18, fontWeight: D.weight.black, fontFamily: D.font.mono,
            boxShadow: '0 4px 16px rgba(22,163,74,0.2)',
          }}>
            {getInitials(user?.display_name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: D.size.h2, fontWeight: D.weight.bold, color: D.color.text, marginBottom: 3 }}>
              {user?.display_name || user?.username || '--'}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={D.tag('brand')}>{ROLE_LABEL[user?.role] || user?.role}</span>
              {user?.company_name && <span style={D.tag('default')}>{user.company_name}</span>}
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 16, borderTop: `1px solid ${D.color.borderLight}` }}>
          <div>
            <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginBottom: 3 }}>電話</div>
            <div style={{ fontSize: D.size.body, color: D.color.text, fontFamily: D.font.mono }}>{user?.phone || '--'}</div>
          </div>
          <div>
            <div style={{ fontSize: D.size.tiny, color: D.color.text3, marginBottom: 3 }}>郵箱</div>
            <div style={{ fontSize: D.size.body, color: D.color.text, wordBreak: 'break-all' }}>{user?.email || '--'}</div>
          </div>
        </div>
      </div>

      {/* ── Menu Items ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
        {/* Change Password */}
        <button
          onClick={() => setShowPassword(!showPassword)}
          style={{
            ...D.card, padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${D.color.border}`,
            borderRadius: showPassword ? `${D.radius.lg}px ${D.radius.lg}px 0 0` : D.radius.lg,
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: D.radius.sm, flexShrink: 0,
            background: D.color.infoDim, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={D.color.info} strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <span style={{ flex: 1, fontSize: D.size.body, fontWeight: D.weight.medium, color: D.color.text }}>修改密碼</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={D.color.textDisabled} strokeWidth="2"
            style={{ transform: showPassword ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        {showPassword && (
          <div style={{
            ...D.card, padding: 16, borderRadius: `0 0 ${D.radius.lg}px ${D.radius.lg}px`,
            borderTop: 'none', animation: 'slideDown 0.2s ease',
          }}>
            <input type="password" placeholder="新密碼" value={newPw} onChange={e => setNewPw(e.target.value)}
              style={{ ...D.input, marginBottom: 8 }} />
            <input type="password" placeholder="確認密碼" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              style={{ ...D.input, marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleChangePw} disabled={pwLoading}
                style={{ ...D.btnPrimary, flex: 1, textAlign: 'center', opacity: pwLoading ? 0.6 : 1 }}>
                {pwLoading ? '處理中...' : '確認變更'}
              </button>
              <button onClick={() => { setShowPassword(false); setNewPw(''); setConfirmPw(''); }}
                style={{ ...D.btnGhost, flex: 1, textAlign: 'center' }}>
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Notifications ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ ...D.sectionLabel, marginBottom: 10, paddingLeft: 2 }}>NOTIFICATIONS</div>
        {notifications.length === 0 ? (
          <div style={{ ...D.card, padding: '32px 20px', textAlign: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={D.color.textDisabled} strokeWidth={1.5} strokeLinecap="round" style={{ marginBottom: 8 }}>
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            <div style={{ color: D.color.textDisabled, fontSize: D.size.body }}>暫無通知</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {notifications.map((n, idx) => {
              const ic = NOTIF_ICON[n.type] || NOTIF_ICON.notification;
              return (
                <div key={idx} style={{ ...D.card, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: D.radius.xs, flexShrink: 0,
                    background: ic.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: ic.color, fontSize: 11, fontWeight: D.weight.bold, fontFamily: D.font.mono,
                  }}>
                    {ic.char}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: D.size.body, color: D.color.text, lineHeight: 1.35, marginBottom: 3 }}>{n.message}</div>
                    {n.order_no && <div style={{ fontSize: D.size.tiny, color: D.color.text3, fontFamily: D.font.mono }}>#{n.order_no}</div>}
                    <div style={{ fontSize: D.size.tiny, color: D.color.textDisabled, marginTop: 2 }}>{formatTime(n.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Logout ── */}
      <button onClick={onLogout} style={{
        width: '100%', padding: '12px 0', textAlign: 'center',
        background: D.color.errorDim, color: D.color.error,
        border: `1px solid rgba(239,68,68,0.18)`, borderRadius: D.radius.lg,
        cursor: 'pointer', fontSize: D.size.body, fontWeight: D.weight.semi,
        transition: 'all 0.15s',
      }}>
        登出帳號
      </button>

      {/* ── Footer ── */}
      <div style={{ textAlign: 'center', padding: '24px 0 0', color: D.color.textDisabled, fontSize: D.size.tiny }}>
        <div>QB ERP Dealer Portal v1.0</div>
        <div style={{ marginTop: 2 }}>2024 Quick Buy. All rights reserved.</div>
      </div>
    </div>
  );
}
