import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getEmployee, setEmployeePhoto } from "@/lib/employees";
import { sanitizeId } from "@/lib/sanitize";
import { guardApi } from "@/lib/security";

type Ctx = { params: Promise<{ id: string }> };

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest, context: Ctx) {
  const auth = await guardApi(request, { mutate: true, limit: 20 });
  if ("error" in auth) return auth.error;

  const { id: rawId } = await context.params;
  const id = sanitizeId(rawId);
  if (!id.ok) {
    return NextResponse.json({ error: id.error }, { status: 400 });
  }

  const existing = await getEmployee(id.value);
  if (!existing) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const contentType = (request.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  // Prefer raw image body (avoids multipart/boundary parse failures).
  // Still accept multipart field "photo" for older clients.
  let mime = contentType;
  let buffer: Buffer;

  if (ALLOWED.has(contentType)) {
    buffer = Buffer.from(await request.arrayBuffer());
  } else if (contentType.startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid multipart body. Send the image as the raw request body with Content-Type set to the image MIME type.",
        },
        { status: 400 },
      );
    }
    const file = form.get("photo");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Expected multipart field "photo"' },
        { status: 400 },
      );
    }
    mime = file.type;
    buffer = Buffer.from(await file.arrayBuffer());
  } else {
    return NextResponse.json(
      {
        error:
          "Send an image body with Content-Type image/jpeg, image/png, image/webp, or image/gif",
      },
      { status: 400 },
    );
  }

  if (!ALLOWED.has(mime)) {
    return NextResponse.json(
      { error: "Photo must be jpeg, png, webp, or gif" },
      { status: 400 },
    );
  }

  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty photo body" }, { status: 400 });
  }

  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "Photo must be 2MB or smaller" },
      { status: 400 },
    );
  }

  const ext = mime.split("/")[1] === "jpeg" ? "jpg" : mime.split("/")[1];
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  // Filename uses sanitized id only — never raw user path segments
  const filename = `${id.value}-${Date.now()}.${ext}`;
  await fs.writeFile(path.join(uploadsDir, filename), buffer);

  const photoUrl = `/uploads/${filename}`;
  const employee = await setEmployeePhoto(id.value, photoUrl);

  return NextResponse.json({ employee });
}
