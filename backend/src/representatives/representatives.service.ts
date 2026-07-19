import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditLogService } from '../audit-logs/audit-logs.service';
import { RepresentativeType, VerificationStatus } from '@prisma/client';

@Injectable()
export class RepresentativesService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /**
   * A student applies to represent ONE course offering (not a whole
   * department). Optional supporting document (e.g. a scan of their
   * registration slip) can be attached to help the lecturer decide.
   */
  async apply(
    userId: string,
    courseOfferingId: string,
    type: RepresentativeType = RepresentativeType.PRIMARY,
    applicationNote?: string,
    supportingDocumentUrl?: string,
  ) {
    const offering = await this.prisma.courseOffering.findUnique({
      where: { id: courseOfferingId },
    });
    if (!offering) {
      throw new NotFoundException('Course offering not found');
    }

    return this.prisma.representative.create({
      data: {
        userId,
        courseOfferingId,
        type,
        applicationNote,
        supportingDocumentUrl,
        status: VerificationStatus.PENDING,
      },
    });
  }

  // Only the lecturer who owns THIS specific course offering can decide --
  // not any lecturer, and not scoped to the whole department.
  async decide(repId: string, decidedByUserId: string, approve: boolean) {
    const rep = await this.prisma.representative.findUnique({
      where: { id: repId },
      include: { courseOffering: true },
    });

    if (!rep) {
      throw new NotFoundException('Representative application not found');
    }
    if (rep.courseOffering.lecturerId !== decidedByUserId) {
      throw new ForbiddenException(
        'Only the lecturer of this course offering can approve representatives',
      );
    }

    const updated = await this.prisma.representative.update({
      where: { id: repId },
      data: {
        status: approve ? VerificationStatus.APPROVED : VerificationStatus.REJECTED,
        approvedById: decidedByUserId,
        approvedAt: new Date(),
      },
    });

    await this.auditLog.record(
      decidedByUserId,
      approve ? 'REP_APPROVED' : 'REP_REJECTED',
      repId,
      { courseOfferingId: rep.courseOfferingId, type: rep.type },
    );

    return updated;
  }

  async revoke(repId: string, revokedByUserId: string) {
    const rep = await this.prisma.representative.findUnique({
      where: { id: repId },
      include: { courseOffering: true },
    });

    if (!rep) throw new NotFoundException('Representative not found');
    if (rep.courseOffering.lecturerId !== revokedByUserId) {
      throw new ForbiddenException(
        'Only the lecturer of this course offering can revoke a representative',
      );
    }

    const updated = await this.prisma.representative.update({
      where: { id: repId },
      data: { status: VerificationStatus.REVOKED },
    });

    await this.auditLog.record(revokedByUserId, 'REP_REVOKED', repId, {
      courseOfferingId: rep.courseOfferingId,
    });

    return updated;
  }

  /**
   * Lists EVERY applicant for an offering -- includes supporting document
   * URLs and application notes, so this is only for the lecturer who owns
   * the offering (or an admin), never any authenticated user. Without this
   * check, any student could see another course's applicant list and their
   * uploaded documents by guessing/enumerating a courseOfferingId.
   */
  async listForOffering(courseOfferingId: string, callerId: string, callerRole: string) {
    if (callerRole !== 'UNIVERSITY_ADMIN' && callerRole !== 'SUPER_ADMIN') {
      const offering = await this.prisma.courseOffering.findUnique({
        where: { id: courseOfferingId },
      });
      if (!offering) throw new NotFoundException('Course offering not found');
      if (offering.lecturerId !== callerId) {
        throw new ForbiddenException(
          'Only the lecturer of this course offering can view its applicants',
        );
      }
    }

    return this.prisma.representative.findMany({
      where: { courseOfferingId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // A student checking their OWN application status for a course -- scoped
  // to userId server-side, not just filtered client-side, so there's no way
  // to pass someone else's id and see their status.
  async getMyApplication(userId: string, courseOfferingId: string) {
    return this.prisma.representative.findUnique({
      where: { userId_courseOfferingId: { userId, courseOfferingId } },
    });
  }
}
