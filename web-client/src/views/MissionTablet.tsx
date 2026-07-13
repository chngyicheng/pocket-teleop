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
import { MiniMap, Compass, VelBars, Readout, SignalBars, CONNECTION_LABELS, VideoSignalOverlay, JoystickZone, HudToast, LatencySparkline } from '../components/shared.js';
import CollapsibleRail from '../components/CollapsibleRail.js';
import SpeedStepper from '../components/SpeedStepper.js';
import { TeleopBridge } from '../hooks/useTeleopBridge.js';
import { WhepStream } from '../hooks/useWhepStream.js';
import { batteryReadoutModel } from '../battery_readout.js';
import { networkReadoutModel } from '../network_readout.js';

export interface MissionTabletProps {
  bridge: TeleopBridge;
  stream: WhepStream;
  onMenu: () => void;
  /** When true (Settings drawer open), joysticks render but cannot be grabbed. */
  controlsDisabled?: boolean;
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

/**
 * MissionTablet component
 */
export const MissionTablet: React.FC<MissionTabletProps> = ({ bridge, stream, onMenu, controlsDisabled = false }) => {
  const p = MissionPalette;
  const { estopEngaged } = bridge;
  const sansFont = 'Inter, ui-sans-serif, system-ui, sans-serif';
  const monoFont = '"JetBrains Mono", ui-monospace, monospace';

  // Video ref for streaming MediaStream
  const videoRef = useRef<HTMLVideoElement>(null);

  // Track velocity axes for proper onEnd behavior
  const [lx, setLx] = useState(0);
  const [ly, setLy] = useState(0);
  const [az, setAz] = useState(0);

  // Collapsible rails state
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  // Raise the joysticks above the expanded-minimap overlay (zIndex 200) only while expanded,
  // so the operator can keep driving with the big map open.
  const [mapExpanded, setMapExpanded] = useState(false);

  // While the map is expanded, temporarily close both rails so the video goes fullscreen
  // behind the translucent map; restore the prior open/closed state on exit. Keyed on
  // mapExpanded only (not leftOpen/rightOpen) so the snapshot isn't clobbered.
  const prevRailsRef = useRef<{ left: boolean; right: boolean } | null>(null);
  useEffect(() => {
    if (mapExpanded) {
      prevRailsRef.current = { left: leftOpen, right: rightOpen };
      setLeftOpen(false);
      setRightOpen(false);
    } else if (prevRailsRef.current) {
      setLeftOpen(prevRailsRef.current.left);
      setRightOpen(prevRailsRef.current.right);
      prevRailsRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapExpanded]);

  // A long phone in landscape (very wide aspect) renders this tablet layout but
  // is short vertically, so the corner joystick zones overlap the side rails and
  // a full-size zone blocks the rail's touch-scroll. There, use a *smaller*
  // joystick (nothing clipped — so the stick UI is never sliced) so the rail
  // above the zone stays scrollable. Tablet-class screens (Fold unfolded, aspect
  // < 1.7) keep the full zone in BOTH orientations.
  const [isLongPhoneLandscape, setIsLongPhoneLandscape] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-aspect-ratio: 17/10)');
    const update = () => setIsLongPhoneLandscape(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const joySize = isLongPhoneLandscape ? 150 : 200;
  const joyBase = isLongPhoneLandscape ? 90 : 120;
  const joyKnob = isLongPhoneLandscape ? 38 : 50;

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

  // Derive odometry data from bridge.odom, preferring mapPose when available (SLAM)
  const odomPos = bridge.odom ?? { x: 0, y: 0, heading: 0 };
  const navPose = bridge.mapPose ?? odomPos;

  // Connection state label. While reconnecting, show the live attempt counter
  // (bridge.retryCount, counts up 1→2→3…) instead of the placeholder text.
  const connLabel = CONNECTION_LABELS[bridge.connectionState];
  const connText =
    bridge.connectionState === 'reconnecting'
      ? `⟳ Reconnecting… (${bridge.retryCount})`
      : connLabel.text;

  // Robot identity: prefer the reported name, fall back to the robot model
  // (robotType). When neither is known yet, render nothing (no fake placeholder).
  const robotLabel = bridge.robotName || bridge.robotType;

  // Battery readout: compute display value and color tier from bridge data
  const batModel = batteryReadoutModel(bridge.battery);
  const batColor =
    batModel.tier === 'ok'
      ? p.ok
      : batModel.tier === 'danger'
        ? p.danger
        : p.accent; // warn or none → amber

  // Network quality readout: compute color tier from quality score
  const sigModel = networkReadoutModel(bridge.networkQuality);
  const sigColor =
    sigModel.tier === 'ok'
      ? p.ok
      : sigModel.tier === 'danger'
        ? p.danger
        : sigModel.tier === 'warn'
          ? p.accent
          : p.muted; // none → gray
  const sigTitle = bridge.networkStats
    ? `RTT ${Math.round(bridge.networkStats.rtt)}ms · Jitter ${Math.round(bridge.networkStats.jitter)}ms · Loss ${(bridge.networkStats.lossRate * 100).toFixed(0)}%`
    : 'No data';

  // Gamepad input mapping: invert the knob-to-twist calculation to render truth.
  // DRIVE: knob (x, y) → twist (lx=-y, az=-x), so twist → knob is (x=-az, y=-lx).
  // STRAFE: knob x → twist ly, so twist → knob is (x=ly, y=0).
  const gamepadActive = bridge.inputSource === 'gamepad';
  const driveExternal = { x: -bridge.gamepadTwist.az, y: -bridge.gamepadTwist.lx };
  const strafeExternal = { x: bridge.gamepadTwist.ly, y: 0 };

  // HUD velocity: the actual slew-limited command published to the robot, for
  // whichever source owns control (all sources funnel through one publisher).
  // Published cmd_vel = normalized (ramped) × max.
  const dispLx = bridge.publishedTwist.lx;
  const dispLy = bridge.publishedTwist.ly;
  const dispAz = bridge.publishedTwist.az;
  const pubLinear = Math.hypot(dispLx, dispLy) * bridge.maxLinear;
  const pubAngular = dispAz * bridge.maxAngular;

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
        gridTemplateColumns: `${leftOpen ? 220 : 0}px 1fr ${rightOpen ? 240 : 0}px`,
        gridTemplateRows: '44px 1fr',
        position: 'relative',
        transition: 'grid-template-columns 0.2s ease',
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
          // Single-line bar: the robot-name label is the only element allowed to
          // shrink (minWidth:0 + ellipsis below). overflow:hidden is a safety net
          // so a too-wide bar clips instead of pushing E-STOP off the viewport.
          overflow: 'hidden',
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

        {/* Robot name + namespace — fills remaining space and is the sole shrink
            target: minWidth:0 + nowrap + ellipsis lets it truncate so the fixed
            readouts / connection chip / E-STOP always keep their room. */}
        <div
          style={{
            fontFamily: monoFont,
            fontSize: 9,
            letterSpacing: '0.1em',
            color: p.muted,
            fontWeight: 600,
            textTransform: 'uppercase',
            flex: '1 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          POCKET-TELEOP
          {robotLabel && (
            <span style={{ color: p.accent, marginLeft: 10 }}>● {robotLabel}</span>
          )}
          {bridge.robotNamespace && (
            <span style={{ color: p.muted, marginLeft: 8, opacity: 0.5 }}>
              /{bridge.robotNamespace}
            </span>
          )}
        </div>

        {/* UP placeholder readout (—); BAT + SIG are live */}
        <Readout label="UP" value="—" color={p.accent} />
        <Readout label="BAT" value={batModel.value} color={batColor} />
        <SignalBars quality={bridge.networkQuality} color={sigColor} title={sigTitle} />

        {/* LAT readout pill */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Readout
            label="LAT"
            value={bridge.latencyMs !== null ? bridge.latencyMs + 'ms' : '—'}
            color={p.accent}
          />
          <LatencySparkline history={bridge.latencyHistory} />
        </div>

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
          {connText}
        </div>

        {/* Gamepad connected indicator — only show when connected */}
        {bridge.gamepadConnected && (
          <div
            style={{
              fontFamily: monoFont,
              fontSize: 10,
              color: p.text,
              padding: '4px 8px',
              border: `1px solid ${p.border}`,
              borderRadius: 2,
              whiteSpace: 'nowrap',
              background: 'rgba(8, 10, 14, 0.7)',
            }}
          >
            🎮 GP
          </div>
        )}

        {/* E-STOP button — engaged state shows RESET affordance */}
        <button
          onClick={() => estopEngaged ? bridge.resetEstop() : bridge.eStop()}
          style={{
            background: estopEngaged ? '#ff0000' : p.danger,
            color: '#fff',
            border: estopEngaged ? '2px solid #fff' : 'none',
            borderRadius: 3,
            padding: '5px 12px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            fontFamily: monoFont,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            // position+zIndex so the stop control stays tappable above the expanded-map
            // overlay (zIndex 200) while driving with the map open.
            position: 'relative',
            zIndex: mapExpanded ? 260 : 10,
            animation: estopEngaged ? 'pulse 1s ease-in-out infinite alternate' : 'none',
          }}
        >
          {estopEngaged ? '■ RESET' : '■ STOP'}
        </button>
      </div>

      {/* E-STOP engaged banner — spans full width, above all content */}
      {estopEngaged && (
        <div
          style={{
            position: 'absolute',
            top: 44,
            left: 0,
            right: 0,
            background: '#ff0000',
            color: '#fff',
            textAlign: 'center',
            fontFamily: monoFont,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.12em',
            padding: '6px 0',
            zIndex: 20,
            gridColumn: '1 / -1',
          }}
        >
          ⚠ E-STOP ENGAGED — tap RESET
        </div>
      )}

      {/* Left rail */}
      <CollapsibleRail
        side="left"
        open={leftOpen}
        onToggle={() => setLeftOpen(o => !o)}
        title="STREAM"
        width={220}
        accent={p.accent}
        border={p.border}
        surface={p.surface}
        muted={p.muted}
      >
        <div
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            fontFamily: monoFont,
            fontSize: 10,
            color: p.muted,
          }}
        >
          <SidePanel title="VELOCITY">
            <VelBars
              lx={dispLx}
              ly={dispLy}
              az={dispAz}
              color={p.accent}
              trackColor="rgba(255,255,255,0.08)"
              font={monoFont}
            />
          </SidePanel>

          <SidePanel title="SPEED">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <SpeedStepper
                label="LINEAR"
                value={bridge.maxLinear}
                unit="m/s"
                min={0.1}
                max={2.0}
                step={0.1}
                onChange={bridge.setMaxLinear}
              />
              <SpeedStepper
                label="ANGULAR"
                value={bridge.maxAngular}
                unit="rad/s"
                min={0.1}
                max={3.0}
                step={0.1}
                onChange={bridge.setMaxAngular}
              />
            </div>
          </SidePanel>

          <SidePanel title="ODOMETRY">
            <DataRow k="pos.x" v={odomPos.x.toFixed(2) + ' m'} />
            <DataRow k="pos.y" v={odomPos.y.toFixed(2) + ' m'} />
            <DataRow k="hdg" v={Math.round(((odomPos.heading * 180 / Math.PI) % 360 + 360) % 360) + '°'} />
          </SidePanel>

          {/* Video information — moved to the bottom so the SPEED +/- sit near the
              top of the rail, away from the bottom-corner joysticks. */}
          <SidePanel title="VIDEO">
            <DataRow k="src" v="WebRTC" />
            {/* static-but-accurate: WebRTC/H.264 are the true pipeline values */}
            <DataRow k="codec" v="H.264" />
            <DataRow k="fps" v={stream.stats?.fps != null ? stream.stats.fps.toFixed(1) : '—'} />
            <DataRow k="res" v={(stream.stats?.width != null && stream.stats?.height != null) ? `${stream.stats.width}×${stream.stats.height}` : '—'} />
            <div style={{ fontSize: 10, fontFamily: monoFont }}>
              {stream.state === 'live' ? '● Live' : `● ${stream.state}`}
            </div>
          </SidePanel>

          {/* Footer ops info */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 9, opacity: 0.5, fontFamily: monoFont }}>
            <span>cmd_vel @ 50hz</span>
            <span>last pong 0.04s</span>
          </div>
        </div>
      </CollapsibleRail>

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
            objectFit: 'contain',
          }}
        />

