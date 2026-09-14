import { App, ColorComponent, PluginSettingTab, Setting, debounce } from 'obsidian';
import ConflictManager from './main';

export interface ConflictManagerSettings {
  conflictFilePattern: string;
  showStatusBarIndicator: boolean;
  diffDeleteColorLight: string;
  diffInsertColorLight: string;
  diffDeleteColorDark: string;
  diffInsertColorDark: string;
}

// Colors match the Obsidian defaults of --color-red / --color-green per theme
export const DEFAULT_SETTINGS: ConflictManagerSettings = {
  conflictFilePattern: 'conflict',
  showStatusBarIndicator: true,
  diffDeleteColorLight: '#e93147',
  diffInsertColorLight: '#08b94e',
  diffDeleteColorDark: '#fb464c',
  diffInsertColorDark: '#44cf6e',
};

type ColorSetting =
  | 'diffDeleteColorLight'
  | 'diffInsertColorLight'
  | 'diffDeleteColorDark'
  | 'diffInsertColorDark';

export class ConflictManagerSettingTab extends PluginSettingTab {
  plugin: ConflictManager;
  private colorPickers = new Map<ColorSetting, ColorComponent>();
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
    this.colorPickers.clear();

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

    this.addThemeColors(containerEl, 'Light theme', 'diffDeleteColorLight', 'diffInsertColorLight');
    this.addThemeColors(containerEl, 'Dark theme', 'diffDeleteColorDark', 'diffInsertColorDark');
  }

  private addThemeColors(
    parent: HTMLElement,
    name: string,
    deleteKey: ColorSetting,
    insertKey: ColorSetting,
  ): void {
    new Setting(parent)
      .setName(name)
      .setHeading()
      .addExtraButton((button) =>
        button
          .setIcon('rotate-ccw')
          .setTooltip('Restore default colors')
          .onClick(() => {
            this.resetColor(deleteKey);
            this.resetColor(insertKey);
            this.plugin.refreshDiffColors();
            this.debouncedSave();
          }),
      );

    this.addColorSetting(parent, 'Deletions', deleteKey);
    this.addColorSetting(parent, 'Additions', insertKey);
  }

  private addColorSetting(parent: HTMLElement, name: string, key: ColorSetting): void {
    new Setting(parent).setName(name).addColorPicker((picker) => {
      this.colorPickers.set(key, picker);

      picker.setValue(this.plugin.settings[key]).onChange((value) => {
        this.plugin.settings[key] = value;
        this.plugin.refreshDiffColors();
        this.debouncedSave();
      });
    });
  }

  private resetColor(key: ColorSetting): void {
    const value = DEFAULT_SETTINGS[key];

    this.plugin.settings[key] = value;
    this.colorPickers.get(key)?.setValue(value);
  }
}
