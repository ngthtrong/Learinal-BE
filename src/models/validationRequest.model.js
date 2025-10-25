const { Schema, model, Types } = require('mongoose');

const ValidationRequestSchema = new Schema({
  setId: { type: Types.ObjectId, ref: 'QuestionSet', required: true },
  learnerId: { type: Types.ObjectId, ref: 'User', required: true },
  adminId: { type: Types.ObjectId, ref: 'User' },
  expertId: { type: Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['PendingAssignment','Assigned','Completed'], required: true },
  requestTime: { type: Date, required: true },
  completionTime: { type: Date },
}, { timestamps: true, versionKey: false, collection: 'validationRequests' });

ValidationRequestSchema.index({ status: 1, requestTime: -1 });
ValidationRequestSchema.index({ expertId: 1, status: 1 });
ValidationRequestSchema.index({ adminId: 1, status: 1 });

module.exports = model('ValidationRequest', ValidationRequestSchema);
