import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWhepStream, type UseWhepStreamOpts } from '../src/hooks/useWhepStream.js';
import type { WhepCallbacks, WhepState } from '../src/whep_client.js';

// Fake WhepClient for testing
class FakeWhepClient {
  callbacks: WhepCallbacks;
  resume = vi.fn();

  constructor(_url: string, callbacks: WhepCallbacks) {
    this.callbacks = callbacks;
  }

  start() {}
  stop() {}

  // Test helpers
  triggerStream(stream: MediaStream) {
    this.callbacks.onStream(stream);
  }

  triggerStateChange(state: WhepState) {
    this.callbacks.onStateChange?.(state);
  }

  triggerError(msg: string) {
    this.callbacks.onError(msg);
  }

  triggerClose() {
    this.callbacks.onClose();
  }

  triggerStats(stats: { fps: number | null; width: number | null; height: number | null }) {
    this.callbacks.onStats?.(stats);
  }
}

describe('useWhepStream', () => {
  let fakeClient: FakeWhepClient;
  let fakeStream: MediaStream;

  beforeEach(() => {
    vi.useFakeTimers();
    // Create a minimal fake MediaStream
    fakeStream = new MediaStream();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with connecting state and null stream', () => {
    const { result } = renderHook(() =>
      useWhepStream({
        url: 'http://localhost/whep',
        WhepClientCtor: (url, callbacks) => {
          fakeClient = new FakeWhepClient(url, callbacks);
          return fakeClient;
        },
      })
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.stream).toBeNull();
    expect(result.current.state).toBe('connecting');
    expect(result.current.error).toBeNull();
  });

  it('onStream sets stream and state to live', () => {
    const { result } = renderHook(() =>
      useWhepStream({
        url: 'http://localhost/whep',
        WhepClientCtor: (url, callbacks) => {
          fakeClient = new FakeWhepClient(url, callbacks);
          return fakeClient;
        },
      })
    );

    act(() => {
      vi.runAllTimers();
    });

    act(() => {
      fakeClient.triggerStream(fakeStream);
    });

    expect(result.current.stream).toBe(fakeStream);
    expect(result.current.state).toBe('live');
  });

  it('onStateChange updates state', () => {
    const { result } = renderHook(() =>
      useWhepStream({
        url: 'http://localhost/whep',
        WhepClientCtor: (url, callbacks) => {
          fakeClient = new FakeWhepClient(url, callbacks);
          return fakeClient;
        },
      })
    );

    act(() => {
      vi.runAllTimers();
    });

    act(() => {
      fakeClient.triggerStateChange('retrying');
    });

    expect(result.current.state).toBe('retrying');

    act(() => {
      fakeClient.triggerStateChange('error');
    });

    expect(result.current.state).toBe('error');
  });

  it('onError sets error message', () => {
    const { result } = renderHook(() =>
      useWhepStream({
        url: 'http://localhost/whep',
        WhepClientCtor: (url, callbacks) => {
          fakeClient = new FakeWhepClient(url, callbacks);
          return fakeClient;
        },
      })
    );

    act(() => {
      vi.runAllTimers();
    });

    act(() => {
      fakeClient.triggerError('connection failed');
    });

    expect(result.current.error).toBe('connection failed');
  });

  it('onClose clears the stream', () => {
    const { result } = renderHook(() =>
      useWhepStream({
        url: 'http://localhost/whep',
        WhepClientCtor: (url, callbacks) => {
          fakeClient = new FakeWhepClient(url, callbacks);
          return fakeClient;
        },
      })
    );

    act(() => {
      vi.runAllTimers();
    });

    act(() => {
      fakeClient.triggerStream(fakeStream);
    });

    expect(result.current.stream).toBe(fakeStream);

    act(() => {
      fakeClient.triggerClose();
    });

    expect(result.current.stream).toBeNull();
  });

  it('initializes with null stats and exposes onStats updates', () => {
    const { result } = renderHook(() =>
      useWhepStream({
        url: 'http://localhost/whep',
        WhepClientCtor: (url, callbacks) => {
          fakeClient = new FakeWhepClient(url, callbacks);
          return fakeClient;
        },
      })
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.stats).toBeNull();

    act(() => {
      fakeClient.triggerStats({ fps: 15, width: 1920, height: 1080 });
    });

    expect(result.current.stats).toEqual({ fps: 15, width: 1920, height: 1080 });
  });

  it('clears stats on close', () => {
    const { result } = renderHook(() =>
      useWhepStream({
        url: 'http://localhost/whep',
        WhepClientCtor: (url, callbacks) => {
          fakeClient = new FakeWhepClient(url, callbacks);
          return fakeClient;
        },
      })
    );

    act(() => {
      vi.runAllTimers();
    });

    act(() => {
      fakeClient.triggerStats({ fps: 15, width: 1920, height: 1080 });
    });
    expect(result.current.stats).not.toBeNull();

    act(() => {
      fakeClient.triggerClose();
    });
    expect(result.current.stats).toBeNull();
  });

  it('stops client on unmount', () => {
    const stopSpy = { called: false };
    const FakeClientWithSpy = class extends FakeWhepClient {
      stop() {
        stopSpy.called = true;
      }
    };

    const { unmount } = renderHook(() =>
      useWhepStream({
        url: 'http://localhost/whep',
        WhepClientCtor: (url, callbacks) => {
          return new FakeClientWithSpy(url, callbacks);
        },
      })
    );

    act(() => {
      vi.runAllTimers();
    });

    unmount();

    expect(stopSpy.called).toBe(true);
  });

  it('does not start synchronously — defers to scheduled callback', () => {
    const startSpy = { called: false };
    const FakeClientWithSpy = class extends FakeWhepClient {
      start() {
        startSpy.called = true;
      }
    };

    const { result } = renderHook(() =>
      useWhepStream({
        url: 'http://localhost/whep',
        WhepClientCtor: (url, callbacks) => {
          return new FakeClientWithSpy(url, callbacks);
        },
      })
    );

    // Before runAllTimers, start should not have been called
    expect(startSpy.called).toBe(false);

    act(() => {
      vi.runAllTimers();
    });

    // After runAllTimers, start should have been called
    expect(startSpy.called).toBe(true);
  });

  it('injected factory path stays synchronous (no dynamic import)', () => {
    const startSpy = { called: false };
    const FakeClientWithSpy = class extends FakeWhepClient {
      start() {
        startSpy.called = true;
      }
    };

    const { result } = renderHook(() =>
      useWhepStream({
        url: 'http://localhost/whep',
        WhepClientCtor: (url, callbacks) => {
          return new FakeClientWithSpy(url, callbacks);
        },
      })
    );

    act(() => {
      vi.runAllTimers();
    });

    // Injected factory is synchronous, so after runAllTimers (no microtask needed)
    // the client should be built and started
    expect(startSpy.called).toBe(true);
  });

  it('unmount before scheduled callback does not start client', () => {
    const startSpy = { called: false };
    const FakeClientWithSpy = class extends FakeWhepClient {
      start() {
        startSpy.called = true;
      }
    };

    const { unmount } = renderHook(() =>
      useWhepStream({
        url: 'http://localhost/whep',
        WhepClientCtor: (url, callbacks) => {
          return new FakeClientWithSpy(url, callbacks);
        },
      })
    );

    // Unmount before the scheduled callback fires
    unmount();

    act(() => {
      vi.runAllTimers();
    });

    // start should never be called because the component unmounted before the callback
    expect(startSpy.called).toBe(false);
  });

  it('calls client.resume() when tab becomes visible (visibilitychange)', () => {
    const { result } = renderHook(() =>
      useWhepStream({
        url: 'http://localhost/whep',
        WhepClientCtor: (url, callbacks) => {
          fakeClient = new FakeWhepClient(url, callbacks);
          return fakeClient;
        },
      })
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(fakeClient.resume).not.toHaveBeenCalled();

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(fakeClient.resume).toHaveBeenCalledOnce();
  });

  it('calls client.resume() when pageshow with persisted:true (bfcache restoration)', () => {
    const { result } = renderHook(() =>
      useWhepStream({
        url: 'http://localhost/whep',
        WhepClientCtor: (url, callbacks) => {
          fakeClient = new FakeWhepClient(url, callbacks);
          return fakeClient;
        },
      })
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(fakeClient.resume).not.toHaveBeenCalled();

    act(() => {
      const e = new Event('pageshow') as any;
      Object.defineProperty(e, 'persisted', {
        value: true,
        configurable: true,
      });
      window.dispatchEvent(e);
    });

    expect(fakeClient.resume).toHaveBeenCalledOnce();
  });
});
