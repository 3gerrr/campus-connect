import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { EnrollmentService } from '../enrollment/enrollment.service';

interface AuthedSocketData {
  id: string;
  role: string;
  universityId: string;
}

/**
 * IMPORTANT DESIGN DECISION: joining a room is NOT a separate permission
 * system. `handleSubscribe` calls the exact same `EnrollmentService.assertCanView`
 * used by the REST `GET /announcements/offering/:id` endpoint. This is
 * deliberate -- if we maintained a second, parallel notion of "who can see
 * this course" just for sockets, the two would eventually drift and one of
 * them would become the actual security boundary by accident. There is
 * exactly one source of truth for course-offering access, and both the
 * REST layer and the realtime layer call into it.
 *
 * KNOWN TRADEOFF (documented, not hidden): the JWT is verified once, at
 * connection time, in `handleConnection`. If a socket stays open longer
 * than the access token's 15-minute lifetime, we do not re-verify it on
 * every message. A production hardening pass would either issue short-
 * lived, socket-specific tokens or re-authenticate the socket on a timer.
 * For a prototype this is an acceptable, explicitly-noted gap -- it is
 * not something to silently accept as "done."
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private jwtService: JwtService,
    private enrollmentService: EnrollmentService,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token || client.handshake.query?.token;
    if (!token) {
      this.logger.warn(`Socket ${client.id} connected without a token -- disconnecting`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token as string);
      const userData: AuthedSocketData = {
        id: payload.sub,
        role: payload.role,
        universityId: payload.universityId,
      };
      client.data.user = userData;
      // Every authenticated socket auto-joins its own personal room --
      // this is what lets the reminder scheduler (RemindersService) push a
      // deadline reminder to exactly one user, independent of which
      // course rooms they've subscribed to. Course rooms (below) are
      // permission-checked per-course; this personal room needs no
      // separate check since it's scoped to the user's own id.
      client.join(`user:${userData.id}`);
    } catch {
      this.logger.warn(`Socket ${client.id} presented an invalid/expired token -- disconnecting`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe:course')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() courseOfferingId: string,
  ) {
    const user: AuthedSocketData | undefined = client.data.user;
    if (!user) return; // handleConnection already disconnects unauthenticated sockets

    try {
      await this.enrollmentService.assertCanView(user.id, user.role, courseOfferingId);
      client.join(`course:${courseOfferingId}`);
      client.emit('subscribe:ack', { courseOfferingId, status: 'ok' });
    } catch {
      // Deliberately vague to the client -- same principle as the REST 403,
      // we don't want to leak whether the courseOfferingId even exists to
      // someone who isn't allowed to see it.
      client.emit('subscribe:ack', { courseOfferingId, status: 'forbidden' });
    }
  }

  @SubscribeMessage('unsubscribe:course')
  handleUnsubscribe(@ConnectedSocket() client: Socket, @MessageBody() courseOfferingId: string) {
    client.leave(`course:${courseOfferingId}`);
  }

  // Called by AnnouncementsService after a successful create -- never
  // called directly by a client message, so there's no path for a client
  // to trigger a broadcast without actually posting through the guarded
  // REST endpoint first.
  emitNewAnnouncement(courseOfferingId: string, announcement: unknown) {
    this.server.to(`course:${courseOfferingId}`).emit('announcement:new', announcement);
  }

  emitAnnouncementShared(courseOfferingId: string, announcementId: string) {
    this.server.to(`course:${courseOfferingId}`).emit('announcement:shared', { announcementId });
  }

  // Personal delivery, not a course broadcast -- used by RemindersService
  // since two students in the same course can have different reminder
  // lead times, so "everyone in this course gets reminded now" would be
  // wrong.
  emitToUser(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
