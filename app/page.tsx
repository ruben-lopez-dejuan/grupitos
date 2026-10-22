import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth-buttons";
import { ThemeToggle } from "@/components/theme-toggle";
import { authOptions } from "@/lib/auth";

export default async function HomePage() {
  if (await getServerSession(authOptions)) redirect("/dashboard");
  return <main className="login-page">
    <nav className="topbar container">
      <Link className="brand" href="/"><span className="brand-symbol">E</span> WCA Easy Groups</Link>
      <div className="topbar-actions"><ThemeToggle /><a className="plain-link" href="https://github.com/ruben-lopez-dejuan/wca-easy-groups">GitHub ↗</a></div>
    </nav>
    <section className="login-layout container">
      <div className="login-intro">
        <p className="kicker">Para equipos organizadores</p>
        <h1>Grupos claros, sin hojas de cálculo eternas.</h1>
        <p>Importa la competición desde la WCA y prepara grupos y tareas en un único sitio.</p>
        <ul><li><span>✓</span> Empieza rápido en un open pequeño</li><li><span>✓</span> Ajusta cada ronda cuando lo necesites</li><li><span>✓</span> Escala a varias salas y escenarios</li></ul>
      </div>
      <div className="login-panel">
        <div className="login-panel-head"><span className="wca-block">WCA</span><div><strong>Accede con tu cuenta WCA</strong><small>Usaremos únicamente los permisos necesarios para consultar y actualizar tus competiciones.</small></div></div>
        <SignInButton />
        <div className="login-detail"><span>Datos que importaremos</span><p>Competidores aceptados, pruebas, rondas, horario y salas de las competiciones que administras.</p></div>
        <p className="privacy">La contraseña se introduce siempre en la web oficial de la WCA.</p>
      </div>
    </section>
    <footer className="login-footer container"><span>Proyecto independiente para competiciones WCA</span><span>WCIF 1.2 · Datos guardados en tu dispositivo</span></footer>
  </main>;
}
