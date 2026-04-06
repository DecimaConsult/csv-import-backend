import fs from "fs";
import csv from "csv-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const WEBHOOK_URL = "http://localhost:3000/api/webhooks/bokun";

// =============================
// ✅ NORMALIZE CSV KEYS
// =============================
function normalizeRow(row) {
  const newRow = {};
  for (const key in row) {
    newRow[key.trim().toLowerCase()] = row[key];
  }
  return newRow;
}

// =============================
// ✅ PARSE DATE (NO TZ BUG)
// =============================
function parseDateTime(dateStr) {
  if (!dateStr) return null;

  const [datePart, timePart = "09:00"] = dateStr.split(" ");
  const [day, month, year] = datePart.split(".");
  const [hours, minutes] = timePart.split(":");

  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
  );
}

// =============================
// ✅ EXTRACT BOOKING ID
// =============================
function extractBookingId(raw) {
  if (!raw) return null;
  return Number(raw.replace(/\D/g, ""));
}

// =============================
// ✅ RESOLVE PRODUCT ID
// =============================
function resolveProductId(r) {
  const csvId = Number(r["product id"]);
  if (csvId && !isNaN(csvId)) return csvId;

  const title = (r["product title"] || "").toLowerCase();

  if (title.includes("eiffel")) return 1019775;
  if (title.includes("louvre")) return 948155;

  console.log("❌ Unknown product:", title);
  return null;
}

// =============================
// ✅ GENERATE ACTIVITY BOOKING ID
// =============================
function generateActivityBookingId(bookingId, rowIndex) {
  return Number(`${bookingId}${rowIndex}`);
}

// =============================
// ✅ BUILD PASSENGERS (CRITICAL)
// =============================
function buildPricingCategoryBookings(r) {
  const participantsRaw =
    r["participants"] || r["participant"] || r["pax mix"] || "";

  const categories = [];

  const normalized = participantsRaw
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/:/g, " ")
    .replace(/-/g, " ")
    .replace(/\(/g, " ")
    .replace(/\)/g, " ");

  const adults = Number((normalized.match(/adult[s]?\s*(\d+)/) || [])[1]) || 0;
  const children =
    Number((normalized.match(/child(?:ren)?\s*(\d+)/) || [])[1]) || 0;
  const youth =
    Number((normalized.match(/youth|teen[s]?\s*(\d+)/) || [])[1]) || 0;
  const infants =
    Number((normalized.match(/infant[s]?\s*(\d+)/) || [])[1]) || 0;

  if (adults > 0) {
    categories.push({
      pricingCategory: { title: "Adult", ticketCategory: "ADULT" },
      quantity: adults,
    });
  }

  if (children > 0) {
    categories.push({
      pricingCategory: { title: "Child", ticketCategory: "CHILD" },
      quantity: children,
    });
  }

  if (youth > 0) {
    categories.push({
      pricingCategory: { title: "Youth", ticketCategory: "YOUTH" },
      quantity: youth,
    });
  }

  if (infants > 0) {
    categories.push({
      pricingCategory: { title: "Infant", ticketCategory: "INFANT" },
      quantity: infants,
    });
  }

  // fallback
  if (categories.length === 0) {
    const total = Number(r["total passengers"] || 1);

    categories.push({
      pricingCategory: { title: "Adult", ticketCategory: "ADULT" },
      quantity: total,
    });
  }

  return categories;
}

// =============================
// ✅ BUILD FINAL PAYLOAD
// =============================
function buildWebhookPayload(row, index) {
  const r = normalizeRow(row);

  const rawBookingId = r["cart confirmation code"];
  const bookingId = extractBookingId(rawBookingId);
  if (!bookingId) return null;

  const activityBookingId = generateActivityBookingId(bookingId, index);

  const productId = resolveProductId(r);
  if (!productId) return null;

  const startDateTime = parseDateTime(r["start date"]);
  const endDateTime =
    parseDateTime(r["end date"]) || startDateTime + 2 * 60 * 60 * 1000;

  const pricingCategoryBookings = buildPricingCategoryBookings(r);
  const totalPrice = Number(r["total price with discount"] || 0);

  let firstName = "";
  let lastName = "";

  if (r["customer"]?.includes(",")) {
    const parts = r["customer"].split(",");
    lastName = parts[0].trim();
    firstName = parts[1]?.trim() || "";
  } else {
    firstName = r["customer"]?.split(" ")[0] || "";
    lastName = r["customer"]?.split(" ").slice(1).join(" ") || "";
  }

  return {
    creationDate: Date.now(),

    // ✅ PARENT BOOKING
    bookingId,
    confirmationCode: rawBookingId,
    externalBookingReference: String(bookingId),
    status: (r["status"] || "CONFIRMED").toUpperCase(),

    currency: "EUR",
    totalPrice,
    totalPaid: totalPrice,
    totalDue: 0,

    customer: {
      firstName,
      lastName,
      email: r["email"] || "",
      phoneNumber: r["phone number"] || "",
      phoneNumberLinkable: null,
    },

    // ✅ ACTIVITY BOOKING (CRITICAL)
    activityBookings: [
      {
        bookingId: activityBookingId,
        parentBookingId: bookingId,

        confirmationCode: rawBookingId,
        productConfirmationCode: `UNC-T${activityBookingId}`,

        status: (r["status"] || "CONFIRMED").toUpperCase(),

        productId,
        title: r["product title"],

        startDateTime,
        endDateTime,

        totalPrice,
        priceWithDiscount: totalPrice,

        rateTitle: r["rate title"] || "",

        product: {
          id: productId,
          title: r["product title"],
        },

        pricingCategoryBookings,
      },
    ],
  };
}

// =============================
// ✅ SEND WEBHOOK
// =============================
async function sendWebhook(payload) {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bokun-topic": "bookings/create",
        "x-bokun-apikey": "test",
        "x-bokun-vendor-id": "123",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    console.log("🚀 Sent:", payload.bookingId, "|", text);
  } catch (err) {
    console.error("❌ ERROR:", err.message);
  }
}

// =============================
// 🚀 MAIN
// =============================
async function run() {
  const rows = [];

  fs.createReadStream("D:/csvbackup/report (5).csv")
    .pipe(csv())
    .on("data", (row) => rows.push(row))
    .on("end", async () => {
      console.log("📦 Total rows:", rows.length);

      const seen = new Set();

      let index = 0;

      for (const row of rows) {
        index++;

        const payload = buildWebhookPayload(row, index);
        if (!payload) continue;

        if (seen.has(payload.bookingId)) {
          console.log("⚠️ Duplicate CSV skipped:", payload.bookingId);
          continue;
        }

        seen.add(payload.bookingId);

        await sendWebhook(payload);
      }

      console.log("🎉 DONE");
    });
}

run();
