export interface RumEventEntry {
  name: string;
  duration: number;
  processingStart: number;
  processingEnd: number;
  startTime: number;
  interactionId: number;
  target: string;
  route: string;
}

export interface RumLongTaskEntry {
  duration: number;
  blockingTime: number;
  startTime: number;
  route: string;
}

export interface AdHomeRumState {
  lcpMs: number;
  clsScore: number;
  maxInpMs: number;
  p98InpMs: number;
  tbtMs: number;
  longTaskCount: number;
  droppedFrameCount: number;
  inpEvents: RumEventEntry[];
  longTasks: RumLongTaskEntry[];
}

declare global {
  interface Window {
    __ADHOME_RUM__?: AdHomeRumState;
  }
}

function sendRumBeacon(payload: {
  metricName: 'INP' | 'LCP' | 'CLS' | 'LONG_TASK' | 'TBT';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  route: string;
  interactionTarget?: string;
}): void {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/v1/public/rum', blob);
    } else {
      fetch('/api/v1/public/rum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // Ignore telemetry network errors
  }
}

function describeNode(node: EventTarget | null | undefined): string {
  if (!node || !(node instanceof Element)) return 'document';
  const testId = node.getAttribute('data-testid');
  if (testId) return `[data-testid="${testId}"]`;
  const closestTestId = node.closest('[data-testid]')?.getAttribute('data-testid');
  if (closestTestId) return `[data-testid="${closestTestId}"]`;
  const tag = node.tagName.toLowerCase();
  const id = node.id ? `#${node.id}` : '';
  return `${tag}${id}`;
}

let initialized = false;

export function initRealUserMonitoring(): void {
  if (initialized || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return;
  }
  initialized = true;

  const state: AdHomeRumState = {
    lcpMs: 0,
    clsScore: 0,
    maxInpMs: 0,
    p98InpMs: 0,
    tbtMs: 0,
    longTaskCount: 0,
    droppedFrameCount: 0,
    inpEvents: [],
    longTasks: [],
  };

  window.__ADHOME_RUM__ = state;

  // 1. Observe LCP
  try {
    let lcpReported = false;
    const lcpObs = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        state.lcpMs = Math.round(last.startTime * 100) / 100;
        if (!lcpReported) {
          lcpReported = true;
          sendRumBeacon({
            metricName: 'LCP',
            value: state.lcpMs,
            rating:
              state.lcpMs <= 2500
                ? 'good'
                : state.lcpMs <= 4000
                ? 'needs-improvement'
                : 'poor',
            route: window.location.pathname,
          });
        }
      }
    });
    lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // Unsupported observer type
  }

  // 2. Observe CLS
  try {
    const clsObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { hadRecentInput?: boolean; value?: number }
      >) {
        if (!entry.hadRecentInput && typeof entry.value === 'number') {
          state.clsScore =
            Math.round((state.clsScore + entry.value) * 10000) / 10000;
        }
      }
    });
    clsObs.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // Unsupported observer type
  }

  // 3. Observe Event Timing (Real INP)
  try {
    const eventObs = new PerformanceObserver((list) => {
      for (const raw of list.getEntries()) {
        const entry = raw as PerformanceEntry & {
          interactionId?: number;
          processingStart?: number;
          processingEnd?: number;
          target?: EventTarget | null;
        };
        const isInteraction =
          (typeof entry.interactionId === 'number' && entry.interactionId > 0) ||
          ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup', 'input'].includes(
            entry.name
          );
        if (!isInteraction) continue;

        const duration = Math.round(entry.duration * 100) / 100;
        const targetSelector = describeNode(entry.target);
        const rec: RumEventEntry = {
          name: entry.name,
          duration,
          processingStart: Math.round((entry.processingStart || entry.startTime) * 100) / 100,
          processingEnd: Math.round((entry.processingEnd || entry.startTime) * 100) / 100,
          startTime: Math.round(entry.startTime * 100) / 100,
          interactionId: entry.interactionId || 0,
          target: targetSelector,
          route: window.location.pathname,
        };

        state.inpEvents.push(rec);
        if (duration > state.maxInpMs) {
          state.maxInpMs = duration;
        }

        const sorted = state.inpEvents
          .map((e) => e.duration)
          .sort((a, b) => a - b);
        const p98Idx = Math.min(
          sorted.length - 1,
          Math.max(0, Math.floor(sorted.length * 0.98))
        );
        state.p98InpMs = sorted[p98Idx] || duration;

        if (entry.name === 'click' || entry.name === 'pointerup' || entry.name === 'keydown') {
          sendRumBeacon({
            metricName: 'INP',
            value: duration,
            rating:
              duration <= 200
                ? 'good'
                : duration <= 500
                ? 'needs-improvement'
                : 'poor',
            route: window.location.pathname,
            interactionTarget: `${entry.name}:${targetSelector}`,
          });
        }
      }
    });
    eventObs.observe({
      type: 'event',
      durationThreshold: 0,
      buffered: true,
    } as PerformanceObserverInit);
  } catch {
    // Unsupported observer type
  }

  // 4. Observe Long Tasks (> 50ms) and compute Total Blocking Time (TBT)
  try {
    const ltObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const duration = Math.round(entry.duration * 100) / 100;
        const blocking = Math.max(0, Math.round((duration - 50) * 100) / 100);
        state.longTaskCount += 1;
        state.tbtMs = Math.round((state.tbtMs + blocking) * 100) / 100;
        state.longTasks.push({
          duration,
          blockingTime: blocking,
          startTime: Math.round(entry.startTime * 100) / 100,
          route: window.location.pathname,
        });
        sendRumBeacon({
          metricName: 'LONG_TASK',
          value: duration,
          rating: duration <= 100 ? 'needs-improvement' : 'poor',
          route: window.location.pathname,
        });
      }
    });
    ltObs.observe({ type: 'longtask', buffered: true });
  } catch {
    // Unsupported observer type
  }
}
