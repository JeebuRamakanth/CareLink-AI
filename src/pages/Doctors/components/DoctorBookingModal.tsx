import { useMemo, useState } from 'react';
import type { DoctorProfile } from '../data/doctorProfileData';
import type { AppointmentType } from '../../Appointments/data/appointmentsData';
import { Button } from '../../../components/ui/Button';

export interface BookingPatientOption {
  /** Stable id used for the appointment's family_profile_id when it matches a real profile. */
  id: string;
  label: string;
}

/** The chosen appointment moment: a real slot id when one exists, else a request. */
export interface BookingSelection {
  day: string;
  time: string;
  slotId?: string;
}

type DoctorBookingModalProps = {
  doctor: DoctorProfile;
  selectedSlotId: string | null;
  onClose: () => void;
  onConfirm: (selection: BookingSelection, patientProfile: BookingPatientOption, appointmentType: AppointmentType) => void;
  patientProfiles: BookingPatientOption[];
  selectedProfile: BookingPatientOption | null;
  onSelectProfile: (profile: BookingPatientOption) => void;
  /** True while a submission is in flight — disables duplicate submission. */
  submitting?: boolean;
};

const appointmentTypes: AppointmentType[] = ['Consultation', 'Follow-up', 'Telehealth'];

/** Time options for the request flow (no live slots published by the provider). */
const requestTimeOptions = ['09:00', '10:00', '11:00', '12:00', '15:00', '16:00', '17:00', '18:00'];

