/**
 * shared.tsx — React+TypeScript migration of design_handoff/shared.jsx
 * Common HUD building blocks: Joystick, MiniMap, Compass, CompassTape, VelBars, Readout
 * Pure presentational components (no data layer coupling).
 */

import React, { useState, useEffect, useRef, useCallback, ReactNode, CSSProperties } from 'react';
import type { WhepState } from '../whep_client.js';

// Convert a hex color (#rgb or #rrggbb) to rgba() with the given alpha.
// Used in place of 8-digit-hex alpha notation, which jsdom's CSSOM rejects.
// Falls back to a transparent rgba() if the input is not a recognized hex.
function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return `rgba(0, 0, 0, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type JoystickVariant = 'classic' | 'edge' | 'zone';
export type JoystickAxes = 'xy' | 'x' | 'y';

export interface JoystickProps {
  variant?: JoystickVariant;
  axes?: JoystickAxes;
  size?: number;
  knobSize?: number;
  baseSize?: number;
  onMove?: (x: number, y: number) => void;
  onEnd?: () => void;
  baseColor?: string;
  ringColor?: string;
  knobColor?: string;
  knobBorder?: string;
  glow?: boolean;
  square?: boolean;
  label?: string | null;
  externalValue?: { x: number; y: number };
  externalActive?: boolean;
}

export interface MiniMapProps {
  pos: { x: number; y: number };
  heading: number;
  size?: number;
  color?: string;
  bg?: string;
  border?: string;
  grid?: boolean;
  ranges?: boolean;
  trail?: boolean;
}

export interface CompassProps {
  heading: number;
  size?: number;
  color?: string;
  label?: boolean;
  font?: string;
}

export interface CompassTapeProps {
  heading: number;
  width?: number;
  color?: string;
  bg?: string;
  font?: string;
}

export interface VelBarsProps {
  lx: number;
  ly: number;
  az: number;
  color?: string;
  trackColor?: string;
  font?: string;
  label?: boolean;
}

export interface ReadoutProps {
  label: string;
  value: string;
  color?: string;
}

export interface ConnectionLabel {
  text: string;
  color: string;
}

export type ConnectionState = 'live' | 'reconnecting' | 'disconnected';

export interface ConnectionLabels {
  live: ConnectionLabel;
  reconnecting: ConnectionLabel;
  disconnected: ConnectionLabel;
}

// ─── Connection state labels ──────────────────────────────────────────────────

export const CONNECTION_LABELS: ConnectionLabels = {
  live: { text: '● Connected — diff_drive', color: '#22c55e' },
  reconnecting: { text: '⟳ Reconnecting…', color: '#f59e0b' },
  disconnected: { text: '○ Disconnected · 12s ago', color: '#ef4444' },
};

// ─── Utility: shade a hex color ────────────────────────────────────────────────

function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = Math.min(255, Math.max(0, parseInt(h.slice(0, 2), 16) * amt));
  const g = Math.min(255, Math.max(0, parseInt(h.slice(2, 4), 16) * amt));
  const b = Math.min(255, Math.max(0, parseInt(h.slice(4, 6), 16) * amt));
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}

// ─── Joystick ─────────────────────────────────────────────────────────────────

export const Joystick: React.FC<JoystickProps> = ({
  variant = 'classic',
  axes = 'xy',
  size = 240,
  knobSize = 56,
  baseSize = 120,
  onMove,
  onEnd,
  baseColor = 'rgba(255,255,255,0.06)',
  ringColor = 'rgba(255,255,255,0.25)',
  knobColor = 'rgba(255,255,255,0.55)',
  knobBorder = 'transparent',
  glow = false,
  square = false,
  label = null,
  externalValue,
  externalActive = false,
}) => {
  const zoneRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [center, setCenter] = useState({ x: size / 2, y: size / 2 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointerIdRef = useRef<number | null>(null);

  const handlePos = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = zoneRef.current?.getBoundingClientRect();
      if (!rect) return { nx: 0, ny: 0, rect: null };
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      return { nx, ny, rect };
    },
    []
  );

  const updateKnob = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = zoneRef.current?.getBoundingClientRect();
      if (!rect) return;

      const localX = ((e.clientX - rect.left) / rect.width) * size;
      const localY = ((e.clientY - rect.top) / rect.height) * size;
      const dx = localX - center.x;
      const dy = localY - center.y;
      const maxR = baseSize / 2;
      const dist = Math.hypot(dx, dy);
      const clamp = dist > maxR ? maxR / dist : 1;

      let nx = (dx * clamp) / maxR;
      let ny = (dy * clamp) / maxR;

      if (axes === 'x') ny = 0;
      if (axes === 'y') nx = 0;

      setKnob({ x: nx, y: ny });
      onMove?.(nx, ny);
    },
    [center, baseSize, size, axes, onMove]
  );

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== null) return;
    e.preventDefault();
    zoneRef.current?.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    setActive(true);

    const rect = zoneRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (variant === 'zone') {
      const localX = ((e.clientX - rect.left) / rect.width) * size;
      const localY = ((e.clientY - rect.top) / rect.height) * size;
      setCenter({ x: localX, y: localY });
      setKnob({ x: 0, y: 0 });
    } else {
      setCenter({ x: size / 2, y: size / 2 });
      updateKnob(e);
    }
  };

  const onMoveEvt = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    updateKnob(e);
  };

  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    try {
      zoneRef.current?.releasePointerCapture(e.pointerId);
    } catch (_) {}
    pointerIdRef.current = null;
    setActive(false);
    setKnob({ x: 0, y: 0 });
    onEnd?.();
  };

  const baseRadius = baseSize / 2;
  const effectiveActive = active || externalActive === true;
  const knobDisplay = active ? knob : (externalActive && externalValue ? externalValue : { x: 0, y: 0 });
  const centerDisplay = active ? center : { x: size / 2, y: size / 2 };
  const showBase = variant === 'classic' || effectiveActive;
  const hintVisible = !effectiveActive && variant !== 'classic';

  return (
    <div
      ref={zoneRef}
      data-testid="joystick-zone"
      onPointerDown={onDown}
      onPointerMove={onMoveEvt}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{
        position: 'relative',
        width: size,
        height: size,
        touchAction: 'none',
        userSelect: 'none',
        cursor: active ? 'grabbing' : 'pointer',
      }}
    >
      {/* Base */}
      {showBase && (
        <div
          style={{
            position: 'absolute',
            left: centerDisplay.x - baseRadius,
            top: centerDisplay.y - baseRadius,
            width: baseSize,
            height: baseSize,
            borderRadius: square ? 8 : '50%',
            background: baseColor,
            border: `2px solid ${ringColor}`,
            pointerEvents: 'none',
            transition: active ? 'none' : 'opacity 200ms ease',
            opacity: showBase ? 1 : 0,
            boxShadow: glow ? `0 0 24px ${ringColor}` : 'none',
          }}
        />
      )}

      {/* Knob */}
      {showBase && (
        <div
          data-testid="joystick-knob"
          style={{
            position: 'absolute',
            left: centerDisplay.x - knobSize / 2 + knobDisplay.x * baseRadius,
            top: centerDisplay.y - knobSize / 2 + knobDisplay.y * baseRadius,
            width: knobSize,
            height: knobSize,
            borderRadius: square ? 6 : '50%',
            background: knobColor,
            border: knobBorder !== 'transparent' ? `2px solid ${knobBorder}` : 'none',
            pointerEvents: 'none',
            transition: active ? 'none' : 'transform 180ms ease',
            boxShadow: glow ? `0 0 16px ${knobColor}` : 'none',
          }}
        />
      )}

      {/* Hint ring + dot (idle state for edge / zone styles) */}
      {(variant === 'edge' || variant === 'zone') && !effectiveActive && (
        <div
          data-testid="joystick-hint"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: `2px solid ${ringColor}`,
            opacity: 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: ringColor,
              opacity: 0.7,
            }}
          />
        </div>
      )}

      {/* Label */}
      {label && (
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 9,
            fontWeight: 600,
            color: ringColor,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            opacity: hintVisible ? 0.6 : 0,
            transition: 'opacity 200ms',
            pointerEvents: 'none',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

// ─── MiniMap ──────────────────────────────────────────────────────────────────

export const MiniMap: React.FC<MiniMapProps> = ({
  pos,
  heading,
  size = 92,
  color = '#4ec9d6',
  bg = 'rgba(0,0,0,0.55)',
  border = 'rgba(255,255,255,0.15)',
  grid = true,
  ranges = false,
  trail = true,
}) => {
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    trailRef.current.push({ x: pos.x, y: pos.y });
    if (trailRef.current.length > 80) trailRef.current.shift();
  }, [pos.x, pos.y]);

  const scale = 6;
  const mapPoints = trailRef.current.map((p) => ({
    x: size / 2 + (p.x - pos.x) * scale,
    y: size / 2 + (p.y - pos.y) * scale,
  }));

  return (
    <div
      style={{
        width: size,
        height: size,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 6,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {grid && (
        <div
          data-testid="minimap-grid"
          style={{
            position: 'absolute',
            inset: 0,
            // backgroundImage (longhand) + rgba() colors so jsdom's CSSOM can
            // parse the stacked gradients. The `background` shorthand parser
            // and 8-digit-hex alpha both fail in jsdom; rendering in real
            // browsers is identical.
            backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent 11px, ${hexToRgba(color, 0.133)} 11px, ${hexToRgba(color, 0.133)} 12px), repeating-linear-gradient(to bottom, transparent 0, transparent 11px, ${hexToRgba(color, 0.133)} 11px, ${hexToRgba(color, 0.133)} 12px)`,
            backgroundPosition: `${-pos.x * scale}px ${-pos.y * scale}px`,
          }}
        />
      )}

      {ranges && (
        <svg
          viewBox={`0 0 ${size} ${size}`}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          {[0.3, 0.6, 0.9].map((r) => (
            <circle
              key={r}
              cx={size / 2}
              cy={size / 2}
              r={size / 2 * r}
              fill="none"
              stroke={color}
              strokeOpacity="0.25"
              strokeWidth="0.5"
              strokeDasharray="2 3"
            />
          ))}
        </svg>
      )}

      {trail && mapPoints.length > 1 && (
        <svg
          viewBox={`0 0 ${size} ${size}`}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <polyline
            points={mapPoints.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={color}
            strokeOpacity="0.7"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Robot arrow at center */}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: 'absolute', inset: 0 }}
      >
        <g transform={`translate(${size / 2} ${size / 2}) rotate(${heading * 180 / Math.PI})`}>
          <polygon points="0,-7 5,5 0,2 -5,5" fill={color} />
          <circle r="2" fill={color} />
        </g>
      </svg>
    </div>
  );
};

