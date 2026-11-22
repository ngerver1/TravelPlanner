import type { ActivityCategory, Meal, Slot, Status, ItemSize } from './types';

export const STATUSES: Status[] = ['idea', 'planned', 'booked'];
export const STATUS_LABEL: Record<Status, string> = { booked: 'Booked', planned: 'Planned', idea: 'Idea' };
export const SLOTS: Slot[] = ['morning', 'afternoon', 'evening'];
export const SLOT_LABEL: Record<Slot, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner'];
export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
export const SIZES: ItemSize[] = ['quick', 'half', 'full'];
export const SIZE_LABEL: Record<ItemSize, string> = { quick: 'Quick', half: 'Half day', full: 'Full day' };
export const CATEGORIES: Record<ActivityCategory, { label: string; icon: string }> = {
  sight: { label: 'Sight', icon: '🏛' },
  activity: { label: 'Activity', icon: '🎟' },
  shopping: { label: 'Shopping', icon: '🛍' },
  coffee: { label: 'Coffee', icon: '☕' },
  nightlife: { label: 'Nightlife', icon: '🍸' },
  other: { label: 'Other', icon: '•' },
};
export const RESTAURANT_ICON = '🍴';
export const UNASSIGNED = 'Unassigned';

/** Activity slot from a fixed time: before 12:00 morning, before 17:00 afternoon, otherwise evening. */
export function slotFromTime(t: string | undefined): Slot | undefined {
  if (!t) return undefined;
  if (t < '12:00') return 'morning';
  if (t < '17:00') return 'afternoon';
  return 'evening';
}
/** Meal from a time: before 11:00 breakfast, before 16:00 lunch, otherwise dinner; untimed = lunch. */
export function mealFromTime(t: string | undefined): Meal {
  if (!t) return 'lunch';
  if (t < '11:00') return 'breakfast';
  if (t < '16:00') return 'lunch';
  return 'dinner';
}
