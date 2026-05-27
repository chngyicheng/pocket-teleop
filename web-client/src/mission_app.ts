import { TeleopClient } from './teleop_client.js';
import { WhepClient } from './whep_client.js';
import { MissionHeader, type ConnectionState } from './mission_header.js';
import { MissionJoystick } from './mission_joystick.js';
import { mountVelBars, mountMiniMap, mountCompass, mountReadout } from './mission_hud.js';

export interface MissionAppOptions {
  root: HTMLElement;
  robotName?: string;
  layout?: 'phone-landscape' | 'phone-portrait' | 'tablet';
  teleopUrl: string;
  whepUrl?: string;
  TeleopClientCtor?: typeof TeleopClient;
  WhepClientCtor?: typeof WhepClient;
}

export interface MissionAppHandle {
  destroy(): void;
  _setConnectionState?: (state: 'live' | 'reconnecting' | 'disconnected', n?: number) => void;
  _fireOdom?: (x: number, y: number, heading: number) => void;
  _fireLatency?: (ms: number) => void;
  _eStop?: () => void;
  _driveMove?: (x: number, y: number) => void;
  _strafeMove?: (x: number) => void;
}

export function startMissionApp(opts: MissionAppOptions): MissionAppHandle {
  const layout = opts.layout ?? 'phone-landscape';
  const robotName = opts.robotName ?? 'bot-07';
  const TeleopClientCtor = opts.TeleopClientCtor ?? TeleopClient;
  const WhepClientCtor = opts.WhepClientCtor ?? WhepClient;

  opts.root.className = `mission-app mission-${layout}`;
  opts.root.style.width = '100%';
  opts.root.style.height = '100%';
  opts.root.style.display = 'flex';
  opts.root.style.flexDirection = 'column';
  opts.root.style.overflow = 'hidden';

  // Create header container
  const headerHost = document.createElement('header');
  headerHost.className = 'mission-header-host';
  opts.root.appendChild(headerHost);

  // Create main container
  const main = document.createElement('main');
  main.className = 'mission-main';
  main.style.flex = '1';
  main.style.position = 'relative';
  main.style.overflow = 'hidden';
  opts.root.appendChild(main);

  // Create video element
  const videoEl = document.createElement('video');
  videoEl.className = 'mission-video';
  videoEl.autoplay = true;
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.style.width = '100%';
  videoEl.style.height = '100%';
  videoEl.style.objectFit = 'cover';
  main.appendChild(videoEl);

  // Create overlay divs
  const velBarsOverlay = document.createElement('div');
  velBarsOverlay.className = 'mission-velbars-overlay';
  main.appendChild(velBarsOverlay);

  const telemetryOverlay = document.createElement('div');
  telemetryOverlay.className = 'mission-telemetry-overlay';
  main.appendChild(telemetryOverlay);

  const minimapOverlay = document.createElement('div');
  minimapOverlay.className = 'mission-minimap-overlay';
  main.appendChild(minimapOverlay);

  const modeChip = document.createElement('div');
  modeChip.className = 'mission-mode-chip';
  modeChip.textContent = 'MANUAL · TELEOP';
  main.appendChild(modeChip);

  const reticle = document.createElement('div');
  reticle.className = 'mission-reticle';
  main.appendChild(reticle);

  // Create joystick zones
  const driveZone = document.createElement('div');
  driveZone.className = 'mission-joystick mission-joystick-drive';
  main.appendChild(driveZone);

  const strafeZone = document.createElement('div');
  strafeZone.className = 'mission-joystick mission-joystick-strafe';
  main.appendChild(strafeZone);

  // Mount HUD components in overlays
  const velBarsHost = document.createElement('div');
  velBarsOverlay.appendChild(velBarsHost);
  const velBarsAPI = mountVelBars(velBarsHost, { color: '#f0a92a', trackColor: 'rgba(255,255,255,0.08)' });

  // Telemetry readouts
  const latHost = document.createElement('div');
  const batHost = document.createElement('div');
  const sigHost = document.createElement('div');
  telemetryOverlay.appendChild(latHost);
  telemetryOverlay.appendChild(batHost);
  telemetryOverlay.appendChild(sigHost);
  const latAPI = mountReadout(latHost, { label: 'LAT' });
  const batAPI = mountReadout(batHost, { label: 'BAT' });
  const sigAPI = mountReadout(sigHost, { label: 'SIG' });

  // Mini-map and compass
  const minimapSize = layout === 'tablet' ? 200 : 110;
  const minimapHost = document.createElement('div');
  const compassHost = document.createElement('div');
  minimapOverlay.appendChild(minimapHost);
  minimapOverlay.appendChild(compassHost);
  const minimapAPI = mountMiniMap(minimapHost, { size: minimapSize, color: '#f0a92a' });
  const compassAPI = mountCompass(compassHost, { color: '#f0a92a' });

  // Initialize header
  const header = new MissionHeader(headerHost, {
    compact: layout !== 'tablet',
    robotName,
    onMenu: () => {},
    onEStop: () => eStop(),
  });

  // Initialize joysticks
  const joystickSize = layout === 'tablet' ? 280 : (layout === 'phone-landscape' ? 230 : 190);
  const joystickBaseSize = layout === 'tablet' ? 140 : (layout === 'phone-landscape' ? 120 : 110);
  const joystickKnobSize = layout === 'tablet' ? 56 : (layout === 'phone-landscape' ? 52 : 46);

  // Teleop client state
  let currentConnected = false;
  let currentLx = 0;
  let currentLy = 0;
  let currentAz = 0;

  const client = new TeleopClientCtor({
    onStatus: (connected, robotType, robotName, robotNamespace) => {
      currentConnected = connected;
      header.setRobotName(robotName || opts.robotName || 'bot-07');
      header.setConnectionState(connected ? 'live' : 'disconnected');
      if (connected) {
        videoEl.classList.remove('dim');
      }
    },
    onLatency: (ms) => {
      latAPI.update(`${ms} ms`);
    },
    onOdom: (x, y, heading) => {
      minimapAPI.update({ pos: { x, y }, heading });
      compassAPI.update({ heading });
    },
    onReconnecting: (attempt) => {
      header.setConnectionState('reconnecting', attempt);
      videoEl.classList.add('dim');
    },
    onClose: () => {
      header.setConnectionState('disconnected');
      videoEl.classList.add('dim');
    },
  });

  function sendTwist(lx: number, ly: number, az: number) {
    if (currentConnected) {
      client.sendTwist(lx, ly, az);
    }
  }

  function eStop() {
    currentLx = 0;
    currentLy = 0;
    currentAz = 0;
    sendTwist(0, 0, 0);
  }

  // DRIVE joystick: maps x,y to az,lx (with inversion)
  let driveJoystick: MissionJoystick | null = null;
  try {
    driveJoystick = new MissionJoystick(driveZone, {
      variant: 'zone',
      axes: 'xy',
      size: joystickSize,
      baseSize: joystickBaseSize,
      knobSize: joystickKnobSize,
      baseColor: 'rgba(240,169,42,0.10)',
      ringColor: '#f0a92acc',
      knobColor: '#f0a92a',
      label: 'DRIVE',
      onMove: (x, y) => {
        if (!currentConnected) return;
        currentLx = -y;
        currentAz = -x;
        sendTwist(-y, currentLy, -x);
      },
      onEnd: () => {
        if (!currentConnected) return;
        currentAz = 0;
        currentLx = 0;
        sendTwist(0, currentLy, 0);
      },
    });
  } catch (e) {
    console.error('Failed to create DRIVE joystick:', e);
  }

  // STRAFE joystick: maps x only to ly (X-axis locked)
  let strafeJoystick: MissionJoystick | null = null;
  try {
    strafeJoystick = new MissionJoystick(strafeZone, {
      variant: 'zone',
      axes: 'x',
      size: joystickSize,
      baseSize: joystickBaseSize,
      knobSize: joystickKnobSize,
      baseColor: 'rgba(78,201,214,0.10)',
      ringColor: '#4ec9d6cc',
      knobColor: '#4ec9d6',
      label: 'STRAFE',
      onMove: (x) => {
        if (!currentConnected) return;
        currentLy = x;
        sendTwist(currentLx, x, currentAz);
      },
      onEnd: () => {
        if (!currentConnected) return;
        currentLy = 0;
        sendTwist(currentLx, 0, currentAz);
      },
    });
  } catch (e) {
    console.error('Failed to create STRAFE joystick:', e);
  }

  // Connect client and handle video
  client.connect(opts.teleopUrl);

  let whepClient: InstanceType<typeof WhepClientCtor> | null = null;
  if (opts.whepUrl && WhepClientCtor) {
    try {
      whepClient = new WhepClientCtor(opts.whepUrl, {
        onStream: (stream) => {
          videoEl.srcObject = stream;
        },
        onError: (err) => console.error('WHEP error:', err),
        onClose: () => {},
        onStateChange: () => {},
      });
      whepClient.start();
    } catch (e) {
      console.error('Failed to create WHEP client:', e);
    }
  }

  // Space key handler
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault();
      eStop();
    }
  };
  document.addEventListener('keydown', onKeyDown);

  let destroyed = false;
  const handle: MissionAppHandle = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      document.removeEventListener('keydown', onKeyDown);
      client.disconnect();
      whepClient?.stop();
      while (opts.root.firstChild) {
        opts.root.removeChild(opts.root.firstChild);
      }
    },
  };

  // Test seams (always expose for testing convenience)
  handle._setConnectionState = (state: 'live' | 'reconnecting' | 'disconnected', n?: number) => {
    currentConnected = state === 'live';
    header.setConnectionState(state, n);
    if (state === 'live') {
      videoEl.classList.remove('dim');
    } else {
      videoEl.classList.add('dim');
    }
  };
  handle._fireOdom = (x, y, heading) => {
    minimapAPI.update({ pos: { x, y }, heading });
    compassAPI.update({ heading });
  };
  handle._fireLatency = (ms) => {
    latAPI.update(`${ms} ms`);
  };
  handle._eStop = eStop;
  handle._driveMove = (x, y) => {
    if (driveJoystick) {
      currentLx = -y;
      currentAz = -x;
      sendTwist(-y, currentLy, -x);
    }
  };
  handle._strafeMove = (x) => {
    if (strafeJoystick) {
      currentLy = x;
      sendTwist(currentLx, x, currentAz);
    }
  };

  return handle;
}
