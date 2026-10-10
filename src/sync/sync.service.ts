import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import SftpClient from 'ssh2-sftp-client';

import { readFile } from 'node:fs/promises';

@Injectable()
export class SyncService {
  constructor(
    private readonly config: ConfigService,
  ) {}

  async sync() {
    const sftp = new SftpClient();

    const localRoot = this.config.getOrThrow<string>(
      'LOCAL_ROOT',
    );

    const remoteRoot = this.config.getOrThrow<string>(
      'SFTP_ROOT',
    );

    const privateKeyPath = this.config.getOrThrow<string>(
      'SFTP_PRIVATE_KEY_PATH',
    );

    const privateKey = await readFile(privateKeyPath);

    try {
      // 1. Termux SFTP 연결
      await sftp.connect({
        host: this.config.getOrThrow<string>('SFTP_HOST'),
        port: Number(
          this.config.getOrThrow<string>('SFTP_PORT'),
        ),
        username: this.config.getOrThrow<string>(
          'SFTP_USERNAME',
        ),
        agent: process.env.SSH_AUTH_SOCK,
      });

      console.log('SFTP Connected');

      // 2. WSL 파일 경로
      const localPath = `${localRoot}/hello.txt`;

      // 3. Termux 파일 경로
      const remotePath = `${remoteRoot}/hello.txt`;

      // 4. 원격 폴더 확인 및 생성
      await sftp.mkdir(remoteRoot, true);

      // 5. 파일 전송
      await sftp.put(localPath, remotePath);

      console.log('File transferred successfully');

      return {
        status: 'SUCCESS',
        file: 'hello.txt',
      };
    } finally {
      await sftp.end();
    }
  }
}