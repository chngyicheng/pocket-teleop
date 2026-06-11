/**
 * SessionBanner.tsx — session expiration warning banner
 *
 * Fixed to bottom, centered toast. Amber/warning colors, rounded corners.
 * Text: "Session expires in N min" with "Stay logged in" button.
 * Button min 44px tall for touch targets.
 *
 * Props:
 *   - remainingMs: number | null
 *   - show: boolean
 *   - onKeepAlive: () => void
 */

import React from 'react';

const P = {
  surface: '#14171e',
  surface2: '#1a1e26',
  text: '#e6e9ef',
  accent: '#f0a92a',
  danger: '#ef4444',
};

const SANS = 'Inter, ui-sans-serif, system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

export interface SessionBannerProps {
  remainingMs: number | null;
  show: boolean;
  onKeepAlive: () => void;
}

export default function SessionBanner({
  remainingMs,
  show,
  onKeepAlive,
}: SessionBannerProps): JSX.Element | null {
  if (!show || remainingMs === null) {
    return null;
  }

  const minutesRemaining = Math.ceil(remainingMs / 60_000);
  const timeText = minutesRemaining < 1 ? 'less than 1 min' : `${minutesRemaining} min`;

  const bannerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    backgroundColor: P.surface2,
    border: `2px solid ${P.accent}`,
    borderRadius: 8,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    fontFamily: SANS,
    color: P.text,
    maxWidth: 'calc(100vw - 32px)',
  };

  const textStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    margin: 0,
    color: P.text,
  };

  const buttonStyle: React.CSSProperties = {
    padding: '10px 16px',
    backgroundColor: P.accent,
    color: '#14171e',
    border: 'none',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: MONO,
    letterSpacing: '0.08em',
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  return (
    <div style={bannerStyle}>
      <p style={textStyle}>Session expires in {timeText}</p>
      <button style={buttonStyle} onClick={onKeepAlive}>
        Stay logged in
      </button>
    </div>
  );
}
