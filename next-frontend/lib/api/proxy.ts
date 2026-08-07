import "server-only";

import { env } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import { withRefresh } from "@/lib/auth/refresh";

type ProxyOptions = {
  method?: string;
  auth?: boolean;
  body?: unknown;
  headers?: HeadersInit;
};

export async function proxyUpstream(path: string, options: ProxyOptions = {}) {
  const { method = "GET", auth = false, body, headers } = options;
  const url = `${env.API_URL}${path}`;

  const fetcher = async () => {
    const session = auth ? await getSession() : null;
    return fetch(url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(auth && session?.accessToken
          ? { Authorization: `Bearer ${session.accessToken}` }
          : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  };

  return auth ? withRefresh(fetcher) : fetcher();
}

export async function jsonFromResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  return (await response.json()) as unknown;
}

export function responseFromUpstream(response: Response, body?: BodyInit | null) {
  const headers = new Headers();
  const passthroughHeaders = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "content-disposition",
    "etag",
  ];

  for (const key of passthroughHeaders) {
    const value = response.headers.get(key);
    if (value) {
      headers.set(key, value);
    }
  }

  return new Response(body ?? response.body, {
    status: response.status,
    headers,
  });
}
