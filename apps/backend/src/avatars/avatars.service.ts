import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { runExclusive } from '../common/job-lock';

/** Value stored in users.profilePicture and served at GET /avatars/:file. */
const PREFIX = 'avatars/';
const MAX_BYTES = 2 * 1024 * 1024;
const FILE_PATTERN = /^[0-9a-f-]{36}\.(png|jpg|webp)$/;

const SIGNATURES: {
  ext: 'png' | 'jpg' | 'webp';
  mime: string;
  test: (b: Buffer) => boolean;
}[] = [
  {
    ext: 'png',
    mime: 'image/png',
    test: (b) =>
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: 'jpg',
    mime: 'image/jpeg',
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    test: (b) =>
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
];

/**
 * Profile pictures live on disk instead of as base64 in the users table, which
 * every authenticated request loads. The API keeps accepting data: URIs from
 * the existing forms and returns a short "avatars/<file>" reference.
 */
@Injectable()
export class AvatarsService implements OnModuleInit {
  private readonly logger = new Logger(AvatarsService.name);
  private readonly dir = join(process.cwd(), 'storage', 'avatars');

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    // Move pictures saved before this change out of the database.
    void runExclusive(this.prisma, 'avatar-backfill', () => this.backfill()).catch(
      (error) =>
      this.logger.error(`Avatar backfill failed: ${String(error)}`)
    );
  }

  /**
   * Turns form input into the value to store.
   * - undefined: no change requested
   * - '' / null: remove the picture
   * - the current reference: unchanged
   * - a PNG/JPEG/WebP data: URI: saved as a new file
   */
  async resolve(
    input: string | null | undefined,
    current?: string | null
  ): Promise<string | null | undefined> {
    if (input === undefined) return undefined;
    if (!input) return null;
    if (current && input === current) return undefined;
    if (input.startsWith(PREFIX)) {
      // A reference the client echoed back must be the user's own picture.
      throw new BadRequestException('Choose a PNG, JPEG, or WebP image');
    }
    return this.saveDataUri(input);
  }

  /** Deletes the file behind a previous reference once it is replaced. */
  async discard(
    previous: string | null | undefined,
    next: string | null | undefined
  ) {
    if (
      next === undefined ||
      !previous?.startsWith(PREFIX) ||
      previous === next
    )
      return;
    const file = previous.slice(PREFIX.length);
    if (FILE_PATTERN.test(file))
      await unlink(join(this.dir, file)).catch(() => undefined);
  }

  async read(file: string, viewerInstitutionId: string | null) {
    if (!FILE_PATTERN.test(file)) throw new NotFoundException();
    const owner = await this.prisma.user.findFirst({
      where: { profilePicture: `${PREFIX}${file}` },
      select: { institutionId: true },
    });
    if (!owner || owner.institutionId !== viewerInstitutionId)
      throw new NotFoundException();
    const buffer = await readFile(join(this.dir, basename(file))).catch(
      () => null
    );
    if (!buffer) throw new NotFoundException();
    const signature = SIGNATURES.find((item) => item.test(buffer));
    return { buffer, mime: signature?.mime ?? 'application/octet-stream' };
  }

  private async saveDataUri(input: string) {
    const match =
      /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(input);
    if (!match)
      throw new BadRequestException('Choose a PNG, JPEG, or WebP image');
    const buffer = Buffer.from(match[2]!, 'base64');
    if (!buffer.length || buffer.length > MAX_BYTES)
      throw new BadRequestException('Profile pictures must be 2 MB or smaller');
    // Trust the bytes, not the declared type.
    const signature = SIGNATURES.find((item) => item.test(buffer));
    if (!signature)
      throw new BadRequestException('Choose a PNG, JPEG, or WebP image');
    await mkdir(this.dir, { recursive: true });
    const file = `${randomUUID()}.${signature.ext}`;
    await writeFile(join(this.dir, file), buffer);
    return `${PREFIX}${file}`;
  }

  private async backfill() {
    for (;;) {
      const users = await this.prisma.user.findMany({
        where: { profilePicture: { startsWith: 'data:' } },
        select: { id: true, profilePicture: true },
        take: 25,
      });
      if (!users.length) return;
      for (const user of users) {
        let value: string | null;
        try {
          value = await this.saveDataUri(user.profilePicture!);
        } catch {
          value = null; // Unreadable legacy data: drop it rather than retry forever.
        }
        await this.prisma.user.update({
          where: { id: user.id },
          data: { profilePicture: value },
        });
      }
      this.logger.log(`Moved ${users.length} profile picture(s) to storage.`);
    }
  }
}
