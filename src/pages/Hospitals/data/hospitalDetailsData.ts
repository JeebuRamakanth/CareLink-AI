export type ReviewFilterOption = 'All' | '5 Star' | '4 Star' | '3 Star' | '2 Star' | '1 Star' | 'Most Recent' | 'Most Helpful';

export type HospitalDoctorTopic = 'All' | 'Cardiology' | 'Diabetes' | 'Neurology' | 'Migraine' | 'Orthopedics';

export interface HospitalReviewItem {
  id: string;
  rating: number;
  title: string;
  content: string;
  date: string;
  verified: boolean;
  treatmentTag: string;
  helpfulCount: number;
  response?: string;
}

export interface HospitalDoctorItem {
  id: string;
  name: string;
  specialty: string;
  experienceYears: number;
  rating: number;
  reviewCount: number;
  successRate: string;
  fee: string;
  availability: string;
  availabilityStatus: 'Available now' | 'Available soon' | 'Limited' | 'On leave';
  nextAvailable: string;
  patientsTreated: string;
  languages: string[];
  topics: HospitalDoctorTopic[];
  profileInitials: string;
  location: string;
}

export interface HospitalSpecialtyDiscoveryItem {
  id: string;
  name: string;
  reviewCount: number;
  rating: number;
  signal: string;
}

export interface HospitalRatingCategory {
  label: string;
  score: number;
}

export interface HospitalDetail {
  id: string;
  name: string;
  type: string;
  location: string;
  address: string;
  phone: string;
  rating: number;
  reviewCount: number;
  verified: boolean;
  mainSpecialties: string[];
  emergencyAvailable: boolean;
  consultationAvailability: string;
  distanceKm: number;
  about: string;
  yearsInService: number;
  departments: string[];
  specialties: string[];
  facilities: string[];
  patientExperienceIndicators: Array<{ label: string; value: string }>;
  starBreakdown: Array<{ stars: number; percent: number }>;
  categoryRatings: HospitalRatingCategory[];
  reviews: HospitalReviewItem[];
  doctors: HospitalDoctorItem[];
  specialtyDiscovery: HospitalSpecialtyDiscoveryItem[];
}

