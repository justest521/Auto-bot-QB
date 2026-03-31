'use client';
import { useResponsive } from '@/lib/admin/helpers';
import S from '@/lib/admin/styles';
const { t, p } = S;
import { COMING_SOON_TABS } from '../shared/ui';

export default function PartsExchange() {
  const { isMobile, isTablet } = useResponsive();
  const config = COMING_SOON_TABS.parts_exchange;

  if (!config) return null;

  const phaseColor = config.phase === '近期' ? t.color.warning : config.phase === '中期' ? t.color.info : t.color.purple;

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
        <h2 style={{ fontSize: titleSize, fontWeight: t.fontWeight.bold, color: t.color.textPrimary, marginBottom: 8 }}>
          {config.label}
        </h2>
        <div
          style={{
            display: 'inline-block',
            fontSize: t.fontSize.caption,
            fontWeight: t.fontWeight.semibold,
            color: phaseColor,
            background: `${phaseColor}12`,
            border: `1px solid ${phaseColor}30`,
            borderRadius: t.radius.pill,
            padding: '4px 14px',
            marginBottom: 16,
          }}
        >
          {config.phase} — {config.timeline}
        </div>
        <p style={{ fontSize: descSize, color: t.color.textMuted, lineHeight: 1.8, marginBottom: isMobile ? 20 : 28 }}>
          {config.description}
        </p>
        <div
          style={{
            background: t.color.bgCard,
            border: `1px solid ${t.color.border}`,
            borderRadius: t.radius.lg,
            padding: cardPadding,
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: t.fontSize.tiny, fontWeight: t.fontWeight.semibold, color: t.color.textMuted, letterSpacing: 1, marginBottom: 14 }}>
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
                borderBottom: i < config.features.length - 1 ? '1px solid ${t.color.bgMuted}' : 'none',
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
              <span style={{ fontSize: isMobile ? 12 : 13, color: t.color.textSecondary, flex: 1 }}>
                {f}
              </span>
              <span style={{ fontSize: t.fontSize.tiny, color: t.color.textDisabled, fontStyle: 'italic', whiteSpace: 'nowrap', marginLeft: 8 }}>
                coming soon
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
