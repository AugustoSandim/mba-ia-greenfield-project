import { jsonFromResponse, proxyUpstream, responseFromUpstream } from "@/lib/api/proxy";

export async function POST(
  request: Request,
  context: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await context.params;
  const body = (await request.json()) as unknown;
  const response = await proxyUpstream(`/videos/${videoId}/thumbnail/presign`, {
    method: "POST",
    auth: true,
    body,
  });

  return responseFromUpstream(response, JSON.stringify(await jsonFromResponse(response)));
}
