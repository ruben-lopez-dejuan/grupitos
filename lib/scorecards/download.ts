"use client";

import { competitorCardsContent, competitorCardsEvenlySpacedPdfDefinition, competitorCardsPdfDefinition, groupOverviewGroups, groupOverviewPdfDefinition, type DocumentLabels } from "@/lib/scorecards/group-documents";
import { blankScorecards, getImageDataUrl, roundScorecards, scorecardsPdfDefinition, type GroupFilter, type ScorecardSource } from "@/lib/scorecards/scorecards";

/** pdfmake and its Roboto font bundle are loaded only when someone prints. */
async function downloadPdf(definition: unknown, fileName: string) {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts")]);
  pdfMake.addVirtualFileSystem(vfs);
  await pdfMake.createPdf(definition).download(fileName);
}

export async function downloadRoundScorecards(source: ScorecardSource, roundIds: string[], fileName: string, includeGroup?: GroupFilter) {
  const image = await getImageDataUrl(source.printing.backgroundUrl);
  await downloadPdf(scorecardsPdfDefinition(roundScorecards(source, roundIds, includeGroup), image, source.printing.paperSize, source.printing.registrantOnBack), fileName);
}

export async function downloadBlankScorecards(source: ScorecardSource, fileName: string) {
  const image = await getImageDataUrl(source.printing.backgroundUrl);
  await downloadPdf(scorecardsPdfDefinition(blankScorecards(source), image, source.printing.paperSize), fileName);
}

/** False when the selection leaves nothing to print. */
export async function downloadGroupOverview(source: ScorecardSource, roundIds: string[], labels: DocumentLabels, fileName: string, includeGroup?: GroupFilter) {
  const groups = groupOverviewGroups(source, roundIds, labels, includeGroup);
  if (!groups.length) return false;
  await downloadPdf(groupOverviewPdfDefinition(groups, labels, source.printing.paperSize), fileName);
  return true;
}

/** False when nobody has a task in the selection. */
export async function downloadCompetitorCards(source: ScorecardSource, roundIds: string[], labels: DocumentLabels, fileName: string) {
  const { cards, legend } = competitorCardsContent(source, roundIds, labels);
  if (!cards.length) return false;
  const definition = source.printing.competitorCardsEvenlySpaced ? competitorCardsEvenlySpacedPdfDefinition : competitorCardsPdfDefinition;
  await downloadPdf(definition(cards, legend, source.printing.paperSize), fileName);
  return true;
}
