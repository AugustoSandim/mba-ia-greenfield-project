import { http, HttpResponse } from "msw";

import { env } from "@/lib/env";

type Category = {
  id: string;
  name: string;
  slug: string;
};

type Channel = {
  id: string;
  name: string;
  nickname: string;
  description: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  subscribersCount: number;
  videosCount: number;
  isSubscribed?: boolean;
};

type Video = {
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
  channel: Channel;
  category: Category | null;
};

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  likesCount: number;
  dislikesCount: number;
  viewerReaction: "like" | "dislike" | "none";
  author: {
    id: string;
    name: string;
    nickname: string;
    avatarUrl: string | null;
  };
  replies: Comment[];
};

const now = "2026-08-07T20:00:00.000Z";

const categories: Category[] = [
  { id: "cat-music", name: "Music", slug: "music" },
  { id: "cat-tech", name: "Technology", slug: "technology" },
  { id: "cat-gaming", name: "Gaming", slug: "gaming" },
];

const myChannel: Channel = {
  id: "channel-me",
  name: "Augusto Studio",
  nickname: "augusto",
  description: "Weekly engineering notes and product demos.",
  avatarUrl: null,
  bannerUrl: null,
  subscribersCount: 248,
  videosCount: 2,
};

const channels = new Map<string, Channel>([
  [myChannel.nickname, myChannel],
  [
    "lofi-lab",
    {
      id: "channel-lofi",
      name: "Lofi Lab",
      nickname: "lofi-lab",
      description: "Live coding and chill background tracks.",
      avatarUrl: null,
      bannerUrl: null,
      subscribersCount: 1880,
      videosCount: 2,
      isSubscribed: true,
    },
  ],
  [
    "pixel-racers",
    {
      id: "channel-pixel",
      name: "Pixel Racers",
      nickname: "pixel-racers",
      description: "Speedrun breakdowns and indie racing coverage.",
      avatarUrl: null,
      bannerUrl: null,
      subscribersCount: 912,
      videosCount: 1,
      isSubscribed: false,
    },
  ],
]);

const videos = new Map<string, Video>([
  [
    "vid-1",
    {
      id: "vid-1",
      publicId: "streamtube-home-1",
      title: "Building a StreamTube upload pipeline",
      description: "A guided tour through presigned multipart uploads and status transitions.",
      thumbnailUrl: null,
      duration: 602,
      viewsCount: 1823,
      commentsCount: 3,
      likesCount: 158,
      dislikesCount: 4,
      viewerReaction: "like",
      status: "ready",
      visibility: "public",
      publishedAt: "2026-08-02T14:30:00.000Z",
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-02T14:30:00.000Z",
      channel: myChannel,
      category: categories[1],
    },
  ],
  [
    "vid-2",
    {
      id: "vid-2",
      publicId: "lofi-live-set",
      title: "Lofi coding session",
      description: "Quiet music and a steady stream of TypeScript refactors.",
      thumbnailUrl: null,
      duration: 4512,
      viewsCount: 8421,
      commentsCount: 1,
      likesCount: 624,
      dislikesCount: 7,
      viewerReaction: "none",
      status: "ready",
      visibility: "public",
      publishedAt: "2026-08-03T17:15:00.000Z",
      createdAt: "2026-08-03T15:00:00.000Z",
      updatedAt: "2026-08-03T17:15:00.000Z",
      channel: channels.get("lofi-lab")!,
      category: categories[0],
    },
  ],
  [
    "vid-3",
    {
      id: "vid-3",
      publicId: "pixel-racers-weekly",
      title: "Weekly indie racing roundup",
      description: "Patch notes, lap times, and highlights from the week.",
      thumbnailUrl: null,
      duration: 935,
      viewsCount: 398,
      commentsCount: 0,
      likesCount: 40,
      dislikesCount: 2,
      viewerReaction: "dislike",
      status: "ready",
      visibility: "public",
      publishedAt: "2026-08-04T09:45:00.000Z",
      createdAt: "2026-08-04T08:30:00.000Z",
      updatedAt: "2026-08-04T09:45:00.000Z",
      channel: channels.get("pixel-racers")!,
      category: categories[2],
    },
  ],
  [
    "vid-4",
    {
      id: "vid-4",
      publicId: "draft-video",
      title: "Draft roadmap video",
      description: "Private planning draft for the next release.",
      thumbnailUrl: null,
      duration: null,
      viewsCount: 0,
      commentsCount: 0,
      likesCount: 0,
      dislikesCount: 0,
      viewerReaction: "none",
      status: "draft",
      visibility: "private",
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
      channel: myChannel,
      category: categories[1],
    },
  ],
]);

