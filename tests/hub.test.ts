// @vitest-environment happy-dom
import { flush } from './dom-helpers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceLeaf, setTooltip } from 'obsidian';
import { ConflictHubView } from '../src/hub';
import { DEFAULT_SETTINGS, IConflictManagerSettings } from '../src/settings';
import { IConfigConflict } from '../src/utils/config-merge';
import { makeVault } from './fake-vault';

// Records tooltips, the stub drops them
vi.mock('obsidian', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setTooltip: vi.fn(),
}));

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));

  return { promise, resolve };
};

const conflicts = (count: number) => Array.from({ length: count }, () => ({}) as IConfigConflict);

const { vault, file } = makeVault([
  'notes/zeta.md',
  'notes/zeta (conflict 1).md',
  'notes/zeta (conflict 2).md',
  'alpha.md',
  'alpha.sync-conflict-20240101-000000-ABC.md',
  'clean.md',
]);

let settings: IConflictManagerSettings;
let findConflicts: ReturnType<typeof vi.fn<(pattern: string) => Promise<IConfigConflict[]>>>;
let onMergeConfig: ReturnType<typeof vi.fn<() => void>>;
let openFile: ReturnType<typeof vi.fn>;
let getLeaf: ReturnType<typeof vi.fn>;
let hub: ConflictHubView;

const query = <T extends HTMLElement = HTMLElement>(selector: string) =>
  hub.contentEl.querySelector<T>(selector)!;
const items = () =>
  Array.from(hub.contentEl.querySelectorAll<HTMLElement>('.list .item')).map((item) => [
    item.querySelector('.name')!.textContent,
    item.querySelector('.path')?.textContent ?? null,
    item.querySelector('.badge')!.textContent,
  ]);
const isVisible = (el: HTMLElement) => el.style.display !== 'none';

beforeEach(async () => {
  vi.mocked(setTooltip).mockClear();
  settings = { ...DEFAULT_SETTINGS };
  findConflicts = vi.fn(async () => []);
  onMergeConfig = vi.fn<() => void>();
  openFile = vi.fn(async () => {});
  getLeaf = vi.fn(() => ({ openFile }));
  hub = new ConflictHubView(
    { app: { vault, workspace: { getLeaf } } } as unknown as WorkspaceLeaf,
    settings,
    { findConflicts } as never,
    onMergeConfig,
  );

  await hub.onOpen();
});

describe('ConflictHubView list', () => {
  it('lists originals sorted by name with their folder and copy count', () => {
    expect(query('.count').textContent).toBe('2 unresolved');
    expect(items()).toEqual([
      ['alpha', '/', '1'],
      ['zeta', 'notes', '2'],
    ]);
  });

  it('opens the original on click', () => {
    hub.contentEl.querySelectorAll<HTMLElement>('.list .item')[1]!.click();

    expect(getLeaf).toHaveBeenCalledWith(false);
    expect(openFile).toHaveBeenCalledWith(file('notes/zeta.md'));
  });

  it('asks for a pattern when none is set', () => {
    settings.conflictFilePattern = '   ';
    hub.refresh();

    expect(query('.count').textContent).toBe('Pattern not set');
    expect(query('.list .empty-text').textContent).toBe(
      'Set a conflict file pattern in the plugin settings',
    );
    expect(items()).toEqual([]);
  });

  it('says so when nothing matches the pattern', () => {
    settings.conflictFilePattern = 'nothing-matches';
    hub.refresh();

    expect(query('.count').textContent).toBe('0 unresolved');
    expect(query('.list .empty-text').textContent).toBe('No conflicts detected');
  });

  it('rebuilds the list on the refresh button', () => {
    settings.conflictFilePattern = 'sync-conflict';
    hub.contentEl.querySelectorAll<HTMLButtonElement>('.header button')[1]!.click();

    expect(items()).toEqual([['alpha', '/', '1']]);
  });

  it('ignores a refresh before the view is opened', () => {
    const closed = new ConflictHubView(
      { app: { vault } } as unknown as WorkspaceLeaf,
      settings,
      { findConflicts } as never,
      onMergeConfig,
    );

    expect(() => closed.refresh()).not.toThrow();
  });
});

describe('ConflictHubView config merge button', () => {
  it('is hidden and does not scan while config conflicts are off', () => {
    expect(isVisible(query('.merge-button'))).toBe(false);
    expect(findConflicts).not.toHaveBeenCalled();
  });

  it('shows the number of config conflicts', async () => {
    findConflicts.mockResolvedValue(conflicts(3));
    settings.configConflicts = true;
    hub.refresh();
    await flush();

    expect(findConflicts).toHaveBeenCalledWith('conflict');
    expect(isVisible(query('.merge-button'))).toBe(true);
    expect(isVisible(query('.merge-badge'))).toBe(true);
    expect(query('.merge-badge').textContent).toBe('3');
    expect(setTooltip).toHaveBeenLastCalledWith(
      query('.merge-button'),
      'Merge config conflicts (3)',
      expect.anything(),
    );
  });

  it('hides the badge when there are no config conflicts', async () => {
    settings.configConflicts = true;
    hub.refresh();
    await flush();

    expect(isVisible(query('.merge-button'))).toBe(true);
    expect(isVisible(query('.merge-badge'))).toBe(false);
    expect(setTooltip).toHaveBeenLastCalledWith(
      query('.merge-button'),
      'No config conflicts',
      expect.anything(),
    );
  });

  it('hides the badge when the scan fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    findConflicts.mockRejectedValue(new Error('boom'));
    settings.configConflicts = true;
    hub.refresh();
    await flush();

    expect(error).toHaveBeenCalled();
    expect(isVisible(query('.merge-badge'))).toBe(false);
    error.mockRestore();
  });

  it('drops an older scan that finishes after a newer one', async () => {
    const slow = deferred<IConfigConflict[]>();

    findConflicts.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(conflicts(1));
    settings.configConflicts = true;
    hub.refresh();
    hub.refresh();
    await flush();
    slow.resolve(conflicts(5));
    await flush();

    expect(query('.merge-badge').textContent).toBe('1');
  });

  it('starts the merge on click', () => {
    settings.configConflicts = true;
    hub.refresh();
    query('.merge-button').click();

    expect(onMergeConfig).toHaveBeenCalledOnce();
  });
});
