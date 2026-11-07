import { useEffect, useRef, useState } from 'react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { ArrowLeft, Minus, Plus, Printer } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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

export default function ContractPdfViewer({ file, printMode = false, onExitPrintMode }: { file: Blob; printMode?: boolean; onExitPrintMode?: () => void }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(0);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(() => new Set());
  const scroll = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    let live = true;
    let loading: PDFDocumentLoadingTask | undefined;
    setPages([]); setRenderedPages(new Set()); setError(''); setZoom(1); zoomRef.current = 1;
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        const document = await loading.promise;
        const loaded = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
          const proxy = await document!.getPage(index + 1);
          const viewport = proxy.getViewport({ scale: 1 });
          return { number: index + 1, width: viewport.width, height: viewport.height, proxy };
        }));
        if (live) setPages(loaded);
      } catch {
        if (live) setError('Không hiển thị được bản PDF trong cửa sổ này. Hãy mở PDF ở tab mới hoặc tải về.');
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
  return <div className={`contract-pdf-viewer ${printMode ? 'contract-print-package' : ''}`}>
    <div className="contract-pdf-controls" role="group" aria-label="Phóng to PDF">
      <span>{printMode ? (printReady ? `Đã đóng gói đủ ${pages.length} trang` : `Đang đóng gói ${renderedPages.size}/${pages.length || '…'} trang`) : (pages.length ? `${pages.length} trang` : 'Đang mở PDF…')}</span>
      {printMode ? <>
        <Button type="button" className="contract-print-back" onClick={onExitPrintMode}><ArrowLeft size={15} />Quay lại</Button>
        <Button type="button" className="contract-print-all" disabled={!printReady} onClick={() => window.print()}><Printer size={15} />{printReady ? `In tất cả ${pages.length} trang` : 'Đang chuẩn bị…'}</Button>
      </> : <>
        <Button type="button" aria-label="Thu nhỏ PDF" disabled={zoom <= 1} onClick={() => changeZoom(zoom - 0.25)}><Minus size={16} /></Button>
        <Button type="button" aria-label="Vừa chiều rộng" onClick={() => changeZoom(1)}>{Math.round(zoom * 100)}%</Button>
        <Button type="button" aria-label="Phóng to PDF" disabled={zoom >= 3} onClick={() => changeZoom(zoom + 0.25)}><Plus size={16} /></Button>
      </>}
    </div>
    <div ref={scroll} className="contract-pdf-scroll" aria-label="Nội dung PDF, cuộn để xem tất cả trang; dùng hai ngón tay để phóng to">
      {error ? <p role="alert" className="contract-pdf-message">{error}</p> : pages.length ? <div className="contract-pdf-pages" style={{ width: fitWidth * zoom }}>
        {pages.map(page => <PdfPage key={page.number} page={page} onRendered={markRendered} />)}
      </div> : <p role="status" className="contract-pdf-message">Đang hiển thị các trang hợp đồng…</p>}
    </div>
  </div>;
}
