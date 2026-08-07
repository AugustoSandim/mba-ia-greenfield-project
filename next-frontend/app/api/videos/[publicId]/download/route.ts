import { proxyUpstream, responseFromUpstream } from "@/lib/api/proxy";

export async function GET(
  _request: Request,
  context: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await context.params;
  const response = await proxyUpstream(`/videos/${publicId}/download`);

  return responseFromUpstream(response);
}