        {/* Video signal overlay */}
        <VideoSignalOverlay state={stream.state} />

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
          <Readout label="V" value={pubLinear.toFixed(2) + ' m/s'} color={p.accent} />
          <Readout label="ω" value={pubAngular.toFixed(2) + ' rad/s'} color={p.accent} />
        </div>
      </main>

      {/* Right rail */}
      <CollapsibleRail
        side="right"
        open={rightOpen}
        onToggle={() => setRightOpen(o => !o)}
        title="MAP"
        width={240}
        accent={p.accent}
        border={p.border}
        surface={p.surface}
        muted={p.muted}
      >
        <div
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            fontFamily: monoFont,
            fontSize: 10,
            color: p.muted,
          }}
        >
          <MiniMap
            pos={navPose}
            heading={navPose.heading}
            size={200}
            color={p.accent}
            bg={p.bg}
            border={p.border}
            grid={true}
            mapGrid={bridge.mapGrid}
            mapPose={bridge.mapPose}
            scan={bridge.scan}
            robotLength={bridge.robotLength}
            robotWidth={bridge.robotWidth}
            expandable
            onExpandedChange={setMapExpanded}
            enableWaypoints
            navState={bridge.navState}
            navPath={bridge.navPath}
            onSendWaypoint={bridge.sendNavGoal}
            onNavPause={bridge.sendNavPause}
            onNavResume={bridge.sendNavResume}
            onNavCancel={bridge.sendNavCancel}
          />

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

          <SidePanel title="HINT">
            <div style={{ fontFamily: monoFont, fontSize: 10, color: p.muted, lineHeight: 1.55 }}>
              Touch &amp; hold either bottom corner of the screen to engage a joystick. Spacebar triggers e-stop.
            </div>
          </SidePanel>
        </div>
      </CollapsibleRail>

      {/* Collapsed-rail corner minimap — translucent overlay on the video,
          crossfades with the right rail (visible only while the rail is closed). */}
      <div
        data-testid="corner-minimap"
        style={{
          position: 'absolute',
          top: 52,
          right: 12,
          zIndex: 12,
          opacity: (rightOpen || mapExpanded) ? 0 : 1,
          transform: (rightOpen || mapExpanded) ? 'scale(0.92)' : 'scale(1)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          pointerEvents: (rightOpen || mapExpanded) ? 'none' : 'auto',
        }}
      >
        <MiniMap
          pos={navPose}
          heading={navPose.heading}
          size={150}
          color={p.accent}
          bg="rgba(8,10,14,0.45)"
          border={p.border}
          mapGrid={bridge.mapGrid}
          mapPose={bridge.mapPose}
          scan={bridge.scan}
          robotLength={bridge.robotLength}
          robotWidth={bridge.robotWidth}
          expandable
          onExpandedChange={setMapExpanded}
          enableWaypoints
          navState={bridge.navState}
          navPath={bridge.navPath}
          onSendWaypoint={bridge.sendNavGoal}
          onNavPause={bridge.sendNavPause}
          onNavResume={bridge.sendNavResume}
          onNavCancel={bridge.sendNavCancel}
        />
      </div>

      {/* Joystick overlays — bottom-left and bottom-right */}
      <JoystickZone
        side="left"
        size={joySize}
        zIndex={mapExpanded ? 250 : 5}
        controlsDisabled={controlsDisabled}
        variant="zone"
        baseSize={joyBase}
        knobSize={joyKnob}
        baseColor="rgba(240,169,42,0.10)"
        ringColor={p.accent + 'cc'}
        knobColor={p.accent}
        knobBorder={p.bg}
        label="DRIVE"
        onMove={handleDriveMove}
        onEnd={handleDriveEnd}
        externalActive={gamepadActive}
        externalValue={driveExternal}
      />

      <JoystickZone
        side="right"
        size={joySize}
        zIndex={mapExpanded ? 250 : 5}
        controlsDisabled={controlsDisabled}
        variant="zone"
        axes="x"
        baseSize={joyBase}
        knobSize={joyKnob}
        baseColor="rgba(78,201,214,0.10)"
        ringColor={p.accent2 + 'cc'}
        knobColor={p.accent2}
        knobBorder={p.bg}
        label="STRAFE"
        onMove={handleStrafeMove}
        onEnd={handleStrafeEnd}
        externalActive={gamepadActive}
        externalValue={strafeExternal}
      />

      {/* HUD Toast for nav feedback — just below the E-STOP banner slot
          (top bar 44 + banner ~28) so it reads as a notification and never
          covers the expanded map's nav buttons. */}
      <HudToast notice={bridge.navNotice} top={72} />
    </div>
  );
};
