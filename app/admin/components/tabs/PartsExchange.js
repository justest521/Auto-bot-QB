'use client';
import { useResponsive } from '@/lib/admin/helpers';
import S from '@/lib/admin/styles';
import { COMING_SOON_TABS } from '../shared/ui';

export default function PartsExchange() {
  const { isMobile, isTablet } = useResponsive();
  const config = COMING_SOON_TABS.parts_exchange;

  if (!config) return null;

  const phaseColor = config.phase === '近期' ? '#f59e0b' : config.phase === '中期' ? '#3b82f6' : '#8b5cf6';

  // Responsive padding: wider on desktop, narrower on mobile
  const containerPadding = isMobile ? '40px 16px' : isTablet ? '50px 20px' : '60px 20px';
  const maxWidth = isMobile ? '100%' : isTablet ? '480px' : '520px';
  const iconSize = isMobile ? 40 : 48;
  const titleSize = isMobile ? 18 : 22;
  const descSize = isMobile ? 13 : 14;
  const cardPadding = isMobile ? '16px 12px' : '20px 24px';

  return (
    <div style={{ padding: containerPadding, textAlign: 'center' }}>
      <div style={{ maxWidth, margin: '0 auto' }}>
        <div style={{ fontSize: iconSize, marginBottom: 16 }}>🔮</div>
        <h2 style={{ fontSize: titleSize, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
          {config.label}
        </h2>
        <div
          style={{
            display: 'inline-block',
            fontSize: 12,
            fontWeight: 600,
            color: phaseColor,
            background: `${phaseColor}12`,
            border: `1px solid ${phaseColor}30`,
            borderRadius: 20,
            padding: '4px 14px',
            marginBottom: 16,
          }}
        >
          {config.phase} — {config.timeline}
        </div>
        <p style={{ fontSize: descSize, color: '#6b7280', lineHeight: 1.8, marginBottom: isMobile ? 20 : 28 }}>
          {config.description}
        </p>
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            padding: cardPadding,
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: 1, marginBottom: 14 }}>
            規劃功能
          </div>
          {config.features.map((f, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: isMobile ? '10px 0' : '8px 0',
                borderBottom: i < config.features.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: phaseColor,
                  flexShrink: 0,
                  marginTop: 4,
                }}
              />
              <span style={{ fontSize: isMobile ? 12 : 13, color: '#374151', flex: 1 }}>
                {f}
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', whiteSpace: 'nowrap', marginLeft: 8 }}>
                coming soon
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
