const fs = require('fs');
const path = require('path');

/**
 * StorageClient - Abstraction layer for file storage (Local/S3)
 * Supports swappable storage backends via config
 */
class StorageClient {
  constructor(config = {}) {
    this.config = config;
    this.mode = config.mode || process.env.STORAGE_MODE || 'local';
    this.uploadDir = config.uploadDir || path.resolve(process.cwd(), 'uploads');
  }

  /**
   * Upload file to storage
   * @param {object} file - { originalname, buffer, mimetype, size }
   * @param {object} options - { subjectId?, userId? } for organizing files
   * @returns {Promise<{storagePath, url}>}
   */
  async upload(file, options = {}) {
    if (this.mode === 'local') {
      return this._uploadLocal(file, options);
    } else if (this.mode === 's3') {
      return this._uploadS3(file, options);
    } else {
      throw new Error(`Unsupported storage mode: ${this.mode}`);
    }
  }

  /**
   * Get public URL for a stored file
   * @param {string} storagePath
   * @returns {Promise<string>}
   */
  async getUrl(storagePath) {
    if (this.mode === 'local') {
      return `file://${storagePath}`;
    } else if (this.mode === 's3') {
      // For S3, storagePath would be the S3 key
      // Return signed URL or public URL depending on bucket policy
      return this._getS3Url(storagePath);
    } else {
      throw new Error(`Unsupported storage mode: ${this.mode}`);
    }
  }

  /**
   * Delete file from storage
   * @param {string} storagePath
   * @returns {Promise<void>}
   */
  async delete(storagePath) {
    if (this.mode === 'local') {
      await fs.promises.unlink(storagePath).catch(() => {});
    } else if (this.mode === 's3') {
      await this._deleteS3(storagePath);
    }
  }

  /**
   * Check if file exists
   * @param {string} storagePath
   * @returns {Promise<boolean>}
   */
  async exists(storagePath) {
    if (this.mode === 'local') {
      try {
        await fs.promises.access(storagePath);
        return true;
      } catch {
        return false;
      }
    } else if (this.mode === 's3') {
      return this._existsS3(storagePath);
    }
    return false;
  }

  // ===== PRIVATE: Local Storage Implementation =====

  async _uploadLocal(file, options) {
    // Create directory structure: uploads/userId/subjectId/
    const dir = path.join(
      this.uploadDir,
      options.userId ? String(options.userId) : 'unknown',
      options.subjectId ? String(options.subjectId) : 'general'
    );
    await fs.promises.mkdir(dir, { recursive: true });

    // Generate unique filename with timestamp
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    const sanitized = basename.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
    const filename = `${Date.now()}_${sanitized}${ext}`;
    const dest = path.join(dir, filename);

    // Write file
    await fs.promises.writeFile(dest, file.buffer);

    return {
      storagePath: dest,
      url: `file://${dest}`,
    };
  }

  // ===== PRIVATE: S3 Storage Implementation (Stub) =====

  async _uploadS3(_file, _options) {
    // TODO: Implement S3 upload using AWS SDK v3
    // const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    // const client = new S3Client({ region: this.config.s3Region });
    // const key = `${options.userId}/${options.subjectId}/${Date.now()}_${file.originalname}`;
    // await client.send(new PutObjectCommand({
    //   Bucket: this.config.s3Bucket,
    //   Key: key,
    //   Body: file.buffer,
    //   ContentType: file.mimetype,
    // }));
    // return { storagePath: key, url: `https://${this.config.s3Bucket}.s3.amazonaws.com/${key}` };

    throw new Error('S3 storage not yet implemented. Set STORAGE_MODE=local or implement S3 adapter.');
  }

  async _getS3Url(_key) {
    // TODO: Generate signed URL or return public URL
    // const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    // const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    // const client = new S3Client({ region: this.config.s3Region });
    // const command = new GetObjectCommand({ Bucket: this.config.s3Bucket, Key: key });
    // const url = await getSignedUrl(client, command, { expiresIn: 3600 });
    // return url;

    throw new Error('S3 URL generation not yet implemented');
  }

  async _deleteS3(_key) {
    // TODO: Delete from S3
    // const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    // const client = new S3Client({ region: this.config.s3Region });
    // await client.send(new DeleteObjectCommand({ Bucket: this.config.s3Bucket, Key: key }));
  }

  async _existsS3(_key) {
    // TODO: Check if object exists in S3
    // const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
    // try {
    //   const client = new S3Client({ region: this.config.s3Region });
    //   await client.send(new HeadObjectCommand({ Bucket: this.config.s3Bucket, Key: key }));
    //   return true;
    // } catch {
    //   return false;
    // }
    return false;
  }
}

module.exports = StorageClient;
