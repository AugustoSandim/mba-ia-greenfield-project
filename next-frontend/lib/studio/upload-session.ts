export type CompletedUploadPart = {
  ETag: string;
  PartNumber: number;
};

export type UploadSession = {
  videoId: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  fileLastModified: number;
  contentType: string;
  title: string;
  description: string;
  categoryId: string;
  completedParts: CompletedUploadPart[];
  updatedAt: string;
};

const STORAGE_KEY = "streamtube-upload-session";

export function buildFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function loadUploadSession(): UploadSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as UploadSession;
  } catch {
    return null;
  }
}

export function saveUploadSession(session: UploadSession): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...session, updatedAt: new Date().toISOString() })
  );
}

export function clearUploadSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function findResumableSession(file: File): UploadSession | null {
  const session = loadUploadSession();
  if (!session) {
    return null;
  }
  return session.fileKey === buildFileKey(file) ? session : null;
}

export function nextPartNumbers(
  totalParts: number,
  completedParts: CompletedUploadPart[]
): number[] {
  const done = new Set(completedParts.map((part) => part.PartNumber));
  return Array.from({ length: totalParts }, (_, index) => index + 1).filter(
    (partNumber) => !done.has(partNumber)
  );
}
