export async function POST() {
  return new Response(
    JSON.stringify({ error: "Public transporter registration is disabled by business rules." }),
    { status: 403, headers: { "content-type": "application/json" } }
  );
}
