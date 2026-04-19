import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Link, Check, X } from "lucide-react";

interface Props {
  editor: Editor;
}

export function EditorToolbar({ editor }: Props) {
  const [linkMode, setLinkMode] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function openLinkInput() {
    const current = editor.getAttributes("link").href ?? "";
    setLinkValue(current);
    setLinkMode(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function applyLink() {
    const { from, to } = editor.state.selection;
    const url = linkValue.trim();
    editor.chain().focus().setTextSelection({ from, to }).run();
    if (url === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      const href = url.startsWith("http") ? url : `https://${url}`;
      editor.chain().focus().setLink({ href }).run();
    }
    setLinkMode(false);
    setLinkValue("");
  }

  function cancelLink() {
    setLinkMode(false);
    setLinkValue("");
    editor.chain().focus().run();
  }

  if (linkMode) {
    return (
      <div
        className="bubble-menu bubble-menu--link"
        onMouseDown={(e) => e.preventDefault()}
      >
        <input
          ref={inputRef}
          className="bubble-menu-link-input"
          placeholder="https://…"
          value={linkValue}
          onChange={(e) => setLinkValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); applyLink(); }
            if (e.key === "Escape") { e.preventDefault(); cancelLink(); }
          }}
          // Allow typing without losing selection in editor
          onMouseDown={(e) => e.stopPropagation()}
        />
        <button className="bubble-menu-btn" title="Apply" onMouseDown={(e) => { e.preventDefault(); applyLink(); }}>
          <Check size={13} />
        </button>
        <button className="bubble-menu-btn" title="Cancel" onMouseDown={(e) => { e.preventDefault(); cancelLink(); }}>
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="bubble-menu"
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <strong>B</strong>
      </ToolbarButton>

      <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <em>I</em>
      </ToolbarButton>

      <ToolbarButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <span style={{ textDecoration: "underline" }}>U</span>
      </ToolbarButton>

      <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <span style={{ textDecoration: "line-through" }}>S</span>
      </ToolbarButton>

      <div className="bubble-menu-divider" />

      <ToolbarButton label="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>
        ▨
      </ToolbarButton>

      <ToolbarButton label="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
        {"</>"}
      </ToolbarButton>

      <div className="bubble-menu-divider" />

      <ToolbarButton label="Link" active={editor.isActive("link")} onClick={openLinkInput}>
        <Link size={14} />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({ label, active, onClick, children }: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`bubble-menu-btn${active ? " bubble-menu-btn--active" : ""}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}
