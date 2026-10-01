import { useEffect, useMemo, useState } from '@lynx-js/react';
import {
  foods,
  portion,
  searchFoods,
  type FoodItem,
  type FoodLocale,
} from '@zzzode/food-data';
import type { Translator } from '@zzzode/i18n';

interface InputEvent {
  detail: { value: string };
}

interface FoodSheetProps {
  t: Translator;
  locale: FoodLocale;
  onClose: () => void;
  onSave: (meal: {
    kcal: number;
    macros: FoodItem['macros'];
  }) => Promise<void>;
}

/**
 * Bottom sheet for logging a meal (RFC 0012). Search runs fully offline over the
 * bundled `@zzzode/food-data` catalogue; selecting a food reveals a grams field
 * and the computed calories/macros. Saving goes through `health.writeIntake`;
 * Home refreshes via the returned HostData / `records.changed`.
 */
export function FoodSheet({ t, locale, onClose, onSave }: FoodSheetProps) {
  const [query, setQuery] = useState<string>('');
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState<string>('100');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const results = useMemo(
    () => searchFoods(foods, query, locale),
    [query, locale],
  );

  const meal = useMemo(() => {
    if (selected === null) return null;
    const amount = Number(grams);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    try {
      return portion(selected, amount);
    } catch {
      return null;
    }
  }, [selected, grams]);

  const choose = (item: FoodItem) => {
    setSelected(item);
    setGrams(String(item.defaultGrams ?? 100));
    setError(null);
  };

  // Controlled `value` is unavailable on Lynx 3.9 input, so prefill the grams
  // field imperatively whenever a food is chosen (same approach as WeightSheet).
  useEffect(() => {
    if (selected === null) return;
    lynx
      .createSelectorQuery()
      .select('#food-grams')
      .invoke({
        method: 'setValue',
        params: { value: String(selected.defaultGrams ?? 100) },
      })
      .exec();
  }, [selected]);

  const handleSave = async () => {
    if (meal === null) {
      setError(t('foodSheet.invalid'));
      return;
    }
    setSaving(true);
    try {
      await onSave(meal);
    } catch {
      setError(t('foodSheet.error'));
      setSaving(false);
    }
  };

  return (
    <view className="Sheet-overlay Food-overlay" bindtap={onClose}>
      <view className="FoodSheet" catchtap={() => {}}>
        <text className="Sheet-title">{t('foodSheet.title')}</text>

        {selected === null ? (
          <view className="Food-search">
            <view className="Food-search-field">
              <input
                id="food-search-input"
                className="Food-search-input"
                bindinput={(event: InputEvent) => setQuery(event.detail.value)}
                placeholder={t('foodSheet.searchPlaceholder')}
              />
            </view>
            <view className="Food-results">
              {results.map((item) => (
                <view
                  key={item.id}
                  className="Food-row"
                  bindtap={() => choose(item)}
                >
                  <text className="Food-row-name">{item.name[locale]}</text>
                  <text className="Food-row-meta">
                    {item.kcal} kcal / 100g
                  </text>
                </view>
              ))}
            </view>
            <view className="Sheet-actions">
              <view className="Sheet-btn" bindtap={onClose}>
                <text className="Sheet-btn-label">
                  {t('foodSheet.cancel')}
                </text>
              </view>
            </view>
          </view>
        ) : (
          <view className="Food-detail">
            <view className="Food-back" bindtap={() => setSelected(null)}>
              <text className="Food-back-label">{t('foodSheet.back')}</text>
            </view>
            <text className="Food-selected-name">
              {selected.name[locale]}
            </text>
            <view className="Sheet-field">
              <input
                id="food-grams"
                className="Sheet-input"
                type="digit"
                bindinput={(event: InputEvent) =>
                  setGrams(event.detail.value)
                }
              />
              <text className="Sheet-unit">g</text>
            </view>

            {meal !== null ? (
              <view className="Food-result">
                <view className="Food-result-kcal">
                  <text className="Food-result-value">{meal.kcal}</text>
                  <text className="Food-result-unit">kcal</text>
                </view>
                <view className="Food-macros">
                  <text className="Food-macro">
                    {t('macros.protein')} {meal.macros.proteinG}g
                  </text>
                  <text className="Food-macro">
                    {t('macros.carbs')} {meal.macros.carbsG}g
                  </text>
                  <text className="Food-macro">
                    {t('macros.fat')} {meal.macros.fatG}g
                  </text>
                </view>
              </view>
            ) : (
              <text className="Sheet-error">{t('foodSheet.invalid')}</text>
            )}
            {error !== null && <text className="Sheet-error">{error}</text>}

            <view className="Sheet-actions">
              <view className="Sheet-btn" bindtap={onClose}>
                <text className="Sheet-btn-label">
                  {t('foodSheet.cancel')}
                </text>
              </view>
              <view
                className={`Sheet-btn primary${saving ? ' disabled' : ''}`}
                bindtap={saving ? undefined : handleSave}
              >
                <text className="Sheet-btn-label primary">
                  {t('foodSheet.save')}
                </text>
              </view>
            </view>
          </view>
        )}
      </view>
    </view>
  );
}
