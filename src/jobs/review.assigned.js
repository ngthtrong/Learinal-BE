const ValidationRequestsRepository = require('../repositories/validationRequests.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const SubjectsRepository = require('../repositories/subjects.repository');
const UsersRepository = require('../repositories/users.repository');
const { enqueueEmail } = require('../adapters/queue');
const logger = require('../utils/logger');

const validationRequestsRepo = new ValidationRequestsRepository();
const questionSetsRepo = new QuestionSetsRepository();
const subjectsRepo = new SubjectsRepository();
const usersRepo = new UsersRepository();

/**
 * Assign expert to validation request
 * Triggered when validation is requested
 */
module.exports = async function reviewAssigned(payload) {
  const { requestId, setId } = payload;

  logger.info({ requestId }, 'Assigning expert to validation request');

  try {
    // 1. Find available Expert
    const expert = await findAvailableExpert();

    if (!expert) {
      logger.warn({ requestId }, 'No expert available for assignment');
      // Will retry later
      throw new Error('No expert available');
    }

    // 2. Assign to expert
    await validationRequestsRepo.updateById(requestId, {
      expertId: expert._id,
      status: 'Assigned',
      assignedTime: new Date(),
    });

    // 3. Update question set status
    await questionSetsRepo.updateById(setId, {
      status: 'UnderReview',
    });

    logger.info(
      {
        requestId,
        expertId: expert._id.toString(),
      },
      'Validation request assigned'
    );

    // 4. Send notification email to Expert
    const questionSet = await questionSetsRepo.findById(setId);
    const subject = await subjectsRepo.findById(
      questionSet.subjectId.toString()
    );

    await enqueueEmail({
      to: expert.email,
      templateId: 'validationAssigned',
      variables: {
        expertName: expert.displayName || expert.email,
        setTitle: questionSet.title,
        subjectName: subject?.subjectName || 'Unknown',
        numQuestions: questionSet.questions?.length || 0,
        reviewLink: `${process.env.APP_BASE_URL || 'http://localhost:3000'}/expert/validation-requests/${requestId}`,
      },
    });

    logger.info({ expertEmail: expert.email }, 'Notification email sent');
  } catch (error) {
    logger.error(
      {
        requestId,
        error: error.message,
      },
      'Failed to assign validation request'
    );

    throw error; // Will retry
  }
};

/**
 * Find available Expert using "least loaded" strategy
 */
async function findAvailableExpert() {
  // Get all active Experts
  const experts = await usersRepo.find({
    role: 'Expert',
    // status: 'Active', // Uncomment if User model has status field
  });

  if (experts.length === 0) {
    return null;
  }

  // Count active assignments for each expert
  const expertsWithLoad = await Promise.all(
    experts.map(async (expert) => {
      const activeCount = await validationRequestsRepo.count({
        expertId: expert._id,
        status: 'Assigned',
      });
      return { expert, activeCount };
    })
  );

  // Sort by load (ascending) - expert with least assignments first
  expertsWithLoad.sort((a, b) => a.activeCount - b.activeCount);

  // Return expert with least load
  return expertsWithLoad[0].expert;
}
