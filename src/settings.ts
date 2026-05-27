import { App, PluginSettingTab, Setting } from "obsidian";
import ConflictManager from "./main";

export interface ConflictManagerSettings {
	conflictFilePattern: string;
}

export const DEFAULT_SETTINGS: ConflictManagerSettings = {
	conflictFilePattern: ''
}

export class ConflictManagerSettingTab extends PluginSettingTab {
	plugin: ConflictManager;

	constructor(app: App, plugin: ConflictManager) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Conflict file pattern')
			.setDesc('Write the text to search for file conflict (regex not supported)')
			.addText(text => text
				.setPlaceholder('Enter pattern')
				.setValue(this.plugin.settings.conflictFilePattern)
				.onChange(async (value) => {
					this.plugin.settings.conflictFilePattern = value;
                    await this.plugin.saveData(this.plugin.settings)
				}));
	}
}
