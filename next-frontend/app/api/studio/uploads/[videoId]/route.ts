import { responseFromUpstream } from "@/lib/api/proxy";
import { proxyUpstream } from "@/lib/api/proxy";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await context.params;
  const response = await proxyUpstream(`/videos/uploads/${videoId}`, {
    method: "DELETE",
    auth: true,
  });

  return responseFromUpstream(response, null);
}
