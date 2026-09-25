import { describe, expect, it, vi } from 'vitest';
import { IConfigConflict, ConfigMerger } from '../src/utils/config-merge';
import { MockAdapter, mockApp, setup } from './mock-adapter';

const C = '.obsidian';

const pairs = (conflicts: IConfigConflict[]) =>
  Object.fromEntries(conflicts.map((c) => [c.originalPath, [...c.conflictPaths].sort()]));

const findOne = async (app: ReturnType<typeof setup>['app']) => {
  const conflicts = await new ConfigMerger(app).findConflicts('conflict');

  expect(conflicts).toHaveLength(1);
  return conflicts[0]!;
};

describe('ConfigMerger.isConflictPath', () => {
  it.each([
    `${C}/app (conflict).json`,
    `${C}/plugins/foo/data.sync-conflict-1-2-X.json`,
    `${C}/snippets/My (Conflict).css`,
  ])('accepts %s', (path) => {
    expect(ConfigMerger.isConflictPath(path, C, ' conflict ')).toBe(true);
  });

  it.each([
    [`${C}/workspace.json`, 'a file without the pattern'],
    [`${C}/plugins/conflict-manager/main.js`, 'a folder with the pattern'],
    [`${C}/plugins/conflict-manager/data.json`, 'a folder with the pattern'],
    ['notes/app (conflict).json', 'a path outside the config folder'],
    [`${C}-backup/app (conflict).json`, 'a folder that only starts like the config folder'],
  ])('rejects %s (%s)', (path) => {
    expect(ConfigMerger.isConflictPath(path, C, 'conflict')).toBe(false);
  });

  it('rejects everything with an empty pattern', () => {
    expect(ConfigMerger.isConflictPath(`${C}/app (conflict).json`, C, '  ')).toBe(false);
  });
});

