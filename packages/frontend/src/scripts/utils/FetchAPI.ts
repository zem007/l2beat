type FetchResponse = {
  json: unknown
  status: number
}

export class FetchAPI {
  private readonly cache = new Map<string, FetchResponse>()

  constructor(private abortSignal?: AbortSignal) {}

  async fetch(url: string): Promise<FetchResponse> {
    const cached = this.cache.get(url)
    if (cached) {
      return cached
    }
    const response = await fetch(url, { signal: this.abortSignal })
    const json: unknown = await response.json()
    const fetchResponse = {
      json,
      status: response.status,
    }
    if (response.ok) {
      this.cache.set(url, fetchResponse)
    }
    return fetchResponse
  }

  setAbortSignal(signal: AbortSignal) {
    this.abortSignal = signal
  }
}
