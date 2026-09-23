# Obsidian Conflict Manager

<img src=".github/media/presentation.gif" width="900" alt="presentation" />
A simple plugin for conflict resolution. No more hunting through your file system. Just open your file, hit Review, and Resolve.

## Features

- **Alert Banner:** A top banner alerts you that your current file contains unresolved sync conflicts.
- **Diff Viewer:** Review differences between the original file and conflict files using an intuitive split-pane layout.
- **Status Bar Indicator:** Quickly view the status of conflicts in the vault.
- **Conflict Hub:** A side panel listing every file in the vault that still has conflict copies, opened from the ribbon icon.

## Installation

1. Open **Settings > Community plugins** in Obsidian.
2. Find [Conflict Manager](https://community.obsidian.md/plugins/conflict-manager).
3. Select **Install**, then **Enable**.

## Setup

Everything in this plugin relies on the `conflict file pattern`. Open **Settings > Conflict Manager** and enter the word your sync service puts into the name of a conflict copy (default: `conflict`). It is literal text, not a regular expression. Without a pattern nothing is detected.

## Commands

Commands are available from the command palette (`Ctrl/Cmd + P`) and can be bound to a hotkey in **Settings > Hotkeys**.

| Command                                                   | What it does                                                                                              | Requires                            |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Conflict manager: Open conflict hub**                   | Opens the Conflict Hub panel with all unresolved conflicts in the vault. Same as the ribbon icon.         | Conflict file pattern               |
| **Conflict manager: Review conflicts of the active file** | Opens the diff viewer for the active file. If the file has no conflict copies, a notice is shown instead. | Conflict file pattern, an open file |

## FAQ

<details>
<summary>When copying and pasting multiple lines in Obsidian, an extra line break is inserted.</summary>

Go to **Settings > Editor > Convert pasted HTML to Markdown** and toggle it **off**.

</details>

## Releasing

1. Update the version in `manifest.json`, `package.json` and `versions.json`.
2. Commit the change:
   ```bash
   git commit -m "chore: prepare version <current_version>"
   git push origin main
   ```
3. Create and push the tag:
   ```bash
   git tag -a <current_version> -m "<current_version>"
   git push origin <current_version>
   ```
4. Wait for the release workflow to finish.
5. Open the **main page** of the repository and select **Releases** in the right sidebar.
6. Select **Edit** (pencil icon) next to the draft release.
7. Add release notes, then select **Publish**.

## Contributing

If you have any issues/suggestions, please open an issue on the repository.
If you'd like to contribute to the code, please fork the repository and submit a pull request.
