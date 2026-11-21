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
  PRODUCT_LICENCE: "Product licence",
  TRADEMARK_PROOF: "Trademark proof",
};
/** Every application sends these; the others are optional. */
export const REQUIRED_DOCUMENTS: FactoryDocKind[] = ["BR_CERT", "NIC_PHOTO", "FACTORY_PHOTO"];
/** Documents a working factory adds from its workspace (DEC-029). */
export const WORKSPACE_DOCUMENTS: FactoryDocKind[] = ["PRODUCT_LICENCE", "TRADEMARK_PROOF"];
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
    ...REQUIRED_DOCUMENTS.filter((kind) => !docs.includes(kind)).map(
      (kind) => DOCUMENT_LABELS[kind],
    ),
  ];
}
