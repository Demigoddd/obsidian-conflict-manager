import { EditableFileView, TFile, setIcon } from 'obsidian';
import { ConflictManagerSettings } from './settings';
import { findConflictFiles } from './utils';

export class ConflictManagerNotifier {
  private onReview: (mainFile: TFile, conflictFiles: TFile[]) => void;

  constructor(onReview: (mainFile: TFile, conflictFiles: TFile[]) => void) {
    this.onReview = onReview;
  }

  checkAndNotifyConflicts(
    view: EditableFileView,
    settings: ConflictManagerSettings,
    activeFile: TFile,
  ): void {
    const conflictFiles = findConflictFiles(activeFile, settings.conflictFilePattern ?? '');
    this.createConflictBanner(view, activeFile, conflictFiles);
  }

  createConflictBanner(view: EditableFileView, activeFile: TFile, conflictFiles: TFile[]) {
    if (conflictFiles.length === 0) return void this.closeConflictBanner(view);

    // Create banner at the very top of the editor view
    this.closeConflictBanner(view);
    const banner = view.contentEl.createDiv({ cls: 'conflict-manager-banner' });
    banner.animate(
      [
        { opacity: 0, transform: 'translateY(-8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 200, easing: 'ease-out', fill: 'forwards' },
    );

    // Set icon
    const icon = banner.createSpan({ cls: 'icon' });
    setIcon(icon, 'alert-triangle');

    // Message container
    const bannerMessage = banner.createDiv({ cls: 'message' });
    bannerMessage.createEl('strong', { text: `${conflictFiles.length} ` });
    bannerMessage.createSpan({
      text: `unresolved conflict${conflictFiles.length > 1 ? 's' : ''} in this file`,
    });

    // Banner Actions
    const bannerActions = banner.createDiv({ cls: 'actions' });

    // Review button
    const bannerReviewButton = bannerActions.createEl('button', { text: 'Review', cls: 'button' });
    bannerReviewButton.onclick = () => this.onReview(activeFile, conflictFiles);

    // Close button
    const bannerCloseButton = bannerActions.createEl('button', { cls: 'button' });
    setIcon(bannerCloseButton, 'x');
    bannerCloseButton.onclick = () => this.closeConflictBanner(view);

    view.contentEl.prepend(banner);
  }

  closeConflictBanner(view: EditableFileView) {
    view.contentEl.querySelector('.conflict-manager-banner')?.remove();
  }
}
