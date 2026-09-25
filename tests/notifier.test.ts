// @vitest-environment happy-dom
import './dom-helpers';
import { Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditableFileView, TFile } from 'obsidian';
import { ConflictManagerNotifier } from '../src/notifier';
import { DEFAULT_SETTINGS } from '../src/settings';
import { makeVault } from './fake-vault';

const makeFile = (path: string) => Object.assign(new TFile(), { path });

// Same layout as Obsidian: containerEl > header + contentEl (.view-content) > mode wrappers
const makeView = (type: string, wrappers: string[] = []) => {
  const containerEl = createDiv({ cls: 'workspace-leaf-content' });
  containerEl.createDiv({ cls: 'view-header' });
  const contentEl = containerEl.createDiv({ cls: 'view-content' });

  wrappers.forEach((cls) => contentEl.createDiv({ cls }));

  return { containerEl, contentEl, getViewType: () => type } as unknown as EditableFileView;
};

const banners = (view: EditableFileView) =>
  Array.from(view.containerEl.querySelectorAll<HTMLElement>('.conflict-manager-banner'));

const file = makeFile('note.md');
const copies = [makeFile('note (conflict 1).md'), makeFile('note (conflict 2).md')];

let onReview: Mock<(mainFile: TFile, conflictFiles: TFile[]) => void>;
let notifier: ConflictManagerNotifier;

beforeEach(() => {
  onReview = vi.fn();
  notifier = new ConflictManagerNotifier(onReview);
});

describe('ConflictManagerNotifier', () => {
  describe('markdown', () => {
    let view: EditableFileView;
    let source: HTMLElement;
    let reading: HTMLElement;

    beforeEach(() => {
      view = makeView('markdown', ['markdown-source-view', 'markdown-reading-view']);
      source = view.containerEl.querySelector('.markdown-source-view')!;
      reading = view.containerEl.querySelector('.markdown-reading-view')!;
      reading.hide();
    });

    it('puts a banner into both mode wrappers, including the hidden one', () => {
      notifier.createConflictBanner(view, file, copies);

      expect(banners(view)).toHaveLength(2);
      expect(source.firstElementChild!.classList.contains('conflict-manager-banner')).toBe(true);
      expect(reading.firstElementChild!.classList.contains('conflict-manager-banner')).toBe(true);
      expect(banners(view).map((el) => el.querySelector('.message')!.textContent)).toEqual([
        '2 unresolved conflicts in this file',
        '2 unresolved conflicts in this file',
      ]);
    });

    it('keeps a banner visible after switching to reading mode', () => {
      notifier.createConflictBanner(view, file, copies);

      source.hide();
      reading.show();

      const visible = banners(view).filter((el) => el.parentElement!.style.display !== 'none');
      expect(visible).toHaveLength(1);
      expect(visible[0]!.parentElement).toBe(reading);
    });

    it('replaces the banners instead of adding more', () => {
      notifier.createConflictBanner(view, file, copies);
      notifier.createConflictBanner(view, file, copies.slice(1));

      expect(banners(view)).toHaveLength(2);
      expect(banners(view)[0]!.querySelector('.message')!.textContent).toBe(
        '1 unresolved conflict in this file',
      );
    });

    it('removes the banners when no copies are left', () => {
      notifier.createConflictBanner(view, file, copies);
      notifier.createConflictBanner(view, file, []);

      expect(banners(view)).toHaveLength(0);
    });

    it('closes the banners of both modes with the close button', () => {
      notifier.createConflictBanner(view, file, copies);
      banners(view)[0]!.querySelectorAll<HTMLButtonElement>('.actions button')[1]!.click();

      expect(banners(view)).toHaveLength(0);
    });

    it('opens the review from either banner', () => {
      notifier.createConflictBanner(view, file, copies);
      banners(view)[1]!.querySelector<HTMLButtonElement>('.actions button')!.click();

      expect(onReview).toHaveBeenCalledWith(file, copies);
    });
  });

  it('uses the content element for canvas', () => {
    const view = makeView('canvas');

    notifier.createConflictBanner(view, file, copies);

    expect(banners(view)).toHaveLength(1);
    expect(banners(view)[0]!.parentElement).toBe(view.contentEl);
  });

  it('falls back to the content element for unknown view types', () => {
    const view = makeView('pdf');

    notifier.createConflictBanner(view, file, copies);

    expect(banners(view)).toHaveLength(1);
    expect(banners(view)[0]!.parentElement).toBe(view.contentEl);
  });

  it('falls back to the content element when the markdown wrappers are missing', () => {
    const view = makeView('markdown');

    notifier.createConflictBanner(view, file, copies);

    expect(banners(view)).toHaveLength(1);
    expect(banners(view)[0]!.parentElement).toBe(view.contentEl);
  });

  describe('checkAndNotifyConflicts', () => {
    const { file: vaultFile } = makeVault([
      'notes/note.md',
      'notes/note (conflict).md',
      'notes/note (conflict).canvas',
      'other/note (conflict 2).md',
    ]);

    it('banners the sibling copies with the same extension', () => {
      const view = makeView('pdf');

      notifier.checkAndNotifyConflicts(view, DEFAULT_SETTINGS, vaultFile('notes/note.md'));
      banners(view)[0]!.querySelector<HTMLButtonElement>('.actions button')!.click();

      expect(banners(view)[0]!.querySelector('.message')!.textContent).toBe(
        '1 unresolved conflict in this file',
      );
      expect(onReview).toHaveBeenCalledWith(vaultFile('notes/note.md'), [
        vaultFile('notes/note (conflict).md'),
      ]);
    });

    it('removes a stale banner once the copies are gone', () => {
      const view = makeView('pdf');

      notifier.createConflictBanner(view, file, copies);
      notifier.checkAndNotifyConflicts(
        view,
        { ...DEFAULT_SETTINGS, conflictFilePattern: 'sync-conflict' },
        vaultFile('notes/note.md'),
      );

      expect(banners(view)).toHaveLength(0);
    });
  });
});
