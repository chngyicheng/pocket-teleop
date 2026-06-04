/**
 * MissionTablet.tsx — tablet-layout Mission Control HUD (three-column grid)
 * Ported 1:1 from design_handoff_pocket_teleop/directions/mission.jsx:MissionTablet
 *
 * Layout: CSS grid 220px / 1fr / 240px (left rail / video / right rail) + 52px top bar.
 * Joysticks float at bottom corners, z-index 5.
 * E-STOP button z-index 10 (always on top).
 *
 * Replaces useTeleopState with real bridge/stream props.
 * Joystick onMove/onEnd → bridge.sendTwist().
 * E-STOP and Space keydown → bridge.eStop().
 */

import React, { useState, useEffect, useRef } from 'react';
import { Joystick, MiniMap, Compass, VelBars, Readout, CONNECTION_LABELS } from '../components/shared.js';
import { TeleopBridge } from '../hooks/useTeleopBridge.js';
import { WhepStream } from '../hooks/useWhepStream.js';

export interface MissionTabletProps {
  bridge: TeleopBridge;
  stream: WhepStream;
  onMenu: () => void;
}

/**
 * Mission palette: dark industrial console
 */
const MissionPalette = {
  bg: '#0c0e12',
  surface: '#14171e',
  surface2: '#1a1e26',
  border: '#2a2f3a',
  text: '#e6e9ef',
  muted: '#8a92a3',
  accent: '#f0a92a', // amber
  accent2: '#4ec9d6', // cyan
  danger: '#ef4444',
  ok: '#22c55e',
};

/**
 * Helper components
 */

