import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Readable } from 'stream';
import storageConfig from '../config/storage.config';
import { StorageObjectNotFoundException } from './exceptions/storage.exception';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';

async function readStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('StorageService (integration)', () => {
  let storage: StorageService;
  const prefix = `test/${Date.now()}`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [storageConfig] }),
        StorageModule,
      ],
    }).compile();

    storage = module.get(StorageService);
  });

  it('createMultipartUpload returns a non-empty uploadId', async () => {
    const key = `${prefix}/multipart.bin`;
    const uploadId = await storage.createMultipartUpload(
      key,
      'application/octet-stream',
    );
    expect(uploadId).toBeTruthy();
    await storage.abortMultipartUpload(key, uploadId);
  });

  it('getPresignedUploadPartUrl includes uploadId and partNumber', async () => {
    const key = `${prefix}/presign.bin`;
    const uploadId = await storage.createMultipartUpload(
      key,
      'application/octet-stream',
    );
    const url = await storage.getPresignedUploadPartUrl(key, uploadId, 1);
    expect(url).toContain('uploadId=');
    expect(url.toLowerCase()).toContain('partnumber=1');
    await storage.abortMultipartUpload(key, uploadId);
  });

  it('completeMultipartUpload assembles object retrievable via getObjectStream', async () => {
    const key = `${prefix}/complete.bin`;
    const body = Buffer.from('hello-streamtube-multipart');
    const uploadId = await storage.createMultipartUpload(
      key,
      'application/octet-stream',
    );
    const url = await storage.getPresignedUploadPartUrl(key, uploadId, 1);
    const putResponse = await fetch(url, {
      method: 'PUT',
      body,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    expect(putResponse.ok).toBe(true);
    const etag = putResponse.headers.get('etag');
    expect(etag).toBeTruthy();

    await storage.completeMultipartUpload(key, uploadId, [
      { PartNumber: 1, ETag: etag! },
    ]);

    const streamed = await storage.getObjectStream(key);
    expect(streamed.contentType).toBe('application/octet-stream');
    const content = await readStream(streamed.body);
    expect(content.equals(body)).toBe(true);

    await storage.deleteObject(key);
  });

  it('putObject stores object and ranged getObjectStream returns bytes', async () => {
    const key = `${prefix}/put-range.bin`;
    const body = Buffer.from('0123456789ABCDEF');
    await storage.putObject(key, body, 'application/octet-stream', body.length);

    const full = await storage.getObjectStream(key);
    expect(full.contentType).toBe('application/octet-stream');
    expect((await readStream(full.body)).equals(body)).toBe(true);

    const ranged = await storage.getObjectStream(key, 'bytes=0-3');
    const rangedBody = await readStream(ranged.body);
    expect(rangedBody.length).toBe(4);
    expect(rangedBody.toString()).toBe('0123');
    expect(ranged.contentRange).toMatch(/^bytes 0-3\/16$/);

    await storage.deleteObject(key);
    await expect(storage.getObjectStream(key)).rejects.toBeInstanceOf(
      StorageObjectNotFoundException,
    );
  });

  it('abortMultipartUpload does not throw for missing upload', async () => {
    const key = `${prefix}/abort-missing.bin`;
    await expect(
      storage.abortMultipartUpload(key, 'nonexistent-upload-id'),
    ).resolves.toBeUndefined();
  });
});
