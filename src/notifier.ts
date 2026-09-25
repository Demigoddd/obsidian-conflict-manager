import { EditableFileView, TFile, setIcon } from 'obsidian';
import { IConflictManagerSettings } from './settings';
import { findConflictFiles } from './utils';

// The element the banner is prepended to, per view type.
// Markdown keeps both mode wrappers mounted and hides the inactive one, so it lists both in order.
const BANNER_HOSTS: Record<string, string[]> = {
  markdown: ['.markdown-source-view', '.markdown-reading-view'],
  canvas: ['.view-content'],
  bases: ['.view-content'],
};

export class ConflictManagerNotifier {
  private onReview: (mainFile: TFile, conflictFiles: TFile[]) => void;

  constructor(onReview: (mainFile: TFile, conflictFiles: TFile[]) => void) {
    this.onReview = onReview;
  }

  checkAndNotifyConflicts(
    view: EditableFileView,
    settings: IConflictManagerSettings,
    activeFile: TFile,
  ): void {
    const conflictFiles = findConflictFiles(activeFile, settings.conflictFilePattern ?? '');
    this.createConflictBanner(view, activeFile, conflictFiles);
  }

  createConflictBanner(view: EditableFileView, activeFile: TFile, conflictFiles: TFile[]) {
    if (conflictFiles.length === 0) return void this.closeConflictBanner(view);

    this.closeConflictBanner(view);
    const banner = createDiv({ cls: 'conflict-manager-banner' });

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

    this.getBannerHost(view).prepend(banner);
    banner.animate(
      [
        { opacity: 0, transform: 'translateY(-8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 200, easing: 'ease-out', fill: 'forwards' },
    );
  }

  closeConflictBanner(view: EditableFileView) {
    view.containerEl.querySelectorAll('.conflict-manager-banner').forEach((el) => el.remove());
  }

  private getBannerHost(view: EditableFileView): HTMLElement {
    for (const selector of BANNER_HOSTS[view.getViewType()] ?? []) {
      const host = view.containerEl.querySelector<HTMLElement>(selector);

      if (host && host.style.display !== 'none') return host;
    }

    return view.contentEl;
  }
}
