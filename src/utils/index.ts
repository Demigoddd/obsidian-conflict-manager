import { TFile } from 'obsidian';

const escapeRegExp = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

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

const findConflictFiles = (activeFile: TFile, conflictFilePattern: string): TFile[] => {
  const { basename, extension, parent } = activeFile;

  if (!parent || !conflictFilePattern.trim()) return [];

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

export { conflictRegExp, escapeRegExp, findConflictFiles };
