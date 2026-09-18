import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
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
    const users = new ScopedRepository(this.userRepository, command.schoolId);
    const teacher = await users.findOneBy({
      id: command.id,
      role: UserRole.TEACHER,
    });
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    if (command.email !== undefined && command.email !== teacher.email) {
      // Email is the login identity, so it has to stay unique within this
      // School — not globally, since the same address may exist at another
      // School entirely (user.entity.ts).
      const taken = await users.findOneBy({
        email: command.email,
        id: Not(command.id),
      });
      if (taken) {
        throw new ConflictException('A user with this email already exists');
      }
      teacher.email = command.email;
    }

    if (command.name !== undefined) teacher.name = command.name;

    return users.save(teacher);
  }
}
