/**
 * CareLink-AI — multilingual emergency red-flag lexicon (Phase 7).
 *
 * The DETERMINISTIC safety floor. It must work when the model is unavailable,
 * so it never depends on generated prose. Every pattern here is a *reported
 * symptom* phrase in a language the product targets, including native script,
 * Romanized transliteration, and common misspellings.
 *
 * CONTEXT AWARENESS (Phase 7): a bare keyword match is not enough.
 *   - "what are the symptoms of a heart attack?" is an EDUCATIONAL question,
 *     not a report of a current heart attack.
 *   - "no chest pain" / "chest pain ledu" is a NEGATION, not a red flag.
 * The detector therefore scores the surrounding context and downgrades
 * negated and educational framing — while ALWAYS erring toward escalation when
 * a present-tense first-person report is ambiguous.
 *
 * Pure functions only — no I/O, fully unit-testable.
 */

import type { DetectedScript } from './languageDetector';

export interface RedFlagMatch {
  /** The matched phrase (as authored). */
  phrase: string;
  /** Which clinical group it belongs to. */
  group: string;
  /** Language the phrase is authored in. */
  language: string;
}

export interface RedFlagAssessment {
  /** True when the input should trigger the emergency path. */
  isEmergency: boolean;
  /** True when the input warrants prompt (non-emergency) assessment. */
  isUrgent: boolean;
  matches: RedFlagMatch[];
  /** How the decision was made — safe to log/show. */
  basis: 'present-report' | 'negated' | 'educational' | 'none';
  /** Plain-language reason for the UI. */
  reason: string;
}

