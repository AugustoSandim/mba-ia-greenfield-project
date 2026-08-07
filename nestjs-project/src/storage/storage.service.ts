import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import storageConfig from '../config/storage.config';
import { StorageObjectNotFoundException } from './exceptions/storage.exception';

export type CompletedPart = { PartNumber: number; ETag: string };

export type ObjectStreamResult = {
  body: Readable;
  contentLength: number;
  contentType: string;
  acceptRanges: string;
  contentRange?: string;
};

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
  ) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: `http://${config.endpoint}:${config.port}`,
      forcePathStyle: config.usePathStyle,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });
  }

  async createMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<string> {
    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!result.UploadId) {
      throw new Error('CreateMultipartUpload did not return UploadId');
    }
    return result.UploadId;
  }

  async getPresignedUploadPartUrl(
    key: string,
    uploadId: string,
    partNumber: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: 3600 },
    );
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({
            PartNumber: p.PartNumber,
            ETag: p.ETag,
          })),
        },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (error: unknown) {
      const name =
        error && typeof error === 'object' && 'name' in error
          ? String((error as { name: string }).name)
          : '';
      if (name === 'NoSuchUpload' || name === 'NotFound') {
        return;
      }
      throw error;
    }
  }

  async getObjectStream(
    key: string,
    rangeHeader?: string,
  ): Promise<ObjectStreamResult> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ...(rangeHeader ? { Range: rangeHeader } : {}),
        }),
      );

      if (!result.Body) {
        throw new StorageObjectNotFoundException(key);
      }

      return {
        body: result.Body as Readable,
        contentLength: result.ContentLength ?? 0,
        contentType: result.ContentType ?? 'application/octet-stream',
        acceptRanges: result.AcceptRanges ?? 'bytes',
        contentRange: result.ContentRange,
      };
    } catch (error: unknown) {
      const name =
        error && typeof error === 'object' && 'name' in error
          ? String((error as { name: string }).name)
          : '';
      const httpStatus =
        error && typeof error === 'object' && '$metadata' in error
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode
          : undefined;
      if (name === 'NoSuchKey' || name === 'NotFound' || httpStatus === 404) {
        throw new StorageObjectNotFoundException(key);
      }
      throw error;
    }
  }

  async putObject(
    key: string,
    body: Buffer | Readable,
    contentType: string,
    contentLength?: number,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(contentLength !== undefined
          ? { ContentLength: contentLength }
          : {}),
      }),
    );
  }

  async getPresignedGetUrl(key: string, expiresIn: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn },
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
