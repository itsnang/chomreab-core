import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { UserEntity, UserRole } from '../../../shared/entities/user.entity';
import { UpdateTeacherCommand } from './update-teacher.command';

@Injectable()
@CommandHandler(UpdateTeacherCommand)
export class UpdateTeacherHandler implements ICommandHandler<
  UpdateTeacherCommand,
  UserEntity
> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async execute(command: UpdateTeacherCommand): Promise<UserEntity> {
    const teacher = await this.userRepository.findOneBy({
      id: command.id,
      role: UserRole.TEACHER,
    });
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    if (command.email !== undefined && command.email !== teacher.email) {
      // Email is the login identity, so it has to stay unique across every
      // account, not just among teachers.
      const taken = await this.userRepository.findOneBy({
        email: command.email,
        id: Not(command.id),
      });
      if (taken) {
        throw new ConflictException('A user with this email already exists');
      }
      teacher.email = command.email;
    }

    if (command.name !== undefined) teacher.name = command.name;

    return this.userRepository.save(teacher);
  }
}
