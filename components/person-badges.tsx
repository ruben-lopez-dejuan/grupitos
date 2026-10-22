"use client";

/* eslint-disable @next/next/no-img-element -- WCA avatars are external thumbnails; next/image would need remote host config. */
import { useI18n } from "@/components/i18n";

function initials(name: string) {
  const words = name.replace(/\(.*\)/, "").trim().split(/\s+/);
  return `${words[0]?.[0] ?? ""}${words.length > 1 ? words[words.length - 1][0] : ""}`.toUpperCase();
}

/** WCA profile photo, or the person's initials when there is none. */
export function PersonAvatar({ name, url, size = 34 }: { name: string; url?: string; size?: number }) {
  return url
    ? <img className="person-avatar" src={url} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" />
    : <span className="person-avatar initials" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden="true">{initials(name)}</span>;
}

/** Marks people without a WCA ID: their first competition. */
export function NewcomerBadge({ withLabel = false }: { withLabel?: boolean }) {
  const { t } = useI18n();
  return <span className="newcomer-badge" title={t("people.newcomerHelp")} aria-label={t("people.newcomerHelp")}>
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M8 15V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M8 9C8 5.5 5.5 3.5 2 3.5 2 7 4.5 9 8 9Z" fill="currentColor" />
      <path d="M8 7.5C8 4.5 10.2 2.5 14 2.5 14 5.5 11.8 7.5 8 7.5Z" fill="currentColor" opacity="0.7" />
    </svg>
    {withLabel && <span>{t("people.newcomer")}</span>}
  </span>;
}
