import { useEffect, useState } from 'react';

export type PresentationMode = 'desktop' | 'mobile';

export function usePresentationMode(): {
  mode: PresentationMode;
} {
  const [mode, setMode] = useState<PresentationMode>(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('adhome_presentation_override');
      const urlParams = new URLSearchParams(window.location.search);
      const modeParam = urlParams.get('mode');
      if (modeParam === 'mobile' || modeParam === 'desktop') return modeParam;
      return window.innerWidth >= 1024 ? 'desktop' : 'mobile';
    }
    return 'desktop';
  });

  useEffect(() => {
    const updateMode = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const modeParam = urlParams.get('mode');
      if (modeParam === 'mobile' || modeParam === 'desktop') {
        setMode(modeParam);
      } else {
        setMode(window.innerWidth >= 1024 ? 'desktop' : 'mobile');
      }
    };

    updateMode();
    window.addEventListener('resize', updateMode);
    return () => window.removeEventListener('resize', updateMode);
  }, []);

  return { mode };
}
