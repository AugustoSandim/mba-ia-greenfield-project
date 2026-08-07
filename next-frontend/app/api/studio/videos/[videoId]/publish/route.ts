import { proxyUpstream, responseFromUpstream } from "@/lib/api/proxy";

export async function POST(
  _request: Request,
  context: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await context.params;
  const response = await proxyUpstream(`/videos/${videoId}/publish`, {
    method: "POST",
    auth: true,
  });

  return responseFromUpstream(response, null);
}
