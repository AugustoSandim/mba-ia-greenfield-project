import { NextResponse } from "next/server";

import type {
  ApiErrorEnvelope,
  CurrentUserProfile,
  LoginDto,
  LoginTokenPair,
} from "@/lib/api/contracts";
import { env } from "@/lib/env";
import { upstream } from "@/lib/api/upstream";
import { setSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const body = (await request.json()) as LoginDto;

  const { data, error, response } = await upstream.POST("/auth/login", {
    body: body as never,
  });

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  const tokens = data as LoginTokenPair;
  const authHeaders = {
    Authorization: `Bearer ${tokens.access_token ?? ""}`,
  };
  const meResult = await upstream.GET("/auth/me", {
    headers: authHeaders,
  });

  const profile = (meResult.data ?? {}) as CurrentUserProfile & Record<string, unknown>;
  let channelSlug = "";

  try {
    const channelResponse = await fetch(`${env.API_URL}/channels/me`, {
      headers: authHeaders,
      cache: "no-store",
    });

    if (channelResponse.ok) {
      const channel = (await channelResponse.json()) as Record<string, unknown>;
      const nickname =
        (typeof channel.nickname === "string" && channel.nickname) ||
        (typeof channel.slug === "string" && channel.slug) ||
        (typeof channel.channelSlug === "string" && channel.channelSlug) ||
        "";
      channelSlug = nickname;
    }
  } catch {
    // Ignore optional channel bootstrap failures. The session still remains valid.
  }

  if (!channelSlug) {
    channelSlug =
      (typeof profile.channelSlug === "string" && profile.channelSlug) ||
      (typeof profile.nickname === "string" && profile.nickname) ||
      "";
  }

  // Seal tokens into the iron-session cookie — tokens never cross to the browser.
  await setSession({
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? "",
    userId:
      (typeof profile.sub === "string" && profile.sub) ||
      (typeof profile.userId === "string" && profile.userId) ||
      "",
    email:
      (typeof profile.email === "string" && profile.email) ||
      ((body as Record<string, string>).email ?? ""),
    channelSlug,
  });

  // FE-facing body omits access_token / refresh_token (per API Contract).
  return NextResponse.json({}, { status: 200 });
}
