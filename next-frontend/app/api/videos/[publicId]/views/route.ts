import { proxyUpstream, responseFromUpstream } from "@/lib/api/proxy";

export async function POST(
  _request: Request,
  context: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await context.params;
  const response = await proxyUpstream(`/videos/${publicId}/views`, {
    method: "POST",
  });

  return responseFromUpstream(response, null);
}
