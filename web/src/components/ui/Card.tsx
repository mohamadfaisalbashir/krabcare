import clsx from "clsx";
import { HTMLAttributes } from "react";

export default function Card({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("card p-5 sm:p-6", className)} {...rest}>
      {children}
    </div>
  );
}