describe('ConfigMerger.findConflicts', () => {
  it('pairs copies named by every supported sync service', async () => {
    const copies = [
      'app (Conflicted copy Laptop 202401011200).json', // Obsidian Sync
      'app (conflicted copy 2024-01-01 12 00 00).json', // Dropbox
      'app (conflict - 2024-01-01 12.00.00).json', // Google Drive
      'app.sync-conflict-20240101-120000-ABCDEFG.json', // Syncthing
      'app.conflict.json', // Remotely Save
      'app (SFConflict user 2024-01-01-12-00-00).json', // Seafile
      'app (conflicted copy 2024-01-01 120000).json', // Nextcloud
    ].map((name) => `${C}/${name}`);
    const { app } = setup([
      [`${C}/app.json`, '{}'],
      ...copies.map((p): [string, string] => [p, '{}']),
    ]);

    expect(pairs(await new ConfigMerger(app).findConflicts('conflict'))).toEqual({
      [`${C}/app.json`]: copies.sort(),
    });
  });

  it('gives a copy to the longest matching original', async () => {
    const { app } = setup([
      [`${C}/app.json`, '{}'],
      [`${C}/appearance.json`, '{}'],
      [`${C}/core-plugins.json`, '{}'],
      [`${C}/core-plugins-migration.json`, '{}'],
      [`${C}/appearance (conflict).json`, '{}'],
      [`${C}/core-plugins-migration (conflict).json`, '{}'],
      [`${C}/core-plugins.sync-conflict-1-2-X.json`, '{}'],
    ]);

    expect(pairs(await new ConfigMerger(app).findConflicts('conflict'))).toEqual({
      [`${C}/appearance.json`]: [`${C}/appearance (conflict).json`],
      [`${C}/core-plugins-migration.json`]: [`${C}/core-plugins-migration (conflict).json`],
      [`${C}/core-plugins.json`]: [`${C}/core-plugins.sync-conflict-1-2-X.json`],
    });
  });

  it('puts a copy of a copy under the original', async () => {
    const { app } = setup([
      [`${C}/app.json`, '{}'],
      [`${C}/app (conflict).json`, '{}'],
      [`${C}/app (conflict) (conflict).json`, '{}'],
    ]);

    expect(pairs(await new ConfigMerger(app).findConflicts('conflict'))).toEqual({
      [`${C}/app.json`]: [`${C}/app (conflict) (conflict).json`, `${C}/app (conflict).json`],
    });
  });

  it('ignores workspace files and copies of their copies', async () => {
    const { app } = setup([
      [`${C}/workspace.json`, '{}'],
      [`${C}/workspace (conflict).json`, '{}'],
      [`${C}/workspace (conflict) (conflict).json`, '{}'],
      [`${C}/workspace-mobile.json`, '{}'],
      [`${C}/workspace-mobile.sync-conflict-1-2-X.json`, '{}'],
    ]);

    expect(await new ConfigMerger(app).findConflicts('conflict')).toEqual([]);
  });

  it('skips copies whose original is missing', async () => {
    const { app } = setup([
      [`${C}/hotkeys (conflict).json`, '{}'],
      [`${C}/hotkeys (conflict 2).json`, '{}'],
    ]);

    expect(await new ConfigMerger(app).findConflicts('conflict')).toEqual([]);
  });

  it('takes only data.json from plugin folders, case-insensitively', async () => {
    const P = `${C}/plugins/foo`;
    const { app } = setup([
      [`${P}/data.json`, '{}'],
      [`${P}/Data (Conflict).json`, '{}'],
      [`${P}/manifest.json`, '{}'],
      [`${P}/manifest (conflict).json`, '{}'],
      [`${P}/main.js`, ''],
      [`${P}/main (conflict).js`, ''],
      [`${P}/styles.css`, ''],
      [`${P}/styles (conflict).css`, ''],
      [`${C}/plugins/bar/manifest.json`, '{}'],
    ]);

    expect(pairs(await new ConfigMerger(app).findConflicts('conflict'))).toEqual({
      [`${P}/data.json`]: [`${P}/Data (Conflict).json`],
    });
  });

  it('handles a plugin folder whose name contains the pattern', async () => {
    const P = `${C}/plugins/conflict-manager`;
    const { app } = setup([
      [`${P}/data.json`, '{}'],
      [`${P}/data.sync-conflict-1-2-X.json`, '{}'],
    ]);

    expect(pairs(await new ConfigMerger(app).findConflicts('conflict'))).toEqual({
      [`${P}/data.json`]: [`${P}/data.sync-conflict-1-2-X.json`],
    });
  });

  it('does not pair a conflict copy of a whole plugin folder', async () => {
    const { app } = setup([
      [`${C}/plugins/foo/data.json`, '{}'],
      [`${C}/plugins/foo (conflict)/data.json`, '{}'],
    ]);

    expect(await new ConfigMerger(app).findConflicts('conflict')).toEqual([]);
  });

  it('takes manifest.json and theme.css from theme folders', async () => {
    const T = `${C}/themes/Minimal`;
    const { app } = setup([
      [`${T}/manifest.json`, '{}'],
      [`${T}/manifest (conflict).json`, '{}'],
      [`${T}/theme.css`, ''],
      [`${T}/theme (conflict).css`, ''],
      [`${T}/extra.css`, ''],
      [`${T}/extra (conflict).css`, ''],
    ]);

    expect(pairs(await new ConfigMerger(app).findConflicts('conflict'))).toEqual({
      [`${T}/manifest.json`]: [`${T}/manifest (conflict).json`],
      [`${T}/theme.css`]: [`${T}/theme (conflict).css`],
    });
  });

  it('takes any snippet, including unicode and regex-special names', async () => {
    const S = `${C}/snippets`;
    const { app } = setup([
      [`${S}/стиль.css`, ''],
      [`${S}/стиль (conflict).css`, ''],
      [`${S}/a+b (x).css`, ''],
      [`${S}/a+b (x) (conflict).css`, ''],
    ]);

    expect(pairs(await new ConfigMerger(app).findConflicts('conflict'))).toEqual({
      [`${S}/стиль.css`]: [`${S}/стиль (conflict).css`],
      [`${S}/a+b (x).css`]: [`${S}/a+b (x) (conflict).css`],
    });
  });

  it('accepts an upper-case extension on the copy', async () => {
    const { app } = setup([
      [`${C}/app.json`, '{}'],
      [`${C}/app (conflict).JSON`, '{}'],
    ]);

    expect(await new ConfigMerger(app).findConflicts('conflict')).toHaveLength(1);
  });

  it('treats the pattern as literal text', async () => {
    const { app } = setup([
      [`${C}/app.json`, '{}'],
      [`${C}/app (c.p).json`, '{}'],
      [`${C}/app (cXp).json`, '{}'],
    ]);

    expect(pairs(await new ConfigMerger(app).findConflicts('c.p'))).toEqual({
      [`${C}/app.json`]: [`${C}/app (c.p).json`],
    });
  });

  it('finds nothing with an empty pattern', async () => {
    const { app } = setup([
      [`${C}/app.json`, '{}'],
      [`${C}/app (conflict).json`, '{}'],
    ]);

    expect(await new ConfigMerger(app).findConflicts('  ')).toEqual([]);
  });

  it('works without plugins, themes and snippets folders', async () => {
    const { app } = setup([[`${C}/app.json`, '{}']]);

    expect(await new ConfigMerger(app).findConflicts('conflict')).toEqual([]);
  });

  it('uses a custom config folder', async () => {
    const adapter = new MockAdapter('.config-x');

    adapter.add('.config-x/app.json', '{}');
    adapter.add('.config-x/app (conflict).json', '{}');
    adapter.add('.config-x/plugins/p/data.json', '{}');
    adapter.add('.config-x/plugins/p/data (conflict).json', '{}');

    expect(await new ConfigMerger(mockApp(adapter)).findConflicts('conflict')).toHaveLength(2);
  });

  // Names alone cannot tell these apart from real copies; the modal lists the copies instead
  describe('known limitations', () => {
    it('pairs a snippet whose name looks like a copy', async () => {
      const S = `${C}/snippets`;
      const { app } = setup([
        [`${S}/no.css`, ''],
        [`${S}/no-conflict.css`, ''],
      ]);

      expect(pairs(await new ConfigMerger(app).findConflicts('conflict'))).toEqual({
        [`${S}/no.css`]: [`${S}/no-conflict.css`],
      });
    });

    it('pairs orphan copies when the original is missing', async () => {
      const S = `${C}/snippets`;
      const { app } = setup([
        [`${S}/x (conflict).css`, ''],
        [`${S}/x (conflict) (conflict).css`, ''],
      ]);

      expect(pairs(await new ConfigMerger(app).findConflicts('conflict'))).toEqual({
        [`${S}/x (conflict).css`]: [`${S}/x (conflict) (conflict).css`],
      });
    });
  });
});