export function DoctorBookingModal({
  doctor,
  selectedSlotId,
  onClose,
  onConfirm,
  patientProfiles,
  selectedProfile,
  onSelectProfile,
  submitting = false,
}: DoctorBookingModalProps) {
  const [activeSlotId, setActiveSlotId] = useState<string | null>(selectedSlotId);
  const [step, setStep] = useState(1);
  const [selectedAppointmentType, setSelectedAppointmentType] = useState(appointmentTypes[0]);
  const [requestDate, setRequestDate] = useState<string>('');
  const [requestTime, setRequestTime] = useState<string>('');

  const hasRealSlots = doctor.availabilitySlots.length > 0;

  const selectedSlot = useMemo(
    () => doctor.availabilitySlots.find((slot) => slot.id === activeSlotId),
    [doctor.availabilitySlots, activeSlotId]
  );

  const minDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const requestSelection: BookingSelection | null = requestDate && requestTime
    ? { day: requestDate, time: requestTime }
    : null;

  const selection: BookingSelection | null = hasRealSlots
    ? (selectedSlot ? { day: selectedSlot.day, time: selectedSlot.time, slotId: selectedSlot.id } : null)
    : requestSelection;

  const canStepOneContinue = selectedProfile !== null && selectedAppointmentType.length > 0;
  const canStepTwoContinue = hasRealSlots ? (selectedSlot?.status === 'available') : requestSelection !== null;
  const canConfirm = step === 3 && canStepTwoContinue && !submitting;

  const handleNext = () => {
    if (step === 1 && canStepOneContinue) {
      setStep(2);
      return;
    }
    if (step === 2 && canStepTwoContinue) {
      setStep(3);
    }
  };

  const handleConfirm = () => {
    if (selection && selectedProfile && !submitting) {
      onConfirm(selection, selectedProfile, selectedAppointmentType);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-4 sm:items-center">
      <div className="w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/95 shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-brand-200">{hasRealSlots ? 'Book an appointment' : 'Request an appointment'}</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{hasRealSlots ? 'Book your appointment' : 'Request your appointment'}</h2>
            <p className="mt-2 text-sm text-ink-300">
              {hasRealSlots
                ? 'Choose one of the provider’s published slots to confirm your booking.'
                : 'This provider has not published live slots. Send a request with your preferred date and time — the facility confirms it directly.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-ink-300 transition hover:text-white">
            Close
          </button>
        </div>

        <div className="space-y-5 border-b border-white/10 px-6 py-4 sm:px-8">
          <div className="grid gap-2 sm:grid-cols-3">
            {['Profile', hasRealSlots ? 'Slot' : 'Date & time', 'Review'].map((title, index) => {
              const stepNumber = index + 1;
              const active = step === stepNumber;
              const completed = step > stepNumber;
              return (
                <div key={title} className={`rounded-[1.5rem] border px-4 py-3 text-sm ${active ? 'border-brand-400 bg-brand-500/10 text-white' : 'border-white/10 bg-slate-950/80 text-ink-300'}`}>
                  <p className="font-semibold">Step {stepNumber}</p>
                  <p className="mt-1">{title}</p>
                  {completed ? <span className="mt-2 inline-flex rounded-full bg-emerald-500/10 px-2 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-emerald-200">Done</span> : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-[0.95fr_0.75fr]">
          <div className="space-y-5">
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5">
              <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Doctor</p>
              <h3 className="mt-2 text-xl font-semibold text-white">{doctor.name}</h3>
              <p className="mt-2 text-sm text-ink-300">{doctor.specialty} · {doctor.hospitalAffiliation}</p>
              <p className="mt-3 text-sm leading-7 text-ink-300">{doctor.profileSummary}</p>
            </div>

            {step === 1 ? (
              <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5">
                <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Patient profile</p>
                <div className="mt-4 grid gap-3">
                  {patientProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => onSelectProfile(profile)}
                      className={`rounded-[1.5rem] border px-4 py-3 text-left transition ${
                        selectedProfile?.id === profile.id
                          ? 'border-brand-400 bg-brand-500/10 text-white'
                          : 'border-white/10 bg-slate-950/75 text-ink-300 hover:border-brand-400/30 hover:bg-white/5'
                      }`}
                    >
                      <p className="font-semibold">{profile.label}</p>
                      <p className="mt-1 text-sm text-ink-400">
                        {profile.id === 'self' ? 'Your primary self profile' : 'Family-member patient context'}
                      </p>
                    </button>
                  ))}
                </div>

                <div className="mt-6">
                  <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Appointment type</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {appointmentTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSelectedAppointmentType(type)}
                        className={`rounded-full border px-4 py-2 text-sm transition ${
                          selectedAppointmentType === type
                            ? 'border-brand-400 bg-brand-500/10 text-white'
                            : 'border-white/10 bg-slate-950/75 text-ink-300 hover:border-brand-400/30 hover:bg-white/5'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : step === 2 ? (
              <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5">
                {hasRealSlots ? (
                  <>
                    <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Select time slot</p>
                    <div className="mt-4 space-y-3">
                      {doctor.availabilitySlots.map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setActiveSlotId(slot.id)}
                          className={`w-full rounded-[1.5rem] border px-4 py-4 text-left transition ${
                            slot.id === activeSlotId
                              ? 'border-brand-400 bg-brand-500/10 text-white'
                              : 'border-white/10 bg-slate-950/75 text-ink-300 hover:border-brand-400/30 hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-sm uppercase tracking-[0.24em] text-ink-400">{slot.day}</p>
                              <p className="mt-1 text-lg font-semibold text-white">{slot.time}</p>
                            </div>
                            <span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs uppercase text-ink-300">
                              {slot.status === 'available' ? 'Available' : slot.status === 'reserved' ? 'Reserved' : 'Unavailable'}
                            </span>
                          </div>
                          <p className="mt-3 text-sm text-ink-400">{slot.period} consultation</p>
                        </button>
                      ))}
                    </div>
                    {selectedSlot ? (
                      <div className="mt-4 rounded-[1.5rem] border border-brand-400/20 bg-brand-500/10 p-4 text-sm text-brand-100">
                        Selected slot: {selectedSlot.day}, {selectedSlot.time} ({selectedSlot.period})
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 text-sm text-ink-300">
                        Pick a time slot to proceed to confirmation.
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Preferred date &amp; time</p>
                    <p className="mt-2 text-sm text-ink-400">This is a request, not a confirmed booking. The facility will confirm the exact time.</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-sm text-ink-300">Preferred date</span>
                        <input
                          type="date"
                          min={minDate}
                          value={requestDate}
                          onChange={(event) => setRequestDate(event.target.value)}
                          className="mt-2 w-full rounded-[1.25rem] border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm text-ink-300">Preferred time</span>
                        <select
                          value={requestTime}
                          onChange={(event) => setRequestTime(event.target.value)}
                          className="mt-2 w-full rounded-[1.25rem] border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
                        >
                          <option value="">Select a time</option>
                          {requestTimeOptions.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {requestSelection ? (
                      <div className="mt-4 rounded-[1.5rem] border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
                        Requesting {requestSelection.day} at {requestSelection.time} — pending provider confirmation.
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 text-sm text-ink-300">
                        Choose a preferred date and time to continue.
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5">
                <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Review appointment</p>
                <div className="mt-4 space-y-3 text-sm text-ink-300">
                  <SummaryRow label="Patient" value={selectedProfile?.label ?? 'Not selected'} />
                  <SummaryRow label="Type" value={selectedAppointmentType} />
                  <SummaryRow label="Doctor" value={doctor.name} />
                  <SummaryRow label="Service" value={`${doctor.specialty} consultation`} />
                  <SummaryRow label="Fee" value={doctor.consultationFee} />
                  <SummaryRow label="Location" value={doctor.consultationInfo.location} />
                  <SummaryRow label="Selected slot" value={selection ? `${selection.day}, ${selection.time}` : 'Not selected'} />
                </div>
                <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 text-sm text-ink-300">
                  <p className="font-semibold text-white">{hasRealSlots ? 'Ready to confirm' : 'Ready to submit request'}</p>
                  <p className="mt-2">
                    {hasRealSlots
                      ? 'Confirmed bookings will appear in your appointment summary.'
                      : 'Your request will be sent to the facility and appears as PENDING until it is confirmed. It is not a confirmed appointment yet.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5">
              <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Appointment summary</p>
              <div className="mt-4 space-y-3 text-sm text-ink-300">
                <SummaryRow label="Doctor" value={doctor.name} />
                <SummaryRow label="Service" value={`${doctor.specialty} consultation`} />
                <SummaryRow label="Fee" value={doctor.consultationFee} />
                <SummaryRow label="Mode" value={doctor.consultationModes.join(', ')} />
                <SummaryRow label="Location" value={doctor.consultationInfo.location} />
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5">
              <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Booking note</p>
              <p className="mt-3 text-sm leading-7 text-ink-300">
                {hasRealSlots
                  ? 'Choose one of the provider’s published slots to confirm your booking.'
                  : 'Requests are reviewed by the facility. Availability shown is not live — the provider confirms the final time.'}
              </p>
            </div>

            <div className="grid gap-3">
              {step < 3 ? (
                <Button type="button" variant="primary" onClick={handleNext} disabled={step === 1 ? !canStepOneContinue : !canStepTwoContinue}>
                  Continue
                </Button>
              ) : (
                <Button type="button" variant="primary" onClick={handleConfirm} disabled={!canConfirm}>
                  {submitting ? 'Submitting…' : hasRealSlots ? 'Confirm appointment' : 'Submit request'}
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={step > 1 ? () => setStep(step - 1) : onClose}>
                {step > 1 ? 'Back' : 'Cancel booking'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
      <span className="text-sm uppercase tracking-[0.24em] text-ink-400">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}
