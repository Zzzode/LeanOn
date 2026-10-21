export const PHOTO_PAGE_SIZE = 4;

/** Only this window is mounted, so native image decoding is bounded per gallery. */
export function photoPage<T>(photos:readonly T[],requestedPage:number):{items:T[];index:number;totalPages:number;previous:boolean;next:boolean} {
  const totalPages=Math.ceil(photos.length/PHOTO_PAGE_SIZE);
  const index=Math.min(Math.max(0,Number.isFinite(requestedPage)?Math.floor(requestedPage):0),Math.max(0,totalPages-1));
  return {items:photos.slice(index*PHOTO_PAGE_SIZE,(index+1)*PHOTO_PAGE_SIZE),index,totalPages,previous:index>0,next:index+1<totalPages};
}
