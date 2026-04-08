import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import {
  SlashCommandList,
  type SlashCommandListRef,
} from "./SlashCommandList";

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: string;
  keywords: string[];
  command: (editor: Editor) => void;
}

// Registered from Editor.tsx so the /image command can trigger file dialog + import.
let _onImageRequest: (() => void) | null = null;
export function registerImageRequestHandler(fn: () => void) {
  _onImageRequest = fn;
}

const COMMANDS: SlashCommandItem[] = [
  {
    title: "Image",
    description: "Insert an image from your computer",
    icon: "🖼",
    keywords: ["image", "photo", "picture", "img", "upload"],
    command: (_editor) => {
      _onImageRequest?.();
    },
  },
  {
    title: "Heading 1",
    description: "Large section heading",
    icon: "H1",
    keywords: ["h1", "heading", "title", "large"],
    command: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: "H2",
    keywords: ["h2", "heading", "subtitle", "medium"],
    command: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: "H3",
    keywords: ["h3", "heading", "small"],
    command: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: "Bullet List",
    description: "Simple unordered list",
    icon: "•",
    keywords: ["bullet", "list", "ul", "unordered"],
    command: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    title: "Numbered List",
    description: "Ordered list with numbers",
    icon: "1.",
    keywords: ["numbered", "ordered", "list", "ol"],
    command: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    title: "Todo List",
    description: "Task list with checkboxes",
    icon: "☐",
    keywords: ["todo", "task", "check", "checkbox"],
    command: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    title: "Blockquote",
    description: "Indented quote block",
    icon: "❝",
    keywords: ["quote", "blockquote", "citation"],
    command: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    title: "Code Block",
    description: "Fenced code with syntax highlighting",
    icon: "</>",
    keywords: ["code", "pre", "block", "snippet"],
    command: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: "Table",
    description: "3×3 table",
    icon: "▦",
    keywords: ["table", "grid", "rows", "columns"],
    command: (e) =>
      e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: "Callout",
    description: "Highlighted info block",
    icon: "ℹ",
    keywords: ["callout", "info", "note", "warning", "tip", "alert"],
    command: (e) => e.chain().focus().setCallout("info").run(),
  },
  {
    title: "Divider",
    description: "Horizontal dividing line",
    icon: "—",
    keywords: ["divider", "hr", "horizontal", "rule", "line"],
    command: (e) => e.chain().focus().setHorizontalRule().run(),
  },
];

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,

        items: ({ query }: { query: string }) => {
          if (!query) return COMMANDS;
          const q = query.toLowerCase();
          return COMMANDS.filter(
            (item) =>
              item.title.toLowerCase().includes(q) ||
              item.keywords.some((k) => k.includes(q))
          );
        },

        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: { from: number; to: number };
          props: SlashCommandItem;
        }) => {
          // Delete the "/query" text, then run the chosen command.
          editor.chain().focus().deleteRange(range).run();
          props.command(editor);
        },

        render: () => {
          let renderer: ReactRenderer<SlashCommandListRef> | null = null;

          return {
            onStart(props: Parameters<typeof Suggestion>[0] & { clientRect?: () => DOMRect | null }) {
              renderer = new ReactRenderer(SlashCommandList, {
                props,
                editor: (props as any).editor,
              });

              document.body.appendChild(renderer.element);
              positionMenu(renderer.element, props.clientRect);
            },

            onUpdate(props: Parameters<typeof Suggestion>[0] & { clientRect?: () => DOMRect | null }) {
              renderer?.updateProps(props);
              positionMenu(renderer?.element, props.clientRect);
            },

            onKeyDown({ event }: { event: KeyboardEvent }) {
              if (event.key === "Escape") {
                cleanup(renderer);
                renderer = null;
                return true;
              }
              return renderer?.ref?.onKeyDown({ event }) ?? false;
            },

            onExit() {
              cleanup(renderer);
              renderer = null;
            },
          };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

function positionMenu(
  el: HTMLElement | undefined,
  clientRect: (() => DOMRect | null) | undefined
) {
  if (!el) return;
  const rect = clientRect?.();
  if (!rect) return;

  el.style.position = "fixed";
  el.style.zIndex = "9999";
  el.style.top = `${rect.bottom + 6}px`;
  el.style.left = `${rect.left}px`;
}

function cleanup(renderer: ReactRenderer | null) {
  renderer?.destroy();
  renderer?.element?.remove();
}
