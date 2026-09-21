import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { UserEntity } from './entities/user.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), JwtModule.register({})],
  providers: [JwtAuthGuard, RolesGuard],
  exports: [TypeOrmModule, JwtAuthGuard, RolesGuard],
})
export class SharedModule {}