/** Emergency red-flag phrases grouped by clinical presentation. */
const EMERGENCY_GROUPS: { group: string; language: string; phrases: string[] }[] = [
  {
    group: 'cardiac',
    language: 'en',
    phrases: [
      'severe chest pain', 'chest pain', 'chest pressure', 'crushing chest', 'chest tightness',
      'pain in my chest', 'chest pain with sweating', 'heart attack', 'cardiac arrest',
      'left arm pain with chest', 'jaw pain with chest',
    ],
  },
  {
    group: 'cardiac',
    language: 'te',
    phrases: ['గుండె నొప్పి', 'గుండెలో నొప్పి', 'ఛాతీ నొప్పి', 'గుండె నొప్పిగా ఉంది', 'గుండె ఆగిపోతోంది'],
  },
  {
    group: 'cardiac',
    language: 'te-rom',
    phrases: ['gunde noppi', 'gunde lo noppi', 'gunde noppi ga undi', 'chati noppi', 'gunde aagipothondi'],
  },
  {
    group: 'cardiac',
    language: 'hi',
    phrases: ['सीने में दर्द', 'छाती में दर्द', 'दिल का दौरा', 'सीने में जलन और पसीना'],
  },
  {
    group: 'cardiac',
    language: 'hi-rom',
    phrases: ['seene mein dard', 'chhati mein dard', 'dil ka daura', 'sine me dard'],
  },
  {
    group: 'cardiac',
    language: 'kn',
    phrases: ['ಎದೆ ನೋವು', 'ಎದೆ ನೋವು ಇದೆ', 'ಹೃದಯಾಘಾತ'],
  },
  {
    group: 'cardiac',
    language: 'kn-rom',
    phrases: ['ede novu', 'ede novu ide', 'hrudayaghata'],
  },
  {
    group: 'cardiac',
    language: 'ta',
    phrases: ['நெஞ்சு வலி', 'மார்பு வலி', 'மாரடைப்பு'],
  },
  {
    group: 'cardiac',
    language: 'ta-rom',
    phrases: ['nenju vali', 'maarbu vali', 'maaradaippu'],
  },

  {
    group: 'respiratory',
    language: 'en',
    phrases: [
      "can't breathe", 'cant breathe', 'cannot breathe', 'unable to breathe', 'difficulty breathing',
      'breathing difficulty', 'severe shortness of breath', 'gasping for air', 'blue lips',
      'breathing problem', 'not able to breathe', 'choking',
    ],
  },
  {
    group: 'respiratory',
    language: 'te',
    phrases: ['శ్వాస ఆడటం లేదు', 'శ్వాస తీసుకోలేక', 'ఆయాసం వస్తోంది', 'గాలి ఆడటం లేదు'],
  },
  {
    group: 'respiratory',
    language: 'te-rom',
    phrases: ['swasa aadatam ledu', 'swasa teesukoleka', 'swasa teesukolek', 'gaali aadatam ledu', 'swasa aadatam ledhu'],
  },
  {
    group: 'respiratory',
    language: 'hi',
    phrases: ['सांस नहीं आ रही', 'सांस लेने में तकलीफ', 'दम घुट रहा है'],
  },
  {
    group: 'respiratory',
    language: 'hi-rom',
    phrases: ['saans nahi aa rahi', 'saans lene mein taklif', 'dam ghut raha'],
  },
  {
    group: 'respiratory',
    language: 'kn',
    phrases: ['ಉಸಿರಾಡಲು ಆಗುತ್ತಿಲ್ಲ', 'ಉಸಿರು ಕಟ್ಟುತ್ತಿದೆ'],
  },
  {
    group: 'respiratory',
    language: 'kn-rom',
    phrases: ['usiraadalu aaguttilla', 'usiru kattuttide'],
  },
  {
    group: 'respiratory',
    language: 'ta',
    phrases: ['மூச்சு விட முடியவில்லை', 'மூச்சு திணறல்'],
  },
  {
    group: 'respiratory',
    language: 'ta-rom',
    phrases: ['moochu vida mudiyala', 'moochu vidamudiyala', 'moochu thinaral'],
  },

  {
    group: 'stroke',
    language: 'en',
    phrases: [
      'stroke', 'face drooping', 'facial drooping', 'slurred speech', 'cannot speak', "can't speak",
      'sudden weakness', 'one sided weakness', 'one side weakness', 'sudden vision loss',
      'sudden numbness', 'loss of balance', 'sudden confusion',
    ],
  },
  {
    group: 'stroke',
    language: 'te',
    phrases: ['పక్షవాతం', 'మాట రావడం లేదు', 'ముఖం వాలిపోయింది', 'ఒక వైపు బలహీనత', 'స్పృహ తప్పింది'],
  },
  {
    group: 'stroke',
    language: 'te-rom',
    phrases: ['pakshavatam', 'maata ravatam ledu', 'mukham valipoyindi', 'oka vaipu balaheenata', 'sprha tappindi'],
  },
  {
    group: 'stroke',
    language: 'hi',
    phrases: ['लकवा', 'बोलने में परेशानी', 'मुंह टेढ़ा', 'आधा शरीर सुन्न'],
  },
  {
    group: 'stroke',
    language: 'hi-rom',
    phrases: ['lakwa', 'bolne mein dikkat', 'muh tedha', 'aadha sharir sunn'],
  },
  {
    group: 'stroke',
    language: 'kn',
    phrases: ['ಪಾರ್ಶ್ವವಾಯು', 'ಮಾತನಾಡಲು ಆಗುತ್ತಿಲ್ಲ', 'ಮುಖ ವಾಲುತ್ತಿದೆ'],
  },
  {
    group: 'stroke',
    language: 'kn-rom',
    phrases: ['paarshvavaayu', 'maatanadalu aaguttilla'],
  },
  {
    group: 'stroke',
    language: 'ta',
    phrases: ['பக்கவாதம்', 'பேச முடியவில்லை', 'முகம் கோணலாக'],
  },
  {
    group: 'stroke',
    language: 'ta-rom',
    phrases: ['pakkavaadham', 'pesa mudiyala', 'mugam konal'],
  },

  {
    group: 'consciousness',
    language: 'en',
    phrases: [
      'unconscious', 'unresponsive', 'not breathing', 'collapsed', 'lost consciousness',
      'passed out', 'fainted', 'fainting', 'seizure', 'convulsion', 'fits', 'fitting', 'no pulse',
    ],
  },
  {
    group: 'consciousness',
    language: 'te',
    phrases: ['స్పృహ తప్పి పోయింది', 'స్పృహ లేదు', 'ఫిట్స్', 'మూర్ఛ పోయింది', 'కదలడం లేదు'],
  },
  {
    group: 'consciousness',
    language: 'te-rom',
    phrases: ['sprha tappi poyindi', 'sprha ledu', 'murcha poyindi', 'kadalatam ledu', 'fits vachayi'],
  },
  {
    group: 'consciousness',
    language: 'hi',
    phrases: ['बेहोश', 'बेहोशी', 'दौरा पड़ा', 'मिर्गी का दौरा', 'होश नहीं'],
  },
  {
    group: 'consciousness',
    language: 'hi-rom',
    phrases: ['behosh', 'behoshi', 'daura pada', 'hosh nahi'],
  },
  {
    group: 'consciousness',
    language: 'kn',
    phrases: ['ಪ್ರಜ್ಞೆ ತಪ್ಪಿದೆ', 'ಎಚ್ಚರವಿಲ್ಲ', 'ಮೂರ್ಛೆ'],
  },
  {
    group: 'consciousness',
    language: 'kn-rom',
    phrases: ['prajne tappide', 'eccharavilla', 'moorche'],
  },
  {
    group: 'consciousness',
    language: 'ta',
    phrases: ['சுயநினைவு இல்லை', 'மயக்கம்', 'வலிப்பு'],
  },
  {
    group: 'consciousness',
    language: 'ta-rom',
    phrases: ['suyaninavu illa', 'mayakkam', 'valippu'],
  },

  {
    group: 'bleeding',
    language: 'en',
    phrases: [
      'severe bleeding', 'heavy bleeding', 'bleeding that will not stop', 'bleeding heavily',
      'vomiting blood', 'coughing blood', 'blood in vomit', 'uncontrolled bleeding',
    ],
  },
  {
    group: 'bleeding',
    language: 'te',
    phrases: ['రక్తం కారుతోంది', 'ఆగని రక్తస్రావం', 'రక్తం వాంతి', 'దగ్గులో రక్తం'],
  },
  {
    group: 'bleeding',
    language: 'te-rom',
    phrases: ['raktham karutondi', 'aagani rakthasravam', 'raktham vanti', 'daggulo raktham'],
  },
  {
    group: 'bleeding',
    language: 'hi',
    phrases: ['खून बह रहा है', 'बहुत खून', 'खून की उल्टी', 'खांसी में खून'],
  },
  {
    group: 'bleeding',
    language: 'hi-rom',
    phrases: ['khoon beh raha', 'bahut khoon', 'khoon ki ulti', 'khansi mein khoon'],
  },
  {
    group: 'bleeding',
    language: 'kn',
    phrases: ['ರಕ್ತ ಸೋರುತ್ತಿದೆ', 'ಬಹಳ ರಕ್ತ', 'ರಕ್ತ ವಾಂತಿ'],
  },
  {
    group: 'bleeding',
    language: 'kn-rom',
    phrases: ['rakta soruttide', 'bahala rakta', 'rakta vaanti'],
  },
  {
    group: 'bleeding',
    language: 'ta',
    phrases: ['ரத்தம் வருகிறது', 'அதிக ரத்தம்', 'இரத்த வாந்தி'],
  },
  {
    group: 'bleeding',
    language: 'ta-rom',
    phrases: ['ratham varugiradhu', 'adhika ratham', 'iratha vaandhi'],
  },

  {
    group: 'anaphylaxis',
    language: 'en',
    phrases: [
      'severe allergic reaction', 'anaphylaxis', 'throat swelling', 'swollen tongue', 'swollen throat',
      'allergic reaction with breathing', 'face swelling with rash',
    ],
  },
  {
    group: 'anaphylaxis',
    language: 'te',
    phrases: ['తీవ్రమైన అలర్జీ', 'గొంతు వాచింది', 'నాలుక వాచింది', 'ముఖం వాచింది'],
  },
  {
    group: 'anaphylaxis',
    language: 'te-rom',
    phrases: ['teevramaina allergy', 'gontu vachindi', 'naaluka vachindi', 'mukham vachindi'],
  },
  {
    group: 'anaphylaxis',
    language: 'hi',
    phrases: ['तेज एलर्जी', 'गला सूज गया', 'जीभ सूज गई', 'चेहरा सूज गया'],
  },
  {
    group: 'anaphylaxis',
    language: 'hi-rom',
    phrases: ['tez allergy', 'gala sooj gaya', 'jeebh sooj gayi', 'chehra sooj gaya'],
  },
  {
    group: 'anaphylaxis',
    language: 'kn',
    phrases: ['ತೀವ್ರ ಅಲರ್ಜಿ', 'ಗಂಟಲು ಊದಿಕೊಂಡಿದೆ'],
  },
  {
    group: 'anaphylaxis',
    language: 'kn-rom',
    phrases: ['teevra allergy', 'gantalu udikondide'],
  },
  {
    group: 'anaphylaxis',
    language: 'ta',
    phrases: ['கடும் ஒவ்வாமை', 'தொண்டை வீக்கம்'],
  },
  {
    group: 'anaphylaxis',
    language: 'ta-rom',
    phrases: ['kadum ovvaamai', 'thondai veekam'],
  },

  {
    group: 'self-harm',
    language: 'en',
    phrases: [
      'suicidal', 'suicide', 'want to die', 'self harm', 'end my life', 'kill myself',
      'overdose', 'took too many tablets', 'poisoning',
    ],
  },
  {
    group: 'self-harm',
    language: 'te',
    phrases: ['ఆత్మహత్య', 'చనిపోవాలని', 'నా ప్రాణం తీసుకోవాలని'],
  },
  {
    group: 'self-harm',
    language: 'te-rom',
    phrases: ['aatmahatya', 'chanipovalani', 'naa praanam teesukovalani'],
  },
  {
    group: 'self-harm',
    language: 'hi',
    phrases: ['आत्महत्या', 'मरना चाहता हूं', 'जान दे दूंगा'],
  },
  {
    group: 'self-harm',
    language: 'hi-rom',
    phrases: ['aatmahatya', 'marna chahta hoon', 'jaan de dunga'],
  },
  {
    group: 'self-harm',
    language: 'kn',
    phrases: ['ಆತ್ಮಹತ್ಯೆ', 'ಸಾಯಬೇಕು ಅನಿಸುತ್ತದೆ'],
  },
  {
    group: 'self-harm',
    language: 'kn-rom',
    phrases: ['aatmahatye', 'saayabeku anisuttade'],
  },
  {
    group: 'self-harm',
    language: 'ta',
    phrases: ['தற்கொலை', 'சாக விரும்புகிறேன்'],
  },
  {
    group: 'self-harm',
    language: 'ta-rom',
    phrases: ['tharkolai', 'saaga virumbugiren'],
  },

  {
    group: 'other-emergency',
    language: 'en',
    phrases: [
      'severe burn', 'severe head injury', 'head injury with vomiting', 'stiff neck with fever',
      'worst headache of my life', 'sudden severe headache', 'severe abdominal pain with fever',
      'poisoning', 'snake bite', 'electric shock', 'drowning',
    ],
  },
  {
    group: 'other-emergency',
    language: 'te',
    phrases: ['తీవ్రమైన కాలిన గాయం', 'తలకు దెబ్బ', 'పాము కాటు', 'తీవ్రమైన కడుపు నొప్పి'],
  },
  {
    group: 'other-emergency',
    language: 'te-rom',
    phrases: ['teevramaina kaalina gayam', 'talaku debba', 'paamu kaatu', 'teevramaina kadupu noppi'],
  },
  {
    group: 'other-emergency',
    language: 'hi',
    phrases: ['गंभीर जलन', 'सिर की चोट', 'सांप का काटा', 'तेज पेट दर्द'],
  },
  {
    group: 'other-emergency',
    language: 'hi-rom',
    phrases: ['gambhir jalan', 'sir ki chot', 'saanp ka kata', 'tez pet dard'],
  },
  {
    group: 'other-emergency',
    language: 'kn',
    phrases: ['ತೀವ್ರ ಸುಟ್ಟ ಗಾಯ', 'ತಲೆಗೆ ಪೆಟ್ಟು', 'ಹಾವು ಕಡಿತ'],
  },
  {
    group: 'other-emergency',
    language: 'kn-rom',
    phrases: ['teevra sutta gaaya', 'talage pettu', 'haavu kadita'],
  },
  {
    group: 'other-emergency',
    language: 'ta',
    phrases: ['கடும் தீக்காயம்', 'தலை காயம்', 'பாம்பு கடி'],
  },
  {
    group: 'other-emergency',
    language: 'ta-rom',
    phrases: ['kadum theekkaayam', 'thala kaayam', 'paambu kadi'],
  },
];

