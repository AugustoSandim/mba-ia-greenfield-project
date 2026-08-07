type UnknownRecord = Record<string, unknown>;

export type Category = {
  id: string;
  name: string;
  slug: string;
};

export type ChannelSummary = {
  id: string;
  name: string;
  nickname: string;
  description: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  subscribersCount: number;
  videosCount: number;
  isSubscribed: boolean;
};

export type VideoSummary = {
  id: string;
  publicId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  duration: number | null;
  viewsCount: number;
  commentsCount: number;
  likesCount: number;
  dislikesCount: number;
  viewerReaction: "like" | "dislike" | "none";
  status: string;
  visibility: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  channel: ChannelSummary;
  category: Category | null;
};

export type VideoDetail = VideoSummary & {
  streamUrl: string;
  downloadUrl: string;
  isPublished: boolean;
};

export type CommentAuthor = {
  id: string;
  name: string;
  nickname: string;
  avatarUrl: string | null;
};

export type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  likesCount: number;
  dislikesCount: number;
  viewerReaction: "like" | "dislike" | "none";
  author: CommentAuthor;
  replies: CommentItem[];
};

export type PagedVideos = {
  items: VideoSummary[];
  page: number;
  limit: number;
  hasMore: boolean;
};

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null ? (value as UnknownRecord) : {};
}

function pickString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function pickBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstString(source: UnknownRecord, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return fallback;
}

