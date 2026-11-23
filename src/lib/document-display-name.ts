export interface DocumentDisplayName {
  displayName?: string | null;
  display_name?: string | null;
}

export function documentDisplayName(document: DocumentDisplayName, fallback: string): string {
  return document.displayName?.trim() || document.display_name?.trim() || fallback;
}
