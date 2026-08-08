import { jsonFromResponse, proxyUpstream, responseFromUpstream } from "@/lib/api/proxy";

type CompletePart = {
  ETag?: string;
  etag?: string;
  PartNumber?: number;
  partNumber?: number;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await context.params;
  const raw = (await request.json()) as { parts?: CompletePart[] };
  const response = await proxyUpstream(`/videos/uploads/${videoId}/complete`, {
    method: "POST",
    auth: true,
    body: {
      parts: (raw.parts ?? []).map((part) => ({
        partNumber: part.PartNumber ?? part.partNumber ?? 1,
        etag: part.ETag ?? part.etag ?? "",
      })),
    },
  });

  return responseFromUpstream(response, JSON.stringify(await jsonFromResponse(response)));
}
