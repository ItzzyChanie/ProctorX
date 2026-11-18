import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RetentionController } from './retention.controller';
import { RetentionService } from './retention.service';

@Module({
  imports: [AuthModule],
  controllers: [RetentionController],
  providers: [RetentionService],
})
export class RetentionModule {}
