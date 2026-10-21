import type { HostData } from './types.js';

/** Presence is separate from recorded energy: absent intake is not a zero meal. */
export function summarizeDiary(data: HostData) {
  const entries = data.intake.filter(record => record.date === data.today);
  return entries.reduce((summary, record) => ({
    recorded: true,
    kcal: summary.kcal + record.kcal,
    proteinG: summary.proteinG + record.macros.proteinG,
    carbsG: summary.carbsG + record.macros.carbsG,
    fatG: summary.fatG + record.macros.fatG,
  }), { recorded: false, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}
