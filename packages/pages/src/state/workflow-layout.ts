export interface WorkflowDimensions {viewport:number;header:number;footer:number}
/** Preserve room for a label/input; otherwise the whole sheet must scroll without shrinking text. */
export function workflowNeedsWholeScroll({viewport,header,footer}:WorkflowDimensions):boolean {
  return Number.isFinite(viewport)&&Number.isFinite(header)&&Number.isFinite(footer)&&viewport>0&&header>0&&footer>0&&viewport-header-footer<112;
}
export function workflowFocusOffset(fieldTop:number,fieldHeight:number,viewportHeight:number):number|null {
  if(![fieldTop,fieldHeight,viewportHeight].every(Number.isFinite)||fieldHeight<=0||viewportHeight<=0)return null;
  return Math.max(0,fieldTop-Math.max(0,(viewportHeight-fieldHeight)/2));
}
