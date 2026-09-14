import { TFile, Vault } from 'obsidian';

const SUPPORTED_EXTENSIONS = new Set(['md', 'base', 'canvas']);

/*
 * Generate a secure Regex with the user's word
 * Expect: OriginalName + Delimiter(space/dot/hyphen/bracket) + ... + UserPattern + ...
 *
 * | Services      | File name format                               |
 * | ------------- | ---------------------------------------------- |
 * | Obsidian Sync | file (Conflicted copy Device YYYYMMDDHHMM).md  |
 * | Dropbox       | file (conflicted copy YYYY-MM-DD HH MM SS).md  |
 * | Google Drive  | file (conflict - YYYY-MM-DD HH.MM.SS).md       |
 * | Syncthing     | file.sync-conflict-YYYYMMDD-HHMMSS-DEVICEID.md |
 * | Remotely Save | file.conflict.md                               |
 * | Obsidian Git  | conflicts within the file (<<<<<<< HEAD)       |
 * | iCloud Drive  | version selection dialog (no separate file)    |
 */
const conflictRegExp = (prefix: string, pattern: string): RegExp => {
  return new RegExp(`^${prefix}[\\s\\.\\-\\(]+.*(?:${pattern}).*$`, 'i');
};

const escapeRegExp = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const findConflictFiles = (activeFile: TFile, conflictFilePattern: string): TFile[] => {
  const { basename, extension, parent } = activeFile;

  if (!parent || !conflictFilePattern.trim() || !SUPPORTED_EXTENSIONS.has(extension.toLowerCase()))
    return [];

  const escapedBasename = escapeRegExp(basename);
  const userPattern = escapeRegExp(conflictFilePattern.trim());
  const regex = conflictRegExp(escapedBasename, userPattern);

  return parent.children.filter((child): child is TFile => {
    if (!(child instanceof TFile)) return false;
    if (child.extension !== extension) return false;
    if (child.path === activeFile.path) return false;
    return regex.test(child.basename);
  });
};

// Inverse of findConflictFiles
const findOriginalFiles = (vault: Vault, conflictFilePattern: string): TFile[] => {
  const userPattern = escapeRegExp(conflictFilePattern.trim());

  if (!userPattern) return [];

  const regex = conflictRegExp('(.+)', userPattern);
  const originals = new Map<string, TFile>();

  for (const file of vault.getFiles()) {
    if (!SUPPORTED_EXTENSIONS.has(file.extension.toLowerCase())) continue;

    const originalName = regex.exec(file.basename)?.[1]?.trim();

    if (!originalName) continue;

    const folder = file.parent?.path;
    const originalPath =
      folder && folder !== '/'
        ? `${folder}/${originalName}.${file.extension}`
        : `${originalName}.${file.extension}`;
    const original = vault.getFileByPath(originalPath);

    if (original) originals.set(original.path, original);
  }

  return [...originals.values()];
};

export { SUPPORTED_EXTENSIONS, conflictRegExp, escapeRegExp, findConflictFiles, findOriginalFiles };
