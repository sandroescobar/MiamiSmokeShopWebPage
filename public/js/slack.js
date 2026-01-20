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

function normalizeMethod(v) {
  return String(v || "").trim().toLowerCase();
}

function isDeliveryMethod(deliveryMethod, fulfillmentMethod) {
  const m = normalizeMethod(deliveryMethod || fulfillmentMethod);
  if (!m) return false;

  // Be permissive: different parts of the app may label delivery differently.
  return (
    m === "delivery" ||
    m === "uber" ||
    m === "courier" ||
    m === "uber_direct" ||
    m === "uber-direct" ||
    m === "uber courier" ||
    m.includes("delivery") ||
    m.includes("courier") ||
    m.includes("uber")
  );
}

function pickTrackingUrl(obj) {
  // Accept a raw string URL
  if (typeof obj === "string") return obj;

  // Tries common shapes you might return from Uber APIs
  return (
    obj?.tracking_url ||
    obj?.trackingUrl ||
    (typeof obj?.tracking === "string" ? obj.tracking : null) ||
    obj?.tracking?.url ||
    obj?.tracking?.href ||
    obj?.courier_tracking_url ||
    obj?.courierTrackingUrl ||
    obj?.delivery?.tracking_url ||
    obj?.delivery?.trackingUrl ||
    null
  );
}

function buildAddressLine(addr) {
  if (!addr || typeof addr !== "object") return null;

  const line1 = addr.address || addr.street || addr.street1 || "";
  const line2 = addr.street2 || addr.unit || addr.apt || addr.apartment || addr.suite || "";
  const city = addr.city || "";
  const state = addr.state || "";
  const zip = addr.zip || addr.postalCode || "";

  const parts = [line1, line2, city, state, zip].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function buildSlackPayload(order) {
  const {
    orderId,
    createdAt,
    customer,
    deliveryMethod,
    fulfillmentMethod,
    pickupStoreId,
    pickupStoreLabel,
    pickupStoreName,
    dropoffAddress,
    items,
    totals,
    uber, // optional
    receipt // optional
  } = order || {};

  const isDelivery = isDeliveryMethod(deliveryMethod, fulfillmentMethod);

  // Prefer explicit Uber object, but also allow other fields commonly used in your codebase.
  const trackingUrl =
    pickTrackingUrl(uber) ||
    pickTrackingUrl(order?.serverDelivery) ||
    pickTrackingUrl(order?.uberDelivery) ||
    pickTrackingUrl(order?.delivery) ||
    pickTrackingUrl(receipt) ||
    null;

  const customerName =
    [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") ||
    customer?.name ||
    "—";

  const email = customer?.email || "—";

  // Phone sometimes lives in dropoffAddress/billing instead of customer.
  const fallbackDropoff = dropoffAddress || order?.dropoff || order?.shippingAddress || order?.shipping || order?.billing || null;
  const phone =
    fallbackDropoff?.phoneNumber ||
    fallbackDropoff?.phone ||
    customer?.phone ||
    customer?.phoneNumber ||
    "—";

  const storeLine = pickupStoreLabel || pickupStoreName || pickupStoreId || "—";

  const addressLine = isDelivery ? (buildAddressLine(fallbackDropoff) || "—") : null;

  const itemLines = (items || []).map((it) => {
    const qty = Number(it.quantity || 1);
    const price = Number(it.price || 0);
    const lineTotal = qty * price;
    return `• ${safeStr(it.name)}  ×${qty}  —  ${formatMoney(lineTotal)}`;
  });

  const headerText = isDelivery ? "✅ Successful Delivery Order" : "✅ Successful Pickup Order";

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true }
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
            ? `*Dropoff:*\n${safeStr(addressLine)}`
            : `*Dropoff:*\n—`
        }
      ]
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Items (${(items || []).length}):*\n` + (itemLines.length ? itemLines.join("\n") : "• —")
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

  if (isDelivery && trackingUrl) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Uber Tracking:*\n${trackingUrl}` }
    });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "Sent automatically from checkout" }]
  });

  return { text: isDelivery ? "Successful delivery order" : "Successful pickup order", blocks };
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
