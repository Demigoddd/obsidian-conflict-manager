import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, EditableFileView, FileView, PluginManifest, TFile } from 'obsidian';
import ConflictManager from '../src/main';
import { ConflictHubView, CONFLICT_HUB_VIEW_TYPE } from '../src/hub';
import { ConflictManagerView, CONFLICT_MANAGER_VIEW_TYPE } from '../src/view';
import { DEFAULT_SETTINGS } from '../src/settings';
import { makeVault } from './fake-vault';
// Same module as 'obsidian' at runtime, imported directly for the recorded messages
import { Notice } from './obsidian-stub';

// The indicator, notifier and merge modal need the DOM, so they are replaced by recorders
const mocks = vi.hoisted(() => ({
  update: vi.fn(async () => {}),
  checkAndNotifyConflicts: vi.fn<(view: unknown, settings: unknown, file: unknown) => void>(),
  closeConflictBanner: vi.fn(),
  modalOpen: vi.fn(),
  modalPlans: [] as unknown[],
}));

vi.mock('../src/indicator', () => ({
  ConflictManagerIndicator: class {
    update = mocks.update;
  },
}));

vi.mock('../src/notifier', () => ({
  ConflictManagerNotifier: class {
    checkAndNotifyConflicts = mocks.checkAndNotifyConflicts;
    closeConflictBanner = mocks.closeConflictBanner;
  },
}));

vi.mock('../src/components/config-merge-modal', () => ({
  ConfigMergeModal: class {
    constructor(_app: unknown, _merger: unknown, plans: unknown[]) {
      mocks.modalPlans = plans;
    }

    open = mocks.modalOpen;
  },
}));

interface IFakeLeaf {
  view: object;
  setViewState?: () => Promise<void>;
}

// Real views need a leaf and the DOM; these tests only need instanceof to hold
const fakeView = <T extends object>(
  cls: abstract new (...args: never[]) => T,
  props: Partial<T> = {},
): T => Object.assign(Object.create(cls.prototype as object) as T, props);

// What a leaf of a background tab holds until it is shown
const deferredView = (type: string) => ({ getViewType: () => type });

const makeFile = (path: string) => Object.assign(new TFile(), { path });

