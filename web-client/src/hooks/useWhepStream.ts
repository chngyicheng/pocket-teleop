import { useState, useEffect } from 'react';
import { WhepClient, type WhepState, type WhepCallbacks, type VideoStats } from '../whep_client.js';

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
    const factory = opts.WhepClientCtor ?? ((u: string, cb: WhepCallbacks) => new WhepClient(u, cb));
    const client = factory(opts.url, {
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
    });

    client.start();

    return () => {
      client.stop();
    };
  }, [opts.url, opts.WhepClientCtor]);

  return {
    stream,
    state,
    error,
    stats,
  };
}
