#!/usr/bin/env node
/**
 * Script to regenerate table of contents for all subjects
 * Usage: node scripts/regenerate-subject-toc.js [subjectId]
 */

const mongoose = require('mongoose');
const { mongo, llm } = require('../src/config');
const DocumentsRepository = require('../src/repositories/documents.repository');
const SubjectsRepository = require('../src/repositories/subjects.repository');
const LLMClient = require('../src/adapters/llmClient');

async function regenerateSubjectTOC(subjectId) {
  const docsRepo = new DocumentsRepository();
  const subjectsRepo = new SubjectsRepository();
  const client = new LLMClient(llm);

  console.log(`\n[INFO] Processing subject: ${subjectId}`);

  // Get the subject
  const subject = await subjectsRepo.findById(subjectId);
  if (!subject) {
    console.error(`[ERROR] Subject not found: ${subjectId}`);
    return false;
  }

  console.log(`[INFO] Subject name: ${subject.subjectName}`);

  // Get all completed documents in this subject
  const documents = await docsRepo.findMany(
    { subjectId, status: "Completed" },
    {
      projection: { 
        originalFileName: 1, 
        summaryShort: 1, 
        summaryFull: 1, 
        tableOfContents: 1 
      },
      sort: { uploadedAt: 1 }
    }
  );

  if (!documents || documents.length === 0) {
    console.log(`[WARN] No completed documents found for subject ${subjectId}`);
    return false;
  }

  console.log(`[INFO] Found ${documents.length} completed documents:`);
  documents.forEach((doc, idx) => {
    console.log(`  ${idx + 1}. ${doc.originalFileName} (TOC items: ${doc.tableOfContents?.length || 0})`);
  });

  console.log(`[INFO] Generating subject table of contents via LLM...`);

  try {
    // Generate subject TOC from all documents
    const { tableOfContents } = await client.generateSubjectTableOfContents({ documents });

    if (tableOfContents && Array.isArray(tableOfContents) && tableOfContents.length > 0) {
      // Update subject with new TOC
      await subjectsRepo.updateById(
        subjectId,
        { $set: { tableOfContents } },
        { new: true }
      );
      
      console.log(`[SUCCESS] Updated subject TOC with ${tableOfContents.length} chapters:`);
      tableOfContents.forEach((item, idx) => {
        console.log(`  ${idx + 1}. ${item.topicName} (ID: ${item.topicId})`);
      });
      return true;
    } else {
      console.error(`[ERROR] LLM did not generate any TOC items`);
      return false;
    }
  } catch (error) {
    console.error(`[ERROR] Failed to generate/update subject TOC:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

async function regenerateAllSubjectsTOC() {
  const subjectsRepo = new SubjectsRepository();
  const docsRepo = new DocumentsRepository();

  console.log(`[INFO] Finding all subjects with completed documents...`);

  // Get all subjects
  const subjects = await subjectsRepo.findMany({}, { limit: 1000 });
  
  if (!subjects || subjects.length === 0) {
    console.log(`[WARN] No subjects found`);
    return;
  }

  console.log(`[INFO] Found ${subjects.length} subjects\n`);

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const subject of subjects) {
    // Check if subject has completed documents
    const docCount = await docsRepo.count({ 
      subjectId: subject._id, 
      status: "Completed" 
    });

    if (docCount === 0) {
      console.log(`[SKIP] Subject "${subject.subjectName}" (${subject._id}): No completed documents`);
      skipCount++;
      continue;
    }

    const success = await regenerateSubjectTOC(subject._id.toString());
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // Small delay to avoid overwhelming LLM API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n========================================`);
  console.log(`[SUMMARY]`);
  console.log(`  Total subjects: ${subjects.length}`);
  console.log(`  ✅ Success: ${successCount}`);
  console.log(`  ⏭️  Skipped: ${skipCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
  console.log(`========================================\n`);
}

async function main() {
  try {
    // Connect to MongoDB
    console.log(`[INFO] Connecting to MongoDB...`);
    await mongoose.connect(mongo.uri);
    console.log(`[INFO] Connected to MongoDB\n`);

    const subjectId = process.argv[2];

    if (subjectId) {
      // Process single subject
      await regenerateSubjectTOC(subjectId);
    } else {
      // Process all subjects
      await regenerateAllSubjectsTOC();
    }

    await mongoose.disconnect();
    console.log(`\n[INFO] Disconnected from MongoDB`);
    process.exit(0);
  } catch (error) {
    console.error(`[FATAL ERROR]`, error);
    process.exit(1);
  }
}

main();
