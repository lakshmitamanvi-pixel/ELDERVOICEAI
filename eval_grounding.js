/**
 * ============================================================================
 * ElderVoice AI - Grounding Evaluation Suite (eval_grounding.js)
 *
 * Compares:
 * 1. RAG Pipeline: Memory Retriever (top-4 facts) + Fast-Path DB bypass
 * 2. Without RAG: Plain LLM with full context dump
 *
 * Evaluates 30 Grounding Questions:
 * - 10 Answerable (People)
 * - 8 Answerable (Meds/Schedule)
 * - 7 Unanswerable (Info not in DB)
 * - 5 Tricky (Similar names, misspellings, vague queries)
 *
 * Outputs:
 * - Console report with failures (Question + Reply)
 * - results.md (formatted markdown table and breakdown)
 * - results.csv (detailed CSV rows with per-question scoring)
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

// Set fallback model as primary to avoid 429 quota exhaustion during benchmarking
if (typeof process !== 'undefined' && process.env) {
  if (!process.env.VITE_GEMINI_PRIMARY_MODEL) {
    process.env.VITE_GEMINI_PRIMARY_MODEL = 'gemini-3.5-flash-lite';
  }
}

import {
  handleVoice,
  SYSTEM_PROMPT,
  loadSessionContext,
} from './src/services/geminiService.js';
import { DEFAULT_PROFILE, DEFAULT_MEDICATIONS, buildFactChunks, getApiKey } from './memory_retriever.js';

/**
 * ----------------------------------------------------------------------------
 * 1. TEST DATASET (30 Questions)
 * ----------------------------------------------------------------------------
 */
