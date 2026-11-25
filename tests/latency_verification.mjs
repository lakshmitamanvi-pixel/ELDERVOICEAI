import {
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  PRIMARY_TIMEOUT_MS,
  HEDGE_DELAY_MS,
  FALLBACK_TIMEOUT_MS,
  FILLER_TIMEOUT_MS,
  MAX_OUTPUT_TOKENS,
  CircuitBreaker,
  checkFastPath,
  loadSessionContext,
  getRelevantContextSubset,
  LatencyLogger,
  SYSTEM_PROMPT,
} from '../src/services/geminiService.js';

import {
  SentenceBoundarySplitter,
  TTSPipeline,
} from '../src/services/speechService.js';

console.log('====================================================');
console.log('   ELDERVOICE AI LATENCY & PIPELINE VERIFICATION    ');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    process.exitCode = 1;
  }
}

// ----------------------------------------------------------------------------
// Test 1: Configuration Constants & Model Choice (Requirements 1, 5)
// ----------------------------------------------------------------------------
console.log('--- 1. Configuration Constants & Model Choice ---');
assert(typeof PRIMARY_MODEL === 'string' && PRIMARY_MODEL.length > 0, `Primary model is configured: ${PRIMARY_MODEL}`);
assert(typeof FALLBACK_MODEL === 'string' && FALLBACK_MODEL !== PRIMARY_MODEL, `Fallback model is distinct: ${FALLBACK_MODEL}`);
assert(PRIMARY_TIMEOUT_MS >= 4000 && PRIMARY_TIMEOUT_MS <= 5000, `Primary TTFT timeout is ~4-5s (got: ${PRIMARY_TIMEOUT_MS}ms)`);
assert(HEDGE_DELAY_MS === 2000, `Hedged delay is 2000ms (got: ${HEDGE_DELAY_MS}ms)`);
assert(FALLBACK_TIMEOUT_MS >= 5000, `Fallback timeout is >= 5000ms (got: ${FALLBACK_TIMEOUT_MS}ms)`);
assert(FILLER_TIMEOUT_MS === 1500, `Canned filler timeout is 1500ms (got: ${FILLER_TIMEOUT_MS}ms)`);
assert(MAX_OUTPUT_TOKENS >= 256, `Max output tokens raised for thinking headroom (got: ${MAX_OUTPUT_TOKENS})`);

// ----------------------------------------------------------------------------
// Test 2: Prompt Trim & Minimal Context Subset Injection (Requirement 6)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Prompt Trim & Session Context Subset Injection ---');
assert(SYSTEM_PROMPT.includes('1-2 short') && SYSTEM_PROMPT.length < 200, `System prompt trimmed (< 200 chars, got: ${SYSTEM_PROMPT.length})`);

const ctx = loadSessionContext();
assert(ctx && ctx.profile && ctx.medications, 'Session context loaded once into memory cache');

const medContext = getRelevantContextSubset('Did I take my Lisinopril pills?');
assert(medContext.includes('Lisinopril') && !medContext.includes('Sarah'), `Medication query only injects meds: "${medContext}"`);

const famContext = getRelevantContextSubset('Who is Sarah?');
assert(famContext.includes('Sarah') && !famContext.includes('Lisinopril'), `Family query only injects family: "${famContext}"`);

const genContext = getRelevantContextSubset('Tell me a story');
assert(genContext === '', `General query injects empty context to minimize latency: "${genContext}"`);

// ----------------------------------------------------------------------------
// Test 3: Fast-Path Rule/Keyword Intents (Requirement 7)
// ----------------------------------------------------------------------------
console.log('\n--- 3. Fast-Path (No LLM, Instant DB Response) ---');

// 3a. SOS / Emergency
const sosResult = checkFastPath('Emergency! I need help right now!');
assert(sosResult && sosResult.handled && sosResult.intent === 'emergency', 'Fast-path handles SOS/help with intent=emergency');
assert(sosResult.actionTrigger && sosResult.actionTrigger.type === 'TRIGGER_ALERT', 'Fast-path triggers emergency caregiver alert');

