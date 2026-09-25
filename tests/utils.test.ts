import { describe, expect, it } from 'vitest';
import { TFile, TFolder, Vault } from 'obsidian';
import { conflictRegExp, escapeRegExp, findConflictFiles, findOriginalFiles } from '../src/utils';

const makeVault = (paths: string[]) => {
  const folders = new Map<string, TFolder>();
  const folderOf = (path: string): TFolder => {
    let folder = folders.get(path);

    if (!folder) {
      folder = Object.assign(new TFolder(), { path, children: [] });
      folders.set(path, folder);
    }

    return folder;
  };
  const files = paths.map((path) => {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const dot = name.lastIndexOf('.');
    const parent = folderOf(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '/');
    const file = Object.assign(new TFile(), {
      path,
      name,
      basename: name.slice(0, dot),
      extension: name.slice(dot + 1),
      parent,
    });

    parent.children.push(file);
    return file;
  });

  return {
    vault: { getFiles: () => files } as unknown as Vault,
    file: (path: string) => files.find((file) => file.path === path)!,
  };
};

const paths = (files: TFile[]) => files.map((file) => file.path).sort();

describe('conflictRegExp', () => {
  const regex = conflictRegExp(escapeRegExp('file'), escapeRegExp('conflict'));

  it.each([
    'file (Conflicted copy Device 202401011200)', // Obsidian Sync
    'file (conflicted copy 2024-01-01 12 00 00)', // Dropbox
    'file (conflict - 2024-01-01 12.00.00)', // Google Drive
    'file.sync-conflict-20240101-120000-DEVICEID', // Syncthing
    'file.conflict', // Remotely Save
    'FILE (CONFLICT)',
  ])('matches %s', (basename) => {
    expect(regex.test(basename)).toBe(true);
  });

  it.each(['file', 'filename (conflict)', 'file (copy)', 'my file (conflict)'])(
    'does not match %s',
    (basename) => {
      expect(regex.test(basename)).toBe(false);
    },
  );
});

describe('escapeRegExp', () => {
  it('makes every special character literal', () => {
    const text = 'a.*+?^${}()|[]\\b';

    expect(new RegExp(`^${escapeRegExp(text)}$`).test(text)).toBe(true);
    expect(new RegExp(escapeRegExp('a.c')).test('abc')).toBe(false);
  });
});

describe('findConflictFiles', () => {
  const { file } = makeVault([
    'notes/note.md',
    'notes/note (conflict).md',
    'notes/note.sync-conflict-1-2-X.md',
    'notes/note (conflict).canvas',
    'notes/notebook (conflict).md',
    'other/note (conflict).md',
    'notes/data.txt',
    'notes/data (conflict).txt',
    'root.md',
    'root (conflict).md',
  ]);

  it('returns sibling copies with the same extension', () => {
    expect(paths(findConflictFiles(file('notes/note.md'), 'conflict'))).toEqual([
      'notes/note (conflict).md',
      'notes/note.sync-conflict-1-2-X.md',
    ]);
  });

  it('works in the vault root', () => {
    expect(paths(findConflictFiles(file('root.md'), 'conflict'))).toEqual(['root (conflict).md']);
  });

  it('ignores unsupported extensions', () => {
    expect(findConflictFiles(file('notes/data.txt'), 'conflict')).toEqual([]);
  });

  it('returns nothing with an empty pattern', () => {
    expect(findConflictFiles(file('notes/note.md'), ' ')).toEqual([]);
  });

  it('returns nothing for a file without parent', () => {
    const orphan = Object.assign(new TFile(), { basename: 'x', extension: 'md', parent: null });

    expect(findConflictFiles(orphan, 'conflict')).toEqual([]);
  });
});

describe('findOriginalFiles', () => {
  it('finds originals in folders and the vault root, case-insensitively', () => {
    const { vault } = makeVault([
      'a/note.md',
      'a/Note (Conflict).md',
      'root.canvas',
      'root.conflict.canvas',
      'b/lonely (conflict).md',
      'c/data.txt',
      'c/data (conflict).txt',
    ]);

    expect(paths(findOriginalFiles(vault, 'conflict'))).toEqual(['a/note.md', 'root.canvas']);
  });

  it('does not pair a copy with a file in another folder', () => {
    const { vault } = makeVault(['a/note.md', 'b/note (conflict).md']);

    expect(findOriginalFiles(vault, 'conflict')).toEqual([]);
  });

  it('cuts names at every delimiter, not at the first or last one', () => {
    const { vault } = makeVault([
      'my-note.md',
      'my-note (conflict).md',
      't.sync.md',
      't.sync-conflict-1-2-X.md',
    ]);

    expect(paths(findOriginalFiles(vault, 'conflict'))).toEqual(['my-note.md', 't.sync.md']);
  });

  it('agrees with findConflictFiles for every file', () => {
    const { vault } = makeVault([
      'my.md',
      'my-note.md',
      'my-note (conflict).md',
      't.md',
      't.sync.md',
      't.sync-conflict-1-2-X.md',
      'plain.md',
      'x (conflict).md',
    ]);
    const originals = new Set(findOriginalFiles(vault, 'conflict'));

    for (const file of vault.getFiles()) {
      expect(originals.has(file), file.path).toBe(findConflictFiles(file, 'conflict').length > 0);
    }
  });
});