export const EVAL_QUESTIONS = [
  // --- 10 Answerable (People) ---
  {
    id: 1,
    category: 'people',
    question: 'Who is Sarah?',
    expected_keywords: ['daughter', 'leo', 'sunday'],
    is_unanswerable: false,
    expected_answer: 'Daughter who visits on Sunday with grandson Leo.',
  },
  {
    id: 2,
    category: 'people',
    question: 'Who is my son?',
    expected_keywords: ['michael', 'son'],
    is_unanswerable: false,
    expected_answer: 'Michael, lives in Seattle, calls on Wednesday evenings.',
  },
  {
    id: 3,
    category: 'people',
    question: 'Who was Arthur Vance?',
    expected_keywords: ['husband', 'married', 'ballroom'],
    is_unanswerable: false,
    expected_answer: 'Late husband, married for 48 years, loved ballroom dancing.',
  },
  {
    id: 4,
    category: 'people',
    question: 'What is Sarah Vance phone number?',
    expected_keywords: ['555', '912-3456'],
    is_unanswerable: false,
    expected_answer: '(555) 912-3456.',
  },
  {
    id: 5,
    category: 'people',
    question: 'Who is my primary doctor?',
    expected_keywords: ['chen', 'robert'],
    is_unanswerable: false,
    expected_answer: 'Dr. Robert Chen, MD.',
  },
  {
    id: 6,
    category: 'people',
    question: 'Who is my primary caregiver?',
    expected_keywords: ['sarah'],
    is_unanswerable: false,
    expected_answer: 'Sarah Vance (daughter / primary carer).',
  },
  {
    id: 7,
    category: 'people',
    question: 'What is Dr. Robert Chen phone number?',
    expected_keywords: ['555', '234-8900'],
    is_unanswerable: false,
    expected_answer: '(555) 234-8900.',
  },
  {
    id: 8,
    category: 'people',
    question: 'What is my son Michael phone number?',
    expected_keywords: ['555', '876-5432'],
    is_unanswerable: false,
    expected_answer: '(555) 876-5432.',
  },
  {
    id: 9,
    category: 'people',
    question: 'Who visits me on Sunday afternoons?',
    expected_keywords: ['sarah', 'leo'],
    is_unanswerable: false,
    expected_answer: 'Sarah with grandson Leo.',
  },
  {
    id: 10,
    category: 'people',
    question: 'Who calls me on Wednesday evenings?',
    expected_keywords: ['michael'],
    is_unanswerable: false,
    expected_answer: 'Michael.',
  },

  // --- 8 Answerable (Meds / Schedule) ---
  {
    id: 11,
    category: 'meds_schedule',
    question: 'What is the dosage for Metformin?',
    expected_keywords: ['500', 'mg'],
    is_unanswerable: false,
    expected_answer: '500mg.',
  },
  {
    id: 12,
    category: 'meds_schedule',
    question: 'When should I take my Lisinopril?',
    expected_keywords: ['08:00', '8'],
    is_unanswerable: false,
    expected_answer: '08:00 in the morning.',
  },
  {
    id: 13,
    category: 'meds_schedule',
    question: 'At what time do I take Atorvastatin?',
    expected_keywords: ['20:00', '8', 'bedtime'],
    is_unanswerable: false,
    expected_answer: '20:00 (bedtime).',
  },
  {
    id: 14,
    category: 'meds_schedule',
    question: 'What are the instructions for taking Lisinopril?',
    expected_keywords: ['morning', 'water', 'tablet'],
    is_unanswerable: false,
    expected_answer: 'Take 1 tablet in morning with a full glass of water.',
  },
  {
    id: 15,
    category: 'meds_schedule',
    question: 'How should I take Metformin?',
    expected_keywords: ['meal', 'mid-day'],
    is_unanswerable: false,
    expected_answer: 'Take with mid-day meal.',
  },
  {
    id: 16,
    category: 'meds_schedule',
    question: 'Did I take my Lisinopril today?',
    expected_keywords: ['taken', 'confirmed', 'yes', 'already'],
    is_unanswerable: false,
    expected_answer: 'Yes, Lisinopril is confirmed / taken.',
  },
  {
    id: 17,
    category: 'meds_schedule',
    question: 'What is the status of my Metformin today?',
    expected_keywords: ['pending', 'scheduled', 'haven\'t', 'later'],
    is_unanswerable: false,
    expected_answer: 'Pending / scheduled for later.',
  },
  {
    id: 18,
    category: 'meds_schedule',
    question: 'What are all the medications I am currently prescribed?',
    expected_keywords: ['lisinopril', 'metformin', 'atorvastatin'],
    is_unanswerable: false,
    expected_answer: 'Lisinopril, Metformin, and Atorvastatin.',
  },

  // --- 7 Unanswerable (Info Not in DB) ---
  {
    id: 19,
    category: 'unanswerable',
    question: 'What is my cousin George phone number?',
    expected_keywords: ['not sure', 'ask sarah', "don't know", 'no information'],
    is_unanswerable: true,
    expected_answer: "I'm not sure, shall I ask Sarah?",
  },
  {
    id: 20,
    category: 'unanswerable',
    question: 'Where does my brother Bob live?',
    expected_keywords: ['not sure', 'ask sarah', "don't know", 'no information'],
    is_unanswerable: true,
    expected_answer: "I'm not sure, shall I ask Sarah?",
  },
  {
    id: 21,
    category: 'unanswerable',
    question: 'What dose of insulin should I take before dinner?',
    expected_keywords: ['not sure', 'ask sarah', "don't know", 'no insulin', 'not prescribed'],
    is_unanswerable: true,
    expected_answer: "I'm not sure, shall I ask Sarah? (No insulin prescribed).",
  },
  {
    id: 22,
    category: 'unanswerable',
    question: 'What is my pet dog name?',
    expected_keywords: ['not sure', 'ask sarah', "don't know", 'no pet'],
    is_unanswerable: true,
    expected_answer: "I'm not sure, shall I ask Sarah?",
  },
  {
    id: 23,
    category: 'unanswerable',
    question: 'Who is my eye doctor for my cataract surgery?',
    expected_keywords: ['not sure', 'ask sarah', "don't know", 'primary physician'],
    is_unanswerable: true,
    expected_answer: "I'm not sure, shall I ask Sarah?",
  },
  {
    id: 24,
    category: 'unanswerable',
    question: 'What time is my physical therapy session today?',
    expected_keywords: ['not sure', 'ask sarah', "don't know", 'no appointment'],
    is_unanswerable: true,
    expected_answer: "I'm not sure, shall I ask Sarah?",
  },
  {
    id: 25,
    category: 'unanswerable',
    question: 'What is my grandson Leo exact birthday date?',
    expected_keywords: ['not sure', 'ask sarah', "don't know", 'no date'],
    is_unanswerable: true,
    expected_answer: "I'm not sure, shall I ask Sarah?",
  },

  // --- 5 Tricky (Similar Names, Misspellings, Vague) ---
  {
    id: 26,
    category: 'tricky',
    question: 'Is Samantha my daughter?',
    expected_keywords: ['sarah', 'not sure', 'ask sarah', 'no'],
    is_unanswerable: true,
    expected_answer: "Sarah is your daughter, not Samantha / I'm not sure, shall I ask Sarah?",
  },
  {
    id: 27,
    category: 'tricky',
    question: 'When should I take my Lisenopril pills?',
    expected_keywords: ['08:00', '8', 'morning'],
    is_unanswerable: false,
    expected_answer: 'Lisinopril is scheduled for 08:00 in the morning.',
  },
  {
    id: 28,
    category: 'tricky',
    question: 'What is the dosage of Metaformin?',
    expected_keywords: ['500', 'mg'],
    is_unanswerable: false,
    expected_answer: '500mg.',
  },
  {
    id: 29,
    category: 'tricky',
    question: 'What did my husband love doing?',
    expected_keywords: ['ballroom', 'dancing', 'dance'],
    is_unanswerable: false,
    expected_answer: 'Arthur loved ballroom dancing.',
  },
  {
    id: 30,
    category: 'tricky',
    question: 'What warm drink do I prefer before breakfast?',
    expected_keywords: ['chamomile', 'tea', 'honey'],
    is_unanswerable: false,
    expected_answer: 'Warm chamomile tea with honey.',
  },
];

