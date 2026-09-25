import { App } from 'obsidian';

interface IMockFile {
  content: string;
  mtime: number;
}

/*
 * In-memory stand-in for FileSystemAdapter with the methods config-merge uses.
 * Paths are vault-relative with "/" separators, list() returns direct children with the folder prefix,
 * and every mutation is recorded in "log" so tests can check the write order.
 */
export class MockAdapter {
  files = new Map<string, IMockFile>();
  folders = new Set<string>();
  trash: string[] = [];
  log: string[] = [];
  failTrashSystem = false;
  failWrite = false;
  private clock = 1000;

  constructor(public configDir = '.obsidian') {}

  add(path: string, content: string, mtime?: number) {
    this.files.set(path, { content, mtime: mtime ?? this.clock++ });

    const parts = path.split('/');

    for (let index = 1; index < parts.length; index++)
      this.folders.add(parts.slice(0, index).join('/'));
  }

  async list(folder: string) {
    const prefix = `${folder}/`;
    const isChild = (path: string) =>
      path.startsWith(prefix) && !path.slice(prefix.length).includes('/');

    return {
      files: [...this.files.keys()].filter(isChild),
      folders: [...this.folders].filter(isChild),
    };
  }

  async exists(path: string) {
    return this.files.has(path) || this.folders.has(path);
  }

  async stat(path: string) {
    const file = this.files.get(path);

    return file
      ? { type: 'file', ctime: file.mtime, mtime: file.mtime, size: file.content.length }
      : null;
  }

  async read(path: string) {
    const file = this.files.get(path);

    if (!file) throw new Error(`ENOENT: ${path}`);

    return file.content;
  }

  async write(path: string, content: string) {
    this.log.push(`write ${path}`);

    if (this.failWrite) {
      this.files.set(path, { content: content.slice(0, 3), mtime: this.clock++ });
      throw new Error(`EIO: ${path}`);
    }

    this.files.set(path, { content, mtime: this.clock++ });
  }

  async copy(from: string, to: string) {
    const file = this.files.get(from);

    if (!file) throw new Error(`ENOENT: ${from}`);
    if (this.files.has(to)) throw new Error(`EEXIST: ${to}`);

    this.log.push(`copy ${from} ${to}`);
    this.files.set(to, { ...file });
  }

  async trashSystem(path: string) {
    if (this.failTrashSystem) return false;

    this.remove(path, 'system');
    return true;
  }

  async trashLocal(path: string) {
    this.remove(path, 'local');
  }

  private remove(path: string, where: 'system' | 'local') {
    if (!this.files.has(path)) throw new Error(`ENOENT: ${path}`);

    this.log.push(`trash(${where}) ${path}`);
    this.trash.push(path);
    this.files.delete(path);
  }
}

export const mockApp = (adapter: MockAdapter): App =>
  ({ vault: { adapter, configDir: adapter.configDir } }) as unknown as App;

export const setup = (files: [path: string, content: string, mtime?: number][]) => {
  const adapter = new MockAdapter();

  for (const [path, content, mtime] of files) adapter.add(path, content, mtime);

  return { adapter, app: mockApp(adapter) };
};
