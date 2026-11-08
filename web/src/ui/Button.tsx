import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  block,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; icon?: IconName; block?: boolean; children?: ReactNode }) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${block ? "btn-block" : ""} ${className ?? ""}`} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 18 : 20} />}
      {children}
    </button>
  );
}
