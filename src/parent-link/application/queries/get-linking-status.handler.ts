import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async execute(): Promise<LinkingStatusEntry[]> {
    const [students, links, codes] = await Promise.all([
      this.studentRepository.find({ order: { name: 'ASC' } }),
      this.parentLinkRepository.find(),
      this.linkingCodeRepository.find(),
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

    return students.map((s) => ({
      studentId: s.id,
      studentName: s.name,
      linked: linkedStudentIds.has(s.id),
      activeCode: activeCodeByStudent.get(s.id) ?? null,
    }));
  }
}
