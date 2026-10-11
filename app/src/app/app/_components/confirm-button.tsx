"use client";

/** Submit button that asks for confirmation before a destructive server action. */
export function ConfirmButton({
  message,
  children,
  className,
  label,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="submit"
      aria-label={label}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
