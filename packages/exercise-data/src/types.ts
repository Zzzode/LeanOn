export interface LocalizedName {
  en: string;
  'zh-CN': string;
}

export interface ExerciseType {
  id: string;
  name: LocalizedName;
  /** Metabolic equivalent of the task (Compendium of Physical Activities). */
  met: number;
}
