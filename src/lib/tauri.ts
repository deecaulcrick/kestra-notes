/**
 * Typed wrappers for all Tauri invoke() calls.
 * Components never call invoke() directly — always go through this module.
 */

import { invoke, convertFileSrc } from "@tauri-apps/api/core";

/**
 * Convert an absolute vault file path to a URL the Tauri webview can load.
 * Never use file:// directly — Tauri's CSP blocks it.
 */
export function assetUrl(absolutePath: string): string {
  return convertFileSrc(absolutePath);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  vault_path: string;
  last_opened: number;
}

export interface Note {
  id: string;
  file_path: string; // relative to vault root, e.g. "notes/my-note.md"
  title: string;
  created_at: number;
  updated_at: number;
}

export interface NoteDetail {
  id: string;
  title: string;
  content: string; // raw markdown
  updated_at: number;
}

// ── Vault commands ────────────────────────────────────────────────────────────

export function openVault(path: string): Promise<Workspace> {
  return invoke("open_vault", { path });
}

export function getWorkspaces(): Promise<Workspace[]> {
  return invoke("get_workspaces");
}

// ── Notes commands ────────────────────────────────────────────────────────────

export function getNote(id: string): Promise<NoteDetail> {
  return invoke("get_note", { id });
}

export function saveNote(id: string, content: string): Promise<void> {
  return invoke("save_note", { id, content });
}

export function createNote(title: string): Promise<Note> {
  return invoke("create_note", { title });
}

export function listNotes(): Promise<Note[]> {
  return invoke("list_notes");
}

// ── Attachment commands ───────────────────────────────────────────────────────

export interface Attachment {
  id: string;
  /** Relative to vault root, e.g. "attachments/images/abc123.png" */
  file_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  note_id: string;
  created_at: number;
}

/** Import from a native file-system path (file picker, drag-drop with path). */
export function importAttachment(
  sourcePath: string,
  noteId: string
): Promise<Attachment> {
  return invoke("import_attachment", { sourcePath, noteId });
}

/** Import from raw bytes (paste from clipboard). Max ~10 MB. */
export function importAttachmentData(
  data: number[],
  filename: string,
  noteId: string
): Promise<Attachment> {
  return invoke("import_attachment_data", { data, filename, noteId });
}

// ── Graph commands ────────────────────────────────────────────────────────────

export interface BacklinkNote {
  id: string;
  title: string;
  file_path: string;
}

export interface OutboundLink {
  link_text: string;
  resolved_id: string | null;
  resolved_title: string | null;
}

export function getBacklinks(id: string): Promise<BacklinkNote[]> {
  return invoke("get_backlinks", { id });
}

export function getOutboundLinks(id: string): Promise<OutboundLink[]> {
  return invoke("get_outbound_links", { id });
}

// ── Search commands ───────────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  title: string;
  file_path: string;
  /** Excerpt with <b> tags around matched terms. */
  snippet: string;
}

export function search(query: string): Promise<SearchResult[]> {
  return invoke("search", { query });
}

// ── Wikilink commands ─────────────────────────────────────────────────────────

export interface WikiLinkResolution {
  title: string;
  id: string | null;
}

export function resolveWikilinks(
  titles: string[]
): Promise<WikiLinkResolution[]> {
  return invoke("resolve_wikilinks", { titles });
}
