import { Body, Controller, Headers, Ip, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Role } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  signup(@Body() body: { name: string; email: string; password: string; role: Role }) {
    return this.authService.signup(body.name, body.email, body.password, body.role);
  }

  @Post('login')
  login(
    @Body() body: { email: string; password: string; deviceName?: string },
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.login(body.email, body.password, body.deviceName, ip, userAgent);
  }

  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
  }
}
