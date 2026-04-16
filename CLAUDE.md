# CLAUDE.md — Notes App Architecture

This file is the canonical reference for this project. Read it fully at the start of every session before writing any code.

---

## What we are building

A **local-first desktop markdown notes app** with two views:

- **Library view** — 3-pane layout (sidebar / editor / right panel)
- **Canvas view** — infinite spatial canvas with notes as movable cards

Think: the writing quality of Bear, the local file model of Obsidian, rebuilt from scratch with better performance and a cleaner architecture.

**Product sentence:** A local-first writing tool for connected thought.

---

## Non-negotiables

- Notes are `.md` files on disk. They are the canonical source of truth. Never treat the database as canonical.
- The app must feel instant. Typing never waits on disk or database.
- No account required for core functionality. Cloud sync is a v2 paid feature.
- Desktop only for v1. No mobile, no web.

---

## UI layout — reference: Bear notes

The visual and interaction reference is Bear (macOS). Study it. Every layout decision should ask: "does this feel as clean as Bear?"

### The 3-pane shell

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │          │  │              │  │                          │  │
│  │ Sidebar  │  │  Note list   │  │       Editor             │  │
│  │  ~220px  │  │   ~280px     │  │     (flex: 1)            │  │
│  │          │  │              │  │                          │  │
│  │          │  │              │  │ ──────────────────────── │  │
│  │          │  │              │  │  Backlinks panel         │  │
│  │          │  │              │  │  (collapsible, ~240px)   │  │
│  └──────────┘  └──────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

All three panes are always rendered. The sidebar and note list can be collapsed independently. The editor + backlinks panel share the right column, with backlinks collapsing from the bottom.

### Sidebar — left pane (~220px)

Structure exactly mirrors Bear's sidebar:

**System sections** (always present, in this order):
- Notes (all notes)
- Untagged
- Todo (notes with `[ ]` task items)
- Today (notes modified today)
- Locked (v2 — stub entry, show lock icon, no functionality)
- Pinned
- Trash

**Vault/folder section** (below a divider):
- Shows the vault name as a collapsible group header
- Lists subfolders as nested items with disclosure triangles
- Tags appear as `#tagname` with nested subtags as children (e.g. `#bear` → `welcome` subtag as seen in screenshots)

**Bottom of sidebar:**
- Settings gear icon
- New note button (or use top toolbar)

