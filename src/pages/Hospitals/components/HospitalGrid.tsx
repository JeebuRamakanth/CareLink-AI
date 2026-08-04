import type { Hospital } from '../../../types';
import { HospitalCard } from './HospitalCard';

type HospitalGridProps = {
  hospitals: Hospital[];
};

export function HospitalGrid({ hospitals }: HospitalGridProps) {
  if (hospitals.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {hospitals.map((hospital) => (
        <HospitalCard key={hospital.id} hospital={hospital} />
      ))}
    </div>
  );
}
