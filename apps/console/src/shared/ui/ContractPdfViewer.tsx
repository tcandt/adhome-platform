import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { Download, ExternalLink, Minus, Plus, RefreshCw } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { installPolyfills } from '../../polyfills';

installPolyfills();

const polyfillSnippet = `
if (typeof Uint8Array !== 'undefined') {
  if (!Uint8Array.prototype.toHex) {
    Uint8Array.prototype.toHex = function () {
      let out = '';
      for (let i = 0; i < this.length; i++) {
        out += this[i].toString(16).padStart(2, '0');
      }
      return out;
    };
  }
  if (!Uint8Array.fromHex) {
    Uint8Array.fromHex = function (hex) {
      const clean = hex.replace(/[^0-9a-fA-F]/g, '');
      const bytes = new Uint8Array(Math.floor(clean.length / 2));
      for (let i = 0; i < clean.length; i += 2) {
        bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
      }
      return bytes;
    };
  }
}
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}
if (typeof URL !== 'undefined' && !URL.parse) {
  URL.parse = function (url, base) {
    try { return new URL(url, base); } catch { return null; }
  };
}
if (typeof Math.sumPrecise === 'undefined') {
  Math.sumPrecise = function (items) {
    let sum = 0;
    for (const n of items) sum += Number(n) || 0;
    return sum;
  };
}
`;

let cachedWorkerUrl: string | null = null;
function getWorkerUrl(): string {
  if (cachedWorkerUrl) return cachedWorkerUrl;
  try {
    const fullTarget = new URL(workerUrl, window.location.href).href;
    const script = `${polyfillSnippet}\nimport ${JSON.stringify(fullTarget)};\n`;
    const blob = new Blob([script], { type: 'text/javascript' });
    cachedWorkerUrl = URL.createObjectURL(blob);
    return cachedWorkerUrl;
  } catch {
    return workerUrl;
  }
}

type Page = { number: number; width: number; height: number; proxy: PDFPageProxy };
const clamp = (value: number) => Math.min(3, Math.max(1, value));

function PdfPage({ page, onRendered }: { page: Page; onRendered?: (pageNumber: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const viewport = page.proxy.getViewport({ scale });
    element.width = Math.ceil(viewport.width);
    element.height = Math.ceil(viewport.height);
    const context = element.getContext('2d', { alpha: false });
    if (!context) return;
    const task = page.proxy.render({ canvas: element, canvasContext: context, viewport });
    void task.promise.then(() => onRendered?.(page.number)).catch(error => {
      if (error?.name !== 'RenderingCancelledException') console.error('Contract PDF page render failed', error);
    });
    return () => { task.cancel(); };
  }, [page]);
  return <div className="contract-pdf-page" style={{ aspectRatio: `${page.width} / ${page.height}` }} aria-label={`Trang ${page.number}`}><canvas ref={canvas} /></div>;
}

export type ContractPdfViewerHandle = { printAll: () => boolean };

