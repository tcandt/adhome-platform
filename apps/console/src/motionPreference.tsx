import { useSyncExternalStore, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';

const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const requested = new URLSearchParams(window.location.search).get('motion');

// Local previews show the designed motion. Production follows the device unless
// the visitor explicitly selects full/reduced motion through the URL.
function getReducedMotion() {
  if (requested === 'full') return false;
  if (requested === 'reduced') return true;
  if (requested === 'system') return media.matches;
  return (import.meta as ImportMeta & { env: { DEV: boolean } }).env.DEV ? false : media.matches;
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
