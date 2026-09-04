import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { GetSchoolSettingsHandler } from '../../../src/school-settings/application/queries/get-school-settings.handler';
import { GetSchoolSettingsQuery } from '../../../src/school-settings/application/queries/get-school-settings.query';
import { UpdateSchoolSettingsHandler } from '../../../src/school-settings/application/commands/update-school-settings.handler';
import { UpdateSchoolSettingsCommand } from '../../../src/school-settings/application/commands/update-school-settings.command';
import { SchoolSettingsService } from '../../../src/school-settings/application/services/school-settings.service';
import {
  SCHOOL_SETTINGS_ID,
  SchoolSettingsEntity,
} from '../../../src/school-settings/infrastructure/entities/school-settings.entity';

describe('School settings', () => {
  let getHandler: GetSchoolSettingsHandler;
  let updateHandler: UpdateSchoolSettingsHandler;
  let service: SchoolSettingsService;
  let repo: { create: jest.Mock; save: jest.Mock; findOneBy: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn(
        (v: Partial<SchoolSettingsEntity>) => v as SchoolSettingsEntity,
      ),
      save: jest.fn((v: SchoolSettingsEntity) => Promise.resolve(v)),
      findOneBy: jest.fn(),
    };
    configService = { get: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GetSchoolSettingsHandler,
        UpdateSchoolSettingsHandler,
        SchoolSettingsService,
        { provide: getRepositoryToken(SchoolSettingsEntity), useValue: repo },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    getHandler = module.get(GetSchoolSettingsHandler);
    updateHandler = module.get(UpdateSchoolSettingsHandler);
    service = module.get(SchoolSettingsService);
  });

  it('creates default settings on first read', async () => {
    repo.findOneBy.mockResolvedValue(null);
    const result = await getHandler.execute(new GetSchoolSettingsQuery());
    expect(result.id).toBe(SCHOOL_SETTINGS_ID);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('returns existing settings without re-saving', async () => {
    repo.findOneBy.mockResolvedValue({
      id: SCHOOL_SETTINGS_ID,
      schoolName: 'Existing',
    });
    const result = await getHandler.execute(new GetSchoolSettingsQuery());
    expect(result.schoolName).toBe('Existing');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('updates settings', async () => {
    repo.findOneBy.mockResolvedValue(null);
    const result = await updateHandler.execute(
      new UpdateSchoolSettingsCommand(
        'New School',
        20,
        'Absent: {{student_name}}',
        null,
      ),
    );
    expect(result.schoolName).toBe('New School');
    expect(result.lateCutoffMinutes).toBe(20);
  });

  it('preserves the existing bot token when none is provided in the update', async () => {
    repo.findOneBy.mockResolvedValue({
      id: SCHOOL_SETTINGS_ID,
      telegramBotToken: 'existing-token',
    });
    const result = await updateHandler.execute(
      new UpdateSchoolSettingsCommand(
        'New School',
        20,
        'Absent: {{student_name}}',
        null,
      ),
    );
    expect(result.telegramBotToken).toBe('existing-token');
  });

  it('overwrites the bot token when a new one is provided', async () => {
    repo.findOneBy.mockResolvedValue({
      id: SCHOOL_SETTINGS_ID,
      telegramBotToken: 'old-token',
    });
    const result = await updateHandler.execute(
      new UpdateSchoolSettingsCommand(
        'New School',
        20,
        'Absent: {{student_name}}',
        'new-token',
      ),
    );
    expect(result.telegramBotToken).toBe('new-token');
  });

  it('falls back to the env var when no bot token override is saved', async () => {
    repo.findOneBy.mockResolvedValue({
      id: SCHOOL_SETTINGS_ID,
      telegramBotToken: null,
    });
    configService.get.mockReturnValue('env-token');
    const token = await service.getEffectiveBotToken();
    expect(token).toBe('env-token');
  });

  it('prefers the saved bot token override over the env var', async () => {
    repo.findOneBy.mockResolvedValue({
      id: SCHOOL_SETTINGS_ID,
      telegramBotToken: 'db-token',
    });
    const token = await service.getEffectiveBotToken();
    expect(token).toBe('db-token');
  });

  it('returns the default absence template when settings have never been saved', async () => {
    repo.findOneBy.mockResolvedValue(null);
    const template = await service.getAbsenceTemplate();
    expect(template).toContain('{{student_name}}');
  });
});
