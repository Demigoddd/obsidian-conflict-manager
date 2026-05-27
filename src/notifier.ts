import { MarkdownView, TFile, setIcon } from 'obsidian';
import { ConflictManagerSettings } from './settings';

export class ConflictManagerNotifier {
    private onReview: (mainFile: TFile, conflictFiles: TFile[]) => void;

    constructor(onReview: (mainFile: TFile, conflictFiles: TFile[]) => void) {
        this.onReview = onReview;
    }

    checkAndNotifyConflicts(view: MarkdownView, settings: ConflictManagerSettings, activeFile: TFile): void {
        const { basename, extension, parent } = activeFile;

        if (!parent || !settings.conflictFilePattern?.trim()) return void this.closeConflictBanner(view);

        /*
         * Generate a secure Regex with the user's word
         * Expect: OriginalName + Delimiter(space/dot/hyphen/bracket) + ... + UserPattern + ...
         *
         * | Services      | File name format                               |
         * | ------------- | ---------------------------------------------- |
         * | Obsidian Sync | file (Conflicted copy Device YYYYMMDDHHMM).md  |
         * | Dropbox       | file (conflicted copy YYYY-MM-DD HH MM SS).md  |
         * | Google Drive  | file (conflict - YYYY-MM-DD HH.MM.SS).md       |
         * | Syncthing     | file.sync-conflict-YYYYMMDD-HHMMSS-DEVICEID.md |
         * | Remotely Save | file.conflict.md                               |
         * | Obsidian Git  | conflicts within the file (<<<<<<< HEAD)       |
         * | iCloud Drive  | version selection dialog (no separate file)    |
         */
        const userPattern = this.escapeRegExp(settings.conflictFilePattern.trim());
        const escapedBasename = this.escapeRegExp(basename);
        const regexStr = `^${escapedBasename}[\\s\\.\\-\\(]+.*(?:${userPattern}).*$`;
        const conflictRegex = new RegExp(regexStr, 'i');

        // Filtering files in a folder
        const conflictFiles: TFile[] = parent.children.filter((child): child is TFile => {
            if (!(child instanceof TFile)) return false;
            if (child.extension !== extension) return false;
            if (child.path === activeFile.path) return false;
            return conflictRegex.test(child.basename);
        });

        this.createConflictBanner(view, activeFile, conflictFiles);
    }

    createConflictBanner(view: MarkdownView, activeFile: TFile, conflictFiles: TFile[]) {
        if (conflictFiles.length === 0) return void this.closeConflictBanner(view);

        // Create banner
        this.closeConflictBanner(view)
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
        const bannerMessage = banner.createDiv({ cls: 'message' });
        bannerMessage.createEl('strong', { text: `${conflictFiles.length} ` });
        bannerMessage.createEl('span', { text: `unresolved conflict${conflictFiles.length > 1 ? 's' : ''} in this note` });

        // Banner Actions
        const bannerActions = banner.createDiv({ cls: 'actions' });

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

    escapeRegExp(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
