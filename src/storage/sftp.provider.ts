import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import SftpClient from 'ssh2-sftp-client';
import * as path from 'node:path';

import {
  StorageProvider,
  FileInfo,
} from './storage.interface';

@Injectable()
export class SftpProvider implements StorageProvider {
  private readonly client = new SftpClient();

  private readonly root: string;

  constructor(
    private readonly config: ConfigService,
  ) {
    this.root = this.config.getOrThrow<string>(
      'SFTP_ROOT',
    );
  }

  async connect(): Promise<void> {
    const agent = process.env.SSH_AUTH_SOCK;

    if (!agent) {
      throw new Error('SSH_AUTH_SOCK is missing');
    }

    await this.client.connect({
      host: this.config.getOrThrow<string>(
        'SFTP_HOST',
      ),

      port: Number(
        this.config.getOrThrow<string>(
          'SFTP_PORT',
        ),
      ),

      username: this.config.getOrThrow<string>(
        'SFTP_USERNAME',
      ),

      agent,
      readyTimeout: 10000,
    });
  }

  async disconnect(): Promise<void> {
    await this.client.end();
  }

  async list(): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    const scan = async (
      directory: string,
    ): Promise<void> => {
      const entries = await this.client.list(directory);

      for (const entry of entries) {
        const fullPath = path.posix.join(
          directory,
          entry.name,
        );

        if (entry.type === 'd') {
          await scan(fullPath);
          continue;
        }

        // 일반 파일만 동기화
        if (entry.type !== '-') {
          continue;
        }

        const relativePath = path.posix.relative(
          this.root,
          fullPath,
        );

        files.push({
          path: relativePath,
          size: entry.size,
          modifiedTime: entry.modifyTime,
        });
      }
    };

    await scan(this.root);

    return files;
  }

  async read(filePath: string): Promise<Buffer> {
    const result = await this.client.get(
      this.resolvePath(filePath),
    );

    if (!Buffer.isBuffer(result)) {
      throw new Error('Expected Buffer');
    }

    return result;
  }

  async write(
    filePath: string,
    data: Buffer,
  ): Promise<void> {
    const fullPath = this.resolvePath(filePath);

    await this.client.mkdir(
      path.posix.dirname(fullPath),
      true,
    );

    await this.client.put(data, fullPath);
  }

  private resolvePath(filePath: string): string {
    const root = path.posix.resolve(this.root);
    const fullPath = path.posix.resolve(root, filePath);
    const relative = path.posix.relative(root, fullPath);

    if (
      relative === '..' ||
      relative.startsWith('../') ||
      path.posix.isAbsolute(relative)
    ) {
      throw new Error('Path escapes storage root');
    }

    return fullPath;
  }
}