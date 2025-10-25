module.exports = {
  provider: process.env.STORAGE_PROVIDER || 's3',
  s3Bucket: process.env.S3_BUCKET || '',
  s3Region: process.env.S3_REGION || '',
  cloudinaryUrl: process.env.CLOUDINARY_URL || '',
};
