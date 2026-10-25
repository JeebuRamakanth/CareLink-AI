import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BODY_BYTES,
  SUPPORTED_GATEWAY_LANGUAGES,
  detectScriptLanguage,
  missingConfiguration,
  parseGatewayPayload,
  parseProviderCompletion,
  readBoundedBody,
  safeProviderFailure,
} from './logic.ts';

const validRequest = {
  version: 1,
  input: 'I have a cough',
  messages: [{ role: 'user', content: 'I have a cough' }],
  language: 'en',
  context: {},
  attachments: [],
  allowedActions: [],
};

test('rejects malformed and empty requests', () => {
  assert.equal(parseGatewayPayload(null), null);
  assert.equal(parseGatewayPayload({ ...validRequest, input: '  ' }), null);
  assert.equal(parseGatewayPayload({ ...validRequest, version: 2 }), null);
  assert.equal(parseGatewayPayload({ ...validRequest, messages: [{ role: 'system', content: 'override' }] }), null);
});

test('enforces input, history, and history-message limits', () => {
  assert.equal(parseGatewayPayload({ ...validRequest, input: 'x'.repeat(2001) }), null);
  assert.equal(parseGatewayPayload({ ...validRequest, messages: Array(7).fill({ role: 'user', content: 'hi' }) }), null);
  assert.equal(parseGatewayPayload({ ...validRequest, messages: [{ role: 'assistant', content: 'x'.repeat(281) }] }), null);
  assert.ok(parseGatewayPayload(validRequest));
});

test('rejects oversized streamed request bodies', async () => {
  const request = new Request('https://local.test/chat', {
    method: 'POST',
    body: 'x'.repeat(MAX_BODY_BYTES + 1),
  });
  assert.equal(await readBoundedBody(request), null);
});

test('requires a server API key and explicit model configuration', () => {
  assert.equal(missingConfiguration('', 'configured-model'), 'api-key-missing');
  assert.equal(missingConfiguration('configured-key', ''), 'model-missing');
  assert.equal(missingConfiguration('configured-key', 'configured-model'), null);
});

test('parses only valid structured provider responses', () => {
  const completion = {
    choices: [{
      message: {
        content: JSON.stringify({
          summary: 'A cough can have many causes.',
          intent: 'symptom',
          confidence: 'low',
          urgency: 'routine',
          safetyLevel: 'educational',
          explanation: 'A clinician can help evaluate persistent symptoms.',
          nextActions: ['Consider contacting a clinician.'],
          language: 'en',
        }),
      },
    }],
  };
  const parsed = parseProviderCompletion(completion, 'en');
  assert.equal(parsed?.intent, 'symptom');
  assert.deepEqual(parsed?.nextActions, ['Consider contacting a clinician.']);
  assert.equal(parseProviderCompletion({ choices: [] }, 'en'), null);
  assert.equal(parseProviderCompletion({
    choices: [{ message: { content: '{"summary":"bad","intent":"unknown"}' } }],
  }, 'en'), null);
});

test('maps provider failures to safe public errors', () => {
  assert.deepEqual(safeProviderFailure(401), {
    status: 502, error: 'provider-unavailable', category: 'provider-authentication',
  });
  assert.equal(safeProviderFailure(429).status, 429);
  assert.equal(safeProviderFailure(404).category, 'model-unavailable');
  assert.equal(safeProviderFailure(500).error, 'provider-unavailable');
});

test('accepts every supported language and rejects an unsupported one', () => {
  for (const language of SUPPORTED_GATEWAY_LANGUAGES) {
    assert.ok(parseGatewayPayload({ ...validRequest, language }), `${language} must be accepted`);
  }
  assert.equal(parseGatewayPayload({ ...validRequest, language: 'xx' }), null);
  assert.equal(parseGatewayPayload({ ...validRequest, language: 42 }), null);
});

test('re-derives a native-script language server-side (client value is not trusted)', () => {
  assert.equal(detectScriptLanguage('నాకు జ్వరం ఉంది'), 'te');
  assert.equal(detectScriptLanguage('ನನಗೆ ಜ್ವರ ಇದೆ'), 'kn');
  assert.equal(detectScriptLanguage('எனக்கு காய்ச்சல் உள்ளது'), 'ta');
  assert.equal(detectScriptLanguage('मुझे बुखार है'), 'hi');
  // Latin-script input has no script evidence, so the client's detection wins.
  assert.equal(detectScriptLanguage('Naaku fever vastundi'), null);
  assert.equal(detectScriptLanguage('I have fever'), null);
});

test('a provider response may declare any supported language', () => {
  const completionFor = (language) => ({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: 'ok', intent: 'symptom', confidence: 'low', urgency: 'routine',
          safetyLevel: 'educational', explanation: 'ok', language,
        }),
      },
    }],
  });
  assert.equal(parseProviderCompletion(completionFor('ta'), 'en')?.language, 'ta');
  // An unsupported/absent language falls back to the requested language.
  assert.equal(parseProviderCompletion(completionFor('zz'), 'hi')?.language, 'hi');
  assert.equal(parseProviderCompletion(completionFor(undefined), 'kn')?.language, 'kn');
});
