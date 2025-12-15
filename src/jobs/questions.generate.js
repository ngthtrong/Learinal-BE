const QuestionSetsRepository = require("../repositories/questionSets.repository");
const DocumentsRepository = require("../repositories/documents.repository");
const SubjectsRepository = require("../repositories/subjects.repository");
const NotificationsRepository = require("../repositories/notifications.repository");
const { llm } = require("../config");
const LLMClient = require("../adapters/llmClient");
const notificationService = require("../services/notification.service");
const logger = require("../utils/logger");

// Map Vietnamese difficulty levels to English (Bloom's Taxonomy)
function mapDifficultyToEnglish(difficultyDistribution) {
  if (!difficultyDistribution || typeof difficultyDistribution !== 'object') {
    return difficultyDistribution;
  }
  
  const mapping = {
    "Ghi nhớ": "Remember",
    "Hiểu": "Understand",
    "Áp dụng": "Apply",
    "Phân tích": "Analyze",
    "Đánh giá": "Evaluate",
    "Sáng tạo": "Create",
    // Old mappings (backward compatibility)
    "Biết": "Remember",
    "Vận dụng": "Apply",
    "Vận dụng cao": "Analyze",
  };
  
  const mappedDistribution = {};
  for (const [level, count] of Object.entries(difficultyDistribution)) {
    const englishLevel = mapping[level] || level; // Use mapped value or keep as-is if already in English
    mappedDistribution[englishLevel] = count;
  }
  
  return mappedDistribution;
}

// Map English difficulty levels back to Vietnamese (Bloom's Taxonomy)
function mapDifficultyToVietnamese(difficultyLevel) {
  const mapping = {
    "Remember": "Ghi nhớ",
    "Understand": "Hiểu",
    "Apply": "Áp dụng",
    "Analyze": "Phân tích",
    "Evaluate": "Đánh giá",
    "Create": "Sáng tạo",
  };
  
  return mapping[difficultyLevel] || difficultyLevel;
}

