import { SuggestInput } from "./suggest-input";

/**
 * The shop search field with a dropdown of matching products. It is still a normal `q` input in
 * a GET form, so pressing Enter without choosing a suggestion searches as before.
 */
export function SearchBox({
  defaultValue,
  cart,
  className,
}: {
  defaultValue?: string;
  cart?: string;
  className?: string;
}) {
  return (
    <SuggestInput
      endpoint={cart ? `/api/suggest?cart=${encodeURIComponent(cart)}` : "/api/suggest"}
      defaultValue={defaultValue}
      placeholder="Search"
      label="Search"
      className={className}
    />
  );
}
