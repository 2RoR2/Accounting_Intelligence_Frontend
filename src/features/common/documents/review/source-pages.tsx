"use client";
/**
 * The original document on the left of the review page (task B4b). PDF pages are drawn with pdf.js and images as they
 * are, so the evidence boxes of each field (`evidence[].bbox` over `page_size`) can sit on top of the page. Clicking a
 * box focuses its field. Structured (JSON) sources, and any file pdf.js cannot open, use the existing viewer.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import type { Extraction, SourceEvidence } from "@/types";
import { DocumentViewer } from "@/components/common/documents/document-viewer";
import { evidenceBox, evidenceCaption } from "./review-logic";

/** A field whose boxes may be drawn. The selected one is drawn strongly, the others faintly. */
export interface FieldEvidence { key: string; label: string; evidence: SourceEvidence[] }
interface PageShape { number: number; width: number; height: number; canvas?: HTMLCanvasElement }

const MAX_PAGES = 10;
const RENDER_SCALE = 2;
const ZOOMS = [1, 1.5, 2, 3];

const fileUrl = (documentId: string) => "/api/documents/" + encodeURIComponent(documentId) + "/file";
export const sourceFormat = (name: string, mimeType?: string | null) =>
  /\.pdf$/i.test(name) || mimeType === "application/pdf" ? "pdf"
    : /\.(png|jpe?g|gif|webp)$/i.test(name) || /^image\/(png|jpeg|gif|webp)$/.test(mimeType ?? "") ? "image" : "other";

/** Loads the PDF once per document and draws each page to a canvas. Any failure falls back to the browser's viewer. */
function usePdfPages(documentId: string, enabled: boolean) {
  const [pages, setPages] = useState<PageShape[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [pageCount, setPageCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const controller = new AbortController();
    // Held so leaving the document (unmount, or the next document) stops the worker and any page still drawing.
    let loadingTask: { destroy: () => Promise<void> } | undefined;
    let renderTask: { cancel: () => void } | undefined;
    setPages([]); setState("loading");
    (async () => {
      const response = await fetch(fileUrl(documentId), { credentials: "include", signal: controller.signal });
      if (!response.ok) throw new Error("file " + response.status);
      const data = new Uint8Array(await response.arrayBuffer());
      const pdfjs = await import("pdfjs-dist");
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const task = pdfjs.getDocument({ data });
      loadingTask = task;
      const pdf = await task.promise;
      if (cancelled) return;
      setPageCount(pdf.numPages);
      const drawn: PageShape[] = [];
      for (let number = 1; number <= Math.min(pdf.numPages, MAX_PAGES); number++) {
        const page = await pdf.getPage(number);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const render = page.render({ canvas, viewport });
        renderTask = render;
        await render.promise;
        renderTask = undefined;
        if (cancelled) return;
        drawn.push({ number, width: base.width, height: base.height, canvas });
        setPages([...drawn]);
      }
      setState("ready");
      loadingTask = undefined;
      void task.destroy();
    })().catch(() => { if (!cancelled) setState("failed"); });
    return () => {
      cancelled = true;
      controller.abort();
      renderTask?.cancel();
      void loadingTask?.destroy().catch(() => undefined);
    };
  }, [documentId, enabled]);
  return { pages, state, pageCount };
}

/** Puts an already drawn canvas into the page frame (canvases are drawn off-screen, then moved in). */
function CanvasSlot({ canvas, label }: { canvas: HTMLCanvasElement; label: string }) {
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = slot.current;
    if (!element) return;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", label);
    element.replaceChildren(canvas);
  }, [canvas, label]);
  return <div className="review-page-canvas" ref={slot} />;
}

