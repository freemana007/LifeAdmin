/** Demo documents so people can try the app without real post. Dates are relative to today. */
function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" });
}
function inDaysNumeric(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export const SAMPLES = [
  {
    label: "Electricity bill",
    get text() {
      return `Electric Ireland
Your electricity bill
Account number: 9012 3456 78
MPRN: 10 001 234 567
Bill date: ${inDaysNumeric(-3)}

Total amount due: €184.62
This amount will be debited from your account on or after ${inDaysNumeric(12)}.`;
    },
  },
  {
    label: "Car insurance renewal",
    get text() {
      return `AXA Insurance
Renewal of your motor insurance policy
Policy number: MTR/4471209
Your policy is due for renewal on ${inDays(26)}.
Your renewal premium is €742.10, an increase of €96.40 on last year.
Your policy will renew automatically unless you tell us otherwise.
If you do not wish to renew, please contact us before ${inDays(25)}.`;
    },
  },
  {
    label: "Revenue LPT letter",
    get text() {
      return `Revenue Commissioners
Local Property Tax (LPT)
Property ID: L1234567X
Your LPT liability for next year is €405.00.
You must choose a payment method no later than ${inDays(9)} via myAccount.`;
    },
  },
  {
    label: "Broadband contract ending",
    get text() {
      return `From: Virgin Media <hello@virginmedia.ie>
Subject: Your contract is ending

Your Virgin Media broadband contract ends on ${inDays(40)}.
Account number: 55120934
After that your monthly price goes up by €15 to €69.00.`;
    },
  },
];
