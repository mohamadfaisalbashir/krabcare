import { InputHTMLAttributes, forwardRef } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, id, ...rest }, ref) => {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
    return (
      <div>
        <label htmlFor={inputId} className="label-field">
          {label}
        </label>
        <input id={inputId} ref={ref} className="input-field" {...rest} />
        {error && <p className="mt-1.5 text-xs text-status-bahaya">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
export default Input;
