/**
 * CareLink-AI — n8n chat adapter tests.
 *
 * Exercises the REAL adapter code path (payload shaping, reply parsing, safe
 * composition) with a stubbed `fetch`, so no live network call is made.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseN8nReply, composeN8nResponse, n8nMode } from './n8nChat.ts';

const baseline = {
  summary: 'CareLink baseline summary',
  intent: 'general',
  confidence: 'low',
  urgency: 'routine',
  safetyLevel: 'educational',
  explanation: 'CareLink baseline explanation.',
  nextActions: ['Find a hospital.'],
  followUpQuestions: [],
  warnings: [],
  entities: [],
  language: 'en',
  source: { provider: 'CareLink', mode: 'mock', fetchedAt: new Date().toISOString() },
};

test('n8n is unavailable without a configured webhook', () => {
  assert.equal(n8nMode(), 'unavailable');
});

test('parses the n8n AI Agent item-list shape', () => {
  const reply = parseN8nReply([{ output: 'Drink water and rest.' }]);
  assert.ok(reply);
  assert.equal(reply.explanation, 'Drink water and rest.');
});

test('parses a plain object with an output field', () => {
  const reply = parseN8nReply({ output: 'Visit the nearest PHC.' });
  assert.ok(reply);
  assert.equal(reply.explanation, 'Visit the nearest PHC.');
});

test('parses a bare JSON string body', () => {
  const reply = parseN8nReply(JSON.stringify({ text: 'Book a review in two weeks.' }));
  assert.ok(reply);
  assert.equal(reply.explanation, 'Book a review in two weeks.');
});

test('parses a structured workflow payload and keeps valid enums only', () => {
  const reply = parseN8nReply({
    summary: 'Possible concern',
    explanation: 'Please see a clinician.',
    urgency: 'urgent',
    safetyLevel: 'not-a-real-level',
    intent: 'symptom',
    followUpQuestions: ['How long have you had this?'],
    language: 'te',
  });
  assert.ok(reply);
  assert.equal(reply.urgency, 'urgent');
  assert.equal(reply.safetyLevel, undefined, 'invalid enum is dropped');
  assert.equal(reply.intent, 'symptom');
  assert.deepEqual(reply.followUpQuestions, ['How long have you had this?']);
  assert.equal(reply.language, 'te');
});

test('parses a nested structured output object', () => {
  const reply = parseN8nReply({ output: { summary: 'S', explanation: 'E', intent: 'hospital' } });
  assert.ok(reply);
  assert.equal(reply.summary, 'S');
  assert.equal(reply.intent, 'hospital');
});

test('unwraps a data envelope', () => {
  const reply = parseN8nReply({ data: { output: 'Wrapped answer.' } });
  assert.ok(reply);
  assert.equal(reply.explanation, 'Wrapped answer.');
});

test('returns null for an empty or unusable body', () => {
  assert.equal(parseN8nReply(null), null);
  assert.equal(parseN8nReply({}), null);
  assert.equal(parseN8nReply([]), null);
  assert.equal(parseN8nReply({ unrelated: true }), null);
});

test('composed response carries the workflow text and n8n provenance', () => {
  const composed = composeN8nResponse(
    { summary: 'Live answer', explanation: 'Live explanation', nextActions: [], followUpQuestions: [], warnings: [] },
    baseline
  );
  assert.equal(composed.explanation, 'Live explanation');
  assert.equal(composed.source.provider, 'n8n');
  assert.equal(composed.source.mode, 'real');
  // The baseline scaffold is preserved where the workflow said nothing.
  assert.deepEqual(composed.nextActions, baseline.nextActions);
});

test('the workflow may raise safety but never lower it', () => {
  const escalated = composeN8nResponse(
    { summary: 'S', explanation: 'E', nextActions: [], followUpQuestions: [], warnings: [], safetyLevel: 'emergency', urgency: 'emergency' },
    baseline
  );
  assert.equal(escalated.safetyLevel, 'emergency');
  assert.equal(escalated.urgency, 'emergency');

  const urgentBaseline = { ...baseline, safetyLevel: 'urgent', urgency: 'urgent' };
  const attemptedDeescalation = composeN8nResponse(
    { summary: 'S', explanation: 'E', nextActions: [], followUpQuestions: [], warnings: [], safetyLevel: 'educational', urgency: 'routine' },
    urgentBaseline
  );
  assert.equal(attemptedDeescalation.safetyLevel, 'urgent');
  assert.equal(attemptedDeescalation.urgency, 'urgent');
});

test('the composed response is schema-valid for the client validator', async () => {
  const { validateAIChatResponse } = await import('./aiSchemas.ts');
  const composed = composeN8nResponse(
    { summary: 'Live answer', explanation: 'Live explanation', nextActions: ['See a doctor'], followUpQuestions: [], warnings: [], language: 'en' },
    baseline
  );
  assert.ok(validateAIChatResponse(composed));
});