const makePlugin = (workspace: object) => {
  const plugin = new ConflictManager(
    { workspace, vault: {} } as unknown as App,
    {} as PluginManifest,
  );
  const update = vi.fn(async () => {});
  const createConflictBanner = vi.fn();

  Object.assign(plugin, { indicator: { update }, notifier: { createConflictBanner } });

  return { plugin, update, createConflictBanner };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('refreshIndicators', () => {
  it('skips a deferred hub and refreshes the loaded ones', () => {
    const refresh = vi.spyOn(ConflictHubView.prototype, 'refresh').mockImplementation(() => {});
    const loaded = fakeView(ConflictHubView);
    const { plugin, update } = makePlugin({
      getLeavesOfType: () => [{ view: deferredView(CONFLICT_HUB_VIEW_TYPE) }, { view: loaded }],
    });

    expect(() => plugin.refreshIndicators()).not.toThrow();
    expect(update).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(refresh.mock.contexts[0]).toBe(loaded);
  });
});

describe('refreshDiffColors', () => {
  it('skips a deferred diff view', () => {
    const applyColors = vi
      .spyOn(ConflictManagerView.prototype, 'applyColors')
      .mockImplementation(() => {});
    const loaded = fakeView(ConflictManagerView);
    const { plugin } = makePlugin({
      getLeavesOfType: () => [{ view: deferredView(CONFLICT_MANAGER_VIEW_TYPE) }, { view: loaded }],
    });

    expect(() => plugin.refreshDiffColors()).not.toThrow();
    expect(applyColors).toHaveBeenCalledOnce();
    expect(applyColors.mock.contexts[0]).toBe(loaded);
  });
});

describe('activateHub', () => {
  const setup = (loads: boolean) => {
    const refresh = vi.spyOn(ConflictHubView.prototype, 'refresh').mockImplementation(() => {});
    const leaf: IFakeLeaf = { view: deferredView(CONFLICT_HUB_VIEW_TYPE) };

    leaf.setViewState = async () => {
      if (loads) leaf.view = fakeView(ConflictHubView);
    };

    const { plugin } = makePlugin({
      getLeavesOfType: () => [leaf],
      revealLeaf: async () => {},
    });

    return { plugin, refresh, leaf };
  };

  it('refreshes the hub once it is loaded', async () => {
    const { plugin, refresh, leaf } = setup(true);

    await plugin.activateHub();

    expect(refresh).toHaveBeenCalledOnce();
    expect(refresh.mock.contexts[0]).toBe(leaf.view);
  });

  it('does not throw when the hub is still deferred', async () => {
    const { plugin, refresh } = setup(false);

    await expect(plugin.activateHub()).resolves.toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('activateView', () => {
  const main = makeFile('note.md');
  const other = makeFile('other.md');
  const copy = makeFile('note (conflict).md');

  const setup = (diffView: object = fakeView(ConflictManagerView)) => {
    let onUpdate: ((conflictFiles: TFile[]) => void) | undefined;
    const setFiles = vi
      .spyOn(ConflictManagerView.prototype, 'setFiles')
      .mockImplementation((_main, _conflicts, callback) => {
        onUpdate = callback;
      });
    const opener = fakeView(EditableFileView, { file: main });
    const secondPane = fakeView(EditableFileView, { file: main });
    const unrelated = fakeView(EditableFileView, { file: other });
    const diffLeaf: IFakeLeaf = { view: diffView, setViewState: async () => {} };
    const leaves: IFakeLeaf[] = [{ view: opener }, { view: secondPane }, { view: unrelated }];
    const { plugin, createConflictBanner } = makePlugin({
      getLeavesOfType: () => [diffLeaf],
      getActiveViewOfType: () => opener,
      revealLeaf: async () => {},
      iterateAllLeaves: (callback: (leaf: IFakeLeaf) => void) =>
        [...leaves, diffLeaf].forEach(callback),
    });

    return {
      plugin,
      setFiles,
      createConflictBanner,
      opener,
      secondPane,
      update: (files: TFile[]) => onUpdate!(files),
    };
  };

  it('passes the files to the diff view', async () => {
    const { plugin, setFiles } = setup();

    await plugin.activateView(main, [copy]);

    expect(setFiles).toHaveBeenCalledWith(main, [copy], expect.any(Function));
  });

  it('updates the banner in every pane that shows the file', async () => {
    const { plugin, createConflictBanner, opener, secondPane, update } = setup();

    await plugin.activateView(main, [copy]);
    update([]);

    expect(createConflictBanner).toHaveBeenCalledTimes(2);
    expect(createConflictBanner.mock.calls.map(([view]) => view as unknown)).toEqual([
      opener,
      secondPane,
    ]);
    expect(createConflictBanner).toHaveBeenCalledWith(opener, main, []);
  });

  it('skips the pane that opened the review once it shows another file', async () => {
    const { plugin, createConflictBanner, opener, secondPane, update } = setup();

    await plugin.activateView(main, [copy]);
    opener.file = other;
    update([]);

    expect(createConflictBanner).toHaveBeenCalledOnce();
    expect(createConflictBanner.mock.calls[0]![0]).toBe(secondPane);
    expect(createConflictBanner.mock.calls[0]![1]).toBe(main);
  });

  it('does nothing when the diff view is still deferred', async () => {
    const { plugin, setFiles } = setup(deferredView(CONFLICT_MANAGER_VIEW_TYPE));

    await expect(plugin.activateView(main, [copy])).resolves.toBeUndefined();
    expect(setFiles).not.toHaveBeenCalled();
  });
});

// onload wiring: vault and workspace events, commands and the layout-ready pass
interface ICommand {
  id: string;
  callback?: () => void;
  checkCallback?: (checking: boolean) => boolean;
}

type Handler = (...args: unknown[]) => void;

const { vault: files, file } = makeVault([
  'note.md',
  'note (conflict).md',
  'clean.md',
  'other.md',
  'other (conflict).md',
]);

let handlers: Map<string, Handler[]>;
let commands: Map<string, ICommand>;
let layoutReady: () => void;
let activeView: EditableFileView | null;
let leaves: { view: object; detach?: () => void }[];
let conflictLeaves: { view: object; detach: ReturnType<typeof vi.fn> }[];
let plugin: ConflictManager;

const on = (name: string, callback: Handler) => {
  handlers.set(name, [...(handlers.get(name) ?? []), callback]);
  return { name };
};
const trigger = (name: string, ...args: unknown[]) =>
  handlers.get(name)?.forEach((callback) => callback(...args));
const command = (id: string) => commands.get(id)!;

const load = async (data: object | null = null) => {
  const app = {
    vault: { on, configDir: '.obsidian', getFiles: () => files.getFiles() },
    workspace: {
      on,
      onLayoutReady: (callback: () => void) => (layoutReady = callback),
      getActiveViewOfType: () => activeView,
      getLeavesOfType: (type: string) =>
        type === CONFLICT_MANAGER_VIEW_TYPE ? conflictLeaves : [],
      iterateAllLeaves: (callback: (leaf: object) => void) => leaves.forEach(callback),
    },
  };

  plugin = new ConflictManager(app as unknown as App, { id: 'conflict-manager' } as PluginManifest);
  Object.assign(plugin, {
    loadData: async () => data,
    addSettingTab: () => {},
    registerView: () => {},
    addRibbonIcon: () => {},
    addCommand: (item: ICommand) => commands.set(item.id, item),
  });

  await plugin.onload();
};

const reset = async () => {
  vi.clearAllMocks();
  Notice.messages = [];
  handlers = new Map();
  commands = new Map();
  activeView = null;
  leaves = [];
  conflictLeaves = [];

  await load();
};

describe('onload', () => {
  beforeEach(reset);

  describe('settings', () => {
    it('fills missing keys with the defaults', async () => {
      await load({ conflictFilePattern: 'sync', configConflicts: true });

      expect(plugin.settings).toEqual({
        ...DEFAULT_SETTINGS,
        conflictFilePattern: 'sync',
        configConflicts: true,
      });
    });

    it('uses the defaults without saved data', () => {
      expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('vault events', () => {
    it.each(['create', 'delete', 'rename'])('refreshes the indicator on %s', (name) => {
      trigger(name, file('note.md'));

      expect(mocks.update).toHaveBeenCalledOnce();
    });

    describe('raw', () => {
      beforeEach(() => {
        plugin.settings.configConflicts = true;
      });

      it('refreshes for a config conflict copy', () => {
        trigger('raw', '.obsidian/app (conflict).json');
        trigger('raw', '.obsidian/plugins/foo/data.sync-conflict-20240101-000000-ABC.json');

        expect(mocks.update).toHaveBeenCalledTimes(2);
      });

      it('ignores the constant workspace writes and vault files', () => {
        trigger('raw', '.obsidian/workspace.json');
        trigger('raw', '.obsidian/app.json');
        trigger('raw', 'note (conflict).md');

        expect(mocks.update).not.toHaveBeenCalled();
      });

      it('ignores the pattern in the folder of this plugin', () => {
        plugin.settings.conflictFilePattern = 'conflict-manager';
        trigger('raw', '.obsidian/plugins/conflict-manager/data.json');

        expect(mocks.update).not.toHaveBeenCalled();
      });

      it('ignores anything that is not a path', () => {
        trigger('raw', undefined);
        trigger('raw', { path: '.obsidian/app (conflict).json' });

        expect(mocks.update).not.toHaveBeenCalled();
      });

      it('does nothing while config conflicts are off', () => {
        plugin.settings.configConflicts = false;
        trigger('raw', '.obsidian/app (conflict).json');

        expect(mocks.update).not.toHaveBeenCalled();
      });
    });
  });

  describe('file-open', () => {
    it('checks the opened file for conflicts', () => {
      activeView = fakeView(EditableFileView, { file: file('note.md') });
      trigger('file-open', file('note.md'));

      expect(mocks.checkAndNotifyConflicts).toHaveBeenCalledWith(
        activeView,
        plugin.settings,
        file('note.md'),
      );
    });

    it('ignores a closed file and views that cannot hold a banner', () => {
      trigger('file-open', null);
      trigger('file-open', file('note.md'));

      expect(mocks.checkAndNotifyConflicts).not.toHaveBeenCalled();
    });
  });

  describe('onLayoutReady', () => {
    it('detaches restored diff views, refreshes and banners every open file', () => {
      const detach = vi.fn();
      const noteView = fakeView(EditableFileView, { file: file('note.md') });
      const otherView = fakeView(EditableFileView, { file: file('other.md') });

      conflictLeaves = [{ view: {}, detach }];
      leaves = [
        { view: noteView },
        { view: fakeView(EditableFileView, { file: null }) },
        { view: {} },
        { view: otherView },
      ];
      layoutReady();

      expect(detach).toHaveBeenCalledOnce();
      expect(mocks.update).toHaveBeenCalledOnce();
      expect(
        mocks.checkAndNotifyConflicts.mock.calls.map(([view, , target]) => [view, target]),
      ).toEqual([
        [noteView, file('note.md')],
        [otherView, file('other.md')],
      ]);
    });
  });

  describe('onunload', () => {
    it('removes the banners from every file view', () => {
      const noteView = fakeView(FileView);

      leaves = [{ view: noteView }, { view: {} }];
      plugin.onunload();

      expect(mocks.closeConflictBanner).toHaveBeenCalledOnce();
      expect(mocks.closeConflictBanner).toHaveBeenCalledWith(noteView);
    });
  });

  describe('review-conflicts command', () => {
    it('is unavailable without an open file', () => {
      expect(command('review-conflicts').checkCallback!(true)).toBe(false);

      activeView = fakeView(EditableFileView, { file: null });
      expect(command('review-conflicts').checkCallback!(true)).toBe(false);
    });

    it('opens the review with the copies of the active file', () => {
      const activateView = vi.spyOn(plugin, 'activateView').mockResolvedValue();

      activeView = fakeView(EditableFileView, { file: file('note.md') });

      expect(command('review-conflicts').checkCallback!(true)).toBe(true);
      expect(activateView).not.toHaveBeenCalled();

      command('review-conflicts').checkCallback!(false);

      expect(activateView).toHaveBeenCalledWith(file('note.md'), [file('note (conflict).md')]);
    });

    it('tells when the active file has no copies', () => {
      const activateView = vi.spyOn(plugin, 'activateView').mockResolvedValue();

      activeView = fakeView(EditableFileView, { file: file('clean.md') });
      command('review-conflicts').checkCallback!(false);

      expect(activateView).not.toHaveBeenCalled();
      expect(Notice.messages).toEqual(['Conflict manager: no conflicts found for this file']);
    });
  });

  describe('merge-config-conflicts command', () => {
    it('is unavailable while config conflicts are off', () => {
      expect(command('merge-config-conflicts').checkCallback!(true)).toBe(false);
    });

    it('starts the merge only when run', () => {
      const merge = vi.spyOn(plugin, 'mergeConfigConflicts').mockResolvedValue();

      plugin.settings.configConflicts = true;

      expect(command('merge-config-conflicts').checkCallback!(true)).toBe(true);
      expect(merge).not.toHaveBeenCalled();

      command('merge-config-conflicts').checkCallback!(false);

      expect(merge).toHaveBeenCalledOnce();
    });
  });
});

describe('mergeConfigConflicts', () => {
  beforeEach(reset);

  const useMerger = (merger: object) => Object.assign(plugin, { configMerger: merger });

  it('opens the modal with a plan per conflict', async () => {
    const conflicts = [{ originalPath: 'a' }, { originalPath: 'b' }];
    const findConflicts = vi.fn(async () => conflicts);

    useMerger({ findConflicts, plan: async (conflict: object) => ({ conflict }) });
    plugin.settings.conflictFilePattern = 'sync';
    await plugin.mergeConfigConflicts();

    expect(findConflicts).toHaveBeenCalledWith('sync');
    expect(mocks.modalPlans).toEqual([{ conflict: conflicts[0] }, { conflict: conflicts[1] }]);
    expect(mocks.modalOpen).toHaveBeenCalledOnce();
  });

  it('tells when there is nothing to merge', async () => {
    useMerger({ findConflicts: async () => [], plan: vi.fn() });
    await plugin.mergeConfigConflicts();

    expect(mocks.modalOpen).not.toHaveBeenCalled();
    expect(Notice.messages).toEqual(['Conflict manager: no conflicts found in config files']);
  });

  it('reports a failed scan', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    useMerger({
      findConflicts: async () => [{ originalPath: 'a' }],
      plan: async () => {
        throw new Error('boom');
      },
    });
    await plugin.mergeConfigConflicts();

    expect(error).toHaveBeenCalled();
    expect(mocks.modalOpen).not.toHaveBeenCalled();
    expect(Notice.messages).toEqual(['Conflict manager: failed to scan config files']);
    error.mockRestore();
  });
});
