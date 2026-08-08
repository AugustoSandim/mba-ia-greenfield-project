import { jsonFromResponse, proxyUpstream, responseFromUpstream } from "@/lib/api/proxy";

type UploadStartBody = {
  fileName?: string;
  filename?: string;
  contentType?: string;
  mimeType?: string;
  fileSize?: number;
  size?: number;
};

export async function POST(request: Request) {
  const raw = (await request.json()) as UploadStartBody;
  const response = await proxyUpstream("/videos/uploads", {
    method: "POST",
    auth: true,
    body: {
      filename: raw.fileName ?? raw.filename ?? "upload.mp4",
      mimeType: raw.contentType ?? raw.mimeType ?? "video/mp4",
      size: raw.fileSize ?? raw.size ?? 1,
    },
  });

  return responseFromUpstream(response, JSON.stringify(await jsonFromResponse(response)));
}
