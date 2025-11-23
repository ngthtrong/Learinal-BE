const mongoose = require('mongoose');

const emailTemplateSchema = new mongoose.Schema(
  {
    templateId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      maxlength: 200,
    },
    bodyHtml: {
      type: String,
      required: true,
    },
    bodyText: {
      type: String,
    },
    variables: {
      type: [String],
      default: [],
    },
    category: {
      type: String,
      enum: ['Auth', 'Subscription', 'Validation', 'System', 'Marketing'],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: '__v',
  }
);

// Indexes
emailTemplateSchema.index({ templateId: 1 }, { unique: true });
emailTemplateSchema.index({ category: 1, isActive: 1 });

// Transform output
emailTemplateSchema.set('toJSON', {
  transform: function (doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
