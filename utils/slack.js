// public/js/slack.js
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

function buildAddressLine(addr) {
  if (!addr || typeof addr !== "object") return null;

  let street = "";
  if (Array.isArray(addr.street_address)) {
    street = addr.street_address.filter(Boolean).join(", ");
  } else {
    const s1 = addr.street_address || addr.address || addr.street || addr.street1 || "";
    const s2 = addr.street2 || addr.unit || addr.apt || addr.apartment || addr.suite || "";
    street = [s1, s2].filter(Boolean).join(", ");
  }

  const city = addr.city || "";
  const state = addr.state || "";
  const zip = addr.zip || addr.postalCode || addr.zip_code || "";

  const parts = [street, city, state, zip].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function buildSlackPayload(order) {
  const {
    orderId,
    customer,
    deliveryMethod,
    fulfillmentMethod,
    pickupStoreId,
    pickupStoreLabel,
    pickupStoreName,
    dropoffAddress,
    items,
    totals,
    uber,
    uberError,
    transactionId
  } = order || {};

  const isDelivery = isDeliveryMethod(deliveryMethod, fulfillmentMethod);
  
  const customerName = [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") || customer?.name || "—";
  const email = customer?.email || "—";
  const phone = customer?.phone || customer?.phoneNumber || "—";
  const storeLine = pickupStoreLabel || pickupStoreName || pickupStoreId || "—";

  let itemsText = "No items";
  if (Array.isArray(items) && items.length > 0) {
    itemsText = items.map(it => `• ${safeStr(it.name)} ×${it.quantity || 1} — ${formatMoney(it.price)} ea`).join("\n");
  }

  const dropoffLine = isDelivery ? (buildAddressLine(dropoffAddress || order?.billing) || "—") : null;

  let mrkdwnText = `*Transaction*\n${transactionId || orderId || "—"}\n`;
  mrkdwnText += `*Pickup Store*\n${storeLine}\n`;
  mrkdwnText += `*Customer*\n${customerName}\n`;
  mrkdwnText += `*Email*\n${email}\n`;
  mrkdwnText += `*Phone*\n${phone}\n`;
  mrkdwnText += `*Method*\n${isDelivery ? "Uber Delivery" : "Pickup"}\n`;
  
  if (isDelivery) {
    mrkdwnText += `*Dropoff*\n${dropoffLine}\n`;
    mrkdwnText += `*Delivery fee*\n${formatMoney(totals?.delivery)}\n`;
  }

  mrkdwnText += `*Items*\n${itemsText}\n`;
  mrkdwnText += `*Subtotal:* ${formatMoney(totals?.subtotal)} • *Delivery:* ${formatMoney(totals?.delivery)} • *Tax:* ${formatMoney(totals?.tax)} • *Total:* ${formatMoney(totals?.total)}\n`;

  if (isDelivery) {
    if (uberError) {
      mrkdwnText += `*Uber status:* Manual dispatch needed — ${uberError}.\n`;
    } else if (uber) {
      mrkdwnText += `*Uber status:* Dispatched. Tracking: ${uber.tracking_url || "—"}\n`;
    }
  }

  mrkdwnText += `Miami Vape Smoke Shop`;

  return {
    text: `New Order: ${transactionId || orderId}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: mrkdwnText
        }
      }
    ]
  };
}

export async function sendSlackOrderNotification(order) {
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