function firstNullableString(source: UnknownRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function firstNumber(source: UnknownRecord, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return fallback;
}

function firstBoolean(source: UnknownRecord, keys: string[], fallback = false): boolean {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return fallback;
}

function normalizeReaction(value: unknown): "like" | "dislike" | "none" {
  if (value === "like" || value === "dislike") {
    return value;
  }
  return "none";
}

function normalizeCategory(value: unknown): Category | null {
  if (!value) {
    return null;
  }

  const source = asRecord(value);
  const id = firstString(source, ["id"], "");
  const name = firstString(source, ["name", "title"], "");
  const slug = firstString(source, ["slug", "code"], name.toLowerCase().replaceAll(/\s+/g, "-"));

  if (!name) {
    return null;
  }

  return {
    id: id || slug || name,
    name,
    slug: slug || name.toLowerCase().replaceAll(/\s+/g, "-"),
  };
}

export function normalizeChannel(value: unknown): ChannelSummary {
  const source = asRecord(value);
  const nickname = firstString(source, ["nickname", "slug", "channelSlug"], "channel");
  const displayName = firstString(source, ["name", "displayName", "title"], nickname);

  return {
    id: firstString(source, ["id", "channelId"], nickname),
    name: displayName,
    nickname,
    description: firstString(source, ["description", "bio"], ""),
    avatarUrl: firstNullableString(source, ["avatarUrl", "avatar_url", "imageUrl"]),
    bannerUrl: firstNullableString(source, ["bannerUrl", "banner_url"]),
    subscribersCount: firstNumber(source, ["subscribersCount", "subscriberCount", "subscribers"], 0),
    videosCount: firstNumber(source, ["videosCount", "videoCount"], 0),
    isSubscribed: firstBoolean(source, ["isSubscribed", "viewerSubscribed"], false),
  };
}

export function normalizeVideoSummary(value: unknown): VideoSummary {
  const source = asRecord(value);
  const channelSource = asRecord(source.channel);
  const category = normalizeCategory(source.category);
  const publicId = firstString(source, ["publicId", "public_id", "id"], "");
  const title = firstString(source, ["title"], "Untitled video");
  const createdAt = firstString(source, ["createdAt", "created_at"], new Date(0).toISOString());

  return {
    id: firstString(source, ["id", "videoId"], publicId || createdAt),
    publicId,
    title,
    description: firstString(source, ["description"], ""),
    thumbnailUrl: firstNullableString(source, ["thumbnailUrl", "thumbnail_url", "thumbUrl"]),
    duration: typeof source.duration === "number" ? source.duration : null,
    viewsCount: firstNumber(source, ["viewsCount", "viewCount", "views"], 0),
    commentsCount: firstNumber(source, ["commentsCount", "commentCount"], 0),
    likesCount: firstNumber(source, ["likesCount", "likeCount"], 0),
    dislikesCount: firstNumber(source, ["dislikesCount", "dislikeCount"], 0),
    viewerReaction: normalizeReaction(source.viewerReaction ?? source.reaction),
    status: firstString(source, ["status"], "draft"),
    visibility: firstString(source, ["visibility"], "private"),
    publishedAt: firstNullableString(source, ["publishedAt", "published_at"]),
    createdAt,
    updatedAt: firstString(source, ["updatedAt", "updated_at"], createdAt),
    channel: normalizeChannel(
      Object.keys(channelSource).length > 0
        ? channelSource
        : {
            id: source.channelId,
            nickname: source.channelNickname,
            name: source.channelName,
            avatarUrl: source.channelAvatarUrl,
          }
    ),
    category,
  };
}

export function normalizeVideoDetail(value: unknown): VideoDetail {
  const video = normalizeVideoSummary(value);
  const source = asRecord(value);

  return {
    ...video,
    streamUrl: firstString(source, ["streamUrl"], `/api/videos/${video.publicId}/stream`),
    downloadUrl: firstString(source, ["downloadUrl"], `/api/videos/${video.publicId}/download`),
    isPublished: pickBoolean(source.isPublished, Boolean(video.publishedAt)),
  };
}

function normalizeAuthor(value: unknown): CommentAuthor {
  const source = asRecord(value);
  const nickname = firstString(source, ["nickname", "slug"], "user");
  const name = firstString(source, ["name", "displayName"], nickname);

  return {
    id: firstString(source, ["id", "userId"], nickname),
    name,
    nickname,
    avatarUrl: firstNullableString(source, ["avatarUrl", "avatar_url"]),
  };
}

export function normalizeComment(value: unknown): CommentItem {
  const source = asRecord(value);
  const replies = pickArray(source.replies ?? source.children).map(normalizeComment).slice(0, 2);

  return {
    id: firstString(source, ["id", "commentId"], crypto.randomUUID()),
    content: firstString(source, ["content", "text", "body"], ""),
    createdAt: firstString(source, ["createdAt", "created_at"], new Date(0).toISOString()),
    likesCount: firstNumber(source, ["likesCount", "likeCount"], 0),
    dislikesCount: firstNumber(source, ["dislikesCount", "dislikeCount"], 0),
    viewerReaction: normalizeReaction(source.viewerReaction ?? source.reaction),
    author: normalizeAuthor(source.author ?? source.user),
    replies,
  };
}

export function normalizeCategories(value: unknown): Category[] {
  return pickArray(value).map(normalizeCategory).filter((item): item is Category => item !== null);
}

export function normalizeVideoList(value: unknown): VideoSummary[] {
  return pickArray(value).map(normalizeVideoSummary);
}

export function normalizeCommentList(value: unknown): CommentItem[] {
  return pickArray(value).map(normalizeComment);
}

export function normalizePagedVideos(value: unknown, page: number, limit: number): PagedVideos {
  const source = asRecord(value);
  const items = normalizeVideoList(source.items ?? source.data ?? source.videos ?? value);
  const currentPage = firstNumber(source, ["page", "currentPage"], page);
  const currentLimit = firstNumber(source, ["limit", "perPage"], limit);
  const total = firstNumber(source, ["total", "totalItems"], items.length);

  return {
    items,
    page: currentPage,
    limit: currentLimit,
    hasMore:
      firstBoolean(source, ["hasMore", "hasNextPage"], false) ||
      currentPage * currentLimit < total,
  };
}

export function normalizeSubscriptions(value: unknown): ChannelSummary[] {
  return pickArray(value).map(normalizeChannel);
}

export function unwrapCollection(value: unknown): unknown {
  const source = asRecord(value);
  return source.items ?? source.data ?? source.results ?? source.videos ?? source.categories ?? value;
}

export function getMessage(error: unknown, fallback: string): string {
  const source = asRecord(error);
  if (typeof source.message === "string" && source.message.length > 0) {
    return source.message;
  }
  if (Array.isArray(source.message) && source.message.length > 0) {
    const first = source.message[0];
    if (typeof first === "string") {
      return first;
    }
  }
  return fallback;
}

export function compactText(value: unknown, fallback = ""): string {
  return pickString(value, fallback).trim();
}