/**
 * ----------------------------------------------------------------------------
 * 2. FULL CONTEXT DUMP BUILDER (For No-RAG comparison)
 * ----------------------------------------------------------------------------
 */
export function buildFullContextDump() {
  const chunks = buildFactChunks({ profile: DEFAULT_PROFILE, medications: DEFAULT_MEDICATIONS });
  return chunks.map((c) => `- [${c.id}]: ${c.text}`).join('\n');
}

/**
 * ----------------------------------------------------------------------------
 * 3. RESPONSE SCORER
 * Categories: Correct | Hallucinated | Wrongly Refused
 * ----------------------------------------------------------------------------
 */
export function scoreResponse(questionObj, replyText) {
  const text = (replyText || '').toLowerCase().trim();
  const refuses =
    text.includes('not sure') ||
    text.includes('ask sarah') ||
    text.includes("don't know") ||
    text.includes('do not know') ||
    text.includes('no record') ||
    text.includes('no information') ||
    text.includes('listen');

  if (questionObj.is_unanswerable) {
    if (refuses) {
      return {
        status: 'correct',
        hallucinated: false,
        wrongly_refused: false,
        reason: 'Properly refused ungrounded information and prompted caregiver fallback.',
      };
    }
    // Stated a fact for unanswerable query -> Hallucination!
    return {
      status: 'hallucinated',
      hallucinated: true,
      wrongly_refused: false,
      reason: 'Hallucinated an answer for information not present in the DB.',
    };
  }

  // Answerable questions
  if (refuses) {
    return {
      status: 'wrongly_refused',
      hallucinated: false,
      wrongly_refused: true,
      reason: 'Refused to answer even though fact exists in the DB.',
    };
  }

  // Check expected keywords
  const matchedKeywords = questionObj.expected_keywords.filter((kw) => text.includes(kw.toLowerCase()));
  if (matchedKeywords.length > 0) {
    return {
      status: 'correct',
      hallucinated: false,
      wrongly_refused: false,
      reason: `Answered correctly containing: "${matchedKeywords.join(', ')}".`,
    };
  }

  // Didn't refuse, but didn't match fact keywords -> Hallucinated / Incorrect
  return {
    status: 'hallucinated',
    hallucinated: true,
    wrongly_refused: false,
    reason: 'Gave an incorrect or hallucinated statement without correct facts.',
  };
}

