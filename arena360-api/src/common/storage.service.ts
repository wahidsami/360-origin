import { Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';
import { Readable } from 'stream';
import * as fs from 'fs';
import { join, dirname } from 'path';

@Injectable()
export class StorageService {
    private s3: AWS.S3 | null = null;
    private bucket: string;
    private useLocal: boolean = false;
    private readonly logger = new Logger(StorageService.name);
    // Adjusted path: use process.cwd() to target root/uploads (outside dist)
    private readonly uploadDir = join(process.cwd(), 'uploads');

    constructor(private configService: ConfigService) {
        const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY');
        const secretAccessKey = this.configService.get<string>('S3_SECRET_KEY');
        const endpoint = this.configService.get<string>('S3_ENDPOINT') || '';

        // If no credentials OR endpoint is localhost (dev-only MinIO not available in prod) → local storage
        const isLocalhostEndpoint = /localhost|127\.0\.0\.1/.test(endpoint);

        if (!accessKeyId || !secretAccessKey || isLocalhostEndpoint) {
            this.useLocal = true;
            if (isLocalhostEndpoint && accessKeyId) {
                this.logger.warn(`S3_ENDPOINT points to localhost (${endpoint}) — falling back to local filesystem storage. Set a real S3/MinIO endpoint in production to enable cloud storage.`);
            } else {
                this.logger.warn('AWS S3 credentials not found. Using local storage.');
            }
            // Ensure upload directory exists
            if (!fs.existsSync(this.uploadDir)) {
                fs.mkdirSync(this.uploadDir, { recursive: true });
            }
        } else {
            this.bucket = this.configService.get<string>('S3_BUCKET', 'arena360-files');
            const region = this.configService.get<string>('S3_REGION', 'us-east-1');
            const useSSL = this.configService.get<string>('S3_USE_SSL', 'false') === 'true';

            this.s3 = new AWS.S3({
                endpoint,
                accessKeyId,
                secretAccessKey,
                region,
                s3ForcePathStyle: true,
                signatureVersion: 'v4',
                sslEnabled: useSSL
            });

            this.logger.log(`Storage service initialized with endpoint: ${endpoint}, bucket: ${this.bucket}`);
        }
    }

    async putObject(key: string, buffer: Buffer, mimeType: string): Promise<void> {
        if (this.useLocal) {
            try {
                const filePath = join(this.uploadDir, key);
                const dir = dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                await fs.promises.writeFile(filePath, buffer);
                this.logger.log(`File saved locally: ${filePath}`);
            } catch (error) {
                this.logger.error(`Failed to save local file: ${key}`, error.stack);
                throw new InternalServerErrorException(`File upload failed: ${error.message}`);
            }
        } else {
            try {
                await this.s3!.putObject({
                    Bucket: this.bucket,
                    Key: key,
                    Body: buffer,
                    ContentType: mimeType
                }).promise();
                this.logger.log(`File uploaded successfully: ${key}`);
            } catch (error) {
                this.logger.error(`Failed to upload file: ${key}`, error.stack);
                throw new InternalServerErrorException(`File upload failed: ${error.message}`);
            }
        }
    }

    async getSignedUrl(key: string, expiresIn: number = 3600, download: boolean = false, forceProxy: boolean = false): Promise<string> {
        if (this.useLocal || forceProxy) {
            // Resolve the correct public API base URL
            // Priority: API_URL → COOLIFY_URL → COOLIFY_FQDN → fallback localhost
            const coolifyFqdn = this.configService.get<string>('COOLIFY_FQDN');
            const apiUrl = this.configService.get<string>('API_URL')
                || this.configService.get<string>('COOLIFY_URL')?.split(',')[0]
                || (coolifyFqdn ? `https://${coolifyFqdn.split(',')[0]}` : null)
                || `http://localhost:${process.env.PORT || 3000}`;
            const token = this.generateStreamToken(key, expiresIn);
            const params = new URLSearchParams({ token });
            if (download) params.append('download', 'true');
            return `${apiUrl}/api/files/stream?${params.toString()}`;
        } else {
            try {
                const url = await this.s3!.getSignedUrlPromise('getObject', {
                    Bucket: this.bucket,
                    Key: key,
                    Expires: expiresIn,
                    // S3/MinIO also supports content disposition overrides if needed
                });
                return url;
            } catch (error) {
                this.logger.error(`Failed to generate signed URL: ${key}`, error.stack);
                throw new InternalServerErrorException(`Signed URL generation failed: ${error.message}`);
            }
        }
    }

    async objectExists(key: string): Promise<boolean> {
        if (this.useLocal) {
            const filePath = join(this.uploadDir, key);
            return fs.existsSync(filePath);
        }

        try {
            await this.s3!.headObject({
                Bucket: this.bucket,
                Key: key,
            }).promise();
            return true;
        } catch (error: any) {
            if (error?.statusCode === 404 || error?.code === 'NotFound' || error?.code === 'NoSuchKey') {
                return false;
            }
            this.logger.warn(`Failed to check object existence for ${key}: ${error?.message || error}`);
            return false;
        }
    }

    getObjectStream(key: string): Readable {
        if (this.useLocal) {
            const filePath = join(this.uploadDir, key);
            if (fs.existsSync(filePath)) {
                return fs.createReadStream(filePath);
            }
            throw new NotFoundException(`File not found at: ${filePath}`);
        } else {
            return this.s3!.getObject({
                Bucket: this.bucket,
                Key: key
            }).createReadStream();
        }
    }

    async deleteObject(key: string): Promise<void> {
        if (this.useLocal) {
            try {
                const filePath = join(this.uploadDir, key);
                if (fs.existsSync(filePath)) {
                    await fs.promises.unlink(filePath);
                }
                this.logger.log(`File deleted successfully: ${filePath}`);
            } catch (error) {
                this.logger.error(`Failed to delete local file: ${key}`, error.stack);
                throw new InternalServerErrorException(`File deletion failed: ${error.message}`);
            }
        } else {
            try {
                await this.s3!.deleteObject({
                    Bucket: this.bucket,
                    Key: key
                }).promise();
                this.logger.log(`File deleted successfully: ${key}`);
            } catch (error) {
                this.logger.error(`Failed to delete file: ${key}`, error.stack);
                throw new InternalServerErrorException(`File deletion failed: ${error.message}`);
            }
        }
    }

    generateStorageKey(
        orgId: string,
        scopeType: string,
        scopeId: string,
        category: string,
        filename: string
    ): string {
        const timestamp = Date.now();
        const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        return `${orgId}/${scopeType.toLowerCase()}/${scopeId}/${category.toLowerCase()}/${timestamp}_${sanitizedFilename}`;
    }

    private generateStreamToken(key: string, expiresIn: number): string {
        const crypto = require('crypto');
        const secret = this.configService.get<string>('JWT_SECRET') || 'secret';
        const expiry = Date.now() + expiresIn * 1000;
        const data = `${key}:${expiry}`;
        const signature = crypto.createHmac('sha256', secret).update(data).digest('hex');
        return `${Buffer.from(key).toString('base64')}.${expiry}.${signature}`;
    }

    verifyStreamToken(token: string): string | null {
        try {
            const [b64Key, expiryStr, signature] = token.split('.');
            if (!b64Key || !expiryStr || !signature) return null;

            const key = Buffer.from(b64Key, 'base64').toString('utf8');
            const expiry = parseInt(expiryStr, 10);

            if (Date.now() > expiry) return null;

            const crypto = require('crypto');
            const secret = this.configService.get<string>('JWT_SECRET') || 'secret';
            const data = `${key}:${expiry}`;
            const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('hex');

            if (signature !== expectedSignature) return null;

            return key;
        } catch (e) {
            return null;
        }
    }
}
