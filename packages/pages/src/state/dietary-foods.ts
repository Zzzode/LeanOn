/** Preferences filter explicit IDs only; ingredient labels and allergy safety are never inferred. */
export function filterExcludedFoods<T extends {id:string}>(items:readonly T[],excludedIds:readonly string[],showExcluded:boolean):T[] {
  if(showExcluded||excludedIds.length===0)return [...items];const excluded=new Set(excludedIds);return items.filter(item=>!excluded.has(item.id));
}
