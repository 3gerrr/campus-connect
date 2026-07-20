import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditLogService } from '../audit-logs/audit-logs.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ExpoPushService } from '../push/expo-push.service';
import { genesisHash, computeAnnouncementHash } from './hash-chain.util';
import {
  merkleRoot,
  inclusionProof,
  consistencyProof,
  toHex,
  fromHex,
} from '../common/merkle-tree';
import { Role, VerificationStatus, AnnouncementCategory } from '@prisma/client';

interface AttachmentInput {
  url: string;
  fileName: string;
  fileType: string;
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private enrollmentService: EnrollmentService,
    private realtimeGateway: RealtimeGateway,
    private expoPushService: ExpoPushService,
  ) {}

  /**
   * Lecturers post directly on their own course offering. Representatives
   * may only post if currently APPROVED for that SPECIFIC offering -- this
   * is checked here at the data layer, not left to the route/UI.
   */
  async post(
    senderId: string,
    senderRole: Role,
    courseOfferingId: string,
    category: AnnouncementCategory,
    content: string,
    attachments?: AttachmentInput[],
    expiresAt?: Date,
    parentId?: string,
  ) {
    if (senderRole === Role.STUDENT) {
      const rep = await this.prisma.representative.findFirst({
        where: { userId: senderId, courseOfferingId, status: VerificationStatus.APPROVED },
      });
      if (!rep) {
        throw new ForbiddenException(
          'You are not an approved representative for this course offering',
        );
      }
    } else if (senderRole === Role.LECTURER) {
      const offering = await this.prisma.courseOffering.findUnique({
        where: { id: courseOfferingId },
      });
      if (offering?.lecturerId !== senderId) {
        throw new ForbiddenException('You do not lecture this course offering');
      }
    } else if (senderRole !== Role.UNIVERSITY_ADMIN && senderRole !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('You are not permitted to post announcements');
    }

    const orderedAttachments = (attachments ?? []).map((a, index) => ({ ...a, order: index }));

    // Everything below runs inside one transaction, holding a Postgres
    // advisory lock scoped to this courseOfferingId for its duration. That
    // lock is what prevents two concurrent posts to the SAME course (e.g.
    // a lecturer and an approved rep posting at the same instant) from both
    // reading the same "last" row and forking the hash chain -- without it,
    // the chain's tamper-evidence guarantee would have a race-condition
    // sized hole in it. The lock is per-courseOfferingId (hashed into a
    // bigint via hashtext), not a global lock, so unrelated courses are
    // never blocked by each other.
    const announcement = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${courseOfferingId}))`;

      const last = await tx.announcement.findFirst({
        where: { courseOfferingId },
        orderBy: { sequence: 'desc' },
      });

      const sequence = (last?.sequence ?? 0) + 1;
      const previousHash = last?.contentHash ?? genesisHash(courseOfferingId);
      const createdAt = new Date();
      const contentHash = computeAnnouncementHash({
        previousHash,
        sequence,
        courseOfferingId,
        senderId,
        category,
        content,
        parentId: parentId ?? null,
        createdAt,
        attachments: orderedAttachments,
      });

      return tx.announcement.create({
        data: {
          courseOfferingId,
          senderId,
          category,
          content,
          parentId,
          expiresAt,
          createdAt,
          sequence,
          previousHash,
          contentHash,
          attachments: orderedAttachments.length ? { create: orderedAttachments } : undefined,
        },
        include: {
          attachments: { orderBy: { order: 'asc' } },
          sender: { select: { name: true, role: true } },
          shares: { select: { sharedById: true, createdAt: true } },
        },
      });
    });

    await this.auditLog.record(senderId, 'ANNOUNCEMENT_POSTED', announcement.id, {
      courseOfferingId,
      category,
      sequence: announcement.sequence,
    });

    // Broadcast to anyone currently subscribed to this course's room. This
    // is purely a notification path -- it doesn't grant anyone access who
    // wasn't already allowed to subscribe (see RealtimeGateway.handleSubscribe).
    this.realtimeGateway.emitNewAnnouncement(courseOfferingId, announcement);

    // Fire-and-forget: a slow or failing Expo API call must never delay or
    // fail the post() response, matching the same tolerance-for-loss
    // already implicit in the unawaited socket emit above.
    this.expoPushService
      .notifyAnnouncementPosted(
        { id: announcement.id, category: announcement.category, courseOfferingId },
        senderId,
      )
      .catch((err) => this.logger.error(`push notify failed for announcement ${announcement.id}`, err));

    return announcement;
  }

  // Corrections are new rows linked to the original -- the original row is
  // never mutated. This preserves a verifiable history of what was actually
  // said and when, which matters for a trust-chain product.
  async postCorrection(senderId: string, senderRole: Role, originalId: string, content: string) {
    const original = await this.prisma.announcement.findUnique({ where: { id: originalId } });
    if (!original) throw new NotFoundException('Original announcement not found');

    return this.post(
      senderId,
      senderRole,
      original.courseOfferingId,
      original.category,
      content,
      undefined,
      original.expiresAt ?? undefined,
      original.id,
    );
  }

  // Amplify/share WITHOUT editing -- creates a share record pointing back at
  // the original; content always resolves to the immutable source row.
  async share(sharedById: string, announcementId: string) {
    const original = await this.prisma.announcement.findUnique({ where: { id: announcementId } });
    if (!original) throw new NotFoundException('Announcement not found');

    const share = await this.prisma.announcementShare.create({
      data: { announcementId, sharedById },
    });

    await this.auditLog.record(sharedById, 'ANNOUNCEMENT_SHARED', announcementId, {});

    this.realtimeGateway.emitAnnouncementShared(original.courseOfferingId, announcementId);

    return share;
  }

  // Enrollment-gated read -- a user who isn't enrolled, the lecturer, or an
  // approved rep for this offering gets a 403, not a filtered empty list.
  async listForOffering(userId: string, userRole: string, courseOfferingId: string) {
    await this.enrollmentService.assertCanView(userId, userRole, courseOfferingId);

    const now = new Date();
    return this.prisma.announcement.findMany({
      where: {
        courseOfferingId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { name: true, role: true } },
        attachments: { orderBy: { order: 'asc' } },
        shares: { select: { sharedById: true, createdAt: true } },
      },
    });
  }

  /**
   * Records that this user has actually opened/viewed this announcement.
   * Idempotent (upsert) -- re-marking something already read just updates
   * the timestamp rather than erroring or creating duplicates. This is the
   * simplest possible engagement signal, captured from day one specifically
   * so a read-rate or engagement trend can be computed later -- that data
   * cannot be reconstructed retroactively if collection starts late.
   */
  async markAsRead(userId: string, announcementId: string) {
    return this.prisma.announcementReadReceipt.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      update: { readAt: new Date() },
      create: { announcementId, userId },
    });
  }

  /**
   * Recomputes the entire hash chain for a course offering from scratch and
   * compares it against what's stored. Same access control as reading the
   * feed itself -- chain contents shouldn't leak to anyone who couldn't
   * already see the announcements.
   *
   * This deliberately checks EVERY row every time rather than caching a
   * "last known good" checkpoint -- for a prototype's data volumes this is
   * cheap, and a scan-based verifier can't itself be fooled by a stale
   * checkpoint. At real scale you'd want periodic checkpointing (this is
   * exactly the tradeoff Certificate Transparency's Merkle-tree structure
   * exists to avoid -- O(log n) proofs instead of O(n) -- worth revisiting
   * if this table grows into the millions of rows).
   */
  async verifyChain(userId: string, userRole: string, courseOfferingId: string) {
    await this.enrollmentService.assertCanView(userId, userRole, courseOfferingId);

    const all = await this.prisma.announcement.findMany({
      where: { courseOfferingId },
      orderBy: { sequence: 'asc' },
      include: { attachments: { orderBy: { order: 'asc' } } },
    });

    let expectedPreviousHash = genesisHash(courseOfferingId);

    for (const announcement of all) {
      if (announcement.previousHash !== expectedPreviousHash) {
        return {
          valid: false,
          brokenAtSequence: announcement.sequence,
          brokenAnnouncementId: announcement.id,
          checkedCount: all.length,
        };
      }

      const recomputed = computeAnnouncementHash({
        previousHash: expectedPreviousHash,
        sequence: announcement.sequence,
        courseOfferingId,
        senderId: announcement.senderId,
        category: announcement.category,
        content: announcement.content,
        parentId: announcement.parentId,
        createdAt: announcement.createdAt,
        attachments: announcement.attachments.map((a) => ({
          url: a.url,
          fileName: a.fileName,
          fileType: a.fileType,
        })),
      });

      if (recomputed !== announcement.contentHash) {
        return {
          valid: false,
          brokenAtSequence: announcement.sequence,
          brokenAnnouncementId: announcement.id,
          checkedCount: all.length,
        };
      }

      expectedPreviousHash = announcement.contentHash;
    }

    return { valid: true, checkedCount: all.length };
  }

  /**
   * Returns a portable, O(log n)-sized cryptographic proof that one
   * specific announcement is included in this course's official history,
   * anchored to a root hash. Unlike verifyChain (which requires querying
   * every row and only makes sense as a call against THIS API), this proof
   * is self-contained: an auditor, a screenshot, a printed page, or a
   * dispute-resolution process can hold onto {rootHash, proof, leafIndex,
   * treeSize} independently and verify it later without needing API access
   * at all, as long as they trust the rootHash's provenance (e.g. it was
   * shared/pinned at the time).
   *
   * NOTE ON SCOPE: the tree is rebuilt from all of this course's
   * announcement hashes on every call -- O(n) server-side work per
   * request, same tradeoff noted on verifyChain. The payoff isn't server
   * compute (that would need checkpoint caching, a real future step, not
   * done here) -- it's that the PROOF returned to the caller stays small
   * and cheap to verify regardless of how large the course's history gets.
   */
  async getInclusionProof(
    userId: string,
    userRole: string,
    courseOfferingId: string,
    announcementId: string,
  ) {
    await this.enrollmentService.assertCanView(userId, userRole, courseOfferingId);

    const all = await this.prisma.announcement.findMany({
      where: { courseOfferingId },
      orderBy: { sequence: 'asc' },
      select: { id: true, contentHash: true },
    });

    const index = all.findIndex((a) => a.id === announcementId);
    if (index === -1) {
      throw new NotFoundException('Announcement not found in this course offering');
    }

    const leaves = all.map((a) => fromHex(a.contentHash));
    const root = merkleRoot(leaves);
    const proof = inclusionProof(index, leaves);

    return {
      announcementId,
      leafIndex: index,
      treeSize: leaves.length,
      rootHash: toHex(root),
      proof: proof.map(toHex),
    };
  }

  /**
   * Proof that the history at some earlier size (oldSize) is an unaltered
   * prefix of the history now -- i.e., proof that nothing was inserted,
   * deleted, or reordered in between. This is the piece that makes the
   * hash chain's "detectable after the fact" property actually checkable
   * by someone who isn't re-scanning the whole table: if you recorded a
   * root hash and size at some point in the past, this proves the chain
   * grew from exactly that state, in a few hashes, not a full rescan.
   */
  async getConsistencyProof(
    userId: string,
    userRole: string,
    courseOfferingId: string,
    oldSize: number,
  ) {
    await this.enrollmentService.assertCanView(userId, userRole, courseOfferingId);

    const all = await this.prisma.announcement.findMany({
      where: { courseOfferingId },
      orderBy: { sequence: 'asc' },
      select: { contentHash: true },
    });

    if (!Number.isInteger(oldSize) || oldSize < 1 || oldSize > all.length) {
      throw new BadRequestException(
        `oldSize must be an integer between 1 and ${all.length} (current tree size)`,
      );
    }

    const leaves = all.map((a) => fromHex(a.contentHash));
    const oldRoot = merkleRoot(leaves.slice(0, oldSize));
    const newRoot = merkleRoot(leaves);
    const proof = consistencyProof(oldSize, leaves);

    return {
      oldSize,
      newSize: leaves.length,
      oldRootHash: toHex(oldRoot),
      newRootHash: toHex(newRoot),
      proof: proof.map(toHex),
    };
  }
}
