// @vitest-environment happy-dom
import { flush } from './dom-helpers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import { ConflictManagerView } from '../src/view';
import { DEFAULT_SETTINGS, IConflictManagerSettings } from '../src/settings';
// Same module as 'obsidian' at runtime, imported directly for the recorded messages
import { Notice } from './obsidian-stub';

// Confirms right away instead of rendering Obsidian's modal
vi.mock('../src/components/delete-confirm-modal', () => ({
  DeleteConfirmModal: class {
    constructor(
      _app: unknown,
      _fileName: string,
      private onConfirm: () => void,
    ) {}

    open() {
      this.onConfirm();
    }
  },
}));

type Listener = (file: TAbstractFile) => void;

const makeFile = (path: string) =>
  Object.assign(new TFile(), { path, name: path.slice(path.lastIndexOf('/') + 1) });

const deferred = () => {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => (resolve = done));

  return { promise, resolve };
};

const main = makeFile('note.md');
const copyB = makeFile('note (conflict b).md');
const copyC = makeFile('note (conflict c).md');

let contents: Map<TFile, string>;
let listeners: Map<string, Listener[]>;
let settings: IConflictManagerSettings;
let vault: {
  cachedRead: ReturnType<typeof vi.fn<(file: TFile) => Promise<string>>>;
  on: (name: string, callback: Listener) => unknown;
};
let fileManager: { trashFile: ReturnType<typeof vi.fn<(file: TFile) => Promise<void>>> };
let view: ConflictManagerView;

const trigger = (name: string, file: TAbstractFile) =>
  listeners.get(name)?.forEach((callback) => callback(file));
const query = <T extends HTMLElement = HTMLElement>(selector: string) =>
  view.contentEl.querySelector<T>(selector);
const rowTexts = () =>
  Array.from(view.contentEl.querySelectorAll('.view .row .body')).map((el) => el.textContent);
const click = (selector: string) => query(selector)!.click();

beforeEach(async () => {
  contents = new Map([
    [main, 'a\n'],
    [copyB, 'b\n'],
    [copyC, 'c\n'],
  ]);
  listeners = new Map();
  settings = { ...DEFAULT_SETTINGS };
  vault = {
    cachedRead: vi.fn(async (file: TFile) => contents.get(file) ?? ''),
    on: (name, callback) => {
      listeners.set(name, [...(listeners.get(name) ?? []), callback]);
      return { name };
    },
  };
  fileManager = { trashFile: vi.fn(async () => {}) };
  view = new ConflictManagerView(
    { app: { vault, fileManager, metadataCache: { on: () => ({}) } } } as unknown as WorkspaceLeaf,
    settings,
  );

  await view.onOpen();
});

describe('ConflictManagerView deleting', () => {
  it('keeps the navigation after the last copy is deleted', async () => {
    const onUpdate = vi.fn();

    view.setFiles(main, [copyB], onUpdate);
    await flush();
    click('.delete-button');
    await flush();

    expect(fileManager.trashFile).toHaveBeenCalledWith(copyB);
    expect(onUpdate).toHaveBeenCalledWith([]);
    expect(query('.navigation')).not.toBeNull();
    expect(query('.navigation .info')!.textContent).toBe('No conflicts');
    expect(query<HTMLButtonElement>('.delete-button')!.disabled).toBe(true);
    expect(query('.view')!.textContent).toBe('All conflicts resolved');
  });

  it('renders the next review in the same view after all copies were deleted', async () => {
    const other = makeFile('other.md');
    const otherCopy = makeFile('other (conflict).md');

    contents.set(other, 'x\n');
    contents.set(otherCopy, 'y\n');
    view.setFiles(main, [copyB]);
    await flush();
    click('.delete-button');
    await flush();

    view.setFiles(other, [otherCopy]);
    await flush();

    expect(query('.navigation .info')!.textContent).toBe('1/1 - other (conflict).md');
    expect(query<HTMLButtonElement>('.delete-button')!.disabled).toBe(false);
    expect(rowTexts()).toEqual(['x', 'y']);
  });

  it('moves to the previous copy when the last one in the list is deleted', async () => {
    view.setFiles(main, [copyB, copyC]);
    click('.next-button');
    await flush();
    click('.delete-button');
    await flush();

    expect(query('.navigation .info')!.textContent).toBe('1/1 - note (conflict b).md');
    expect(rowTexts()).toEqual(['a', 'b']);
  });

  it('keeps the copy when moving it to the trash fails', async () => {
    const onUpdate = vi.fn();

    Notice.messages = [];
    fileManager.trashFile.mockRejectedValue(new Error('locked'));
    view.setFiles(main, [copyB, copyC], onUpdate);
    await flush();
    click('.delete-button');
    await flush();

    expect(onUpdate).not.toHaveBeenCalled();
    expect(Notice.messages).toEqual(['Conflict manager: failed to move file to trash']);
    expect(query('.navigation .info')!.textContent).toBe('1/2 - note (conflict b).md');
  });

  it('confirms the move and shows the next copy', async () => {
    const onUpdate = vi.fn();

    Notice.messages = [];
    view.setFiles(main, [copyB, copyC], onUpdate);
    await flush();
    click('.delete-button');
    await flush();

    expect(onUpdate).toHaveBeenCalledWith([copyC]);
    expect(Notice.messages).toEqual(['Conflict manager: moved note (conflict b).md to trash']);
    expect(query('.navigation .info')!.textContent).toBe('1/1 - note (conflict c).md');
    expect(rowTexts()).toEqual(['a', 'c']);
  });
});

