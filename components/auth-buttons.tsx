"use client";
import { signIn, signOut } from "next-auth/react";

export function SignInButton() {
  return <button className="button primary large" onClick={() => signIn("wca", { callbackUrl: "/dashboard" })}><span>◆</span> Entrar con la WCA</button>;
}
export function SignOutButton() {
  return <button className="button quiet" onClick={() => signOut({ callbackUrl: "/" })}>Cerrar sesión</button>;
}
