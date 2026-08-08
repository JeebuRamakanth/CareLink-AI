import { motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import type { HospitalDoctorItem, HospitalDoctorTopic } from '../data/hospitalDetailsData';

type HospitalDoctorPreviewProps = {
  doctors: HospitalDoctorItem[];
  topics: HospitalDoctorTopic[];
  selectedTopic: HospitalDoctorTopic;
  onTopicChange: (topic: HospitalDoctorTopic) => void;
};

const availabilityTone: Record<HospitalDoctorItem['availabilityStatus'], 'success' | 'brand' | 'warning' | 'neutral'> = {
  'Available now': 'success',
  'Available soon': 'brand',
  Limited: 'warning',
  'On leave': 'neutral',
};

export function HospitalDoctorPreview({ doctors, topics, selectedTopic, onTopicChange }: HospitalDoctorPreviewProps) {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const activeTopicLabel = selectedTopic === 'All' ? 'all specialties' : selectedTopic;

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-brand-200">Top doctors</p>
            <h2 className="mt-4 text-2xl font-semibold text-white">Smart doctor matches for this hospital</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-300">
              Showing top specialists matched to {activeTopicLabel}. Use the filter buttons to refine your care match by treatment focus.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => (
              <Button
                key={topic}
                type="button"
                variant={selectedTopic === topic ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => onTopicChange(topic)}
              >
                {topic}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          {doctors.length === 0 ? (
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 text-center text-ink-300">
              No doctors found for this specialty yet.
            </div>
          ) : (
            doctors.map((doctor) => {
              const isSmartFit = selectedTopic !== 'All' && doctor.topics.includes(selectedTopic);
              const tone = availabilityTone[doctor.availabilityStatus];

              return (
                <motion.div
                  key={doctor.id}
                  whileHover={{ y: -4 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                  className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 sm:grid-cols-[0.95fr_0.6fr]"
                >
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-lg font-semibold text-white shadow-[0_15px_40px_rgba(77,132,255,0.25)]">
                        {doctor.profileInitials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-white">{doctor.name}</p>
                          {isSmartFit ? <Badge tone="accent">Smart fit</Badge> : null}
                        </div>
                        <p className="mt-1 text-sm text-ink-300">{doctor.specialty}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 text-sm text-ink-300">
                      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
                        <p className="text-ink-400">Experience</p>
                        <p className="mt-2 text-white">{doctor.experienceYears} years</p>
                      </div>
                      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
                        <p className="text-ink-400">Patient volume</p>
                        <p className="mt-2 text-white">{doctor.patientsTreated} treated</p>
                      </div>
                      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
                        <p className="text-ink-400">Languages</p>
                        <p className="mt-2 text-white">{doctor.languages.join(', ')}</p>
                      </div>
                      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
                        <p className="text-ink-400">Location</p>
                        <p className="mt-2 text-white">{doctor.location}</p>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3 text-sm text-ink-300">
                      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-3">
                        <p className="text-ink-400">Rating</p>
                        <p className="mt-1 text-white">{doctor.rating.toFixed(1)} ★</p>
                        <p className="text-ink-500">({doctor.reviewCount})</p>
                      </div>
                      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-3">
                        <p className="text-ink-400">Next open</p>
                        <p className="mt-1 text-white">{doctor.nextAvailable}</p>
                      </div>
                      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-3">
                        <p className="text-ink-400">Fee</p>
                        <p className="mt-1 text-white">{doctor.fee}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between gap-4">
                    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
                      <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Availability</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge tone={tone}>{doctor.availabilityStatus}</Badge>
                        <span className="text-sm text-ink-400">{doctor.availability}</span>
                      </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 text-sm text-ink-300">
                      <p className="text-ink-400">Match focus</p>
                      <p className="mt-2 text-white">{doctor.topics.join(' • ')}</p>
                    </div>

                    <div className="grid gap-3">
                      <Button type="button" variant="secondary" size="sm" onClick={() => navigate(`/doctors/${doctor.id}`)}>
                        View doctor
                      </Button>
                      <Button type="button" variant="primary" size="sm" onClick={() => navigate(`/doctors/${doctor.id}`)}>
                        Book appointment
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </motion.section>
  );
}
