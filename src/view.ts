import { ItemView, WorkspaceLeaf, TFile, setIcon, Notice } from 'obsidian';
import { UnifiedDiff } from './components/unified-diff';
import { DeleteConfirmModal } from './components/delete-confirm-modal';

export const CONFLICT_MANAGER_VIEW_TYPE = 'conflict-manager-view';

export class ConflictManagerView extends ItemView {
  private mainFile: TFile | null = null;
  private conflictFiles: TFile[] = [];
  private currentIdx: number = -1;
  private onConflictsUpdated: ((conflictFiles: TFile[]) => void) | null = null;
  private updateNavInfo: () => void;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.updateNavInfo = () => {};
  }

  getViewType() {
    return CONFLICT_MANAGER_VIEW_TYPE;
  }
  getDisplayText() {
    return 'Conflict ' + 'Manager';
  }

  setFiles(main: TFile, conflicts: TFile[], onUpdate?: (conflictFiles: TFile[]) => void) {
    this.mainFile = main;
    this.conflictFiles = conflicts;
    this.currentIdx = conflicts.length > 0 ? 0 : -1;
    this.onConflictsUpdated = onUpdate ?? null;

    this.updateNavInfo?.();
    void this.renderDiff();
  }

  async onOpen() {
    // Container init
    const container = this.contentEl;
    container.empty();
    container.addClass('conflict-manager-view');

    // Navigation
    const navigation = container.createDiv({ cls: 'navigation' });
    this.buildNav(navigation);

    // View
    container.createDiv({ cls: 'view' });
    await this.renderDiff();

    // Listening to changes in the main file for updating conflict file
    this.registerEvent(
      this.app.metadataCache.on(
        'changed',
        (file: TFile) => file === this.mainFile && void this.renderDiff(),
      ),
    );
  }

  async onClose() {
    this.contentEl.empty();
  }

  private buildNav(navigation: HTMLElement) {
    // Previous button
    const prev = navigation.createEl('button', { cls: 'previous-button' });
    setIcon(prev, 'chevron-left');
    prev.onclick = () => this.navigate(-1);

    // Info content
    const info = navigation.createDiv({ cls: 'info' });

    // Next button
    const nextButton = navigation.createEl('button', { cls: 'next-button' });
    setIcon(nextButton, 'chevron-right');
    nextButton.onclick = () => this.navigate(1);

    // Delete button
    const deleteButton = navigation.createEl('button', { cls: 'delete-button' });
    setIcon(deleteButton, 'trash-2');
    deleteButton.onclick = () => this.deleteCurrent();

    // Update
    this.updateNavInfo = () => {
      const total = this.conflictFiles.length;
      const name = this.conflictFiles[this.currentIdx]?.name ?? 'Unknown';
      info.setText(total ? `${this.currentIdx + 1}/${total} - ${name}` : 'No conflicts');
    };
    this.updateNavInfo();
  }

  private navigate(delta: number) {
    const newIdx = this.currentIdx + delta;

    if (newIdx < 0 || newIdx >= this.conflictFiles.length) return;

    this.currentIdx = newIdx;

    this.updateNavInfo?.();
    void this.renderDiff();
  }

  private async deleteCurrent() {
    const file = this.conflictFiles[this.currentIdx];

    if (!file) return;

    new DeleteConfirmModal(this.app, file.name, () => {
      void (async () => {
        try {
          await this.app.fileManager.trashFile(file);
          new Notice(`Conflict manager: moved ${file.name} to trash`);
        } catch {
          new Notice('Conflict manager: failed to move file to trash');
          return;
        }

        this.conflictFiles.splice(this.currentIdx, 1);
        this.onConflictsUpdated?.(this.conflictFiles);

        if (this.conflictFiles.length === 0) {
          this.containerEl.children[1]?.empty();
          this.containerEl.children[1]?.createEl('h4', {
            text: 'All conflicts resolved',
            cls: 'empty-text',
          });
          return;
        }

        if (this.currentIdx >= this.conflictFiles.length) {
          this.currentIdx = this.conflictFiles.length - 1;
        }

        this.updateNavInfo?.();
        void this.renderDiff();
      })();
    }).open();
  }

  private async renderDiff() {
    const container = this.containerEl.children[1];
    if (!container) return;

    const view = container.querySelector('.view') as HTMLElement;
    if (!view) return;
    view.empty();

    const conflictFile = this.conflictFiles[this.currentIdx];
    if (!this.mainFile || !conflictFile)
      return void view.createEl('h4', { text: 'No conflicts', cls: 'empty-text' });

    const [mainText, conflictText] = await Promise.all([
      this.app.vault.cachedRead(this.mainFile),
      this.app.vault.cachedRead(conflictFile),
    ]);

    UnifiedDiff.render(view, mainText, conflictText);
  }
}
