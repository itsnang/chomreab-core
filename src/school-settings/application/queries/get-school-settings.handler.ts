import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEFAULT_SCHOOL_SETTINGS,
  SCHOOL_SETTINGS_ID,
  SchoolSettingsEntity,
} from '../../infrastructure/entities/school-settings.entity';
import { GetSchoolSettingsQuery } from './get-school-settings.query';

@Injectable()
@QueryHandler(GetSchoolSettingsQuery)
export class GetSchoolSettingsHandler implements IQueryHandler<
  GetSchoolSettingsQuery,
  SchoolSettingsEntity
> {
  constructor(
    @InjectRepository(SchoolSettingsEntity)
    private readonly repository: Repository<SchoolSettingsEntity>,
  ) {}

  async execute(): Promise<SchoolSettingsEntity> {
    const existing = await this.repository.findOneBy({
      id: SCHOOL_SETTINGS_ID,
    });
    if (existing) return existing;
    return this.repository.save(
      this.repository.create({
        id: SCHOOL_SETTINGS_ID,
        ...DEFAULT_SCHOOL_SETTINGS,
      }),
    );
  }
}
