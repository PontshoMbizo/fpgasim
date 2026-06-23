import { promises as fs } from "fs";
import path from "path";

const PINS_PATH = path.join(process.cwd(), "src", "data", "pins.json");

export async function GET() {
  const raw = await fs.readFile(PINS_PATH, "utf8");
  return Response.json(JSON.parse(raw));
}

export async function POST(request) {
  // Dev-only authoring endpoint for the pin mapper tool.
  if (process.env.NODE_ENV === "production") {
    return new Response("Disabled in production", { status: 403 });
  }

  const pins = await request.json();
  if (!Array.isArray(pins)) {
    return new Response("Expected an array of pins", { status: 400 });
  }

  await fs.writeFile(PINS_PATH, JSON.stringify(pins, null, 2) + "\n", "utf8");
  return Response.json({ ok: true, count: pins.length });
}
