import { redirect } from "next/navigation";

/** Own baskets are started from the cart now (DEC-027). */
export default function NewOwnBasketPage() {
  redirect("/cart");
}