module.exports = async function questionsGenerate(payload) {
  logger.info({ payload }, "[questions.generate] job received");

  const {
    questionSetId,
    userId,
    subjectId,
    numQuestions = 10,
    difficulty = "Understand",
    difficultyDistribution = null,
    topicDistribution = null,
    language = "vi", // Default to Vietnamese
  } = payload || {};

  if (!questionSetId || !userId) {
    logger.error(
      { questionSetId, userId, payload },
      "[questions.generate] missing required fields"
    );
    return;
  }

  const qrepo = new QuestionSetsRepository();
  const drepo = new DocumentsRepository();
  const subjectRepo = new SubjectsRepository();
  const notificationsRepo = new NotificationsRepository();

  try {
    logger.info({ questionSetId, userId }, "[questions.generate] start");

    // Get question set
    const qset = await qrepo.findById(questionSetId);
    if (!qset) {
      logger.error({ questionSetId }, "[questions.generate] question set not found");
      return;
    }

    // Update status to Processing
    await qrepo.updateById(questionSetId, { $set: { status: "Processing" } }, { new: true });

    // Get subject's table of contents
    let tableOfContents = [];
    if (subjectId) {
      try {
        const subject = await subjectRepo.findById(subjectId);
        if (subject && Array.isArray(subject.tableOfContents)) {
          tableOfContents = subject.tableOfContents;
        }
      } catch (err) {
        logger.warn(
          { subjectId, err: err?.message },
          "[questions.generate] failed to get subject TOC (non-fatal)"
        );
      }
    }

    // Build context from user's documents in the subject
    let contextText = "";
    if (subjectId) {
      try {
        const docs = await drepo.findMany(
          { subjectId, ownerId: userId, status: "Completed" },
          {
            projection: { originalFileName: 1, summaryShort: 1, summaryFull: 1, extractedText: 1 },
            sort: { uploadedAt: -1 },
            limit: 10,
          }
        );
        if (Array.isArray(docs) && docs.length > 0) {
          const parts = [];
          for (const d of docs) {
            const header = `Document: ${d.originalFileName || "unknown"}`;
            const summary = d.summaryFull || d.summaryShort || "";
            const body =
              summary && summary.trim().length > 0
                ? summary
                : String(d.extractedText || "").slice(0, 3000);
            if (body && body.trim().length > 0) {
              parts.push(`${header}\n${body}`);
            }
          }
          contextText = parts.join("\n\n---\n\n");
          contextText = contextText.slice(0, 18000);
        }
      } catch (err) {
        logger.warn(
          { subjectId, userId, err: err?.message },
          "[questions.generate] failed to get documents context (non-fatal)"
        );
      }
    }

    // Fallback if no usable document context
    if (!contextText || contextText.trim().length === 0) {
      contextText = `Topic: ${qset.title}`;
    }

    // Calculate total questions
    let totalQuestions = numQuestions;
    if (difficultyDistribution && typeof difficultyDistribution === "object") {
      totalQuestions = Object.values(difficultyDistribution).reduce(
        (sum, count) => sum + (count || 0),
        0
      );
    }

    logger.info(
      {
        questionSetId,
        userId,
        totalQuestions,
        language,
        contextLength: contextText?.length,
        hasTOC: tableOfContents?.length > 0,
      },
      "[questions.generate] calling LLM"
    );

    // For large question sets, split into batches to avoid timeout
    const MAX_QUESTIONS_PER_BATCH = 15; // Reduced from 25 for better reliability
    const needsBatching = totalQuestions > MAX_QUESTIONS_PER_BATCH;

    if (needsBatching) {
      logger.info(
        {
          questionSetId,
          totalQuestions,
          maxPerBatch: MAX_QUESTIONS_PER_BATCH,
        },
        "[questions.generate] using batch generation for large question set"
      );
    }

    // Generate questions using LLM with dynamic timeout based on question count
    // Estimate: ~4 seconds per question + 30 second base (increased for reliability)
    const questionsPerCall = needsBatching ? MAX_QUESTIONS_PER_BATCH : totalQuestions;
    const estimatedTimeoutMs = Math.max(60000, questionsPerCall * 4000 + 30000);
    const llmConfigWithTimeout = {
      ...llm,
      timeoutMs: estimatedTimeoutMs,
      retries: 5, // Increase retries for large sets
    };

    logger.info(
      {
        questionSetId,
        totalQuestions,
        questionsPerCall,
        timeoutMs: estimatedTimeoutMs,
      },
      "[questions.generate] using dynamic timeout"
    );

    const client = new LLMClient(llmConfigWithTimeout);
    let allQuestions = [];

    try {
      // Map Vietnamese difficulty levels to English for LLM
      const mappedDifficultyDistribution = mapDifficultyToEnglish(difficultyDistribution);
      
      if (needsBatching) {
        // Generate in batches with proportional difficulty distribution
        const numBatches = Math.ceil(totalQuestions / MAX_QUESTIONS_PER_BATCH);
        
        // Calculate difficulty distribution per batch
        const batchDifficultyDistributions = [];
        if (mappedDifficultyDistribution && typeof mappedDifficultyDistribution === 'object') {
          // Distribute difficulties proportionally across batches
          const difficultyLevels = Object.keys(mappedDifficultyDistribution);
          const remainingCounts = { ...mappedDifficultyDistribution };
          
          for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
            const remainingQuestions = totalQuestions - (batchIndex * MAX_QUESTIONS_PER_BATCH);
            const questionsThisBatch = Math.min(MAX_QUESTIONS_PER_BATCH, remainingQuestions);
            const batchDistribution = {};
            let assignedThisBatch = 0;
            
            for (const level of difficultyLevels) {
              if (remainingCounts[level] > 0) {
                // Proportionally assign questions for this difficulty level
                const proportion = remainingCounts[level] / Object.values(remainingCounts).reduce((a, b) => a + b, 0);
                const countForLevel = Math.round(questionsThisBatch * proportion);
                const actualCount = Math.min(countForLevel, remainingCounts[level], questionsThisBatch - assignedThisBatch);
                
                if (actualCount > 0) {
                  batchDistribution[level] = actualCount;
                  remainingCounts[level] -= actualCount;
                  assignedThisBatch += actualCount;
                }
              }
            }
            
            // Ensure we have exactly questionsThisBatch questions
            const totalAssigned = Object.values(batchDistribution).reduce((a, b) => a + b, 0);
            if (totalAssigned < questionsThisBatch) {
              // Add remaining to first available level
              for (const level of difficultyLevels) {
                if (remainingCounts[level] > 0) {
                  const diff = questionsThisBatch - totalAssigned;
                  const toAdd = Math.min(diff, remainingCounts[level]);
                  batchDistribution[level] = (batchDistribution[level] || 0) + toAdd;
                  remainingCounts[level] -= toAdd;
                  break;
                }
              }
            }
            
            batchDifficultyDistributions.push(batchDistribution);
          }
        }

        for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
          const remainingQuestions = totalQuestions - allQuestions.length;
          const questionsThisBatch = Math.min(MAX_QUESTIONS_PER_BATCH, remainingQuestions);
          
          // Get difficulty distribution for this batch
          const batchDifficultyDist = batchDifficultyDistributions[batchIndex] || null;

          logger.info(
            {
              questionSetId,
              batchIndex: batchIndex + 1,
              totalBatches: numBatches,
              questionsThisBatch,
              batchDifficultyDist,
            },
            "[questions.generate] generating batch"
          );

          // For batched generation, pass proportional difficulty distribution
          const result = await client.generateQuestions({
            contextText,
            numQuestions: questionsThisBatch,
            difficulty,
            difficultyDistribution: batchDifficultyDist,
            topicDistribution: null,
            tableOfContents,
            language,
          });

          if (result.questions && Array.isArray(result.questions)) {
            // Re-index questionIds to ensure uniqueness across batches
            // Use global offset based on already generated questions
            const globalOffset = allQuestions.length;
            const reindexedQuestions = result.questions.map((q, idx) => ({
              ...q,
              questionId: `Q${String(globalOffset + idx + 1).padStart(3, '0')}`,
            }));
            allQuestions.push(...reindexedQuestions);
          }

          // Small delay between batches to avoid rate limiting
          if (batchIndex < numBatches - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        logger.info(
          {
            questionSetId,
            totalGenerated: allQuestions.length,
            expected: totalQuestions,
          },
          "[questions.generate] batch generation completed"
        );
      } else {
        // Single call for smaller sets
        const result = await client.generateQuestions({
          contextText,
          numQuestions: totalQuestions,
          difficulty,
          difficultyDistribution: mappedDifficultyDistribution,
          topicDistribution,
          tableOfContents,
          language,
        });
        // Re-index questionIds to ensure uniqueness and consistent format
        const questions = result.questions || [];
        allQuestions = questions.map((q, idx) => ({
          ...q,
          questionId: `Q${String(idx + 1).padStart(3, '0')}`,
        }));
      }
    } catch (llmError) {
      logger.error(
        {
          questionSetId,
          userId,
          err: llmError?.message || llmError,
          stack: llmError?.stack,
          code: llmError?.code,
          generatedSoFar: allQuestions.length,
        },
        "[questions.generate] LLM call failed"
      );
      throw llmError;
    }

    const questions = allQuestions;

    logger.info(
      {
        questionSetId,
        userId,
        generatedCount: questions?.length || 0,
      },
      "[questions.generate] LLM returned questions"
    );

    // Validate LLM response
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      throw new Error(
        `LLM returned no valid questions. Expected ${totalQuestions}, got ${questions?.length || 0}`
      );
    }

    // Map English difficulty levels back to Vietnamese for storage
    questions.forEach((q) => {
      if (q.difficultyLevel) {
        q.difficultyLevel = mapDifficultyToVietnamese(q.difficultyLevel);
      }
    });

    const percentageGenerated = (questions.length / totalQuestions) * 100;

    if (questions.length < totalQuestions * 0.8) {
      logger.warn(
        {
          questionSetId,
          expected: totalQuestions,
          received: questions.length,
          percentage: percentageGenerated.toFixed(1),
        },
        "[questions.generate] LLM returned fewer questions than requested"
      );

      // Add warning to notification later
    }

    // Update question set with generated questions
    const updated = await qrepo.updateById(
      questionSetId,
      { $set: { questions, status: "Draft" } },
      { new: true }
    );

    logger.info(
      {
        questionSetId,
        userId,
        questionsCount: questions?.length || 0,
      },
      "[questions.generate] completed successfully"
    );

    // Emit real-time notification and create persistent notification
    try {
      await notificationService.emitQuestionSetGenerated(userId.toString(), updated);
      logger.info({ questionSetId, userId }, "[questions.generate] notification sent");
    } catch (emitErr) {
      logger.error(
        {
          questionSetId,
          userId,
          err: emitErr?.message || emitErr,
        },
        "[questions.generate] failed to emit real-time event (non-fatal)"
      );
    }
  } catch (err) {
    logger.error(
      {
        questionSetId,
        userId,
        err: err?.message || err,
        stack: err?.stack,
        errorType: err?.constructor?.name,
      },
      "[questions.generate] failed"
    );

    // Update status to Error
    try {
      await qrepo.updateById(questionSetId, { $set: { status: "Error" } }, { new: true });
    } catch (updateErr) {
      logger.error(
        { questionSetId, err: updateErr?.message },
        "[questions.generate] failed to update error status"
      );
    }

    // Create error notification with more details
    try {
      let errorMessage = "Không thể tạo bộ đề. Vui lòng thử lại sau.";

      // Provide more specific error messages
      if (err?.message?.includes("timeout") || err?.code === "ECONNABORTED") {
        errorMessage =
          "Quá trình tạo bộ đề mất quá nhiều thời gian. Vui lòng thử với ít câu hỏi hơn hoặc thử lại sau.";
      } else if (err?.message?.includes("API key") || err?.message?.includes("authentication")) {
        errorMessage = "Lỗi cấu hình hệ thống. Vui lòng liên hệ quản trị viên.";
      } else if (err?.message?.includes("no valid questions")) {
        errorMessage =
          "Không thể tạo câu hỏi từ tài liệu. Vui lòng kiểm tra lại nội dung tài liệu.";
      }

      await notificationsRepo.create({
        userId,
        title: "Tạo bộ đề thất bại",
        message: errorMessage,
        type: "error",
        relatedEntityType: "QuestionSet",
        relatedEntityId: questionSetId,
      });
    } catch (notifErr) {
      logger.error(
        { questionSetId, userId, err: notifErr?.message },
        "[questions.generate] failed to create error notification"
      );
    }
  }
};
