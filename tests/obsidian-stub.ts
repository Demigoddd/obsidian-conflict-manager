export class TAbstractFile {}
export class TFile extends TAbstractFile {}
export class TFolder extends TAbstractFile {}
export class Events {}

export class Component {
  registeredEvents: unknown[] = [];

  registerEvent(ref: unknown) {
    this.registeredEvents.push(ref);
  }
}

// Mirrors the Obsidian layout: containerEl holds the header, then contentEl as children[1]
export class View extends Component {
  app: unknown;
  leaf: unknown;
  containerEl: HTMLElement;
  contentEl: HTMLElement;

  constructor(leaf: { app: unknown }) {
    super();
    this.leaf = leaf;
    this.app = leaf.app;
    this.containerEl = createDiv({ cls: 'workspace-leaf-content' });
    this.containerEl.createDiv({ cls: 'view-header' });
    this.contentEl = this.containerEl.createDiv({ cls: 'view-content' });
  }
}

export class ItemView extends View {}
export class FileView extends ItemView {}
export class EditableFileView extends FileView {}

export class Plugin extends Component {
  app: unknown;
  manifest: unknown;

  constructor(app: unknown, manifest: unknown) {
    super();
    this.app = app;
    this.manifest = manifest;
  }
}

export class Modal {
  app: unknown;

  constructor(app: unknown) {
    this.app = app;
  }
}

export class PluginSettingTab {}
export class Setting {}
export class ButtonComponent {}
export class Menu {}

export class Notice {
  static messages: string[] = [];

  constructor(message: unknown) {
    Notice.messages.push(String(message));
  }
}

export const setIcon = () => {};
export const setTooltip = () => {};

// Runs immediately, so tests do not wait for timers
export const debounce = <T extends unknown[]>(callback: (...args: T) => unknown) =>
  Object.assign((...args: T) => void callback(...args), { cancel: () => {}, run: () => {} });
