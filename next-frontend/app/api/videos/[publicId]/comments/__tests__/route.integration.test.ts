import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookieMap = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: (name: string) =>
      cookieMap.has(name) ? { name, value: cookieMap.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieMap.set(name, value);
    },
    delete: (name: string) => {
      cookieMap.delete(name);
    },
  }),
}));

let GET: (
  request: Request,
  context: { params: Promise<{ publicId: string }> }
) => Promise<Response>;
let POST: (
  request: Request,
  context: { params: Promise<{ publicId: string }> }
) => Promise<Response>;

beforeAll(async () => {
  ({ GET, POST } = await import("@/app/api/videos/[publicId]/comments/route"));
});

beforeEach(() => {
  cookieMap.clear();
});

describe("video comments BFF", () => {
  it("returns comments for a public watch page", async () => {
    const response = await GET(new Request("http://localhost/api/videos/foo/comments"), {
      params: Promise.resolve({ publicId: "streamtube-home-1" }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ content: string }>;
    expect(body[0]?.content).toMatch(/exactly what i needed/i);
  });

  it("creates a comment for an authenticated viewer", async () => {
    const { setSession } = await import("@/lib/auth/session");
    await setSession({
      accessToken: "fixture-access-token",
      refreshToken: "fixture-refresh-token",
      userId: "user-fixture-id",
      email: "alice@example.com",
      channelSlug: "augusto",
    });

    const response = await POST(
      new Request("http://localhost/api/videos/foo/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Great breakdown." }),
      }),
      {
        params: Promise.resolve({ publicId: "streamtube-home-1" }),
      }
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { content: string };
    expect(body.content).toBe("Great breakdown.");
  });
});
