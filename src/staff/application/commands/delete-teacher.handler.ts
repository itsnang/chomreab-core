import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, UserRole } from '../../../shared/entities/user.entity';
import { RefreshTokenEntity } from '../../../auth/infrastructure/entities/refresh-token.entity';
import { ClassroomEntity } from '../../../classroom/infrastructure/entities/classroom.entity';
import { DeleteTeacherCommand } from './delete-teacher.command';

@Injectable()
@CommandHandler(DeleteTeacherCommand)
export class DeleteTeacherHandler implements ICommandHandler<
  DeleteTeacherCommand,
  void
> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepository: Repository<RefreshTokenEntity>,
    @InjectRepository(ClassroomEntity)
    private readonly classroomRepository: Repository<ClassroomEntity>,
  ) {}

  async execute(command: DeleteTeacherCommand): Promise<void> {
    // Scoped to role: TEACHER so this endpoint can never be used to delete an
    // admin account even if an admin's id is passed in.
    const result = await this.userRepository.delete({
      id: command.id,
      role: UserRole.TEACHER,
    });
    if (!result.affected) {
      throw new NotFoundException('Teacher not found');
    }

    // Revoke the deleted teacher's access: kill any refresh tokens so their
    // session can't be renewed, and unassign them from any classroom so it
    // doesn't keep pointing at a deleted user id.
    await this.refreshTokenRepository.delete({ userId: command.id });
    await this.classroomRepository.update(
      { teacherId: command.id },
      { teacherId: null },
    );
  }
}
