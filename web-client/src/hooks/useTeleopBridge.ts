import { useState, useEffect, useRef } from 'react';
import { TeleopClient, type TeleopClientOptions } from '../teleop_client.js';
import type { ConnectionState } from '../components/shared.js';

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
      onTwist: (lx, ly, az) => {
        const now = Date.now();
        if (now - lastGamepadActivityRef.current < ACTIVITY_WINDOW_MS) {
          setGamepadTwist({ lx, ly, az });
        }
      },
    });

    clientRef.current = client;
    client.connect(opts.url);

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
  };
}
