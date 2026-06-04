import { Plugin, TFile, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, ConflictManagerSettings, ConflictManagerSettingTab } from './settings';
import { ConflictManagerView, CONFLICT_MANAGER_VIEW_TYPE } from './view';
import { ConflictManagerNotifier } from './notifier';

export default class ConflictManager extends Plugin {
  settings!: ConflictManagerSettings;
  notifier!: ConflictManagerNotifier;

  async onload() {
    // Setting
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...((await this.loadData()) as Partial<ConflictManagerSettings>),
    };
    this.addSettingTab(new ConflictManagerSettingTab(this.app, this));

    // Conflict view
    this.registerView(CONFLICT_MANAGER_VIEW_TYPE, (leaf) => new ConflictManagerView(leaf));

    // Conflict notifier
    this.notifier = new ConflictManagerNotifier(
      (mainFile, conflictFiles) => void this.activateView(mainFile, conflictFiles),
    );
    this.registerEvent(
      this.app.workspace.on('file-open', (file: TFile | null) => {
        if (!file) return;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) this.notifier.checkAndNotifyConflicts(view, this.settings, file);
      }),
    );

    // On Ready
    this.app.workspace.onLayoutReady(() => {
      // Remove an existing conflict manager view
      const existingLeaves = this.app.workspace.getLeavesOfType(CONFLICT_MANAGER_VIEW_TYPE);
      existingLeaves.forEach((leaf) => leaf.detach());

      // Add banners to all open notes
      if (this.notifier) {
        this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
          const view = leaf.view as MarkdownView;
          const file = view.file;

          if (view && file && file instanceof TFile) {
            this.notifier.checkAndNotifyConflicts(view, this.settings, file);
          }
        });
      }
    });
  }

  onunload() {
    // Remove banners from all open notes
    if (this.notifier) {
      this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
        const view = leaf.view;

        if (view instanceof MarkdownView) {
          this.notifier.closeConflictBanner(view);
        }
      });
    }
  }

  async activateView(mainFile: TFile, conflictFiles: TFile[]) {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(CONFLICT_MANAGER_VIEW_TYPE);
    const markdownView = workspace.getActiveViewOfType(MarkdownView);

    // If view already exists, use it
    // Otherwise, create a new tab in the main area
    leaf = leaves.length > 0 ? leaves[0]! : workspace.getLeaf('split');
    await leaf.setViewState({ type: CONFLICT_MANAGER_VIEW_TYPE, active: true });

    // Pass the files to the view via state
    await workspace.revealLeaf(leaf);
    (leaf.view as ConflictManagerView).setFiles(mainFile, conflictFiles, (conflictFiles) => {
      if (markdownView) this.notifier.createConflictBanner(markdownView, mainFile, conflictFiles);
    });
  }
}
