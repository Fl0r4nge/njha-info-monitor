import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class JsonSnapshotStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    try {
      const content = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed.projects) ? parsed.projects : parsed;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async save(projects) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    const payload = {
      savedAt: new Date().toISOString(),
      projects
    };

    await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await rename(tmpPath, this.filePath);
  }
}