const commentsByVideo = new Map<string, Comment[]>([
  [
    "streamtube-home-1",
    [
      {
        id: "comment-1",
        content: "This upload flow breakdown was exactly what I needed.",
        createdAt: "2026-08-05T10:00:00.000Z",
        likesCount: 12,
        dislikesCount: 0,
        viewerReaction: "none",
        author: {
          id: "user-1",
          name: "Marina",
          nickname: "marina-dev",
          avatarUrl: null,
        },
        replies: [
          {
            id: "comment-2",
            content: "Same here. The status transitions were especially helpful.",
            createdAt: "2026-08-05T10:12:00.000Z",
            likesCount: 4,
            dislikesCount: 0,
            viewerReaction: "none",
            author: {
              id: "user-2",
              name: "Pedro",
              nickname: "pedro-fullstack",
              avatarUrl: null,
            },
            replies: [],
          },
        ],
      },
    ],
  ],
]);

const subscriptions = new Set<string>(["lofi-lab"]);

function listVideos() {
  return Array.from(videos.values());
}

function getVideoByPublicId(publicId: string) {
  return listVideos().find((video) => video.publicId === publicId);
}

function applyChannelDerivedFields(channel: Channel) {
  return {
    ...channel,
    videosCount: listVideos().filter((video) => video.channel.nickname === channel.nickname).length,
    subscribersCount:
      channel.nickname === "lofi-lab"
        ? 1880 + Number(subscriptions.has("lofi-lab"))
        : channel.nickname === "pixel-racers"
          ? 912 + Number(subscriptions.has("pixel-racers"))
          : channel.subscribersCount,
    isSubscribed: subscriptions.has(channel.nickname),
  };
}

function filterFeed(url: URL) {
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "12");
  const category = url.searchParams.get("category");
  const query = (url.searchParams.get("q") ?? "").toLowerCase();

  const filtered = listVideos()
    .filter((video) => video.visibility === "public")
    .filter((video) => (category ? video.category?.slug === category : true))
    .filter((video) => {
      if (!query) {
        return true;
      }
      return `${video.title} ${video.description} ${video.channel.name}`.toLowerCase().includes(query);
    });

  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);

  return {
    items,
    page,
    limit,
    total: filtered.length,
    hasMore: start + limit < filtered.length,
  };
}

