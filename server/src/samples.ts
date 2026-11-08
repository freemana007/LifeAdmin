/**
 * Example household post, with dates relative to "now" so the timeline always
 * looks current. Used to seed new accounts (marked as examples) and for the
 * "Try an example" buttons. Shared by the server and the web demo build.
 */
export interface SampleDocument {
  label: string;
  text: string;
}

function shift(now: Date, days: number) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return d;
}
const written = (now: Date, days: number) =>
  shift(now, days).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const numeric = (now: Date, days: number) => {
  const d = shift(now, days);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

export function sampleDocuments(now = new Date()): SampleDocument[] {
  return [
    {
      label: "Electricity bill",
      text: `Electric Ireland
Your electricity bill
Account number: 9012 3456 78
MPRN: 10 001 234 567
Bill date: ${numeric(now, -3)}

Total amount due: €184.62
This amount will be debited from your account on or after ${numeric(now, 12)}.`,
    },
    {
      label: "Car insurance renewal",
      text: `AXA Insurance
Renewal of your motor insurance policy
Policy number: MTR/4471209
Your policy is due for renewal on ${written(now, 26)}.
Your renewal premium is €742.10, an increase of €96.40 on last year.
Your policy will renew automatically unless you tell us otherwise.
If you do not wish to renew, please contact us before ${written(now, 25)}.`,
    },
    {
      label: "Revenue LPT letter",
      text: `Revenue Commissioners
Local Property Tax (LPT)
Property ID: L1234567X
Your LPT liability for next year is €405.00.
You must choose a payment method no later than ${written(now, 9)} via myAccount.`,
    },
    {
      label: "Broadband contract ending",
      text: `From: Virgin Media <hello@virginmedia.ie>
Subject: Your contract is ending

Your Virgin Media broadband contract ends on ${written(now, 40)}.
Account number: 55120934
After that your monthly price goes up by €15 to €69.00.`,
    },
  ];
}
