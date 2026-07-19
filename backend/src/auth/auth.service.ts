import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private sessionsService: SessionsService,
  ) {}

  /**
   * Self-registration, gated by the university's email domain -- this is
   * what ties a signup to a specific institution without an admin having to
   * manually create every account. Lecturers start unverified regardless of
   * domain match; a University Admin still has to confirm them (see
   * AdminService.verifyLecturer) before they can log in.
   */
  async signup(name: string, email: string, password: string, role: Role) {
    if (role === Role.SUPER_ADMIN || role === Role.UNIVERSITY_ADMIN) {
      throw new BadRequestException('Admin accounts cannot self-register');
    }

    const domain = email.split('@')[1];
    const university = await this.prisma.university.findUnique({ where: { domain } });
    if (!university) {
      throw new BadRequestException('Email domain is not recognized as a registered university');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('An account with this email already exists');

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        universityId: university.id,
        // Students don't need verification to use the app; lecturers do.
        verified: role !== Role.LECTURER,
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified,
    };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    // Lecturers must be verified by a University Admin before they can log in
    // and gain posting/approval privileges.
    if (user.role === 'LECTURER' && !user.verified) {
      throw new UnauthorizedException('Lecturer account pending university verification');
    }

    return user;
  }

  async login(email: string, password: string, deviceName?: string, ipAddress?: string, userAgent?: string) {
    const user = await this.validateUser(email, password);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      universityId: user.universityId,
    };

    // Track the device/IP for this login -- feeds the "log out everywhere"
    // capability and gives admins visibility into privileged-account access.
    await this.sessionsService.recordLogin(user.id, deviceName, ipAddress, userAgent);

    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '30d' }),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        verified: user.verified,
      },
    };
  }

  async refresh(refreshToken: string) {
    try {
      const decoded = this.jwtService.verify(refreshToken);
      const payload = {
        sub: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        universityId: decoded.universityId,
      };
      return { accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }) };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
