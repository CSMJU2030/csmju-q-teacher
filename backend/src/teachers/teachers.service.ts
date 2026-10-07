import { Injectable } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A teacher who has published office hours. The list is derived from the
 * office-hours table: there is no teachers table, because a person belongs to
 * Core Hub (data-dictionary.md 3). A teacher is shown by `personCode`; the
 * name can only be read from Core Hub by lecturer / staff / admin, so a student
 * sees the code (reference-data.md 5).
 */
export class TeacherResponse {
  @ApiProperty({ description: 'ค่า sub ของอาจารย์ — ใช้เป็น teacherCoreUserId ในคำขออื่น' })
  coreUserId!: string;

  @ApiProperty({ nullable: true, type: String, description: 'รหัสบุคลากรจาก Core Hub (แสดงแทนชื่อ)' })
  personCode!: string | null;
}

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(skip: number, take: number): Promise<{ items: TeacherResponse[]; total: number }> {
    const rows = await this.prisma.officeHour.findMany({
      orderBy: [{ teacherCoreUserId: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });

    const byTeacher = new Map<string, TeacherResponse>();
    for (const row of rows) {
      const known = byTeacher.get(row.teacherCoreUserId);
      if (!known) {
        byTeacher.set(row.teacherCoreUserId, {
          coreUserId: row.teacherCoreUserId,
          personCode: row.teacherPersonCode,
        });
      } else if (known.personCode === null && row.teacherPersonCode !== null) {
        known.personCode = row.teacherPersonCode;
      }
    }

    // deterministic: by code (people without one last), then by id
    const all = [...byTeacher.values()].sort((a, b) => {
      if (a.personCode !== b.personCode) {
        if (a.personCode === null) return 1;
        if (b.personCode === null) return -1;
        return a.personCode < b.personCode ? -1 : 1;
      }
      return a.coreUserId < b.coreUserId ? -1 : 1;
    });

    return { items: all.slice(skip, skip + take), total: all.length };
  }
}
