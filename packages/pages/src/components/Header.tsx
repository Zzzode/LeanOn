interface HeaderProps {
  greeting: string;
  dateLabel: string;
  streak: number;
}

export function Header({ greeting, dateLabel, streak }: HeaderProps) {
  return (
    <view className="Header">
      <view className="Header-text">
        <text className="Header-greeting">{greeting}</text>
        <text className="Header-date">{dateLabel}</text>
      </view>
      <view className="Header-streak">
        <text className="Header-streak-num">{streak}</text>
        <text className="Header-streak-label">day streak</text>
      </view>
    </view>
  );
}
