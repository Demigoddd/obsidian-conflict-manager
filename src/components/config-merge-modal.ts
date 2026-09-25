import { App, ButtonComponent, Modal, Notice, setTooltip } from 'obsidian';
import { IConfigMergePlan, ConfigMerger } from '../utils/config-merge';

type ConfigSection = 'Settings' | 'Plugins' | 'Themes' | 'Snippets';

const SECTIONS: ConfigSection[] = ['Settings', 'Plugins', 'Themes', 'Snippets'];

export class ConfigMergeModal extends Modal {
  private plans: IConfigMergePlan[];
  private selectable: IConfigMergePlan[];
  private selected: Set<IConfigMergePlan>;
  private checkboxes = new Map<IConfigMergePlan, HTMLInputElement>();
  private selectAllEl?: HTMLInputElement;
  private selectedCountEl?: HTMLElement;
  private cancelButton?: ButtonComponent;
  private mergeButton?: ButtonComponent;
  private configMerger: ConfigMerger;
  private closed = false;

  constructor(app: App, configMerger: ConfigMerger, plans: IConfigMergePlan[]) {
    super(app);
    this.configMerger = configMerger;
    this.plans = plans;
    this.selectable = plans.filter((plan) => plan.content !== null);
    this.selected = new Set(this.selectable);
  }

  onOpen() {
    const { contentEl } = this;

    this.closed = false;

    // Header
    this.setTitle('Merge config conflicts');
    this.modalEl.addClass('conflict-manager-config-modal');
    contentEl.createEl('p', {
      cls: 'description',
      text: 'Originals are replaced with the merged result. Old versions go to trash.',
    });

    if (this.selectable.length > 1) {
      const row = contentEl.createEl('label', { cls: 'row select-all' });

      this.selectAllEl = row.createEl('input', { type: 'checkbox' });
      this.selectAllEl.onchange = () =>
        this.setSelection(this.selectable, this.selectAllEl?.checked ?? false);
      row.createDiv({ cls: 'info' }).createSpan({ cls: 'name', text: 'Select all' });
      this.selectedCountEl = row.createSpan({ cls: 'meta' });
    }

    // Body
    const listEl = contentEl.createDiv({ cls: 'config-list' });
    const sections = SECTIONS.filter((section) =>
      this.plans.some((plan) => this.sectionOf(plan) === section),
    );

    for (const section of sections) {
      // A single section needs no heading
      if (sections.length > 1) listEl.createDiv({ cls: 'section', text: section });

      this.plans
        .filter((plan) => this.sectionOf(plan) === section)
        .forEach((plan) => this.renderPlan(listEl, plan));
    }

    // Footer
    const footer = contentEl.createDiv({ cls: 'footer' });
    this.cancelButton = new ButtonComponent(footer)
      .setButtonText('Cancel')
      .onClick(() => this.close());
    this.mergeButton = new ButtonComponent(footer)
      .setButtonText('Merge')
      .setCta()
      .onClick(() => {
        this.lockControls();
        void this.merge();
      });

    this.updateControls();
  }

  onClose() {
    this.closed = true;
    this.contentEl.empty();
  }

  // Disabled checkboxes fire no change events, so nothing can re-enable Merge mid-merge
  private lockControls() {
    for (const checkbox of this.checkboxes.values()) checkbox.disabled = true;
    if (this.selectAllEl) this.selectAllEl.disabled = true;
    this.cancelButton?.setDisabled(true);
    this.mergeButton?.setDisabled(true);
  }

