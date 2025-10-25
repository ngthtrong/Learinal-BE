const { Schema, model, Types } = require('mongoose');

const CommissionRecordSchema = new Schema({
  expertId: { type: Types.ObjectId, ref: 'User', required: true },
  attemptId: { type: Types.ObjectId, ref: 'QuizAttempt', required: true },
  setId: { type: Types.ObjectId, ref: 'QuestionSet', required: true },
  commissionAmount: { type: Number, required: true },
  transactionDate: { type: Date, required: true },
  status: { type: String, enum: ['Pending','Paid'], required: true },
}, { timestamps: true, versionKey: false, collection: 'commissionRecords' });

CommissionRecordSchema.index({ expertId: 1, status: 1, transactionDate: -1 });
CommissionRecordSchema.index({ setId: 1, transactionDate: -1 });

module.exports = model('CommissionRecord', CommissionRecordSchema);
