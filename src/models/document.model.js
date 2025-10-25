const { Schema, model, Types } = require('mongoose');

const DocumentSchema = new Schema({
  subjectId: { type: Types.ObjectId, ref: 'Subject', required: true },
  ownerId: { type: Types.ObjectId, ref: 'User', required: true },
  originalFileName: { type: String, required: true },
  fileType: { type: String, enum: ['.pdf', '.docx', '.txt'], required: true },
  fileSize: { type: Number, required: true }, // MB
  storagePath: { type: String, required: true },
  extractedText: { type: String },
  summaryShort: { type: String },
  summaryFull: { type: String },
  summaryUpdatedAt: { type: Date },
  status: { type: String, enum: ['Uploading', 'Processing', 'Completed', 'Error'], required: true },
  uploadedAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false, collection: 'documents' });

DocumentSchema.index({ subjectId: 1, uploadedAt: -1 });
DocumentSchema.index({ ownerId: 1, uploadedAt: -1 });

module.exports = model('Document', DocumentSchema);
