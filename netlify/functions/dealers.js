// netlify/functions/dealers.js

exports.handler = async () => {
  try {
    const BASE_ID = process.env.AIRTABLE_BASE_ID;
    const TABLE_ID = process.env.AIRTABLE_TABLE_ID;
    const TOKEN = process.env.AIRTABLE_TOKEN;

    // If you DO have a view called "Published", keep this.
    // If you DON'T, set to null.
    const view = "Published";

    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    if (view) url.searchParams.set("view", view);
    url.searchParams.set("pageSize", "100");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        statusCode: res.status,
        headers: { "content-type": "text/plain" },
        body: text,
      };
    }

    const data = await res.json();

    // 1) Map fields
    const rows = (data.records || []).map((r) => {
      const lat = Number(r.fields["Latitude"]);
      const lng = Number(r.fields["Longitude"]);

      return {
        id: r.id, // Airtable record id
        dealerId: r.fields["Dealer ID"],
        name: r.fields["Dealer Name"],
        address: r.fields["Site Address"],
        postcode: r.fields["Postcode"],
        auditFrequency: r.fields["Audit Frequency"],
        status: r.fields["Dealer Status"],
        lat,
        lng,
      };
    });

    // 2) Filters (coords + active)
    const filtered = rows
      .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng))
      .filter((d) => String(d.status || "").trim().toLowerCase() === "active")
      .filter((d) => d.dealerId); // must have Dealer ID for dedupe

    // 3) Deduplicate: keep FIRST entry per Dealer ID (primary = first row returned)
    const seen = new Set();
    const dealers = [];

    for (const d of filtered) {
      const key = String(d.dealerId).trim();
      if (seen.has(key)) continue;
      seen.add(key);
      dealers.push(d);
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=60",
      },
      body: JSON.stringify({ dealers }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: String(err) }),
    };
  }
};
