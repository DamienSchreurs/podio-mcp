/**
 * Podio API client with OAuth2 password-grant authentication and automatic token refresh.
 */

const PODIO_API_BASE = "https://api.podio.com";
const TOKEN_URL = "https://podio.com/oauth/token";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface PodioConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}

export class PodioClient {
  private config: PodioConfig;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    const clientId = process.env.PODIO_CLIENT_ID;
    const clientSecret = process.env.PODIO_CLIENT_SECRET;
    const username = process.env.PODIO_USERNAME;
    const password = process.env.PODIO_PASSWORD;

    if (!clientId || !clientSecret || !username || !password) {
      throw new Error(
        "Missing required environment variables. Set PODIO_CLIENT_ID, PODIO_CLIENT_SECRET, PODIO_USERNAME, and PODIO_PASSWORD."
      );
    }

    this.config = { clientId, clientSecret, username, password };
  }

  private async authenticate(): Promise<void> {
    const body = new URLSearchParams({
      grant_type: "password",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      username: this.config.username,
      password: this.config.password,
    });

    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Podio authentication failed (${resp.status}): ${text}`);
    }

    const data = (await resp.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    // Expire 5 minutes early to avoid edge cases
    this.tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      return this.authenticate();
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.refreshToken,
    });

    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!resp.ok) {
      // Refresh failed, do full re-auth
      this.refreshToken = null;
      return this.authenticate();
    }

    const data = (await resp.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  }

  private async ensureAuth(): Promise<string> {
    if (!this.accessToken) {
      await this.authenticate();
    } else if (Date.now() >= this.tokenExpiresAt) {
      await this.refreshAccessToken();
    }
    return this.accessToken!;
  }

  async request<T = any>(
    method: string,
    path: string,
    body?: Record<string, any>,
    query?: Record<string, string | number | boolean>
  ): Promise<T> {
    const token = await this.ensureAuth();
    let url = `${PODIO_API_BASE}${path}`;

    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) {
          params.set(k, String(v));
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      Authorization: `OAuth2 ${token}`,
      "Content-Type": "application/json",
    };

    const resp = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (resp.status === 401) {
      // Token might have been revoked server-side; re-authenticate once
      await this.authenticate();
      const retryToken = this.accessToken!;
      headers.Authorization = `OAuth2 ${retryToken}`;
      const retry = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!retry.ok) {
        throw await this.buildError(retry);
      }
      if (retry.status === 204) return undefined as T;
      return (await retry.json()) as T;
    }

    if (!resp.ok) {
      throw await this.buildError(resp);
    }

    if (resp.status === 204) return undefined as T;
    return (await resp.json()) as T;
  }

  private async buildError(resp: Response): Promise<PodioApiError> {
    let detail: string;
    try {
      const json = await resp.json();
      detail = json.error_description || json.error || JSON.stringify(json);
    } catch {
      detail = await resp.text().catch(() => "Unknown error");
    }
    return new PodioApiError(resp.status, detail);
  }

  // Convenience methods
  async get<T = any>(path: string, query?: Record<string, string | number | boolean>): Promise<T> {
    return this.request<T>("GET", path, undefined, query);
  }

  async post<T = any>(path: string, body?: Record<string, any>, query?: Record<string, string | number | boolean>): Promise<T> {
    return this.request<T>("POST", path, body, query);
  }

  async put<T = any>(path: string, body?: Record<string, any>, query?: Record<string, string | number | boolean>): Promise<T> {
    return this.request<T>("PUT", path, body, query);
  }

  async delete<T = any>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}

export class PodioApiError extends Error {
  constructor(
    public statusCode: number,
    public detail: string
  ) {
    super(`Podio API error ${statusCode}: ${detail}`);
    this.name = "PodioApiError";
  }
}
