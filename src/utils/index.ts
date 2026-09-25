import { TFile, Vault } from 'obsidian';

const SUPPORTED_EXTENSIONS = new Set(['md', 'base', 'canvas']);
const DELIMITER = /[\s.\-(]/;

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
  return new RegExp(`^${prefix}${DELIMITER.source}+.*(?:${pattern}).*$`, 'i');
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
    if (child.extension.toLowerCase() !== extension.toLowerCase()) return false;
    if (child.path === activeFile.path) return false;
    return regex.test(child.basename);
  });
};

// Inverse of findConflictFiles
const findOriginalFiles = (vault: Vault, conflictFilePattern: string): TFile[] => {
  const userPattern = escapeRegExp(conflictFilePattern.trim());

  if (!userPattern) return [];

  const containsPattern = new RegExp(userPattern, 'i');
  const files = vault
    .getFiles()
    .filter((file) => SUPPORTED_EXTENSIONS.has(file.extension.toLowerCase()));
  const filesByPath = new Map(files.map((file) => [file.path.toLowerCase(), file]));
  const originals = new Set<TFile>();

  files
    .filter((copy) => containsPattern.test(copy.basename))
    .forEach(({ basename, extension, name, path }) => {
      // "folder/" or "" for the vault root
      const folder = path.slice(0, -name.length);

      for (let index = 1; index < basename.length; index++) {
        if (!DELIMITER.test(basename[index]!)) continue;

        const prefix = basename.slice(0, index);
        const original = filesByPath.get(`${folder}${prefix}.${extension}`.toLowerCase());

        if (original && conflictRegExp(escapeRegExp(prefix), userPattern).test(basename))
          originals.add(original);
      }
    });

  return [...originals];
};

export { SUPPORTED_EXTENSIONS, conflictRegExp, escapeRegExp, findConflictFiles, findOriginalFiles };
