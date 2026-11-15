import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AvatarsService } from './avatars.service';

@Controller('avatars')
export class AvatarsController {
  constructor(private avatars: AvatarsService) {}

  /** Signed-in users can view pictures of people in their own institution. */
  @UseGuards(JwtAuthGuard)
  @Get(':file')
  async file(
    @Req() req: any,
    @Param('file') file: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const avatar = await this.avatars.read(
      file,
      req.user.institutionId ?? null
    );
    response.setHeader('Content-Type', avatar.mime);
    // File names are unique per upload, so the browser may cache them.
    response.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // The web app (another port on the same site) renders these in <img>.
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    return new StreamableFile(avatar.buffer);
  }
}
