import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Popover } from '@animate-ui/react/primitives/base-ui/popover';

export function FieldInfoHint({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node)) { pinned.current = false; setOpen(false); }
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { pinned.current = false; setOpen(false); }
    };
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('keydown', closeEscape, true);
    return () => { document.removeEventListener('pointerdown', closeOutside, true); document.removeEventListener('keydown', closeEscape, true); };
  }, []);

  return <Popover.Root open={open} onOpenChange={next => { if (next || !pinned.current) setOpen(next); }}>
    <Popover.Trigger
      ref={trigger}
      type="button"
      aria-label={`Thông tin ${label}`}
      aria-expanded={open}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinned.current) setOpen(false); }}
      onClick={() => { pinned.current = !pinned.current; setOpen(pinned.current); }}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-500 dark:hover:text-blue-300"
    ><Info size={15} /></Popover.Trigger>
    <Popover.Portal><Popover.Positioner side="top" align="center" sideOffset={5} className="z-[120]"><Popover.Popup className="w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 text-xs font-normal leading-5 text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{children}</Popover.Popup></Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
