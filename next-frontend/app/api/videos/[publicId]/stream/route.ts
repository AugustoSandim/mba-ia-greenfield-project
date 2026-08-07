import { proxyUpstream, responseFromUpstream } from "@/lib/api/proxy";

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await context.params;
  const range = request.headers.get("range");
  const response = await proxyUpstream(`/videos/${publicId}/stream`, {
    headers: range ? { Range: range } : undefined,
  });

  return responseFromUpstream(response);
}
