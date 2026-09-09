import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/velani")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();

        const secret = process.env["VELANI_WEBHOOK_SECRET"];
        if (secret) {
          const headerSecret =
            request.headers.get("x-webhook-secret") ?? request.headers.get("x-velani-signature");
          if (headerSecret !== secret) {
            let bodySignature: string | undefined;
            try {
              bodySignature = (JSON.parse(raw) as { signature?: string }).signature;
            } catch {
              bodySignature = undefined;
            }
            if (bodySignature !== secret) {
              return new Response("Invalid signature", { status: 401 });
            }
          }
        }

        let payload: { event?: string; data?: { id?: string; status?: string } } | null = null;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const txId = payload?.data?.id;
        const event = payload?.event ?? "";
        const status = String(payload?.data?.status ?? "").toLowerCase();

        if (
          txId &&
          (event === "transaction.paid" || ["paid", "approved", "completed"].includes(status))
        ) {
          const { activatePayment } = await import("@/lib/billing.server");
          await activatePayment(txId, payload);
        }

        return Response.json({ received: true });
      },
    },
  },
});
