export type HelpCategory =
  | 'Getting started'
  | 'Finding care'
  | 'Appointments'
  | 'Documents & reports'
  | 'AI assistant'
  | 'Family & account'
  | 'Privacy & safety';

export const HELP_CATEGORIES: HelpCategory[] = [
  'Getting started',
  'Finding care',
  'Appointments',
  'Documents & reports',
  'AI assistant',
  'Family & account',
  'Privacy & safety',
];

export interface HelpArticle {
  id: string;
  category: HelpCategory;
  question: string;
  answer: string;
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'what-is-carelink',
    category: 'Getting started',
    question: 'What is CareLink.AI and how does it work?',
    answer:
      'CareLink.AI is your healthcare command center. It combines hospital and doctor discovery, appointments, medical document organization, and an AI assistant in one place. You can browse care options directly, or simply describe what you need to the assistant and it will point you to the right next step.',
  },
  {
    id: 'create-account',
    category: 'Getting started',
    question: 'Do I need an account to use CareLink.AI?',
    answer:
      'No. Browsing hospitals, doctors, and reviews is open to everyone. An account is only needed for personal features like your profile, saved family members, and synced documents. You can register from the Login/Register actions in the header.',
  },
  {
    id: 'search-hospitals',
    category: 'Finding care',
    question: 'How do I search for hospitals?',
    answer:
      'Open the Hospitals page from the main navigation. You can search by name, browse the network, and open any hospital to see its details, specialities, and directions. You can also ask the AI assistant — for example, "Find a hospital near me" — and it will suggest options.',
  },
  {
    id: 'find-doctors',
    category: 'Finding care',
    question: 'How do I find the right doctor?',
    answer:
      'Open the Doctors page to browse clinicians, filter by speciality, and open a full profile with experience and consultation details. If you are unsure which speciality you need, describe your concern to the AI assistant and it will suggest an appropriate speciality to explore.',
  },
  {
    id: 'location-directions',
    category: 'Finding care',
    question: 'How do location and directions work?',
    answer:
      'CareLink.AI can use your device location — only with your permission — to surface care near you and provide directions to hospitals and clinics. Location is requested in the browser and is never required; you can always search by area instead.',
  },
  {
    id: 'book-appointment',
    category: 'Appointments',
    question: 'How do appointments work?',
    answer:
      'From a doctor profile or the Appointments page, choose a doctor, pick an available time, and confirm. Your upcoming and past appointments are listed on the Appointments page, where you can review details or manage bookings.',
  },
  {
    id: 'manage-appointment',
    category: 'Appointments',
    question: 'How do I view or manage my appointments?',
    answer:
      'Open Appointments from the main navigation. Each appointment shows the doctor, time, and status. Selecting an appointment opens its full detail view.',
  },
  {
    id: 'upload-reports',
    category: 'Documents & reports',
    question: 'How do I upload medical reports?',
    answer:
      'Open the Documents page and use the upload zone — you can drag and drop files, browse your device, or use your camera on mobile. Lab reports, prescriptions, PDFs, and images are supported. Files are validated for type and size before upload, and stored privately against your selected profile.',
  },
  {
    id: 'report-analysis',
    category: 'Documents & reports',
    question: 'How does report analysis work?',
    answer:
      'After upload, CareLink.AI can extract key lab values — test name, value, unit, and reference range — and flag results outside the typical range. Extracted values are always shown separately from explanations, and demo analyses are clearly labelled as such. Analysis supports your understanding; it is not a diagnosis.',
  },
  {
    id: 'medicine-image',
    category: 'Documents & reports',
    question: 'How does medicine image input work?',
    answer:
      'You can photograph a medicine strip, bottle, or packaging and upload it like any other document. CareLink.AI attempts to identify the medicine name, strength, and form, and shows a confidence level plus safety warnings. It never invents a dosage — always follow your prescription and pharmacist guidance.',
  },
  {
    id: 'ai-chat',
    category: 'AI assistant',
    question: 'How do I use the AI chat?',
    answer:
      'Use "Ask CareLink AI" in the header, on the Home hero, or in the footer. Type naturally — ask about symptoms to understand which speciality to see, ask it to find hospitals or doctors, or ask about a report you uploaded. The assistant keeps context across the conversation and links you to real pages to take action.',
  },
  {
    id: 'ai-accuracy',
    category: 'AI assistant',
    question: 'Can I trust what the AI tells me?',
    answer:
      'The assistant provides guidance, not a diagnosis. It helps you navigate — which speciality to consider, where to go, what questions to ask — but it does not replace a qualified clinician. AI-generated interpretations are labelled, and emergency inputs always surface emergency actions prominently.',
  },
  {
    id: 'emergency-guidance',
    category: 'AI assistant',
    question: 'How does emergency guidance work?',
    answer:
      'If you describe something that sounds like an emergency, the assistant responds with a dedicated emergency card: call your local emergency number immediately, and it shows the nearest facility options. Emergency guidance is never buried in plain chat text. In any life-threatening situation, contact emergency services first — before using any app.',
  },
  {
    id: 'family-profiles',
    category: 'Family & account',
    question: 'How do family profiles work?',
    answer:
      'CareLink.AI lets you keep separate profiles for yourself and family members — for example a parent, child, or spouse. Documents and context are isolated per profile, so uploading a report for a parent never mixes it with your own. Switch profiles from the profile switcher in the assistant or Documents page.',
  },
  {
    id: 'account-help',
    category: 'Family & account',
    question: 'How do I manage my account and profile?',
    answer:
      'Use Register to create an account and Login to return. Once signed in, your Profile page shows your account details. If you forget which email you used, try the login page with your usual addresses.',
  },
  {
    id: 'data-privacy',
    category: 'Privacy & safety',
    question: 'What data does CareLink.AI store about me?',
    answer:
      'We follow a minimum-necessary philosophy: the assistant reads only the context it needs to help you, documents are stored privately and scoped to your account, and medical files are never given public URLs. When the app runs without a configured backend, data stays in your browser only and is clearly labelled as a local demo.',
  },
  {
    id: 'data-deletion',
    category: 'Privacy & safety',
    question: 'How do I delete my documents or data?',
    answer:
      'You can delete any uploaded document from the Documents page at any time — deletion removes both the file and its metadata. Clearing your browser storage removes locally stored demo data entirely.',
  },
  {
    id: 'troubleshooting',
    category: 'Privacy & safety',
    question: 'Common troubleshooting steps',
    answer:
      'If something looks stale or behaves unexpectedly: refresh the page first; sign out and back in to refresh your session; check that you granted location permission if "near me" results seem off; and make sure uploaded files are a supported type and under the size limit. If a problem persists, contact support and include which page you were on and what you expected to happen.',
  },
];
