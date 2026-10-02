import type { ExerciseType } from './types';

/**
 * Offline bilingual catalogue of common activities. MET values follow the
 * Compendium of Physical Activities (gross energy cost).
 */
export const exercises: readonly ExerciseType[] = [
  { id: 'walking', name: { en: 'Walking (slow)', 'zh-CN': '散步' }, met: 2.5 },
  { id: 'walking-brisk', name: { en: 'Walking (brisk)', 'zh-CN': '快走' }, met: 3.8 },
  { id: 'hiking', name: { en: 'Hiking', 'zh-CN': '徒步' }, met: 6.0 },
  { id: 'jogging', name: { en: 'Jogging', 'zh-CN': '慢跑' }, met: 7.0 },
  { id: 'running', name: { en: 'Running', 'zh-CN': '跑步' }, met: 8.3 },
  { id: 'running-fast', name: { en: 'Running (fast)', 'zh-CN': '快跑' }, met: 11.0 },
  { id: 'cycling', name: { en: 'Cycling', 'zh-CN': '骑行' }, met: 7.5 },
  { id: 'cycling-stationary', name: { en: 'Stationary bike', 'zh-CN': '动感单车' }, met: 7.0 },
  { id: 'swimming', name: { en: 'Swimming (freestyle)', 'zh-CN': '游泳（自由泳）' }, met: 7.0 },
  { id: 'swimming-slow', name: { en: 'Swimming (slow)', 'zh-CN': '慢游' }, met: 4.5 },
  { id: 'strength', name: { en: 'Strength training', 'zh-CN': '力量训练' }, met: 5.0 },
  { id: 'strength-hard', name: { en: 'Strength (heavy)', 'zh-CN': '大重量力量' }, met: 6.0 },
  { id: 'hiit', name: { en: 'HIIT', 'zh-CN': 'HIIT 高强度间歇' }, met: 8.0 },
  { id: 'elliptical', name: { en: 'Elliptical', 'zh-CN': '椭圆机' }, met: 5.0 },
  { id: 'rope', name: { en: 'Rope skipping', 'zh-CN': '跳绳' }, met: 10.0 },
  { id: 'yoga', name: { en: 'Yoga', 'zh-CN': '瑜伽' }, met: 3.0 },
  { id: 'pilates', name: { en: 'Pilates', 'zh-CN': '普拉提' }, met: 3.0 },
  { id: 'stairs', name: { en: 'Stair climbing', 'zh-CN': '爬楼梯' }, met: 8.0 },
  { id: 'badminton', name: { en: 'Badminton', 'zh-CN': '羽毛球' }, met: 5.5 },
  { id: 'basketball', name: { en: 'Basketball', 'zh-CN': '篮球' }, met: 6.5 },
  { id: 'soccer', name: { en: 'Soccer', 'zh-CN': '足球' }, met: 7.0 },
  { id: 'tennis', name: { en: 'Tennis', 'zh-CN': '网球' }, met: 7.3 },
  { id: 'table-tennis', name: { en: 'Table tennis', 'zh-CN': '乒乓球' }, met: 4.0 },
  { id: 'dance', name: { en: 'Dance / aerobics', 'zh-CN': '有氧操 / 舞蹈' }, met: 5.0 },
];

export function getExerciseById(id: string): ExerciseType | undefined {
  return exercises.find((type) => type.id === id);
}
