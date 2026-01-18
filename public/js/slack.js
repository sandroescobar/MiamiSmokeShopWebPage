// utils/slack.js
// Sends order notifications to Slack via Incoming Webhook.
// Safe behavior: failures do NOT throw (checkout should still succeed).

function formatMoney(n) {
  const num = Number(n || 0);
  return `$${num.toFixed(2)}`;
}

function safeStr(v) {
  return (v === null || v === undefined) ? "" : String(v);
}

function pickTrackingUrl(obj) {
  // Tries common shapes you might return from Uber APIs
  return (
    obj?.tracking_url ||
    obj?.trackingUrl ||
    obj?.tracking?.url ||
    obj?.tracking?.href ||
    obj?.courier_tracking_url ||
    obj?.courierTrackingUrl ||
    obj?.delivery?.tracking_url ||
    obj?.delivery?.trackingUrl ||
    null
  );
}

function buildSlackPayload(order) {
  const {
    orderId,
    createdAt,
    customer,
    deliveryMethod,
    pickupStoreId,
    pickupStoreLabel,
    pickupStoreName,
    dropoffAddress,
    items,
    totals,
    uber, // optional
    receipt // optional
  } = order;

  const isDelivery =
    String(deliveryMethod || "").toLowerCase() === "delivery" ||
    String(deliveryMethod || "").toLowerCase() === "uber";

  const trackingUrl = pickTrackingUrl(uber) || pickTrackingUrl(receipt) || null;

  const customerName =
    [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") ||
    customer?.name ||
    "—";

  const email = customer?.email || "—";
  const phone = customer?.phone || customer?.phoneNumber || "—";

  const storeLine =
    pickupStoreLabel ||
    pickupStoreName ||
    pickupStoreId ||
    "—";

  const addressLine = isDelivery
    ? [
        dropoffAddress?.address || dropoffAddress?.street || "",
        dropoffAddress?.street2 || dropoffAddress?.unit || "",
        dropoffAddress?.city || "",
        dropoffAddress?.state || "",
        dropoffAddress?.zip || ""
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  const itemLines = (items || []).map((it) => {
    const qty = Number(it.quantity || 1);
    const price = Number(it.price || 0);
    const lineTotal = qty * price;
    return `• ${safeStr(it.name)}  ×${qty}  —  ${formatMoney(lineTotal)}`;
  });

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "✅ Successful Order", emoji: true }
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Order ID:*\n${safeStr(orderId || "—")}` },
        { type: "mrkdwn", text: `*When:*\n${safeStr(createdAt || new Date().toISOString())}` }
      ]
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Customer:*\n${safeStr(customerName)}` },
        { type: "mrkdwn", text: `*Method:*\n${isDelivery ? "Delivery" : "Pickup"}` },
        { type: "mrkdwn", text: `*Email:*\n${safeStr(email)}` },
        { type: "mrkdwn", text: `*Phone:*\n${safeStr(phone)}` }
      ]
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Store:*\n${safeStr(storeLine)}` },
        {
          type: "mrkdwn",
          text: isDelivery
            ? `*Dropoff:*\n${safeStr(addressLine || "—")}`
            : `*Dropoff:*\n—`
        }
      ]
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Items (${(items || []).length}):*\n` +
          (itemLines.length ? itemLines.join("\n") : "• —")
      }
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Subtotal:*\n${formatMoney(totals?.subtotal)}` },
        { type: "mrkdwn", text: `*Delivery:*\n${formatMoney(totals?.delivery)}` },
        { type: "mrkdwn", text: `*Tax:*\n${formatMoney(totals?.tax)}` },
        { type: "mrkdwn", text: `*Total:*\n${formatMoney(totals?.total)}` }
      ]
    }
  ];

  if (trackingUrl) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Uber Tracking:*\n${trackingUrl}` }
    });
  }

  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: "Sent automatically from checkout" }
    ]
  });

  return { text: "Successful order", blocks };
}

async function sendSlackOrderNotification(order) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[slack] SLACK_WEBHOOK_URL not set; skipping");
    return { ok: false, skipped: true };
  }

  const payload = buildSlackPayload(order);

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.warn("[slack] webhook failed:", resp.status, txt.slice(0, 200));
      return { ok: false };
    }

    return { ok: true };
  } catch (err) {
    console.warn("[slack] exception:", err?.message || err);
    return { ok: false };
  }
}

module.exports = { sendSlackOrderNotification };
