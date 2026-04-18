/**
 * Tag — cursor-aware #hashtag decorator.
 *
 * Uses ProseMirror decorations so the underlying markdown stays as plain
 * `#tagname` — no custom serialiser needed.
 *
 * Key behaviour:
 *   • Decorates every #tagname ONLY when the cursor is NOT inside it.
 *     This prevents partial-tag noise (#t, #ta, #tas…) while typing.
 *   • Skips code blocks and inline code marks.
 *   • Requires # to be at start of text or after a non-word character so
 *     `color:#red` is not treated as a tag.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// # followed by a letter then optional word chars / hyphens / slashes.
// Preceded by start-of-string or a non-word character.
const TAG_RE = /(^|[^\w&#])#([a-zA-Z][\w\-_/]*)/g;

export const tagPluginKey = new PluginKey<DecorationSet>("hashtag");

export const Tag = Extension.create({
  name: "hashtag",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tagPluginKey,

        props: {
          decorations(state) {
            const { doc, selection } = state;
            const cursorFrom = selection.from;
            const cursorTo   = selection.to;
            const decorations: Decoration[] = [];

            doc.descendants((node, pos) => {
              // Don't enter code blocks.
              if (node.type.name === "codeBlock") return false;

              if (!node.isText || !node.text) return true;

              // Skip inline code marks.
              if (node.marks.some((m) => m.type.name === "code")) return true;

              const text = node.text;
              TAG_RE.lastIndex = 0;

              while (true) {
                const match = TAG_RE.exec(text);
                if (!match) break;

                // match[1] = prefix char (may be ""), match[2] = tag word (no #)
                const hashStart = pos + match.index + match[1].length;
                const hashEnd   = hashStart + 1 + match[2].length; // +1 for "#"

                // Skip while cursor is anywhere inside this tag — user is still typing.
                if (cursorFrom <= hashEnd && cursorTo >= hashStart) continue;

                decorations.push(
                  Decoration.inline(hashStart, hashEnd, {
                    class: "editor-tag",
                    "data-tag": match[2].toLowerCase(),
                  })
                );
              }

              return true;
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
