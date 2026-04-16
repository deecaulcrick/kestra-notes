/**
 * Typed wrappers for all Tauri invoke() calls.
 * Components never call invoke() directly — always go through this module.
 */

import { invoke, convertFileSrc } from "@tauri-apps/api/core";

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
  file_path: string;
  title: string;
  preview: string;
  has_todos: boolean;
  pinned: boolean;
  created_at: number;
  updated_at: number;
  tags: string[];
}

export interface NoteDetail {
  id: string;
  title: string;
  content: string;
  updated_at: number;
}

export interface Tag {
  id: string;
  name: string;
  parent_name: string | null;
  note_count: number;
}

export interface Attachment {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  note_id: string;
  created_at: number;
}

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

export interface SearchResult {
  id: string;
  title: string;
  file_path: string;
  snippet: string;
}

export interface WikiLinkResolution {
  title: string;
  id: string | null;
}

export interface Settings {
  theme: string;
  text_font: string;
  headings_font: string;
  code_font: string;
  font_size: number;
  line_height: number;
  line_width: number;
  paragraph_spacing: number;
  paragraph_indent: number;
}

// ── Vault ─────────────────────────────────────────────────────────────────────

export function openVault(path: string): Promise<Workspace> {
  return invoke("open_vault", { path });
}

export function getWorkspaces(): Promise<Workspace[]> {
  return invoke("get_workspaces");
}

// ── Notes ─────────────────────────────────────────────────────────────────────

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

export function pinNote(id: string, pinned: boolean): Promise<void> {
  return invoke("pin_note", { id, pinned });
}

export function deleteNote(id: string): Promise<void> {
  return invoke("delete_note", { id });
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export function getTags(): Promise<Tag[]> {
  return invoke("get_tags");
}

export function getNotesByTag(tagName: string): Promise<Note[]> {
  return invoke("get_notes_by_tag", { tagName });
}

// ── Graph ─────────────────────────────────────────────────────────────────────

export function getBacklinks(id: string): Promise<BacklinkNote[]> {
  return invoke("get_backlinks", { id });
}

export function getOutboundLinks(id: string): Promise<OutboundLink[]> {
  return invoke("get_outbound_links", { id });
}

// ── Search ────────────────────────────────────────────────────────────────────

export function search(query: string): Promise<SearchResult[]> {
  return invoke("search", { query });
}

// ── Attachments ───────────────────────────────────────────────────────────────

export function importAttachment(sourcePath: string, noteId: string): Promise<Attachment> {
  return invoke("import_attachment", { sourcePath, noteId });
}

export function importAttachmentData(data: number[], filename: string, noteId: string): Promise<Attachment> {
  return invoke("import_attachment_data", { data, filename, noteId });
}

// ── Wikilinks ─────────────────────────────────────────────────────────────────

export function resolveWikilinks(titles: string[]): Promise<WikiLinkResolution[]> {
  return invoke("resolve_wikilinks", { titles });
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function getSettings(): Promise<Settings> {
  return invoke("get_settings");
}

export function saveSettings(settings: Settings): Promise<void> {
  return invoke("save_settings", { settings });
}
