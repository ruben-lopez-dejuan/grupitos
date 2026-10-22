import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth-buttons";
import { authOptions } from "@/lib/auth";

export default async function HomePage() {
  if (await getServerSession(authOptions)) redirect("/dashboard");
  return <main className="landing">
    <nav className="topbar container">
      <Link className="brand" href="/"><span className="brand-symbol">E</span> WCA Easy Groups</Link>
      <span className="status"><i /> Conectado con la WCA</span>
    </nav>
    <section className="hero container">
      <div className="hero-copy">
        <p className="eyebrow">GRUPOS SIN DOLORES DE CABEZA</p>
        <h1>Tu competición,<br /><em>bien organizada.</em></h1>
        <p className="lead">Importa los datos oficiales, crea grupos equilibrados y adapta cada detalle. Fácil para un Open. Potente para un campeonato nacional.</p>
        <SignInButton />
        <p className="privacy">Inicio seguro mediante tu cuenta oficial · No guardamos tu contraseña</p>
      </div>
      <div className="preview-wrap"><div className="blob" /><div className="preview">
        <header><div><small>MADRID OPEN 2026</small><strong>Resumen de grupos</strong></div><span>Todo listo</span></header>
        <div className="stats"><div><b>128</b><small>Competidores</small></div><div><b>12</b><small>Pruebas</small></div><div><b>36</b><small>Grupos</small></div></div>
        <div className="round"><b>3×3</b><div><strong>3×3 Cube · Primera ronda</strong><small>4 grupos · 32 competidores por grupo</small></div><i>›</i></div>
        <div className="round faded"><b>2×2</b><div><strong>2×2 Cube · Primera ronda</strong><small>3 grupos · 28 competidores por grupo</small></div><i>›</i></div>
      </div></div>
    </section>
    <section className="benefits container">
      <article><span>01</span><div><h2>Importa</h2><p>Datos oficiales y actualizados directamente desde la WCA.</p></div></article>
      <article><span>02</span><div><h2>Organiza</h2><p>Un flujo guiado con opciones avanzadas cuando las necesitas.</p></div></article>
      <article><span>03</span><div><h2>Publica</h2><p>Asignaciones compatibles con WCIF y el ecosistema WCA.</p></div></article>
    </section>
  </main>;
}
