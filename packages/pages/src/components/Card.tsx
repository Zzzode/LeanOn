import type { ReactNode } from '@lynx-js/react';

interface CardProps {
  children: ReactNode;
}

/** White rounded surface that groups related Home content. */
export function Card({ children }: CardProps) {
  return <view className="Card">{children}</view>;
}
