import { ItemView, WorkspaceLeaf, TAbstractFile, TFile, setIcon, Notice } from 'obsidian';
import { UnifiedDiff } from './components/unified-diff';
import { DeleteConfirmModal } from './components/delete-confirm-modal';
import { IConflictManagerSettings } from './settings';

export const CONFLICT_MANAGER_VIEW_TYPE = 'conflict-manager-view';

export class ConflictManagerView extends ItemView {
  private settings: IConflictManagerSettings;
  private mainFile: TFile | null = null;
  private conflictFiles: TFile[] = [];
  private currentIdx: number = -1;
  private onConflictsUpdated: ((conflictFiles: TFile[]) => void) | null = null;
  private updateNavInfo: () => void;
  private viewEl: HTMLElement | null = null;
  private renderId = 0;

  constructor(leaf: WorkspaceLeaf, settings: IConflictManagerSettings) {
    super(leaf);
    this.settings = settings;
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
    // init
    const container = this.contentEl;
    container.empty();
    container.addClass('conflict-manager-view');
    this.applyColors();

    // Navigation
    const navigation = container.createDiv({ cls: 'navigation' });
    this.buildNav(navigation);

    // View
    this.viewEl = container.createDiv({ cls: 'view' });
    await this.renderDiff();

    // Re-render when either compared file changes; metadataCache reports markdown only
    this.registerEvent(
      this.app.vault.on('modify', (file: TAbstractFile) => {
        if (file === this.mainFile || file === this.conflictFiles[this.currentIdx]) {
          void this.renderDiff();
        }
      }),
    );
  }

  async onClose() {
    this.contentEl.empty();
    this.viewEl = null;
  }

  applyColors() {
    const { style } = this.contentEl;
    const { diffDeleteColorLight, diffInsertColorLight, diffDeleteColorDark, diffInsertColorDark } =
      this.settings;

    style.setProperty('--conflict-manager-delete-light', diffDeleteColorLight);
    style.setProperty('--conflict-manager-insert-light', diffInsertColorLight);
    style.setProperty('--conflict-manager-delete-dark', diffDeleteColorDark);
    style.setProperty('--conflict-manager-insert-dark', diffInsertColorDark);
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
      prev.disabled = total <= 1;
      nextButton.disabled = total <= 1;
      deleteButton.disabled = total === 0;
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

        if (this.currentIdx >= this.conflictFiles.length) {
          this.currentIdx = this.conflictFiles.length - 1;
        }

        this.updateNavInfo?.();
        void this.renderDiff('All conflicts resolved');
      })();
    }).open();
  }

  private async renderDiff(emptyText = 'No conflicts') {
    const renderId = ++this.renderId;
    const view = this.viewEl;

    if (!view) return;

    const conflictFile = this.conflictFiles[this.currentIdx];

    if (!this.mainFile || !conflictFile) {
      view.empty();
      view.createEl('h4', { text: emptyText, cls: 'empty-text' });
      return;
    }

    const [mainText, conflictText] = await Promise.all([
      this.app.vault.cachedRead(this.mainFile),
      this.app.vault.cachedRead(conflictFile),
    ]);

    if (renderId !== this.renderId) return;

    view.empty();
    UnifiedDiff.render(view, mainText, conflictText);
  }
}
