import { createReadStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";

export class FilesystemAssets {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async get(key: string) {
    const path = this.pathFor(key);
    try {
      const details = await stat(path);
      if (!details.isFile()) return null;
      const contentType = contentTypeFor(path);

      return {
        body: Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>,
        httpEtag: `"${details.size.toString(16)}-${Math.floor(details.mtimeMs).toString(16)}"`,
        writeHttpMetadata(headers: Headers) {
          headers.set("Content-Type", contentType);
        }
      };
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async put(key: string, value: ArrayBuffer | ArrayBufferView) {
    const path = this.pathFor(key);
    const temporary = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });

    try {
      const bytes =
        value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o640 });
      await rename(temporary, path);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }

    return { key };
  }

  private pathFor(key: string) {
    const normalized = String(key || "").replaceAll("\\", "/");
    if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("Invalid asset key.");
    }

    const path = resolve(this.root, ...normalized.split("/"));
    const fromRoot = relative(this.root, path);
    if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === ".." || isAbsolute(fromRoot)) {
      throw new Error("Asset key escaped the configured storage root.");
    }
    return path;
  }
}

function contentTypeFor(path: string) {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function isMissingFile(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
