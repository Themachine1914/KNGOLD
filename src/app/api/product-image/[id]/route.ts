import { getProductImage } from "@/lib/product-image-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const image = await getProductImage(id);
    if (!image) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(new Uint8Array(image.buffer), {
      status: 200,
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new Response("Error", { status: 500 });
  }
}
