import { customAlphabet } from "nanoid";
import { PrismaClient } from "@prisma/client";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const RESERVED = new Set([
  "api",
  "www",
  "admin",
  "app",
  "raw",
  "go",
  "p",
  "i",
  "help",
  "docs",
  "terms",
  "privacy",
  "login",
  "signup",
  "pricing",
  "blog",
  "about",
  "contact",
  "support",
  "health",
]);

const gen = customAlphabet(ALPHABET, 6);

export async function generateShortId(
  prisma: PrismaClient,
  maxRetries = 5
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const id = gen();
    if (RESERVED.has(id.toLowerCase())) continue;

    const existing = await prisma.upload.findUnique({
      where: { shortId: id },
      select: { id: true },
    });
    if (!existing) return id;
  }
  throw new Error("Failed to generate unique shortId");
}
