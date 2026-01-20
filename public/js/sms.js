// utils/sms.js
// Send an order receipt SMS via Twilio Messaging Service.
// Safe behavior: failures do NOT throw (checkout should still succeed).

const twilio = require("twilio");

function safeStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function formatMoney(n) {
  const num = Number(n || 0);
  return `$${num.toFixed(2)}`;
}

// Best-effort to normalize to E.164 for US numbers.
// If you already store E.164 (+1...), it will pass through unchanged.
function normalizePhoneE164(raw) {
  const s = safeStr(raw).trim();
  if (!s) return null;
  if (s.startsWith("+")) return s;

  const digits = s.replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return null; // unknown format
}

function pickTrackingUrl(obj) {
  return (
    obj?.tracking ||
    obj?.tracking_url ||
    obj?.trackingUrl ||
    obj?.tracking?.url ||
    obj?.tracking?.href ||
    obj?.courier_tracking_url ||
    obj?.courierTrackingUrl ||
    obj?.delivery?.tracking ||
    obj?.delivery?.tracking_url ||
    obj?.delivery?.trackingUrl ||
    null
  );
}

// Truncate long SMS content (Twilio will segment, but you don't want 12 segments).
function truncateText(text, maxChars = 900) {
  const t = safeStr(text);
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars - 3) + "...";
}

// Builds a customer-facing receipt SMS.
// Expected order shape (flexible):
// {
//   orderId, createdAt,
//   deliveryMethod: "pickup"|"delivery",
//   pickupStoreLabel / pickupStoreName,
//   pickupStorePhone,
//   items: [{name, quantity, price}],
//   totals: {subtotal, tax, delivery, total},
//   uber / serverDelivery / receipt (optional),
// }
function buildReceiptSms(order) {
  const orderId = safeStr(order?.orderId || order?.transactionId || "");
  const createdAt = safeStr(order?.createdAt || "");

  const deliveryMethodRaw = safeStr(order?.deliveryMethod || order?.fulfillmentMethod || "");
  const isDelivery = deliveryMethodRaw.toLowerCase().includes("delivery");

  const storeName =
    safeStr(order?.pickupStoreLabel) ||
    safeStr(order?.pickupStoreName) ||
    safeStr(order?.pickupStoreId) ||
    "—";

  const storePhone = safeStr(order?.pickupStorePhone || "");

  const trackingUrl =
    pickTrackingUrl(order?.uber) ||
    pickTrackingUrl(order?.serverDelivery) ||
    pickTrackingUrl(order?.receipt) ||
    null;

  const items = Array.isArray(order?.items) ? order.items : [];
  const totals = order?.totals || {};

  // Item lines (cap count to keep SMS readable)
  const MAX_ITEM_LINES = 8;
  const itemLines = items.slice(0, MAX_ITEM_LINES).map((it) => {
    const name = safeStr(it?.name || "Item");
    const qty = Number(it?.quantity || 1);
    const price = Number(it?.price || 0);
    const lineTotal = qty * price;
    return `- ${name} x${qty} (${formatMoney(lineTotal)})`;
  });

  if (items.length > MAX_ITEM_LINES) {
    itemLines.push(`- +${items.length - MAX_ITEM_LINES} more item(s)`);
  }

  const header = `Miami Vape Smoke Shop — Receipt`;
  const methodLine = isDelivery ? `Method: Delivery` : `Method: Pickup`;
  const storeLine = `Store: ${storeName}${storePhone ? ` (${storePhone})` : ""}`;

  const totalsBlock = [
    `Subtotal: ${formatMoney(totals.subtotal)}`,
    `Delivery: ${formatMoney(totals.delivery)}`,
    `Tax: ${formatMoney(totals.tax)}`,
    `Total: ${formatMoney(totals.total)}`
  ].join("\n");

  const trackingBlock = isDelivery
    ? (trackingUrl
        ? `Tracking: ${trackingUrl}`
        : `Tracking: Pending — we will send your tracking link shortly.`)
    : "";

  const idBlock = orderId ? `Order: ${orderId}` : "";
  const timeBlock = createdAt ? `Time: ${createdAt}` : "";

  // Compliance-friendly footer (recommended)
  const footer = `Reply STOP to opt out, HELP for help.`;

  const body = [
    header,
    idBlock,
    timeBlock,
    methodLine,
    storeLine,
    "",
    `Items:`,
    itemLines.length ? itemLines.join("\n") : "- —",
    "",
    totalsBlock,
    trackingBlock ? `\n${trackingBlock}` : "",
    "",
    footer
  ]
    .filter((line) => line !== "")
    .join("\n");

  return truncateText(body, 900);
}

let _client = null;
function getTwilioClient() {
  if (_client) return _client;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;

  _client = twilio(accountSid, authToken);
  return _client;
}

// Main function you call after successful purchase.
async function sendOrderReceiptSms(order) {
  const enabled = String(process.env.TWILIO_SMS_ENABLED || "true").toLowerCase() !== "false";

  if (!enabled) return { ok: false, skipped: true, reason: "disabled" };

  const client = getTwilioClient();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!client || !messagingServiceSid) {
    console.warn("[twilio] missing config; skipping");
    return { ok: false, skipped: true, reason: "missing_config" };
  }

  const to =
    normalizePhoneE164(order?.customer?.phoneNumber) ||
    normalizePhoneE164(order?.customer?.phone) ||
    normalizePhoneE164(order?.phoneNumber) ||
    normalizePhoneE164(order?.phone);

  if (!to) {
    console.warn("[twilio] no valid recipient phone; skipping");
    return { ok: false, skipped: true, reason: "no_phone" };
  }

  const smsBody = buildReceiptSms(order);

  try {
    const msg = await client.messages.create({
      to,
      body: smsBody,
      messagingServiceSid
    });

    console.log("[twilio] sent", { to, sid: msg?.sid });
    return { ok: true, sid: msg?.sid };
  } catch (err) {
    console.warn("[twilio] send failed:", err?.message || err);
    return { ok: false };
  }
}

module.exports = {
  sendOrderReceiptSms,
  buildReceiptSms
};
