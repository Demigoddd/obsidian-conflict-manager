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

export { conflictRegExp, escapeRegExp };