function SidePanel({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  const p = MissionPalette;
  const monoFont = '"JetBrains Mono", ui-monospace, monospace';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.18em',
          opacity: 0.5,
          textTransform: 'uppercase',
          fontFamily: monoFont,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function DataRow({ k, v }: { k: string; v: string }): JSX.Element {
  const p = MissionPalette;
  const monoFont = '"JetBrains Mono", ui-monospace, monospace';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        fontFamily: monoFont,
        fontSize: 11,
        gap: 6,
      }}
    >
      <span style={{ opacity: 0.6, whiteSpace: 'nowrap' }}>{k}</span>
      <span style={{ color: p.text, fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{v}</span>
    </div>
  );
}

function MissionPillToggle({ label, on }: { label: string; on: boolean }): JSX.Element {
  const p = MissionPalette;
  const monoFont = '"JetBrains Mono", ui-monospace, monospace';
  const [isOn, setIsOn] = useState(on);

  const handleClick = () => {
    const newState = !isOn;
    setIsOn(newState);
    console.log('toggle', label, newState);
  };

  return (
    <div
      onClick={handleClick}
      data-testid={`pill-toggle-${label.toLowerCase()}`}
      style={{
        fontFamily: monoFont,
        fontSize: 9,
        letterSpacing: '0.1em',
        padding: '4px 8px',
        borderRadius: 2,
        border: `1px solid ${isOn ? p.accent + '88' : p.border}`,
        color: isOn ? p.accent : p.muted,
        background: isOn ? p.accent + '14' : 'transparent',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
      className={isOn ? 'active' : ''}
    >
      {isOn ? '● ' : '○ '}
      {label}
    </div>
  );
}

/**
 * MissionTablet component
 */
export const MissionTablet: React.FC<MissionTabletProps> = ({ bridge, stream, onMenu }) => {
  const p = MissionPalette;
  const sansFont = 'Inter, ui-sans-serif, system-ui, sans-serif';
  const monoFont = '"JetBrains Mono", ui-monospace, monospace';

  // Video ref for streaming MediaStream
  const videoRef = useRef<HTMLVideoElement>(null);

  // Track velocity axes for proper onEnd behavior
  const [lx, setLx] = useState(0);
  const [ly, setLy] = useState(0);
  const [az, setAz] = useState(0);

  /**
   * axesRef holds the live (non-stale) current command.
   * React useState setters are async — reading lx/ly/az in a closure can
   * capture a stale render-cycle value.  The ref is always synchronously
   * up-to-date and is the authoritative source for what gets sent.
   */
  const axesRef = useRef({ lx: 0, ly: 0, az: 0 });

  // Video srcObject sync
  useEffect(() => {
    if (videoRef.current && stream.stream) {
      videoRef.current.srcObject = stream.stream;
    }
  }, [stream.stream]);

  // E-STOP via Space key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        bridge.eStop();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bridge]);

  // Derive odometry data from bridge.odom
  const odomPos = bridge.odom ?? { x: 0, y: 0, heading: 0 };

  // Connection state label
  const connLabel = CONNECTION_LABELS[bridge.connectionState];

  // DRIVE joystick: lx (forward) + az (rotate)
  const handleDriveMove = (x: number, y: number) => {
    setLx(-y);
    setAz(-x);
    axesRef.current.lx = -y;
    axesRef.current.az = -x;
    bridge.sendTwist(axesRef.current.lx, axesRef.current.ly, axesRef.current.az);
  };

  const handleDriveEnd = () => {
    setLx(0);
    setAz(0);
    axesRef.current.lx = 0;
    axesRef.current.az = 0;
    // ly preserved in axesRef — STRAFE may still be active
    bridge.sendTwist(axesRef.current.lx, axesRef.current.ly, axesRef.current.az);
  };

  // STRAFE joystick: ly (lateral)
  const handleStrafeMove = (x: number) => {
    setLy(x);
    axesRef.current.ly = x;
    bridge.sendTwist(axesRef.current.lx, axesRef.current.ly, axesRef.current.az);
  };

  const handleStrafeEnd = () => {
    setLy(0);
    axesRef.current.ly = 0;
    // lx and az preserved in axesRef — DRIVE may still be active
    bridge.sendTwist(axesRef.current.lx, axesRef.current.ly, axesRef.current.az);
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: p.bg,
        color: p.text,
        fontFamily: sansFont,
        display: 'grid',
        gridTemplateColumns: '220px 1fr 240px',
        gridTemplateRows: '44px 1fr',
        position: 'relative',
      }}
    >
      {/* Top bar spans all columns. fontSize: 10 sets a small baseline so
          Readouts (which don't set their own font-size) inherit it instead of
          ballooning to the body default. */}
      <div
        style={{
          gridColumn: '1 / -1',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 10px',
          background: p.surface,
          borderBottom: `1px solid ${p.border}`,
          fontSize: 10,
        }}
      >
        {/* Hamburger menu */}
        <button
          type="button"
          aria-label="Open menu"
          onClick={onMenu}
          style={{
            width: 18,
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: p.muted,
            fontSize: 16,
            cursor: 'pointer',
            flex: '0 0 auto',
            background: 'transparent',
            border: 'none',
            padding: 0,
          }}
        >
          ☰
        </button>

        {/* Robot name + namespace */}
        <div
          style={{
            fontFamily: monoFont,
            fontSize: 9,
            letterSpacing: '0.1em',
            color: p.muted,
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          POCKET-TELEOP
          <span style={{ color: p.accent, marginLeft: 10 }}>● {bridge.robotName || 'bot-07'}</span>
          <span style={{ color: p.muted, marginLeft: 8, opacity: 0.5 }}>
            /{bridge.robotNamespace || 'ns/robot1'}
          </span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* UP, BAT, SIG placeholder readouts */}
        <Readout label="UP" value="03:24:18" color={p.accent} />
        <Readout label="BAT" value="78%" color={p.accent} />
        <Readout label="SIG" value="-58dBm" color={p.accent} />

        {/* LAT readout pill */}
        <Readout
          label="LAT"
          value={bridge.latencyMs !== null ? bridge.latencyMs + 'ms' : '—'}
          color={p.accent}
        />

        {/* Connection state chip */}
        <div
          style={{
            fontFamily: monoFont,
            fontSize: 10,
            color: connLabel.color,
            padding: '4px 8px',
            border: `1px solid ${connLabel.color}55`,
            borderRadius: 2,
            whiteSpace: 'nowrap',
          }}
        >
          {connLabel.text}
        </div>

        {/* E-STOP button */}
        <button
          onClick={() => bridge.eStop()}
          style={{
            background: p.danger,
            color: '#fff',
            border: 'none',
            borderRadius: 3,
            padding: '5px 12px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            fontFamily: monoFont,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          ■ E-STOP
        </button>
      </div>

      {/* Left rail */}
      <aside
        style={{
          background: p.surface,
          borderRight: `1px solid ${p.border}`,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          fontFamily: monoFont,
          fontSize: 10,
          color: p.muted,
          overflow: 'auto',
        }}
      >
        <SidePanel title="STREAM">
          <DataRow k="src" v="WebRTC" />
          <DataRow k="codec" v="H.264" />
          <DataRow k="fps" v="30.1" />
          <DataRow k="res" v="1280×720" />
          <div
            style={{
              fontSize: 10,
              fontFamily: monoFont,
            }}
          >
            {stream.state === 'live' ? '● Live' : `● ${stream.state}`}
          </div>
        </SidePanel>

        <SidePanel title="VELOCITY">
          <VelBars
            lx={lx}
            ly={ly}
            az={az}
            color={p.accent}
            trackColor="rgba(255,255,255,0.08)"
            font={monoFont}
          />
        </SidePanel>

        <SidePanel title="ODOMETRY">
          <DataRow k="pos.x" v={odomPos.x.toFixed(2) + ' m'} />
          <DataRow k="pos.y" v={odomPos.y.toFixed(2) + ' m'} />
          <DataRow k="hdg" v={Math.round(((odomPos.heading * 180 / Math.PI) % 360 + 360) % 360) + '°'} />
        </SidePanel>

        {/* Footer ops info */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 9, opacity: 0.5, fontFamily: monoFont }}>
          <span>cmd_vel @ 50hz</span>
          <span>last pong 0.04s</span>
        </div>
      </aside>

      {/* Main viewport */}
      <main
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: p.bg,
        }}
      >
        {/* Video element */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />

        {/* Center reticle */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 80,
            height: 80,
            pointerEvents: 'none',
          }}
        >
          <svg viewBox="0 0 80 80" width="80" height="80">
            <circle cx="40" cy="40" r="34" fill="none" stroke={p.accent} strokeOpacity="0.35" strokeWidth="0.5" strokeDasharray="2 3" />
            <line x1="40" y1="20" x2="40" y2="32" stroke={p.accent} strokeOpacity="0.7" strokeWidth="1" />
            <line x1="40" y1="48" x2="40" y2="60" stroke={p.accent} strokeOpacity="0.7" strokeWidth="1" />
            <line x1="20" y1="40" x2="32" y2="40" stroke={p.accent} strokeOpacity="0.7" strokeWidth="1" />
            <line x1="48" y1="40" x2="60" y2="40" stroke={p.accent} strokeOpacity="0.7" strokeWidth="1" />
            <circle cx="40" cy="40" r="2" fill={p.accent} />
          </svg>
        </div>

        {/* Mode chip */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            display: 'flex',
            gap: 6,
          }}
        >
          <div
            style={{
              fontFamily: monoFont,
              fontSize: 10,
              letterSpacing: '0.1em',
              background: 'rgba(8,10,14,0.7)',
              color: p.text,
              padding: '4px 8px',
              borderRadius: 2,
              border: `1px solid ${p.border}`,
            }}
          >
            MANUAL · TELEOP
          </div>
        </div>

        {/* Velocity vector overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 8,
          }}
        >
          <Readout label="V" value={Math.hypot(lx, ly).toFixed(2) + ' m/s'} color={p.accent} />
          <Readout label="ω" value={az.toFixed(2) + ' rad/s'} color={p.accent} />
        </div>
      </main>

      {/* Right rail */}
      <aside
        style={{
          background: p.surface,
          borderLeft: `1px solid ${p.border}`,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          overflow: 'auto',
        }}
      >
        <SidePanel title="MAP">
          <MiniMap
            pos={odomPos}
            heading={odomPos.heading}
            size={200}
            color={p.accent}
            bg={p.bg}
            border={p.border}
            grid={true}
          />
        </SidePanel>

        <SidePanel title="HEADING">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Compass heading={odomPos.heading} color={p.accent} font={monoFont} size={44} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontFamily: monoFont, fontSize: 10 }}>
              <DataRow
                k="course"
                v={Math.round(((odomPos.heading * 180 / Math.PI) % 360 + 360) % 360).toString().padStart(3, '0') + '°'}
              />
              <DataRow k="track" v={(Math.atan2(ly, lx) * 180 / Math.PI).toFixed(0) + '°'} />
            </div>
          </div>
        </SidePanel>

        <SidePanel title="LIGHTS">
          <div style={{ display: 'flex', gap: 6 }}>
            <MissionPillToggle label="HEAD" on={true} />
            <MissionPillToggle label="AUX" on={false} />
            <MissionPillToggle label="LASER" on={false} />
          </div>
        </SidePanel>

        <SidePanel title="HINT">
          <div style={{ fontFamily: monoFont, fontSize: 10, color: p.muted, lineHeight: 1.55 }}>
            Touch &amp; hold either bottom corner of the screen to engage a joystick. Spacebar triggers e-stop.
          </div>
        </SidePanel>
      </aside>

      {/* Joystick overlays — bottom-left and bottom-right */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: 280,
          height: 280,
          zIndex: 5,
          pointerEvents: 'auto',
        }}
      >
        <Joystick
          variant="zone"
          size={280}
          baseSize={140}
          knobSize={56}
          baseColor="rgba(240,169,42,0.10)"
          ringColor={p.accent + 'cc'}
          knobColor={p.accent}
          knobBorder={p.bg}
          label="DRIVE"
          onMove={handleDriveMove}
          onEnd={handleDriveEnd}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 280,
          height: 280,
          zIndex: 5,
          pointerEvents: 'auto',
        }}
      >
        <Joystick
          variant="zone"
          axes="x"
          size={280}
          baseSize={140}
          knobSize={56}
          baseColor="rgba(78,201,214,0.10)"
          ringColor={p.accent2 + 'cc'}
          knobColor={p.accent2}
          knobBorder={p.bg}
          label="STRAFE"
          onMove={handleStrafeMove}
          onEnd={handleStrafeEnd}
        />
      </div>
    </div>
  );
};
