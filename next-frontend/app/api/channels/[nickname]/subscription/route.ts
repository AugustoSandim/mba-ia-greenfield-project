import { proxyUpstream, responseFromUpstream } from "@/lib/api/proxy";

export async function POST(
  _request: Request,
  context: { params: Promise<{ nickname: string }> }
) {
  const { nickname } = await context.params;
  const response = await proxyUpstream(`/channels/${nickname}/subscribe`, {
    method: "POST",
    auth: true,
  });

  return responseFromUpstream(response, null);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ nickname: string }> }
) {
  const { nickname } = await context.params;
  const response = await proxyUpstream(`/channels/${nickname}/subscribe`, {
    method: "DELETE",
    auth: true,
  });

  return responseFromUpstream(response, null);
}
