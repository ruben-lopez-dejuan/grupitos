import { getI18n } from "@/lib/i18n/server";

export default async function LoadingCompetition() {
  const { t } = await getI18n();
  return <main className="workspace-loading"><div /><p>{t("workspace.preparing")}</p></main>;
}
