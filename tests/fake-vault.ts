import { TFile, TFolder, Vault } from 'obsidian';

/*
 * Builds TFile/TFolder trees from vault paths, enough for findConflictFiles (parent.children)
 * and findOriginalFiles (vault.getFiles). The vault root folder has the path "/", as in Obsidian.
 */
export const makeVault = (paths: string[]) => {
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
