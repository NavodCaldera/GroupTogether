/** How an offer's status reads on the admin side. */
export const OFFER_STATUS = {
  IN_REVIEW: { label: "To review", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "good" },
  DECLINED: { label: "Declined", tone: "bad" },
} as const;
