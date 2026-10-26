"use client";
import type { Extraction, SourceEvidence } from "@/types";
export function SourceEvidenceList({ evidence, documentId }: { evidence: SourceEvidence[]; documentId: string }) {
  const source = "/api/documents/" + encodeURIComponent(documentId) + "/file";
  return <>{evidence.map((item, index) => <div key={index}>
    <a href={source + (item.page ? "#page=" + item.page : "")} target="_blank" rel="noreferrer">Source page {item.page ?? "not provided"}</a>
    <p>{item.text ?? "Source text not provided"}</p><small>{item.source_ref ?? "Reference not provided"}{item.bbox ? " | Box: " + [item.bbox.l, item.bbox.t, item.bbox.r, item.bbox.b].join(", ") + " " + (item.coordinate_units ?? "") : ""}</small>
    {item.text_span && <p>Text span [{item.text_span.join(", ")}) in source block. {item.bbox_scope === "source_block" ? "Box covers the source block, not a tight field boundary." : ""}</p>}
  </div>)}</>;
}
export function DocumentViewer({ name, extraction, highlightedField }: { name: string; extraction: Extraction; highlightedField?: string }) {
  const evidence = highlightedField ? extraction.fields[highlightedField]?.evidence ?? [] : [];
  const page = evidence[0]?.page;
  const source = "/api/documents/" + encodeURIComponent(extraction.documentId) + "/file";
  const url = source + (page ? "#page=" + page : "#view=FitH");
  return <div className="doc-viewer">
    <div className="doc-viewer-toolbar"><strong>Original document: {name}</strong><a className="text-link" href={url} target="_blank" rel="noreferrer">Open original source</a></div>
    <iframe title="Original document" src={url} style={{ width: "100%", height: 650, border: 0 }} />
    <div className="panel-body" style={{ background: "#fff", color: "#172033" }} aria-label="Source evidence">
      <strong>{highlightedField ? "Selected field evidence" : "Select a field to inspect its source evidence"}</strong>
      {highlightedField && !evidence.length && <p>Source evidence not available.</p>}
      <SourceEvidenceList evidence={evidence} documentId={extraction.documentId} />
    </div>
  </div>;
}
