import { MarkdownView, TFile, setIcon } from 'obsidian';
import { ConflictManagerSettings } from './settings';

export class ConflictManagerNotifier {
    private onReview: (mainFile: TFile, conflictFiles: TFile[]) => void;

    constructor(onReview: (mainFile: TFile, conflictFiles: TFile[]) => void) {
        this.onReview = onReview;
    }

    checkAndNotifyConflicts(settings: ConflictManagerSettings, activeFile: TFile, view: MarkdownView): void {
        const { basename, extension, parent } = activeFile;

        if (!parent) return;

        const conflictFiles: TFile[] = parent.children.filter((child): child is TFile => {
            if (!(child instanceof TFile) || child.extension !== extension) return false;
            if (child.path === activeFile.path) return false;

            return (
                child.basename.startsWith(basename) &&
                child.basename.includes(settings.conflictFilePattern)
            );
        });

        // clear the current conflict banner
        this.closeConflictBanner(view);

        if (conflictFiles.length > 0) {
            this.createConflictBanner(view, activeFile, conflictFiles);
        }
    }

    createConflictBanner(view: MarkdownView, activeFile: TFile, conflictFiles: TFile[]) {
        // Create banner
        const banner = document.createElement('div');
        banner.addClass('conflict-manager-banner');
        banner.animate(
            [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }],
            {duration: 200, easing: 'ease-out', fill: 'forwards'}
        );

        // Set icon
        const icon = banner.createEl('span', { cls: 'icon' });
        setIcon(icon, 'alert-triangle');

        // Message container
        const bannerMessage = banner.createEl('div', { cls: 'message' });
        bannerMessage.createEl('strong', { text: `${conflictFiles.length} ` });
        bannerMessage.createEl('span', { text: `unresolved conflict${conflictFiles.length > 1 ? 's' : ''} in this note` });

        // Banner Actions
        const bannerActions = banner.createEl('div', { cls: 'actions' });

        // Review button
        const bannerReviewButton = bannerActions.createEl('button', { text: 'Review', cls: 'button' });
        bannerReviewButton.onclick = () => this.onReview(activeFile, conflictFiles);

        // Close button
        const bannerCloseButton = bannerActions.createEl('button', { cls: 'button' });
        setIcon(bannerCloseButton, 'x')
        bannerCloseButton.onclick = () => this.closeConflictBanner(view);

        // Insert the banner at the very top of the editor view
        view.contentEl.prepend(banner);
    }

    closeConflictBanner(view: MarkdownView) {
        view.contentEl.querySelector('.conflict-manager-banner')?.remove();
    }
}
