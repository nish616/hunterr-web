import type { SubscriptionTier } from "@/lib/db/schema";
import { Tier }  from "./constants";

export const UPGRADE_REQUEST_EMAIL = "nishin616@gmail.com";

export function isPro(tier: SubscriptionTier): boolean {
  return tier === Tier.Pro;
}

export function upgradeRequestMailto(userEmail: string): string {
  const subject = `Upgrade to Pro — ${userEmail}`;
  const body =
    `Hi Nishin,\n\n` +
    `I'd like to upgrade my Hunterr account to Pro.\n\n` +
    `Account: ${userEmail}\n\n` +
    `Thanks.`;
  return `mailto:${UPGRADE_REQUEST_EMAIL}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}
