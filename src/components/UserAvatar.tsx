import { useEffect, useState } from "react";

export function UserAvatar({ avatarUrl, username, compact = false }: { avatarUrl?: string; username?: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatarUrl]);
  const initial = username?.trim().slice(0, 1).toLocaleUpperCase() || "U";
  return (
    <span className={`account-avatar${compact ? " account-avatar--compact" : ""}`} aria-hidden="true">
      {avatarUrl && !failed ? <img src={avatarUrl} alt="" onError={() => setFailed(true)} /> : <span>{initial}</span>}
    </span>
  );
}