// ─── Compass ──────────────────────────────────────────────────────────────────

export const Compass: React.FC<CompassProps> = ({
  heading,
  size = 24,
  color = '#4ec9d6',
  label = true,
  font = 'ui-monospace, monospace',
}) => {
  const deg = ((heading * 180 / Math.PI) % 360 + 360) % 360;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width={size} height={size} viewBox="-12 -12 24 24">
        <circle
          r="10"
          fill="none"
          stroke={color}
          strokeOpacity="0.35"
          strokeWidth="0.8"
        />
        <g transform={`rotate(${deg})`}>
          <polygon points="0,-8 2.5,4 0,1.5 -2.5,4" fill={color} />
        </g>
        <text
          x="0"
          y="-7"
          fontSize="3"
          fill={color}
          opacity="0.7"
          textAnchor="middle"
          fontFamily={font}
        >
          N
        </text>
      </svg>
      {label && (
        <span
          style={{
            fontFamily: font,
            fontSize: 11,
            color,
            opacity: 0.85,
            fontVariantNumeric: 'tabular-nums',
            minWidth: 28,
          }}
        >
          {Math.round(deg).toString().padStart(3, '0')}°
        </span>
      )}
    </div>
  );
};

// ─── CompassTape ──────────────────────────────────────────────────────────────

