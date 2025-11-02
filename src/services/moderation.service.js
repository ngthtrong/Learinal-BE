const ContentFlagsRepository = require('../repositories/contentFlags.repository');
const UsersRepository = require('../repositories/users.repository');

class ModerationService {
  constructor({ contentFlagsRepository, usersRepository }) {
    this.flagsRepo = contentFlagsRepository || new ContentFlagsRepository();
    this.usersRepo = usersRepository || new UsersRepository();
  }

  /**
   * Flag content for review
   */
  async flagContent(data) {
    const { contentType, contentId, reportedBy, reason, description } = data;

    // Check if already flagged by this user
    const existing = await this.flagsRepo.findOne({
      contentType,
      contentId,
      reportedBy,
      status: { $in: ['Pending', 'UnderReview'] },
    });

    if (existing) {
      throw Object.assign(
        new Error('You have already flagged this content'),
        { status: 409, code: 'AlreadyFlagged' }
      );
    }

    const flag = await this.flagsRepo.create({
      contentType,
      contentId,
      reportedBy,
      reason,
      description,
      status: 'Pending',
    });

    return this.mapFlagToDTO(flag);
  }

  /**
   * List all flags with filters
   */
  async listFlags(options) {
    const { page = 1, pageSize = 20, status, contentType } = options;

    const query = {};
    if (status) query.status = status;
    if (contentType) query.contentType = contentType;

    const result = await this.flagsRepo.paginate(query, {
      page,
      pageSize,
      sort: { createdAt: -1 },
      populate: ['reportedBy', 'reviewedBy'],
    });

    return {
      flags: result.items.map(this.mapFlagToDTO),
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.totalItems,
        totalPages: result.totalPages,
      },
    };
  }

  /**
   * Review a flag
   */
  async reviewFlag(flagId, reviewData) {
    const { reviewedBy, action, notes } = reviewData;

    const flag = await this.flagsRepo.updateById(
      flagId,
      {
        status: 'Resolved',
        reviewedBy,
        reviewedAt: new Date(),
        action,
        notes,
      },
      { new: true }
    );

    if (!flag) {
      throw Object.assign(new Error('Flag not found'), { status: 404 });
    }

    // Execute action
    await this.executeAction(flag);

    return this.mapFlagToDTO(flag);
  }

  /**
   * Dismiss a flag
   */
  async dismissFlag(flagId, reviewedBy, notes) {
    const flag = await this.flagsRepo.updateById(
      flagId,
      {
        status: 'Dismissed',
        reviewedBy,
        reviewedAt: new Date(),
        action: 'None',
        notes,
      },
      { new: true }
    );

    if (!flag) {
      throw Object.assign(new Error('Flag not found'), { status: 404 });
    }

    return this.mapFlagToDTO(flag);
  }

  /**
   * Execute moderation action
   */
  async executeAction(flag) {
    switch (flag.action) {
      case 'ContentRemoved':
        await this.removeContent(flag.contentType, flag.contentId);
        break;
      case 'UserBanned':
        // Get content owner and ban them
        await this.banContentOwner(flag.contentType, flag.contentId);
        break;
      case 'Warning':
        // Send warning email to content owner
        await this.sendWarning(flag.contentType, flag.contentId);
        break;
      default:
        // No action
        break;
    }
  }

  async removeContent(contentType, contentId) {
    // Mark content as removed/inactive
    const modelMap = {
      QuestionSet: require('../models/questionSet.model'),
      Document: require('../models/document.model'),
    };

    const Model = modelMap[contentType];
    if (!Model) return;

    await Model.findByIdAndUpdate(contentId, {
      status: 'Removed',
      removedAt: new Date(),
    });
  }

  async banContentOwner(contentType, contentId) {
    // Find content owner and ban them
    const modelMap = {
      QuestionSet: require('../models/questionSet.model'),
      Document: require('../models/document.model'),
    };

    const Model = modelMap[contentType];
    if (!Model) return;

    const content = await Model.findById(contentId);
    if (!content) return;

    const ownerId = content.creatorId || content.ownerId || content.userId;
    if (!ownerId) return;

    await this.usersRepo.updateById(ownerId, {
      status: 'Banned',
      bannedAt: new Date(),
      banReason: 'Content violation',
    });
  }

  async sendWarning(contentType, contentId) {
    // TODO: Send warning email to content owner
    console.log(`Warning sent for ${contentType}:${contentId}`);
  }

  mapFlagToDTO(flag) {
    return {
      id: flag._id.toString(),
      contentType: flag.contentType,
      contentId: flag.contentId.toString(),
      reportedBy: flag.reportedBy
        ? {
            id: flag.reportedBy._id?.toString() || flag.reportedBy.toString(),
            fullName: flag.reportedBy.fullName,
            email: flag.reportedBy.email,
          }
        : null,
      reason: flag.reason,
      description: flag.description,
      status: flag.status,
      reviewedBy: flag.reviewedBy
        ? {
            id: flag.reviewedBy._id?.toString() || flag.reviewedBy.toString(),
            fullName: flag.reviewedBy.fullName,
          }
        : null,
      reviewedAt: flag.reviewedAt,
      action: flag.action,
      notes: flag.notes,
      createdAt: flag.createdAt,
    };
  }
}

module.exports = ModerationService;
