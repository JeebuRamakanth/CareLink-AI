/**
 * CareLink-AI — shared auth form utilities (Step 10).
 */

import type { FormEvent } from 'react';

export function preventDefaultSubmit(onSubmit: () => void | Promise<void>) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void onSubmit();
  };
}

export function maskEmailForLog(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '••••';
  const visible = local.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}
