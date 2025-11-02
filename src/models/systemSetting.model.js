const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    category: {
      type: String,
      enum: ['General', 'Features', 'Limits', 'Email', 'Payment', 'Security'],
      default: 'General',
    },
    description: {
      type: String,
      maxlength: 500,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    versionKey: '__v',
  }
);

// Indexes
systemSettingSchema.index({ key: 1 }, { unique: true });
systemSettingSchema.index({ category: 1 });

// Transform output
systemSettingSchema.set('toJSON', {
  transform: function (doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('SystemSetting', systemSettingSchema);
