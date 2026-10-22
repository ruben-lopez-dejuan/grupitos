"use client";
import { signIn, signOut } from "next-auth/react";
import { useI18n } from "@/components/i18n";

export function SignInButton() {
  const { t } = useI18n();
  return <button className="button primary large" onClick={() => signIn("wca", { callbackUrl: "/dashboard" })}><span>◆</span> {t("auth.signIn")}</button>;
}
export function SignOutButton() {
  const { t } = useI18n();
  return <button className="button quiet" onClick={() => signOut({ callbackUrl: "/" })}>{t("auth.signOut")}</button>;
}
