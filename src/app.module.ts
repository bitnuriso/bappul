
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SyncController } from './sync/sync.controller';
import { SyncService } from './sync/sync.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [SyncController],
  providers: [SyncService],
})
export class AppModule {}