// netlify/functions/dealers.js

exports.handler = async () => {
  try {
    const BASE_ID = process.env.AIRTABLE_BASE_ID;
    const TABLE_ID = process.env.AIRTABLE_TABLE_ID;
    const TOKEN = process.env.AIRTABLE_TOKEN;

    // If you have a view called "Published", keep it.
    // If you don't, set to null.
    const view = "Published";

    // Airtable returns max 100 records per page.
    // We must loop using the `offset` value to get ALL records.
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
          headers: { "content-type": "text/plain" },
          body: text,
        };
      }

      const data = await res.json();
      allRecords.push(...(data.records || []));
      offset = data.offset || null;
    } while (offset);

    // Map Airtable fields to what your frontend expects
    const rows = allRecords.map((r) => {
      const lat = Number(r.fields["Latitude"]);
      const lng = Number(r.fields["Longitude"]);

      const dealerId = r.fields["Dealer ID"];
      const dealerName = r.fields["Dealer Name"];

      return {
        id: r.id, // Airtable record id
        dealerId,
        name: dealerName,
        address: r.fields["Site Address"],
        postcode: r.fields["Postcode"],
        auditor: r.fields["Auditor"],
        auditFrequency: r.fields["Audit Frequency"],
        status: r.fields["Dealer Status"],
        lat,
        lng,
      };
    });

    // Filters:
    // - Must have valid coords
    // - Must be Active
    const filtered = rows
      .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng))
      .filter((d) => String(d.status || "").trim().toLowerCase() === "active");

    // Keep only ONE "primary" site per dealer:
    // - Primary site = first record Airtable returns for that dealer
    // - So: SORT your Airtable view so the primary site appears first.
    //
    // Dedupe key uses Dealer ID, and falls back to Dealer Name if Dealer ID is blank.
    const seen = new Set();
    const dealers = [];

    for (const d of filtered) {
      const key = String(d.dealerId || d.name || "").trim().toLowerCase();
      if (!key) continue; // skip if both Dealer ID and Dealer Name are missing
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
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: String(err) }),
    };
  }
};

