import { useState, useEffect, useRef } from 'react';
import { TeleopClient, type TeleopClientOptions } from '../teleop_client.js';
import type { ConnectionState } from '../components/shared.js';
import { decodeRle } from '../map_codec.js';
import { loadMaxSpeed, saveMaxSpeed, clampLinear, clampAngular, loadFences, saveFences } from '../settings.js';
import { computeQuality, type NetworkStats } from '../network_quality.js';
import { pointInPolygon, type FencePolygon } from '../geofence.js';

export interface MapGrid {
  cells: Uint8Array;
  width: number;
  height: number;
  resolution: number;
  originX: number;
  originY: number;
}

export interface MapPose {
  frame: 'map' | 'odom';
  x: number;
  y: number;
  heading: number;
}

export type NavNotice = {
  text: string;
  tone: 'ok' | 'warn' | 'error';
};

export interface ScanData {
  angleMin: number;
  angleIncrement: number;
  rangeMax: number;
  ranges: number[];
  pose?: { frame: 'map' | 'odom'; x: number; y: number; heading: number };
}

export interface BatteryData {
  percentage: number | null;
  voltage: number | null;
  current: number | null;
  charging: boolean;
}

export interface TelemetryAges {
  odom: number | null;
  pose: number | null;
  scan: number | null;
  map: number | null;
  battery: number | null;
}

export interface TeleopBridge {
  connected: boolean;
  connectionState: ConnectionState;
  retryCount: number;
  latencyMs: number | null;
  latencyHistory: number[];
  odom: { x: number; y: number; heading: number } | null;
  mapGrid: MapGrid | null;
  mapPose: MapPose | null;
  scan: ScanData | null;
  battery: BatteryData | null;
  networkQuality: number | null;
  networkStats: NetworkStats | null;
  robotName: string;
  robotNamespace: string;
  robotType: string;
  robotLength: number;
  robotWidth: number;
  sendTwist: (lx: number, ly: number, az: number) => void;
  eStop: () => void;
  estopEngaged: boolean;
  resetEstop: () => void;
  gamepadTwist: { lx: number; ly: number; az: number };
  /** Actual slew-limited command published to the robot (normalized, any source). */
  publishedTwist: { lx: number; ly: number; az: number };
  inputSource: 'gamepad' | 'keyboard' | 'touch' | 'idle';
  maxLinear: number;
  maxAngular: number;
  setMaxLinear: (v: number) => void;
  setMaxAngular: (v: number) => void;
  gamepadConnected: boolean;
  disconnectAction: string;
  navState: 'idle' | 'active' | 'paused';
  navPath: [number, number][];
  navNotice: NavNotice | null;
  sendNavGoal: (wx: number, wy: number, heading: number) => void;
  sendNavPause: () => void;
  sendNavResume: () => void;
  sendNavCancel: () => void;
  /** Age of each telemetry type in milliseconds since last update, or null if never received. */
  telemetryAges: TelemetryAges;
  /** Active geofences (map coordinates, empty if none). */
  fences: FencePolygon[];
  /** Save and apply geofences: persists to localStorage and applies to client. */
  saveFencesAndApply: (fences: FencePolygon[]) => void;
}

// Factory function form lets tests inject fakes via closures without needing
// a real class constructor (arrow functions have no [[Construct]] slot).
export type TeleopClientFactory = (opts: TeleopClientOptions) => TeleopClient;

export interface UseTeleopBridgeOpts {
  url: string;
  TeleopClientCtor?: TeleopClientFactory;
}