export const CompassTape: React.FC<CompassTapeProps> = ({
  heading,
  width = 240,
  color = '#9efea0',
  bg = 'rgba(0,0,0,0.4)',
  font = 'IBM Plex Mono, monospace',
}) => {
  const deg = ((heading * 180 / Math.PI) % 360 + 360) % 360;
  const ticks: React.ReactNode[] = [];

  for (let d = -90; d <= 90; d += 10) {
    const t = ((deg + d + 360) % 360);
    const x = width / 2 + (d / 90) * (width / 2);
    const major = t % 30 === 0;

    ticks.push(
      <g key={d}>
        <line
          x1={x}
          x2={x}
          y1={major ? 6 : 12}
          y2={20}
          stroke={color}
          strokeOpacity={major ? 1 : 0.5}
          strokeWidth="0.8"
        />
        {major && (
          <text
            x={x}
            y={4}
            fontSize="7"
            fill={color}
            textAnchor="middle"
            fontFamily={font}
          >
            {t === 0 ? 'N' : t === 90 ? 'E' : t === 180 ? 'S' : t === 270 ? 'W' : Math.round(t)}
          </text>
        )}
      </g>
    );
  }

  return (
    <div style={{ background: bg, borderRadius: 3, padding: '3px 4px' }}>
      <svg
        width={width}
        height={26}
        viewBox={`0 0 ${width} 26`}
        style={{ display: 'block' }}
      >
        {ticks}
        <line
          x1={width / 2}
          x2={width / 2}
          y1={2}
          y2={24}
          stroke={color}
          strokeWidth="1.2"
        />
      </svg>
    </div>
  );
};

