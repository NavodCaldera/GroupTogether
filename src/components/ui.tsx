import type { ComponentProps, ReactNode } from "react";

/** Small set of shared UI primitives. Keep styling here so pages stay consistent. */

/**
 * Mobile first. Form fields use 16px text and 44px height on phones (below `sm`): iOS Safari
 * zooms the page into any field with smaller text, and 44px is a comfortable tap target.
 * Buttons are 44px tall on phones too. From `sm` up fields are 14px and controls 40px.
 */

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return (
    <button
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10",
        variant === "primary" && "bg-accent text-on-accent hover:opacity-90",
        variant === "secondary" && "border border-line bg-paper hover:bg-muted",
        variant === "danger" && "bg-danger text-paper hover:opacity-90",
        variant === "ghost" && "hover:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"a"> & { variant?: "primary" | "secondary" }) {
  return (
    <a
      className={cx(
        "inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium transition sm:min-h-10",
        variant === "primary" && "bg-accent text-on-accent hover:opacity-90",
        variant === "secondary" && "border border-line bg-paper hover:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string[] | string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-bold">
        {label}
      </label>
      {children}
      {hint && !message && <p className="text-xs text-subtle">{hint}</p>}
      {message && (
        <p className="text-xs font-medium text-danger" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      id={props.id ?? props.name}
      className={cx(
        "min-h-11 rounded-lg border border-line bg-paper px-3 text-base outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 sm:min-h-10 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      id={props.id ?? props.name}
      className={cx(
        "min-h-11 max-w-full min-w-0 rounded-lg border border-line bg-paper px-3 text-base outline-none focus:border-ink sm:min-h-10 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      id={props.id ?? props.name}
      className={cx(
        "min-h-20 rounded-lg border border-line bg-paper px-3 py-2 text-base outline-none focus:border-ink sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx("rounded-xl border border-line bg-paper p-4 sm:p-5", className)}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6 sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-subtle">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "bad" | "info";
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        // A pill stays on one line: wrapping it squeezes whatever sits beside it.
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "neutral" && "bg-muted text-ink",
        tone === "good" && "bg-accent text-on-accent",
        tone === "info" && "bg-accent/15 text-ink",
        tone === "bad" && "bg-danger text-paper",
      )}
    >
      {children}
    </span>
  );
}

export function Alert({
  tone = "bad",
  children,
}: {
  tone?: "bad" | "good" | "info";
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cx(
        "rounded-lg px-3 py-2 text-sm",
        tone === "bad" && "border border-danger font-medium text-danger",
        tone === "good" && "border border-accent bg-accent/10 text-ink",
        tone === "info" && "border border-line bg-muted text-ink",
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-center sm:p-10">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-subtle">{children}</div>}
    </div>
  );
}