describe('ConfigMerger.plan', () => {
  it('merges top-level keys, the newest version wins', async () => {
    const { app } = setup([
      [`${C}/app.json`, '{"a":1,"b":1,"onlyOrig":true}', 10],
      [`${C}/app (conflict).json`, '{"a":2,"onlyCopy":true}', 20],
    ]);
    const plan = await new ConfigMerger(app).plan(await findOne(app));

    expect(plan.summary).toBe('merge keys');
    expect(JSON.parse(plan.content!)).toEqual({ a: 2, b: 1, onlyOrig: true, onlyCopy: true });
  });

  it('applies several versions from oldest to newest', async () => {
    const { app } = setup([
      [`${C}/app.json`, '{"k":"orig","o":1}', 20],
      [`${C}/app (conflict 1).json`, '{"k":"c1","c1":1}', 10],
      [`${C}/app (conflict 2).json`, '{"k":"c2","c2":1}', 30],
    ]);
    const plan = await new ConfigMerger(app).plan(await findOne(app));

    expect(JSON.parse(plan.content!)).toEqual({ k: 'c2', c1: 1, o: 1, c2: 1 });
  });

  it('lets the copy win when mtimes are equal', async () => {
    const { app } = setup([
      [`${C}/app.json`, '{"a":1}', 10],
      [`${C}/app (conflict).json`, '{"a":2}', 10],
    ]);
    const plan = await new ConfigMerger(app).plan(await findOne(app));

    expect(JSON.parse(plan.content!)).toEqual({ a: 2 });
  });

  it('saves with 2-space indent', async () => {
    const { app } = setup([
      [`${C}/app.json`, '{"a":1}', 10],
      [`${C}/app (conflict).json`, '{"b":2}', 20],
    ]);
    const plan = await new ConfigMerger(app).plan(await findOne(app));

    expect(plan.content).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it('replaces JSON arrays with the newest version', async () => {
    const { app } = setup([
      [`${C}/community-plugins.json`, '["a","b"]', 20],
      [`${C}/community-plugins (conflict).json`, '["a"]', 10],
    ]);
    const plan = await new ConfigMerger(app).plan(await findOne(app));

    expect(plan).toMatchObject({ content: '["a","b"]', summary: 'keep original' });
  });

  it('replaces mixed object and array versions with the newest', async () => {
    const { app } = setup([
      [`${C}/core-plugins.json`, '["x"]', 10],
      [`${C}/core-plugins (conflict).json`, '{"x":true}', 20],
    ]);
    const plan = await new ConfigMerger(app).plan(await findOne(app));

    expect(plan).toMatchObject({ content: '{"x":true}', summary: 'keep newest copy' });
  });

  it('replaces CSS with the newest version', async () => {
    const S = `${C}/snippets`;
    const { app } = setup([
      [`${S}/my.css`, 'old', 10],
      [`${S}/my (conflict).css`, 'new', 20],
    ]);
    const plan = await new ConfigMerger(app).plan(await findOne(app));

    expect(plan).toMatchObject({ content: 'new', summary: 'keep newest copy' });
  });

  it.each([
    ['truncated', '{"a":'],
    ['empty', ''],
  ])('refuses %s JSON', async (_, content) => {
    const { app } = setup([
      [`${C}/app.json`, '{"a":1}', 10],
      [`${C}/app (conflict).json`, content, 20],
    ]);
    const plan = await new ConfigMerger(app).plan(await findOne(app));

    expect(plan.content).toBeNull();
    expect(plan.summary).toBe('invalid JSON in app (conflict).json');
  });

  it('strips a byte order mark before parsing', async () => {
    const { app } = setup([
      [`${C}/app.json`, '\uFEFF{"a":1}', 10],
      [`${C}/community-plugins.json`, '["a"]', 10],
      [`${C}/app (conflict).json`, '\uFEFF{"b":2}', 20],
      [`${C}/community-plugins (conflict).json`, '\uFEFF["b"]', 20],
    ]);
    const conflicts = await new ConfigMerger(app).findConflicts('conflict');
    const plan = (name: string) =>
      new ConfigMerger(app).plan(conflicts.find((c) => c.originalPath === `${C}/${name}`)!);

    expect(JSON.parse((await plan('app.json')).content!)).toEqual({ a: 1, b: 2 });
    expect((await plan('community-plugins.json')).content).toBe('["b"]');
  });

  it('keeps a "__proto__" key as data without touching prototypes', async () => {
    const { app } = setup([
      [`${C}/app.json`, '{"a":1}', 10],
      [`${C}/app (conflict).json`, '{"__proto__":{"polluted":1},"b":2}', 20],
    ]);
    const plan = await new ConfigMerger(app).plan(await findOne(app));

    expect(Object.keys(JSON.parse(plan.content!) as object)).toEqual(['a', '__proto__', 'b']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('marks the plan as not applicable when a file is gone', async () => {
    const { adapter, app } = setup([
      [`${C}/app.json`, '{"a":1}', 10],
      [`${C}/app (conflict).json`, '{"a":2}', 20],
    ]);
    const conflict = await findOne(app);

    adapter.files.delete(`${C}/app (conflict).json`);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await new ConfigMerger(app).plan(conflict)).toMatchObject({
      content: null,
      summary: 'files changed, scan again',
    });
    vi.restoreAllMocks();
  });
});

describe('ConfigMerger.apply', () => {
  it('writes the merge, trashes the previous original and the copies', async () => {
    const { adapter, app } = setup([
      [`${C}/app.json`, '{"a":1}', 10],
      [`${C}/app (conflict).json`, '{"a":2}', 20],
    ]);
    const applied = await new ConfigMerger(app).apply(await findOne(app));

    expect(applied.content).not.toBeNull();
    expect(JSON.parse(await adapter.read(`${C}/app.json`))).toEqual({ a: 2 });
    // The original path never goes missing: copy to .old, write, then trash the .old
    expect(adapter.log).toEqual([
      `copy ${C}/app.json ${C}/app.json.old`,
      `write ${C}/app.json`,
      `trash(system) ${C}/app.json.old`,
      `trash(system) ${C}/app (conflict).json`,
    ]);
    expect(await new ConfigMerger(app).findConflicts('conflict')).toEqual([]);
  });

  it('picks a free .old name and leaves an existing one alone', async () => {
    const { adapter, app } = setup([
      [`${C}/app.json`, '{"a":1}', 10],
      [`${C}/app.json.old`, 'stale', 5],
      [`${C}/app (conflict).json`, '{"a":2}', 20],
    ]);

    await new ConfigMerger(app).apply(await findOne(app));

    expect(adapter.trash).toContain(`${C}/app.json.old_1`);
    expect(await adapter.read(`${C}/app.json.old`)).toBe('stale');
  });

  it('keeps the previous original and the copies when the write fails', async () => {
    const { adapter, app } = setup([
      [`${C}/app.json`, '{"a":1}', 10],
      [`${C}/app (conflict).json`, '{"a":2}', 20],
    ]);

    adapter.failWrite = true;

    await expect(new ConfigMerger(app).apply(await findOne(app))).rejects.toThrow('EIO');
    // The half-written original can be restored from the .old copy, nothing went to trash
    expect(await adapter.read(`${C}/app.json.old`)).toBe('{"a":1}');
    expect(await adapter.exists(`${C}/app (conflict).json`)).toBe(true);
    expect(adapter.trash).toEqual([]);
  });

  it('falls back to the vault trash', async () => {
    const { adapter, app } = setup([
      [`${C}/app.json`, '{"a":1}', 10],
      [`${C}/app (conflict).json`, '{"a":2}', 20],
    ]);

    adapter.failTrashSystem = true;
    await new ConfigMerger(app).apply(await findOne(app));

    expect(adapter.log.filter((line) => line.startsWith('trash(local)'))).toHaveLength(2);
  });

  it('leaves an unchanged original alone and only trashes the copies', async () => {
    const { adapter, app } = setup([
      [`${C}/app.json`, '{\n  "a": 1\n}', 20],
      [`${C}/app (conflict).json`, '{"a":1}', 10],
    ]);

    await new ConfigMerger(app).apply(await findOne(app));

    expect(adapter.log).toEqual([`trash(system) ${C}/app (conflict).json`]);
  });

  it('leaves an unchanged original with a byte order mark alone', async () => {
    const { adapter, app } = setup([
      [`${C}/snippets/a.css`, '﻿body {}', 20],
      [`${C}/snippets/a (conflict).css`, 'p {}', 10],
    ]);

    await new ConfigMerger(app).apply(await findOne(app));

    expect(await adapter.read(`${C}/snippets/a.css`)).toBe('﻿body {}');
    expect(adapter.log).toEqual([`trash(system) ${C}/snippets/a (conflict).css`]);
  });

  it('writes nothing when the original is gone between plan and apply', async () => {
    const { adapter, app } = setup([
      [`${C}/app.json`, '{"a":1}', 10],
      [`${C}/app (conflict).json`, '{"a":2}', 20],
    ]);
    const conflict = await findOne(app);
    const read = adapter.read.bind(adapter);
    let originalReads = 0;

    // The first read builds the plan, the sync client deletes the original before the second
    vi.spyOn(adapter, 'read').mockImplementation(async (path) => {
      if (path === `${C}/app.json` && ++originalReads > 1) adapter.files.delete(path);
      return read(path);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await new ConfigMerger(app).apply(conflict)).toMatchObject({
      content: null,
      summary: 'files changed, scan again',
    });
    expect(adapter.log).toEqual([]);
    vi.restoreAllMocks();
  });

  it('re-plans, so a copy changed after planning is respected', async () => {
    const { adapter, app } = setup([
      [`${C}/app.json`, '{"a":1}', 10],
      [`${C}/app (conflict).json`, '{"a":2}', 20],
    ]);
    const plan = await new ConfigMerger(app).plan(await findOne(app));

    adapter.add(`${C}/app (conflict).json`, '{"a":3}', 30);
    await new ConfigMerger(app).apply(plan);

    expect(JSON.parse(await adapter.read(`${C}/app.json`))).toEqual({ a: 3 });
  });

  it('writes nothing and returns the reason for invalid JSON', async () => {
    const { adapter, app } = setup([
      [`${C}/app.json`, '{"a":1}', 10],
      [`${C}/app (conflict).json`, '{"a":', 20],
    ]);
    const applied = await new ConfigMerger(app).apply(await findOne(app));

    expect(applied).toMatchObject({
      content: null,
      summary: 'invalid JSON in app (conflict).json',
    });
    expect(adapter.log).toEqual([]);
  });

  it('writes nothing when a copy is gone since the scan', async () => {
    const { adapter, app } = setup([
      [`${C}/app.json`, '{"a":1}', 10],
      [`${C}/app (conflict).json`, '{"a":2}', 20],
    ]);
    const conflict = await findOne(app);

    adapter.files.delete(`${C}/app (conflict).json`);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect((await new ConfigMerger(app).apply(conflict)).content).toBeNull();
    expect(await adapter.read(`${C}/app.json`)).toBe('{"a":1}');
    expect(adapter.log).toEqual([]);
    vi.restoreAllMocks();
  });
});
