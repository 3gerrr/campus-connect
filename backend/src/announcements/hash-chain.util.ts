import { genesisHash as sharedGenesisHash, chainHash } from '../common/hash-chain';

export function genesisHash(courseOfferingId: string): string {
  return sharedGenesisHash(courseOfferingId, 'ANNOUNCEMENT');
}

interface AttachmentForHash {
  url: string;
  fileName: string;
  fileType: string;
}

interface AnnouncementHashInput {
  previousHash: string;
  sequence: number;
  courseOfferingId: string;
  senderId: string;
  category: string;
  content: string;
  parentId: string | null;
  createdAt: Date;
  // Attachments are plain String columns (not a jsonb field), so there's no
  // storage-layer key-reordering risk here the way there is for JSON
  // metadata -- but ORDER still matters: swapping which attachment is
  // "first" is itself a form of tampering (e.g. making a malicious link
  // display before the real slides), so we serialize them in the explicit
  // `order` they were submitted in, not however the DB happens to return
  // them.
  attachments: AttachmentForHash[];
}

/**
 * The exact same function is called at write-time (AnnouncementsService.post)
 * and at verify-time (AnnouncementsService.verifyChain). If these two call
 * sites ever computed the hash differently, verification would be
 * meaningless -- so this is the single implementation both paths import,
 * rather than two similar-looking copies that could drift.
 *
 * IMPORTANT: attachments are part of what's hashed. Without this, someone
 * could leave an announcement's text untouched and just change an
 * Attachment row's URL afterward (e.g. redirect "Lecture Slides" to
 * something else) and the chain would report everything as valid --
 * that's exactly the kind of quiet tampering this feature exists to catch.
 */
export function computeAnnouncementHash(input: AnnouncementHashInput): string {
  const attachmentsPart = input.attachments
    .map((a) => `${a.url}::${a.fileName}::${a.fileType}`)
    .join(';');

  return chainHash([
    input.previousHash,
    input.sequence,
    input.courseOfferingId,
    input.senderId,
    input.category,
    input.content,
    input.parentId ?? '',
    input.createdAt.toISOString(),
    attachmentsPart,
  ]);
}
