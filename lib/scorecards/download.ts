"use client";

import { blankScorecards, getImageDataUrl, roundScorecards, scorecardsPdfDefinition, type GroupFilter, type ScorecardSource } from "@/lib/scorecards/scorecards";

/** pdfmake and its Roboto font bundle are loaded only when someone prints. */
async function downloadPdf(definition: unknown, fileName: string) {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts")]);
  pdfMake.addVirtualFileSystem(vfs);
  await pdfMake.createPdf(definition).download(fileName);
}

export async function downloadRoundScorecards(source: ScorecardSource, roundIds: string[], fileName: string, includeGroup?: GroupFilter) {
  const image = await getImageDataUrl(source.printing.backgroundUrl);
  await downloadPdf(scorecardsPdfDefinition(roundScorecards(source, roundIds, includeGroup), image, source.printing.paperSize), fileName);
}

export async function downloadBlankScorecards(source: ScorecardSource, fileName: string) {
  const image = await getImageDataUrl(source.printing.backgroundUrl);
  await downloadPdf(scorecardsPdfDefinition(blankScorecards(source), image, source.printing.paperSize), fileName);
}
