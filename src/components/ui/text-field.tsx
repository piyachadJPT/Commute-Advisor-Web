import type { ComponentProps } from "react";
import { inputClass } from "./styles";

/**
 * The app's text input. It has to stay an `<input>` element: typing, and Thai input methods in
 * particular, depend on it. Everything around it is ours: no browser chrome (search clear
 * button, number spinners, autofill tint are removed in globals.css), themed border, focus ring
 * and hover.
 */
export function TextField({
  className = "",
  ...props
}: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${className}`} />;
}