export const handlers = [
  http.get(`${env.API_URL}/auth/me`, () => {
    return HttpResponse.json({
      sub: "user-fixture-id",
      email: "alice@example.com",
      channelSlug: myChannel.nickname,
    });
  }),

  http.get(`${env.API_URL}/categories`, () => {
    return HttpResponse.json(categories);
  }),

  http.get(`${env.API_URL}/videos`, ({ request }) => {
    return HttpResponse.json(filterFeed(new URL(request.url)));
  }),

  http.get(`${env.API_URL}/videos/:publicId`, ({ params }) => {
    const video = getVideoByPublicId(String(params.publicId));
    if (!video) {
      return HttpResponse.json({ message: "Video not found" }, { status: 404 });
    }

    return HttpResponse.json({
      ...video,
      streamUrl: `/api/videos/${video.publicId}/stream`,
      downloadUrl: `/api/videos/${video.publicId}/download`,
      isPublished: Boolean(video.publishedAt),
    });
  }),

  http.get(`${env.API_URL}/videos/:publicId/related`, ({ params }) => {
    const current = getVideoByPublicId(String(params.publicId));
    const related = listVideos()
      .filter((video) => video.publicId !== current?.publicId && video.visibility === "public")
      .slice(0, 4);
    return HttpResponse.json(related);
  }),

  http.get(`${env.API_URL}/videos/:publicId/comments`, ({ params }) => {
    return HttpResponse.json(commentsByVideo.get(String(params.publicId)) ?? []);
  }),

  http.post(`${env.API_URL}/videos/:publicId/comments`, async ({ params, request }) => {
    const publicId = String(params.publicId);
    const body = (await request.json()) as {
      content?: string;
      body?: string;
      parentId?: string | null;
    };
    const text = body.content?.trim() || body.body?.trim() || "";
    const nextComment: Comment = {
      id: `comment-${Date.now()}`,
      content: text,
      createdAt: now,
      likesCount: 0,
      dislikesCount: 0,
      viewerReaction: "none",
      author: {
        id: "user-fixture-id",
        name: "Alice",
        nickname: "augusto",
        avatarUrl: null,
      },
      replies: [],
    };

    const current = commentsByVideo.get(publicId) ?? [];
    if (body.parentId) {
      commentsByVideo.set(
        publicId,
        current.map((comment) =>
          comment.id === body.parentId
            ? { ...comment, replies: [...comment.replies, nextComment] }
            : comment
        )
      );
    } else {
      commentsByVideo.set(publicId, [nextComment, ...current]);
    }

    return HttpResponse.json(nextComment, { status: 201 });
  }),

  http.post(`${env.API_URL}/comments/:commentId/replies`, async ({ request }) => {
    const body = (await request.json()) as { content?: string; body?: string };
    const text = body.content?.trim() || body.body?.trim() || "";
    return HttpResponse.json(
      {
        id: `reply-${Date.now()}`,
        content: text,
        createdAt: now,
        likesCount: 0,
        dislikesCount: 0,
        viewerReaction: "none",
        author: {
          id: "user-fixture-id",
          name: "Alice",
          nickname: "augusto",
          avatarUrl: null,
        },
        replies: [],
      },
      { status: 201 }
    );
  }),

  http.post(`${env.API_URL}/videos/:publicId/like`, async ({ params, request }) => {
    const video = getVideoByPublicId(String(params.publicId));
    if (!video) {
      return HttpResponse.json({ message: "Video not found" }, { status: 404 });
    }

    const body = (await request.json()) as { value?: 1 | -1 | "like" | "dislike" | "none" };
    const previous = video.viewerReaction;
    const next =
      body.value === 1 || body.value === "like"
        ? "like"
        : body.value === -1 || body.value === "dislike"
          ? "dislike"
          : "none";

    if (previous === "like") {
      video.likesCount -= 1;
    }
    if (previous === "dislike") {
      video.dislikesCount -= 1;
    }
    if (next === "like") {
      video.likesCount += 1;
    }
    if (next === "dislike") {
      video.dislikesCount += 1;
    }

    video.viewerReaction = next;
    return HttpResponse.json(video);
  }),

  http.post(`${env.API_URL}/videos/:publicId/views`, ({ params }) => {
    const video = getVideoByPublicId(String(params.publicId));
    if (video) {
      video.viewsCount += 1;
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${env.API_URL}/channels/me`, () => {
    return HttpResponse.json(applyChannelDerivedFields(myChannel));
  }),

  http.patch(`${env.API_URL}/channels/me`, async ({ request }) => {
    const body = (await request.json()) as Partial<Channel>;
    Object.assign(myChannel, {
      name: body.name ?? myChannel.name,
      description: body.description ?? myChannel.description,
      bannerUrl: body.bannerUrl ?? myChannel.bannerUrl,
      avatarUrl: body.avatarUrl ?? myChannel.avatarUrl,
    });
    return HttpResponse.json(applyChannelDerivedFields(myChannel));
  }),

  http.get(`${env.API_URL}/channels/me/videos`, () => {
    return HttpResponse.json(
      listVideos().filter((video) => video.channel.nickname === myChannel.nickname)
    );
  }),

  http.get(`${env.API_URL}/channels/me/subscriptions`, () => {
    return HttpResponse.json(
      Array.from(subscriptions).map((nickname) => applyChannelDerivedFields(channels.get(nickname)!))
    );
  }),

  http.get(`${env.API_URL}/channels/:nickname`, ({ params }) => {
    const channel = channels.get(String(params.nickname));
    if (!channel) {
      return HttpResponse.json({ message: "Channel not found" }, { status: 404 });
    }

    return HttpResponse.json({
      channel: applyChannelDerivedFields(channel),
      videos: listVideos().filter(
        (video) =>
          video.channel.nickname === channel.nickname &&
          (channel.nickname === myChannel.nickname || video.visibility === "public")
      ),
    });
  }),

  http.post(`${env.API_URL}/channels/:nickname/subscribe`, ({ params }) => {
    subscriptions.add(String(params.nickname));
    return new HttpResponse(null, { status: 204 });
  }),

  http.delete(`${env.API_URL}/channels/:nickname/subscribe`, ({ params }) => {
    subscriptions.delete(String(params.nickname));
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${env.API_URL}/videos/uploads`, async ({ request }) => {
    const body = (await request.json()) as { title?: string; categoryId?: string };
    const id = `vid-upload-${Date.now()}`;
    const publicId = `upload-${Date.now()}`;
    const category = categories.find((item) => item.id === body.categoryId) ?? categories[1];
    const draft: Video = {
      id,
      publicId,
      title: body.title?.trim() || "Untitled upload",
      description: "",
      thumbnailUrl: null,
      duration: null,
      viewsCount: 0,
      commentsCount: 0,
      likesCount: 0,
      dislikesCount: 0,
      viewerReaction: "none",
      status: "draft",
      visibility: "private",
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
      channel: myChannel,
      category,
    };
    videos.set(id, draft);
    return HttpResponse.json(
      {
        videoId: id,
        publicId,
        uploadId: `upload-id-${Date.now()}`,
        key: `videos/${id}/original`,
        status: draft.status,
      },
      { status: 201 }
    );
  }),

  http.post(`${env.API_URL}/videos/uploads/:videoId/parts`, async ({ params, request }) => {
    const body = (await request.json()) as { partNumber?: number };
    return HttpResponse.json({
      presignedUrl: `https://example.test/upload/${params.videoId}/${body.partNumber ?? 1}`,
    });
  }),

  http.post(`${env.API_URL}/videos/uploads/:videoId/complete`, ({ params }) => {
    const video = videos.get(String(params.videoId));
    if (video) {
      video.status = "queued";
      video.updatedAt = now;
    }
    return HttpResponse.json({ videoId: params.videoId, status: "queued" });
  }),

  http.delete(`${env.API_URL}/videos/uploads/:videoId`, ({ params }) => {
    videos.delete(String(params.videoId));
    return new HttpResponse(null, { status: 204 });
  }),

  http.patch(`${env.API_URL}/videos/:videoId`, async ({ params, request }) => {
    const video = videos.get(String(params.videoId));
    if (!video) {
      return HttpResponse.json({ message: "Video not found" }, { status: 404 });
    }
    const body = (await request.json()) as Partial<Video>;
    Object.assign(video, {
      title: typeof body.title === "string" ? body.title : video.title,
      description: typeof body.description === "string" ? body.description : video.description,
      visibility: typeof body.visibility === "string" ? body.visibility : video.visibility,
      category:
        typeof body.category === "object" && body.category
          ? (body.category as Category)
          : video.category,
      updatedAt: now,
    });
    return HttpResponse.json(video);
  }),

  http.post(`${env.API_URL}/videos/:videoId/publish`, ({ params }) => {
    const video = videos.get(String(params.videoId));
    if (video) {
      video.visibility = "public";
      video.status = "ready";
      video.publishedAt = now;
      video.updatedAt = now;
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${env.API_URL}/videos/:videoId/unpublish`, ({ params }) => {
    const video = videos.get(String(params.videoId));
    if (video) {
      video.visibility = "private";
      video.publishedAt = null;
      video.updatedAt = now;
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${env.API_URL}/videos/:videoId/thumbnail/presign`, ({ params }) => {
    return HttpResponse.json({
      uploadUrl: `https://example.test/thumbnail/${params.videoId}`,
      thumbnailUrl: `https://cdn.example.test/thumbnails/${params.videoId}.jpg`,
    });
  }),

  http.get(`${env.API_URL}/videos/:publicId/stream`, () => {
    return new HttpResponse("streamtube", {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
      },
    });
  }),

  http.get(`${env.API_URL}/videos/:publicId/download`, ({ params }) => {
    return new HttpResponse(`download-${params.publicId}`, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${params.publicId}.mp4"`,
      },
    });
  }),
];
