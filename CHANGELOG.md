# Changelog

## v0.1.3 — 2026-04-24

### Fixed
- Creating a new note on Windows no longer shows a duplicate note entry in the list
- Notes with the same title now remain separate notes and can be edited independently
- Cursor position now restores predictably when switching between notes
- Writing at the end of a note no longer pins the caret to the bottom edge of the editor

### Improved
- Internal note path handling is now normalized across Windows and macOS
- Editor note switching feels more stable during fast navigation

## v0.1.2 — 2026-04-23

### Fixed
- Empty checklist items no longer reopen as malformed bullet text
- Intentional spaces and blank lines now persist when reopening notes
- Notes edited in external Markdown editors keep their spacing when reloaded
- New untitled notes now rename correctly from the first H1 without getting stuck on partial titles

### Improved
- Markdown save/load round-tripping is more faithful for whitespace-heavy notes
- Auto-renamed note filenames now stay readable and consistent on disk


