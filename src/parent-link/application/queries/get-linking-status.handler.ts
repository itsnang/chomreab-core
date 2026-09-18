import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScopedRepository } from '../../../shared/database/scoped-repository';
import { StudentEntity } from '../../../student/infrastructure/entities/student.entity';
import { LinkingCodeEntity } from '../../infrastructure/entities/linking-code.entity';
import { ParentLinkEntity } from '../../infrastructure/entities/parent-link.entity';
import { GetLinkingStatusQuery } from './get-linking-status.query';

export interface LinkingStatusEntry {
  studentId: string;
  studentName: string;
  linked: boolean;
  activeCode: string | null;
}

@Injectable()
@QueryHandler(GetLinkingStatusQuery)
export class GetLinkingStatusHandler implements IQueryHandler<
  GetLinkingStatusQuery,
  LinkingStatusEntry[]
> {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(ParentLinkEntity)
    private readonly parentLinkRepository: Repository<ParentLinkEntity>,
    @InjectRepository(LinkingCodeEntity)
    private readonly linkingCodeRepository: Repository<LinkingCodeEntity>,
  ) {}

  async execute(query: GetLinkingStatusQuery): Promise<LinkingStatusEntry[]> {
    const students = new ScopedRepository(
      this.studentRepository,
      query.schoolId,
    );
    const parentLinks = new ScopedRepository(
      this.parentLinkRepository,
      query.schoolId,
    );
    // Codes are looked up by schoolId here too, even though `code` itself is
    // globally unique — this listing is "codes this School generated", which
    // is exactly what schoolId scoping means; the global-uniqueness exception
    // is only about how a code is *redeemed* (link-parent.handler.ts), not
    // about who's allowed to see one.
    const linkingCodes = new ScopedRepository(
      this.linkingCodeRepository,
      query.schoolId,
    );

    const [studentRows, links, codes] = await Promise.all([
      students.find({ order: { name: 'ASC' } }),
      parentLinks.find(),
      linkingCodes.find(),
    ]);

    const linkedStudentIds = new Set(links.map((l) => l.studentId));
    const now = Date.now();
    const activeCodeByStudent = new Map<string, string>();
    for (const c of codes) {
      if (
        c.usedAt === null &&
        c.expiresAt.getTime() > now &&
        !activeCodeByStudent.has(c.studentId)
      ) {
        activeCodeByStudent.set(c.studentId, c.code);
      }
    }

    return studentRows.map((s) => ({
      studentId: s.id,
      studentName: s.name,
      linked: linkedStudentIds.has(s.id),
      activeCode: activeCodeByStudent.get(s.id) ?? null,
    }));
  }
}
