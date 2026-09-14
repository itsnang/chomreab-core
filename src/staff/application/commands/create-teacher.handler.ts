import * as bcrypt from 'bcrypt';
import { ConflictException, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, UserRole } from '../../../shared/entities/user.entity';
import { generateTempPassword } from '../generate-temp-password';
import { CreateTeacherCommand } from './create-teacher.command';

export interface CreatedTeacher {
  id: string;
  name: string;
  email: string;
  temporaryPassword: string;
}

@Injectable()
@CommandHandler(CreateTeacherCommand)
export class CreateTeacherHandler implements ICommandHandler<
  CreateTeacherCommand,
  CreatedTeacher
> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async execute(command: CreateTeacherCommand): Promise<CreatedTeacher> {
    const existing = await this.userRepository.findOneBy({
      email: command.email,
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const temporaryPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const user = this.userRepository.create({
      id: crypto.randomUUID(),
      name: command.name,
      email: command.email,
      passwordHash,
      role: UserRole.TEACHER,
      // The admin reads this password aloud or pastes it to the teacher, so it
      // has been seen by someone other than its owner — the teacher has to
      // replace it before they can use the app.
      mustChangePassword: true,
    });
    await this.userRepository.save(user);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      temporaryPassword,
    };
  }
}