export function ReviewSource({ documentId, name, mimeType, extraction, fields, selected, onSelectField }: {
  documentId: string; name: string; mimeType?: string | null; extraction: Extraction;
  /** Fields on screen; their boxes are drawn faintly and can be clicked. */
  fields: FieldEvidence[];
  /** What is selected: a field (key set) or a line item / suggestion (evidence only). */
  selected?: { key?: string; label: string; evidence: SourceEvidence[] };
  onSelectField: (key: string) => void;
}) {
  const format = sourceFormat(name, mimeType);
  const pdf = usePdfPages(documentId, format === "pdf");
  const [image, setImage] = useState<PageShape | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [zoom, setZoom] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const source = fileUrl(documentId);
  const pages = format === "pdf" ? pdf.pages : image ? [image] : [];
  const fallback = format === "other" || (format === "pdf" && pdf.state === "failed") || imageFailed;

  // Bring the selected field's first box into view inside the viewer only (the page itself does not scroll).
  useEffect(() => {
    const element = viewport.current;
    const box = element?.querySelector<HTMLElement>(".review-evidence-box.is-selected");
    if (!element || !box) return;
    const outer = element.getBoundingClientRect(), inner = box.getBoundingClientRect();
    element.scrollBy({ top: inner.top - outer.top - outer.height / 3, left: inner.left - outer.left - outer.width / 4, behavior: "smooth" });
  }, [selected, pages.length, zoom]);

  if (fallback) return <DocumentViewer name={name} extraction={extraction} selectedSource={selected} />;

  const selectedEvidence = selected?.evidence ?? [];
  const boxesFor = (page: PageShape) => {
    const items: Array<{ id: string; key?: string; label: string; selected: boolean; style: CSSProperties }> = [];
    const add = (key: string | undefined, label: string, evidence: SourceEvidence[], isSelected: boolean) => evidence.forEach((item, index) => {
      const box = evidenceBox(item, page.number, page, page.canvas ? "pdf" : "image");
      if (box) items.push({ id: `${key ?? "selected"}-${index}`, key, label, selected: isSelected,
        style: { left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` } });
    });
    fields.filter(field => field.key !== selected?.key).forEach(field => add(field.key, field.label, field.evidence, false));
    if (selected) add(selected.key, selected.label, selectedEvidence, true);
    return items;
  };
  const drawnSelected = pages.some(page => boxesFor(page).some(box => box.selected));
  const caption = evidenceCaption(selected, drawnSelected || !pages.length);
  const width = zoom ? `${ZOOMS[zoom] * 100}%` : "100%";

  return <div className="doc-viewer review-source">
    <div className="doc-viewer-toolbar"><strong>Original document: {name}</strong><a href={source} target="_blank" rel="noreferrer">Open original</a></div>
    <p className="review-source-caption" aria-live="polite">{caption}</p>
    <div className="image-viewer-stage">
      <div className="image-viewer-controls" role="group" aria-label="Zoom">
        <button type="button" className="viewer-icon-button" onClick={() => setZoom(value => Math.max(0, value - 1))} disabled={zoom === 0} aria-label="Zoom out" title="Zoom out"><ZoomOut size={18} aria-hidden="true" /></button>
        <output aria-live="polite">{zoom ? `${ZOOMS[zoom] * 100}%` : "Fit"}</output>
        <button type="button" className="viewer-icon-button" onClick={() => setZoom(value => Math.min(ZOOMS.length - 1, value + 1))} disabled={zoom === ZOOMS.length - 1} aria-label="Zoom in" title="Zoom in"><ZoomIn size={18} aria-hidden="true" /></button>
        <button type="button" className="viewer-icon-button" onClick={() => setZoom(0)} disabled={zoom === 0} aria-label="Fit to width" title="Fit to width"><Maximize2 size={18} aria-hidden="true" /></button>
      </div>
      <div className="image-viewer-viewport review-source-viewport" ref={viewport} tabIndex={0} role="region" aria-label="Original document; scroll to read">
        {format === "pdf" && pdf.state === "loading" && !pages.length && <p className="review-source-status" role="status">Opening the document…</p>}
        {format === "image" && !image && <>
          {/* Native image keeps the authenticated source at full resolution; it is measured, then drawn below. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="review-source-probe" src={source} alt="" onLoad={event => setImage({ number: 1, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setImageFailed(true)} />
          <p className="review-source-status" role="status">Opening the document…</p>
        </>}
        {pages.map(page => <div key={page.number} className="review-page" style={{ width, aspectRatio: `${page.width} / ${page.height}` }} data-page={page.number}>
          {page.canvas ? <CanvasSlot canvas={page.canvas} label={`Page ${page.number} of ${name}`} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={source} alt={`Original document: ${name}`} draggable={false} />}
          {boxesFor(page).map(box => <button key={box.id} type="button" tabIndex={-1} style={box.style}
            className={`review-evidence-box${box.selected ? " is-selected" : ""}`}
            aria-label={box.selected ? `${box.label}: read here` : `Show ${box.label}`} title={box.label}
            onClick={() => box.key && onSelectField(box.key)} />)}
        </div>)}
        {format === "pdf" && pdf.pageCount > MAX_PAGES && <p className="review-source-status">Showing the first {MAX_PAGES} of {pdf.pageCount} pages. <a href={source} target="_blank" rel="noreferrer">Open the original</a> for the rest.</p>}
      </div>
    </div>
  </div>;
}
