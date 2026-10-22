import { notFound } from "next/navigation";
import { DemoWorkspace } from "@/components/demo-workspace";

/** Development-only preview with synthetic data, so the workspace can be tried without a WCA login. */
export default async function DemoPage({ searchParams }: PageProps<"/demo">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { size } = await searchParams;
  return <DemoWorkspace size={size === "large" ? "large" : "small"} />;
}
