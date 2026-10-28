import { useState, useEffect } from 'react';

export type PresentationMode = 'desktop' | 'mobile';
export type PresentationOverride = 'auto' | 'desktop' | 'mobile';

export function usePresentationMode(): {
  mode: PresentationMode;
  override: PresentationOverride;
  setOverride: (o: PresentationOverride) => void;
} {
  const [override, setOverrideState] = useState<PresentationOverride>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const modeParam = urlParams.get('mode');
      if (modeParam === 'mobile' || modeParam === 'desktop') return modeParam;
      const stored = localStorage.getItem('adhome_presentation_override');
      if (stored === 'mobile' || stored === 'desktop' || stored === 'auto') return stored;
    }
    return 'auto';
  });

  const [mode, setMode] = useState<PresentationMode>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const modeParam = urlParams.get('mode');
      if (modeParam === 'mobile' || modeParam === 'desktop') return modeParam;
      const stored = localStorage.getItem('adhome_presentation_override');
      if (stored === 'mobile' || stored === 'desktop') return stored;
      return window.innerWidth >= 1024 ? 'desktop' : 'mobile';
    }
    return 'desktop';
  });

  useEffect(() => {
    const updateMode = () => {
      if (override === 'mobile' || override === 'desktop') {
        setMode(override);
      } else {
        setMode(window.innerWidth >= 1024 ? 'desktop' : 'mobile');
      }
    };

    updateMode();
    window.addEventListener('resize', updateMode);
    return () => window.removeEventListener('resize', updateMode);
  }, [override]);

  const setOverride = (o: PresentationOverride) => {
    setOverrideState(o);
    localStorage.setItem('adhome_presentation_override', o);
    if (o === 'auto') {
      setMode(window.innerWidth >= 1024 ? 'desktop' : 'mobile');
    } else {
      setMode(o);
    }
  };

  return { mode, override, setOverride };
}