export function useTeleopBridge(opts: UseTeleopBridgeOpts): TeleopBridge {
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [retryCount, setRetryCount] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [odom, setOdom] = useState<{ x: number; y: number; heading: number } | null>(null);
  const [mapGrid, setMapGrid] = useState<MapGrid | null>(null);
  const [mapPose, setMapPose] = useState<MapPose | null>(null);
  const [scan, setScan] = useState<ScanData | null>(null);
  const [robotName, setRobotName] = useState('');
  const [robotNamespace, setRobotNamespace] = useState('');
  const [robotType, setRobotType] = useState('');
  const [robotLength, setRobotLength] = useState(0);
  const [robotWidth, setRobotWidth] = useState(0);
  const [estopEngaged, setEstopEngaged] = useState(false);
  const [gamepadTwist, setGamepadTwist] = useState({ lx: 0, ly: 0, az: 0 });
  const [publishedTwist, setPublishedTwist] = useState({ lx: 0, ly: 0, az: 0 });
  const [inputSource, setInputSource] = useState<'gamepad' | 'keyboard' | 'touch' | 'idle'>('idle');
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [disconnectAction, setDisconnectAction] = useState('stop');
  const [battery, setBattery] = useState<BatteryData | null>(null);
  const [networkQuality, setNetworkQuality] = useState<number | null>(null);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [navState, setNavState] = useState<'idle' | 'active' | 'paused'>('idle');
  const [navPath, setNavPath] = useState<[number, number][]>([]);
  const [navNotice, setNavNotice] = useState<NavNotice | null>(null);
  const [fences, setFencesState] = useState<FencePolygon[]>(loadFences());
  const [telemetryAges, setTelemetryAges] = useState<TelemetryAges>({
    odom: null,
    pose: null,
    scan: null,
    map: null,
    battery: null,
  });

  const navNoticeTimerRef = useRef<number | null>(null);
  const lastMsgAtRef = useRef<TelemetryAges>({
    odom: null,
    pose: null,
    scan: null,
    map: null,
    battery: null,
  });

  const initialMaxSpeed = loadMaxSpeed();
  const [maxLinear, setMaxLinearState] = useState(initialMaxSpeed.maxLinear);
  const [maxAngular, setMaxAngularState] = useState(initialMaxSpeed.maxAngular);

  const clientRef = useRef<TeleopClient | null>(null);
  const hasNetworkDataRef = useRef(false);

  useEffect(() => {
    const factory = opts.TeleopClientCtor ?? ((o: TeleopClientOptions) => new TeleopClient(o));
    const client = factory({
      onStatus: (c, t, n, ns, rl, rw, da) => {
        setConnected(c);
        setConnectionState(c ? 'live' : 'disconnected');
        setRobotType(t);
        setRobotName(n);
        setRobotNamespace(ns);
        setRobotLength(rl);
        setRobotWidth(rw);
        setDisconnectAction(da);
      },
      onReconnecting: (attempt) => {
        setConnectionState('reconnecting');
        setRetryCount(attempt);
      },
      onLatency: (ms) => {
        setLatencyMs(ms);
        setLatencyHistory((prev) => {
          const updated = [...prev, ms];
          // Keep only the last 60 values
          if (updated.length > 60) {
            return updated.slice(-60);
          }
          return updated;
        });
        hasNetworkDataRef.current = true;
      },
      onOdom: (x, y, heading) => {
        setOdom({ x, y, heading });
        lastMsgAtRef.current.odom = Date.now();
      },
      onMap: (map) => {
        const decoded = decodeRle(map.cells, map.width, map.height);
        if (decoded !== null) {
          setMapGrid({
            cells: decoded,
            width: map.width,
            height: map.height,
            resolution: map.resolution,
            originX: map.origin_x,
            originY: map.origin_y,
          });
        }
        // If decoding fails, keep previous mapGrid (don't set to null or partial state)
        lastMsgAtRef.current.map = Date.now();
      },
      onPose: (frame, x, y, heading) => {
        setMapPose({ frame, x, y, heading });
        lastMsgAtRef.current.pose = Date.now();
      },
      onScan: (scanRaw) => {
        const scanData: ScanData = {
          angleMin: scanRaw.angle_min,
          angleIncrement: scanRaw.angle_increment,
          rangeMax: scanRaw.range_max,
          ranges: scanRaw.ranges,
        };
        if (scanRaw.pose !== undefined) {
          scanData.pose = scanRaw.pose;
        }
        setScan(scanData);
        lastMsgAtRef.current.scan = Date.now();
      },
      onEstopState: (engaged) => {
        setEstopEngaged(engaged);
      },
      onClose: (code, reason) => {
        setConnectionState('disconnected');
        setConnected(false);
        // Session expired (4001): operator's session timed out — redirect to login
        if (code === 4001) {
          location.replace('/auth/login');
          return;
        }
      },
      onError: () => {
        // Error handling integrated via connection state changes
      },
      onGamepadConnected: (connected) => {
        setGamepadConnected(connected);
      },
      onInputSource: (source) => {
        setInputSource(source);
      },
      onTwist: (lx, ly, az, source) => {
        if (source === 'gamepad') {
          setGamepadTwist({ lx, ly, az });
        }
      },
      onPublish: (lx, ly, az) => {
        // Actual slew-limited command sent each publisher tick, for any source —
        // drives the VELOCITY bars + numeric readout so they show real cmd_vel.
        setPublishedTwist({ lx, ly, az });
      },
      onBattery: (b) => {
        setBattery(b);
        lastMsgAtRef.current.battery = Date.now();
      },
      onNavState: (state) => {
        // Handle nav state transitions
        if (state === 'succeeded') {
          setNavState('idle');
          setNavNotice({ text: 'Goal reached', tone: 'ok' });
        } else if (state === 'failed') {
          setNavState('idle');
          setNavNotice({ text: 'Navigation failed', tone: 'error' });
        } else {
          // For idle/active/paused, pass through without creating notice
          setNavState(state);
        }
      },
      onNavPath: setNavPath,
      onGeofenceLimit: () => {
        setNavNotice({ text: 'Geofence limit — motion stopped', tone: 'warn' });
      },
    });

    clientRef.current = client;
    client.connect(opts.url);
    // Apply persisted speed limits on connect
    client.setMaxSpeed(maxLinear, maxAngular);
    // Load and apply geofences on connect
    const loadedFences = loadFences();
    client.setFences(loadedFences);

    // Set up network quality stats polling interval (also updates telemetry ages)
    const networkStatsInterval = setInterval(() => {
      if (hasNetworkDataRef.current && clientRef.current?.getNetworkStats) {
        const stats = clientRef.current.getNetworkStats();
        if (stats) {
          setNetworkStats(stats);
          setNetworkQuality(computeQuality(stats));
        }
      }

      // Update telemetry ages from last message times
      const now = Date.now();
      setTelemetryAges({
        odom: lastMsgAtRef.current.odom !== null ? now - lastMsgAtRef.current.odom : null,
        pose: lastMsgAtRef.current.pose !== null ? now - lastMsgAtRef.current.pose : null,
        scan: lastMsgAtRef.current.scan !== null ? now - lastMsgAtRef.current.scan : null,
        map: lastMsgAtRef.current.map !== null ? now - lastMsgAtRef.current.map : null,
        battery: lastMsgAtRef.current.battery !== null ? now - lastMsgAtRef.current.battery : null,
      });
    }, 1000);

    return () => {
      clearInterval(networkStatsInterval);
      client.disconnect();
    };
    // maxLinear/maxAngular are intentionally NOT deps: live changes are pushed to
    // the client via setMaxLinear/setMaxAngular (clientRef.setMaxSpeed). Including
    // them here would tear down and reconnect the socket on every speed adjustment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.url, opts.TeleopClientCtor]);

  // Auto-dismiss navNotice after 4 seconds
  useEffect(() => {
    if (!navNotice) {
      // No notice, clear any existing timer
      if (navNoticeTimerRef.current) {
        clearTimeout(navNoticeTimerRef.current);
        navNoticeTimerRef.current = null;
      }
      return;
    }

    // Set timer to clear after 4 seconds
    navNoticeTimerRef.current = window.setTimeout(() => {
      setNavNotice(null);
      navNoticeTimerRef.current = null;
    }, 4000);

    // Cleanup on unmount or when notice changes
    return () => {
      if (navNoticeTimerRef.current) {
        clearTimeout(navNoticeTimerRef.current);
        navNoticeTimerRef.current = null;
      }
    };
  }, [navNotice]);

  // Geofence breach during autonomous nav: nav2 publishes its own cmd_vel and
  // never sees the client-side fences, so if the robot crosses into one
  // mid-run, cancel the goal and tell the operator. Once per breach episode.
  const breachCancelledRef = useRef(false);
  useEffect(() => {
    if (navState !== 'active' || !mapPose || mapPose.frame !== 'map' || fences.length === 0) {
      breachCancelledRef.current = false;
      return;
    }
    const inside = fences.some((f) => pointInPolygon([mapPose.x, mapPose.y], f));
    if (inside && !breachCancelledRef.current) {
      breachCancelledRef.current = true;
      clientRef.current?.sendNavCancel();
      setNavNotice({ text: 'Geofence breach — navigation cancelled', tone: 'error' });
    }
  }, [mapPose, navState, fences]);

  // Handle tab visibility change and bfcache restoration
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        clientRef.current?.resume();
      }
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        clientRef.current?.resume();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  const sendTwist = (lx: number, ly: number, az: number) => {
    if (clientRef.current) {
      clientRef.current.sendTwist(lx, ly, az, 'touch');
    }
  };

  const eStop = () => {
    if (clientRef.current) {
      clientRef.current.engageEstop();
    }
  };

  const resetEstop = () => {
    if (clientRef.current) {
      clientRef.current.resetEstop();
    }
  };

  const setMaxLinear = (v: number) => {
    const c = clampLinear(v);
    setMaxLinearState(c);
    if (clientRef.current) {
      clientRef.current.setMaxSpeed(c, maxAngular);
    }
    saveMaxSpeed({ maxLinear: c, maxAngular });
  };

  const setMaxAngular = (v: number) => {
    const c = clampAngular(v);
    setMaxAngularState(c);
    if (clientRef.current) {
      clientRef.current.setMaxSpeed(maxLinear, c);
    }
    saveMaxSpeed({ maxLinear, maxAngular: c });
  };

  const sendNavGoal = (wx: number, wy: number, heading: number) => {
    if (clientRef.current) {
      // Geofence guard: nav2 drives its own cmd_vel, so a goal inside a fence
      // would be executed unchecked — reject it at Send time instead.
      if (fences.some((f) => pointInPolygon([wx, wy], f))) {
        setNavNotice({ text: 'Goal inside geofence — pick another spot', tone: 'warn' });
        return;
      }
      const success = clientRef.current.sendNavGoal(wx, wy, heading);
      if (success === false) {
        // Determine if blocked due to E-STOP or disconnection
        if (estopEngaged) {
          setNavNotice({ text: 'E-STOP engaged — reset before navigating', tone: 'warn' });
        } else {
          setNavNotice({ text: 'Not connected', tone: 'warn' });
        }
      }
    }
  };

  const sendNavPause = () => {
    if (clientRef.current) {
      const success = clientRef.current.sendNavPause();
      if (success === false) {
        setNavNotice({ text: 'Not connected', tone: 'warn' });
      }
    }
  };

  const sendNavResume = () => {
    if (clientRef.current) {
      const success = clientRef.current.sendNavResume();
      if (success === false) {
        // Determine if blocked due to E-STOP or disconnection
        if (estopEngaged) {
          setNavNotice({ text: 'E-STOP engaged — reset before navigating', tone: 'warn' });
        } else {
          setNavNotice({ text: 'Not connected', tone: 'warn' });
        }
      }
    }
  };

  const sendNavCancel = () => {
    if (clientRef.current) {
      const success = clientRef.current.sendNavCancel();
      if (success === false) {
        setNavNotice({ text: 'Not connected', tone: 'warn' });
      }
    }
  };

  const saveFencesAndApply = (newFences: FencePolygon[]) => {
    saveFences(newFences);
    setFencesState(newFences);
    if (clientRef.current) {
      clientRef.current.setFences(newFences);
    }
  };

  return {
    connected,
    connectionState,
    retryCount,
    latencyMs,
    latencyHistory,
    odom,
    mapGrid,
    mapPose,
    scan,
    battery,
    networkQuality,
    networkStats,
    robotName,
    robotNamespace,
    robotType,
    robotLength,
    robotWidth,
    sendTwist,
    eStop,
    estopEngaged,
    resetEstop,
    gamepadTwist,
    publishedTwist,
    inputSource,
    maxLinear,
    maxAngular,
    setMaxLinear,
    setMaxAngular,
    gamepadConnected,
    disconnectAction,
    navState,
    navPath,
    navNotice,
    sendNavGoal,
    sendNavPause,
    sendNavResume,
    sendNavCancel,
    telemetryAges,
    fences,
    saveFencesAndApply,
  };
}
