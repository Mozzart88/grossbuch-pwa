import type {
  SyncPushRequest,
  SyncPushResponse,
  SyncPullResponse,
  SyncAckRequest,
  SyncAckResponse,
  SyncInitPostRequest,
  SyncInitPackage,
  SyncInitDeleteRequest,
} from './syncTypes'

const API_URL = import.meta.env.VITE_EXCHANGE_API_URL
const TIMEOUT_MS = 15000

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

function authHeaders(jwt: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwt}`,
  }
}

export async function push(
  request: SyncPushRequest,
  jwt: string
): Promise<SyncPushResponse> {
  const response = await fetchWithTimeout(`${API_URL}/sync/push`, {
    method: 'POST',
    headers: authHeaders(jwt),
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Sync push failed: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export async function pull(
  installationId: string,
  since: number,
  jwt: string
): Promise<SyncPullResponse> {
  const params = new URLSearchParams({
    installation_id: installationId,
    since: since.toString(),
  })

  const response = await fetchWithTimeout(`${API_URL}/sync/pull?${params}`, {
    method: 'GET',
    headers: authHeaders(jwt),
  })

  if (!response.ok) {
    throw new Error(`Sync pull failed: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export async function ack(
  request: SyncAckRequest,
  jwt: string
): Promise<SyncAckResponse> {
  const response = await fetchWithTimeout(`${API_URL}/sync/ack`, {
    method: 'POST',
    headers: authHeaders(jwt),
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Sync ack failed: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export async function postInit(
  request: SyncInitPostRequest,
  jwt: string
): Promise<void> {
  const response = await fetchWithTimeout(`${API_URL}/sync/init`, {
    method: 'POST',
    headers: authHeaders(jwt),
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Sync init post failed: ${response.status} ${response.statusText}`)
  }
}

export async function getInit(
  jwt: string,
  id: string
): Promise<SyncInitPackage[]> {
  const params = new URLSearchParams({
    uuid: id,
    _t: Date.now().toString()
  })
  const response = await fetchWithTimeout(`${API_URL}/sync/init?${params}`, {
    method: 'GET',
    headers: authHeaders(jwt),
  })

  if (!response.ok) {
    throw new Error(`Sync init get failed: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export async function deleteInit(
  request: SyncInitDeleteRequest,
  jwt: string
): Promise<void> {
  const response = await fetchWithTimeout(`${API_URL}/sync/init`, {
    method: 'DELETE',
    headers: authHeaders(jwt),
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Sync init delete failed: ${response.status} ${response.statusText}`)
  }
}
