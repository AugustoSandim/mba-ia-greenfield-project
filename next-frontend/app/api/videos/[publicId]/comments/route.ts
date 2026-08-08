import { jsonFromResponse, proxyUpstream, responseFromUpstream } from "@/lib/api/proxy";

type CommentBody = {
  content?: string;
  body?: string;
  parentId?: string | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await context.params;
  const response = await proxyUpstream(`/videos/${publicId}/comments`);
  const payload = await jsonFromResponse(response);

  return responseFromUpstream(response, JSON.stringify(payload));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await context.params;
  const body = (await request.json()) as CommentBody;
  const text = body.content ?? body.body ?? "";
  const upstreamBody = { body: text };

  const response = body.parentId
    ? await proxyUpstream(`/comments/${body.parentId}/replies`, {
        method: "POST",
        auth: true,
        body: upstreamBody,
      })
    : await proxyUpstream(`/videos/${publicId}/comments`, {
        method: "POST",
        auth: true,
        body: upstreamBody,
      });

  return responseFromUpstream(response, JSON.stringify(await jsonFromResponse(response)));
}