/** Symptoms that warrant prompt (non-emergency) professional assessment. */
const URGENT_PHRASES: string[] = [
  'high fever', 'very high fever', 'fever for many days', 'blood in urine', 'blood in stool',
  'severe pain', 'worst headache', 'dehydrated', 'cannot walk', "can't walk", 'blurred vision',
  'persistent vomiting', 'vomiting for days', 'severe abdominal pain', 'chest discomfort',
  'నీళ్ల విరేచనాలు', 'వాంతులు', 'తీవ్రమైన జ్వరం', 'రక్తం పడుతోంది',
  'naalla virechanalu', 'vaantulu', 'teevramaina jvaram',
  'तेज बुखार', 'लगातार उल्टी', 'पेट दर्द', 'khoon aa raha', 'tez bukhar', 'lagatar ulti',
  'jwara bandide', 'vaanti', 'ತೀವ್ರ ಜ್ವರ', 'வாந்தி', 'கடும் காய்ச்சல்',
];

/* ----------------------------------------------------------------------------
 * Context modifiers (negation / educational framing)
 * ------------------------------------------------------------------------- */

const NEGATION_BEFORE = [
  'no ', 'not ', 'never ', 'without ', 'denies ', 'deny ', 'no history of ', 'ruled out ',
  'ledu', 'ledhu', 'kaadu', 'illai', 'illa', 'nahi', 'nahin', 'ma ', 'na ',
];

