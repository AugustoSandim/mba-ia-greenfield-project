import { jsonFromResponse, proxyUpstream, responseFromUpstream } from "@/lib/api/proxy";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;
  const response = await proxyUpstream(`/videos/${videoId}`, {
    method: "PATCH",
    auth: true,
    body: {
      ...body,
      category: body.categoryId ? { id: body.categoryId } : undefined,
    },
  });

  return responseFromUpstream(response, JSON.stringify(await jsonFromResponse(response)));
}
