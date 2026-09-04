import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, UserRole } from '../../../shared/entities/user.entity';
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
  }
}
