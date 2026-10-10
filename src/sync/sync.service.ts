import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { LocalProvider } from '../storage/local.provider';
import { SftpProvider } from '../storage/sftp.provider';

import { FileInfo } from '../storage/storage.interface';

@Injectable()
export class SyncService {
  constructor(
    private readonly local: LocalProvider,
    private readonly remote: SftpProvider,
  ) {}

  private hash(data: Buffer): string {
    return createHash('sha256')
      .update(data)
      .digest('hex');
  }

  async sync() {
    const results: Array<{
      file: string;
      status: string;
      reason?: string;
    }> = [];

    await this.remote.connect();

    try {
      const localFiles = await this.local.list();
      const remoteFiles = await this.remote.list();

      const remoteMap = new Map<string, FileInfo>(
        remoteFiles.map(file => [file.path, file]),
      );

      for (const file of localFiles) {
        const target = remoteMap.get(file.path);

        // 1. 대상에 없는 신규 파일
        if (!target) {
          try {
            const data = await this.local.read(file.path);

            await this.remote.write(file.path, data);

            results.push({
              file: file.path,
              status: 'SUCCESS',
            });
          } catch (error) {
            results.push({
              file: file.path,
              status: 'FAILED',
              reason: String(error),
            });
          }

          continue;
        }

        try {
          // 2. 크기가 같으면 실제 내용 확인
          if (file.size === target.size) {
            const localData = await this.local.read(
              file.path,
            );

            const remoteData = await this.remote.read(
              file.path,
            );

            if (
              this.hash(localData) ===
              this.hash(remoteData)
            ) {
              results.push({
                file: file.path,
                status: 'SKIPPED',
              });

              continue;
            }
          }

          // 3. 원격 파일이 더 최신인 경우
          // SFTP 수정 시간의 초 단위 정밀도를 고려
          if (
            target.modifiedTime >
            file.modifiedTime + 1000
          ) {
            results.push({
              file: file.path,
              status: 'CONFLICT',
              reason: 'Remote file is newer',
            });

            continue;
          }

          // 4. 변경 파일 전송
          const data = await this.local.read(file.path);

          await this.remote.write(file.path, data);

          results.push({
            file: file.path,
            status: 'SUCCESS',
          });
        } catch (error) {
          results.push({
            file: file.path,
            status: 'FAILED',
            reason: String(error),
          });
        }
      }

      return {
        totalFiles: localFiles.length,

        transferred: results.filter(
          result => result.status === 'SUCCESS',
        ).length,

        skipped: results.filter(
          result => result.status === 'SKIPPED',
        ).length,

        conflicts: results.filter(
          result => result.status === 'CONFLICT',
        ).length,

        failed: results.filter(
          result => result.status === 'FAILED',
        ).length,

        results,
      };
    } finally {
      await this.remote.disconnect();
    }
  }
}