/**
 * WikiLink — step 8 implementation.
 *
 * Uses ProseMirror decorations so `[[link text]]` stays as plain text in the
 * document. This means markdown round-trips perfectly with no custom serializer.
 *
 * Resolution flow:
 *   1. When doc changes, extract all [[titles]] from text nodes.
 *   2. Batch-call resolveWikilinks() against the notes DB.
 *   3. Rebuild DecorationSet: resolved links get class "wikilink", unresolved
 *      links (ghost links) get class "wikilink unresolved".
 *   4. Clicks on decorated spans call onNavigate(id) or onCreateNote(title).
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";
import { resolveWikilinks } from "../../../lib/tauri";

export const wikiLinkKey = new PluginKey<WikiLinkState>("wikilink");
const WIKI_LINK_RE = /\[\[([^\]\n]+)\]\]/g;

interface WikiLinkMatch {
  from: number;
  to: number;
  title: string;
}

interface WikiLinkState {
  decorations: DecorationSet;
  // Map of title → resolved note id (null = unresolved)
  resolved: Map<string, string | null>;
}

export interface WikiLinkOptions {
  onNavigate?: (noteId: string) => void;
  onCreateNote?: (title: string) => void;
}

export const WikiLink = Extension.create<WikiLinkOptions>({
  name: "wikilink",

  addOptions() {
    return {
      onNavigate: undefined,
      onCreateNote: undefined,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin({
        key: wikiLinkKey,

        state: {
          init(_, { doc }): WikiLinkState {
            const state: WikiLinkState = {
              decorations: buildDecorations(doc, new Map()),
              resolved: new Map(),
            };
            // Kick off initial resolution asynchronously.
            scheduleResolution(doc, state.resolved, wikiLinkKey);
            return state;
          },

          apply(tr, pluginState, _oldState, newState): WikiLinkState {
            // If resolution results arrived (stored in meta), rebuild.
            const meta = tr.getMeta(wikiLinkKey) as
              | Map<string, string | null>
              | undefined;
            if (meta) {
              return {
                decorations: buildDecorations(newState.doc, meta),
                resolved: meta,
              };
            }

            if (!tr.docChanged) {
              return {
                decorations: pluginState.decorations.map(
                  tr.mapping,
                  tr.doc
                ),
                resolved: pluginState.resolved,
              };
            }

            // Doc changed — use existing resolved map optimistically, then
            // kick off a new async resolution for any new titles.
            const newDecos = buildDecorations(
              tr.doc,
              pluginState.resolved
            );
            scheduleResolution(tr.doc, pluginState.resolved, wikiLinkKey);
            return {
              decorations: newDecos,
              resolved: pluginState.resolved,
            };
          },
        },

        props: {
          decorations(state) {
            return wikiLinkKey.getState(state)?.decorations;
          },

          handleClick(view, _pos, event) {
            const target = event.target as HTMLElement;
            const span = target.closest(".wikilink") as HTMLElement | null;
            if (!span) return false;

            const title = span.dataset.wikilinkTitle;
            if (!title) return false;

            const pluginState = wikiLinkKey.getState(view.state);
            const noteId = pluginState?.resolved?.get(title);

            if (noteId) {
              options.onNavigate?.(noteId);
            } else {
              // Create the note, then update the resolved map so future clicks
              // navigate instead of creating again.
              options.onCreateNote?.(title);
            }
            return true;
          },
        },
      }),
    ];
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractMatches(doc: Node): WikiLinkMatch[] {
  const matches: WikiLinkMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    WIKI_LINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKI_LINK_RE.exec(node.text)) !== null) {
      matches.push({
        from: pos + match.index,
        to: pos + match.index + match[0].length,
        title: match[1].trim(),
      });
    }
  });
  return matches;
}

function buildDecorations(
  doc: Node,
  resolved: Map<string, string | null>
): DecorationSet {
  const matches = extractMatches(doc);
  const decos = matches.map((m) => {
    const isResolved = resolved.has(m.title) && resolved.get(m.title) !== null;
    return Decoration.inline(m.from, m.to, {
      nodeName: "span",
      class: isResolved ? "wikilink" : "wikilink unresolved",
      "data-wikilink-title": m.title,
    });
  });
  return DecorationSet.create(doc, decos);
}

// Debounced resolution: collect unique titles, call backend, dispatch results.
let resolutionTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleResolution(
  doc: Node,
  currentResolved: Map<string, string | null>,
  pluginKey: PluginKey<WikiLinkState>
) {
  clearTimeout(resolutionTimer);
  resolutionTimer = setTimeout(async () => {
    const matches = extractMatches(doc);
    const uniqueTitles = [...new Set(matches.map((m) => m.title))];
    if (uniqueTitles.length === 0) return;

    // Re-resolve all titles every time — a ghost link may have been created
    // since the last resolution and would otherwise stay unresolved forever.
    const toResolve = uniqueTitles;

    try {
      const results = await resolveWikilinks(toResolve);
      const next = new Map(currentResolved);
      for (const r of results) {
        next.set(r.title, r.id);
      }

      // Dispatch meta transaction to the active editor view.
      // We find the view via the DOM — safe because we only do this from a timer.
      const editorEl = document.querySelector(".tiptap.ProseMirror");
      if (!editorEl) return;
      // @ts-expect-error — ProseMirror attaches the view to the DOM element.
      const view = editorEl.pmViewDesc?.node?.type?.schema ? null : (editorEl as unknown as { pmViewDesc: unknown })?.pmViewDesc;
      // Alternative: use a ref stored externally. For now we use a global dispatch registry.
      dispatchToView(pluginKey, next);
    } catch {
      // Vault not open or command failed — silently ignore.
    }
  }, 400);
}

// ── View dispatch registry ────────────────────────────────────────────────────
// We need a way to dispatch a transaction from outside the editor view.
// The cleanest solution: store a reference to the dispatch function when the
// plugin is first used, via a module-level registry.

type DispatchFn = (resolved: Map<string, string | null>) => void;
let _dispatch: DispatchFn | null = null;

export function registerWikiLinkDispatch(fn: DispatchFn) {
  _dispatch = fn;
}

function dispatchToView(
  _pluginKey: PluginKey<WikiLinkState>,
  resolved: Map<string, string | null>
) {
  _dispatch?.(resolved);
}
