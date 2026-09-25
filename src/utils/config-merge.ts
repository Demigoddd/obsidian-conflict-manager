import { App } from 'obsidian';
import { conflictRegExp, escapeRegExp } from '.';

const IGNORED_ROOT_FILES = new Set(['workspace.json', 'workspace-mobile.json']);
type ConfigConflictKind = 'json' | 'css';

interface IConfigConflict {
  originalPath: string;
  conflictPaths: string[];
  kind: ConfigConflictKind;
}

interface IConfigMergePlan extends IConfigConflict {
  content: string | null;
  summary: string;
}

interface IConfigVersion {
  path: string;
  mtime: number;
  content: string;
}

class ConfigMerger {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  static isConflictPath(path: string, configDir: string, conflictFilePattern: string): boolean {
    const pattern = conflictFilePattern.trim().toLowerCase();

    return (
      pattern !== '' &&
      path.startsWith(`${configDir}/`) &&
      ConfigMerger.fileName(path).toLowerCase().includes(pattern)
    );
  }

  async findConflicts(conflictFilePattern: string): Promise<IConfigConflict[]> {
    const userPattern = escapeRegExp(conflictFilePattern.trim());

    if (!userPattern) return [];

    const { adapter, configDir } = this.app.vault;
    const result = await this.scanFolder(
      configDir,
      'json',
      userPattern,
      (name) => !IGNORED_ROOT_FILES.has(name),
    );
    const pluginsDir = `${configDir}/plugins`;
    const themesDir = `${configDir}/themes`;
    const snippetsDir = `${configDir}/snippets`;

    if (await adapter.exists(pluginsDir)) {
      const { folders } = await adapter.list(pluginsDir);

      for (const folder of folders) {
        result.push(
          ...(await this.scanFolder(folder, 'json', userPattern, (name) => name === 'data.json')),
        );
      }
    }

    if (await adapter.exists(themesDir)) {
      const { folders } = await adapter.list(themesDir);

      for (const folder of folders) {
        result.push(
          ...(await this.scanFolder(
            folder,
            'json',
            userPattern,
            (name) => name === 'manifest.json',
          )),
          ...(await this.scanFolder(folder, 'css', userPattern, (name) => name === 'theme.css')),
        );
      }
    }

    if (await adapter.exists(snippetsDir)) {
      result.push(...(await this.scanFolder(snippetsDir, 'css', userPattern, () => true)));
    }

    return result;
  }

  async plan(conflict: IConfigConflict): Promise<IConfigMergePlan> {
    let versions: IConfigVersion[];

    try {
      versions = await this.readVersions(conflict);
    } catch (error) {
      console.error(error);
      return { ...conflict, content: null, summary: 'files changed, scan again' };
    }

    const newest = versions[versions.length - 1]!;
    const keepNewest = {
      ...conflict,
      content: newest.content,
      summary: newest.path === conflict.originalPath ? 'keep original' : 'keep newest copy',
    };

    if (conflict.kind === 'css') return keepNewest;

    const parsed: unknown[] = [];

    for (const version of versions) {
      try {
        parsed.push(JSON.parse(version.content));
      } catch {
        return {
          ...conflict,
          content: null,
          summary: `invalid JSON in ${ConfigMerger.fileName(version.path)}`,
        };
      }
    }

    if (!parsed.every(ConfigMerger.isPlainObject)) return keepNewest;

    const merged = parsed.reduce<Record<string, unknown>>(
      (result, current) => Object.assign(result, current),
      Object.create(null) as Record<string, unknown>,
    );

    return {
      ...conflict,
      content: JSON.stringify(merged, undefined, 2),
      summary: 'merge keys',
    };
  }

  async apply(conflict: IConfigConflict): Promise<IConfigMergePlan> {
    const { adapter } = this.app.vault;
    const plan = await this.plan(conflict);
    const merged = plan.content;

    if (merged === null) return plan;

    let current: string;

    try {
      current = await this.readContent(plan.originalPath);
    } catch (error) {
      console.error(error);
      return { ...plan, content: null, summary: 'files changed, scan again' };
    }

    if (merged !== current) {
      await this.trashPreviousVersion(plan.originalPath, () =>
        adapter.write(plan.originalPath, merged),
      );
    }

    for (const path of plan.conflictPaths) await this.trash(path);

    return plan;
  }

  private async scanFolder(
    folder: string,
    kind: ConfigConflictKind,
    userPattern: string,
    isOriginal: (name: string) => boolean,
  ): Promise<IConfigConflict[]> {
    const { fileName, splitName } = ConfigMerger;
    const { files } = await this.app.vault.adapter.list(folder);
    const candidates = files.filter(
      (path) => splitName(fileName(path)).extension.toLowerCase() === kind,
    );
    const entries = candidates
      .map((path) => ({
        path,
        regex: conflictRegExp(escapeRegExp(splitName(fileName(path)).basename), userPattern),
        length: fileName(path).length,
      }))
      .sort((a, b) => b.length - a.length);
    const isCopy = (path: string) => {
      const { basename } = splitName(fileName(path));

      return entries.some((item) => item.path !== path && item.regex.test(basename));
    };
    const originals = entries.filter(
      (item) => isOriginal(fileName(item.path).toLowerCase()) && !isCopy(item.path),
    );
    const conflicts = new Map<string, string[]>();

    for (const path of candidates) {
      const { basename } = splitName(fileName(path));
      const original = originals.find((item) => item.path !== path && item.regex.test(basename));

      if (!original) continue;

      conflicts.set(original.path, [...(conflicts.get(original.path) ?? []), path]);
    }

    return [...conflicts].map(([originalPath, conflictPaths]) => ({
      originalPath,
      conflictPaths,
      kind,
    }));
  }

  private async readVersions(conflict: IConfigConflict): Promise<IConfigVersion[]> {
    const { adapter } = this.app.vault;
    const versions = await Promise.all(
      [conflict.originalPath, ...conflict.conflictPaths].map(async (path) => ({
        path,
        mtime: (await adapter.stat(path))?.mtime ?? 0,
        content: await this.readContent(path),
      })),
    );

    // Oldest first, so every next version is written over the previous result
    return versions.sort((a, b) => a.mtime - b.mtime);
  }

  private async readContent(path: string): Promise<string> {
    return (await this.app.vault.adapter.read(path)).replace(/^\uFEFF/, '');
  }

  private async trash(path: string): Promise<void> {
    const { adapter } = this.app.vault;

    if (!(await adapter.trashSystem(path))) await adapter.trashLocal(path);
  }

  private async trashPreviousVersion(path: string, write: () => Promise<void>): Promise<void> {
    const { adapter } = this.app.vault;
    let oldPath = `${path}.old`;

    for (let index = 1; await adapter.exists(oldPath); index++) oldPath = `${path}.old_${index}`;

    await adapter.copy(path, oldPath);
    await write();
    await this.trash(oldPath);
  }

  private static fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

  private static splitName = (name: string): { basename: string; extension: string } => {
    const dot = name.lastIndexOf('.');

    return dot > 0
      ? { basename: name.slice(0, dot), extension: name.slice(dot + 1) }
      : { basename: name, extension: '' };
  };

  private static isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type { IConfigConflict, IConfigMergePlan };
export { ConfigMerger };
