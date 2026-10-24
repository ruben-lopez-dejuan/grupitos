"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n";
import { searchWcaAccounts, type WcaAccount } from "@/lib/wca-persons";

/**
 * Links a volunteer to their WCA account (by name or WCA ID; the account may have no WCA ID).
 * Linked volunteers are published to the WCA as non-competing staff, with their tasks.
 */
export function WcaAccountLink({ name, wcaId, linked, onLink }: { name: string; wcaId?: string; linked?: number; onLink: (account: WcaAccount) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(wcaId ?? name);
  const [results, setResults] = useState<WcaAccount[]>();
  const [message, setMessage] = useState("");

  async function search() {
    setMessage(t("wcaAccount.searching"));
    const found = await searchWcaAccounts(query);
    setResults(found);
    setMessage(!found ? t("wcaAccount.failed") : found.length ? "" : t("wcaAccount.none"));
  }

  if (!open) return <button type="button" className={`account-link ${linked ? "linked" : ""}`} title={linked ? t("wcaAccount.linkedHelp", { id: linked }) : t("wcaAccount.linkHelp")} onClick={() => setOpen(true)}>{linked ? `✓ ${t("wcaAccount.linked")}` : t("wcaAccount.link")}</button>;
  return <div className="account-search">
    <form onSubmit={event => { event.preventDefault(); search(); }}>
      <input value={query} onChange={event => setQuery(event.target.value)} aria-label={t("wcaAccount.search")} placeholder={t("wcaAccount.search")} autoFocus />
      <button className="button secondary" type="submit" disabled={query.trim().length < 3}>{t("wcaAccount.find")}</button>
      <button type="button" className="rule-remove" onClick={() => setOpen(false)} aria-label={t("workspace.dismiss")}>×</button>
    </form>
    {message && <small role="status">{message}</small>}
    {results && results.length > 0 && <ul>{results.map(account => <li key={account.id}>
      <button type="button" onClick={() => { onLink(account); setOpen(false); }}>{account.name} <small>{account.wcaId ?? t("wcaAccount.noWcaId")}{account.countryIso2 ? ` · ${account.countryIso2}` : ""}</small></button>
    </li>)}</ul>}
  </div>;
}
