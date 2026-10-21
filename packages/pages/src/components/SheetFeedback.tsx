/** Keep form feedback in normal layout beside the fixed actions, outside the scrolling fields. */
export function SheetFeedback({ message }: { message: string | null }) {
  if (message === null) return null;
  return <view style={{ flexShrink: 0 }}>
    <text className="Sheet-error" accessibility-element={true} accessibility-label={message}>{message}</text>
  </view>;
}
