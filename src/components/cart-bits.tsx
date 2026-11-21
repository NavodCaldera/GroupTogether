export function ProductImage({
  photoKey,
  id,
  title,
  categoryRef,
  className = "",
}: {
  photoKey: string | null;
  id: string;
  title: string;
  categoryRef?: { slug: string };
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
      {placeholderOf(categoryRef?.slug)}
    </div>
  );
}

function placeholderOf(slug: string | undefined) {
  if (slug?.startsWith("shoes")) return "👟";
  if (slug?.startsWith("clothing")) return "👕";
  return "📦";
}
