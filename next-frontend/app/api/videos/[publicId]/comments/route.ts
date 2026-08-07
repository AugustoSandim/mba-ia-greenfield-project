import { jsonFromResponse, proxyUpstream, responseFromUpstream } from "@/lib/api/proxy";

export async function GET(
  _request: Request,
  context: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await context.params;
  const response = await proxyUpstream(`/videos/${publicId}/comments`);

  return responseFromUpstream(response, JSON.stringify(await jsonFromResponse(response)));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await context.params;
  const body = (await request.json()) as unknown;
  const response = await proxyUpstream(`/videos/${publicId}/comments`, {
    method: "POST",
    auth: true,
    body,
  });

  return responseFromUpstream(response, JSON.stringify(await jsonFromResponse(response)));
}
