import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../../config/env.config';
import { NotificationGateway } from './gateways/notification.gateway';

@Module({
  imports: [
    JwtModule.register({
      secret: env.JWT_SECRET,
    }),
  ],
  providers: [NotificationGateway],
  exports: [NotificationGateway],
})
export class NotificationModule {}
