# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