describe('ConflictManagerView navigation', () => {
  const buttons = () =>
    ['.previous-button', '.next-button', '.delete-button'].map(
      (selector) => query<HTMLButtonElement>(selector)!.disabled,
    );

  it('shows an empty view before any files are set', () => {
    expect(query('.navigation .info')!.textContent).toBe('No conflicts');
    expect(query('.view')!.textContent).toBe('No conflicts');
    expect(buttons()).toEqual([true, true, true]);
  });

  it('disables paging for a single copy', async () => {
    view.setFiles(main, [copyB]);
    await flush();

    expect(buttons()).toEqual([true, true, false]);
    expect(query('.navigation .info')!.textContent).toBe('1/1 - note (conflict b).md');
  });

  it('pages through the copies and stops at both ends', async () => {
    view.setFiles(main, [copyB, copyC]);
    await flush();

    click('.previous-button');
    await flush();
    expect(query('.navigation .info')!.textContent).toBe('1/2 - note (conflict b).md');

    click('.next-button');
    await flush();
    expect(query('.navigation .info')!.textContent).toBe('2/2 - note (conflict c).md');
    expect(rowTexts()).toEqual(['a', 'c']);

    click('.next-button');
    await flush();
    expect(query('.navigation .info')!.textContent).toBe('2/2 - note (conflict c).md');

    click('.previous-button');
    await flush();
    expect(query('.navigation .info')!.textContent).toBe('1/2 - note (conflict b).md');
    expect(rowTexts()).toEqual(['a', 'b']);
  });

  it('starts at the first copy when new files are set', async () => {
    view.setFiles(main, [copyB, copyC]);
    click('.next-button');
    await flush();

    view.setFiles(main, [copyC, copyB]);
    await flush();

    expect(query('.navigation .info')!.textContent).toBe('1/2 - note (conflict c).md');
  });
});

describe('ConflictManagerView rendering', () => {
  it('drops an older render that finishes after a newer one', async () => {
    const readB = deferred();
    const readC = deferred();

    vault.cachedRead.mockImplementation(async (file) => {
      if (file === copyB) return readB.promise;
      if (file === copyC) return readC.promise;
      return contents.get(file) ?? '';
    });

    view.setFiles(main, [copyB, copyC]);
    click('.next-button');
    readC.resolve('c\n');
    await flush();
    readB.resolve('b\n');
    await flush();

    expect(rowTexts()).toEqual(['a', 'c']);
  });

  it('shows one diff when overlapping renders finish in order', async () => {
    const readB = deferred();
    const readC = deferred();

    vault.cachedRead.mockImplementation(async (file) => {
      if (file === copyB) return readB.promise;
      if (file === copyC) return readC.promise;
      return contents.get(file) ?? '';
    });

    view.setFiles(main, [copyB, copyC]);
    click('.next-button');
    readB.resolve('b\n');
    await flush();
    readC.resolve('c\n');
    await flush();

    expect(rowTexts()).toEqual(['a', 'c']);
  });

  it('re-renders when the main file is modified', async () => {
    view.setFiles(main, [copyB]);
    await flush();

    contents.set(main, 'x\n');
    trigger('modify', main);
    await flush();

    expect(rowTexts()).toEqual(['x', 'b']);
  });

  it('re-renders when the shown copy is modified', async () => {
    view.setFiles(main, [copyB]);
    await flush();

    contents.set(copyB, 'z\n');
    trigger('modify', copyB);
    await flush();

    expect(rowTexts()).toEqual(['a', 'z']);
  });

  it('ignores changes to other files, including copies not shown', async () => {
    view.setFiles(main, [copyB, copyC]);
    await flush();
    vault.cachedRead.mockClear();

    trigger('modify', copyC);
    trigger('modify', makeFile('unrelated.md'));
    await flush();

    expect(vault.cachedRead).not.toHaveBeenCalled();
    expect(rowTexts()).toEqual(['a', 'b']);
  });
});

describe('ConflictManagerView colors', () => {
  const colorOf = (el: HTMLElement, name: string) => el.style.getPropertyValue(name);

  it('sets the diff colors on the view, not on the body', () => {
    expect(colorOf(view.contentEl, '--conflict-manager-delete-light')).toBe(
      DEFAULT_SETTINGS.diffDeleteColorLight,
    );
    expect(colorOf(view.contentEl, '--conflict-manager-insert-light')).toBe(
      DEFAULT_SETTINGS.diffInsertColorLight,
    );
    expect(colorOf(view.contentEl, '--conflict-manager-delete-dark')).toBe(
      DEFAULT_SETTINGS.diffDeleteColorDark,
    );
    expect(colorOf(view.contentEl, '--conflict-manager-insert-dark')).toBe(
      DEFAULT_SETTINGS.diffInsertColorDark,
    );
    expect(colorOf(document.body, '--conflict-manager-delete-light')).toBe('');
  });

  it('applies changed settings', () => {
    settings.diffDeleteColorLight = '#123456';
    view.applyColors();

    expect(colorOf(view.contentEl, '--conflict-manager-delete-light')).toBe('#123456');
  });
});
