# Kestra Notes

**A local-first writing tool for connected thought.**

Kestra Notes is a desktop markdown notes app built for writers, researchers, and thinkers who want the beauty of Bear with the file ownership of Obsidian — rebuilt from scratch with better performance and a cleaner architecture.

Your notes are plain `.md` files on your disk. No account. No cloud dependency. No lock-in. Open your vault in any text editor and everything is still there.

---

## What it is

Kestra Notes gives you a distraction-free writing environment with the intelligence of a knowledge graph underneath. Notes link to each other, tags organise your thinking, and backlinks surface connections you didn't know existed — all stored locally in a format that will outlast the app itself.

---

## Current features

### Writing experience
- **Rich markdown editor** powered by Tiptap/ProseMirror — writes to `.md` files, renders beautifully
- **Slash command menu** — type `/` to insert headings, lists, tasks, tables, code blocks, callouts, images, and more
- **Floating bubble menu** — select text to instantly apply bold, italic, underline, strikethrough, highlight, code, or links
- **Task lists** — `[ ]` checkboxes with nested support
- **Tables** — resizable, full keyboard navigation
- **Code blocks** — syntax highlighting via lowlight across all common languages
- **Callout blocks** — info, warning, and tip variants
- **Smart typography** — auto smart quotes, em dashes, ellipsis substitution

### Navigation and organisation
- **3-pane layout** — sidebar, note list, and editor, each independently collapsible
- **Sidebar sections** — Notes, To-dos (notes with `[ ]` tasks), Today, Pinned, Untagged
- **Tag system** — inline `#tags` in note body, with nested subtags (`#project/work`) shown in the sidebar tree
- **WikiLinks** — `[[note title]]` links between notes with click-to-navigate; unresolved links shown as ghost links
- **Backlinks panel** — collapsible panel below the editor showing all notes that link to the current one
- **Command palette** — `Cmd+K` full-text search across all notes

### Files and attachments
- **Image support** — drag and drop, paste from clipboard, or `/image` command to insert images inline
- **Local vault** — all notes and attachments live in a folder you choose; portable and editor-agnostic

### Customisation
- **6 themes** — Default (light), Dark, Nightshade, Matcha, Overcast, Midnight
- **Typography settings** — choose body, heading, and code fonts; adjust font size, line height, line width, paragraph spacing and indent with live preview
- **General settings** — editor behaviour toggles, new note format, tag placement

### App
- **Auto-updater** — checks for new releases on startup, prompts to install
- **Multi-window** — open notes in separate windows
- **Pinning and deletion** — pin important notes, delete notes you no longer need
- **300ms debounced save** — typing never waits on disk; saves happen silently in the background
- **File watcher** — detects external edits to your vault and re-indexes automatically

---

## Use cases

**Personal knowledge base** — Capture research, ideas, and reading notes across `[[linked]]` notes. Build a web of connected thought over time without any forced structure.

**Daily journaling** — Use the Today section to surface notes modified today. Keep a running daily note with tasks and thoughts, tagged and searchable.

**Project management (lightweight)** — Use `[ ]` task items inside notes and the To-dos section to track what needs doing across your vault.

**Writing and drafting** — Long-form writing in a clean, full-width editor with Lora/Fraunces typography that makes the words feel good. Collapse the sidebar and note list for full focus mode.

**Technical notes** — Fenced code blocks with syntax highlighting, tables, and inline code make it practical for engineers keeping a working journal or documenting systems.

**Research and reading notes** — Inline tags, backlinks, and WikiLinks make it easy to connect ideas across sources. The backlinks panel shows every note that references the current one.

---

## Coming soon

### v1.5
- **Canvas view** — infinite spatial canvas where notes become movable cards; arrange your thinking visually
- **Mini graph view** — node graph in the right panel showing the link relationships for the current note
- **Trash / soft delete** — move notes to trash before permanent deletion
- **Orphaned attachment cleanup** — detect and remove attachments no longer referenced by any note

### v2
- **Cloud sync** — optional, paid; sync your vault across machines via a hosted backend
- **PRO themes** — additional premium themes for paying subscribers
- **AI features** — in-editor writing assistance, summarisation, and smart linking suggestions
- **Publishing** — export notes or vaults to static sites

### Not planned
- Mobile or web apps (desktop only, by design)
- Real-time collaboration
- Built-in browser or web clipper
- Video or audio attachments

---

## Philosophy

- **Files first.** Notes are `.md` files. The database is an index, not the truth. Delete `app.db` and the app rebuilds it from your files.
- **No account required.** Core functionality works entirely offline, forever.
- **Instant.** The editor never waits on disk. Typing updates in-memory state immediately; saving is background.
- **Ownership.** Your vault is a folder on your machine. Copy it, back it up, open it in any editor. It's yours.

---

## Tech

Built with Tauri 2, React 19, Tiptap 3, SQLite (via rusqlite), and Zustand. Ships as a native macOS and Windows desktop app. Bundle size ~5MB.

---

*Kestra Notes v0.1.0*
