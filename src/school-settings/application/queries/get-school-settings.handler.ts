import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import {
  DEFAULT_SCHOOL_SETTINGS,
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

  async execute(query: GetSchoolSettingsQuery): Promise<SchoolSettingsEntity> {
    const settings = new ScopedRepository(this.repository, query.schoolId);
    const existing = await settings.findOneBy({});
    if (existing) return existing;
    return settings.save(settings.create({ ...DEFAULT_SCHOOL_SETTINGS }));
  }
}
