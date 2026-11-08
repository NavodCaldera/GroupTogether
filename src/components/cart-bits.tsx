export function ProductImage({
  photoKey,
  id,
  title,
  category,
  className = "",
}: {
  photoKey: string | null;
  id: string;
  title: string;
  category: "SHOES" | "APPAREL";
  className?: string;
}) {
  if (photoKey)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/photos/${id}`}
        alt={title}
        loading="lazy"
        decoding="async"
        className={`aspect-square w-full rounded-lg bg-muted object-cover ${className}`}
      />
    );
  return (
    <div
      className={`flex aspect-square w-full items-center justify-center rounded-lg bg-muted text-4xl ${className}`}
      aria-hidden="true"
    >
      {/* Legacy stored categories retain their placeholder; new kinds are clothing-only. */}
      {category === "SHOES" ? "👟" : "👕"}
    </div>
  );
}
