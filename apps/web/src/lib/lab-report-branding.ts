import { DRAX_HALL_LAB } from "@drax-lis/catalog";
import type { LabReportBranding } from "@drax-lis/contracts";

/** Fallback branding when API payload is unavailable (preview/dev). */
export const DEFAULT_LAB_REPORT_BRANDING: LabReportBranding = {
  name: DRAX_HALL_LAB.name,
  logoUrl: null,
  addressLines: [
    "Drax Hall Medical Centre",
    "St. Ann, Jamaica",
  ],
  phone: "+1 (876) 555-0100",
  email: "lab@draxhall.local",
  website: "https://draxhall.local",
  disclaimer:
    "For clinical use only. Verify critical values before therapeutic decisions. This report contains released results only.",
};

export function mergeLabBranding(
  partial?: Partial<LabReportBranding> | null,
): LabReportBranding {
  if (!partial) return DEFAULT_LAB_REPORT_BRANDING;
  return {
    name: partial.name ?? DEFAULT_LAB_REPORT_BRANDING.name,
    logoUrl: partial.logoUrl ?? DEFAULT_LAB_REPORT_BRANDING.logoUrl,
    addressLines:
      partial.addressLines?.length
        ? partial.addressLines
        : DEFAULT_LAB_REPORT_BRANDING.addressLines,
    phone: partial.phone ?? DEFAULT_LAB_REPORT_BRANDING.phone,
    email: partial.email ?? DEFAULT_LAB_REPORT_BRANDING.email,
    website: partial.website ?? DEFAULT_LAB_REPORT_BRANDING.website,
    disclaimer: partial.disclaimer ?? DEFAULT_LAB_REPORT_BRANDING.disclaimer,
  };
}
