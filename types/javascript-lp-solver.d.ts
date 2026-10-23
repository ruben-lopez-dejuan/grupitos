/** The part of javascript-lp-solver (Unlicense) this app uses. */
declare module "javascript-lp-solver" {
  namespace solver {
    type Bound = { max?: number; min?: number; equal?: number };
    type Model = {
      optimize: string;
      opType: "max" | "min";
      constraints: Record<string, Bound>;
      variables: Record<string, Record<string, number>>;
      ints?: Record<string, number>;
    };
    function Solve(model: Model): Record<string, number | boolean> & { feasible: boolean; result: number };
  }
  export default solver;
}
