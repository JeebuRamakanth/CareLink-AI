export function googlePlacesRequestError(status: number): Error {
  const code = status === 429
    ? 'RESOURCE_EXHAUSTED'
    : status === 403
      ? 'PERMISSION_DENIED'
      : `HTTP_${status}`;
  return new Error(`Google Places request failed (${code}). Check Places API access, key restrictions, billing, and quota.`);
}
