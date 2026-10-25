/**
 * Multilingual detection + emergency red-flag tests (Phase 2, Phase 7, Phase 14 A/D).
 *
 * These exercise the REAL detector and red-flag lexicons used by the running
 * application — not mocks — across Telugu script, Telugu-English
 * transliteration, English, Hindi, Hinglish, Kannada, Tamil, Malayalam,
 * code-switched input and misspellings.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectLanguage,
  resolveResponseLanguage,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
} from './languageDetector.ts';
import { assessRedFlags, emergencyPhraseCount, emergencyGroups } from './redFlags.ts';
import { localized, EMERGENCY_TITLE, EMERGENCY_CALL_LABEL, MEDICATION_CONSULT_NOTICE } from './messages.ts';

/* ----------------------------------------------------------------------------
 * Phase 2 — language detection
 * ------------------------------------------------------------------------- */

test('detects Telugu script, Telugu-English transliteration and English', () => {
  assert.equal(detectLanguage('నాకు జ్వరం వస్తోంది').language, 'te');
  assert.equal(detectLanguage('నాకు జ్వరం వస్తోంది').script, 'telugu');

  const romanized = detectLanguage('Naaku fever vastundi, body pains unnayi');
  assert.equal(romanized.language, 'te');
  assert.equal(romanized.transliterated, true);
  assert.ok(romanized.confidence !== 'low', 'clear Telugu-English markers are not a low-confidence guess');

  assert.equal(detectLanguage('I have fever and body pain').language, 'en');
});

test('detects Hindi script and Hinglish', () => {
  assert.equal(detectLanguage('मुझे बुखार है और बदन दर्द हो रहा है').language, 'hi');
  const hinglish = detectLanguage('Mujhe bukhar hai aur badan dard ho raha hai');
  assert.equal(hinglish.language, 'hi');
  assert.equal(hinglish.transliterated, true);
});

test('detects Kannada, Tamil and Malayalam script', () => {
  assert.equal(detectLanguage('ನನಗೆ ಜ್ವರ ಇದೆ').language, 'kn');
  assert.equal(detectLanguage('எனக்கு காய்ச்சல் உள்ளது').language, 'ta');
  assert.equal(detectLanguage('എനിക്ക് പനി ഉണ്ട്').language, 'ml');
});

test('detects Romanized Kannada and Tamil', () => {
  assert.equal(detectLanguage('Nanage jwara ide').language, 'kn');
  assert.equal(detectLanguage('Enakku kaichal irukku').language, 'ta');
});

test('preserves code-switching instead of forcing one language', () => {
  const mixed = detectLanguage('నాకు fever ఉంది, I feel dizzy');
  assert.equal(mixed.language, 'te');
  assert.equal(mixed.codeSwitched, true);
  assert.ok(mixed.candidates.includes('te'));
});

test('an empty input is low confidence English, never a random switch', () => {
  const empty = detectLanguage('');
  assert.equal(empty.language, 'en');
  assert.equal(empty.confidence, 'low');
});

test('plain English without non-English markers is English', () => {
  const result = detectLanguage('Find a cardiologist near me');
  assert.equal(result.language, 'en');
  assert.equal(result.transliterated, false);
});

test('resolveResponseLanguage adopts a confident detection and keeps the remembered language on noise', () => {
  // Confident detection always wins so a user can change language mid-chat.
  assert.equal(resolveResponseLanguage(detectLanguage('మళ్ళీ చెప్పండి'), 'en', true), 'te');
  // Weak/ambiguous input keeps the remembered language.
  assert.equal(resolveResponseLanguage(detectLanguage('ok'), 'te', true), 'te');
  // Empty input keeps the remembered language.
  assert.equal(resolveResponseLanguage(detectLanguage(''), 'hi', true), 'hi');
});

test('every supported language has a display name and the union stays in sync', () => {
  for (const language of SUPPORTED_LANGUAGES) {
    assert.ok(LANGUAGE_NAMES[language], `${language} must have a display name`);
    assert.equal(isSupportedLanguage(language), true);
  }
  assert.equal(isSupportedLanguage('xx'), false);
  assert.equal(isSupportedLanguage(undefined), false);
});

/* ----------------------------------------------------------------------------
 * Phase 7 — emergency red flags across languages
 * ------------------------------------------------------------------------- */

test('English emergency reports are detected', () => {
  assert.equal(assessRedFlags('I have severe chest pain right now').isEmergency, true);
  assert.equal(assessRedFlags("I can't breathe").isEmergency, true);
  assert.equal(assessRedFlags('my father had a stroke, his face is drooping').isEmergency, true);
  assert.equal(assessRedFlags('she is unconscious and not breathing').isEmergency, true);
  assert.equal(assessRedFlags('heavy bleeding that will not stop').isEmergency, true);
  assert.equal(assessRedFlags('I want to die').isEmergency, true);
});

