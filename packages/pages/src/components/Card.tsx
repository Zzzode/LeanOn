import type { ReactNode } from '@lynx-js/react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

/** White rounded surface that groups related Home content. */
export function Card({ children, className = '' }: CardProps) {
  return <view className={`Card ${className}`}>{children}</view>;
}
