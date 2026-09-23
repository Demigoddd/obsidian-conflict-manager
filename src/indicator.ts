import { Menu, setIcon, setTooltip } from 'obsidian';
import ConflictManager from './main';
import { CONFLICT_HUB_VIEW_ICON } from './hub';
import { ConflictManagerSettings } from './settings';
import { findOriginalFiles } from './utils';

type ConflictManagerIndicatorStage = 'hide' | 'success' | 'conflict' | 'info';

export class ConflictManagerIndicator {
  plugin: ConflictManager;
  settings: ConflictManagerSettings;
  private indicatorEl!: HTMLElement;
  private stage: ConflictManagerIndicatorStage = 'hide';

  constructor(plugin: ConflictManager, settings: ConflictManagerSettings) {
    this.plugin = plugin;
    this.settings = settings;
    this.indicatorEl = this.plugin.addStatusBarItem();
    this.initializeEvents();
  }

  update() {
    if (!this.indicatorEl) {
      this.stage = 'hide';
      return;
    }

    this.indicatorEl.empty();
    this.indicatorEl.removeClass('hide', 'info', 'conflict', 'success');

    if (!this.settings.showStatusBarIndicator) {
      this.indicatorEl.addClass('hide');
      this.stage = 'hide';
      return;
    }

    if (!this.settings.conflictFilePattern?.trim()) {
      setIcon(this.indicatorEl, 'help-circle');
      setTooltip(this.indicatorEl, 'Conflict manager: pattern not set', {
        delay: 300,
        placement: 'top',
      });
      this.indicatorEl.addClass('info');
      this.stage = 'info';
      return;
    }

    const originalConflictFiles = findOriginalFiles(
      this.plugin.app.vault,
      this.settings.conflictFilePattern ?? '',
    );

    if (originalConflictFiles.length > 0) {
      setIcon(this.indicatorEl, 'alert-triangle');
      setTooltip(
        this.indicatorEl,
        `Conflict manager: ${originalConflictFiles.length} unresolved conflicts`,
        { delay: 300, placement: 'top' },
      );
      this.indicatorEl.addClass('conflict');
      this.stage = 'conflict';
    } else {
      setIcon(this.indicatorEl, 'file-check');
      setTooltip(this.indicatorEl, 'Conflict manager: no conflicts detected', {
        delay: 300,
        placement: 'top',
      });
      this.indicatorEl.addClass('success');
      this.stage = 'success';
    }
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
