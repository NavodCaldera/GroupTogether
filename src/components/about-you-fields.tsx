import { Field, Input, Select } from "@/components/ui";

/** Gender and date of birth: the shop shows the buyer's own audience from these (2026-11-21). */
export function AboutYouFields({
  errors,
  defaults,
}: {
  errors: Record<string, string[] | undefined>;
  defaults?: { gender?: string | null; birthDate?: Date | null };
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Gender" name="gender" error={errors.gender}>
        <Select name="gender" defaultValue={defaults?.gender ?? ""} required>
          <option value="" disabled>
            Choose…
          </option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </Select>
      </Field>
      <Field label="Date of birth" name="birthDate" error={errors.birthDate}>
        <Input
          name="birthDate"
          type="date"
          autoComplete="bday"
          max={today}
          defaultValue={defaults?.birthDate?.toISOString().slice(0, 10) ?? ""}
          required
        />
      </Field>
    </div>
  );
}
