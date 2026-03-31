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
    const iconConfig = {
      order: { text: '單', color: D.color.info },
      payment: { text: '$', color: D.color.success },
      alert: { text: '!', color: D.color.error },
      notification: { text: 'i', color: D.color.warning },
    };
    return iconConfig[type] || { text: 'i', color: D.color.text3 };
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
    <div style={{ padding: 32, maxWidth: '600px', margin: '0 auto' }}>
      {/* Profile Card */}
      <div style={{
        background: D.color.surface,
        borderRadius: D.radius.lg,
        padding: 32,
        marginBottom: 32,
        border: `1px solid ${D.color.border}`,
      }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: D.color.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: D.size.h2,
            fontWeight: 'bold',
            flexShrink: 0,
          }}>
            {getInitials(user?.display_name)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: D.size.body,
              fontWeight: '600',
              color: D.color.text,
              marginBottom: 4,
            }}>
              {user?.display_name}
            </div>
            <div style={{
              fontSize: D.size.body,
              color: D.color.text3,
              marginBottom: 4,
            }}>
              {getRoleLabel(user?.role)}
            </div>
            <div style={{
              fontSize: D.size.body,
              color: D.color.text3,
            }}>
              {user?.company_name}
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          borderTop: `1px solid ${D.color.border}`,
          paddingTop: 12,
        }}>
          <div>
            <div style={{
              fontSize: D.size.caption,
              color: D.color.text3,
              marginBottom: 4,
            }}>
              電話
            </div>
            <div style={{
              fontSize: D.size.body,
              color: D.color.text,
            }}>
              {user?.phone || '—'}
            </div>
          </div>
          <div>
            <div style={{
              fontSize: D.size.caption,
              color: D.color.text3,
              marginBottom: 4,
            }}>
              郵箱
            </div>
            <div style={{
              fontSize: D.size.body,
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
          padding: 32,
          marginBottom: 32,
          border: `1px solid ${D.color.border}`,
        }}>
          <div style={{
            fontSize: D.size.body,
            fontWeight: '600',
            color: D.color.text,
            marginBottom: 12,
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
              padding: 8,
              border: `1px solid ${D.color.border}`,
              borderRadius: D.radius.sm,
              fontSize: D.size.body,
              marginBottom: 8,
              boxSizing: 'border-box',
              fontFamily: D.font.mono,
            }}
          />
          <input
            type="password"
            placeholder="確認密碼"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{
              width: '100%',
              padding: 8,
              border: `1px solid ${D.color.border}`,
              borderRadius: D.radius.sm,
              fontSize: D.size.body,
              marginBottom: 12,
              boxSizing: 'border-box',
              fontFamily: D.font.mono,
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleChangePassword}
              disabled={passwordLoading}
              style={{
                flex: 1,
                padding: 8,
                background: D.color.primary,
                color: 'white',
                border: 'none',
                borderRadius: D.radius.sm,
                cursor: 'pointer',
                fontFamily: D.font.mono,
                fontSize: D.size.body,
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
                padding: 8,
                background: D.color.surface,
                color: D.color.text,
                border: `1px solid ${D.color.border}`,
                borderRadius: D.radius.sm,
                cursor: 'pointer',
                fontFamily: D.font.mono,
                fontSize: D.size.body,
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
            padding: 12,
            background: D.color.surface,
            color: D.color.text,
            border: `1px solid ${D.color.border}`,
            borderRadius: D.radius.lg,
            cursor: 'pointer',
            fontFamily: D.font.mono,
            fontSize: D.size.body,
            marginBottom: 32,
            textAlign: 'left',
          }}
        >
          <span style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: D.color.primary,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: D.size.caption,
            fontWeight: 'bold',
            flexShrink: 0,
          }}>
            ⚙
          </span>
          修改密碼
        </button>
      )}

      {/* Notifications */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          fontSize: D.size.body,
          fontWeight: '600',
          color: D.color.text,
          marginBottom: 12,
        }}>
          最近通知 ({notifications.length})
        </div>
        {notifications.length > 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            {notifications.map((notif, idx) => (
              <div
                key={idx}
                style={{
                  background: D.color.surface,
                  border: `1px solid ${D.color.border}`,
                  borderRadius: D.radius.md,
                  padding: 12,
                  display: 'flex',
                  gap: 12,
                }}
              >
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: getNotificationIcon(notif.type).color,
                  color: 'white',
                  fontSize: D.size.body,
                  fontWeight: 'bold',
                }}>
                  {getNotificationIcon(notif.type).text}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: D.size.body,
                    color: D.color.text,
                    marginBottom: 4,
                  }}>
                    {notif.message}
                  </div>
                  {notif.order_no && (
                    <div style={{
                      fontSize: D.size.caption,
                      color: D.color.text3,
                      marginBottom: 4,
                    }}>
                      訂單: {notif.order_no}
                    </div>
                  )}
                  {notif.amount && (
                    <div style={{
                      fontSize: D.size.caption,
                      color: D.color.text3,
                      marginBottom: 4,
                    }}>
                      金額: ${notif.amount}
                    </div>
                  )}
                  <div style={{
                    fontSize: D.size.caption,
                    color: D.color.text3,
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
            padding: 32,
            color: D.color.text3,
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
          padding: 12,
          background: D.color.error,
          color: 'white',
          border: 'none',
          borderRadius: D.radius.lg,
          cursor: 'pointer',
          fontFamily: D.font.mono,
          fontSize: D.size.body,
          fontWeight: '600',
          marginBottom: 32,
        }}
      >
        登出
      </button>

      {/* App Info */}
      <div style={{
        textAlign: 'center',
        padding: 12,
        color: D.color.text3,
        fontSize: D.size.caption,
        borderTop: `1px solid ${D.color.border}`,
      }}>
        <div style={{ marginBottom: 4 }}>
          QB ERP Dealer Portal
        </div>
        <div style={{ marginBottom: 4 }}>
          版本 1.0.0
        </div>
        <div>
          © 2024 QB ERP. 版權所有。
        </div>
      </div>
    </div>
  );
}
