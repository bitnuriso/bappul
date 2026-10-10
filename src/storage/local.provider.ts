import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  readdir,
  readFile,
  stat,
  writeFile,
  mkdir,
} from 'node:fs/promises';

import * as path from 'node:path';

import {
  StorageProvider,
  FileInfo,
} from './storage.interface';

@Injectable()
export class LocalProvider implements StorageProvider {
  private readonly root: string;

  constructor(
    private readonly config: ConfigService,
  ) {
    this.root = this.config.getOrThrow<string>(
      'LOCAL_ROOT',
    );
  }

  async list(): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    const scan = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        const fullPath = path.join(
          directory,
          entry.name,
        );

        if (entry.isDirectory()) {
          await scan(fullPath);
          continue;
        }

        // 심볼릭 링크 및 일반 파일이 아닌 항목 제외
        if (!entry.isFile()) {
          continue;
        }

        const info = await stat(fullPath);

        const relativePath = path
          .relative(this.root, fullPath)
          .split(path.sep)
          .join('/');

        files.push({
          path: relativePath,
          size: info.size,
          modifiedTime: info.mtimeMs,
        });
      }
    };

    await scan(this.root);

    return files;
  }

  async read(filePath: string): Promise<Buffer> {
    return readFile(this.resolvePath(filePath));
  }

  async write(
    filePath: string,
    data: Buffer,
  ): Promise<void> {
    const fullPath = this.resolvePath(filePath);

    await mkdir(path.dirname(fullPath), {
      recursive: true,
    });

    await writeFile(fullPath, data);
  }

  private resolvePath(filePath: string): string {
    const root = path.resolve(this.root);
    const fullPath = path.resolve(root, filePath);
    const relative = path.relative(root, fullPath);

    if (
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error('Path escapes storage root');
    }

    return fullPath;
  }
}