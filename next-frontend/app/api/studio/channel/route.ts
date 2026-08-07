import { jsonFromResponse, proxyUpstream, responseFromUpstream } from "@/lib/api/proxy";

export async function PATCH(request: Request) {
  const body = (await request.json()) as unknown;
  const response = await proxyUpstream("/channels/me", {
    method: "PATCH",
    auth: true,
    body,
  });

  return responseFromUpstream(response, JSON.stringify(await jsonFromResponse(response)));
}
