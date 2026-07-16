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

  const form = await request.formData();
  const file = form.get("photo");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Expected multipart field "photo"' },
      { status: 400 },
    );
  }

  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Photo must be jpeg, png, webp, or gif" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Photo must be 2MB or smaller" },
      { status: 400 },
    );
  }

  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  // Filename uses sanitized id only — never raw user path segments
  const filename = `${id.value}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(uploadsDir, filename), buffer);

  const photoUrl = `/uploads/${filename}`;
  const employee = await setEmployeePhoto(id.value, photoUrl);

  return NextResponse.json({ employee });
}
