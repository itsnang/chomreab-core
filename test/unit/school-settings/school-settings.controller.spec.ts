import { Test } from '@nestjs/testing';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { SchoolSettingsController } from '../../../src/school-settings/api/controllers/school-settings.controller';
import { GetSchoolSettingsQuery } from '../../../src/school-settings/application/queries/get-school-settings.query';
import { SchoolSettingsService } from '../../../src/school-settings/application/services/school-settings.service';
import { JwtAuthGuard } from '../../../src/shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../src/shared/guards/roles.guard';

describe('SchoolSettingsController', () => {
  let controller: SchoolSettingsController;
  let commandBus: { execute: jest.Mock };
  let queryBus: { execute: jest.Mock };
  let schoolSettingsService: { getBotUsername: jest.Mock };

  beforeEach(async () => {
    commandBus = { execute: jest.fn() };
    queryBus = {
      execute: jest.fn().mockResolvedValue({
        schoolId: 'school-1',
        schoolName: 'Rise Tutoring',
        lateCutoffMinutes: 15,
        absenceMessageTemplate: 'template',
      }),
    };
    schoolSettingsService = {
      getBotUsername: jest.fn().mockReturnValue('ChomreabBot'),
    };

    const module = await Test.createTestingModule({
      controllers: [SchoolSettingsController],
      providers: [
        { provide: CommandBus, useValue: commandBus },
        { provide: QueryBus, useValue: queryBus },
        { provide: SchoolSettingsService, useValue: schoolSettingsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(SchoolSettingsController);
  });

  it("merges the shared bot's username onto the settings read, from config rather than the School row", async () => {
    const result = await controller.get('school-1');

    expect(queryBus.execute).toHaveBeenCalledWith(
      new GetSchoolSettingsQuery('school-1'),
    );
    expect(result.botUsername).toBe('ChomreabBot');
    expect(result.schoolName).toBe('Rise Tutoring');
  });

  it('reports no bot username when none is configured, instead of throwing', async () => {
    schoolSettingsService.getBotUsername.mockReturnValue(undefined);
    const result = await controller.get('school-1');
    expect(result.botUsername).toBeNull();
  });
});