**Sidebar behaviour:**
- Clicking a system section filters the note list accordingly
- Clicking a folder shows notes in that folder
- Clicking a tag shows all notes with that tag
- Selected item has a subtle background highlight (the red/accent highlight in Bear's screenshots)
- Sidebar is collapsible — clicking the leftmost toggle or pressing `Cmd+Shift+1` hides it, note list slides left

### Note list — middle pane (~280px)

Each note card in the list shows:
- **Title** — bold, truncated to one line
- **Preview text** — 2 lines of the note body, muted color, truncated
- **Timestamp** — relative time ("6 seconds ago", "15 minutes ago", "15 hours ago") — update live
- **Image thumbnails** — if the note contains images, show up to 2 small inline thumbnails (as seen in Bear screenshots, ~70px wide, rounded corners)
- **Tag pills** — optionally show tag names as small inline chips

**Sorting:** Default sort is by `updated_at` descending (most recently modified first). Allow user to change sort in a top-right dropdown.

**Filtering:** When a search is active, show matching notes with the search term highlighted in the preview.

**Note list header:**
- Shows the current section name ("Notes", tag name, folder name)
- Right side: new note icon (pencil) + search icon
- On search icon click, expand an inline search bar at the top of the list

**Selected note:** highlighted with a left-side accent border (like Bear's red left border on selected note).

### Editor — right pane

- Takes all remaining horizontal space (`flex: 1`)
- Minimal chrome — no visible toolbar by default
- Top right corner: **B I U** formatting buttons (visible but subtle, like Bear) + info icon (ℹ️) + overflow menu (⋯)
- Editor content area is max-width constrained and centered (see Editor Configuration section)
- Note title is the first H1 in the document — not a separate input field
- Below the editor content: status bar (word count, reading time, last saved)

### Backlinks panel — collapsible bottom of right pane

- Lives below the editor in the same right column
- Separated by a thin horizontal divider with a collapse toggle (chevron)
- Default state: **collapsed** (show only the divider + "X backlinks" label)
- Expanded: shows a list of note cards that link to this note, each with title + short preview
- Expand/collapse with the chevron or by clicking the divider label
- Keyboard shortcut: `Cmd+Shift+B` toggles

When collapsed:
```
──── 3 backlinks  ›  ────────────────────────────────
```

When expanded:
```
──── 3 backlinks  ‹  ────────────────────────────────
  My other note          "...see [[this note]] for..."
  Research notes         "...referenced in [[this note]]..."
  Project planning       "...links back to [[this note]]..."
──────────────────────────────────────────────────────
```

### Pane collapse behaviour

| Action | Result |
|---|---|
| `Cmd+Shift+1` | Toggle sidebar |
| `Cmd+Shift+2` | Toggle note list (enter "focus" mode — just editor) |
| `Cmd+Shift+B` | Toggle backlinks panel |
| Click sidebar toggle (top left) | Collapse sidebar |
| Click note list toggle | Collapse note list |

When both sidebar and note list are collapsed, the editor takes the full window. This is "focus mode" — Bear does this when you click a note in the compact view (screenshot 6 shows the sidebar collapsed to just show "bear" label at top).

---

## Theming system

### Architecture

Themes are implemented as CSS custom property sets applied to the root `<html>` element. Each theme is a named set of CSS variable overrides. Switching themes = swapping a data attribute and persisting the choice.

```typescript
// src/store/themeStore.ts
type ThemeId = 'light' | 'dark-graphite' | 'high-contrast' | 'charcoal' | 'solarized-light' | 'solarized-dark'

interface ThemeStore {
  activeTheme: ThemeId
  setTheme: (id: ThemeId) => void
}
```

Apply theme by setting `data-theme` on `<html>`:
```typescript
document.documentElement.setAttribute('data-theme', themeId)
```

Persist to `settings.json` in the vault `.app/` folder via a Tauri command.

### V1 themes (matching Bear's set)

| Theme ID | Light/Dark | Description |
|---|---|---|
| `light` | Light | Default — warm white, subtle warm grays |
| `dark-graphite` | Dark | Default dark — deep neutral grays |
| `high-contrast` | Light | Pure white bg, near-black text, maximum contrast |
| `charcoal` | Dark | PRO — rich charcoal tones |
| `solarized-light` | Light | PRO — warm cream background |
| `solarized-dark` | Dark | PRO — teal-tinted dark background |

Mark PRO themes with a badge in the UI — they are selectable but show a "coming soon" message (don't lock them out entirely, just indicate they require a future paid tier).

### CSS variable structure

Define all theme variables in `src/styles/themes.css`:

```css
/* Base theme (light) */
[data-theme="light"] {
  --bg-primary: #FFFFFF;
  --bg-secondary: #F7F6F3;
  --bg-tertiary: #EFEDE8;
  --text-primary: #1A1916;
  --text-secondary: #6B6860;
  --text-tertiary: #A8A69F;
  --border: rgba(0,0,0,0.08);
  --border-strong: rgba(0,0,0,0.15);
  --accent: #CC3F3F;          /* Bear's red — use for selected states, links */
  --accent-subtle: #FAE8E8;
  --sidebar-bg: #EFEDE8;
  --notelist-bg: #F7F6F3;
  --editor-bg: #FFFFFF;
  --scrollbar: rgba(0,0,0,0.12);
}

[data-theme="dark-graphite"] {
  --bg-primary: #1E1E1E;
  --bg-secondary: #252525;
  --bg-tertiary: #2C2C2C;
  --text-primary: #E8E6E1;
  --text-secondary: #9E9B95;
  --text-tertiary: #6B6860;
  --border: rgba(255,255,255,0.08);
  --border-strong: rgba(255,255,255,0.15);
  --accent: #CC3F3F;
  --accent-subtle: rgba(204,63,63,0.15);
  --sidebar-bg: #1A1A1A;
  --notelist-bg: #1E1E1E;
  --editor-bg: #252525;
  --scrollbar: rgba(255,255,255,0.12);
}

[data-theme="high-contrast"] {
  --bg-primary: #FFFFFF;
  --bg-secondary: #F0F0F0;
  --bg-tertiary: #E0E0E0;
  --text-primary: #000000;
  --text-secondary: #333333;
  --text-tertiary: #666666;
  --border: rgba(0,0,0,0.2);
  --border-strong: rgba(0,0,0,0.4);
  --accent: #CC3F3F;
  --accent-subtle: #FFE0E0;
  --sidebar-bg: #F0F0F0;
  --notelist-bg: #F8F8F8;
  --editor-bg: #FFFFFF;
  --scrollbar: rgba(0,0,0,0.2);
}

[data-theme="solarized-light"] {
  --bg-primary: #FDF6E3;
  --bg-secondary: #EEE8D5;
  --bg-tertiary: #E5DFD0;
  --text-primary: #073642;
  --text-secondary: #586E75;
  --text-tertiary: #839496;
  --border: rgba(7,54,66,0.1);
  --border-strong: rgba(7,54,66,0.2);
  --accent: #268BD2;
  --accent-subtle: rgba(38,139,210,0.12);
  --sidebar-bg: #EEE8D5;
  --notelist-bg: #F5EFDA;
  --editor-bg: #FDF6E3;
  --scrollbar: rgba(7,54,66,0.15);
}

[data-theme="charcoal"] {
  --bg-primary: #2B2B2B;
  --bg-secondary: #323232;
  --bg-tertiary: #3A3A3A;
  --text-primary: #D4D0C8;
  --text-secondary: #8A8680;
  --text-tertiary: #5E5B56;
  --border: rgba(255,255,255,0.07);
  --border-strong: rgba(255,255,255,0.12);
  --accent: #CC3F3F;
  --accent-subtle: rgba(204,63,63,0.15);
  --sidebar-bg: #252525;
  --notelist-bg: #2B2B2B;
  --editor-bg: #323232;
  --scrollbar: rgba(255,255,255,0.1);
}

[data-theme="solarized-dark"] {
  --bg-primary: #002B36;
  --bg-secondary: #073642;
  --bg-tertiary: #0D4050;
  --text-primary: #FDF6E3;
  --text-secondary: #93A1A1;
  --text-tertiary: #657B83;
  --border: rgba(253,246,227,0.08);
  --border-strong: rgba(253,246,227,0.15);
  --accent: #268BD2;
  --accent-subtle: rgba(38,139,210,0.15);
  --sidebar-bg: #00212B;
  --notelist-bg: #002B36;
  --editor-bg: #073642;
  --scrollbar: rgba(253,246,227,0.12);
}
```

Use `var(--bg-primary)`, `var(--text-primary)` etc. everywhere in components. Never hardcode colors outside `themes.css`.

### Settings panel — Themes tab

Render theme options as visual cards (matching Bear's screenshot exactly):
- 2-column grid of theme cards
- Each card shows the theme name, a preview of the typography with sample text ("Lorem ipsum **dolor sit amet**, consectetur adipiscing elit. Mauris iaculis *semper* pharetra.")
- Card background and text use the actual theme colors — it IS the preview
- Selected theme has a colored border (accent color)
- PRO themes show a "PRO" badge chip in the top right corner
- Clicking a non-PRO theme applies it immediately

### Settings panel — Typography tab

Matching Bear's Typography settings panel exactly:

**Font selectors** (shown as "Aa FontName" buttons):
- Text Font — body font for note content (default: Lora)
- Headings Font — heading font (default: Fraunces)
- Code Font — monospace for code blocks (default: JetBrains Mono)

Clicking a font button opens a font picker dropdown with available options.

**Sliders** (all with live preview — changes apply instantly to the editor):
- Font Size — range 12–24pt, default 17pt
- Line Height — range 1.2–2.0em, default 1.75em
- Line Width — range 36–80em, default 48em (controls max-width of editor content)
- Paragraph Spacing — range 0–2em, default 0em
- Paragraph Indent — range 0–3em, default 0em

All slider values update CSS variables on the editor in real time. Persist to `settings.json`.

**Reset button:** "Restore Editor Defaults" — resets all sliders and fonts to defaults.

Store typography settings in Zustand + persist to `settings.json`:
```typescript
interface TypographySettings {
  textFont: string        // 'Lora'
  headingsFont: string    // 'Fraunces'
  codeFont: string        // 'JetBrains Mono'
  fontSize: number        // 17
  lineHeight: number      // 1.75
  lineWidth: number       // 48  (em units)
  paragraphSpacing: number // 0
  paragraphIndent: number  // 0
}
```

Apply as inline CSS variables on the editor container:
```typescript
editorEl.style.setProperty('--editor-font-size', `${settings.fontSize}px`)
editorEl.style.setProperty('--editor-line-height', `${settings.lineHeight}`)
editorEl.style.setProperty('--editor-max-width', `${settings.lineWidth}em`)
```

### Settings panel — General tab

Matching Bear's General settings:

**Editor toggles** (checkboxes):
- Hide Markdown (show formatted output, not raw syntax) — default ON
- Auto-fill titles when pasting web links — default ON
- Autocomplete tags, WikiLinks, emoji — default ON
- Automatically sort todos upon completion — default OFF
- Keep tags during export — default ON

**Dropdowns:**
- Create new notes with: [Heading 1 | Heading 2 | Empty]
- Add tags at: [Bottom of note | Top of note]

**Keyboard shortcuts:**
- Open main window: [Record Shortcut]
- Create a new note: [Record Shortcut]

---

## Tag system

Tags in markdown use `#tagname` syntax inline in the note body. They are NOT frontmatter — they live in the prose itself, just like Bear.

### Tag syntax rules

- `#tagname` — single tag
- `#tag/subtag` — nested tag (creates parent `#tag` with child `subtag` in sidebar)
- Tags are alphanumeric + hyphens + underscores + forward slashes (for nesting)
- Tags must not start with a number
- Tags are case-insensitive (stored lowercase)
- A tag appearing anywhere in the note body (including inside headings, lists, or paragraphs) counts

### Tags in the DB

Add to the schema:

```sql
CREATE TABLE tags (
  id          TEXT PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,   -- full tag name, e.g. "project/work"
  parent_name TEXT                    -- "project" for "project/work", NULL for root tags
);

CREATE TABLE note_tags (
  note_id     TEXT NOT NULL,
  tag_id      TEXT NOT NULL,
  PRIMARY KEY (note_id, tag_id)
);
```

The indexer extracts tags from note content during the index pass and keeps `note_tags` in sync.

### Tags Tauri commands

- `get_tags(workspace_id: string)` → `Tag[]` — all tags, with note count
- `get_notes_by_tag(tag_name: string)` → `Note[]`
- `rename_tag(old_name: string, new_name: string)` → `void` — updates all notes on disk + DB
- `delete_tag(name: string)` → `void` — removes tag from all notes on disk

### Tag rendering in Tiptap

Tags typed as `#tagname` in the editor should be recognised and rendered as styled inline chips — same visual treatment as Bear's red tag links. Implement as a custom Tiptap `Mark` extension:

```typescript
// extensions/Tag.ts
const Tag = Mark.create({
  name: 'tag',
  parseHTML() {
    return [{ tag: 'span[data-tag]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, 'data-tag': true, class: 'note-tag' }, 0]
  },
  addInputRules() {
    return [
      markInputRule({
        find: /#([\w\-_\/]+)/,
        type: this.type,
      })
    ]
  }
})
```

Style `.note-tag` to match the accent color. Clicking a tag in the editor navigates the sidebar to that tag's note list.

### Sidebar tag display

Tags appear in the sidebar below the folder list, grouped under a "Tags" header:
- Root tags shown at the top level with `#` prefix
- Nested tags shown as indented children (disclosure triangle to expand/collapse)
- Each tag shows its note count in a muted badge on the right
- Tags sorted alphabetically within each level

---

## Updated SQLite schema

Add tags tables to the schema from before:

```sql
-- (all previous tables remain) --

CREATE TABLE tags (
  id          TEXT PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  parent_name TEXT
);

CREATE TABLE note_tags (
  note_id     TEXT NOT NULL,
  tag_id      TEXT NOT NULL,
  PRIMARY KEY (note_id, tag_id)
);
```

---

## Updated project structure

```
src/
  styles/
    themes.css             ← all theme CSS variable sets
    base.css               ← reset, global base styles
  views/
    Library.tsx            ← 3-pane layout shell
    Canvas.tsx             ← infinite spatial view
  components/
    Layout/
      ThreePaneShell.tsx   ← manages pane widths, collapse state
      PaneResizer.tsx      ← drag handle between panes
    Sidebar/
      Sidebar.tsx          ← left pane container
      SystemSection.tsx    ← Notes, Untagged, Todo, Today, Trash etc.
      FolderTree.tsx       ← vault folder hierarchy
      TagTree.tsx          ← #tag hierarchy with nesting
    NoteList/
      NoteList.tsx         ← middle pane container
      NoteCard.tsx         ← individual note preview card
      NoteListHeader.tsx   ← section title + new/search buttons
    Editor/
      Editor.tsx
      extensions/
        WikiLink.ts
        SlashCommands.ts
        Callout.ts
        ImageUpload.ts
        Tag.ts             ← #tag mark extension
      EditorToolbar.tsx
      EditorStyles.css
    BacklinksPanel/
      BacklinksPanel.tsx   ← collapsible bottom panel
      BacklinkCard.tsx     ← individual backlink preview
    Settings/
      SettingsModal.tsx    ← modal container with tab nav
      GeneralTab.tsx
      TypographyTab.tsx
      ThemesTab.tsx        ← theme picker grid
  store/
    noteStore.ts
    themeStore.ts          ← active theme + typography settings
    uiStore.ts             ← pane collapse state, sidebar selection
```

---

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Desktop shell | Tauri 2 | Not Electron. Use Tauri's FS + shell plugins. |
| Frontend | React + TypeScript + Vite | Not Next.js. No SSR. |
| Editor | Tiptap (ProseMirror) | Headless, fully extensible |
| Local DB | SQLite via `tauri-plugin-sql` | Metadata only, never canonical |
| Styling | Tailwind CSS | Utility-first, no component libraries |
| State | Zustand | In-memory working state |
| File watching | `notify` crate (Rust) | Watch vault dir for external changes |

---

## Project structure

```
CLAUDE.md                  ← you are here
docs/
  db-schema.sql            ← SQLite schema (source of truth for DB)
  commands.md              ← Tauri command surface
src-tauri/
  src/
    commands/
      notes.rs             ← create, read, rename, delete note files
      search.rs            ← FTS5 full-text search
      graph.rs             ← backlink + outbound link queries
      canvas.rs            ← canvas position read/write
      attachments.rs       ← copy file into vault, return relative path
      sync.rs              ← v2 stub only, do not implement yet
    indexer.rs             ← background file watcher + markdown parser
    db.rs                  ← SQLite connection pool + migrations
    wikilinks.rs           ← [[...]] parser and ID resolver
    main.rs
  tauri.conf.json
  Cargo.toml
src/
  views/
    Library.tsx            ← 3-pane layout shell
    Canvas.tsx             ← infinite spatial view
  components/
    Editor/
      Editor.tsx           ← Tiptap instance + extension wiring
      extensions/
        WikiLink.ts        ← [[...]] node extension
        SlashCommands.ts   ← / command menu
        Callout.ts         ← callout block node
        ImageUpload.ts     ← drag/drop + paste image handler
      EditorToolbar.tsx    ← floating bubble menu
      EditorStyles.css     ← typography, prose styles
    Sidebar.tsx            ← file list, folder tree, search input
    RightPanel.tsx         ← backlinks list + mini graph preview
    CommandPalette.tsx     ← global search overlay (Cmd+K)
  hooks/
    useNote.ts             ← load, save, track dirty state
    useSearch.ts           ← FTS queries via invoke
    useGraph.ts            ← backlink/outbound data
    useAttachments.ts      ← drag/drop handling, invoke wrapper
  store/
    noteStore.ts           ← Zustand store for in-memory note state
  lib/
    tauri.ts               ← typed invoke() wrappers for all commands
  main.tsx
  App.tsx
package.json
vite.config.ts
```

---

## Storage model — two layers, never conflated

### Layer A — User content (canonical)
```
~/vault/
  notes/
    my-note.md
    another-note.md
  attachments/
    images/
      screenshot-2024.png
      diagram.jpg
    files/
      report.pdf
  .app/
    app.db          ← SQLite metadata database
    settings.json   ← workspace preferences
```

`.md` files are what the user owns. Attachments live alongside them in the vault — they are user content, not app metadata. If the database is deleted, the app rebuilds it from the files. Never the reverse.

### Layer B — App metadata (derived index)
SQLite database at `{vault}/.app/app.db`. See `docs/db-schema.sql` for full schema.

Tables:
- `notes` — registry of note ID → file path → title
- `backlinks` — source_id → target_id edges
- `outbound_links` — raw wikilink text + resolved target ID
- `canvas_positions` — x, y, width per note per workspace
- `fts_index` — FTS5 virtual table for full-text search
- `attachments` — registry of attachment ID → file path → note association
- `workspaces` — vault registry
- `sync_state` — v2 stub, columns exist but logic not implemented

---

## SQLite schema

```sql
CREATE TABLE notes (
  id          TEXT PRIMARY KEY,   -- nanoid, stable across renames
  file_path   TEXT UNIQUE NOT NULL,
  title       TEXT,
  created_at  INTEGER,
  updated_at  INTEGER,
  file_hash   TEXT
);

CREATE TABLE backlinks (
  source_id   TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  PRIMARY KEY (source_id, target_id)
);

CREATE TABLE outbound_links (
  source_id   TEXT NOT NULL,
  link_text   TEXT NOT NULL,      -- raw [[text]] as written
  resolved_id TEXT                -- NULL if unresolved
);

CREATE TABLE canvas_positions (
  note_id       TEXT PRIMARY KEY,
  x             REAL,
  y             REAL,
  width         REAL DEFAULT 280,
  workspace_id  TEXT
);

CREATE VIRTUAL TABLE fts_index USING fts5(
  note_id UNINDEXED,
  title,
  body
);

CREATE TABLE workspaces (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  vault_path    TEXT,
  last_opened   INTEGER
);

CREATE TABLE attachments (
  id          TEXT PRIMARY KEY,   -- nanoid
  file_path   TEXT UNIQUE NOT NULL, -- relative to vault root, e.g. "attachments/images/foo.png"
  file_name   TEXT NOT NULL,
  mime_type   TEXT,
  size_bytes  INTEGER,
  note_id     TEXT,               -- note it was first attached to (informational only)
  created_at  INTEGER
);

CREATE TABLE sync_state (
  note_id       TEXT PRIMARY KEY,
  remote_hash   TEXT,
  last_synced   INTEGER,
  conflict      INTEGER DEFAULT 0
);
```

---

## Tauri command surface

All frontend→backend communication goes through typed `invoke()` calls. Define these in `src/lib/tauri.ts` with proper TypeScript types.

### Vault
- `open_vault(path: string)` — scan dir, populate notes table, start file watcher
- `get_workspaces()` → `Workspace[]`

### Notes
- `get_note(id: string)` → `{ id, title, content: string, updatedAt }`
- `save_note(id: string, content: string)` → `void` — writes .md, updates hash
- `create_note(title: string, workspace_id: string)` → `Note`
- `rename_note(id: string, new_title: string)` → `void` — renames file, re-resolves links
- `delete_note(id: string)` → `void`
- `list_notes(workspace_id: string)` → `Note[]`

### Search
- `search(query: string, workspace_id: string)` → `SearchResult[]` — FTS5, ranked, with snippets

### Graph
- `get_backlinks(id: string)` → `Note[]`
- `get_outbound_links(id: string)` → `LinkResult[]`

### Canvas
- `get_canvas_positions(workspace_id: string)` → `CanvasPosition[]`
- `set_canvas_position(note_id: string, x: number, y: number)` → `void`

### Attachments
- `import_attachment(source_path: string, note_id: string)` → `Attachment` — copies file into `vault/attachments/`, registers in DB, returns relative path
- `get_attachment_path(id: string)` → `string` — returns absolute path for rendering (used by Tauri asset protocol)
- `list_attachments(note_id: string)` → `Attachment[]`
- `delete_attachment(id: string)` → `void` — removes file from disk and DB

---

## Wikilink resolution rules

This must be consistent across the entire codebase.

1. `[[My Note]]` → query `notes` table: `WHERE title = 'My Note'`
2. If no title match, try: `WHERE file_path LIKE '%My Note.md'`
3. If multiple matches → mark as ambiguous, surface disambiguation UI
4. On rename → update `notes.file_path` and `notes.title`. Backlinks remain intact because they reference stable `id`, not path.
5. Store raw link text in `outbound_links.link_text` always — so links can be re-resolved after renames without reparsing every file.
6. Unresolved links (note doesn't exist yet) → render as a "ghost" link, create note on click.

---

## The edit → save → index cycle

This is the most important architectural pattern in the app. Get this right before anything else.

```
User types in Tiptap
  → Zustand in-memory state updates instantly (0ms, no waiting)
  → 300ms debounce starts
  → debounce fires: invoke("save_note", { id, content })
  → Rust writes .md file to disk
  → file watcher fires (or indexer polls)
  → background Rust thread parses markdown, extracts wikilinks
  → updates backlinks, outbound_links, fts_index in SQLite
  → emits Tauri event to frontend
  → RightPanel refreshes backlinks display
```

**Rules:**
- The editor NEVER waits on disk. In-memory state is always ahead of disk.
- `save_note` is fire-and-forget from the frontend's perspective.
- The indexer runs on a background thread. Never block the main thread.
- File watcher debounces at 500ms to avoid thrashing on rapid saves.

---

## Editor configuration

The editor is the core emotional differentiator of this app. It must feel like Bear — beautiful, fast, focused. Configure Tiptap with the full extension set below from day one.

### Tiptap extensions

Install all of these. Do not defer any to later steps.

```ts
// src/components/Editor/Editor.tsx
import StarterKit from '@tiptap/starter-kit'
import Typography from '@tiptap/extension-typography'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'
import CharacterCount from '@tiptap/extension-character-count'
import { lowlight } from 'lowlight'
import { WikiLink } from './extensions/WikiLink'
import { SlashCommands } from './extensions/SlashCommands'
import { Callout } from './extensions/Callout'
import { ImageUpload } from './extensions/ImageUpload'

const editor = useEditor({
  extensions: [
    StarterKit.configure({ codeBlock: false }),
    Typography,
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') return 'Heading'
        return 'Write something, or press / for commands...'
      },
      showOnlyCurrent: true,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow, TableCell, TableHeader,
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: 'plaintext',
      HTMLAttributes: { class: 'code-block' },
    }),
    Image.configure({
      HTMLAttributes: { class: 'editor-image' },
      allowBase64: false,
    }),
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
    Highlight.configure({ multicolor: false }),
    Underline, Subscript, Superscript,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    CharacterCount,
    WikiLink,
    SlashCommands,
    Callout,
    ImageUpload,
  ],
  editorProps: {
    attributes: { class: 'editor-prose', spellcheck: 'true' },
  },
})
```

### Slash commands (`/` menu)

| Command | What it inserts |
|---|---|
| `/h1` `/h2` `/h3` | Headings |
| `/bullet` | Bullet list |
| `/numbered` | Ordered list |
| `/todo` | Task list item |
| `/quote` | Blockquote |
| `/code` | Code block with language picker |
| `/table` | 3x3 table |
| `/callout` | Callout block (info / warning / tip variants) |
| `/image` | Native file picker to import attachment |
| `/divider` | Horizontal rule |
| `/link` | Insert wikilink (opens note picker) |

Render as a floating dropdown anchored to cursor. Filter as user types after `/`. Dismiss on Escape or selection.

### Bubble menu

Show on text selection only. Buttons: Bold, Italic, Underline, Strikethrough, Highlight, Code, Link, overflow. Do not show when a code block or image is selected.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+B` | Bold |
| `Cmd+I` | Italic |
| `Cmd+U` | Underline |
| `Cmd+Shift+X` | Strikethrough |
| `Cmd+E` | Inline code |
| `Cmd+Shift+H` | Highlight |
| `Cmd+K` | Insert / edit link |
| `Cmd+Alt+1/2/3` | Heading 1/2/3 |
| `Cmd+Shift+B` | Blockquote |
| `Cmd+Shift+7/8/9` | Ordered / Bullet / Task list |
| `Tab` / `Shift+Tab` | Indent / outdent list item |
| `Cmd+Enter` | Toggle task item |

### Typography and prose styles (`EditorStyles.css`)

**Fonts to load:**
- **Fraunces** — headings (expressive, editorial serif)
- **Lora** — body text (warm, readable serif)
- **JetBrains Mono** — code

Load via Google Fonts or bundle locally. Apply via `.editor-prose` class.

```css
.editor-prose {
  font-family: 'Lora', 'Georgia', serif;
  font-size: 17px;
  line-height: 1.75;
  color: var(--text-primary);
  max-width: 680px;
  margin: 0 auto;
  padding: 48px 24px 120px;
  caret-color: var(--accent);
}

.editor-prose h1 { font-family: 'Fraunces', serif; font-size: 2rem; font-weight: 700; line-height: 1.2; margin: 2rem 0 0.5rem; }
.editor-prose h2 { font-family: 'Fraunces', serif; font-size: 1.5rem; font-weight: 600; line-height: 1.3; margin: 1.75rem 0 0.5rem; }
.editor-prose h3 { font-family: 'Fraunces', serif; font-size: 1.2rem; font-weight: 600; margin: 1.5rem 0 0.4rem; }

.editor-prose code { font-family: 'JetBrains Mono', monospace; font-size: 0.875em; background: var(--code-bg); padding: 2px 5px; border-radius: 4px; }
.editor-prose .code-block { font-family: 'JetBrains Mono', monospace; font-size: 0.875em; line-height: 1.6; padding: 1rem 1.25rem; border-radius: 8px; background: var(--code-block-bg); overflow-x: auto; margin: 1.25rem 0; }

.editor-prose blockquote { border-left: 3px solid var(--accent); padding-left: 1rem; color: var(--text-secondary); font-style: italic; margin: 1.25rem 0; }

.editor-prose .editor-image { max-width: 100%; border-radius: 8px; display: block; margin: 1.5rem auto; }
.editor-prose .editor-image.selected { outline: 2px solid var(--accent); outline-offset: 2px; }

.editor-prose ul[data-type="taskList"] { list-style: none; padding: 0; }
.editor-prose ul[data-type="taskList"] li { display: flex; align-items: baseline; gap: 8px; }
.editor-prose ul[data-type="taskList"] input[type="checkbox"] { margin-top: 2px; accent-color: var(--accent); }

.editor-prose table { width: 100%; border-collapse: collapse; margin: 1.25rem 0; font-size: 0.9375em; }
.editor-prose th { background: var(--surface-secondary); font-weight: 600; text-align: left; padding: 8px 12px; border: 1px solid var(--border); }
.editor-prose td { padding: 8px 12px; border: 1px solid var(--border); }

.editor-prose p.is-empty::before { color: var(--text-tertiary); content: attr(data-placeholder); float: left; height: 0; pointer-events: none; }

.editor-prose .wikilink { color: var(--accent); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); cursor: pointer; }
.editor-prose .wikilink.unresolved { color: var(--text-tertiary); border-bottom-style: dashed; }
.editor-prose .wikilink:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); border-radius: 3px; }
```

---

## Attachment handling

### How it works

1. User drops an image onto the editor, pastes from clipboard, or uses `/image`.
2. Frontend calls `invoke("import_attachment", { source_path, note_id })`.
3. Rust copies the file into `vault/attachments/images/`, generates a nanoid filename, registers in `attachments` table, returns the record.
4. Frontend inserts an image node using `convertFileSrc(absolutePath)` from `@tauri-apps/api/core`.
5. The `.md` file stores a standard relative reference: `![filename](../attachments/images/nanoid.png)` — portable outside the app.

### Accepted file types

| Type | Extensions | Destination |
|---|---|---|
| Images | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg` | `attachments/images/` |
| PDFs | `.pdf` | `attachments/files/` |
| Other | any | `attachments/files/` |

Block files over **50MB** with a user-facing error.

### ImageUpload extension behaviour

- **Drag onto editor** — intercept `drop`, call `import_attachment`, insert image node
- **Paste from clipboard** — intercept `paste`, extract image data, write temp file, call `import_attachment`
- **`/image` slash command** — open native Tauri dialog file picker, call `import_attachment`
- While uploading: show placeholder node with subtle loading state
- On error: remove placeholder, show toast

### Asset protocol setup

Never use `file://` directly — blocked by Tauri's CSP. Always use `convertFileSrc`.

```ts
import { convertFileSrc } from '@tauri-apps/api/core'
const assetUrl = convertFileSrc(absolutePath)
```

Add to `tauri.conf.json`:
```json
{
  "app": {
    "security": {
      "assetProtocol": {
        "enable": true,
        "scope": ["$HOME/vault/**", "$APPDATA/vault/**"]
      }
    }
  }
}
```

### Naming and cleanup rules

- Store files as `{nanoid}.{ext}` on disk. Preserve original `file_name` in DB for display.
- No content-hash deduplication in v1.
- Deleting a note does NOT auto-delete its attachments in v1. Add orphaned attachment cleanup in v1.5.

---

## V1 build order

Build in this order. Each step is shippable. Do not skip ahead.

1. Scaffold Tauri + React + Vite project
2. DB init — open vault, create `app.db`, run migrations
3. Scan vault dir → populate `notes` table
4. Sidebar note list rendered from DB
5. Click note → `get_note` → load markdown into Tiptap with **full extension set** from Editor Configuration
6. Type → 300ms debounce → `save_note` → .md file updates on disk
7. File watcher → re-index on external edits
8. `[[wikilink]]` Tiptap extension → parse, resolve, navigate on click
9. Image/attachment support — drag/drop, paste, `/image` command, asset protocol rendering
10. Right panel backlinks list
11. Command palette search (Cmd+K → FTS5 query)
12. Canvas view — render cards from `canvas_positions`, drag to reposition
13. Mini graph preview in right panel

**Stop at step 11 and you have a complete, shippable v1.**
Steps 12-13 are v1.5.

**Stop at step 11 and you have a complete, shippable v1.**
Steps 12–13 are v1.5.

---

## What NOT to build in v1

Do not implement or stub these unless explicitly asked:

- Cloud sync (v2 only — `sync.rs` is a stub file, nothing more)
- Supabase or any remote database
- User accounts or auth
- Mobile or web builds
- Themes
- AI features
- Collaboration
- Publishing
- Video or audio attachments (images and PDFs only for v1)

---

## Editor configuration

The editor is the emotional core of the product. It must feel like a joy to write in — not a utility. Every detail matters. Configure Tiptap fully from day one; do not defer editor quality to a later step.

### Tiptap extensions to install and configure

**Typography and formatting**
- `@tiptap/extension-document` — base document node
- `@tiptap/extension-paragraph` — base paragraph node
- `@tiptap/extension-text` — base text node
- `@tiptap/extension-hard-break` — Shift+Enter line break
- `@tiptap/extension-bold` — Cmd+B
- `@tiptap/extension-italic` — Cmd+I
- `@tiptap/extension-strike` — Cmd+Shift+S
- `@tiptap/extension-underline` — Cmd+U
- `@tiptap/extension-code` — inline code, backtick shortcut
- `@tiptap/extension-highlight` — text highlight, yellow by default
- `@tiptap/extension-subscript`
- `@tiptap/extension-superscript`
- `@tiptap/extension-typography` — smart quotes, em dashes, ellipsis auto-replace

**Structure**
- `@tiptap/extension-heading` — H1–H3 only (not H4–H6, they create visual noise)
- `@tiptap/extension-bullet-list` + `@tiptap/extension-list-item` — `-` shortcut
- `@tiptap/extension-ordered-list` — `1.` shortcut
- `@tiptap/extension-task-list` + `@tiptap/extension-task-item` — `[ ]` checkbox shortcut
- `@tiptap/extension-blockquote` — `>` shortcut
- `@tiptap/extension-code-block-lowlight` — fenced code blocks with syntax highlighting via `lowlight` + `highlight.js`
- `@tiptap/extension-horizontal-rule` — `---` shortcut
- `@tiptap/extension-table` + `@tiptap/extension-table-row` + `@tiptap/extension-table-header` + `@tiptap/extension-table-cell`

**Links and navigation**
- `@tiptap/extension-link` — auto-detect URLs, Cmd+K to add link, open in browser via Tauri shell
- Custom `WikiLink` extension (build this — see Wikilink section) — `[[` trigger

**Images and attachments**
- `@tiptap/extension-image` — base image node, extended by custom `ImageUpload` extension
- Custom `ImageUpload` extension (build this — see Attachments section)

**Editor experience**
- `@tiptap/extension-placeholder` — placeholder text: `"Start writing..."` on empty doc, `"Heading..."` on empty H1
- `@tiptap/extension-character-count` — show word count in status bar
- `@tiptap/extension-history` — undo/redo (Cmd+Z / Cmd+Shift+Z)
- `@tiptap/extension-gapcursor` — click between blocks to position cursor
- `@tiptap/extension-dropcursor` — visual drop target when dragging content
- `@tiptap/extension-focus` — adds `.is-focused` class to focused nodes for styling
- Custom `SlashCommands` extension — `/` triggers command menu (see below)
- Custom `Callout` extension — callout/admonition block node (info, warning, tip)

### Slash command menu (`/`)

Trigger: user types `/` at the start of a line or after a space.

Show a floating command palette with these options, filterable by typing:

| Command | What it inserts |
|---|---|
| `/h1` or `/heading 1` | H1 heading |
| `/h2` or `/heading 2` | H2 heading |
| `/h3` or `/heading 3` | H3 heading |
| `/bullet` or `/list` | Bullet list |
| `/numbered` or `/ordered` | Numbered list |
| `/todo` or `/task` | Task list with checkbox |
| `/quote` | Blockquote |
| `/code` | Code block |
| `/table` | 3×3 table |
| `/divider` or `/hr` | Horizontal rule |
| `/callout` | Callout block (info style by default) |
| `/image` | Opens file picker to insert image |
| `/link` | Prompt for URL and insert link |
| `/note` or `[[` | WikiLink picker — search existing notes |

Dismiss on Escape. Navigate with arrow keys. Insert with Enter.

### Bubble menu (floating toolbar)

Appears when the user selects text. Show only what's relevant to the selection:

For **text selections**: Bold · Italic · Strikethrough · Inline code · Highlight · Link · Turn into heading (dropdown)

For **image selections**: Alt text · Resize (S / M / L / Full) · Align (left / center / right) · Delete

Implement using `@tiptap/extension-bubble-menu`. Keep it minimal — max 7 items visible at once. No icons-only toolbar; use icons + tooltip on hover.

### Keyboard shortcuts

These must all work. Do not rely on Tiptap defaults alone — verify and configure explicitly.

| Shortcut | Action |
|---|---|
| `Cmd+B` | Bold |
| `Cmd+I` | Italic |
| `Cmd+U` | Underline |
| `Cmd+Shift+S` | Strikethrough |
| `Cmd+K` | Insert/edit link |
| `Cmd+Z` / `Cmd+Shift+Z` | Undo / redo |
| `Cmd+A` | Select all |
| `Tab` | Indent list item |
| `Shift+Tab` | Outdent list item |
| `Enter` in task item | New task item |
| `Backspace` at start of block | Unwrap block (e.g. heading → paragraph) |
| `[[` | Open wikilink picker |
| `/` at line start | Open slash command menu |
| `Cmd+Shift+V` | Paste without formatting |

### Typography and prose styles

Configure in `src/components/Editor/EditorStyles.css`. The editor content area should feel like a premium writing surface — not a browser textarea.

```css
/* Target Tiptap's content div */
.tiptap.ProseMirror {
  /* Generous reading width — never full container width */
  max-width: 680px;
  margin: 0 auto;
  padding: 48px 24px 120px;

  /* Typography */
  font-family: 'Lora', Georgia, serif;   /* body: warm editorial serif */
  font-size: 17px;
  line-height: 1.75;
  color: var(--color-text-primary);
  letter-spacing: -0.01em;

  /* Smooth rendering */
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "kern" 1, "liga" 1, "onum" 1;
}

/* Headings — contrasting sans-serif for visual hierarchy */
.tiptap h1 {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.2;
  margin: 2rem 0 0.5rem;
  letter-spacing: -0.03em;
}
.tiptap h2 {
  font-size: 1.4rem;
  font-weight: 600;
  line-height: 1.3;
  margin: 1.75rem 0 0.4rem;
  letter-spacing: -0.02em;
}
.tiptap h3 {
  font-size: 1.15rem;
  font-weight: 600;
  margin: 1.5rem 0 0.3rem;
}

/* Lists */
.tiptap ul, .tiptap ol {
  padding-left: 1.5rem;
  margin: 0.75rem 0;
}
.tiptap li { margin: 0.25rem 0; }

/* Task list */
.tiptap ul[data-type="taskList"] { list-style: none;
    margin-left: 0;
    padding: 0;

    li {
      align-items: flex-start;
      display: flex;

      > label {
        flex: 0 0 auto;
        margin-right: 0.5rem;
        user-select: none;
      }

      > div {
        flex: 1 1 auto;
      }
    }

    input[type='checkbox'] {
      cursor: pointer;
    }

    ul[data-type='taskList'] {
      margin: 0;
    }
 }
.tiptap li[data-type="taskItem"] { display: flex; align-items: flex-start; gap: 0.5rem; }
.tiptap li[data-type="taskItem"] > label { margin-top: 3px; }
.tiptap li[data-type="taskItem"][data-checked="true"] > div {
  color: var(--color-text-tertiary);
  text-decoration: line-through;
}

/* Blockquote */
.tiptap blockquote {
  border-left: 3px solid var(--color-border-secondary);
  margin: 1rem 0;
  padding: 0.25rem 0 0.25rem 1.25rem;
  color: var(--color-text-secondary);
  font-style: italic;
}

/* Code */
.tiptap code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.875em;
  background: var(--color-background-secondary);
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: 4px;
  padding: 1px 5px;
}
.tiptap pre {
  background: var(--color-background-secondary);
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin: 1rem 0;
  overflow-x: auto;
}
.tiptap pre code {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.85em;
  line-height: 1.6;
}

/* Horizontal rule */
.tiptap hr {
  border: none;
  border-top: 0.5px solid var(--color-border-tertiary);
  margin: 2rem 0;
}

/* Images */
.tiptap img {
  max-width: 100%;
  border-radius: 8px;
  display: block;
  margin: 1rem auto;
}
.tiptap img.ProseMirror-selectednode {
  outline: 2px solid var(--color-border-info);
  outline-offset: 2px;
}

/* WikiLink */
.tiptap .wikilink {
  color: var(--color-text-info);
  border-bottom: 1px solid currentColor;
  border-bottom-style: dashed;
  cursor: pointer;
  text-decoration: none;
}
.tiptap .wikilink.unresolved {
  color: var(--color-text-tertiary);
  border-bottom-color: var(--color-border-tertiary);
}

/* Callout block */
.tiptap .callout {
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin: 1rem 0;
  border-left: 3px solid;
}
.tiptap .callout[data-type="info"]    { background: var(--color-background-info);    border-color: var(--color-border-info);    color: var(--color-text-info); }
.tiptap .callout[data-type="warning"] { background: var(--color-background-warning); border-color: var(--color-border-warning); color: var(--color-text-warning); }
.tiptap .callout[data-type="tip"]     { background: var(--color-background-success); border-color: var(--color-border-success); color: var(--color-text-success); }

/* Selection */
.tiptap ::selection { background: rgba(59, 130, 246, 0.2); }

/* Placeholder */
.tiptap p.is-empty::before {
  color: var(--color-text-tertiary);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

/* Focus state — no browser outline */
.tiptap:focus { outline: none; }

/* Table */
.tiptap table {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
  font-size: 0.9em;
}
.tiptap th, .tiptap td {
  border: 0.5px solid var(--color-border-tertiary);
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
}
.tiptap th {
  background: var(--color-background-secondary);
  font-weight: 500;
}
.tiptap .selectedCell { background: var(--color-background-info); }
```


### Status bar

Render a minimal status bar below the editor (not inside it):

```
Word count: 247  ·  Reading time: ~1 min  ·  Last saved: just now
```

- Word count from `@tiptap/extension-character-count`
- Reading time calculated as `Math.ceil(wordCount / 200)` minutes
- Last saved: show "Saving..." briefly after debounce fires, then "just now", then "X min ago"
- Keep it subtle — `font-size: 12px`, `color: var(--color-text-tertiary)`

---

## Attachments and image support

### Vault structure for attachments

```
~/vault/
  notes/
    my-note.md
  attachments/
    images/
      2024-01-15-screenshot.png    ← renamed on import: {date}-{original-name}
      2024-01-20-diagram.jpg
    files/
      report.pdf
  .app/
    app.db
    settings.json
```

Attachments live in the vault alongside notes. They are user content — portable, owned, not locked in the app. Never store attachments inside `.app/`.

### How images are referenced in markdown

Images use standard markdown syntax with relative paths from the note file:

```markdown
![alt text](../attachments/images/2024-01-15-screenshot.png)
```

This means the `.md` file is portable — open it in any markdown editor and the image still resolves (as long as the vault folder structure is intact).

Do not use absolute paths. Do not use attachment IDs as src values. Always relative paths.

### Tauri asset protocol for image rendering

Tauri's webview cannot load arbitrary `file://` paths for security reasons. Use the Tauri asset protocol to serve local files:

```typescript
// In src/lib/tauri.ts
import { convertFileSrc } from '@tauri-apps/api/core'

export function assetUrl(absolutePath: string): string {
  return convertFileSrc(absolutePath)
}
```

When Tiptap renders an image node, convert the relative markdown path to an absolute vault path, then to an asset URL:

```typescript
// In ImageUpload extension or Editor.tsx
const absolutePath = `${vaultPath}/${relativePath}`
const src = convertFileSrc(absolutePath)
```

Configure `tauri.conf.json` to allow asset protocol access to the vault directory:

```json
{
  "security": {
    "assetProtocol": {
      "enable": true,
      "scope": ["$HOME/**"]
    }
  }
}
```

### Import flow — how an image enters the vault

```
User drags image onto editor / pastes from clipboard / clicks Insert Image
  → frontend receives File or file path
  → invoke("import_attachment", { source_path, note_id })
  → Rust copies file to vault/attachments/images/{date}-{filename}
  → Rust registers in attachments table
  → Rust returns { id, relative_path, absolute_path }
  → frontend inserts Tiptap image node with src = convertFileSrc(absolute_path)
  → on save, markdown serializer writes: ![](../attachments/images/{filename})
```

### Custom `ImageUpload` Tiptap extension

Extend the base `Image` extension to handle:

**1. Drag and drop onto the editor**
```typescript
addProseMirrorPlugins() {
  return [
    new Plugin({
      props: {
        handleDOMEvents: {
          drop(view, event) {
            const files = event.dataTransfer?.files
            if (!files?.length) return false
            const images = Array.from(files).filter(f => f.type.startsWith('image/'))
            if (!images.length) return false
            event.preventDefault()
            images.forEach(file => handleImageImport(file, view))
            return true
          }
        }
      }
    })
  ]
}
```

**2. Paste from clipboard**
Handle `paste` event — check `clipboardData.files` for images and `clipboardData.items` for image data pasted from other apps (screenshots).

**3. File picker via slash command or toolbar**
```typescript
async function pickImage() {
  const selected = await open({
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
    multiple: false
  })
  if (selected) await handleImageImport(selected as string)
}
```

**4. Image node rendering**
Render images with:
- Lazy loading (`loading="lazy"`)
- Click to select (shows bubble menu with resize/align/delete options)
- Resize handles on selected state (S = 25%, M = 50%, L = 75%, Full = 100% of editor width)
- Caption support (optional text below image, stored as Tiptap node attribute)

### Attachment Rust command — `import_attachment`

```rust
// src-tauri/src/commands/attachments.rs

#[tauri::command]
pub async fn import_attachment(
    source_path: String,
    note_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Attachment, AppError> {
    let source = PathBuf::from(&source_path);
    let ext = source.extension().unwrap_or_default().to_string_lossy();

    // Determine subfolder: images/ for image types, files/ for everything else
    let subfolder = match ext.as_ref() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => "images",
        _ => "files",
    };

    // Generate dated filename to avoid collisions
    let date = chrono::Local::now().format("%Y-%m-%d");
    let original_name = source.file_name().unwrap().to_string_lossy();
    let dest_name = format!("{}-{}", date, original_name);
    let dest_relative = format!("attachments/{}/{}", subfolder, dest_name);
    let dest_absolute = state.vault_path.join(&dest_relative);

    // Create dirs if needed, copy file
    std::fs::create_dir_all(dest_absolute.parent().unwrap())?;
    std::fs::copy(&source, &dest_absolute)?;

    // Register in DB
    let id = nanoid::nanoid!();
    let attachment = Attachment {
        id: id.clone(),
        file_path: dest_relative.clone(),
        file_name: dest_name,
        mime_type: mime_guess::from_path(&dest_absolute).first_raw().map(String::from),
        size_bytes: dest_absolute.metadata()?.len() as i64,
        note_id: note_id.clone(),
        created_at: chrono::Utc::now().timestamp(),
    };
    db::insert_attachment(&state.db, &attachment).await?;

    Ok(attachment)
}
```

### Supported file types for v1

**Images (inline in editor):**
- PNG, JPG/JPEG, GIF, WebP, SVG

**Files (linked, not inline — v1.5):**
- PDF — render as a linked card below the paragraph, not inline
- Do not support video, audio, or arbitrary binary files in v1

### Markdown serialization for images

When saving a note to disk, the Tiptap markdown serializer must convert image nodes back to standard markdown. Configure the serializer:

```typescript
// In the markdown serializer config
image: (state, node) => {
  const alt = node.attrs.alt || ''
  const src = node.attrs.src  // this is the absolute/asset path at runtime
  const relativePath = absoluteToRelative(src, vaultPath, notePath)
  state.write(`![${alt}](${relativePath})`)
  state.closeBlock(node)
}
```

`absoluteToRelative` converts the runtime asset URL back to a relative markdown path before saving.

---

## Code style rules

- **TypeScript strict mode on.** No `any`. Define types for all Tauri command inputs/outputs in `src/lib/tauri.ts`.
- **Rust:** use `thiserror` for error types. All Tauri commands return `Result<T, AppError>`.
- **No localStorage** for anything important. Zustand for UI state, SQLite for everything persistent.
- **Zustand store** holds the active note's in-memory content only. It is not a cache of the database.
- **All Tauri invoke calls** go through typed wrappers in `src/lib/tauri.ts`. Never call `invoke()` directly from components.
- Component files stay under 200 lines. Extract hooks and helpers early.

---

## Key decisions and why

| Decision | Why |
|---|---|
| Tauri not Electron | Bundle size matters for end users. Tauri ships ~5MB vs ~150MB. |
| .md files as canonical | User ownership, portability, longevity, trust. |
| SQLite not localStorage | localStorage is too flimsy for a serious metadata layer on desktop. |
| Nanoid for note IDs | Stable across renames. File paths change, IDs never do. |
| Debounced save not on-keypress | Prevents thrashing disk. 300ms feels instant to users. |
| Tiptap not CodeMirror | Tiptap is document-editor-first. Rich text, slash commands, bubble menus. |
| No Next.js | This is a desktop app. No server, no SSR, no routing framework needed. |
| Vite not CRA | Faster builds, native ESM, better Tauri integration. |
| Attachments in vault not DB | User owns their files. Vault is portable. DB is just an index. |
| Relative paths in markdown | Images resolve in any markdown editor, not just this app. |
| Tauri asset protocol not file:// | Security — Tauri's webview restricts arbitrary file:// access by default. |
| Fraunces + Lora for typography | Distinctive, warm editorial feel. Not generic Inter/Roboto. |
| Dated filenames on import | Avoids collisions when the same filename is imported multiple times. |
| CSS variables for theming | Themes are a data-attribute swap, not a re-render. Instant switching, no flash. |
| Tags inline in body not frontmatter | Matches Bear's model. Tags are visible in the prose, not hidden metadata. |
| Backlinks collapsible from bottom | Keeps the editor full-height by default. Backlinks are contextual, not always needed. |
| Typography settings as CSS vars | Live preview with zero re-renders — slider moves, editor updates instantly. |