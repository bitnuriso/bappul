import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SyncController } from './sync/sync.controller';
import { SyncService } from './sync/sync.service';

import { LocalProvider } from './storage/local.provider';
import { SftpProvider } from './storage/sftp.provider';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],

  controllers: [
    SyncController,
  ],

  providers: [
    SyncService,
    LocalProvider,
    SftpProvider,
  ],
})
export class AppModule {}