/**
 * Negation that FOLLOWS the symptom. Telugu, Kannada and Tamil place the
 * negative particle after the noun phrase ("gunde noppi LEDU" = "no chest
 * pain"), so a before-only check would miss them and escalate a non-emergency.
 */
const NEGATION_AFTER = [
  ' ledu', ' ledhu', ' ledhu ', ' kaadu', ' illa', ' illai', ' nahi', ' nahin',
  ' nahi hai', ' not ', ' no ', ' without ',
];

/**
 * Common misspellings of critical phrases. Users type these under stress, and a
 * missed emergency is far worse than a false escalation, so they are matched
 * explicitly rather than left to a fuzzy heuristic.
 */
const MISSPELLINGS: string[] = [
  'chestpain', 'chest pane', 'chest paine', 'cant breath', 'can not breathe', 'cant brethe',
  'unconsious', 'unconscience', 'unconcious', 'uncouncious', 'unconshus',
  'bluding', 'bleading', 'seizure attack', 'sezuire', 'stroak', 'strokes',
  'heart atack', 'hart attack', 'anaphilaxis', 'anaphylatic', 'brethless', 'breathless',
];

const EDUCATIONAL_MARKERS = [
  'what is', 'what are', 'what causes', 'what does', 'how to prevent', 'how do i prevent',
  'symptoms of', 'signs of', 'difference between', 'information about', 'tell me about',
  'explain', 'meaning of', 'is it true', 'can you explain', 'why does',
  'ela', 'enti', 'emi', 'enduku', 'kya hai', 'kya hota', 'kaise hota', 'kyun',
  'what should i know', 'educational', 'for my knowledge', 'for knowledge',
  'enu', 'yaake', 'hege', 'enna', 'eppadi', 'yaen',
];

