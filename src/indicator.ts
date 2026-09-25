import { Menu, setIcon, setTooltip } from 'obsidian';
import ConflictManager from './main';
import { CONFLICT_HUB_VIEW_ICON } from './hub';
import { IConflictManagerSettings } from './settings';
import { findOriginalFiles } from './utils';
import { ConfigMerger } from './utils/config-merge';

type ConflictManagerIndicatorStage = 'hide' | 'success' | 'conflict' | 'info';

export class ConflictManagerIndicator {
  plugin: ConflictManager;
  settings: IConflictManagerSettings;
  private configMerger: ConfigMerger;
  private indicatorEl!: HTMLElement;
  private stage: ConflictManagerIndicatorStage = 'hide';
  private scanId = 0;

  constructor(
    plugin: ConflictManager,
    settings: IConflictManagerSettings,
    configMerger: ConfigMerger,
  ) {
    this.plugin = plugin;
    this.settings = settings;
    this.configMerger = configMerger;
    this.indicatorEl = this.plugin.addStatusBarItem();
    this.initializeEvents();
  }

  async update() {
    // A newer update may start while the config scan is running; the older one is dropped
    const scanId = ++this.scanId;

    if (!this.indicatorEl) {
      this.stage = 'hide';
      return;
    }

    if (!this.settings.showStatusBarIndicator) {
      this.render('hide');
      return;
    }

    const pattern = this.settings.conflictFilePattern?.trim() ?? '';

    if (!pattern) {
      this.render('info', 'help-circle', 'Conflict manager: pattern not set');
      return;
    }

    const vaultCount = findOriginalFiles(this.plugin.app.vault, pattern).length;
    let configCount = 0;

    if (this.settings.configConflicts) {
      try {
        configCount = (await this.configMerger.findConflicts(pattern)).length;
      } catch (error) {
        console.error(error);
      }

      if (scanId !== this.scanId) return;
    }

    if (vaultCount + configCount === 0) {
      this.render('success', 'file-check', 'Conflict manager: no conflicts detected');
      return;
    }

    const parts: string[] = [];

    if (vaultCount > 0) parts.push(`${vaultCount} unresolved conflicts`);
    if (configCount > 0) parts.push(`${configCount} in config files`);

    this.render('conflict', 'alert-triangle', `Conflict manager: ${parts.join(', ')}`);
  }

  private render(stage: ConflictManagerIndicatorStage, icon?: string, tooltip?: string) {
    this.indicatorEl.empty();
    this.indicatorEl.removeClass('hide', 'info', 'conflict', 'success');
    this.indicatorEl.addClass(stage);
    this.stage = stage;

    if (icon) setIcon(this.indicatorEl, icon);
    if (tooltip) setTooltip(this.indicatorEl, tooltip, { delay: 300, placement: 'top' });
  }

  private initializeEvents() {
    this.indicatorEl.addClass('conflict-manager-indicator');
    this.indicatorEl.addEventListener('click', () => {
      if (this.stage === 'info') {
        void this.openSettingsTab();
      } else if (this.stage === 'conflict') {
        void this.plugin.activateHub();
      }
    });
    this.indicatorEl.addEventListener('contextmenu', (evt: MouseEvent) => {
      this.showContextMenu(evt);
    });
  }

  private showContextMenu(evt: MouseEvent) {
    evt.preventDefault();

    const menu = new Menu();

    menu.addItem((item) => {
      item.setTitle('Conflict ' + 'Manager').setDisabled(true);
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle('Open conflict hub')
        .setIcon(CONFLICT_HUB_VIEW_ICON)
        .onClick(() => void this.plugin.activateHub());
    });
    menu.addItem((item) => {
      item
        .setTitle('Settings')
        .setIcon('settings')
        .onClick(() => this.openSettingsTab());
    });
    menu.showAtMouseEvent(evt);
  }

  private async openSettingsTab() {
    const appWithSetting = this.plugin.app as {
      setting?: {
        open: () => Promise<void>;
        openTabById: (id: string) => Promise<void>;
      };
    };
    const setting = appWithSetting.setting;

    if (setting) {
      await setting.open();
      await setting.openTabById(this.plugin.manifest.id);
    }
  }
}
