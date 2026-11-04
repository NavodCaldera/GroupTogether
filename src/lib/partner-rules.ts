import type { FactoryDocKind } from "@/generated/prisma/client";
export type ApplicationInput = {
  businessName: string;
  brNumber: string;
  ownerName: string;
  ownerNic: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  bankName: string;
  bankBranch: string;
  accountName: string;
  accountNumber: string;
};
export const APPLICATION_FIELDS: [keyof ApplicationInput, string][] = [
  ["businessName", "Business name"],
  ["brNumber", "BR number"],
  ["ownerName", "Owner name"],
  ["ownerNic", "Owner NIC number"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["address", "Factory address"],
  ["city", "City"],
  ["bankName", "Bank name"],
  ["bankBranch", "Branch"],
  ["accountName", "Account name"],
  ["accountNumber", "Account number"],
];
export const DOCUMENT_LABELS: Record<FactoryDocKind, string> = {
  BR_CERT: "BR certificate",
  NIC_PHOTO: "NIC photo",
  FACTORY_PHOTO: "Factory photo",
};
export const normalizedIdentity = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]/gu, "");
export function bankNameMatches(
  accountName: string,
  businessName: string,
  ownerName: string,
): boolean {
  const name = normalizedIdentity(accountName);
  return !!name && [businessName, ownerName].some((v) => normalizedIdentity(v) === name);
}
export function missingItems(input: ApplicationInput, docs: FactoryDocKind[]): string[] {
  return [
    ...APPLICATION_FIELDS.filter(([key]) => !input[key]?.trim()).map(([, label]) => label),
    ...(Object.keys(DOCUMENT_LABELS) as FactoryDocKind[])
      .filter((kind) => !docs.includes(kind))
      .map((kind) => DOCUMENT_LABELS[kind]),
  ];
}
