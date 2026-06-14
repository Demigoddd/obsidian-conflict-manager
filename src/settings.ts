import { App, PluginSettingTab, Setting, debounce } from 'obsidian';
import ConflictManager from './main';

export interface ConflictManagerSettings {
  conflictFilePattern: string;
  showStatusBarIndicator: boolean;
}

export const DEFAULT_SETTINGS: ConflictManagerSettings = {
  conflictFilePattern: 'conflict',
  showStatusBarIndicator: true,
};

export class ConflictManagerSettingTab extends PluginSettingTab {
  plugin: ConflictManager;
  private debouncedUpdate = debounce(() => this.plugin.indicator.update(), 500, true);
  private debouncedSave = debounce(
    async () => await this.plugin.saveData(this.plugin.settings),
    500,
    true,
  );

  constructor(app: App, plugin: ConflictManager) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Conflict file pattern')
      .setDesc(`Enter text to search for file conflicts (e.g: "conflict", regex: "not supported")`)
      .addText((text) =>
        text
          .setPlaceholder('Enter pattern')
          .setValue(this.plugin.settings.conflictFilePattern)
          .onChange(async (value) => {
            this.plugin.settings.conflictFilePattern = value.trim();
            this.debouncedSave();
            this.debouncedUpdate();
          }),
      );

    new Setting(containerEl)
      .setName('Show status bar indicator')
      .setDesc('Display status bar indicator when conflicts are detected')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showStatusBarIndicator).onChange(async (value) => {
          this.plugin.settings.showStatusBarIndicator = value;
          this.debouncedSave();
          this.debouncedUpdate();
        }),
      );
  }
}
