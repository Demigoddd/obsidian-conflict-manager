import { Menu, Notice, setIcon, setTooltip } from 'obsidian';
import ConflictManager from './main';
import { ConflictManagerSettings } from './settings';
import { escapeRegExp, findOriginalFiles } from './utils';

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
        this.triggerGlobalSearch();
      }
    });
    this.indicatorEl.addEventListener('contextmenu', (evt: MouseEvent) => {
      this.showContextMenu(evt);
    });
  }

  private triggerGlobalSearch() {
    try {
      const query = `path:/${this.getOriginalFilesQuery().source}/`;

      const appWithInternalPlugins = this.plugin.app as {
        internalPlugins?: {
          plugins?: Record<
            string,
            {
              instance?: {
                openGlobalSearch: (query: string) => void;
              };
            }
          >;
        };
        commands?: {
          executeCommandById: (id: string) => void;
        };
      };
      const globalSearchPlugin = appWithInternalPlugins.internalPlugins?.plugins?.['global-search'];

      if (globalSearchPlugin?.instance) {
        globalSearchPlugin.instance.openGlobalSearch(query);
      } else if (appWithInternalPlugins.commands?.executeCommandById) {
        appWithInternalPlugins.commands.executeCommandById('global-search:open');
      } else {
        new Notice('Conflict manager: global search is unavailable');
      }

      new Notice('Conflict manager: trigger global search for conflicts');
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Conflict manager: failed to open global search', err);
      new Notice('Conflict manager: failed to open global search automatically');
    }
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

  private getOriginalFilesQuery(): RegExp {
    const paths = [
      ...new Set(
        findOriginalFiles(this.plugin.app.vault, this.settings.conflictFilePattern ?? '').map(
          (file) => file.path,
        ),
      ),
    ];
    const escapedPaths = paths.map((path) => escapeRegExp(path).replace(/\//g, '\\/')).join('|');
    return new RegExp(`^(?:${escapedPaths})$`, 'i');
  }
}
