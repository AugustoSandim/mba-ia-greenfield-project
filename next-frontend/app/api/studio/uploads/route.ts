import { jsonFromResponse, proxyUpstream, responseFromUpstream } from "@/lib/api/proxy";

export async function POST(request: Request) {
  const body = (await request.json()) as unknown;
  const response = await proxyUpstream("/videos/uploads", {
    method: "POST",
    auth: true,
    body,
  });

  return responseFromUpstream(response, JSON.stringify(await jsonFromResponse(response)));
}
