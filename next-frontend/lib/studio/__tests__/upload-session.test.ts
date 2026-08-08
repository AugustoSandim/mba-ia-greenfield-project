import { describe, expect, it } from "vitest";

import {
  buildFileKey,
  nextPartNumbers,
  type CompletedUploadPart,
} from "../upload-session";

describe("upload-session", () => {
  it("builds a stable file key from file metadata", () => {
    const file = {
      name: "clip.mp4",
      size: 1024,
      lastModified: 42,
    } as File;

    expect(buildFileKey(file)).toBe("clip.mp4:1024:42");
  });

  it("returns only missing part numbers for resume", () => {
    const completed: CompletedUploadPart[] = [
      { ETag: "a", PartNumber: 1 },
      { ETag: "b", PartNumber: 2 },
    ];

    expect(nextPartNumbers(4, completed)).toEqual([3, 4]);
  });
});