// ─── VelBars ──────────────────────────────────────────────────────────────────

const Bar: React.FC<{
  k: string;
  v: number;
  color: string;
  trackColor: string;
  font: string;
  label: boolean;
}> = ({ k, v, color, trackColor, font, label }) => {
  const c = Math.max(-1, Math.min(1, v));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {label && (
        <span
          style={{
            fontSize: 10,
            fontFamily: font,
            color,
            opacity: 0.7,
            width: 16,
            textAlign: 'right',
          }}
        >
          {k}
        </span>
      )}
      <div
        style={{
          position: 'relative',
          flex: 1,
          height: 4,
          background: trackColor,
          borderRadius: 2,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            height: '100%',
            background: color,
            borderRadius: 2,
            left: c >= 0 ? '50%' : `${(0.5 + c * 0.5) * 100}%`,
            width: `${Math.abs(c) * 50}%`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: -1,
            bottom: -1,
            width: 1,
            background: color,
            opacity: 0.5,
          }}
        />
      </div>
      {label && (
        <span
          style={{
            fontSize: 10,
            fontFamily: font,
            color,
            opacity: 0.6,
            width: 38,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {v.toFixed(2)}
        </span>
      )}
    </div>
  );
};

export const VelBars: React.FC<VelBarsProps> = ({
  lx,
  ly,
  az,
  color = 'rgba(255,255,255,0.75)',
  trackColor = 'rgba(255,255,255,0.15)',
  font = 'ui-monospace, monospace',
  label = true,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Bar k="lx" v={lx} color={color} trackColor={trackColor} font={font} label={label} />
      <Bar k="ly" v={ly} color={color} trackColor={trackColor} font={font} label={label} />
      <Bar k="az" v={az} color={color} trackColor={trackColor} font={font} label={label} />
    </div>
  );
};

// ─── Readout ──────────────────────────────────────────────────────────────────

export const Readout: React.FC<ReadoutProps> = ({
  label,
  value,
  color,
}) => {
  return (
    <div
      style={{
        background: 'rgba(8,10,14,0.55)',
        backdropFilter: 'blur(6px)',
        padding: '3px 8px',
        display: 'flex',
        gap: 6,
        alignItems: 'baseline',
        borderRadius: 2,
        border: '1px solid rgba(255,255,255,0.05)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ opacity: 0.5, letterSpacing: '0.1em' }}>{label}</span>
      <span
        style={{
          color,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
};

// ─── VideoSignalOverlay ────────────────────────────────────────────────────────

export interface VideoSignalOverlayProps {
  state: WhepState;
}

export const VideoSignalOverlay: React.FC<VideoSignalOverlayProps> = ({ state }) => {
  const label = state === 'live' ? null : state === 'connecting' ? 'CONNECTING…' : state === 'retrying' ? 'RECONNECTING…' : 'NO SIGNAL';

  if (!label) return null;

  return (
    <div
      data-testid="video-signal-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 2,
        color: '#8b92a0',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 13,
        letterSpacing: '0.18em',
        opacity: 0.85,
      }}
    >
      {label}
    </div>
  );
};

// ─── Crosshair ─────────────────────────────────────────────────────────────────
// Center reticle: two 1px lines forming a faint cross. Pure presentational.
// Shared by MissionControl's landscape + portrait branches.

export interface CrosshairProps {
  accent: string;
}

export const Crosshair: React.FC<CrosshairProps> = ({ accent }) => (
  <div
    style={{
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: 16,
      height: 16,
      pointerEvents: 'none',
    }}
  >
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: 0,
        bottom: 0,
        width: 1,
        background: accent,
        opacity: 0.4,
      }}
    />
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        height: 1,
        background: accent,
        opacity: 0.4,
      }}
    />
  </div>
);

