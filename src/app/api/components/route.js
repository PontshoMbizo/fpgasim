import { promises as fs } from "fs";
import path from "path";

const COMPONENTS_PATH = path.join(process.cwd(), "src", "data", "components.json");

export async function GET() {
  const raw = await fs.readFile(COMPONENTS_PATH, "utf8");
  return Response.json(JSON.parse(raw));
}

export async function POST(request) {
  // Dev-only authoring endpoint for the pin mapper tool.
  if (process.env.NODE_ENV === "production") {
    return new Response("Disabled in production", { status: 403 });
  }

  const components = await request.json();
  if (!Array.isArray(components)) {
    return new Response("Expected an array of components", { status: 400 });
  }

  await fs.writeFile(COMPONENTS_PATH, JSON.stringify(components, null, 2) + "\n", "utf8");
  return Response.json({ ok: true, count: components.length });
}
