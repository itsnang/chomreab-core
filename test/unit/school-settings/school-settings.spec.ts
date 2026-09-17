import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { GetSchoolSettingsHandler } from '../../../src/school-settings/application/queries/get-school-settings.handler';
import { GetSchoolSettingsQuery } from '../../../src/school-settings/application/queries/get-school-settings.query';
import { UpdateSchoolSettingsHandler } from '../../../src/school-settings/application/commands/update-school-settings.handler';
import { UpdateSchoolSettingsCommand } from '../../../src/school-settings/application/commands/update-school-settings.command';
import { SchoolSettingsService } from '../../../src/school-settings/application/services/school-settings.service';
import { SchoolSettingsEntity } from '../../../src/school-settings/infrastructure/entities/school-settings.entity';

// `SchoolSettingsEntity` carries no Telegram fields any more — every School
// shares one bot (ADR-0007) — and its primary key is `schoolId` itself, not
// a generated id, since the relationship is exactly 1:1. These tests cover
// what's left: the upsert-on-first-read behaviour, that a read/write is
// scoped to the calling School, and the absence-template fallback.
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

  it('creates default settings on first read, keyed by schoolId', async () => {
    repo.findOneBy.mockResolvedValue(null);
    const result = await getHandler.execute(
      new GetSchoolSettingsQuery('school-1'),
    );
    expect(result.schoolId).toBe('school-1');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('returns existing settings without re-saving', async () => {
    repo.findOneBy.mockResolvedValue({
      schoolId: 'school-1',
      schoolName: 'Existing',
    });
    const result = await getHandler.execute(
      new GetSchoolSettingsQuery('school-1'),
    );
    expect(result.schoolName).toBe('Existing');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('reads scoped to the calling School, not any other', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await getHandler.execute(new GetSchoolSettingsQuery('school-2'));
    expect(repo.findOneBy).toHaveBeenCalledWith({ schoolId: 'school-2' });
  });

  it('updates settings for the calling School', async () => {
    const result = await updateHandler.execute(
      new UpdateSchoolSettingsCommand(
        'school-1',
        'New School',
        20,
        'Absent: {{student_name}}',
      ),
    );
    expect(result.schoolName).toBe('New School');
    expect(result.lateCutoffMinutes).toBe(20);
    expect(result.schoolId).toBe('school-1');
  });

  it('resolves the shared bot token from config, not per-school storage', () => {
    configService.get.mockReturnValue('env-token');
    const token = service.getEffectiveBotToken();
    expect(token).toBe('env-token');
    expect(configService.get).toHaveBeenCalledWith('telegram.botToken');
  });

  it('resolves the shared bot username from config', () => {
    configService.get.mockReturnValue('chomreabbot');
    const username = service.getBotUsername();
    expect(username).toBe('chomreabbot');
    expect(configService.get).toHaveBeenCalledWith('telegram.botUsername');
  });

  it('returns the default absence template when settings have never been saved', async () => {
    repo.findOneBy.mockResolvedValue(null);
    const template = await service.getAbsenceTemplate('school-1');
    expect(template).toContain('{{student_name}}');
  });

  it("returns a School's own saved absence template, not another School's", async () => {
    repo.findOneBy.mockResolvedValue({
      schoolId: 'school-1',
      absenceMessageTemplate: 'Custom: {{student_name}}',
    });
    const template = await service.getAbsenceTemplate('school-1');
    expect(template).toBe('Custom: {{student_name}}');
    expect(repo.findOneBy).toHaveBeenCalledWith({ schoolId: 'school-1' });
  });
});
