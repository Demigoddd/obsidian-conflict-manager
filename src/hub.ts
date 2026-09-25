import { ItemView, WorkspaceLeaf, setIcon, setTooltip } from 'obsidian';
import { IConflictManagerSettings } from './settings';
import { findConflictFiles, findOriginalFiles } from './utils';
import { ConfigMerger } from './utils/config-merge';

export const CONFLICT_HUB_VIEW_TYPE = 'conflict-manager-hub';
export const CONFLICT_HUB_VIEW_ICON = 'git-compare';

export class ConflictHubView extends ItemView {
  private settings: IConflictManagerSettings;
  private configMerger: ConfigMerger;
  private onMergeConfig: () => void;
  private countEl!: HTMLElement;
  private listEl!: HTMLElement;
  private mergeButton!: HTMLElement;
  private mergeBadge!: HTMLElement;
  private configScanId = 0;

  constructor(
    leaf: WorkspaceLeaf,
    settings: IConflictManagerSettings,
    configMerger: ConfigMerger,
    onMergeConfig: () => void,
  ) {
    super(leaf);
    this.settings = settings;
    this.configMerger = configMerger;
    this.onMergeConfig = onMergeConfig;
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

    this.mergeButton = header.createEl('button', { cls: 'clickable-icon merge-button' });
    setIcon(this.mergeButton, 'folder-cog');
    this.mergeBadge = this.mergeButton.createSpan({ cls: 'merge-badge' });
    this.mergeBadge.hide();
    this.mergeButton.onclick = () => this.onMergeConfig();

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

    const pattern = this.settings.conflictFilePattern?.trim() ?? '';

    this.mergeButton.toggle(this.settings.configConflicts);
    if (this.settings.configConflicts) void this.updateConfigCount(pattern);

    this.listEl.empty();

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

  private async updateConfigCount(pattern: string) {
    const scanId = ++this.configScanId;
    let count = 0;

    try {
      count = (await this.configMerger.findConflicts(pattern)).length;
    } catch (error) {
      console.error(error);
    }

    if (scanId !== this.configScanId) return;

    this.mergeBadge.setText(String(count));
    this.mergeBadge.toggle(count > 0);
    setTooltip(
      this.mergeButton,
      count > 0 ? `Merge config conflicts (${count})` : 'No config conflicts',
      { delay: 300 },
    );
  }
}
