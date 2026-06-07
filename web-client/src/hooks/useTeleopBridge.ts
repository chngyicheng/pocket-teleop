import { useState, useEffect, useRef } from 'react';
import { TeleopClient, type TeleopClientOptions } from '../teleop_client.js';
import type { ConnectionState } from '../components/shared.js';
import { loadMaxSpeed, saveMaxSpeed, clampLinear, clampAngular } from '../settings.js';

export interface TeleopBridge {
  connected: boolean;
  connectionState: ConnectionState;
  retryCount: number;
  latencyMs: number | null;
  odom: { x: number; y: number; heading: number } | null;
  robotName: string;
  robotNamespace: string;
  robotType: string;
  sendTwist: (lx: number, ly: number, az: number) => void;
  eStop: () => void;
  estopEngaged: boolean;
  resetEstop: () => void;
  gamepadTwist: { lx: number; ly: number; az: number };
  inputSource: 'touch' | 'gamepad' | 'idle';
  maxLinear: number;
  maxAngular: number;
  setMaxLinear: (v: number) => void;
  setMaxAngular: (v: number) => void;
  gamepadConnected: boolean;
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
  const [robotName, setRobotName] = useState('');
  const [robotNamespace, setRobotNamespace] = useState('');
  const [robotType, setRobotType] = useState('');
  const [estopEngaged, setEstopEngaged] = useState(false);
  const [gamepadTwist, setGamepadTwist] = useState({ lx: 0, ly: 0, az: 0 });
  const [inputSource, setInputSource] = useState<'touch' | 'gamepad' | 'idle'>('idle');
  const [gamepadConnected, setGamepadConnected] = useState(false);

  const initialMaxSpeed = loadMaxSpeed();
  const [maxLinear, setMaxLinearState] = useState(initialMaxSpeed.maxLinear);
  const [maxAngular, setMaxAngularState] = useState(initialMaxSpeed.maxAngular);

  const clientRef = useRef<TeleopClient | null>(null);
  const lastGamepadActivityRef = useRef(0);
  const lastTouchActivityRef = useRef(0);

  const ACTIVITY_WINDOW_MS = 300;
  const IDLE_MS = 400;
  const IDLE_CHECK_INTERVAL_MS = 150;

  useEffect(() => {
    const factory = opts.TeleopClientCtor ?? ((o: TeleopClientOptions) => new TeleopClient(o));
    const client = factory({
      onStatus: (c, t, n, ns) => {
        setConnected(c);
        setConnectionState(c ? 'live' : 'disconnected');
        setRobotType(t);
        setRobotName(n);
        setRobotNamespace(ns);
      },
      onReconnecting: (attempt) => {
        setConnectionState('reconnecting');
        setRetryCount(attempt);
      },
      onLatency: (ms) => {
        setLatencyMs(ms);
      },
      onOdom: (x, y, heading) => {
        setOdom({ x, y, heading });
      },
      onEstopState: (engaged) => {
        setEstopEngaged(engaged);
      },
      onClose: () => {
        setConnectionState('disconnected');
        setConnected(false);
      },
      onError: () => {
        // Error handling integrated via connection state changes
      },
      onGamepadActivity: () => {
        lastGamepadActivityRef.current = Date.now();
        setInputSource('gamepad');
      },
      onGamepadConnected: (connected) => {
        setGamepadConnected(connected);
      },
      onTwist: (lx, ly, az) => {
        const now = Date.now();
        if (now - lastGamepadActivityRef.current < ACTIVITY_WINDOW_MS) {
          setGamepadTwist({ lx, ly, az });
        }
      },
    });

    clientRef.current = client;
    client.connect(opts.url);
    // Apply persisted speed limits on connect
    client.setMaxSpeed(maxLinear, maxAngular);

    // Set up idle reversion interval
    const idleCheckInterval = setInterval(() => {
      const now = Date.now();
      const gamepadDelta = now - lastGamepadActivityRef.current;
      const touchDelta = now - lastTouchActivityRef.current;

      let newSource: 'touch' | 'gamepad' | 'idle';
      if (gamepadDelta < IDLE_MS && gamepadDelta <= touchDelta) {
        newSource = 'gamepad';
      } else if (touchDelta < IDLE_MS) {
        newSource = 'touch';
      } else {
        newSource = 'idle';
      }

      setInputSource((prev) => (prev !== newSource ? newSource : prev));
    }, IDLE_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(idleCheckInterval);
      client.disconnect();
    };
    // maxLinear/maxAngular are intentionally NOT deps: live changes are pushed to
    // the client via setMaxLinear/setMaxAngular (clientRef.setMaxSpeed). Including
    // them here would tear down and reconnect the socket on every speed adjustment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.url, opts.TeleopClientCtor]);

  const sendTwist = (lx: number, ly: number, az: number) => {
    lastTouchActivityRef.current = Date.now();
    setInputSource('touch');
    if (clientRef.current) {
      clientRef.current.sendTwist(lx, ly, az);
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
    robotName,
    robotNamespace,
    robotType,
    sendTwist,
    eStop,
    estopEngaged,
    resetEstop,
    gamepadTwist,
    inputSource,
    maxLinear,
    maxAngular,
    setMaxLinear,
    setMaxAngular,
    gamepadConnected,
  };
}