const ContractPdfViewer = forwardRef<ContractPdfViewerHandle, { file: Blob; onPrintReady?: (ready: boolean) => void; extraControls?: React.ReactNode }>(function ContractPdfViewer({ file, onPrintReady, extraControls }, ref) {
  const [pages, setPages] = useState<Page[]>([]);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(0);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(() => new Set());
  const scroll = useRef<HTMLDivElement>(null);
  const printFrame = useRef<HTMLIFrameElement>(null);
  const zoomRef = useRef(1);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  const fallbackBlobUrl = useMemo(() => {
    try {
      return URL.createObjectURL(file);
    } catch {
      return '';
    }
  }, [file]);

  useEffect(() => () => {
    if (fallbackBlobUrl) URL.revokeObjectURL(fallbackBlobUrl);
  }, [fallbackBlobUrl]);

  useEffect(() => {
    let live = true;
    let loading: PDFDocumentLoadingTask | undefined;
    setPages([]); setRenderedPages(new Set()); setError(''); setZoom(1); zoomRef.current = 1;
    void (async () => {
      try {
        installPolyfills();
        const pdfjs = await import('pdfjs-dist');
        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);

        let document: any;
        try {
          pdfjs.GlobalWorkerOptions.workerSrc = getWorkerUrl();
          loading = pdfjs.getDocument({ data });
          document = await loading.promise;
        } catch (workerErr) {
          console.warn('ContractPdfViewer: Web Worker load failed, attempting fallback to main thread fake-worker:', workerErr);
          pdfjs.GlobalWorkerOptions.workerSrc = '';
          loading = pdfjs.getDocument({ data, disableWorker: true } as any);
          document = await loading.promise;
        }

        const loaded = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
          const proxy = await document!.getPage(index + 1);
          const viewport = proxy.getViewport({ scale: 1 });
          return { number: index + 1, width: viewport.width, height: viewport.height, proxy };
        }));
        if (live) setPages(loaded);
      } catch (err) {
        console.error('ContractPdfViewer failed to load document:', err);
        if (live) setError('Không hiển thị được bản PDF dạng trang trong cửa sổ này.');
      }
    })();
    return () => { live = false; void loading?.destroy(); };
  }, [file]);

  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const measure = () => setFitWidth(Math.max(1, element.clientWidth - 24));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const distance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const start = (event: TouchEvent) => {
      if (event.touches.length === 2) pinch.current = { distance: distance(event.touches), zoom: zoomRef.current };
    };
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinch.current) return;
      event.preventDefault();
      const next = clamp(pinch.current.zoom * distance(event.touches) / pinch.current.distance);
      zoomRef.current = next;
      setZoom(next);
    };
    const end = (event: TouchEvent) => { if (event.touches.length < 2) pinch.current = null; };
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end);
    element.addEventListener('touchcancel', end);
    return () => {
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', end);
    };
  }, []);

  const changeZoom = (next: number) => { zoomRef.current = clamp(next); setZoom(zoomRef.current); };
  const markRendered = (pageNumber: number) => setRenderedPages(current => current.has(pageNumber) ? current : new Set(current).add(pageNumber));
  const printReady = pages.length > 0 && renderedPages.size === pages.length;
  useEffect(() => { onPrintReady?.(printReady); }, [onPrintReady, printReady]);
  useEffect(() => () => onPrintReady?.(false), [onPrintReady]);
  useEffect(() => {
    const restoreTopDocument = () => {
      printFrame.current?.contentWindow?.blur();
      window.focus();
    };
    const handlePageShow = () => restoreTopDocument();
    const handleVisibility = () => { if (!document.hidden) restoreTopDocument(); };
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    printAll: () => {
      const target = printFrame.current?.contentWindow;
      const sourceCanvases = Array.from(scroll.current?.querySelectorAll<HTMLCanvasElement>('.contract-pdf-page canvas') || []);
      if (!target || !printReady || sourceCanvases.length !== pages.length) return false;
      const document = target.document;
      document.open();
      document.write('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}.page{width:210mm;height:297mm;overflow:hidden;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}canvas{display:block;width:210mm;height:297mm;object-fit:contain}</style></head><body></body></html>');
      document.close();
      sourceCanvases.forEach(source => {
        const page = document.createElement('div');
        page.className = 'page';
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        canvas.getContext('2d', { alpha: false })?.drawImage(source, 0, 0);
        page.appendChild(canvas);
        document.body.appendChild(page);
      });
      let restored = false;
      const restoreTopDocument = () => {
        if (restored) return;
        restored = true;
        target.removeEventListener('afterprint', restoreTopDocument);
        window.removeEventListener('focus', restoreTopDocument);
        target.blur();
        window.focus();
        const frameDocument = printFrame.current?.contentWindow?.document;
        if (frameDocument) {
          frameDocument.open();
          frameDocument.write('<!doctype html><html><body></body></html>');
          frameDocument.close();
        }
      };
      target.addEventListener('afterprint', restoreTopDocument, { once: true });
      window.addEventListener('focus', restoreTopDocument, { once: true });
      target.print();
      return true;
    },
  }), [pages.length, printReady]);

  return <div className="contract-pdf-viewer">
    <div className="contract-pdf-controls" role="group" aria-label="Phóng to PDF">
      <span>{pages.length ? `${pages.length} trang` : error ? 'Bản xem trực tiếp' : 'Đang mở PDF…'}</span>
      {extraControls}
      {!error && (
        <>
          <Button type="button" aria-label="Thu nhỏ PDF" disabled={zoom <= 1} onClick={() => changeZoom(zoom - 0.25)}><Minus size={16} /></Button>
          <Button type="button" aria-label="Vừa chiều rộng" onClick={() => changeZoom(1)}>{Math.round(zoom * 100)}%</Button>
          <Button type="button" aria-label="Phóng to PDF" disabled={zoom >= 3} onClick={() => changeZoom(zoom + 0.25)}><Plus size={16} /></Button>
        </>
      )}
      {error && fallbackBlobUrl && (
        <Button
          type="button"
          className="contract-inline-button flex items-center gap-1.5 text-xs text-blue-600"
          onClick={() => window.open(fallbackBlobUrl, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink size={14} /> Mở tab mới
        </Button>
      )}
    </div>
    <div ref={scroll} className="contract-pdf-scroll" aria-label="Nội dung PDF, cuộn để xem tất cả trang; dùng hai ngón tay để phóng to">
      {error ? (
        <div className="contract-pdf-fallback-container">
          <div className="contract-pdf-fallback-banner">
            <span>{error} Đang hiển thị bằng trình đọc nhúng.</span>
          </div>
          {fallbackBlobUrl && (
            <iframe
              src={fallbackBlobUrl}
              className="contract-pdf-fallback-iframe"
              title="Bản xem hợp đồng trực tiếp"
            />
          )}
        </div>
      ) : pages.length ? (
        <div className="contract-pdf-pages" style={{ width: fitWidth * zoom }}>
          {pages.map(page => <PdfPage key={page.number} page={page} onRendered={markRendered} />)}
        </div>
      ) : (
        <p role="status" className="contract-pdf-message">Đang hiển thị các trang hợp đồng…</p>
      )}
    </div>
    <iframe ref={printFrame} className="contract-print-frame" title="Tài liệu in đầy đủ" tabIndex={-1} aria-hidden="true" />
  </div>;
});

export default ContractPdfViewer;
