/**
 * Tag — inline Mark extension for #tagname syntax.
 *
 * Tags are stored as plain text in the .md file (just "#tagname").
 * This extension renders them as styled spans inside Tiptap without
 * changing the document structure — same approach as WikiLink.
 *
 * Clicking a tag navigates the sidebar to that tag's note list.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";

const tagKey = new PluginKey<DecorationSet>("tag");
// Match #tagname — must start with letter, can include hyphens, underscores, slashes.
const TAG_RE = /#([a-zA-Z][a-zA-Z0-9_\-/]*)/g;

export interface TagOptions {
  onTagClick?: (tagName: string) => void;
}

export const Tag = Extension.create<TagOptions>({
  name: "tag",

  addOptions() {
    return { onTagClick: undefined };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin({
        key: tagKey,

        state: {
          init(_, { doc }) {
            return buildDecorations(doc);
          },
          apply(tr, old) {
            return tr.docChanged ? buildDecorations(tr.doc) : old;
          },
        },

        props: {
          decorations(state) {
            return tagKey.getState(state);
          },

          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement;
            const span = target.closest(".note-tag") as HTMLElement | null;
            if (!span) return false;
            const tagName = span.dataset.tagName;
            if (tagName) options.onTagClick?.(tagName);
            return !!tagName;
          },
        },
      }),
    ];
  },
});

function buildDecorations(doc: Node): DecorationSet {
  const decos: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    TAG_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TAG_RE.exec(node.text)) !== null) {
      decos.push(
        Decoration.inline(
          pos + match.index,
          pos + match.index + match[0].length,
          {
            nodeName: "span",
            class: "note-tag",
            "data-tag-name": match[1].toLowerCase(),
          }
        )
      );
    }
  });

  return DecorationSet.create(doc, decos);
}
