import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { UserExistenceValidator } from './decorators/user-existence.decorator';
import { UserEntity } from './entities/user.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), JwtModule.register({})],
  providers: [UserExistenceValidator, JwtAuthGuard, RolesGuard],
  exports: [TypeOrmModule, UserExistenceValidator, JwtAuthGuard, RolesGuard],
})
export class SharedModule {}
