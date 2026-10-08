import type { ButtonHTMLAttributes } from "react";
import { pillClass, type PillSize, type PillVariant } from "./styles";

/** The guide's button: pill-shaped, teal for the main action. */
export default function PillButton({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  variant?: PillVariant;
  size?: PillSize;
  className?: string;
  children: React.ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={pillClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}