// ─── JoystickZone ──────────────────────────────────────────────────────────────
// Absolutely-positioned bottom-corner wrapper hosting a Joystick. Centralizes the
// DRIVE/STRAFE zone layout repeated across MissionControl (2 branches) + MissionTablet.
// The inner Joystick still emits its own data-testid="joystick-zone".

export interface JoystickZoneProps {
  side: 'left' | 'right';
  size: number;
  zIndex?: number;
  controlsDisabled?: boolean;
  variant?: JoystickVariant;
  axes?: JoystickAxes;
  baseSize?: number;
  knobSize?: number;
  baseColor?: string;
  ringColor?: string;
  knobColor?: string;
  knobBorder?: string;
  onMove?: (x: number, y: number) => void;
  onEnd?: () => void;
  label?: string;
  externalValue?: { x: number; y: number };
  externalActive?: boolean;
  /**
   * Optional reduced tap-region height. The inner Joystick keeps its full `size`
   * (so coordinate math is undistorted — getBoundingClientRect is unaffected by
   * clipping), but the wrapper clips it to `tapHeight` from the bottom up, so the
   * touch area only spans from the screen bottom to roughly the top of the hint.
   * Used on short landscape viewports (long phone) where a full square zone would
   * intrude too far up the screen.
   */
  tapHeight?: number;
}

export const JoystickZone: React.FC<JoystickZoneProps> = ({
  side,
  size,
  zIndex,
  controlsDisabled = false,
  variant,
  axes,
  baseSize,
  knobSize,
  baseColor,
  ringColor,
  knobColor,
  knobBorder,
  onMove,
  onEnd,
  label,
  externalValue,
  externalActive,
  tapHeight,
}) => (
  <div
    style={{
      position: 'absolute',
      bottom: 0,
      [side]: 0,
      width: size,
      height: tapHeight ?? size,
      ...(zIndex !== undefined ? { zIndex } : {}),
      pointerEvents: controlsDisabled ? 'none' : 'auto',
      ...(tapHeight !== undefined
        ? {
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
          }
        : {}),
    }}
  >
    <Joystick
      variant={variant}
      axes={axes}
      size={size}
      baseSize={baseSize}
      knobSize={knobSize}
      baseColor={baseColor}
      ringColor={ringColor}
      knobColor={knobColor}
      knobBorder={knobBorder}
      onMove={onMove}
      onEnd={onEnd}
      label={label}
      externalValue={externalValue}
      externalActive={externalActive}
    />
  </div>
);
