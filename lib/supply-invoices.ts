export interface SupplyInvoiceAttachment {
  id: string;
  filename: string | null;
  size: number;
  contentType: string;
}

export interface SupplyVendor {
  key: string;
  name: string;
}

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_ATTACHMENTS = 20;

const DEFAULT_VENDOR_SENDERS: Array<{
  vendor: SupplyVendor;
  addresses?: string[];
  domains?: string[];
}> = [
  {
    vendor: { key: "crazy_dental", name: "Crazy Dental" },
    addresses: [
      "customerservice@crazydental.com",
      "system@sent-via.netsuite.com",
    ],
    domains: ["crazydental.com"],
  },
  {
    vendor: { key: "frontier_dental", name: "Frontier Dental" },
    domains: ["frontierdental.com", "frontierdental.ca"],
  },
  {
    vendor: { key: "edgeendo", name: "EdgeEndo" },
    domains: ["edgeendo.com"],
  },
  {
    vendor: { key: "truabutment", name: "TruAbutment" },
    domains: ["truabutment.com"],
  },
  {
    vendor: { key: "net32", name: "Net32" },
    domains: ["net32.com"],
  },
  {
    vendor: { key: "medidenta", name: "Medidenta" },
    domains: ["medidenta.com"],
  },
  {
    vendor: { key: "glidewell_direct", name: "Glidewell Direct" },
    domains: ["glidewelldirect.com", "glidewell.io"],
  },
];

export function extractEmailAddress(value: string) {
  const angleBracketMatch = value.match(/<([^<>]+)>/);
  return (angleBracketMatch?.[1] ?? value).trim().toLowerCase();
}

function domainForAddress(address: string) {
  const at = address.lastIndexOf("@");
  return at >= 0 ? address.slice(at + 1) : "";
}

export function isExpectedSupplyRecipient(
  recipients: string[],
  expectedRecipient: string,
) {
  const expected = extractEmailAddress(expectedRecipient);
  return recipients.some(
    (recipient) => extractEmailAddress(recipient) === expected,
  );
}

export function resolveSupplyVendor(
  sender: string,
  replyTo: string[] = [],
): SupplyVendor | null {
  const candidates = [sender, ...replyTo].map(extractEmailAddress);

  for (const entry of DEFAULT_VENDOR_SENDERS) {
    const addresses = new Set(entry.addresses ?? []);
    const domains = new Set(entry.domains ?? []);
    if (
      candidates.some(
        (candidate) =>
          addresses.has(candidate) ||
          domains.has(domainForAddress(candidate)),
      )
    ) {
      return entry.vendor;
    }
  }

  return null;
}

export function validateSupplyAttachments(
  attachments: SupplyInvoiceAttachment[],
) {
  if (attachments.length > MAX_ATTACHMENTS) {
    return { accepted: false as const, reason: "too_many_attachments" };
  }

  if (attachments.some((attachment) => attachment.size > MAX_ATTACHMENT_BYTES)) {
    return { accepted: false as const, reason: "attachment_too_large" };
  }

  const supported = attachments.filter(
    (attachment) =>
      attachment.contentType.toLowerCase() === "application/pdf" ||
      attachment.filename?.toLowerCase().endsWith(".pdf"),
  );

  return {
    accepted: true as const,
    supported,
    hasSupportedAttachment: supported.length > 0,
  };
}