test('Telugu script and Telugu-English emergencies are detected', () => {
  assert.equal(assessRedFlags('నాకు గుండె నొప్పి వస్తోంది').isEmergency, true);
  assert.equal(assessRedFlags('Naaku gunde noppi ga undi').isEmergency, true);
  assert.equal(assessRedFlags('swasa aadatam ledu').isEmergency, true);
  assert.equal(assessRedFlags('పక్షవాతం వచ్చింది').isEmergency, true);
  assert.equal(assessRedFlags('sprha tappi poyindi').isEmergency, true);
});

test('Hindi, Hinglish, Kannada and Tamil emergencies are detected', () => {
  assert.equal(assessRedFlags('मुझे सीने में दर्द हो रहा है').isEmergency, true);
  assert.equal(assessRedFlags('mujhe seene mein dard hai').isEmergency, true);
  assert.equal(assessRedFlags('ಎದೆ ನೋವು ಇದೆ').isEmergency, true);
  assert.equal(assessRedFlags('ede novu ide').isEmergency, true);
  assert.equal(assessRedFlags('எனக்கு நெஞ்சு வலி').isEmergency, true);
  assert.equal(assessRedFlags('nenju vali irukku').isEmergency, true);
});

test('misspellings and informal wording still escalate', () => {
  assert.equal(assessRedFlags('i have chestpain and cant breath').isEmergency, true);
  assert.equal(assessRedFlags('my father is unconsious').isEmergency, true);
});

test('a NEGATED red flag does not trigger the emergency path', () => {
  const negated = assessRedFlags('I have no chest pain, only mild acidity');
  assert.equal(negated.isEmergency, false);
  assert.equal(negated.basis, 'negated');

  const teluguNegated = assessRedFlags('naaku gunde noppi ledu');
  assert.equal(teluguNegated.isEmergency, false);
});

test('an EDUCATIONAL question about a red flag does not trigger the emergency path', () => {
  const educational = assessRedFlags('What are the symptoms of a heart attack?');
  assert.equal(educational.isEmergency, false);
  assert.equal(educational.basis, 'educational');
  assert.ok(educational.matches.length > 0, 'the phrase is still recorded for context');
});

test('a plain non-emergency symptom is neither emergency nor urgent', () => {
  const mild = assessRedFlags('I have had a mild fever since yesterday');
  assert.equal(mild.isEmergency, false);
  assert.equal(mild.isUrgent, false);
});

test('urgent (non-emergency) symptoms are flagged as urgent, not emergency', () => {
  const urgent = assessRedFlags('high fever for three days and vomiting');
  assert.equal(urgent.isEmergency, false);
  assert.equal(urgent.isUrgent, true);
});

test('the emergency lexicon covers every clinical group in multiple languages', () => {
  assert.ok(emergencyPhraseCount() >= 100, `expected a broad lexicon, got ${emergencyPhraseCount()}`);
  for (const group of ['cardiac', 'respiratory', 'stroke', 'consciousness', 'bleeding', 'anaphylaxis', 'self-harm']) {
    assert.ok(emergencyGroups().includes(group), `${group} must be covered`);
  }
});

/* ----------------------------------------------------------------------------
 * Localized safety copy (Phase 2 §2.2 rule 6, Phase 8 §8.4)
 * ------------------------------------------------------------------------- */

test('emergency copy is translated and falls back to English when missing', () => {
  assert.notEqual(localized(EMERGENCY_TITLE, 'te'), EMERGENCY_TITLE.en);
  assert.notEqual(localized(EMERGENCY_TITLE, 'ta'), EMERGENCY_TITLE.en);
  assert.notEqual(localized(EMERGENCY_CALL_LABEL, 'hi'), EMERGENCY_CALL_LABEL.en);
  // Fallback: a language with no entry uses English rather than a broken string.
  assert.equal(localized({ en: 'Only English' }, 'ta'), 'Only English');
});

test('the medication consultation notice exists in Telugu and Hinglish', () => {
  assert.match(localized(MEDICATION_CONSULT_NOTICE, 'te'), /ఫార్మసిస్ట్|డాక్టర్/);
  assert.match(localized(MEDICATION_CONSULT_NOTICE, 'hi'), /डॉक्टर|फार्मासिस्ट/);
  assert.match(localized(MEDICATION_CONSULT_NOTICE, 'en'), /doctor or pharmacist/i);
});
