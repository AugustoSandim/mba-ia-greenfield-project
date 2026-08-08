import {
  jsonFromResponse,
  proxyUpstream,
  responseFromUpstream,
} from "@/lib/api/proxy";

type ReactionValue = "like" | "dislike" | "none";

function toLikeValue(value: ReactionValue): 1 | -1 | null {
  if (value === "like") {
    return 1;
  }
  if (value === "dislike") {
    return -1;
  }
  return null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await context.params;
  const body = (await request.json()) as { value?: ReactionValue };
  const reaction = body.value ?? "none";
  const likeValue = toLikeValue(reaction);

  if (likeValue === null) {
    await proxyUpstream(`/videos/${publicId}/like`, {
      method: "DELETE",
      auth: true,
    });
  } else {
    const likeResponse = await proxyUpstream(`/videos/${publicId}/like`, {
      method: "POST",
      auth: true,
      body: { value: likeValue },
    });

    if (!likeResponse.ok) {
      return responseFromUpstream(likeResponse, JSON.stringify(await jsonFromResponse(likeResponse)));
    }
  }

  const metadataResponse = await proxyUpstream(`/videos/${publicId}`, {
    auth: true,
  });

  return responseFromUpstream(
    metadataResponse,
    JSON.stringify(await jsonFromResponse(metadataResponse))
  );
}
