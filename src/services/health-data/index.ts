/**
 * CareLink-AI — health-data barrel (Step 10).
 *
 * Typed repositories for Supabase-backed health data. UI/components should
 * import from here rather than calling Supabase directly. Each repository
 * returns null/empty when Supabase is unavailable so callers fall back to
 * existing local/mock flows gracefully.
 */

export * from './types';
export * from './repository';
export * from './profilesRepository';
export * from './familyRepository';
export * from './appointmentsRepository';
export * from './conversationsRepository';
export * from './documentsRepository';
export * from './recoveryVaccinationRepository';
export * from './healthContextRepository';
export * from './auxRepository';
