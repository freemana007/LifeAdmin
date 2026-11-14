// Scheduled Function: the daily reminder digest (08:00 UTC = 08:00 Irish winter
// time, 09:00 summer time). Same job as /api/cron/reminders on Vercel.
import { sendDigests } from "../../server/dist/reminders.js";
import { createServerlessParts } from "../../server/dist/serverless.js";

export default async function handler() {
  const { store } = await createServerlessParts();
  await store.sync();
  const digests = sendDigests(store);
  await store.flush();
  console.log(`[life-admin] reminder digests sent: ${digests.length}`);
  return new Response(null, { status: 204 });
}

export const config = { schedule: "0 8 * * *" };
