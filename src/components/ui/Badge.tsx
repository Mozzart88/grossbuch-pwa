import type { HTMLAttributes, ReactNode } from "react";

interface BadgeProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

export function Badge({
  variant = 'primary',
  className = '',
  children,
  ...props
}: BadgeProps) {
  const baseStyles = 'ml-2 text-xs px-1.5 py-0.5 rounded'

  const variants = {
    primary: 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300',
    secondary: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300',
    danger: 'bg-red-600 text-white dark:bg-red-700',
    ghost: 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
  }

  return (
    <span
      className={`${baseStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
