export function isExclusionConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const details = `${error.message} ${'meta' in error ? JSON.stringify(error.meta) : ''}`;
  return /23P01|court_occupancies_no_active_overlap/.test(details);
}
