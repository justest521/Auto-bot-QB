'use client';
import { useState, useEffect } from 'react';
import S from '@/lib/admin/styles';
import { useResponsive } from '@/lib/admin/helpers';
import { apiGet, apiPost } from '@/lib/admin/api';
import { fmt, fmtP } from '@/lib/admin/helpers';
import { Loading, EmptyState, PageLead, StatCard } from '../shared/ui';

const TAG_COLORS = {
  'VIP': '#f59e0b',
  '鑽石VIP': '#8b5cf6',
  '新客戶': '#3b82f6',
  '一般客戶': '#6b7280',
  '潛在客戶': '#06b6d4',
  '沉睡客戶': '#ef4444',
  '活躍': '#10b981',
  '高互動': '#ec4899',
};

export default function LineCRM() {
  const { isMobile } = useResponsive();
  const [customers, setCustomers] = useState([]);
  const [tagSummary, setTagSummary] = useState({});
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoTagging, setAutoTagging] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastTags, setBroadcastTags] = useState([]);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async (tag = null) => {
    try {
      setLoading(true);
      const params = { action: 'line_customer_tags' };
      if (tag) params.tag = tag;

      const res = await apiGet(params);
      setCustomers(res.customers || []);
      setTagSummary(res.tag_summary || {});
      setAvailableTags(res.available_tags || []);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTagFilter = (tag) => {
    setSelectedTag(selectedTag === tag ? null : tag);
    loadCustomers(selectedTag === tag ? null : tag);
  };

  const handleAutoTag = async () => {
    try {
      setAutoTagging(true);
      await apiPost({ action: 'auto_tag_line_customers' });
      await loadCustomers(selectedTag);
      setBroadcastStatus({ type: 'success', message: '自動標籤已更新' });
      setTimeout(() => setBroadcastStatus(null), 3000);
    } catch (err) {
      console.error('Auto-tag failed:', err);
      setBroadcastStatus({ type: 'error', message: '自動標籤更新失敗' });
    } finally {
      setAutoTagging(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      setBroadcastStatus({ type: 'error', message: '請輸入訊息' });
      return;
    }

    try {
      setBroadcastLoading(true);
      const recipientCount = broadcastTags.length === 0
        ? customers.length
        : customers.filter(c => c.tags?.some(t => broadcastTags.includes(t))).length;

      if (recipientCount === 0) {
        setBroadcastStatus({ type: 'error', message: '沒有符合條件的收件人' });
        return;
      }

      await apiPost({
        action: 'line_broadcast',
        message: broadcastMessage,
        tags: broadcastTags.length > 0 ? broadcastTags : null,
      });

      setBroadcastStatus({ type: 'success', message: `成功發送給 ${recipientCount} 位用戶` });
      setBroadcastMessage('');
      setBroadcastTags([]);
      setTimeout(() => {
        setBroadcastStatus(null);
        setBroadcastOpen(false);
      }, 2000);
    } catch (err) {
      console.error('Broadcast failed:', err);
      setBroadcastStatus({ type: 'error', message: '群發訊息失敗' });
    } finally {
      setBroadcastLoading(false);
    }
  };

  const recipientCount = broadcastTags.length === 0
    ? customers.length
    : customers.filter(c => c.tags?.some(t => broadcastTags.includes(t))).length;

  const totalCustomers = Object.values(tagSummary).reduce((sum, count) => sum + count, 0) || customers.length;
  const vipCount = (tagSummary['VIP'] || 0) + (tagSummary['鑽石VIP'] || 0);
  const activeCount = tagSummary['活躍'] || 0;
  const sleepingCount = tagSummary['沉睡客戶'] || 0;

  if (loading && customers.length === 0) {
    return <Loading />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '1rem' : '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-start', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 0 }}>
        <PageLead
          eyebrow="LINE CRM"
          title="客戶標籤管理"
          description="管理 LINE 客戶標籤、自動分類和群發訊息"
        />
        <button
          style={{
            ...S.btnPrimary,
            ...(isMobile ? S.mobile.btnPrimary : {}),
            minHeight: isMobile ? 44 : 'auto',
            marginTop: isMobile ? 0 : '0.5rem',
          }}
          onClick={handleAutoTag}
          disabled={autoTagging}
        >
          {autoTagging ? '更新中...' : '自動標籤更新'}
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: isMobile ? '0.5rem' : '0.625rem', marginBottom: isMobile ? 0 : '0.625rem' }}>
        <StatCard
          label="總客戶數"
          value={fmt(totalCustomers)}
          trend={null}
        />
        <StatCard
          label="VIP 客戶"
          value={fmt(vipCount)}
          trend={null}
        />
        <StatCard
          label="活躍客戶"
          value={fmt(activeCount)}
          trend={null}
        />
        <StatCard
          label="沉睡客戶"
          value={fmt(sleepingCount)}
          trend={null}
        />
      </div>

      {/* Tag Filter Bar */}
      <div style={{ display: 'flex', gap: isMobile ? '0.5rem' : '0.75rem', flexWrap: 'wrap', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb', overflowX: isMobile ? 'auto' : 'visible' }}>
        <button
          onClick={() => handleTagFilter(null)}
          style={{
            ...S.tag(),
            backgroundColor: !selectedTag ? '#06c755' : '#f3f4f6',
            color: !selectedTag ? '#fff' : '#374151',
            cursor: 'pointer',
            padding: isMobile ? '0.375rem 0.75rem' : '0.5rem 1rem',
            borderRadius: '9999px',
            fontSize: isMobile ? '0.8rem' : '0.875rem',
            fontWeight: '500',
            border: 'none',
            whiteSpace: 'nowrap',
            minHeight: isMobile ? 36 : 'auto',
          }}
        >
          全部 ({fmt(totalCustomers)})
        </button>
        {availableTags.map(tag => (
          <button
            key={tag}
            onClick={() => handleTagFilter(tag)}
            style={{
              ...S.tag(),
              backgroundColor: selectedTag === tag ? '#06c755' : '#f3f4f6',
              color: selectedTag === tag ? '#fff' : '#374151',
              cursor: 'pointer',
              padding: isMobile ? '0.375rem 0.75rem' : '0.5rem 1rem',
              borderRadius: '9999px',
              fontSize: isMobile ? '0.8rem' : '0.875rem',
              fontWeight: '500',
              border: 'none',
              whiteSpace: 'nowrap',
              minHeight: isMobile ? 36 : 'auto',
            }}
          >
            {tag} ({fmt(tagSummary[tag] || 0)})
          </button>
        ))}
      </div>

      {/* Customer List */}
      <div style={{ display: 'grid', gap: isMobile ? '0.5rem' : '0.625rem' }}>
        {customers.length === 0 ? (
          <EmptyState message="沒有客戶" />
        ) : (
          customers.map(customer => (
            <div
              key={customer.user_id}
              style={{
                ...S.card,
                display: 'flex',
                gap: isMobile ? '0.5rem' : '0.625rem',
                alignItems: 'flex-start',
                marginBottom: isMobile ? '0.5rem' : '0.625rem',
                padding: isMobile ? '8px 12px' : '12px 16px',
                flexDirection: isMobile ? 'column' : 'row',
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: isMobile ? '2.5rem' : '3rem',
                  height: isMobile ? '2.5rem' : '3rem',
                  borderRadius: '9999px',
                  backgroundColor: '#06c755',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 'bold',
                  fontSize: isMobile ? '1rem' : '1.125rem',
                  flexShrink: 0,
                }}
              >
                {customer.display_name?.charAt(0) || 'L'}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0, width: isMobile ? '100%' : 'auto' }}>
                {/* Name and Tags */}
                <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', marginBottom: isMobile ? '0.375rem' : '0.625rem', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: isMobile ? '0.95rem' : '1rem', fontWeight: '600', color: '#111827' }}>
                    {customer.display_name}
                  </h3>
                  {customer.tags?.map(tag => (
                    <span
                      key={tag}
                      style={{
                        display: 'inline-block',
                        padding: isMobile ? '0.2rem 0.5rem' : '0.25rem 0.75rem',
                        borderRadius: '0.375rem',
                        fontSize: isMobile ? '0.7rem' : '0.75rem',
                        fontWeight: '500',
                        backgroundColor: TAG_COLORS[tag] || '#d1d5db',
                        color: '#fff',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(120px, 1fr))', gap: isMobile ? '0.375rem' : '0.625rem', fontSize: isMobile ? '0.8rem' : '0.875rem', color: '#6b7280' }}>
                  <div>
                    <span style={{ display: 'block', fontWeight: '500', color: '#111827', fontSize: isMobile ? '0.9rem' : 'inherit' }}>
                      {fmt(customer.order_count || 0)}
                    </span>
                    <span>訂單</span>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontWeight: '500', color: '#111827', fontSize: isMobile ? '0.9rem' : 'inherit' }}>
                      {fmtP(customer.total_spent || 0)}
                    </span>
                    <span>消費金額</span>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontWeight: '500', color: '#111827', fontSize: isMobile ? '0.9rem' : 'inherit' }}>
                      {customer.last_order_date ? new Date(customer.last_order_date).toLocaleDateString('zh-TW') : '無'}
                    </span>
                    <span>最後訂單</span>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontWeight: '500', color: '#111827', fontSize: isMobile ? '0.9rem' : 'inherit' }}>
                      {fmt(customer.message_count || 0)}
                    </span>
                    <span>訊息</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Broadcast Panel */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#fff',
          borderTop: '1px solid #e5e7eb',
          boxShadow: '0 -4px 6px rgba(0, 0, 0, 0.1)',
          transform: broadcastOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s ease-out',
          zIndex: 40,
          maxHeight: isMobile ? '70vh' : 'auto',
          overflowY: isMobile ? 'auto' : 'visible',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '1rem' : '1.5rem' }}>
          {/* Status Message */}
          {broadcastStatus && (
            <div
              style={{
                marginBottom: '0.625rem',
                padding: isMobile ? '0.5rem' : '0.625rem',
                borderRadius: '0.375rem',
                backgroundColor: broadcastStatus.type === 'success' ? '#d1fae5' : '#fee2e2',
                color: broadcastStatus.type === 'success' ? '#065f46' : '#7f1d1d',
                fontSize: isMobile ? '0.8rem' : '0.875rem',
              }}
            >
              {broadcastStatus.message}
            </div>
          )}

          {/* Message Input */}
          <div style={{ marginBottom: isMobile ? '0.5rem' : '0.625rem' }}>
            <label style={{ ...S.label, display: 'block', marginBottom: '0.375rem' }}>
              訊息內容
            </label>
            <textarea
              style={{
                ...S.input,
                ...(isMobile ? S.mobile.input : {}),
                minHeight: isMobile ? '80px' : '100px',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
              value={broadcastMessage}
              onChange={e => setBroadcastMessage(e.target.value)}
              placeholder="輸入要群發的訊息..."
            />
          </div>

          {/* Tag Filter */}
          <div style={{ marginBottom: isMobile ? '0.5rem' : '0.625rem' }}>
            <label style={{ ...S.label, display: 'block', marginBottom: '0.375rem' }}>
              篩選標籤 (留空則發送給全部)
            </label>
            <div style={{ display: 'flex', gap: isMobile ? '0.375rem' : '0.625rem', flexWrap: 'wrap' }}>
              {availableTags.map(tag => (
                <label
                  key={tag}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: isMobile ? '0.375rem 0.75rem' : '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    backgroundColor: '#f3f4f6',
                    cursor: 'pointer',
                    fontSize: isMobile ? '0.8rem' : '0.875rem',
                    minHeight: isMobile ? 36 : 'auto',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={broadcastTags.includes(tag)}
                    onChange={e => {
                      if (e.target.checked) {
                        setBroadcastTags([...broadcastTags, tag]);
                      } else {
                        setBroadcastTags(broadcastTags.filter(t => t !== tag));
                      }
                    }}
                    style={{ cursor: 'pointer', width: 18, height: 18 }}
                  />
                  {tag}
                </label>
              ))}
            </div>
          </div>

          {/* Preview and Send */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 10 : 0 }}>
            <div style={{ fontSize: isMobile ? '0.8rem' : '0.875rem', color: '#6b7280' }}>
              將發送給 <span style={{ fontWeight: 'bold', color: '#111827' }}>{fmt(recipientCount)}</span> 位用戶
            </div>
            <div style={{ display: 'flex', gap: isMobile ? '0.5rem' : '0.469rem', width: isMobile ? '100%' : 'auto' }}>
              <button
                style={{ ...S.btnGhost, ...(isMobile ? { flex: 1, minHeight: 40 } : {}), fontSize: isMobile ? 13 : 14 }}
                onClick={() => {
                  setBroadcastOpen(false);
                  setBroadcastMessage('');
                  setBroadcastTags([]);
                }}
              >
                取消
              </button>
              <button
                style={{ ...S.btnPrimary, ...(isMobile ? { flex: 1, minHeight: 44 } : {}), fontSize: isMobile ? 13 : 14 }}
                onClick={handleBroadcast}
                disabled={broadcastLoading || !broadcastMessage.trim()}
              >
                {broadcastLoading ? '發送中...' : '發送訊息'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Broadcast Toggle Button */}
      <button
        style={{
          position: 'fixed',
          bottom: isMobile ? '1.5rem' : '2rem',
          right: isMobile ? '1rem' : '2rem',
          ...S.btnPrimary,
          width: isMobile ? '2.5rem' : '3rem',
          height: isMobile ? '2.5rem' : '3rem',
          borderRadius: '9999px',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isMobile ? '1.2rem' : '1.5rem',
          zIndex: 39,
        }}
        onClick={() => setBroadcastOpen(!broadcastOpen)}
      >
        {broadcastOpen ? '✕' : '✉'}
      </button>

      {/* Bottom Padding for Fixed Panel */}
      {broadcastOpen && <div style={{ height: isMobile ? '250px' : '300px' }} />}
    </div>
  );
}