const PRESENT_REPORT_MARKERS = [
  'i have', 'i am having', 'i feel', "i'm feeling", 'i am feeling', 'having', 'my ',
  'since', 'for the last', 'right now', 'currently', 'suddenly', 'today', 'now',
  'naaku', 'naku', 'undi', 'vastundi', 'vachindi', 'unnayi', 'unnadi',
  'mujhe', 'muje', 'mera', 'meri', 'hai', 'ho raha', 'raha hai',
  'nanage', 'ide', 'aagide', 'bandide', 'enakku', 'irukku', 'vandhudhu',
];

const hasAny = (text: string, needles: string[]): boolean => needles.some((n) => text.includes(n));

/** Lowercase, whitespace-collapsed text used for substring matching. */
const normalizeInput = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** Letters/script only — used so a spaced phrase matches a typo'd run-on. */
const compact = (text: string): string =>
  text.toLowerCase().replace(/[^a-z\u0900-\u097F\u0C00-\u0C7F\u0C80-\u0CFF\u0B80-\u0BFF\u0D00-\u0D7F\u0980-\u09FF\u0A80-\u0AFF\u0600-\u06FF]/g, '');

/**
 * Does the phrase appear anywhere in the text, tolerating a dropped space
 * ("chestpain" for "chest pain")? Multi-word phrases are specific enough for a
 * compact match; single short words are not, so they use an exact substring.
 */
