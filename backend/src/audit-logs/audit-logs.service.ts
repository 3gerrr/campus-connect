import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { genesisHash, chainHash, canonicalJSON } from '../common/hash-chain';
import { merkleRoot, inclusionProof, consistencyProof, toHex, fromHex } from '../common/merkle-tree';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Same hash-chain treatment as Announcement, and for the same reason: the
   * audit log exists specifically to hold privileged actors accountable,
   * which is meaningless if the log itself can be quietly rewritten by
   * someone with database access. Chained per university via a Postgres
   * advisory lock (same race-condition protection as the announcement
   * chain) so concurrent privileged actions across the platform can't fork
   * a single university's chain.
   *
   * `metadata` is hashed via `canonicalJSON`, NOT `JSON.stringify` directly
   * -- see common/hash-chain.ts for why: Postgres's `jsonb` column doesn't
   * guarantee key order survives a write/read round-trip, so a naive
   * JSON.stringify comparison could falsely report tampering on data
   * nobody touched.
   */
  async record(
    actorId: string,
    action: string,
    targetId: string,
    metadata?: Record<string, unknown>,
  ) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { universityId: true },
    });

    if (!actor) {
      // Audit logging must never itself throw and block the privileged
      // action it's recording -- fail safe by skipping the chain rather
      // than crashing the caller. This should only happen if actorId is
      // somehow invalid, which shouldn't occur given it always comes from
      // an authenticated request.
      this.logger.warn(`Could not resolve actor ${actorId} for audit log -- skipping`);
      return null;
    }

    const universityId = actor.universityId;
    const metadataForHash = canonicalJSON(metadata ?? {});

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${universityId} || ':audit'))`;

      const last = await tx.auditLog.findFirst({
        where: { universityId },
        orderBy: { sequence: 'desc' },
      });

      const sequence = (last?.sequence ?? 0) + 1;
      const previousHash = last?.contentHash ?? genesisHash(universityId, 'AUDIT_LOG');
      const createdAt = new Date();
      const contentHash = chainHash([
        previousHash,
        sequence,
        universityId,
        actorId,
        action,
        targetId,
        metadataForHash,
        createdAt.toISOString(),
      ]);

      return tx.auditLog.create({
        data: {
          actorId,
          action,
          targetId,
          metadata: metadata as Prisma.InputJsonValue | undefined,
          createdAt,
          universityId,
          sequence,
          previousHash,
          contentHash,
        },
      });
    });
  }

  async listForUniversity(universityId: string, limit = 100) {
    return this.prisma.auditLog.findMany({
      where: { universityId },
      orderBy: { sequence: 'desc' },
      take: limit,
      include: { actor: { select: { name: true, email: true, role: true } } },
    });
  }

  // Same recompute-and-compare approach as AnnouncementsService.verifyChain,
  // and the same O(n) tradeoff noted there.
  async verifyChain(universityId: string) {
    const all = await this.prisma.auditLog.findMany({
      where: { universityId },
      orderBy: { sequence: 'asc' },
    });

    let expectedPreviousHash = genesisHash(universityId, 'AUDIT_LOG');

    for (const log of all) {
      if (log.previousHash !== expectedPreviousHash) {
        return {
          valid: false,
          brokenAtSequence: log.sequence,
          brokenLogId: log.id,
          checkedCount: all.length,
        };
      }

      const recomputed = chainHash([
        expectedPreviousHash,
        log.sequence,
        universityId,
        log.actorId,
        log.action,
        log.targetId,
        canonicalJSON(log.metadata ?? {}),
        log.createdAt.toISOString(),
      ]);

      if (recomputed !== log.contentHash) {
        return {
          valid: false,
          brokenAtSequence: log.sequence,
          brokenLogId: log.id,
          checkedCount: all.length,
        };
      }

      expectedPreviousHash = log.contentHash;
    }

    return { valid: true, checkedCount: all.length };
  }

  // Same portable-proof pattern as AnnouncementsService.getInclusionProof --
  // see that method's comment for the rationale (self-contained, O(log n),
  // verifiable without API access to the rest of the log).
  async getInclusionProof(universityId: string, auditLogId: string) {
    const all = await this.prisma.auditLog.findMany({
      where: { universityId },
      orderBy: { sequence: 'asc' },
      select: { id: true, contentHash: true },
    });

    const index = all.findIndex((a) => a.id === auditLogId);
    if (index === -1) {
      throw new NotFoundException('Audit log entry not found for this university');
    }

    const leaves = all.map((a) => fromHex(a.contentHash));
    const root = merkleRoot(leaves);
    const proof = inclusionProof(index, leaves);

    return {
      auditLogId,
      leafIndex: index,
      treeSize: leaves.length,
      rootHash: toHex(root),
      proof: proof.map(toHex),
    };
  }

  async getConsistencyProof(universityId: string, oldSize: number) {
    const all = await this.prisma.auditLog.findMany({
      where: { universityId },
      orderBy: { sequence: 'asc' },
      select: { contentHash: true },
    });

    if (!Number.isInteger(oldSize) || oldSize < 1 || oldSize > all.length) {
      throw new BadRequestException(
        `oldSize must be an integer between 1 and ${all.length} (current log size)`,
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
