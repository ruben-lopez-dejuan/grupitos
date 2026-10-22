export type PaperSize = "a4" | "a6" | "letter";
export type ScorecardOrder = "natural" | "stacked";

/** Printing options, named after Groupifier's CompetitionConfig. */
export type PrintingOptions = {
  paperSize: PaperSize;
  order: ScorecardOrder;
  coverSheets: boolean;
  localNamesFirst: boolean;
  printOneName: boolean;
  scrambleCheckerTopRanked: boolean;
  scrambleCheckerFinalRounds: boolean;
  scrambleCheckerBlank: boolean;
  backgroundUrl: string;
  language: string;
};

export const DEFAULT_PRINTING: PrintingOptions = {
  paperSize: "a4",
  order: "stacked",
  coverSheets: false,
  localNamesFirst: false,
  printOneName: false,
  scrambleCheckerTopRanked: false,
  scrambleCheckerFinalRounds: false,
  scrambleCheckerBlank: false,
  backgroundUrl: "",
  language: "es",
};
