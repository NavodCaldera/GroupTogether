import { Field, Input, Select } from "@/components/ui";
import type { ChoiceAttribute } from "@/lib/categories";

/**
 * The stock form's option fields: one per variant axis of the product's category (CATG-002),
 * posted as `option.<key>`. A product whose category has no axes has one stock line.
 */
export function VariantAxisFields({ axes }: { axes: ChoiceAttribute[] }) {
  if (!axes.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {axes.map((a) => {
        const name = `option.${a.key}`;
        const label = `${a.label}${a.unit ? ` (${a.unit})` : ""}${a.required ? "" : " (optional)"}`;
        return (
          <Field key={a.key} label={label} name={name}>
            {a.values.length ? (
              <Select name={name} required={a.required} defaultValue="">
                <option value="">Choose…</option>
                {a.values.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                name={name}
                required={a.required}
                inputMode={a.type === "NUMBER" ? "decimal" : undefined}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}