// 3b. "did I take my medicine"
const medCheck = checkFastPath('Did I take my medicine today?');
assert(medCheck && medCheck.handled && medCheck.intent === 'medication', 'Fast-path handles medication query from DB');
assert(medCheck.reply.includes('Lisinopril') || medCheck.reply.includes('taken'), `Medication status reply from DB: "${medCheck.reply}"`);

// 3c. "what's the time/date"
const timeCheck = checkFastPath("What time is it?");
assert(timeCheck && timeCheck.handled && timeCheck.intent === 'time_date', `Fast-path handles time query: "${timeCheck.reply}"`);

const dateCheck = checkFastPath("What is today's date?");
assert(dateCheck && dateCheck.handled && dateCheck.intent === 'time_date', `Fast-path handles date query: "${dateCheck.reply}"`);

// 3d. "who is <name>"
const whoCheck = checkFastPath("Who is Sarah?");
assert(whoCheck && whoCheck.handled && whoCheck.intent === 'memory_vault', `Fast-path handles 'who is Sarah': "${whoCheck.reply}"`);

const whoDoctor = checkFastPath("Who is Dr. Chen?");
assert(whoDoctor && whoDoctor.handled && whoDoctor.intent === 'appointment', `Fast-path handles doctor query: "${whoDoctor.reply}"`);

// Non-fast-path query returns null (routes to LLM)
const llmQuery = checkFastPath("I am feeling a little lonely today.");
assert(llmQuery === null, 'Complex queries correctly pass through to LLM streaming path');

// ----------------------------------------------------------------------------
// Test 4: Sentence Boundary Splitter (Requirement 4)
// ----------------------------------------------------------------------------
console.log('\n--- 4. Sentence Boundary Splitter (TTS Pipelining) ---');
const splitSentences = [];
const splitter = new SentenceBoundarySplitter((sentence) => {
  splitSentences.push(sentence);
});

splitter.push('Hello ');
splitter.push('Eleanor. ');
assert(splitSentences.length === 1 && splitSentences[0] === 'Hello Eleanor.', `Sentence 1 split immediately: "${splitSentences[0]}"`);

splitter.push('How are you feeling ');
splitter.push('today? ');
assert(splitSentences.length === 2 && splitSentences[1] === 'How are you feeling today?', `Sentence 2 split immediately: "${splitSentences[1]}"`);

splitter.push('I hope you have a wonderful morning!');
splitter.flush();
assert(splitSentences.length === 3 && splitSentences[2] === 'I hope you have a wonderful morning!', `Sentence 3 flushed at stream end: "${splitSentences[2]}"`);

// ----------------------------------------------------------------------------
// Test 5: Circuit Breaker State Transitions (Requirement 8)
// ----------------------------------------------------------------------------
console.log('\n--- 5. Circuit Breaker Behavior ---');
const cb = new CircuitBreaker(3, 60000, 120000);
assert(!cb.isOpen(), 'Circuit breaker begins CLOSED');

cb.recordFailure('primary', new Error('timeout 1'));
assert(!cb.isOpen(), 'Circuit breaker remains CLOSED after 1 failure');

cb.recordFailure('primary', new Error('503 Service Unavailable'));
assert(!cb.isOpen(), 'Circuit breaker remains CLOSED after 2 failures');

cb.recordFailure('primary', new Error('timeout 3'));
assert(cb.isOpen(), 'Circuit breaker trips to OPEN after 3 failures in 60s');
assert(cb.openUntil > Date.now(), 'Circuit breaker cooldown scheduled for 2 minutes');

// ----------------------------------------------------------------------------
// Test 6: Latency Logger Timestamps & Summary (Requirement 9)
// ----------------------------------------------------------------------------
console.log('\n--- 6. Latency Logger Summary ---');
const logger = new LatencyLogger('Did I take my medicine?');
logger.markFastPath('medication');
logger.markTTSFirstAudio();
logger.markTTSDone();
const summary = logger.printSummary();

assert(summary && summary.isFastPath === true, 'Logger reports fast-path correctly');
assert(typeof summary.total === 'number' && summary.total >= 0, `Total turnaround logged: ${summary.total}ms`);

console.log(`\n====================================================`);
console.log(`   TEST RESULTS: ${passedTests}/${totalTests} PASSED   `);
console.log(`====================================================`);

if (passedTests !== totalTests) {
  process.exit(1);
}
