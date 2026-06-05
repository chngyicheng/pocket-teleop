import { useState, useEffect, useRef } from 'react';
import { TeleopClient, type TeleopClientOptions } from '../teleop_client.js';

export interface TeleopBridge {
  connected: boolean;
  connectionState: 'live' | 'reconnecting' | 'disconnected';
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
  const [connectionState, setConnectionState] = useState<'live' | 'reconnecting' | 'disconnected'>('disconnected');
  const [retryCount, setRetryCount] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [odom, setOdom] = useState<{ x: number; y: number; heading: number } | null>(null);
  const [robotName, setRobotName] = useState('');
  const [robotNamespace, setRobotNamespace] = useState('');
  const [robotType, setRobotType] = useState('');
  const [estopEngaged, setEstopEngaged] = useState(false);

  const clientRef = useRef<TeleopClient | null>(null);

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
    });

    clientRef.current = client;
    client.connect(opts.url);

    return () => {
      client.disconnect();
    };
  }, [opts.url, opts.TeleopClientCtor]);

  const sendTwist = (lx: number, ly: number, az: number) => {
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
  };
}
