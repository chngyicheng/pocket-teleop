/**
 * shared.tsx — React+TypeScript migration of design_handoff/shared.jsx
 * Common HUD building blocks: Joystick, MiniMap, Compass, CompassTape, VelBars, Readout
 * Pure presentational components (no data layer coupling).
 */

import React, { useState, useEffect, useRef, useCallback, ReactNode, CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { WhepState } from '../whep_client.js';
import { mapToScreenTransform, scanToScreenPoints, mapToRgba, footprintScreenRect, selectScanCapturePose, worldToScreenPoint, screenToWorldPoint, pointerToWorldHeading, worldHeadingToScreenDeg } from '../map_render.js';

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
  mapGrid?: { cells: Uint8Array; width: number; height: number; resolution: number; originX: number; originY: number } | null;
  mapPose?: { frame: 'map' | 'odom'; x: number; y: number; heading: number } | null;
  scan?: { angleMin: number; angleIncrement: number; rangeMax: number; ranges: number[] } | null;
  metersAcross?: number;
  robotLength?: number;
  robotWidth?: number;
  /** When true, a tap on the minimap expands it to a full-screen overlay. */
  expandable?: boolean;
  /** Fires whenever the expanded state changes — lets the view raise the joysticks above the overlay. */
  onExpandedChange?: (expanded: boolean) => void;
  /** Enable waypoint placement UI in expanded view. */
  enableWaypoints?: boolean;
  /** Current nav2 action state: 'idle' (no nav goal), 'active' (navigating), 'paused' (paused). */
  navState?: 'idle' | 'active' | 'paused';
  /** Global path from nav2 (array of [x, y] world coords). */
  navPath?: [number, number][];
  /** Fires when waypoint is placed: (worldX, worldY, heading) in map frame. */
  onSendWaypoint?: (wx: number, wy: number, heading: number) => void;
  /** Fires when pause button clicked during active navigation. */
  onNavPause?: () => void;
  /** Fires when resume button clicked during paused navigation. */
  onNavResume?: () => void;
  /** Fires when stop button clicked (cancels nav goal). */
  onNavCancel?: () => void;
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

/** Internal props for MiniMapView — extends public MiniMapProps with an onTap callback. */
interface MiniMapViewProps extends MiniMapProps {
  onTap?: () => void;
  /** Hide via visibility (keeps layout footprint) — used to hide the collapsed view while expanded. */
  hidden?: boolean;
  /** Waypoint placement mode: true when user is actively placing a waypoint. */
  waypointMode?: boolean;
  /** Placed waypoint (screen or world coords; caller manages state). */
  waypoint?: { wx: number; wy: number; heading: number } | null;
  /** Fires on pointer up (tap-like release) to place waypoint at world coords. */
  onWaypointPlace?: (wx: number, wy: number) => void;
  /** Fires on dial drag to update waypoint heading. */
  onWaypointHeading?: (heading: number) => void;
}

/** Internal component that owns all the map rendering, pinch-zoom, tap detection, and wheel-zoom logic. */
const MiniMapView: React.FC<MiniMapViewProps> = ({
  pos,
  heading,
  size = 92,
  color = '#4ec9d6',
  bg = 'rgba(0,0,0,0.55)',
  border = 'rgba(255,255,255,0.15)',
  grid = true,
  ranges = false,
  trail = true,
  mapGrid = null,
  mapPose = null,
  scan = null,
  metersAcross = 10,
  robotLength = 0,
  robotWidth = 0,
  onTap,
  hidden = false,
  waypointMode = false,
  waypoint = null,
  onWaypointPlace,
  onWaypointHeading,
  navPath,
}) => {
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ startDist: number; startM: number } | null>(null);
  const tapStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const [viewM, setViewM] = useState(metersAcross);

  // Build offscreen canvas when mapGrid changes
  useEffect(() => {
    if (!mapGrid) {
      offscreenRef.current = null;
      return;
    }

    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = mapGrid.width;
      offscreen.height = mapGrid.height;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;

      const imgData = new ImageData(mapToRgba(mapGrid.cells, mapGrid.width, mapGrid.height), mapGrid.width, mapGrid.height);
      ctx.putImageData(imgData, 0, 0);
      offscreenRef.current = offscreen;
    } catch (_) {
      offscreenRef.current = null;
    }
  }, [mapGrid]);

  // Sync viewM when prop metersAcross changes (map turned off or initialization)
  useEffect(() => {
    setViewM(metersAcross);
  }, [metersAcross]);

  // Render canvas when map/pose/scan change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapGrid || !mapPose) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return; // jsdom has null ctx

    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;

      // Re-clamp here: a newly arrived (smaller) map can shrink maxM below
      // the current viewM; the drawing and the data attribute must agree.
      const m = Math.min(
        Math.max(viewM, 1.0),
        Math.max(mapGrid.width, mapGrid.height) * mapGrid.resolution * 1.2,
      );

      // Draw map image
      if (offscreenRef.current) {
        const t = mapToScreenTransform(mapPose, mapGrid, size, m);
        ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
        ctx.drawImage(offscreenRef.current, 0, 0);
      }

      // Draw scan overlay
      if (scan) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const capturePose = selectScanCapturePose(scan.pose, mapPose);
        const points = scanToScreenPoints(scan, capturePose, mapPose, size, m);
        ctx.fillStyle = hexToRgba(color, 0.8);
        for (const p of points) {
          ctx.fillRect(p.x - 0.75, p.y - 0.75, 1.5, 1.5);
        }
      }
    } catch (_) {
      // jsdom errors; do nothing
    }
  }, [mapGrid, mapPose, scan, size, viewM, color]);

  useEffect(() => {
    trailRef.current.push({ x: pos.x, y: pos.y });
    if (trailRef.current.length > 80) trailRef.current.shift();
  }, [pos.x, pos.y]);

  // Compute clampedViewM early so it's available in callbacks
  const clampedViewM = mapGrid && mapPose
    ? Math.min(Math.max(viewM, 1.0), Math.max(mapGrid.width, mapGrid.height) * mapGrid.resolution * 1.2)
    : viewM;

  // Wheel zoom — map mode only; native listener so we can call preventDefault.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      if (!mapGrid || !mapPose) return; // no map: allow scroll to pass through
      e.preventDefault();
      const maxM = Math.max(mapGrid.width, mapGrid.height) * mapGrid.resolution * 1.2;
      const factor = e.deltaY < 0 ? 1 / 1.1 : 1.1;
      setViewM((prev) => Math.min(Math.max(prev * factor, 1.0), maxM));
    };

    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [mapGrid, mapPose]);

  // Pointer handlers — pointer bookkeeping and tap detection run unconditionally;
  // pinch math is gated on map mode and suppressed in waypointMode.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Unconditional: register pointer and track tap start
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 1) {
        // First finger — potential tap
        tapStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      } else if (pointersRef.current.size === 2) {
        // Second finger — this is a pinch, not a tap
        tapStartRef.current = null;

        // Pinch math only in map mode and not in waypointMode
        if (!waypointMode && mapGrid && mapPose) {
          const pointers = Array.from(pointersRef.current.values());
          const dx = pointers[1].x - pointers[0].x;
          const dy = pointers[1].y - pointers[0].y;
          const startDist = Math.hypot(dx, dy);
          pinchRef.current = { startDist, startM: viewM };
        }
      }
    },
    [mapGrid, mapPose, viewM, waypointMode]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!mapGrid || !mapPose || !pinchRef.current) return;

      const pointers = pointersRef.current;
      if (!pointers.has(e.pointerId)) return;

      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        const newDist = Math.hypot(dx, dy);

        if (newDist < 8) return; // Avoid division by very small numbers

        const { startDist, startM } = pinchRef.current;
        const minM = 1.0;
        const maxM = Math.max(mapGrid.width, mapGrid.height) * mapGrid.resolution * 1.2;
        const newViewM = startM * (startDist / newDist);
        const clamped = Math.min(Math.max(newViewM, minM), maxM);
        setViewM(clamped);
      }
    },
    [mapGrid, mapPose]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const isValidRelease =
        tapStartRef.current && pointersRef.current.size === 1 && mapGrid && mapPose;

      // Waypoint placement: release (any distance or time) converts screen → world
      // ponytail: loupe magnifier deferred — add when tuning real-touch placement precision
      if (waypointMode && isValidRelease && onWaypointPlace && rect) {
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const world = screenToWorldPoint({ x: localX, y: localY }, mapPose, size, clampedViewM);
        onWaypointPlace(world.x, world.y);
      }

      // Regular tap (no waypoint mode): only if moved <10px and dt < 400ms
      if (!waypointMode && onTap && tapStartRef.current && pointersRef.current.size === 1) {
        const { x, y, t } = tapStartRef.current;
        const dist = Math.hypot(e.clientX - x, e.clientY - y);
        const dt = Date.now() - t;
        if (dist < 10 && dt < 400) {
          onTap();
        }
      }

      tapStartRef.current = null;
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) {
        pinchRef.current = null;
      }
    },
    [onTap, waypointMode, mapGrid, mapPose, onWaypointPlace, size, clampedViewM]
  );

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    tapStartRef.current = null;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    tapStartRef.current = null;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
  }, []);

  const scale = 6;
  const mapPoints = trailRef.current.map((p) => ({
    x: size / 2 + (p.x - pos.x) * scale,
    y: size / 2 + (p.y - pos.y) * scale,
  }));

  const labelText = mapGrid && mapPose ? (mapPose.frame === 'map' ? 'MAP' : 'ODOM') : 'NO MAP';

  // Compute pxPerM based on map mode or odom fallback
  const pxPerM = mapGrid && mapPose ? size / clampedViewM : scale;

  // Compute footprint dimensions
  const footprint = footprintScreenRect(robotLength, robotWidth, pxPerM);
  const footprintRotation = mapGrid && mapPose ? 0 : heading * 180 / Math.PI;

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      style={{
        width: size,
        height: size,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 6,
        position: 'relative',
        overflow: 'hidden',
        touchAction: mapGrid && mapPose ? 'none' : undefined,
        cursor: onTap ? 'pointer' : undefined,
        visibility: hidden ? 'hidden' : undefined,
      }}
    >
      {/* Canvas (map + scan) — only if mapGrid && mapPose */}
      {mapGrid && mapPose && (
        <canvas
          ref={canvasRef}
          data-testid="minimap-canvas"
          data-meters-across={clampedViewM.toFixed(2)}
          width={size}
          height={size}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Grid (HUD) — always shown if grid=true */}
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
            pointerEvents: 'none',
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

      {/* Robot footprint outline (dashed rectangle) — rendered before arrow so arrow is on top */}
      {footprint && (
        <svg
          viewBox={`0 0 ${size} ${size}`}
          data-testid="minimap-footprint"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <g transform={`translate(${size / 2} ${size / 2}) rotate(${footprintRotation})`}>
            <rect
              x={-footprint.widthPx / 2}
              y={-footprint.heightPx / 2}
              width={footprint.widthPx}
              height={footprint.heightPx}
              fill="none"
              stroke={color}
              strokeOpacity="0.5"
              strokeWidth="1"
              strokeDasharray="3 2"
              rx="1"
            />
          </g>
        </svg>
      )}

      {/* Nav path polyline (global path from nav2) — map mode only */}
      {navPath && navPath.length > 0 && mapGrid && mapPose && (
        <svg
          viewBox={`0 0 ${size} ${size}`}
          data-testid="nav-path"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <polyline
            points={navPath
              .map((pt) => worldToScreenPoint({ x: pt[0], y: pt[1] }, mapPose, size, clampedViewM))
              .map((p) => `${p.x},${p.y}`)
              .join(' ')}
            fill="none"
            stroke="#ffb454"
            strokeOpacity="0.8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Waypoint marker + dial (map mode only, when waypoint is placed) */}
      {waypoint && mapGrid && mapPose && (
        <svg
          viewBox={`0 0 ${size} ${size}`}
          data-testid="waypoint-svg"
          style={{ position: 'absolute', inset: 0, pointerEvents: waypointMode ? 'auto' : 'none' }}
        >
          {/* Calculate marker position (world → screen) */}
          {(() => {
            const markerScreen = worldToScreenPoint({ x: waypoint.wx, y: waypoint.wy }, mapPose, size, clampedViewM);
            const markerRad = 6;
            const dialRad = 18;
            // Arrow + handle face the waypoint heading in the base_link-fixed view.
            const screenHeading = worldHeadingToScreenDeg(waypoint.heading, mapPose.heading);
            const dh = waypoint.heading - mapPose.heading;
            const handleX = markerScreen.x - dialRad * Math.sin(dh);
            const handleY = markerScreen.y - dialRad * Math.cos(dh);

            // Drag aims the heading at the finger (RViz-style), direction-only.
            const startHeadingDrag = (e: React.PointerEvent) => {
              e.stopPropagation();
              const onMove = (ev: PointerEvent) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                const worldHeading = pointerToWorldHeading(
                  markerScreen,
                  { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
                  mapPose.heading,
                );
                onWaypointHeading?.(worldHeading);
              };
              const onUp = () => {
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
              };
              document.addEventListener('pointermove', onMove);
              document.addEventListener('pointerup', onUp);
            };

            return (
              <g>
                {/* Marker circle at waypoint world position */}
                <circle
                  data-testid="waypoint-marker"
                  cx={markerScreen.x}
                  cy={markerScreen.y}
                  r={markerRad}
                  fill="#ffb454"
                  opacity="0.9"
                  stroke="#fff"
                  strokeWidth="2"
                />

                {/* Directional arrow/heading indicator */}
                <g transform={`translate(${markerScreen.x} ${markerScreen.y}) rotate(${screenHeading})`}>
                  <polygon points="0,-8 3,3 0,1 -3,3" fill="#ffb454" opacity="0.9" />
                </g>

                {/* Dial handle (draggable) — line + grip pointing toward the heading */}
                {waypointMode && (
                  <g>
                    <line
                      x1={markerScreen.x}
                      y1={markerScreen.y}
                      x2={handleX}
                      y2={handleY}
                      stroke="#ffb454"
                      strokeWidth="1.5"
                      opacity="0.6"
                    />
                    {/* Larger transparent hit target for easy touch grab */}
                    <circle
                      data-testid="waypoint-dial"
                      cx={handleX}
                      cy={handleY}
                      r={16}
                      fill="transparent"
                      cursor="grab"
                      onPointerDown={startHeadingDrag}
                    />
                    <circle
                      cx={handleX}
                      cy={handleY}
                      r={6}
                      fill="#ffb454"
                      opacity="0.85"
                      stroke="#fff"
                      strokeWidth="1.5"
                      pointerEvents="none"
                    />
                  </g>
                )}
              </g>
            );
          })()}
        </svg>
      )}

      {/* Robot arrow at center. In map mode the view is base_link-fixed —
          the map rotates around the robot, so the arrow stays pointing up.
          In odom fallback the grid is static, so the arrow shows heading. */}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        <g transform={`translate(${size / 2} ${size / 2}) rotate(${mapGrid && mapPose ? 0 : heading * 180 / Math.PI})`}>
          <polygon points="0,-7 5,5 0,2 -5,5" fill={color} />
          <circle r="2" fill={color} />
        </g>
      </svg>

      {/* Label */}
      <div
        data-testid="minimap-label"
        style={{
          position: 'absolute',
          bottom: 2,
          left: 2,
          fontSize: 7,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: hexToRgba(color, 0.6),
          fontWeight: 600,
          pointerEvents: 'none',
        }}
      >
        {labelText}
      </div>
    </div>
  );
};

/** Public MiniMap component. When expandable=true, a tap opens a full-screen overlay. */
export const MiniMap: React.FC<MiniMapProps> = ({
  expandable,
  onExpandedChange,
  enableWaypoints,
  navState = 'idle',
  navPath,
  onSendWaypoint,
  onNavPause,
  onNavResume,
  onNavCancel,
  mapGrid,
  mapPose,
  ...props
}) => {
  const [expanded, setExpanded] = useState(false);
  const [waypointMode, setWaypointMode] = useState(false);
  const [waypoint, setWaypoint] = useState<{ wx: number; wy: number; heading: number } | null>(null);

  // Notify the view so it can raise the joysticks above the overlay while expanded.
  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  const expandedSize = Math.min(
    typeof window !== 'undefined' ? window.innerWidth : 400,
    typeof window !== 'undefined' ? window.innerHeight : 400,
  ) * 0.85;

  const canSetWaypoint = enableWaypoints && mapGrid && mapPose && mapPose.frame === 'map';

  const handleBackdropClick = () => {
    setExpanded(false);
    setWaypointMode(false);
    setWaypoint(null);
  };

  const overlay = (
    <div
      data-testid="minimap-expanded"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Backdrop */}
      <div
        data-testid="minimap-backdrop"
        onClick={handleBackdropClick}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
        }}
      />
      {/* Expanded map view — sits above backdrop. bg is forced translucent (regardless of the
          collapsed instance's bg) so the video feed shows through in every layout, matching
          the portrait minimap. */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <MiniMapView
          {...props}
          mapGrid={mapGrid}
          mapPose={mapPose}
          bg="rgba(8,10,14,0.7)"
          size={expandedSize}
          onTap={waypointMode ? undefined : () => setExpanded(false)}
          waypointMode={waypointMode}
          waypoint={waypoint}
          navPath={navPath}
          onWaypointPlace={(wx, wy) => {
            setWaypoint({ wx, wy, heading: mapPose?.heading ?? 0 });
          }}
          onWaypointHeading={(h) => {
            setWaypoint((w) => (w ? { ...w, heading: h } : w));
          }}
        />

        {/* Control buttons — only shown in expanded mode */}
        <div
          data-testid="nav-controls"
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'center',
            minHeight: 40,
          }}
        >
          {navState === 'idle' && !waypointMode && (
            <button
              data-testid="set-waypoint-btn"
              disabled={!canSetWaypoint}
              onClick={() => {
                setWaypointMode(true);
                setWaypoint(null);
              }}
              style={{
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 4,
                border: 'none',
                background: canSetWaypoint ? '#4ec9d6' : 'rgba(78,201,214,0.3)',
                color: canSetWaypoint ? '#000' : 'rgba(0,0,0,0.5)',
                cursor: canSetWaypoint ? 'pointer' : 'not-allowed',
                opacity: canSetWaypoint ? 1 : 0.6,
                transition: 'all 200ms',
              }}
            >
              Set Waypoint
            </button>
          )}

          {waypointMode && (
            <>
              <button
                data-testid="send-waypoint-btn"
                disabled={!waypoint}
                onClick={() => {
                  if (waypoint) {
                    onSendWaypoint?.(waypoint.wx, waypoint.wy, waypoint.heading);
                    setWaypointMode(false);
                    setWaypoint(null);
                  }
                }}
                style={{
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  background: waypoint ? '#22c55e' : 'rgba(34,197,94,0.3)',
                  color: waypoint ? '#000' : 'rgba(0,0,0,0.5)',
                  cursor: waypoint ? 'pointer' : 'not-allowed',
                  opacity: waypoint ? 1 : 0.6,
                  transition: 'all 200ms',
                }}
              >
                Send Waypoint
              </button>
              <button
                data-testid="cancel-waypoint-btn"
                onClick={() => {
                  setWaypointMode(false);
                  setWaypoint(null);
                }}
                style={{
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  cursor: 'pointer',
                  opacity: 1,
                  transition: 'all 200ms',
                }}
              >
                Cancel
              </button>
            </>
          )}

          {navState === 'active' && (
            <>
              <button
                data-testid="nav-pause-btn"
                onClick={() => onNavPause?.()}
                style={{
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  background: '#f59e0b',
                  color: '#000',
                  cursor: 'pointer',
                  opacity: 1,
                  transition: 'all 200ms',
                }}
              >
                Pause
              </button>
              <button
                data-testid="nav-stop-btn"
                onClick={() => onNavCancel?.()}
                style={{
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  cursor: 'pointer',
                  opacity: 1,
                  transition: 'all 200ms',
                }}
              >
                Stop
              </button>
            </>
          )}

          {navState === 'paused' && (
            <>
              <button
                data-testid="nav-resume-btn"
                onClick={() => onNavResume?.()}
                style={{
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  background: '#22c55e',
                  color: '#000',
                  cursor: 'pointer',
                  opacity: 1,
                  transition: 'all 200ms',
                }}
              >
                Resume
              </button>
              <button
                data-testid="nav-stop-btn"
                onClick={() => onNavCancel?.()}
                style={{
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  cursor: 'pointer',
                  opacity: 1,
                  transition: 'all 200ms',
                }}
              >
                Stop
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Collapsed view — hidden (keeps its layout footprint) while expanded so it
          doesn't show through the semi-transparent backdrop. */}
      <MiniMapView
        {...props}
        mapGrid={mapGrid}
        mapPose={mapPose}
        hidden={expandable && expanded}
        onTap={expandable ? () => setExpanded(true) : undefined}
        navPath={navPath}
      />

      {/* Expanded overlay — portaled to <body> so it escapes any transformed/clipping
          ancestor (e.g. the CollapsibleRail's translateX panel) and fills the viewport. */}
      {expandable && expanded && typeof document !== 'undefined' &&
        createPortal(overlay, document.body)}
    </>
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

// ─── SignalBars ───────────────────────────────────────────────────────────────

export interface SignalBarsProps {
  quality: number | null;
  color: string;
  mutedColor?: string;
  title?: string;
}

export const SignalBars: React.FC<SignalBarsProps> = ({
  quality,
  color,
  mutedColor = 'rgba(255,255,255,0.15)',
  title,
}) => {
  const barHeights = [5, 8, 11, 14]; // px
  const barWidth = 3; // px
  const barGap = 2; // px

  return (
    <div
      data-testid="signal-bars"
      title={title}
      style={{
        background: 'rgba(8,10,14,0.55)',
        backdropFilter: 'blur(6px)',
        padding: '3px 8px',
        display: 'flex',
        gap: 6,
        alignItems: 'flex-end',
        borderRadius: 2,
        border: '1px solid rgba(255,255,255,0.05)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ opacity: 0.5, letterSpacing: '0.1em' }}>SIG</span>
      <div
        style={{
          display: 'flex',
          gap: barGap,
          alignItems: 'flex-end',
        }}
      >
        {barHeights.map((height, i) => {
          const filled = quality !== null && i < quality;
          return (
            <div
              key={i}
              data-testid="signal-bar"
              data-filled={String(filled)}
              style={{
                width: barWidth,
                height,
                backgroundColor: filled ? color : mutedColor,
                borderRadius: 1,
              }}
            />
          );
        })}
      </div>
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
}) => (
  <div
    style={{
      position: 'absolute',
      bottom: 0,
      [side]: 0,
      width: size,
      height: size,
      ...(zIndex !== undefined ? { zIndex } : {}),
      pointerEvents: controlsDisabled ? 'none' : 'auto',
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
