import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../routes/routeConstants';
import {
  getDepartmentDoctorCount,
  getDoctorsForDepartment,
} from '../../../services/providerDirectoryService';
import type { HospitalDepartment } from '../../../types';

type HospitalDepartmentsProps = {
  hospitalId: string;
  departments: HospitalDepartment[];
  /** Opens the booking request flow for a department (passed by the detail page). */
  onRequestAppointment?: (departmentName: string) => void;
};

/**
 * Department list for a hospital. Each department shows its published
 * information, the listed-doctor count computed from affiliation records, and
 * the real actions available for it. A hospital with no published department
 * data says so explicitly rather than showing invented departments.
 */
export function HospitalDepartments({ hospitalId, departments, onRequestAppointment }: HospitalDepartmentsProps) {
  const [openId, setOpenId] = useState<string | null>(departments[0]?.id ?? null);

  if (departments.length === 0) {
    return (
      <section aria-labelledby="departments-heading" className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 sm:p-8">
        <h2 id="departments-heading" className="text-xl font-semibold text-white">Departments</h2>
        <p role="status" className="mt-3 text-sm leading-6 text-ink-300">
          Department information is not available in the current sources for this facility. No department list has been published that we can attribute.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="departments-heading" className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="departments-heading" className="text-xl font-semibold text-white">Departments</h2>
        <p className="text-sm text-ink-400">{departments.length} published department{departments.length === 1 ? '' : 's'}</p>
      </div>

      <ul className="mt-5 space-y-3">
        {departments.map((department) => {
          const isOpen = openId === department.id;
          const doctors = getDoctorsForDepartment(hospitalId, department.name);
          const count = getDepartmentDoctorCount(hospitalId, department.name);
          const countLabel = count.listed === 0
            ? 'No doctor list available in current sources'
            : count.completeness === 'partial_roster'
              ? `${count.listed} listed doctor${count.listed === 1 ? '' : 's'} (visiting roster — list may be incomplete)`
              : `${count.listed} listed doctor${count.listed === 1 ? '' : 's'} in the published roster`;

          return (
            <li key={department.id} className="min-w-0 rounded-[1.4rem] border border-white/10 bg-slate-950/60">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenId(isOpen ? null : department.id)}
                className="flex w-full min-w-0 items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <span className="min-w-0">
                  <span className="block break-words font-semibold text-white">{department.name}</span>
                  <span className="mt-0.5 block text-sm text-ink-400">{countLabel}</span>
                </span>
                <span aria-hidden className="shrink-0 text-ink-400">{isOpen ? '−' : '+'}</span>
              </button>

              {isOpen ? (
                <div className="space-y-4 border-t border-white/10 px-5 py-4">
                  {department.description ? <p className="text-sm leading-6 text-ink-300">{department.description}</p> : null}

                  {department.services.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-400">Published services</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {department.services.map((service) => (
                          <span key={service} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-ink-200">{service}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-ink-400">Department phone</dt>
                      <dd className="mt-1 text-ink-200">{department.phone || 'Not published'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-ink-400">Opening hours</dt>
                      <dd className="mt-1 text-ink-200">{department.opening_hours || 'Not published'}</dd>
                    </div>
                  </dl>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-400">Listed doctors</p>
                    {doctors.length === 0 ? (
                      <p className="mt-2 text-sm text-ink-400">No doctor list available in current sources for this department.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {doctors.map((doctor) => {
                          const affiliation = doctor.affiliations.find((item) =>
                            item.hospital_id === hospitalId
                            && (item.department_name ?? '').trim().toLowerCase() === department.name.trim().toLowerCase());
                          return (
                            <li key={doctor.id} className="min-w-0 rounded-[1rem] border border-white/10 bg-slate-950/70 px-4 py-3">
                              <Link to={`${ROUTES.doctors}/${doctor.id}`} className="break-words font-semibold text-brand-200 underline">
                                {doctor.name}
                              </Link>
                              <p className="mt-0.5 text-sm text-ink-300">
                                {doctor.specialty}
                                {affiliation?.role ? ` · ${affiliation.role}` : ''}
                              </p>
                              {affiliation?.schedule_note ? (
                                <p className="mt-0.5 text-xs text-ink-400">Published timing: {affiliation.schedule_note}</p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {onRequestAppointment ? (
                      <button
                        type="button"
                        onClick={() => onRequestAppointment(department.name)}
                        className="rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                      >
                        Request an appointment
                      </button>
                    ) : (
                      <span className="rounded-full border border-white/10 px-4 py-2 text-sm text-ink-400">Online booking not available — call the facility</span>
                    )}
                    {department.provenance?.source_url ? (
                      <a
                        href={department.provenance.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                      >
                        Source
                      </a>
                    ) : null}
                  </div>

                  <p className="text-xs leading-5 text-ink-400">
                    Evidence: {department.evidence_status === 'published' ? 'published by the facility' : 'unverified suggestion'}
                    {department.provenance?.data_source ? ` · ${department.provenance.data_source}` : ''}
                    {department.provenance?.fetched_at ? ` · checked ${department.provenance.fetched_at}` : ''}
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
