import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import { SchoolSettingsEntity } from '../../infrastructure/entities/school-settings.entity';
import { UpdateSchoolSettingsCommand } from './update-school-settings.command';

@Injectable()
@CommandHandler(UpdateSchoolSettingsCommand)
export class UpdateSchoolSettingsHandler implements ICommandHandler<
  UpdateSchoolSettingsCommand,
  SchoolSettingsEntity
> {
  constructor(
    @InjectRepository(SchoolSettingsEntity)
    private readonly repository: Repository<SchoolSettingsEntity>,
  ) {}

  async execute(
    command: UpdateSchoolSettingsCommand,
  ): Promise<SchoolSettingsEntity> {
    const settings = new ScopedRepository(this.repository, command.schoolId);
    return settings.save(
      settings.create({
        schoolName: command.schoolName,
        lateCutoffMinutes: command.lateCutoffMinutes,
        absenceMessageTemplate: command.absenceMessageTemplate,
      }),
    );
  }
}