/**
 * ----------------------------------------------------------------------------
 * 4. RUNNER: Without RAG (Plain LLM + Full Context Dump)
 * ----------------------------------------------------------------------------
 */
export async function runWithoutRag(questionObj, aiClient, modelName = 'gemini-3.5-flash-lite') {
  const fullDump = buildFullContextDump();
  const prompt = `FACTS:\n${fullDump}\n\nUser: "${questionObj.question}"`;

  const t0 = Date.now();
  try {
    const resp = await aiClient.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.1,
        maxOutputTokens: 100,
      },
    });
    const latency = Date.now() - t0;
    const reply = resp.text?.trim() || '';
    const score = scoreResponse(questionObj, reply);
    return {
      reply,
      latency,
      score,
      factIds: ['all_full_dump'],
      error: null,
    };
  } catch (err) {
    const latency = Date.now() - t0;
    return {
      reply: 'Error: ' + err.message,
      latency,
      score: { status: 'error', hallucinated: false, wrongly_refused: false, reason: err.message },
      factIds: [],
      error: err,
    };
  }
}

/**
 * ----------------------------------------------------------------------------
 * 5. MAIN BENCHMARK RUNNER
 * ----------------------------------------------------------------------------
 */
export async function runGroundingEval() {
  console.log('================================================================');
  console.log('          ELDERVOICE AI - GROUNDING EVALUATION SUITE            ');
  console.log('================================================================\n');

  const apiKey = getApiKey();
  const aiClient = new GoogleGenAI({ apiKey });

  const ragResults = [];
  const noRagResults = [];
  const failures = [];

  console.log(`Starting benchmark across ${EVAL_QUESTIONS.length} test questions...`);
  console.log(`Pipeline 1: Real RAG Pipeline (memory_retriever + fast-path bypass)`);
  console.log(`Pipeline 2: No-RAG Pipeline (Plain LLM + Full Context Dump)\n`);

  for (let i = 0; i < EVAL_QUESTIONS.length; i++) {
    const q = EVAL_QUESTIONS[i];
    process.stdout.write(`[${i + 1}/${EVAL_QUESTIONS.length}] Testing Q${q.id} (${q.category}): "${q.question}"... `);

    // 1. Run through Real Pipeline (with RAG)
    const t0 = Date.now();
    let ragResult;
    try {
      const res = await handleVoice(q.question);
      const latency = Date.now() - t0;
      const score = scoreResponse(q, res.reply);
      ragResult = {
        questionId: q.id,
        category: q.category,
        question: q.question,
        reply: res.reply,
        latency,
        score,
        fastPath: res.fastPath,
        factIds: res.retrievedFactIds || [],
      };
    } catch (err) {
      ragResult = {
        questionId: q.id,
        category: q.category,
        question: q.question,
        reply: 'Pipeline error: ' + err.message,
        latency: Date.now() - t0,
        score: { status: 'error', hallucinated: false, wrongly_refused: false, reason: err.message },
        fastPath: false,
        factIds: [],
      };
    }
    ragResults.push(ragResult);

    if (ragResult.score.status !== 'correct') {
      failures.push({
        pipeline: 'RAG Pipeline',
        question: q.question,
        reply: ragResult.reply,
        expected: q.expected_answer,
        status: ragResult.score.status,
        reason: ragResult.score.reason,
      });
    }

    // 2. Run through No-RAG Pipeline
    const noRag = await runWithoutRag(q, aiClient);
    noRagResults.push({
      questionId: q.id,
      category: q.category,
      question: q.question,
      reply: noRag.reply,
      latency: noRag.latency,
      score: noRag.score,
    });

    if (noRag.score.status !== 'correct') {
      failures.push({
        pipeline: 'No-RAG Pipeline',
        question: q.question,
        reply: noRag.reply,
        expected: q.expected_answer,
        status: noRag.score.status,
        reason: noRag.score.reason,
      });
    }

    console.log(`[RAG: ${ragResult.score.status.toUpperCase()} (${ragResult.latency}ms)] [No-RAG: ${noRag.score.status.toUpperCase()} (${noRag.latency}ms)]`);
  }

  // Calculate Metrics
  const computeMetrics = (results) => {
    const total = results.length;
    const correct = results.filter((r) => r.score.status === 'correct').length;
    const hallucinated = results.filter((r) => r.score.status === 'hallucinated').length;
    const wronglyRefused = results.filter((r) => r.score.status === 'wrongly_refused').length;
    const avgLatency = Math.round(results.reduce((sum, r) => sum + r.latency, 0) / total);

    return {
      total,
      correct,
      hallucinated,
      wronglyRefused,
      accuracyPct: ((correct / total) * 100).toFixed(1),
      hallucinationPct: ((hallucinated / total) * 100).toFixed(1),
      wrongRefusalPct: ((wronglyRefused / total) * 100).toFixed(1),
      avgLatency,
    };
  };

  const ragMetrics = computeMetrics(ragResults);
  const noRagMetrics = computeMetrics(noRagResults);

  console.log('\n================================================================');
  console.log('                    BENCHMARK RESULTS TABLE                     ');
  console.log('================================================================\n');

  console.table([
    {
      Configuration: 'ElderVoice AI (With RAG)',
      'Accuracy %': `${ragMetrics.accuracyPct}% (${ragMetrics.correct}/${ragMetrics.total})`,
      'Hallucination %': `${ragMetrics.hallucinationPct}% (${ragMetrics.hallucinated}/${ragMetrics.total})`,
      'Wrong Refusal %': `${ragMetrics.wrongRefusalPct}% (${ragMetrics.wronglyRefused}/${ragMetrics.total})`,
      'Avg Latency': `${ragMetrics.avgLatency} ms`,
    },
    {
      Configuration: 'Without RAG (Full Dump)',
      'Accuracy %': `${noRagMetrics.accuracyPct}% (${noRagMetrics.correct}/${noRagMetrics.total})`,
      'Hallucination %': `${noRagMetrics.hallucinationPct}% (${noRagMetrics.hallucinated}/${noRagMetrics.total})`,
      'Wrong Refusal %': `${noRagMetrics.wrongRefusalPct}% (${noRagMetrics.wronglyRefused}/${noRagMetrics.total})`,
      'Avg Latency': `${noRagMetrics.avgLatency} ms`,
    },
  ]);

  // Report Failures
  console.log('----------------------------------------------------------------');
  console.log(`FAILURES REPORT (${failures.length} occurrences across both runs):`);
  console.log('----------------------------------------------------------------');
  if (failures.length === 0) {
    console.log('✅ No failures detected! 100% grounding accuracy.');
  } else {
    failures.forEach((f, idx) => {
      console.log(`\nFailure #${idx + 1} [${f.pipeline}]:`);
      console.log(`  Question: "${f.question}"`);
      console.log(`  Reply:    "${f.reply}"`);
      console.log(`  Expected: "${f.expected}"`);
      console.log(`  Type:     ${f.status} (${f.reason})`);
    });
  }

  // Write results.csv
  const csvRows = [
    'Question_ID,Category,Question,Expected_Answer,RAG_Reply,RAG_Status,RAG_Latency_ms,RAG_Fact_IDs,NoRAG_Reply,NoRAG_Status,NoRAG_Latency_ms',
  ];

  for (let i = 0; i < EVAL_QUESTIONS.length; i++) {
    const q = EVAL_QUESTIONS[i];
    const r = ragResults[i];
    const nr = noRagResults[i];
    const sanitize = (str) => `"${String(str || '').replace(/"/g, '""')}"`;

    csvRows.push(
      [
        q.id,
        q.category,
        sanitize(q.question),
        sanitize(q.expected_answer),
        sanitize(r.reply),
        r.score.status,
        r.latency,
        sanitize(r.factIds.join('; ')),
        sanitize(nr.reply),
        nr.score.status,
        nr.latency,
      ].join(',')
    );
  }

  fs.writeFileSync(path.resolve(process.cwd(), 'results.csv'), csvRows.join('\n'), 'utf8');
  console.log('\nSaved results to results.csv');

  // Write results.md
  const mdContent = `# ElderVoice AI Grounding Evaluation Results

Evaluated 30 questions across:
- **10 Answerable (People)**
- **8 Answerable (Meds/Schedule)**
- **7 Unanswerable (Information not in DB)**
- **5 Tricky (Similar names, misspellings, vague queries)**

## Comparison Summary Table

| Metric | With RAG (Real Pipeline) | Without RAG (Plain LLM + Full Dump) | Delta / Improvement |
| :--- | :--- | :--- | :--- |
| **Accuracy (%)** | **${ragMetrics.accuracyPct}%** (${ragMetrics.correct}/${ragMetrics.total}) | **${noRagMetrics.accuracyPct}%** (${noRagMetrics.correct}/${noRagMetrics.total}) | **${(ragMetrics.accuracyPct - noRagMetrics.accuracyPct).toFixed(1)}%** |
| **Hallucination (%)** | **${ragMetrics.hallucinationPct}%** (${ragMetrics.hallucinated}/${ragMetrics.total}) | **${noRagMetrics.hallucinationPct}%** (${noRagMetrics.hallucinated}/${noRagMetrics.total}) | **${(ragMetrics.hallucinationPct - noRagMetrics.hallucinationPct).toFixed(1)}%** |
| **Wrong Refusal (%)** | **${ragMetrics.wrongRefusalPct}%** (${ragMetrics.wronglyRefused}/${ragMetrics.total}) | **${noRagMetrics.wrongRefusalPct}%** (${noRagMetrics.wronglyRefused}/${noRagMetrics.total}) | **${(ragMetrics.wrongRefusalPct - noRagMetrics.wrongRefusalPct).toFixed(1)}%** |
| **Average Latency** | **${ragMetrics.avgLatency} ms** | **${noRagMetrics.avgLatency} ms** | **${ragMetrics.avgLatency < noRagMetrics.avgLatency ? `${Math.round(noRagMetrics.avgLatency - ragMetrics.avgLatency)}ms faster ⚡` : `${Math.round(ragMetrics.avgLatency - noRagMetrics.avgLatency)}ms`}** |

---

## Breakdown by Category (With RAG)

${['people', 'meds_schedule', 'unanswerable', 'tricky']
  .map((cat) => {
    const subset = ragResults.filter((r) => r.category === cat);
    const correct = subset.filter((r) => r.score.status === 'correct').length;
    const avgLat = Math.round(subset.reduce((a, b) => a + b.latency, 0) / subset.length);
    return `- **${cat.toUpperCase()}** (${subset.length} Qs): ${((correct / subset.length) * 100).toFixed(1)}% Accuracy (${correct}/${subset.length}), Avg Latency: ${avgLat}ms`;
  })
  .join('\n')}

---

## Detailed Failures (Reported with Question & Reply)

${
  failures.length === 0
    ? '_No failures recorded. 100% grounding achieved._'
    : failures
        .map(
          (f, idx) => `### Failure ${idx + 1} (${f.pipeline})
- **Question**: "${f.question}"
- **Reply**: "${f.reply}"
- **Expected**: "${f.expected}"
- **Error Classification**: ${f.status} (${f.reason})
`
        )
        .join('\n')
}

---
_Generated on ${new Date().toISOString()}_
`;

  fs.writeFileSync(path.resolve(process.cwd(), 'results.md'), mdContent, 'utf8');
  console.log('Saved results to results.md\n');
}

// Auto-run when executed directly via CLI
if (typeof process !== 'undefined' && process.argv?.[1]) {
  const arg = process.argv[1].replace(/\\/g, '/');
  if (arg.endsWith('eval_grounding.js') || arg.endsWith('eval_grounding')) {
    runGroundingEval().catch((err) => {
      console.error('Evaluation run failed:', err);
      process.exitCode = 1;
    });
  }
}

export default {
  runGroundingEval,
  EVAL_QUESTIONS,
  scoreResponse,
};
