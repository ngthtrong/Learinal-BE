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

// Regular indexes
ValidationRequestSchema.index({ status: 1, requestTime: -1 });
ValidationRequestSchema.index({ expertId: 1, status: 1 });
ValidationRequestSchema.index({ adminId: 1, status: 1 });
ValidationRequestSchema.index({ learnerId: 1, status: 1 });

// Partial unique index: Only 1 open request per set at a time
// Prevents duplicate PendingAssignment/Assigned requests for the same setId
ValidationRequestSchema.index(
  { setId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['PendingAssignment', 'Assigned'] },
    },
  }
);

module.exports = model('ValidationRequest', ValidationRequestSchema);
