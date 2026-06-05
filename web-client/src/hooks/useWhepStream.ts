import { useState, useEffect } from 'react';
import type { WhepState, WhepCallbacks, VideoStats } from '../whep_client.js';

export interface WhepStream {
  stream: MediaStream | null;
  state: WhepState;
  error: string | null;
  /** Live decoded-video stats (fps/resolution); null until the first sample. */
  stats: VideoStats | null;
}

// Factory function form lets tests inject fakes via closures without needing
// a real class constructor (arrow functions have no [[Construct]] slot).
export type WhepClientFactory = (url: string, callbacks: WhepCallbacks) => WhepClient;

export interface UseWhepStreamOpts {
  url: string;
  WhepClientCtor?: WhepClientFactory;
}

export function useWhepStream(opts: UseWhepStreamOpts): WhepStream {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<WhepState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<VideoStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    let client: { start(): void; stop(): void } | null = null;

    // Use requestIdleCallback if available, else setTimeout
    const schedule = (typeof requestIdleCallback === 'function') ? requestIdleCallback : (fn: () => void) => setTimeout(fn, 0);
    const cancel = (typeof cancelIdleCallback === 'function') ? cancelIdleCallback : clearTimeout;

    const handle = schedule(async () => {
      if (cancelled) return;

      const callbacks: WhepCallbacks = {
        onStream: (mediaStream) => {
          setStream(mediaStream);
          setState('live');
        },
        onStateChange: (newState) => {
          setState(newState);
        },
        onError: (msg) => {
          setError(msg);
        },
        onClose: () => {
          setStream(null);
          setStats(null);
        },
        onStats: (s) => {
          setStats(s);
        },
      };

      if (opts.WhepClientCtor) {
        // Injected factory path: synchronous (no dynamic import)
        client = opts.WhepClientCtor(opts.url, callbacks);
      } else {
        // Production path: dynamic import for code-split
        const { WhepClient } = await import('../whep_client.js');
        if (cancelled) return;
        client = new WhepClient(opts.url, callbacks);
      }

      if (!cancelled && client) {
        client.start();
      }
    });

    return () => {
      cancelled = true;
      cancel(handle as any);
      if (client) client.stop();
    };
  }, [opts.url, opts.WhepClientCtor]);

  return {
    stream,
    state,
    error,
    stats,
  };
}
