// @vitest-environment happy-dom
import './dom-helpers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTooltip } from 'obsidian';
import { ConflictManagerIndicator } from '../src/indicator';
import type ConflictManager from '../src/main';
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

const STAGES = ['hide', 'info', 'conflict', 'success'];

let settings: IConflictManagerSettings;
let findConflicts: ReturnType<typeof vi.fn<(pattern: string) => Promise<IConfigConflict[]>>>;
let activateHub: ReturnType<typeof vi.fn>;
let setting: { open: ReturnType<typeof vi.fn>; openTabById: ReturnType<typeof vi.fn> };
let statusBarEl: HTMLElement;
let indicator: ConflictManagerIndicator;

const setup = (paths: string[]) => {
  const { vault } = makeVault(paths);
  const plugin = {
    app: { vault, setting },
    manifest: { id: 'conflict-manager' },
    activateHub,
    addStatusBarItem: () => statusBarEl,
  } as unknown as ConflictManager;

  indicator = new ConflictManagerIndicator(plugin, settings, { findConflicts } as never);
};

const stage = () => STAGES.filter((name) => statusBarEl.classList.contains(name));
const tooltip = () => vi.mocked(setTooltip).mock.lastCall?.[1];
const clickSettled = async () => {
  statusBarEl.click();
  await Promise.resolve();
};

beforeEach(() => {
  vi.mocked(setTooltip).mockClear();
  settings = { ...DEFAULT_SETTINGS };
  findConflicts = vi.fn(async () => []);
  activateHub = vi.fn(async () => {});
  setting = { open: vi.fn(async () => {}), openTabById: vi.fn(async () => {}) };
  statusBarEl = createDiv();
  setup(['note.md', 'note (conflict).md', 'other.md', 'other (conflict).md', 'clean.md']);
});

describe('ConflictManagerIndicator stages', () => {
  it('marks the status bar item with its own class', () => {
    expect(statusBarEl.classList.contains('conflict-manager-indicator')).toBe(true);
  });

  it('counts originals, not copies', async () => {
    await indicator.update();

    expect(stage()).toEqual(['conflict']);
    expect(tooltip()).toBe('Conflict manager: 2 unresolved conflicts');
  });

  it('reports success when nothing matches', async () => {
    setup(['note.md', 'clean.md']);
    await indicator.update();

    expect(stage()).toEqual(['success']);
    expect(tooltip()).toBe('Conflict manager: no conflicts detected');
  });

  it('asks for a pattern when none is set', async () => {
    settings.conflictFilePattern = ' ';
    await indicator.update();

    expect(stage()).toEqual(['info']);
    expect(tooltip()).toBe('Conflict manager: pattern not set');
  });

  it('hides when turned off in the settings', async () => {
    settings.showStatusBarIndicator = false;
    await indicator.update();

    expect(stage()).toEqual(['hide']);
    expect(setTooltip).not.toHaveBeenCalled();
  });

  it('keeps one stage class across updates', async () => {
    await indicator.update();
    settings.conflictFilePattern = '';
    await indicator.update();

    expect(stage()).toEqual(['info']);
  });
});

describe('ConflictManagerIndicator config conflicts', () => {
  it('does not scan config files while the option is off', async () => {
    await indicator.update();

    expect(findConflicts).not.toHaveBeenCalled();
  });

  it('adds the config conflicts to the vault conflicts', async () => {
    settings.configConflicts = true;
    findConflicts.mockResolvedValue(conflicts(3));
    await indicator.update();

    expect(findConflicts).toHaveBeenCalledWith('conflict');
    expect(tooltip()).toBe('Conflict manager: 2 unresolved conflicts, 3 in config files');
  });

  it('shows a conflict for config files alone', async () => {
    setup(['clean.md']);
    settings.configConflicts = true;
    findConflicts.mockResolvedValue(conflicts(1));
    await indicator.update();

    expect(stage()).toEqual(['conflict']);
    expect(tooltip()).toBe('Conflict manager: 1 in config files');
  });

  it('still counts vault conflicts when the config scan fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    settings.configConflicts = true;
    findConflicts.mockRejectedValue(new Error('boom'));
    await indicator.update();

    expect(error).toHaveBeenCalled();
    expect(tooltip()).toBe('Conflict manager: 2 unresolved conflicts');
    error.mockRestore();
  });

  it('drops an older update that finishes after a newer one', async () => {
    const slow = deferred<IConfigConflict[]>();

    settings.configConflicts = true;
    findConflicts.mockReturnValueOnce(slow.promise).mockResolvedValueOnce([]);

    const older = indicator.update();
    await indicator.update();
    slow.resolve(conflicts(4));
    await older;

    expect(tooltip()).toBe('Conflict manager: 2 unresolved conflicts');
  });
});

describe('ConflictManagerIndicator click', () => {
  it('opens the hub when conflicts are shown', async () => {
    await indicator.update();
    await clickSettled();

    expect(activateHub).toHaveBeenCalledOnce();
  });

  it('opens the plugin settings when the pattern is missing', async () => {
    settings.conflictFilePattern = '';
    await indicator.update();
    await clickSettled();

    expect(setting.open).toHaveBeenCalledOnce();
    expect(setting.openTabById).toHaveBeenCalledWith('conflict-manager');
    expect(activateHub).not.toHaveBeenCalled();
  });

  it('does nothing when there are no conflicts', async () => {
    setup(['clean.md']);
    await indicator.update();
    await clickSettled();

    expect(activateHub).not.toHaveBeenCalled();
    expect(setting.open).not.toHaveBeenCalled();
  });
});
