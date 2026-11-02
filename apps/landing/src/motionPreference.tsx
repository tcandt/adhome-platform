import { useSyncExternalStore, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';

const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const requested = new URLSearchParams(window.location.search).get('motion');

// Keep the branded intro consistent in local and production builds.
// Explicit reduced/system URL preferences remain available.
function getReducedMotion() {
  if (requested === 'full') return false;
  if (requested === 'reduced') return true;
  if (requested === 'system') return media.matches;
  return false;
}

function syncDocumentPreference() {
  document.documentElement.dataset.motion = getReducedMotion() ? 'reduced' : 'full';
}

function subscribe(onChange: () => void) {
  const update = () => { syncDocumentPreference(); onChange(); };
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}

syncDocumentPreference();

export function useAppReducedMotion() {
  return useSyncExternalStore(subscribe, getReducedMotion, () => true);
}

export function AppMotionProvider({ children }: { children: ReactNode }) {
  const reduced = useAppReducedMotion();
  return <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}</MotionConfig>;
}
