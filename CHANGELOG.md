# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- New command "Merge conflicts in config files": finds conflict copies of Obsidian settings, plugin settings, themes and CSS snippets in `.obsidian` and merges them the same way Obsidian Sync does. You confirm the list first, and old versions go to trash.
- Merge button in the Conflict Hub with the number of settings files that have conflicts.
- "Config conflicts" setting to turn this on (off by default).

### Fixed

- A conflict copy now shows up only under its own note: `my-note (conflict)` belongs to `my-note`, not to `my`.

## [1.3.0] - 2026-09-23

### Added

- Conflict Hub: a side panel listing every file in the vault that still has conflict copies, with the number of copies per file. Click an entry to open the file; a refresh button re-scans the vault.
- The hub opens from a new ribbon icon, the new "Open conflict hub" command, or the status bar context menu.
- README now has "Setup" and "Commands" sections.

### Changed

- Clicking the status bar indicator opens the Conflict Hub instead of a global search.
- The hub refreshes together with the status bar when files are created, deleted, renamed, or when the conflict pattern changes.

### Fixed

- Conflict detection now ignores letter case in file extensions and original file paths.
- A file is no longer reported as its own original.

## [1.2.3] - 2026-09-14

### Fixed

- Banner issue

## [1.2.1] - 2026-09-14

### Changed

- The settings tab is laid out as a plain vertical list: the "Diff colors" heading and the two-column colour grid are gone, leaving the "Light theme" and "Dark theme" sections with their restore-defaults buttons.
- Build the conflict banner and the diff view with Obsidian's DOM helpers instead of `document.createElement`.

## [1.2.0] - 2026-09-14

### Added

- New command "Review conflicts of the active file" that opens the diff view for the current file, or shows a notice when no conflicts are found.
- Diff colors are now configurable in the settings: separate colors for deletions and additions in light and dark themes.
- Conflicts are now detected for more than markdown notes: base, canvas files also get the banner, the status bar count and the diff view.

### Fixed

- The status bar no longer counts a file as conflicted just because a same-named file in another folder has a conflict copy; the original is now resolved as an actual sibling file.

## [1.1.4] - 2026-06-27

### Fixed

- Fix indicator regex to support file names with spaces

## [1.1.2] - 2026-06-14

### Fixed

- Improve release workflow

## [1.1.0] - 2026-06-14

### Added

- Status bar indicator:
  - Showing: A status bar icon that displays the current number of conflicted files on hover.
  - Clicking: Triggers a global search of original files that have active conflicts.
  - Right-clicking: Opens the plugin settings directly.
  - New setting: Toggles the visibility of the status bar indicator.

## [1.0.11] - 2026-06-01

### Added

- Initial release of the Obsidian Conflict Manager plugin.
- Basic diff view and alert banner.
