/**
 * Internal API Client with automated authentication headers
 */
const INTERNAL_API_SECRET = 'alex_sec_9f7c2b4e8a1d5c0e7b2a6f4d3c8e1b9a2d5f7e0c4b6a8d1e3f5a7c9b0e2d4f6';

export function getInternalApiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-internal-api-key': INTERNAL_API_SECRET,
  };
}

export async function secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const customHeaders = options.headers instanceof Headers
    ? Object.fromEntries(options.headers.entries())
    : (options.headers as Record<string, string> || {});

  const headers = {
    ...getInternalApiHeaders(),
    ...customHeaders,
  };

  return fetch(url, {
    ...options,
    headers,
  });
}
