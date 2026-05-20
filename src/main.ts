import { Plugin, TFile, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, ConflictManagerSettings, ConflictManagerSettingTab } from './settings';
import { ConflictManagerView, CONFLICT_MANAGER_VIEW_TYPE } from './view';
import { ConflictManagerNotifier } from './notifier';

export default class ConflictManager extends Plugin {
    settings!: ConflictManagerSettings;
    notifier!: ConflictManagerNotifier;

	async onload() {
        // Setting
        this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData() as Partial<ConflictManagerSettings>) };
		this.addSettingTab(new ConflictManagerSettingTab(this.app, this));

        // Conflict notifier
        this.notifier = new ConflictManagerNotifier((mainFile, conflictFiles) => void this.activateView(mainFile, conflictFiles));
        this.registerEvent(
            this.app.workspace.on('file-open', (file: TFile | null) => {
                if (!file) return;
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) this.notifier.checkAndNotifyConflicts(this.settings, file, view);
            })
        );

        // Conflict view
        this.registerView(
            CONFLICT_MANAGER_VIEW_TYPE,
            (leaf) => new ConflictManagerView(leaf)
        );
	}

	onunload() {}

    async activateView(mainFile: TFile, conflictFiles: TFile[]) {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(CONFLICT_MANAGER_VIEW_TYPE);

        // If view already exists, use it
        // Otherwise, create a new tab in the main area
        leaf = leaves.length > 0 ? leaves[0]! : workspace.getLeaf('split');
        await leaf.setViewState({ type: CONFLICT_MANAGER_VIEW_TYPE, active: true });

        // Pass the files to the view via state
        await workspace.revealLeaf(leaf);
        (leaf.view as ConflictManagerView).setFiles(mainFile, conflictFiles);
    }
}
