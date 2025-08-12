// fileanme: src/app/api/stash-graphql/route.ts
import { NextRequest } from "next/server";
import { getStashConfig } from "@/server/stashConfig";
export const runtime = "nodejs";
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const { graphqlUrl, apiKey } = await getStashConfig();

    const body = await req.text();

    const upstream = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body,
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    console.error("Stash GraphQL proxy error:", error);
    return new Response(JSON.stringify({ error: "Failed to connect to Stash server", details: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
