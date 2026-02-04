// netlify/functions/dealers.js

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...CORS_HEADERS }, body: "" };
  }

  try {
    const BASE_ID = process.env.AIRTABLE_BASE_ID;
    const TABLE_ID = process.env.AIRTABLE_TABLE_ID;
    const TOKEN = process.env.AIRTABLE_TOKEN;

    if (!BASE_ID || !TABLE_ID || !TOKEN) {
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing Airtable env vars" }),
      };
    }

    const view = "Published";
    const pageSize = 100;
    let offset = null;
    const allRecords = [];

    do {
      const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
      url.searchParams.set("pageSize", String(pageSize));
      if (view) url.searchParams.set("view", view);
      if (offset) url.searchParams.set("offset", offset);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          statusCode: res.status,
          headers: { ...CORS_HEADERS, "content-type": "text/plain" },
          body: text,
        };
      }

      const data = await res.json();
      allRecords.push(...(data.records || []));
      offset = data.offset || null;
    } while (offset);

    const rows = allRecords.map((r) => {
      const lat = Number(r.fields["Latitude"]);
      const lng = Number(r.fields["Longitude"]);

      return {
        id: r.id,
        dealerId: r.fields["Dealer ID"],
        name: r.fields["Dealer Name"],
        address: r.fields["Site Address"],
        postcode: r.fields["Postcode"],
        auditor: r.fields["Auditor"],
        auditFrequency: r.fields["Audit Frequency"],
        status: r.fields["Dealer Status"],
        lat,
        lng,
      };
    });

    const filtered = rows
      .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng))
      .filter((d) => String(d.status || "").trim().toLowerCase() === "active");

    const seen = new Set();
    const dealers = [];

    for (const d of filtered) {
      const key = String(d.dealerId || d.name || "").trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      dealers.push(d);
    }

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "content-type": "application/json",
        "cache-control": "public, max-age=60",
      },
      body: JSON.stringify({
        count_records: allRecords.length,
        count_filtered: filtered.length,
        count_unique_dealers: dealers.length,
        dealers,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ error: String(err) }),
    };
  }
};
