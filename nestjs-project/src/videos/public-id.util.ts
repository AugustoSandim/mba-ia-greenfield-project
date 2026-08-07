import { nanoid } from 'nanoid';

/** Generates a URL-safe public id (nanoid, length 21). */
export function generatePublicId(): string {
  return nanoid(21);
}
