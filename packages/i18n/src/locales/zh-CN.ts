import type { MessageKey } from './en.js';

/** Simplified Chinese catalog; keys must match the English source catalog. */
export const zhCN = {
  // Greeting & streak
  'home.greeting.morning': '早上好',
  'home.greeting.afternoon': '下午好',
  'home.greeting.evening': '晚上好',
  'home.dayStreak': '天连续',

  // Energy
  'energy.title': '能量',
  'energy.kcalLeft': '千卡剩余',
  'energy.kcalOver': '千卡超标',
  'energy.goal': '目标',
  'energy.food': '饮食',
  'energy.exercise': '运动',

  // Weight
  'weight.title': '体重',
  'weight.kgPerWeek': '公斤/周',
  'weight.start': '起始',
  'weight.lost': '已减',
  'weight.toGoal': '距目标',

  // Macros
  'macros.title': '宏量',
  'macros.protein': '蛋白质',
  'macros.carbs': '碳水',
  'macros.fat': '脂肪',
  'macros.ofGrams': '目标 {n} 克',

  // Quick actions
  'action.logFood': '记录饮食',
  'action.logWeight': '记录体重',

  // Weight logging sheet
  'weightSheet.title': '记录体重',
  'weightSheet.hint': '当前体重',
  'weightSheet.save': '保存',
  'weightSheet.cancel': '取消',
  'weightSheet.invalid': '请输入 20–300 kg 之间的体重。',
  'weightSheet.error': '保存失败，请重试。',
  'weightSheet.pairScale': '配对体重秤',

  // Scale pairing sheet
  'scaleSheet.title': '配对体重秤',
  'scaleSheet.scan': '搜索体重秤',
  'scaleSheet.scanning': '正在搜索附近的体重秤…',
  'scaleSheet.noDevices': '暂未发现秤，请唤醒秤后重试。',
  'scaleSheet.connecting': '正在连接…',
  'scaleSheet.paired': '已配对',
  'scaleSheet.waiting': '已连接，请站上秤。',
  'scaleSheet.close': '关闭',

  // Food logging sheet
  'foodSheet.title': '记录饮食',
  'foodSheet.searchPlaceholder': '搜索食物',
  'foodSheet.back': '返回结果',
  'foodSheet.cancel': '取消',
  'foodSheet.save': '添加',
  'foodSheet.invalid': '请输入正数克数。',
  'foodSheet.error': '保存失败，请重试。',

  // Notice & footer
  'notice.safeFloor': '目标已调整到安全下限。',
  'footer.disclaimer': 'LeanOn · 非医疗建议',

  // Date: Chinese uses numeric months and a "月日" order.
  'date.weekday.0': '周日',
  'date.weekday.1': '周一',
  'date.weekday.2': '周二',
  'date.weekday.3': '周三',
  'date.weekday.4': '周四',
  'date.weekday.5': '周五',
  'date.weekday.6': '周六',
  'date.month.0': '1',
  'date.month.1': '2',
  'date.month.2': '3',
  'date.month.3': '4',
  'date.month.4': '5',
  'date.month.5': '6',
  'date.month.6': '7',
  'date.month.7': '8',
  'date.month.8': '9',
  'date.month.9': '10',
  'date.month.10': '11',
  'date.month.11': '12',
  'date.format': '{month}月{day}日 {weekday}',
} satisfies Record<MessageKey, string>;
