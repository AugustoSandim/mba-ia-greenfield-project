import { jsonFromResponse, proxyUpstream, responseFromUpstream } from "@/lib/api/proxy";

type ThumbnailBody = {
  contentType?: string;
  mimeType?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await context.params;
  const raw = (await request.json()) as ThumbnailBody;
  const response = await proxyUpstream(`/videos/${videoId}/thumbnail/presign`, {
    method: "POST",
    auth: true,
    body: {
      mimeType: raw.mimeType ?? raw.contentType ?? "image/jpeg",
    },
  });

  const payload = (await jsonFromResponse(response)) as Record<string, unknown> | null;
  const mapped = payload
    ? {
        uploadUrl: payload.presignedUrl ?? payload.uploadUrl,
        thumbnailUrl: payload.thumbnailUrl ?? null,
      }
    : null;

  return responseFromUpstream(response, JSON.stringify(mapped));
}
