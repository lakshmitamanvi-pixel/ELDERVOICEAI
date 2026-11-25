import assert from 'node:assert/strict';
import {
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  CANNED_FALLBACK_REPLY,
  checkStartupHealth,
  call_llm,
  handleVoice,
} from '../src/services/geminiService.js';

const MODES = ['timeout', '404', 'empty', 'safety', 'midstream'];

async function main() {
  console.log('=== 1. STARTUP ASSERTION & VALIDATION ===');
  const health = await checkStartupHealth();
  assert.equal(health.success, true, 'Startup validation should succeed');
  assert.notEqual(PRIMARY_MODEL, FALLBACK_MODEL, 'PRIMARY_MODEL must differ from FALLBACK_MODEL');
  assert.equal(health.activePrimaryModel, PRIMARY_MODEL);
  assert.equal(health.activeFallbackModel, FALLBACK_MODEL);

  const table = [];

  console.log('\n=== 2. FAILURE INJECTION TESTS ===');
  for (const mode of MODES) {
    if (table.length > 0) await new Promise((r) => setTimeout(r, 2000));
    process.env.FORCE_PRIMARY_FAIL = mode;
    delete process.env.FORCE_FALLBACK_FAIL;

    const spokenSentences = [];
    const logs = [];
    const origWarn = console.warn;
    console.warn = (...args) => {
      logs.push(args.join(' '));
      origWarn(...args);
    };

    try {
      const res = await handleVoice('When does Sarah usually visit me?', {
        onSentence: (s) => spokenSentences.push(s),
      });

      assert.equal(res.fallbackTriggered, true, `[${mode}] fallbackTriggered must be true`);
      assert.equal(res.model, FALLBACK_MODEL, `[${mode}] model must be FALLBACK_MODEL (${FALLBACK_MODEL}), got ${res.model}`);
      assert.ok(res.reply && res.reply.trim().length > 0, `[${mode}] reply must be non-empty`);
      assert.ok(
        logs.some((l) => l.includes('FALLBACK USED: reason=')),
        `[${mode}] must log "FALLBACK USED: reason=..."`
      );
      if (mode === 'midstream') {
        assert.ok(
          spokenSentences.every((s) => !s.includes('Let me check on that for you,')),
          `[${mode}] must not speak partial half-sentence from failed primary`
        );
      }

      table.push({
        mode,
        fallbackTriggered: res.fallbackTriggered ? 'y' : 'n',
        modelUsed: res.model,
        failureReason: res.failureReason,
        ttftMs: res.ttftMs,
        totalMs: res.totalLatencyMs,
        passed: true,
      });
    } finally {
      console.warn = origWarn;
    }
  }

  console.log('\n=== 3. BOTH MODELS FAILING -> CANNED REPLY (NO CRASH) ===');
  process.env.FORCE_PRIMARY_FAIL = '404';
  process.env.FORCE_FALLBACK_FAIL = '404';
  const bothFailRes = await call_llm('When does Sarah usually visit me?');
  assert.equal(bothFailRes.model, 'canned');
  assert.equal(bothFailRes.fallbackTriggered, true);
  assert.equal(bothFailRes.text, CANNED_FALLBACK_REPLY);
  table.push({
    mode: 'both_fail (404+404)',
    fallbackTriggered: bothFailRes.fallbackTriggered ? 'y' : 'n',
    modelUsed: bothFailRes.model,
    failureReason: bothFailRes.failureReason,
    ttftMs: bothFailRes.ttftMs,
    totalMs: bothFailRes.totalLatencyMs,
    passed: true,
  });

  delete process.env.FORCE_PRIMARY_FAIL;
  delete process.env.FORCE_FALLBACK_FAIL;

  console.log('\n=== 4. TEST RESULTS SUMMARY ===');
  console.log(JSON.stringify(table, null, 2));
}

main().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
