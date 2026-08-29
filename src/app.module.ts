import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from '../config/configuration';
import { typeOrmConfigFactory } from './typeorm.config';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './auth/auth.module';
import { NotificationModule } from './notification/notification.module';
import { ClassroomModule } from './classroom/classroom.module';
import { StudentModule } from './student/student.module';
import { ParentLinkModule } from './parent-link/parent-link.module';
import { AttendanceModule } from './attendance/attendance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: typeOrmConfigFactory,
    }),
    SharedModule,
    AuthModule,
    NotificationModule,
    ClassroomModule,
    StudentModule,
    ParentLinkModule,
    AttendanceModule,
  ],
})
export class AppModule {}
