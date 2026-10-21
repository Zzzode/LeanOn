/** Missing or malformed native capability lists never enable a write. */
export function supportsMethod(method: string, methods: unknown, preview = false): boolean {
  return preview || (Array.isArray(methods) && methods.some(value => typeof value === 'string' && value === method));
}

export function foodCapabilities(methods: unknown, preview = false) {
  const supports = (method: string) => supportsMethod(method, methods, preview);
  return {
    create: supports('health.writeCustomFood'),
    edit: supports('health.updateCustomFood'),
    delete: supports('health.deleteCustomFood'),
    favorite: supports('health.setFoodFavorite'),
    lookup: supports('food.lookupProduct') && supports('health.writeScannedFood'),
    camera: supports('scanner.scanBarcode') && supports('scanner.getStatus'),
    scan: supports('scanner.scanBarcode') && supports('food.lookupProduct') && supports('health.writeScannedFood'),
  };
}


/** A visible tool must have every method needed to complete its existing workflow. */
export function toolCapabilities(supports: (method: string) => boolean) {
  return {
    reminders: ['notification.getSettings','notification.updateSettings','notification.requestPermission'].every(supports),
    scale: ['scale.scan','scale.getStatus','scale.connect','scale.disconnect'].every(supports),
  };
}
