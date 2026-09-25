import {
  Plugin,
  TFile,
  EditableFileView,
  Events,
  FileView,
  WorkspaceLeaf,
  Notice,
  debounce,
} from 'obsidian';
import { DEFAULT_SETTINGS, IConflictManagerSettings, ConflictManagerSettingTab } from './settings';
import { ConflictManagerView, CONFLICT_MANAGER_VIEW_TYPE } from './view';
import { ConflictHubView, CONFLICT_HUB_VIEW_TYPE, CONFLICT_HUB_VIEW_ICON } from './hub';
import { ConflictManagerNotifier } from './notifier';
import { ConflictManagerIndicator } from './indicator';
import { findConflictFiles } from './utils';
import { IConfigMergePlan, ConfigMerger } from './utils/config-merge';
import { ConfigMergeModal } from './components/config-merge-modal';

export default class ConflictManager extends Plugin {
  settings!: IConflictManagerSettings;
  notifier!: ConflictManagerNotifier;
  indicator!: ConflictManagerIndicator;
  private configMerger = new ConfigMerger(this.app);
  private debouncedIndicatorUpdate = debounce(() => this.refreshIndicators(), 500, true);

  async onload() {
    // Setting
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...((await this.loadData()) as Partial<IConflictManagerSettings>),
    };
    this.addSettingTab(new ConflictManagerSettingTab(this.app, this));

    // Setup StatusBar
    this.indicator = new ConflictManagerIndicator(this, this.settings);
    this.registerEvent(this.app.vault.on('create', () => this.debouncedIndicatorUpdate()));
    this.registerEvent(this.app.vault.on('delete', () => this.debouncedIndicatorUpdate()));
    this.registerEvent(this.app.vault.on('rename', () => this.debouncedIndicatorUpdate()));

    // Config files are not indexed, only the undocumented "raw" event reports their changes
    this.registerEvent(
      (this.app.vault as Events).on('raw', (path: unknown) => {
        if (
          this.settings.configConflicts &&
          typeof path === 'string' &&
          ConfigMerger.isConflictPath(
            path,
            this.app.vault.configDir,
            this.settings.conflictFilePattern,
          )
        )
          this.debouncedIndicatorUpdate();
      }),
    );

    // Conflict view
    this.registerView(
      CONFLICT_MANAGER_VIEW_TYPE,
      (leaf) => new ConflictManagerView(leaf, this.settings),
    );

    // Conflict hub
    this.registerView(
      CONFLICT_HUB_VIEW_TYPE,
      (leaf) =>
        new ConflictHubView(
          leaf,
          this.settings,
          this.configMerger,
          () => void this.mergeConfigConflicts(),
        ),
    );
    this.addRibbonIcon(CONFLICT_HUB_VIEW_ICON, 'Conflict hub', () => void this.activateHub());

    // Commands
    this.addCommand({
      id: 'review-conflicts',
      name: 'Review conflicts of the active file',
      checkCallback: (checking: boolean) => {
        const fileView = this.app.workspace.getActiveViewOfType(EditableFileView);
        const file = fileView?.file;

        if (!fileView || !file) return false;
        if (checking) return true;

        const conflictFiles = findConflictFiles(file, this.settings.conflictFilePattern);

        if (conflictFiles.length === 0) {
          new Notice('Conflict manager: no conflicts found for this file');
          return true;
        }

        void this.activateView(file, conflictFiles);
        return true;
      },
    });
    this.addCommand({
      id: 'open-conflict-hub',
      name: 'Open conflict hub',
      callback: () => void this.activateHub(),
    });
    this.addCommand({
      id: 'merge-config-conflicts',
      name: 'Merge conflicts in config files',
      checkCallback: (checking: boolean) => {
        if (!this.settings.configConflicts) return false;
        if (!checking) void this.mergeConfigConflicts();
        return true;
      },
    });

    // Conflict notifier
    this.notifier = new ConflictManagerNotifier(
      (mainFile, conflictFiles) => void this.activateView(mainFile, conflictFiles),
    );
    this.registerEvent(
      this.app.workspace.on('file-open', (file: TFile | null) => {
        if (!file) return;
        const fileView = this.app.workspace.getActiveViewOfType(EditableFileView);
        if (fileView) this.notifier.checkAndNotifyConflicts(fileView, this.settings, file);
      }),
    );

    // On Ready
    this.app.workspace.onLayoutReady(() => {
      // Remove an existing conflict manager view
      const existingLeaves = this.app.workspace.getLeavesOfType(CONFLICT_MANAGER_VIEW_TYPE);
      existingLeaves.forEach((leaf) => leaf.detach());

      // Update status bar indicator and hub
      this.refreshIndicators();

      // Add banners to all open files
      if (this.notifier) {
        this.app.workspace.iterateAllLeaves((leaf) => {
          const view = leaf.view;

          if (view instanceof EditableFileView && view.file instanceof TFile) {
            this.notifier.checkAndNotifyConflicts(view, this.settings, view.file);
          }
        });
      }
    });
  }

  onunload() {
    // Remove banners from all open files
    if (this.notifier) {
      this.app.workspace.iterateAllLeaves((leaf) => {
        const view = leaf.view;

        if (view instanceof FileView) {
          this.notifier.closeConflictBanner(view);
        }
      });
    }
  }

  refreshIndicators() {
    this.indicator.update();
    this.app.workspace
      .getLeavesOfType(CONFLICT_HUB_VIEW_TYPE)
      .forEach((leaf) => (leaf.view as ConflictHubView).refresh());
  }

  async activateHub() {
    const { workspace } = this.app;
    const leaf =
      workspace.getLeavesOfType(CONFLICT_HUB_VIEW_TYPE)[0] ?? workspace.getRightLeaf(false);

    if (!leaf) return;

    await leaf.setViewState({ type: CONFLICT_HUB_VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
    (leaf.view as ConflictHubView).refresh();
  }

  async mergeConfigConflicts() {
    let plans: IConfigMergePlan[];

    try {
      const conflicts = await this.configMerger.findConflicts(this.settings.conflictFilePattern);

      plans = await Promise.all(conflicts.map((conflict) => this.configMerger.plan(conflict)));
    } catch (error) {
      console.error(error);
      new Notice('Conflict manager: failed to scan config files');
      return;
    }

    if (plans.length === 0) {
      new Notice('Conflict manager: no conflicts found in config files');
      return;
    }

    new ConfigMergeModal(this.app, this.configMerger, plans).open();
  }

  refreshDiffColors() {
    this.app.workspace
      .getLeavesOfType(CONFLICT_MANAGER_VIEW_TYPE)
      .forEach((leaf) => (leaf.view as ConflictManagerView).applyColors());
  }

  async activateView(mainFile: TFile, conflictFiles: TFile[]) {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(CONFLICT_MANAGER_VIEW_TYPE);
    const fileView = this.app.workspace.getActiveViewOfType(EditableFileView);

    // If view already exists, use it
    // Otherwise, create a new tab in the main area
    leaf = leaves.length > 0 ? leaves[0]! : workspace.getLeaf('split');
    await leaf.setViewState({ type: CONFLICT_MANAGER_VIEW_TYPE, active: true });

    // Pass the files to the view via state
    await workspace.revealLeaf(leaf);
    (leaf.view as ConflictManagerView).setFiles(mainFile, conflictFiles, (conflictFiles) => {
      if (fileView) this.notifier.createConflictBanner(fileView, mainFile, conflictFiles);
    });
  }
}