export const hospitalDetails: HospitalDetail[] = [
  {
    id: 'aurora-medical-center',
    name: 'Aurora Medical Center',
    type: 'Global Care Hospital',
    location: 'Stockholm, Sweden',
    address: 'Sjöviksvägen 6, 123 45 Stockholm',
    phone: '+46 8 123 456 78',
    rating: 4.9,
    reviewCount: 1284,
    verified: true,
    mainSpecialties: ['Cardiology', 'Emergency Medicine', 'Radiology'],
    emergencyAvailable: true,
    consultationAvailability: '24/7 telehealth & in-person',
    distanceKm: 3.8,
    about:
      'Aurora Medical Center combines world-class specialists with digitally supported patient care. The facility is designed for complex diagnosis, rapid emergency response, and seamless care coordination across departments.',
    yearsInService: 28,
    departments: ['Cardiology', 'Imaging', 'Emergency', 'Oncology', 'Neuroscience'],
    specialties: ['Cardiology', 'Neurology', 'Oncology', 'Women’s Health', 'Emergency Care'],
    facilities: ['Advanced imaging suite', 'Private recovery rooms', 'Virtual care lounge', '24/7 ICU', 'Surgical robotics'],
    patientExperienceIndicators: [
      { label: 'Patient satisfaction', value: '94%' },
      { label: 'Digital check-in rate', value: '88%' },
      { label: 'Average care coordination score', value: '4.8/5' },
      { label: 'Average stay quality', value: '4.7/5' },
    ],
    starBreakdown: [
      { stars: 5, percent: 72 },
      { stars: 4, percent: 18 },
      { stars: 3, percent: 6 },
      { stars: 2, percent: 3 },
      { stars: 1, percent: 1 },
    ],
    categoryRatings: [
      { label: 'Doctor quality', score: 4.9 },
      { label: 'Treatment experience', score: 4.8 },
      { label: 'Staff behavior', score: 4.7 },
      { label: 'Cleanliness', score: 4.8 },
      { label: 'Facilities', score: 4.7 },
      { label: 'Waiting time', score: 4.3 },
    ],
    reviews: [
      {
        id: 'aurora-review-001',
        rating: 5,
        title: 'Exceptional cardiac care and coordination',
        content:
          'The cardiology team delivered fast diagnostics and explained every step clearly. The recovery plan felt tailored and the follow-up support was excellent.',
        date: '2026-07-28',
        verified: true,
        treatmentTag: 'Cardiology',
        helpfulCount: 24,
        response: 'Thank you for trusting Aurora Medical Center. We’re glad the care team exceeded expectations.',
      },
      {
        id: 'aurora-review-002',
        rating: 4,
        title: 'Smooth emergency experience with modern facilities',
        content:
          'The emergency team acted quickly and the diagnostic imaging was available right away. Check-in was seamless even at night.',
        date: '2026-07-15',
        verified: true,
        treatmentTag: 'Emergency Medicine',
        helpfulCount: 18,
      },
      {
        id: 'aurora-review-003',
        rating: 5,
        title: 'Strong specialist network with thoughtful follow-up',
        content:
          'From initial consultation to discharge, the care coordinators kept everything organized. The digital follow-up made aftercare easy to manage.',
        date: '2026-06-30',
        verified: true,
        treatmentTag: 'Radiology',
        helpfulCount: 16,
        response: 'We appreciate your review and are happy to hear the digital follow-up supported your recovery.',
      },
      {
        id: 'aurora-review-004',
        rating: 5,
        title: 'Premium diagnostic accuracy with fast results',
        content:
          'Their imaging suite is impressive and the team reviewed results with me within hours. It felt very modern and patient-focused.',
        date: '2026-06-12',
        verified: true,
        treatmentTag: 'Radiology',
        helpfulCount: 12,
      },
    ],
    doctors: [
      {
        id: 'maya-kapoor',
        name: 'Dr. Maya Kapoor',
        specialty: 'Cardiology',
        experienceYears: 16,
        rating: 4.9,
        reviewCount: 412,
        successRate: '96%',
        fee: '$180',
        availability: 'Mon–Fri',
        availabilityStatus: 'Available soon',
        nextAvailable: 'Tomorrow, 10:00 AM',
        patientsTreated: '3.2k',
        languages: ['English', 'Hindi'],
        location: 'Stockholm',
        topics: ['Cardiology', 'All'],
        profileInitials: 'MK',
      },
      {
        id: 'daniel-kim',
        name: 'Dr. Daniel Kim',
        specialty: 'Emergency Medicine',
        experienceYears: 12,
        rating: 4.8,
        reviewCount: 289,
        successRate: '94%',
        fee: '$150',
        availability: '24/7',
        availabilityStatus: 'Available now',
        nextAvailable: 'Anytime today',
        patientsTreated: '2.7k',
        languages: ['English', 'Swedish'],
        location: 'Stockholm',
        topics: ['Migraine', 'Cardiology'],
        profileInitials: 'DK',
      },
      {
        id: 'sophie-martin',
        name: 'Dr. Sophie Martin',
        specialty: 'Radiology',
        experienceYears: 14,
        rating: 4.8,
        reviewCount: 223,
        successRate: '95%',
        fee: '$160',
        availability: 'Tue–Sat',
        availabilityStatus: 'Available soon',
        nextAvailable: 'Tuesday, 11:30 AM',
        patientsTreated: '1.9k',
        languages: ['English', 'French'],
        location: 'Stockholm',
        topics: ['Neurology', 'All'],
        profileInitials: 'SM',
      },
    ],
    specialtyDiscovery: [
      { id: 'cardiology', name: 'Cardiology', reviewCount: 386, rating: 4.9, signal: 'Leading heart care outcomes' },
      { id: 'neurology', name: 'Neurology', reviewCount: 214, rating: 4.8, signal: 'Rapid assessment and follow-up' },
      { id: 'orthopedics', name: 'Orthopedics', reviewCount: 171, rating: 4.7, signal: 'Advanced surgical recovery support' },
      { id: 'diabetology', name: 'Diabetology', reviewCount: 98, rating: 4.7, signal: 'Chronic condition coordination' },
      { id: 'dermatology', name: 'Dermatology', reviewCount: 86, rating: 4.7, signal: 'Patient-first outpatient care' },
    ],
  },
  {
    id: 'beacon-heart-institute',
    name: 'Beacon Heart Institute',
    type: 'Cardiac Center of Excellence',
    location: 'Boston, USA',
    address: '120 Beacon Street, Boston, MA 02116',
    phone: '+1 (617) 555-0134',
    rating: 4.8,
    reviewCount: 987,
    verified: true,
    mainSpecialties: ['Heart Surgery', 'Interventional Cardiology', 'Critical Care'],
    emergencyAvailable: true,
    consultationAvailability: 'Weekdays 7am–9pm',
    distanceKm: 12.4,
    about:
      'Beacon Heart Institute focuses on advanced cardiac care and surgical precision. The institute blends specialized surgeons with adaptive patient pathways for urgent and planned treatment.',
    yearsInService: 22,
    departments: ['Cardiac Surgery', 'Cath Lab', 'Critical Care', 'Heart Failure', 'Rehabilitation'],
    specialties: ['Cardiology', 'Heart Surgery', 'Critical Care', 'Rehabilitation'],
    facilities: ['Hybrid operating theaters', 'Recovery suites', 'Dedicated cardiac ICU', 'Virtual follow-up clinic'],
    patientExperienceIndicators: [
      { label: 'Care team rating', value: '4.9/5' },
      { label: 'Surgeon confidence', value: '96%' },
      { label: 'Post-op coordination', value: '4.8/5' },
      { label: 'Patient referrals', value: 'High' },
    ],
    starBreakdown: [
      { stars: 5, percent: 65 },
      { stars: 4, percent: 22 },
      { stars: 3, percent: 8 },
      { stars: 2, percent: 3 },
      { stars: 1, percent: 2 },
    ],
    categoryRatings: [
      { label: 'Doctor quality', score: 4.9 },
      { label: 'Treatment experience', score: 4.7 },
      { label: 'Staff behavior', score: 4.6 },
      { label: 'Cleanliness', score: 4.7 },
      { label: 'Facilities', score: 4.8 },
      { label: 'Waiting time', score: 4.2 },
    ],
    reviews: [
      {
        id: 'beacon-review-001',
        rating: 5,
        title: 'Surgical care that felt precise and calm',
        content:
          'The surgical team at Beacon Heart Institute explained risks clearly and maintained excellent communication with family members.',
        date: '2026-07-19',
        verified: true,
        treatmentTag: 'Heart Surgery',
        helpfulCount: 28,
      },
      {
        id: 'beacon-review-002',
        rating: 4,
        title: 'Strong critical care support after procedure',
        content:
          'The ICU staff stayed attentive the entire time and the discharge process was well organized.',
        date: '2026-06-25',
        verified: true,
        treatmentTag: 'Critical Care',
        helpfulCount: 14,
        response: 'We’re glad your critical care experience was reassuring. Thank you for sharing.',
      },
      {
        id: 'beacon-review-003',
        rating: 5,
        title: 'Confident cardiology team and fast diagnostics',
        content:
          'The diagnostic workflow was rapid and the cardiologists were easy to talk to. Follow-up telehealth visits were helpful.',
        date: '2026-05-30',
        verified: true,
        treatmentTag: 'Interventional Cardiology',
        helpfulCount: 19,
      },
    ],
    doctors: [
      {
        id: 'priya-nair',
        name: 'Dr. Priya Nair',
        specialty: 'Heart Surgery',
        experienceYears: 18,
        rating: 4.8,
        reviewCount: 371,
        successRate: '95%',
        fee: '$220',
        availability: 'Mon–Fri',
        availabilityStatus: 'Available soon',
        nextAvailable: 'Tomorrow, 10:00 AM',
        patientsTreated: '2.8k',
        languages: ['English', 'Hindi'],
        location: 'Boston',
        topics: ['Cardiology', 'Orthopedics'],
        profileInitials: 'PN',
      },
      {
        id: 'james-owens',
        name: 'Dr. James Owens',
        specialty: 'Critical Care',
        experienceYears: 14,
        rating: 4.7,
        reviewCount: 270,
        successRate: '93%',
        fee: '$190',
        availability: '24/7',
        availabilityStatus: 'Available now',
        nextAvailable: 'Anytime today',
        patientsTreated: '2.2k',
        languages: ['English', 'Spanish'],
        location: 'Boston',
        topics: ['Migraine', 'All'],
        profileInitials: 'JO',
      },
    ],
    specialtyDiscovery: [
      { id: 'cardiology', name: 'Cardiology', reviewCount: 312, rating: 4.8, signal: 'Surgical precision and fast follow-up' },
      { id: 'diabetology', name: 'Diabetology', reviewCount: 84, rating: 4.7, signal: 'Chronic condition support' },
      { id: 'orthopedics', name: 'Orthopedics', reviewCount: 66, rating: 4.6, signal: 'Rehabilitation-focused care' },
      { id: 'neurology', name: 'Neurology', reviewCount: 59, rating: 4.6, signal: 'Integrated diagnostics' },
      { id: 'migraine', name: 'Migraine', reviewCount: 48, rating: 4.5, signal: 'Headache management pathways' },
    ],
  },
  {
    id: 'luma-children-hospital',
    name: 'Luma Children’s Hospital',
    type: 'Pediatric Care Network',
    location: 'Toronto, Canada',
    address: '92 Maple Street, Toronto, ON M4B 1X5',
    phone: '+1 (416) 555-0198',
    rating: 5.0,
    reviewCount: 764,
    verified: true,
    mainSpecialties: ['Pediatrics', 'Neonatal Care', 'Family Medicine'],
    emergencyAvailable: true,
    consultationAvailability: 'Weekdays 8am–8pm',
    distanceKm: 7.2,
    about:
      'Luma Children’s Hospital is designed for pediatric families seeking compassionate clinical care, rapid diagnostics, and emotionally supportive care pathways for children and young adults.',
    yearsInService: 18,
    departments: ['Pediatrics', 'Neonatal Intensive Care', 'Child Psychology', 'Family Support', 'Pediatric Surgery'],
    specialties: ['Pediatrics', 'Neonatal Care', 'Family Medicine', 'Women’s Health'],
    facilities: ['Child-friendly recovery suites', 'Family consultation rooms', 'Pediatric imaging center', 'Telehealth family visits'],
    patientExperienceIndicators: [
      { label: 'Family satisfaction', value: '96%' },
      { label: 'Wait time reduction', value: '85%' },
      { label: 'Nurse responsiveness', value: '4.9/5' },
      { label: 'Care coordination', value: '4.8/5' },
    ],
    starBreakdown: [
      { stars: 5, percent: 78 },
      { stars: 4, percent: 14 },
      { stars: 3, percent: 5 },
      { stars: 2, percent: 2 },
      { stars: 1, percent: 1 },
    ],
    categoryRatings: [
      { label: 'Doctor quality', score: 5.0 },
      { label: 'Treatment experience', score: 4.9 },
      { label: 'Staff behavior', score: 4.9 },
      { label: 'Cleanliness', score: 4.9 },
      { label: 'Facilities', score: 4.8 },
      { label: 'Waiting time', score: 4.7 },
    ],
    reviews: [
      {
        id: 'luma-review-001',
        rating: 5,
        title: 'Compassionate pediatric team and seamless care',
        content:
          'The staff put our family at ease, and the specialists took time to explain everything in a calm, reassuring way. The pediatric suite felt very welcoming.',
        date: '2026-07-14',
        verified: true,
        treatmentTag: 'Pediatrics',
        helpfulCount: 32,
      },
      {
        id: 'luma-review-002',
        rating: 5,
        title: 'Excellent neonatal care with strong follow-through',
        content:
          'The neonatal care team was attentive and provided clear updates. The follow-up communication after discharge was excellent.',
        date: '2026-07-02',
        verified: true,
        treatmentTag: 'Neonatal Care',
        helpfulCount: 21,
      },
    ],
    doctors: [
      {
        id: 'anjali-desai',
        name: 'Dr. Anjali Desai',
        specialty: 'Pediatrics',
        experienceYears: 15,
        rating: 5.0,
        reviewCount: 298,
        successRate: '97%',
        fee: '$170',
        availability: 'Mon–Thu',
        availabilityStatus: 'Available soon',
        nextAvailable: 'Tomorrow, 10:30 AM',
        patientsTreated: '1.2k',
        languages: ['English', 'Hindi', 'Punjabi'],
        location: 'Toronto',
        topics: ['Cardiology', 'All'],
        profileInitials: 'AD',
      },
      {
        id: 'sophia-miller',
        name: 'Dr. Sophie Miller',
        specialty: 'Neonatal Care',
        experienceYears: 13,
        rating: 4.9,
        reviewCount: 214,
        successRate: '96%',
        fee: '$160',
        availability: 'Tue–Sat',
        availabilityStatus: 'Available now',
        nextAvailable: 'Today, 9:00 AM',
        patientsTreated: '1.0k',
        languages: ['English', 'French'],
        location: 'Toronto',
        topics: ['Neurology', 'All'],
        profileInitials: 'SM',
      },
    ],
    specialtyDiscovery: [
      { id: 'pediatrics', name: 'Pediatrics', reviewCount: 298, rating: 5.0, signal: 'Family-first pediatric pathways' },
      { id: 'neurology', name: 'Neurology', reviewCount: 124, rating: 4.9, signal: 'Child-focused diagnostics' },
      { id: 'womenHealth', name: 'Women’s Health', reviewCount: 98, rating: 4.8, signal: 'Maternal pediatric support' },
      { id: 'diabetology', name: 'Diabetology', reviewCount: 64, rating: 4.8, signal: 'Young patient chronic care' },
      { id: 'orthopedics', name: 'Orthopedics', reviewCount: 52, rating: 4.7, signal: 'Growth and mobility support' },
    ],
  },
  {
    id: 'northside-health-pavilion',
    name: 'Northside Health Pavilion',
    type: 'Integrated Rehabilitation Center',
    location: 'London, United Kingdom',
    address: '55 Camden Road, London, NW1 9JY',
    phone: '+44 20 7946 0958',
    rating: 4.6,
    reviewCount: 583,
    verified: true,
    mainSpecialties: ['Orthopedics', 'Rehabilitation', 'Sports Medicine'],
    emergencyAvailable: true,
    consultationAvailability: 'Weekdays 8am–6pm',
    distanceKm: 2.1,
    about:
      'Northside Health Pavilion is focused on orthopedic and rehabilitation excellence, with a patient-centered approach for athletes, recovery patients, and ongoing care programs.',
    yearsInService: 15,
    departments: ['Orthopedics', 'Rehabilitation', 'Sports Medicine', 'Physiotherapy', 'Imaging'],
    specialties: ['Orthopedics', 'Rehabilitation', 'Sports Medicine', 'Diagnostics'],
    facilities: ['Rehabilitation gyms', 'Therapy suites', 'Sports diagnostics lab', 'Private recovery spaces'],
    patientExperienceIndicators: [
      { label: 'Rehab success', value: '91%' },
      { label: 'Therapy satisfaction', value: '4.8/5' },
      { label: 'Recovery planning', value: '4.7/5' },
      { label: 'Appointment coordination', value: '4.6/5' },
    ],
    starBreakdown: [
      { stars: 5, percent: 59 },
      { stars: 4, percent: 24 },
      { stars: 3, percent: 10 },
      { stars: 2, percent: 4 },
      { stars: 1, percent: 3 },
    ],
    categoryRatings: [
      { label: 'Doctor quality', score: 4.6 },
      { label: 'Treatment experience', score: 4.5 },
      { label: 'Staff behavior', score: 4.6 },
      { label: 'Cleanliness', score: 4.7 },
      { label: 'Facilities', score: 4.7 },
      { label: 'Waiting time', score: 4.3 },
    ],
    reviews: [
      {
        id: 'northside-review-001',
        rating: 4,
        title: 'Solid rehabilitation support and responsive therapists',
        content:
          'The physio team was attentive and tailored every session. Scheduling was easy and the recovery recommendations were clear.',
        date: '2026-06-17',
        verified: true,
        treatmentTag: 'Rehabilitation',
        helpfulCount: 20,
      },
      {
        id: 'northside-review-002',
        rating: 5,
        title: 'Expert sports medicine care with good communication',
        content:
          'I felt supported through the entire recovery plan, and the specialists kept me informed at every stage.',
        date: '2026-05-23',
        verified: true,
        treatmentTag: 'Sports Medicine',
        helpfulCount: 15,
      },
    ],
    doctors: [
      {
        id: 'louise-grant',
        name: 'Dr. Louise Grant',
        specialty: 'Orthopedics',
        experienceYears: 14,
        rating: 4.6,
        reviewCount: 216,
        successRate: '92%',
        fee: '$170',
        availability: 'Mon–Fri',
        availabilityStatus: 'Available soon',
        nextAvailable: 'Tomorrow, 10:00 AM',
        patientsTreated: '1.3k',
        languages: ['English'],
        location: 'London',
        topics: ['Orthopedics', 'All'],
        profileInitials: 'LG',
      },
      {
        id: 'mark-baker',
        name: 'Dr. Mark Baker',
        specialty: 'Sports Medicine',
        experienceYears: 11,
        rating: 4.7,
        reviewCount: 189,
        successRate: '93%',
        fee: '$165',
        availability: 'Tue–Sat',
        availabilityStatus: 'Available now',
        nextAvailable: 'Anytime today',
        patientsTreated: '1.0k',
        languages: ['English', 'Spanish'],
        location: 'London',
        topics: ['Migraine', 'Orthopedics'],
        profileInitials: 'MB',
      },
    ],
    specialtyDiscovery: [
      { id: 'orthopedics', name: 'Orthopedics', reviewCount: 171, rating: 4.7, signal: 'Recovery and mobility outcomes' },
      { id: 'sports-medicine', name: 'Sports Medicine', reviewCount: 138, rating: 4.6, signal: 'Athlete-focused rehabilitation' },
      { id: 'diagnostics', name: 'Diagnostics', reviewCount: 104, rating: 4.7, signal: 'Advanced imaging support' },
      { id: 'rehabilitation', name: 'Rehabilitation', reviewCount: 87, rating: 4.6, signal: 'Structured recovery plans' },
      { id: 'migraine', name: 'Migraine', reviewCount: 65, rating: 4.5, signal: 'Headache care pathways' },
    ],
  },
  {
    id: 'crescent-wellness-campus',
    name: 'Crescent Wellness Campus',
    type: 'Integrated Wellness Center',
    location: 'Singapore',
    address: '18 Marina View, Singapore 018960',
    phone: '+65 6100 1234',
    rating: 4.7,
    reviewCount: 448,
    verified: true,
    mainSpecialties: ['Wellness', 'Telehealth', 'Diagnostic Imaging'],
    emergencyAvailable: false,
    consultationAvailability: 'Daily 9am–8pm',
    distanceKm: 1.6,
    about:
      'Crescent Wellness Campus delivers modern outpatient and virtual care experiences for chronic and preventive health, backed by diagnostic strength and wellness programs.',
    yearsInService: 12,
    departments: ['Wellness', 'Telehealth', 'Diagnostics', 'Chronic Care', 'Outpatient Services'],
    specialties: ['Wellness', 'Telehealth', 'Diagnostic Imaging', 'Diabetology'],
    facilities: ['Virtual care studio', 'Preventive health suites', 'Imaging diagnostics lab', 'Patient experience lounges'],
    patientExperienceIndicators: [
      { label: 'Digital visit score', value: '92%' },
      { label: 'Wellness program adherence', value: '89%' },
      { label: 'Care coordination', value: '4.7/5' },
      { label: 'Service ease', value: '4.6/5' },
    ],
    starBreakdown: [
      { stars: 5, percent: 62 },
      { stars: 4, percent: 23 },
      { stars: 3, percent: 9 },
      { stars: 2, percent: 4 },
      { stars: 1, percent: 2 },
    ],
    categoryRatings: [
      { label: 'Doctor quality', score: 4.7 },
      { label: 'Treatment experience', score: 4.6 },
      { label: 'Staff behavior', score: 4.6 },
      { label: 'Cleanliness', score: 4.7 },
      { label: 'Facilities', score: 4.7 },
      { label: 'Waiting time', score: 4.5 },
    ],
    reviews: [
      {
        id: 'crescent-review-001',
        rating: 5,
        title: 'Modern telehealth with caring follow-up',
        content:
          'The remote consultation was polished and the in-person diagnostic session was quick. The staff made the process feel smooth.',
        date: '2026-06-02',
        verified: true,
        treatmentTag: 'Telehealth',
        helpfulCount: 22,
      },
      {
        id: 'crescent-review-002',
        rating: 4,
        title: 'Wellness services with strong coordination',
        content:
          'Their wellness program is structured and easy to follow, with helpful guidance on lifestyle planning.',
        date: '2026-05-18',
        verified: true,
        treatmentTag: 'Wellness',
        helpfulCount: 17,
      },
    ],
    doctors: [
      {
        id: 'hana-lee',
        name: 'Dr. Hana Lee',
        specialty: 'Telehealth',
        experienceYears: 10,
        rating: 4.7,
        reviewCount: 184,
        successRate: '94%',
        fee: '$145',
        availability: 'Mon–Fri',
        availabilityStatus: 'Available soon',
        nextAvailable: 'Tomorrow, 9:30 AM',
        patientsTreated: '1.1k',
        languages: ['English', 'Mandarin'],
        location: 'Singapore',
        topics: ['Diabetes', 'All'],
        profileInitials: 'HL',
      },
      {
        id: 'wei-tan',
        name: 'Dr. Wei Tan',
        specialty: 'Diagnostic Imaging',
        experienceYears: 12,
        rating: 4.8,
        reviewCount: 162,
        successRate: '95%',
        fee: '$155',
        availability: 'Tue–Sat',
        availabilityStatus: 'Available soon',
        nextAvailable: 'Tuesday, 11:00 AM',
        patientsTreated: '1.0k',
        languages: ['English', 'Chinese'],
        location: 'Singapore',
        topics: ['Neurology', 'All'],
        profileInitials: 'WT',
      },
    ],
    specialtyDiscovery: [
      { id: 'diabetology', name: 'Diabetology', reviewCount: 98, rating: 4.7, signal: 'Chronic care coordination' },
      { id: 'telehealth', name: 'Telehealth', reviewCount: 86, rating: 4.7, signal: 'Remote care readiness' },
      { id: 'diagnostic-imaging', name: 'Diagnostic Imaging', reviewCount: 74, rating: 4.8, signal: 'Fast digital diagnostics' },
      { id: 'wellness', name: 'Wellness', reviewCount: 64, rating: 4.7, signal: 'Preventive health insights' },
      { id: 'chronic-care', name: 'Chronic Care', reviewCount: 56, rating: 4.6, signal: 'Integrated long-term support' },
    ],
  },
];

export function getHospitalDetailById(id: string) {
  return hospitalDetails.find((hospital) => hospital.id === id);
}
