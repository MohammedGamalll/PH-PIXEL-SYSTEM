import { spawnSync } from "child_process";
import "./load-env.mjs";

const oldApi = process.env.OLD_SUPABASE_URL || "http://127.0.0.1:54321";
const newApi = process.env.NEW_SUPABASE_URL || "http://127.0.0.1:55321";
const serviceKey = process.env.OLD_SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const newServiceKey = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY || serviceKey;

const buckets = ["product-images", "contact-documents"];

async function listBuckets(baseUrl, key) {
  const res = await fetch(`${baseUrl}/storage/v1/bucket`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
  });
  if (!res.ok) return [];
  return res.json();
}

async function listObjects(baseUrl, key, bucket) {
  const res = await fetch(`${baseUrl}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix: "", limit: 1000, offset: 0 }),
  });
  if (!res.ok) return [];
  return res.json();
}

async function ensureBucket(baseUrl, key, bucket) {
  const res = await fetch(`${baseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: bucket, name: bucket, public: bucket === "product-images" }),
  });
  if (!res.ok && res.status !== 409) {
    console.warn(`create bucket ${bucket}:`, await res.text());
  }
}

async function copyBucket(bucket) {
  await ensureBucket(newApi, newServiceKey, bucket);
  const objects = await listObjects(oldApi, serviceKey, bucket);
  console.log(`${bucket}: ${objects.length} objects on source`);
  for (const obj of objects) {
    const name = obj.name;
    if (!name || name.endsWith("/")) continue;
    const dl = await fetch(`${oldApi}/storage/v1/object/${bucket}/${name}`, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
    if (!dl.ok) {
      console.warn("download failed", name, dl.status);
      continue;
    }
    const buf = Buffer.from(await dl.arrayBuffer());
    const up = await fetch(`${newApi}/storage/v1/object/${bucket}/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${newServiceKey}`,
        apikey: newServiceKey,
        "Content-Type": obj.metadata?.mimetype || "application/octet-stream",
        "x-upsert": "true",
      },
      body: buf,
    });
    if (!up.ok) console.warn("upload failed", name, await up.text());
  }
}

console.log("Old buckets:", await listBuckets(oldApi, serviceKey));
console.log("New buckets:", await listBuckets(newApi, newServiceKey));

for (const b of buckets) {
  await copyBucket(b);
}

console.log("Storage sync complete.");
