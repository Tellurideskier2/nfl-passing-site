export class PublicError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export async function getRemote(url, { fetchImpl = fetch, headers = {}, label = 'Data provider', timeout = 25000 } = {}) {
  let response;
  try {
    response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeout) });
  } catch {
    throw new PublicError(`${label} could not be reached or timed out. Try again shortly.`);
  }
  if (!response.ok) {
    const detail = response.status === 401 || response.status === 403
      ? 'Check the API key and your plan’s NFL player-prop access.'
      : response.status === 429 ? 'The provider rate limit or quota was reached. Try later or check your plan.'
      : 'Try again shortly.';
    throw new PublicError(`${label} returned HTTP ${response.status}. ${detail}`, response.status === 429 ? 429 : 502);
  }
  return response;
}

export async function remoteJSON(url, options) {
  const response = await getRemote(url, options);
  try { return await response.json(); }
  catch { throw new PublicError('The odds provider returned an invalid response.'); }
}
