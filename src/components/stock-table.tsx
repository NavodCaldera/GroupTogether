type VariantRow = {
  id: string;
  size: string;
  colour: string;
  available: number;
  reserved: number;
  sold: number;
};

/** Stock by size: free to add to carts, locked in carts, and sold. */
export function StockTable({ variants }: { variants: VariantRow[] }) {
  if (variants.length === 0) return <p className="text-sm text-subtle">No sizes yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-subtle">
        <tr>
          <th>Size</th>
          <th className="text-right">Free</th>
          <th className="text-right">In carts</th>
          <th className="text-right">Sold</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {variants.map((v) => (
          <tr key={v.id}>
            <td className="py-1">
              {v.size}
              {v.colour && <span className="text-subtle"> · {v.colour}</span>}
            </td>
            <td className="py-1 text-right">{v.available}</td>
            <td className="py-1 text-right">{v.reserved}</td>
            <td className="py-1 text-right">{v.sold}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
