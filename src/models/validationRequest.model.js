const { Schema, model, Types } = require('mongoose');

const ValidationRequestSchema = new Schema({
  setId: { type: Types.ObjectId, ref: 'QuestionSet', required: true },
  learnerId: { type: Types.ObjectId, ref: 'User', required: true },
  adminId: { type: Types.ObjectId, ref: 'User' },
  expertId: { type: Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['PendingAssignment','Assigned','Completed','RevisionRequested'], required: true },
  // Decision outcome when status === Completed
  decision: { type: String, enum: ['Approved','Rejected'] },
  // Optional feedback from expert
  feedback: { type: String },
  // Learner's response/feedback requesting revision
  learnerResponse: { type: String },
  revisionRequestTime: { type: Date },
  requestTime: { type: Date, required: true },
  completionTime: { type: Date },
}, { timestamps: true, versionKey: false, collection: 'validationRequests' });

ValidationRequestSchema.index({ status: 1, requestTime: -1 });
ValidationRequestSchema.index({ expertId: 1, status: 1 });
ValidationRequestSchema.index({ adminId: 1, status: 1 });

module.exports = model('ValidationRequest', ValidationRequestSchema);