  private renderPlan(parent: HTMLElement, plan: IConfigMergePlan) {
    const disabled = plan.content === null;
    const copies = plan.conflictPaths.length;
    const row = parent.createEl('label', { cls: disabled ? 'row is-disabled' : 'row' });
    const checkbox = row.createEl('input', { type: 'checkbox' });
    const info = row.createDiv({ cls: 'info' });
    const name = info.createSpan({ cls: 'name', text: this.displayName(plan) });

    for (const path of plan.conflictPaths) {
      const copyName = path.slice(path.lastIndexOf('/') + 1);
      setTooltip(info.createSpan({ cls: 'copy', text: copyName }), copyName, { delay: 300 });
    }

    checkbox.disabled = disabled;
    checkbox.onchange = () => this.setSelection([plan], checkbox.checked);
    this.checkboxes.set(plan, checkbox);
    row.createSpan({
      cls: 'meta',
      text: disabled
        ? plan.summary
        : `${copies} ${copies === 1 ? 'copy' : 'copies'} · ${plan.summary}`,
    });
    setTooltip(name, plan.originalPath, { delay: 300 });
  }

  private setSelection(plans: IConfigMergePlan[], value: boolean) {
    for (const plan of plans) {
      if (value) this.selected.add(plan);
      else this.selected.delete(plan);
    }

    this.updateControls();
  }

  private updateControls() {
    const count = this.selected.size;
    const total = this.selectable.length;

    for (const [plan, checkbox] of this.checkboxes) checkbox.checked = this.selected.has(plan);

    if (this.selectAllEl) {
      this.selectAllEl.checked = count === total;
      this.selectAllEl.indeterminate = count > 0 && count < total;
    }

    this.selectedCountEl?.setText(`${count} of ${total}`);
    this.mergeButton?.setDisabled(count === 0);
  }

  private relativePath(plan: IConfigMergePlan): string {
    return plan.originalPath.slice(this.app.vault.configDir.length + 1);
  }

  private sectionOf(plan: IConfigMergePlan): ConfigSection {
    const path = this.relativePath(plan);
    if (path.startsWith('plugins/')) return 'Plugins';
    if (path.startsWith('themes/')) return 'Themes';
    if (path.startsWith('snippets/')) return 'Snippets';
    return 'Settings';
  }

  // The section heading already names the folder, so it is dropped from the item name
  private displayName(plan: IConfigMergePlan): string {
    return this.relativePath(plan).replace(/^(plugins|themes|snippets)\//, '');
  }

  private async merge() {
    let merged = 0;

    for (const plan of [...this.selected]) {
      try {
        const applied = await this.configMerger.apply(plan);

        if (applied.content !== null) merged++;
        else new Notice(`Conflict manager: skipped ${plan.originalPath}, ${applied.summary}`);
      } catch (error) {
        console.error(error);
        new Notice(`Conflict manager: failed to merge ${plan.originalPath}`);
      }
    }

    // Closed via Escape or the close button while merging: the prompt would render unseen
    if (this.closed) {
      if (merged > 0) this.showReloadNotice(merged);
      return;
    }

    if (merged === 0) {
      this.close();
      return;
    }

    this.showReloadPrompt(merged);
  }

  private showReloadNotice(merged: number) {
    new Notice(
      createFragment((fragment) => {
        fragment.appendText(
          `Conflict manager: merged ${merged} ${merged === 1 ? 'file' : 'files'}.\n Reload Obsidian to apply the changes.`,
        );
        fragment
          .createEl('button', { cls: 'conflict-manager-reload-button', text: 'Reload' })
          .addEventListener('click', () => this.reloadApp());
      }),
      0,
    );
  }

  // Obsidian and running plugins keep their settings in memory, so a reload is needed
  private showReloadPrompt(merged: number) {
    const { contentEl } = this;

    contentEl.empty();
    this.setTitle(`Merged ${merged} ${merged === 1 ? 'file' : 'files'}`);
    contentEl.createEl('p', {
      cls: 'description',
      text: 'Reload Obsidian to apply the changes, otherwise running plugins may overwrite them.',
    });

    const footer = contentEl.createDiv({ cls: 'footer' });

    new ButtonComponent(footer).setButtonText('Later').onClick(() => this.close());
    new ButtonComponent(footer)
      .setButtonText('Reload')
      .setCta()
      .onClick(() => this.reloadApp());
  }

  private reloadApp() {
    const appWithCommands = this.app as {
      commands?: { executeCommandById: (id: string) => boolean };
    };

    appWithCommands.commands?.executeCommandById('app:reload');
  }
}
