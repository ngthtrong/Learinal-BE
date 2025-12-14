const mongoose = require('mongoose');

const contentFlagSchema = new mongoose.Schema(
  {
    contentType: {
      type: String,
      enum: ['QuestionSet', 'Question', 'Document', 'Comment'],
      required: true,
    },
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      enum: [
        'Inappropriate',
        'Spam',
        'Offensive',
        'Copyright',
        'Inaccurate',
        'Other',
      ],
      required: true,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ['Pending', 'UnderReview', 'SentToExpert', 'ExpertResponded', 'Resolved', 'Dismissed'],
      default: 'Pending',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
    action: {
      type: String,
      enum: ['None', 'Warning', 'ContentRemoved', 'UserBanned', 'RequestExpertFix'],
    },
    notes: {
      type: String,
      maxlength: 1000,
    },
    // Admin's note when forwarding to expert
    adminNote: {
      type: String,
      maxlength: 1000,
    },
    // Expert who needs to resolve (content owner)
    assignedExpert: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    sentToExpertAt: {
      type: Date,
    },
    // Expert's response
    expertResponse: {
      type: String,
      maxlength: 1000,
    },
    expertRespondedAt: {
      type: Date,
    },
    // Final resolution
    resolvedAt: {
      type: Date,
    },
    resolutionNote: {
      type: String,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
    versionKey: '__v',
  }
);

// Indexes
contentFlagSchema.index({ contentType: 1, contentId: 1 });
contentFlagSchema.index({ status: 1 });
contentFlagSchema.index({ reportedBy: 1 });

// Transform output
contentFlagSchema.set('toJSON', {
  transform: function (doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('ContentFlag', contentFlagSchema);
