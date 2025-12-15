#!/usr/bin/env node
/**
 * Script to generate Table of Contents (TOC) for a specific subject
 * 
 * Usage:
 *   1. Thay đổi SUBJECT_ID bên dưới thành ID môn học cần tạo TOC
 *   2. Chạy: node scripts/generate-subject-toc.js
 * 
 * Hoặc truyền ID qua command line:
 *   node scripts/generate-subject-toc.js <subjectId>
 */

const mongoose = require('mongoose');
const { env, llm } = require('../src/config');
const DocumentsRepository = require('../src/repositories/documents.repository');
const SubjectsRepository = require('../src/repositories/subjects.repository');
const LLMClient = require('../src/adapters/llmClient');

// =====================================================
// 👇 THAY ĐỔI SUBJECT_ID TẠI ĐÂY
// =====================================================
const SUBJECT_ID = '693e7bec810ab262bf38ec7c'; // VD: '6578abc123def456789012ab'
// =====================================================

async function generateSubjectTOC(subjectId) {
  const docsRepo = new DocumentsRepository();
  const subjectsRepo = new SubjectsRepository();
  const llmClient = new LLMClient(llm);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📚 GENERATE SUBJECT TABLE OF CONTENTS`);
  console.log(`${'='.repeat(60)}\n`);

  // Validate subjectId
  if (!subjectId || subjectId.trim() === '') {
    console.error(`❌ [ERROR] Subject ID is required!`);
    console.log(`\n💡 Cách sử dụng:`);
    console.log(`   1. Thay đổi SUBJECT_ID trong file script`);
    console.log(`   2. Hoặc chạy: node scripts/generate-subject-toc.js <subjectId>\n`);
    return false;
  }

  // Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    console.error(`❌ [ERROR] Invalid Subject ID format: ${subjectId}`);
    return false;
  }

  console.log(`🔍 Looking up subject: ${subjectId}`);

  // Get the subject
  const subject = await subjectsRepo.findById(subjectId);
  if (!subject) {
    console.error(`❌ [ERROR] Subject not found: ${subjectId}`);
    return false;
  }

  console.log(`✅ Found subject: "${subject.subjectName}"`);
  console.log(`   - Level: ${subject.level || 'Not specified'}`);
  console.log(`   - Description: ${subject.description || 'No description'}`);
  console.log(`   - Current TOC items: ${subject.tableOfContents?.length || 0}`);

  // Get all completed documents in this subject
  console.log(`\n📄 Fetching completed documents...`);
  
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
    console.log(`⚠️  [WARN] No completed documents found for this subject`);
    console.log(`   Make sure documents are uploaded and processed first.\n`);
    return false;
  }

  console.log(`✅ Found ${documents.length} completed document(s):\n`);
  documents.forEach((doc, idx) => {
    const tocCount = doc.tableOfContents?.length || 0;
    console.log(`   ${idx + 1}. ${doc.originalFileName}`);
    console.log(`      - Document TOC items: ${tocCount}`);
  });

  // Generate subject TOC using LLM
  console.log(`\n🤖 Generating subject TOC via LLM...`);
  console.log(`   This may take a moment...\n`);

  try {
    const { tableOfContents } = await llmClient.generateSubjectTableOfContents({ documents });

    if (!tableOfContents || !Array.isArray(tableOfContents) || tableOfContents.length === 0) {
      console.error(`❌ [ERROR] LLM did not generate any TOC items`);
      return false;
    }

    // Update subject with new TOC
    await subjectsRepo.updateById(
      subjectId,
      { $set: { tableOfContents } },
      { new: true }
    );
    
    console.log(`✅ Successfully generated TOC with ${tableOfContents.length} chapter(s):\n`);
    
    // Print TOC tree
    printTOCTree(tableOfContents);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ DONE! Subject TOC has been updated.`);
    console.log(`${'='.repeat(60)}\n`);
    
    return true;
  } catch (error) {
    console.error(`❌ [ERROR] Failed to generate/update subject TOC:`, error.message);
    if (error.stack) {
      console.error(`\nStack trace:`, error.stack);
    }
    return false;
  }
}

/**
 * Print TOC in tree format
 */
function printTOCTree(topics, level = 0) {
  const indent = '   '.repeat(level);
  const prefix = level === 0 ? '📖' : '├──';
  
  topics.forEach((topic, idx) => {
    const isLast = idx === topics.length - 1;
    const linePrefix = level === 0 ? `${idx + 1}.` : (isLast ? '└──' : '├──');
    
    console.log(`${indent}${linePrefix} ${topic.topicName}`);
    console.log(`${indent}   (ID: ${topic.topicId})`);
    
    if (topic.childTopics && topic.childTopics.length > 0) {
      printTOCTree(topic.childTopics, level + 1);
    }
  });
}

async function main() {
  try {
    // Get subject ID from command line or use hardcoded value
    const subjectId = process.argv[2] || SUBJECT_ID;

    // Connect to MongoDB
    console.log(`🔌 Connecting to MongoDB...`);
    await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName });
    console.log(`✅ Connected to MongoDB`);

    // Generate TOC
    const success = await generateSubjectTOC(subjectId);

    // Disconnect
    await mongoose.disconnect();
    console.log(`🔌 Disconnected from MongoDB`);
    
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(`\n💥 [FATAL ERROR]`, error);
    process.exit(1);
  }
}

main();
