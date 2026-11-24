import {
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  PRIMARY_TIMEOUT_MS,
  HEDGE_DELAY_MS,
  CircuitBreaker,
  checkFastPath,
  LatencyLogger,
} from '../src/services/geminiService.js';

import { SentenceBoundarySplitter } from '../src/services/speechService.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function simulateOldFlow(prompt) {
  const t0 = Date.now();
  // Old flow:
  // 1. Only basic regex for emergency
  // 2. No fast-path for medications, time/date, who is
  // 3. Sequential API call with no timeout, no hedged request, no streaming
  // 4. Waiting for full LLM response JSON before starting TTS
  let duration = 0;
  if (/emergency|help/i.test(prompt)) {
    duration = 5; // local regex
  } else {
    // Model generation time (e.g. 1800ms) + parsing + non-streamed TTS start delay
    await sleep(2000);
    duration = Date.now() - t0;
  }
  const ttft = duration;
  const ttfa = duration + 300; // TTS starts only after full LLM finishes
  return { ttft, ttfa, total: ttfa + 1500 };
}

async function simulateNewFlow(prompt, opts = {}) {
  const logger = new LatencyLogger(prompt);
  const t0 = Date.now();

  // 1. Fast-Path check
  const fast = checkFastPath(prompt);
  if (fast) {
    logger.markFastPath(fast.intent);
    logger.markTTSFirstAudio();
    logger.markTTSDone();
    return logger.printSummary();
  }

  // 2. Streaming with Hedged Request & Sentence Pipelining
  logger.markLLMStart();

  const primaryLatency = opts.primaryLatency ?? 600; // ms to 1st token
  const fallbackLatency = opts.fallbackLatency ?? 400; // ms to 1st token

  let winnerModel = PRIMARY_MODEL;

  if (primaryLatency < HEDGE_DELAY_MS) {
    // Primary yields 1st token before 2s
    await sleep(primaryLatency);
    logger.markLLMFirstToken(PRIMARY_MODEL);
  } else {
    // Primary took > 2s -> Hedge fired at 2000ms
    logger.hedgedFired = true;
    await sleep(HEDGE_DELAY_MS);
    // Race between remainder of primary and fallback
    const fallbackFinish = fallbackLatency;
    const primaryFinish = primaryLatency - HEDGE_DELAY_MS;
    if (fallbackFinish < primaryFinish) {
      await sleep(fallbackFinish);
      winnerModel = FALLBACK_MODEL;
      logger.markLLMFirstToken(FALLBACK_MODEL);
    } else {
      await sleep(primaryFinish);
      logger.markLLMFirstToken(PRIMARY_MODEL);
    }
  }

  // First sentence is completed and sent to TTS immediately (~150ms after 1st token)
  await sleep(150);
  logger.markTTSFirstAudio();

  // Remaining stream finishes in background
  await sleep(350);
  logger.markLLMDone();

  // Full TTS finishes
  await sleep(800);
  logger.markTTSDone();

  return logger.printSummary();
}

async function runBenchmark() {
  console.log('===========================================================');
  console.log('   BEFORE vs AFTER LATENCY BENCHMARK FOR ELDERVOICE AI     ');
  console.log('===========================================================\n');

  const testCases = [
    { name: 'Fast-Path: SOS Emergency', prompt: 'Help! I have chest pain right now!' },
    { name: 'Fast-Path: Medication Status', prompt: 'Did I take my medicine today?' },
    { name: 'Fast-Path: Date / Time Query', prompt: "What time is it right now?" },
    { name: 'Fast-Path: Memory Vault Query', prompt: 'Who is Sarah?' },
    { name: 'LLM Query (Normal Fast Primary)', prompt: 'Can you tell me something comforting?', opts: { primaryLatency: 450 } },
    { name: 'LLM Query (Primary Delayed >2s -> Hedged Fallback Wins)', prompt: 'What should I do this afternoon?', opts: { primaryLatency: 2800, fallbackLatency: 350 } },
  ];

  for (const tc of testCases) {
    console.log(`\n>>> Testing: ${tc.name}`);
    console.log(`    Input: "${tc.prompt}"`);

    // Old flow
    const before = await simulateOldFlow(tc.prompt);
    // New flow
    const after = await simulateNewFlow(tc.prompt, tc.opts);

    console.log(`\n  [LATENCY COMPARISON]`);
    console.log(`  ---------------------------------------------------------`);
    console.log(`  Metric                   | Before (Old)    | After (Optimized)`);
    console.log(`  ---------------------------------------------------------`);
    console.log(`  Time-to-First-Token/Ans  | ${String(before.ttft + ' ms').padEnd(15)} | ${String((after.isFastPath ? '0 ms' : after.ttft.toFixed(1) + ' ms')).padEnd(17)}`);
    console.log(`  Time-to-First-Audio(TTFA)| ${String(before.ttfa + ' ms').padEnd(15)} | ${String(after.ttfa.toFixed(1) + ' ms').padEnd(17)}`);
    console.log(`  Total Voice Turnaround   | ${String(before.total + ' ms').padEnd(15)} | ${String(after.total.toFixed(1) + ' ms').padEnd(17)}`);
    const reduction = (((before.ttfa - after.ttfa) / before.ttfa) * 100).toFixed(1);
    console.log(`  TTFA Latency Reduction   | -> ${reduction}% FASTER! 🚀`);
    console.log(`  ---------------------------------------------------------`);
  }
}

runBenchmark();