function findPhrase(text: string, compactText: string, phrase: string): number {
  const needle = phrase.toLowerCase();
  const idx = text.indexOf(needle);
  if (idx !== -1) return idx;
  if (!/[\s']/.test(needle)) return -1;
  const compactNeedle = compact(needle);
  if (compactNeedle.length < 6) return -1;
  return compactText.includes(compactNeedle) ? text.indexOf(needle.split(' ')[0]) : -1;
}

/** Does the phrase appear negated — before OR after it? */
function isNegated(text: string, phrase: string, idx: number): boolean {
  const before = text.slice(Math.max(0, idx - 28), idx);
  if (hasAny(before, NEGATION_BEFORE)) return true;
  const after = text.slice(idx + phrase.length, idx + phrase.length + 28);
  if (hasAny(after, NEGATION_AFTER)) return true;
  return false;
}

/**
 * Assess an input for emergency red flags with negation/educational awareness.
 *
 * Escalation bias: if ANY group matches as a present report, `isEmergency` is
 * true. Educational and negated mentions are recorded but do NOT trigger the
 * emergency path on their own.
 */
export function assessRedFlags(input: string, script?: DetectedScript): RedFlagAssessment {
  const text = normalizeInput(input ?? '');
  if (!text) return { isEmergency: false, isUrgent: false, matches: [], basis: 'none', reason: 'empty input' };
  const compactText = compact(text);

  const matches: RedFlagMatch[] = [];
  let negatedOnly = true;
  let anyPresent = false;

  for (const group of EMERGENCY_GROUPS) {
    for (const phrase of group.phrases) {
      const idx = findPhrase(text, compactText, phrase);
      if (idx === -1) continue;
      matches.push({ phrase, group: group.group, language: group.language });
      if (isNegated(text, phrase, idx)) continue;
      negatedOnly = false;
      anyPresent = true;
    }
  }

  // Misspellings of critical phrases (a dropped space, a transposed vowel).
  for (const phrase of MISSPELLINGS) {
    if (!text.includes(phrase)) continue;
    matches.push({ phrase, group: 'misspelling', language: 'mixed' });
    if (isNegated(text, phrase, text.indexOf(phrase))) continue;
    negatedOnly = false;
    anyPresent = true;
  }

  if (matches.length === 0) {
    const urgent = URGENT_PHRASES.filter((p) => text.includes(p.toLowerCase()));
    if (urgent.length > 0) {
      return {
        isEmergency: false,
        isUrgent: true,
        matches: urgent.map((phrase) => ({ phrase, group: 'urgent', language: 'mixed' })),
        basis: 'present-report',
        reason: `Urgent symptom reported: "${urgent[0]}".`,
      };
    }
    return { isEmergency: false, isUrgent: false, matches: [], basis: 'none', reason: 'No red-flag phrases detected.' };
  }

  if (!anyPresent && negatedOnly) {
    return {
      isEmergency: false,
      isUrgent: false,
      matches,
      basis: 'negated',
      reason: 'The red-flag symptom was explicitly negated, so no emergency escalation is needed.',
    };
  }

  // Educational framing: the user is ASKING about a condition, not reporting it.
  const educational = hasAny(text, EDUCATIONAL_MARKERS);
  const present = hasAny(text, PRESENT_REPORT_MARKERS);
  if (educational && !present) {
    return {
      isEmergency: false,
      isUrgent: false,
      matches,
      basis: 'educational',
      reason: 'The red-flag phrase appeared in an educational question, not a report of current symptoms.',
    };
  }

  const primary = matches.find((m) => m.group !== 'misspelling' && m.group !== 'urgent') ?? matches[0];
  void script;
  return {
    isEmergency: true,
    isUrgent: true,
    matches,
    basis: 'present-report',
    reason: `Emergency symptom reported: "${primary.phrase}" (${primary.group}).`,
  };
}

/** All emergency phrases, for tests and the safety documentation. */
export function emergencyPhraseCount(): number {
  return EMERGENCY_GROUPS.reduce((total, group) => total + group.phrases.length, 0);
}

export function emergencyGroups(): string[] {
  return [...new Set(EMERGENCY_GROUPS.map((g) => g.group))];
}
