import { Input, type InputProps } from "./Input";

interface DateTimeProps extends InputProps {
  type: 'date' | 'time' | 'datetime' | 'datetime-local'
}

export function DateTimeUI({ className = '', type, ...props }: DateTimeProps) {
  return (
    <Input
      type={type}
      className={`appearance-none min-w-0 ${className}`}
      {...props}
    />
  )
}
