import "server-only";

import { env } from "@/lib/env";
import { withRefresh } from "@/lib/auth/refresh";
import { getSession } from "@/lib/auth/session";

import {
  compactText,
  getMessage,
  normalizeCategories,
  normalizeChannel,
  normalizeCommentList,
  normalizePagedVideos,
  normalizeSubscriptions,
  normalizeVideoDetail,
  normalizeVideoList,
  type Category,
  type ChannelSummary,
  type CommentItem,
  type PagedVideos,
  type VideoDetail,
  type VideoSummary,
} from "./models";

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  headers?: HeadersInit;
  searchParams?: URLSearchParams;
};

async function fetchApi(path: string, options: RequestOptions = {}) {
  const { method = "GET", body, auth = false, headers, searchParams } = options;
  const url = new URL(`${env.API_URL}${path}`);

  if (searchParams) {
    url.search = searchParams.toString();
  }

  const rawFetch = async () => {
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

  const response = auth ? await withRefresh(rawFetch) : await rawFetch();
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? ((await response.json()) as unknown)
    : null;

  if (!response.ok) {
    throw new Error(getMessage(data, `Request failed with status ${response.status}`));
  }

  return data;
}

function buildVideoSearchParams(input: {
  page?: number;
  limit?: number;
  category?: string;
  query?: string;
}) {
  const params = new URLSearchParams();
  if (input.page) {
    params.set("page", String(input.page));
  }
  if (input.limit) {
    params.set("limit", String(input.limit));
  }
  if (input.category) {
    params.set("category", input.category);
  }
  const query = compactText(input.query);
  if (query) {
    params.set("q", query);
  }
  return params;
}

export async function getCategories(): Promise<Category[]> {
  const data = await fetchApi("/categories");
  return normalizeCategories(data);
}

export async function getHomeFeed(input: {
  page?: number;
  limit?: number;
  category?: string;
  query?: string;
}): Promise<PagedVideos> {
  const page = input.page ?? 1;
  const limit = input.limit ?? 12;
  const data = await fetchApi("/videos", {
    searchParams: buildVideoSearchParams({ ...input, page, limit }),
  });

  return normalizePagedVideos(data, page, limit);
}

export async function getWatchVideo(publicId: string): Promise<VideoDetail> {
  const data = await fetchApi(`/videos/${publicId}`);
  return normalizeVideoDetail(data);
}

export async function getRelatedVideos(publicId: string): Promise<VideoSummary[]> {
  const data = await fetchApi(`/videos/${publicId}/related`);
  return normalizeVideoList(data);
}

export async function getVideoComments(publicId: string): Promise<CommentItem[]> {
  const data = await fetchApi(`/videos/${publicId}/comments`);
  return normalizeCommentList(data);
}

export async function getPublicChannel(nickname: string): Promise<{
  channel: ChannelSummary;
  videos: VideoSummary[];
}> {
  const data = await fetchApi(`/channels/${nickname}`);
  const source = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;

  return {
    channel: normalizeChannel(source.channel ?? source),
    videos: normalizeVideoList(source.videos ?? source.items ?? []),
  };
}

export async function getMyChannel(): Promise<ChannelSummary> {
  const data = await fetchApi("/channels/me", { auth: true });
  return normalizeChannel(data);
}

export async function getMyVideos(): Promise<VideoSummary[]> {
  const data = await fetchApi("/channels/me/videos", { auth: true });
  return normalizeVideoList(data);
}

export async function getSubscriptions(): Promise<ChannelSummary[]> {
  const data = await fetchApi("/channels/me/subscriptions", { auth: true });
  return normalizeSubscriptions(data);
}
