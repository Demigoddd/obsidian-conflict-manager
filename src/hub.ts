import { ItemView, Notice, TFile, WorkspaceLeaf, setIcon, setTooltip } from 'obsidian';
import { ConflictManagerSettings } from './settings';
import { findConflictFiles, findOriginalFiles } from './utils';

export const CONFLICT_HUB_VIEW_TYPE = 'conflict-manager-hub';
export const CONFLICT_HUB_VIEW_ICON = 'git-compare';

export class ConflictHubView extends ItemView {
  private settings: ConflictManagerSettings;
  private countEl!: HTMLElement;
  private listEl!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, settings: ConflictManagerSettings) {
    super(leaf);
    this.settings = settings;
  }

  getViewType() {
    return CONFLICT_HUB_VIEW_TYPE;
  }
  getDisplayText() {
    return 'Conflict hub';
  }
  getIcon() {
    return CONFLICT_HUB_VIEW_ICON;
  }

  async onOpen() {
    const container = this.contentEl;

    container.empty();
    container.addClass('conflict-manager-hub');

    // Header
    const header = container.createDiv({ cls: 'header' });
    this.countEl = header.createDiv({ cls: 'count' });

    const mergeButton = header.createEl('button', { cls: 'clickable-icon' });
    setIcon(mergeButton, 'folder-cog');
    setTooltip(mergeButton, 'Merge config conflicts', { delay: 300 });
    mergeButton.onclick = () => new Notice('Conflict manager: config merge is coming soon..');

    const refreshButton = header.createEl('button', { cls: 'clickable-icon' });
    setIcon(refreshButton, 'refresh-cw');
    setTooltip(refreshButton, 'Refresh', { delay: 300 });
    refreshButton.onclick = () => this.refresh();

    // List
    this.listEl = container.createDiv({ cls: 'list' });

    this.refresh();
  }

  async onClose() {
    this.contentEl.empty();
  }

  refresh() {
    if (!this.listEl) return;

    this.listEl.empty();

    const pattern = this.settings.conflictFilePattern?.trim() ?? '';

    if (!pattern) {
      this.countEl.setText('Pattern not set');
      this.listEl.createDiv({
        cls: 'empty-text',
        text: 'Set a conflict file pattern in the plugin settings',
      });
      return;
    }

    const originalFiles = findOriginalFiles(this.app.vault, pattern).sort((a, b) =>
      a.basename.localeCompare(b.basename),
    );

    this.countEl.setText(`${originalFiles.length} unresolved`);

    if (originalFiles.length === 0) {
      this.listEl.createDiv({ cls: 'empty-text', text: 'No conflicts detected' });
      return;
    }

    originalFiles.forEach((file) => {
      const count = findConflictFiles(file, pattern).length;
      const folder = file.parent?.path;

      const item = this.listEl.createDiv({ cls: 'item' });
      setIcon(item.createSpan({ cls: 'icon' }), 'file-warning');

      const text = item.createDiv({ cls: 'text' });
      text.createDiv({ cls: 'name', text: file.basename });
      if (folder) text.createDiv({ cls: 'path', text: folder });

      item.createSpan({ cls: 'badge', text: String(count) });
      setTooltip(item, file.path, { delay: 300 });
      item.onclick = () => void this.app.workspace.getLeaf(false).openFile(file);
    });
  }
}
