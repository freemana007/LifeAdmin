// Scheduled Function: refresh the Free time listings from Irish open data
// (04:30 UTC daily). Saved in the database; if a source is slow or down, the
// previous listings stay in use. Same job as /api/cron/freetime on Vercel.
import { createServerlessParts } from "../../server/dist/serverless.js";

export default async function handler() {
  const { freeTime } = await createServerlessParts();
  await freeTime.refresh();
  console.log("[life-admin] free time listings refreshed", JSON.stringify(freeTime.status()));
  return new Response(null, { status: 204 });
}

export const config = { schedule: "30 4 * * *" };
