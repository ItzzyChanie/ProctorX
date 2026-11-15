import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { AvatarsService } from './avatars.service';

const service = new AvatarsService({} as never);
// Smallest valid PNG header + IHDR prefix is enough for signature sniffing.
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const dataUri = (mime: string, bytes: Buffer) =>
  `data:${mime};base64,${bytes.toString('base64')}`;

test('a real PNG upload is stored as a file reference', async () => {
  const value = await service.resolve(dataUri('image/png', png));
  assert.match(String(value), /^avatars\/[0-9a-f-]{36}\.png$/);
  const file = join(process.cwd(), 'storage', String(value));
  assert.ok(existsSync(file));
  await service.discard(value, null);
  assert.ok(!existsSync(file), 'replaced pictures are deleted from disk');
});

test('the declared type is not trusted: non-image bytes are rejected', async () => {
  await assert.rejects(
    service.resolve(dataUri('image/png', Buffer.from('<script>alert(1)</script>'))),
    BadRequestException
  );
});

test('unchanged, removed and omitted pictures are handled without writes', async () => {
  assert.equal(await service.resolve(undefined, 'avatars/x.png'), undefined);
  assert.equal(await service.resolve('', 'avatars/x.png'), null);
  assert.equal(await service.resolve('avatars/x.png', 'avatars/x.png'), undefined);
});

test("another user's file reference cannot be claimed", async () => {
  await assert.rejects(
    service.resolve('avatars/11111111-1111-1111-1111-111111111111.png', null),
    BadRequestException
  );
});
