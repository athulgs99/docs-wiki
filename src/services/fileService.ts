import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { FileError, ValidationError } from '../types';

export interface FileServiceConfig {
  rootDir: string;
  allowedDirs?: string[];
}

export class FileService {
  private rootDir: string;
  private allowedDirs: string[];

  constructor(config: FileServiceConfig) {
    this.rootDir = path.resolve(config.rootDir);
    this.allowedDirs = (config.allowedDirs ?? ['raw', 'wiki', 'outputs', '.claude']).map(
      (d) => path.resolve(this.rootDir, d)
    );
  }

  // ─── Read ───────────────────────────────────────────────────────────────────

  async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const resolved = this.resolvePath(filePath);
    try {
      return await fs.readFile(resolved, { encoding });
    } catch (err) {
      throw new FileError(`Failed to read file: ${resolved}`, err);
    }
  }

  async readJson<T>(filePath: string): Promise<T> {
    const content = await this.readFile(filePath);
    try {
      return JSON.parse(content) as T;
    } catch (err) {
      throw new FileError(`Invalid JSON in file: ${filePath}`, err);
    }
  }

  async readYaml(filePath: string): Promise<unknown> {
    const yaml = await import('js-yaml');
    const content = await this.readFile(filePath);
    try {
      return yaml.load(content);
    } catch (err) {
      throw new FileError(`Invalid YAML in file: ${filePath}`, err);
    }
  }

  // ─── Write ──────────────────────────────────────────────────────────────────

  async writeFile(filePath: string, content: string, encoding: BufferEncoding = 'utf-8'): Promise<void> {
    const resolved = this.resolvePath(filePath);
    const tmp = resolved + '.tmp';
    try {
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(tmp, content, { encoding });
      await fs.rename(tmp, resolved); // atomic
    } catch (err) {
      // Clean up tmp if it exists
      await fs.unlink(tmp).catch(() => undefined);
      throw new FileError(`Failed to write file: ${resolved}`, err);
    }
  }

  async writeJson(filePath: string, data: unknown, pretty = true): Promise<void> {
    const content = JSON.stringify(data, null, pretty ? 2 : 0);
    await this.writeFile(filePath, content);
  }

  async appendFile(filePath: string, content: string): Promise<void> {
    const resolved = this.resolvePath(filePath);
    try {
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.appendFile(resolved, content, 'utf-8');
    } catch (err) {
      throw new FileError(`Failed to append to file: ${resolved}`, err);
    }
  }

  async appendJson(filePath: string, data: unknown): Promise<void> {
    await this.appendFile(filePath, JSON.stringify(data) + '\n');
  }

  // ─── File Management ────────────────────────────────────────────────────────

  async fileExists(filePath: string): Promise<boolean> {
    const resolved = this.resolvePath(filePath);
    try {
      await fs.access(resolved);
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    const resolved = this.resolvePath(filePath);
    try {
      await fs.unlink(resolved);
    } catch (err) {
      throw new FileError(`Failed to delete file: ${resolved}`, err);
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    const resolved = this.resolvePath(dirPath);
    try {
      await fs.mkdir(resolved, { recursive: true });
    } catch (err) {
      throw new FileError(`Failed to create directory: ${resolved}`, err);
    }
  }

  async listFiles(dir: string, pattern?: string): Promise<string[]> {
    const resolved = this.resolvePath(dir);
    try {
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile())
        .map((e) => path.join(resolved, e.name));

      if (!pattern) return files;

      const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
      return files.filter((f) => regex.test(path.basename(f)));
    } catch (err) {
      throw new FileError(`Failed to list files in: ${resolved}`, err);
    }
  }

  // ─── Utility ────────────────────────────────────────────────────────────────

  async fileHash(filePath: string): Promise<string> {
    const resolved = this.resolvePath(filePath);
    try {
      const content = await fs.readFile(resolved);
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (err) {
      throw new FileError(`Failed to hash file: ${resolved}`, err);
    }
  }

  async fileStats(filePath: string): Promise<{ size: number; modified: string }> {
    const resolved = this.resolvePath(filePath);
    try {
      const stat = await fs.stat(resolved);
      return { size: stat.size, modified: stat.mtime.toISOString() };
    } catch (err) {
      throw new FileError(`Failed to stat file: ${resolved}`, err);
    }
  }

  // ─── Path Helpers (public for agents that need to resolve paths) ────────────

  resolvePath(filePath: string): string {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.rootDir, filePath);
    this.validatePath(resolved);
    return resolved;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private validatePath(resolved: string): void {
    // Prevent directory traversal
    if (!resolved.startsWith(this.rootDir)) {
      throw new ValidationError(`Path escapes rootDir: ${resolved}`);
    }
  }
}
