export type RegisterInnerDismiss = (handler: () => void) => () => void;

/** Hardware back dismisses the topmost child without clearing its parent draft. */
export function createModalDismissController() {
  const handlers: (() => void)[] = [];
  return {
    register(handler: () => void) {
      handlers.push(handler);
      return () => {const index=handlers.lastIndexOf(handler);if(index>=0)handlers.splice(index,1);};
    },
    dismiss(blocked: boolean, outer: () => void): 'blocked' | 'inner' | 'outer' {
      if(blocked)return 'blocked';
      const inner=handlers[handlers.length-1];
      if(inner!==undefined){inner();return 'inner';}
      outer();return 'outer';
    },
  };
}
