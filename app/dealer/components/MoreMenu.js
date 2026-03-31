'use client';
import { useState, useEffect } from 'react';
import D from './DealerStyles';

export default function MoreMenu({ token, user, roleConfig, dealerGet, dealerPost, onLogout }) {
  const [notifications, setNotifications] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await dealerGet({
          action: 'my_notifications',
          token,
        });
        setNotifications((response?.data || []).slice(0, 10));
      } catch (error) {
        console.error('Fetch notifications error:', error);
      }
    };
    fetchNotifications();
  }, [token, dealerGet]);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      alert('密碼不符合');
      return;
    }
    if (newPassword.length < 6) {
      alert('密碼至少6個字符');
      return;
    }

    setPasswordLoading(true);
    try {
      await dealerPost({
        action: 'change_password',
        token,
        new_password: newPassword,
      });
      alert('密碼已變更');
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
    } catch (error) {
      alert('變更密碼失敗');
      console.error(error);
    } finally {
      setPasswordLoading(false);
    }
  };

  const getRoleLabel = (role) => {
    const roles = { dealer: '經銷商', sales: '業務', technician: '維修技師' };
    return roles[role] || role;
  };

  const getInitials = (name) => {
    return name
      ?.split(/\s+/)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';
  };

  const getNotificationIcon = (type) => {
    const icons = {
      order: '📦',
      payment: '💳',
      notification: '📢',
      alert: '⚠️',
    };
    return icons[type] || '📌';
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return '剛剛';
    if (hours < 24) return `${hours}小時前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  };

  return (
    <div style={{ padding: D.size.lg, maxWidth: '600px', margin: '0 auto' }}>
      {/* Profile Card */}
      <div style={{
        background: D.color.surface,
        borderRadius: D.radius.lg,
        padding: D.size.lg,
        marginBottom: D.size.xl,
        border: `1px solid ${D.color.border}`,
      }}>
        <div style={{ display: 'flex', gap: D.size.md, marginBottom: D.size.lg }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: D.color.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: D.font.lg,
            fontWeight: 'bold',
            flexShrink: 0,
          }}>
            {getInitials(user?.display_name)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: D.font.base,
              fontWeight: '600',
              color: D.color.text,
              marginBottom: D.size.xs,
            }}>
              {user?.display_name}
            </div>
            <div style={{
              fontSize: D.font.sm,
              color: D.color.textSecondary,
              marginBottom: D.size.xs,
            }}>
              {getRoleLabel(user?.role)}
            </div>
            <div style={{
              fontSize: D.font.sm,
              color: D.color.textSecondary,
            }}>
              {user?.company_name}
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: D.size.md,
          borderTop: `1px solid ${D.color.border}`,
          paddingTop: D.size.md,
        }}>
          <div>
            <div style={{
              fontSize: D.font.xs,
              color: D.color.textSecondary,
              marginBottom: D.size.xs,
            }}>
              電話
            </div>
            <div style={{
              fontSize: D.font.sm,
              color: D.color.text,
            }}>
              {user?.phone || '—'}
            </div>
          </div>
          <div>
            <div style={{
              fontSize: D.font.xs,
              color: D.color.textSecondary,
              marginBottom: D.size.xs,
            }}>
              郵箱
            </div>
            <div style={{
              fontSize: D.font.sm,
              color: D.color.text,
              wordBreak: 'break-all',
            }}>
              {user?.email || '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Section */}
      {showPassword ? (
        <div style={{
          background: D.color.surface,
          borderRadius: D.radius.lg,
          padding: D.size.lg,
          marginBottom: D.size.xl,
          border: `1px solid ${D.color.border}`,
        }}>
          <div style={{
            fontSize: D.font.base,
            fontWeight: '600',
            color: D.color.text,
            marginBottom: D.size.md,
          }}>
            修改密碼
          </div>
          <input
            type="password"
            placeholder="新密碼"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{
              width: '100%',
              padding: D.size.sm,
              border: `1px solid ${D.color.border}`,
              borderRadius: D.radius.sm,
              fontSize: D.font.sm,
              marginBottom: D.size.sm,
              boxSizing: 'border-box',
              fontFamily: D.font.family,
            }}
          />
          <input
            type="password"
            placeholder="確認密碼"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{
              width: '100%',
              padding: D.size.sm,
              border: `1px solid ${D.color.border}`,
              borderRadius: D.radius.sm,
              fontSize: D.font.sm,
              marginBottom: D.size.md,
              boxSizing: 'border-box',
              fontFamily: D.font.family,
            }}
          />
          <div style={{ display: 'flex', gap: D.size.sm }}>
            <button
              onClick={handleChangePassword}
              disabled={passwordLoading}
              style={{
                flex: 1,
                padding: D.size.sm,
                background: D.color.primary,
                color: 'white',
                border: 'none',
                borderRadius: D.radius.sm,
                cursor: 'pointer',
                fontFamily: D.font.family,
                fontSize: D.font.sm,
                opacity: passwordLoading ? 0.6 : 1,
              }}
            >
              {passwordLoading ? '處理中...' : '確認'}
            </button>
            <button
              onClick={() => {
                setShowPassword(false);
                setNewPassword('');
                setConfirmPassword('');
              }}
              style={{
                flex: 1,
                padding: D.size.sm,
                background: D.color.surface,
                color: D.color.text,
                border: `1px solid ${D.color.border}`,
                borderRadius: D.radius.sm,
                cursor: 'pointer',
                fontFamily: D.font.family,
                fontSize: D.font.sm,
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowPassword(true)}
          style={{
            width: '100%',
            padding: D.size.md,
            background: D.color.surface,
            color: D.color.text,
            border: `1px solid ${D.color.border}`,
            borderRadius: D.radius.lg,
            cursor: 'pointer',
            fontFamily: D.font.family,
            fontSize: D.font.sm,
            marginBottom: D.size.xl,
            textAlign: 'left',
          }}
        >
          🔐 修改密碼
        </button>
      )}

      {/* Notifications */}
      <div style={{ marginBottom: D.size.xl }}>
        <div style={{
          fontSize: D.font.base,
          fontWeight: '600',
          color: D.color.text,
          marginBottom: D.size.md,
        }}>
          最近通知 ({notifications.length})
        </div>
        {notifications.length > 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: D.size.sm,
          }}>
            {notifications.map((notif, idx) => (
              <div
                key={idx}
                style={{
                  background: D.color.surface,
                  border: `1px solid ${D.color.border}`,
                  borderRadius: D.radius.md,
                  padding: D.size.md,
                  display: 'flex',
                  gap: D.size.md,
                }}
              >
                <div style={{
                  fontSize: D.font.lg,
                  flexShrink: 0,
                }}>
                  {getNotificationIcon(notif.type)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: D.font.sm,
                    color: D.color.text,
                    marginBottom: D.size.xs,
                  }}>
                    {notif.message}
                  </div>
                  {notif.order_no && (
                    <div style={{
                      fontSize: D.font.xs,
                      color: D.color.textSecondary,
                      marginBottom: D.size.xs,
                    }}>
                      訂單: {notif.order_no}
                    </div>
                  )}
                  {notif.amount && (
                    <div style={{
                      fontSize: D.font.xs,
                      color: D.color.textSecondary,
                      marginBottom: D.size.xs,
                    }}>
                      金額: ${notif.amount}
                    </div>
                  )}
                  <div style={{
                    fontSize: D.font.xs,
                    color: D.color.textSecondary,
                  }}>
                    {formatTime(notif.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            padding: D.size.lg,
            color: D.color.textSecondary,
            background: D.color.surface,
            borderRadius: D.radius.md,
            border: `1px solid ${D.color.border}`,
          }}>
            沒有通知
          </div>
        )}
      </div>

      {/* Logout Button */}
      <button
        onClick={onLogout}
        style={{
          width: '100%',
          padding: D.size.md,
          background: D.color.error,
          color: 'white',
          border: 'none',
          borderRadius: D.radius.lg,
          cursor: 'pointer',
          fontFamily: D.font.family,
          fontSize: D.font.base,
          fontWeight: '600',
          marginBottom: D.size.lg,
        }}
      >
        登出
      </button>

      {/* App Info */}
      <div style={{
        textAlign: 'center',
        padding: D.size.md,
        color: D.color.textSecondary,
        fontSize: D.font.xs,
        borderTop: `1px solid ${D.color.border}`,
      }}>
        <div style={{ marginBottom: D.size.xs }}>
          QB ERP Dealer Portal
        </div>
        <div style={{ marginBottom: D.size.xs }}>
          版本 1.0.0
        </div>
        <div>
          © 2024 QB ERP. 版權所有。
        </div>
      </div>
    </div>
  );
}
