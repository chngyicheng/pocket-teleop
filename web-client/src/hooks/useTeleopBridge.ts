import { useState, useEffect, useRef } from 'react';
import { TeleopClient, type TeleopClientOptions } from '../teleop_client.js';
import type { ConnectionState } from '../components/shared.js';
import { decodeRle } from '../map_codec.js';
import { loadMaxSpeed, saveMaxSpeed, clampLinear, clampAngular } from '../settings.js';
import { estimateRemainingMinutes, pruneSamples, type BatterySample } from '../battery_estimate.js';
import { computeQuality, type NetworkStats } from '../network_quality.js';

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

export interface TeleopBridge {
  connected: boolean;
  connectionState: ConnectionState;
  retryCount: number;
  latencyMs: number | null;
  odom: { x: number; y: number; heading: number } | null;
  mapGrid: MapGrid | null;
  mapPose: MapPose | null;
  scan: ScanData | null;
  battery: BatteryData | null;
  batteryEstimateMinutes: number | null;
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
  const [batteryEstimateMinutes, setBatteryEstimateMinutes] = useState<number | null>(null);
  const [networkQuality, setNetworkQuality] = useState<number | null>(null);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);

  const initialMaxSpeed = loadMaxSpeed();
  const [maxLinear, setMaxLinearState] = useState(initialMaxSpeed.maxLinear);
  const [maxAngular, setMaxAngularState] = useState(initialMaxSpeed.maxAngular);

  const clientRef = useRef<TeleopClient | null>(null);
  const batterySamplesRef = useRef<BatterySample[]>([]);
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
        hasNetworkDataRef.current = true;
      },
      onOdom: (x, y, heading) => {
        setOdom({ x, y, heading });
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
      },
      onPose: (frame, x, y, heading) => {
        setMapPose({ frame, x, y, heading });
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
        if (b.percentage !== null) {
          // Record this sample for rate estimation
          const now = Date.now();
          batterySamplesRef.current.push({ t: now, pct: b.percentage });
          // Prune to 60s window
          batterySamplesRef.current = pruneSamples(batterySamplesRef.current, now, 60000);
          // Estimate remaining minutes
          const estimate = estimateRemainingMinutes(batterySamplesRef.current, b.charging);
          setBatteryEstimateMinutes(estimate.minutes);
        } else if (b.charging) {
          // No percentage available but charging
          setBatteryEstimateMinutes(null);
        }
      },
    });

    clientRef.current = client;
    client.connect(opts.url);
    // Apply persisted speed limits on connect
    client.setMaxSpeed(maxLinear, maxAngular);

    // Set up network quality stats polling interval
    const networkStatsInterval = setInterval(() => {
      if (hasNetworkDataRef.current && clientRef.current?.getNetworkStats) {
        const stats = clientRef.current.getNetworkStats();
        if (stats) {
          setNetworkStats(stats);
          setNetworkQuality(computeQuality(stats));
        }
      }
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

  return {
    connected,
    connectionState,
    retryCount,
    latencyMs,
    odom,
    mapGrid,
    mapPose,
    scan,
    battery,
    batteryEstimateMinutes,
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
  };
}
