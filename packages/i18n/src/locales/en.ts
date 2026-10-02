/**
 * English (canonical/source) message catalog. Add new keys here first; every
 * other catalog must provide the same keys (enforced by types and tests).
 */
export const en = {
  // Greeting & streak
  'home.greeting.morning': 'Good morning',
  'home.greeting.afternoon': 'Good afternoon',
  'home.greeting.evening': 'Good evening',
  'home.dayStreak': 'day streak',

  // Energy
  'energy.title': 'Energy',
  'energy.kcalLeft': 'kcal left',
  'energy.kcalOver': 'kcal over',
  'energy.goal': 'Goal',
  'energy.food': 'Food',
  'energy.exercise': 'Exercise',

  // Weight
  'weight.title': 'Weight',
  'weight.kgPerWeek': 'kg/week',
  'weight.start': 'Start',
  'weight.lost': 'Lost',
  'weight.toGoal': 'To goal',

  // Macros
  'macros.title': 'Macros',
  'macros.protein': 'Protein',
  'macros.carbs': 'Carbs',
  'macros.fat': 'Fat',
  'macros.ofGrams': 'of {n}g',

  // Quick actions
  'action.logFood': 'Log food',
  'action.logWeight': 'Log weight',

  // Weight logging sheet
  'weightSheet.title': 'Log weight',
  'weightSheet.hint': 'Current weight',
  'weightSheet.save': 'Save',
  'weightSheet.cancel': 'Cancel',
  'weightSheet.invalid': 'Enter a weight between 20 and 300 kg.',
  'weightSheet.error': 'Could not save. Please try again.',
  'weightSheet.pairScale': 'Pair a scale',

  // Scale pairing sheet
  'scaleSheet.title': 'Pair scale',
  'scaleSheet.scan': 'Scan for scales',
  'scaleSheet.scanning': 'Scanning for nearby scales…',
  'scaleSheet.noDevices': 'No scales found yet. Wake the scale and try again.',
  'scaleSheet.connecting': 'Connecting…',
  'scaleSheet.paired': 'Paired',
  'scaleSheet.waiting': 'Connected. Step on the scale.',
  'scaleSheet.close': 'Close',

  // Food logging sheet
  'foodSheet.title': 'Log food',
  'foodSheet.searchPlaceholder': 'Search foods',
  'foodSheet.favorites': 'Favorites',
  'foodSheet.recent': 'Recent',
  'foodSheet.suggested': 'Suggested',
  'foodSheet.scan': 'Scan',
  'foodSheet.scanNotFound': 'No product found for this barcode. Create it manually.',
  'foodSheet.scanNoEnergy': 'This product has no energy data. Create it manually.',
  'foodSheet.scanUnavailable':
    'Could not reach Open Food Facts. Check your connection and try again.',
  'foodSheet.back': 'Back to results',
  'foodSheet.cancel': 'Cancel',
  'foodSheet.save': 'Add meal',
  'foodSheet.invalid': 'Enter a positive amount in grams.',
  'foodSheet.error': 'Could not save. Please try again.',

  // Custom food creation
  'customFood.title': 'Create custom food',
  'customFood.create': 'Create custom food',
  'customFood.name': 'Name',
  'customFood.kcal': 'Calories per 100 g',
  'customFood.protein': 'Protein',
  'customFood.carbs': 'Carbs',
  'customFood.fat': 'Fat',
  'customFood.defaultGrams': 'Default serving (g)',
  'customFood.cancel': 'Cancel',
  'customFood.save': 'Create food',
  'customFood.nameRequired': 'Please enter a name.',
  'customFood.kcalRequired':
    'Calories per 100 g must be greater than zero.',
  'customFood.invalidMacros': 'Macros must be non-negative numbers.',
  'customFood.invalidDefault':
    'Default serving must be greater than zero.',
  'customFood.error': 'Could not save. Please try again.',
  'customFood.editTitle': 'Edit food',
  'customFood.edit': 'Edit',
  'customFood.saveChanges': 'Save changes',
  'customFood.delete': 'Delete',
  'customFood.deleteNow': 'Delete now',

  // Notice & footer
  'notice.safeFloor': 'Your target was raised to the safe minimum.',
  'footer.disclaimer': 'LeanOn · not medical advice',

  // Date: weekdays (0=Sun) and months (0=Jan), plus the order template.
  'date.weekday.0': 'Sun',
  'date.weekday.1': 'Mon',
  'date.weekday.2': 'Tue',
  'date.weekday.3': 'Wed',
  'date.weekday.4': 'Thu',
  'date.weekday.5': 'Fri',
  'date.weekday.6': 'Sat',
  'date.month.0': 'Jan',
  'date.month.1': 'Feb',
  'date.month.2': 'Mar',
  'date.month.3': 'Apr',
  'date.month.4': 'May',
  'date.month.5': 'Jun',
  'date.month.6': 'Jul',
  'date.month.7': 'Aug',
  'date.month.8': 'Sep',
  'date.month.9': 'Oct',
  'date.month.10': 'Nov',
  'date.month.11': 'Dec',
  'date.format': '{weekday}, {month} {day}',
} as const;

export type MessageKey = keyof typeof en;
