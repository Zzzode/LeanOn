import { useEffect, useMemo, useState } from '@lynx-js/react';
import {
  foods,
  portion,
  searchFoods,
  type FoodDatabase,
  type FoodItem,
  type FoodLocale,
} from '@zzzode/food-data';
import type { Translator } from '@zzzode/i18n';

interface InputEvent {
  detail: { value: string };
}

interface FoodFields {
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface UpdateFoodRequest extends FoodFields {
  id: string;
  /** A number sets the default serving; null clears it. */
  defaultGrams: number | null;
}

interface CreateFoodRequest extends FoodFields {
  defaultGrams?: number;
}

/** A food the user owns (not shipped in the catalogue) can be edited/deleted. */
function isUserOwned(item: FoodItem): boolean {
  return item.source !== 'usda-fdc' && item.source !== 'curated';
}

interface FoodSheetProps {
  t: Translator;
  locale: FoodLocale;
  /** User-created foods the host persisted (RFC 0013). */
  customFoods: readonly FoodItem[];
  onClose: () => void;
  onSave: (meal: {
    kcal: number;
    macros: FoodItem['macros'];
  }) => Promise<void>;
  /** Persist a new custom food and return the created entry. */
  onCreateCustomFood: (request: CreateFoodRequest) => Promise<FoodItem>;
  /** Replace a custom food and return the updated entry. */
  onUpdateCustomFood: (request: UpdateFoodRequest) => Promise<FoodItem>;
  /** Remove a custom food. */
  onDeleteCustomFood: (id: string) => Promise<void>;
}

/**
 * Bottom sheet for logging a meal (RFC 0012), creating custom foods (RFC 0013)
 * and managing them (RFC 0014). Search runs fully offline over the bundled foods
 * plus the host-persisted custom foods. The same form serves create and edit;
 * deleting uses a two-step confirmation.
 */
export function FoodSheet({
  t,
  locale,
  customFoods,
  onClose,
  onSave,
  onCreateCustomFood,
  onUpdateCustomFood,
  onDeleteCustomFood,
}: FoodSheetProps) {
  const [query, setQuery] = useState<string>('');
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState<string>('100');
  const [creating, setCreating] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Shared food form state.
  const [cName, setCName] = useState<string>('');
  const [cKcal, setCKcal] = useState<string>('');
  const [cProtein, setCProtein] = useState<string>('');
  const [cCarbs, setCCarbs] = useState<string>('');
  const [cFat, setCFat] = useState<string>('');
  const [cDefault, setCDefault] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const database = useMemo<FoodDatabase>(
    () => [...foods, ...customFoods],
    [customFoods],
  );
  const results = useMemo(
    () => searchFoods(database, query, locale),
    [database, query, locale],
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

  const setField = (id: string, value: string) => {
    lynx
      .createSelectorQuery()
      .select(id)
      .invoke({ method: 'setValue', params: { value } })
      .exec();
  };

  // Controlled `value` is unavailable on Lynx 3.9 input, so prefill imperatively.
  useEffect(() => {
    if (selected === null) return;
    setField('#food-grams', String(selected.defaultGrams ?? 100));
  }, [selected]);

  // Prefill the shared form: create seeds the name with the query and clears the
  // rest; edit fills every field from the selected food.
  useEffect(() => {
    if (creating) {
      setField('#cf-name', query);
      setField('#cf-kcal', '');
      setField('#cf-protein', '');
      setField('#cf-carbs', '');
      setField('#cf-fat', '');
      setField('#cf-default', '');
    } else if (editing && selected !== null) {
      setField('#cf-name', selected.name[locale]);
      setField('#cf-kcal', String(selected.kcal));
      setField('#cf-protein', String(selected.macros.proteinG));
      setField('#cf-carbs', String(selected.macros.carbsG));
      setField('#cf-fat', String(selected.macros.fatG));
      setField('#cf-default',
        selected.defaultGrams === undefined ? '' : String(selected.defaultGrams));
    }
  }, [creating, editing]);

  const choose = (item: FoodItem) => {
    setSelected(item);
    setGrams(String(item.defaultGrams ?? 100));
    setError(null);
    setConfirmDelete(false);
  };

  const openCreate = () => {
    setCName(query);
    setCKcal('');
    setCProtein('');
    setCCarbs('');
    setCFat('');
    setCDefault('');
    setFormError(null);
    setCreating(true);
  };

  const openEdit = () => {
    if (selected === null) return;
    setCName(selected.name[locale]);
    setCKcal(String(selected.kcal));
    setCProtein(String(selected.macros.proteinG));
    setCCarbs(String(selected.macros.carbsG));
    setCFat(String(selected.macros.fatG));
    setCDefault(selected.defaultGrams === undefined ? '' : String(selected.defaultGrams));
    setFormError(null);
    setConfirmDelete(false);
    setEditing(true);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(false);
    setFormError(null);
  };

  const submitForm = async () => {
    const name = cName.trim();
    const kcal = Number(cKcal);
    if (name.length === 0) {
      setFormError(t('customFood.nameRequired'));
      return;
    }
    if (!Number.isFinite(kcal) || kcal <= 0) {
      setFormError(t('customFood.kcalRequired'));
      return;
    }
    const optional = (text: string): number =>
      text.trim() === '' ? 0 : Number(text);
    const proteinG = optional(cProtein);
    const carbsG = optional(cCarbs);
    const fatG = optional(cFat);
    if (![proteinG, carbsG, fatG].every((v) => Number.isFinite(v) && v >= 0)) {
      setFormError(t('customFood.invalidMacros'));
      return;
    }
    let defaultNumber: number | null = null;
    if (cDefault.trim() !== '') {
      const value = Number(cDefault);
      if (!Number.isFinite(value) || value <= 0) {
        setFormError(t('customFood.invalidDefault'));
        return;
      }
      defaultNumber = value;
    }

    setSaving(true);
    try {
      if (editing && selected !== null) {
        const updated = await onUpdateCustomFood({
          id: selected.id, name, kcal, proteinG, carbsG, fatG,
          defaultGrams: defaultNumber,
        });
        setEditing(false);
        setSelected(updated);
      } else {
        const created = await onCreateCustomFood({
          name, kcal, proteinG, carbsG, fatG,
          ...(defaultNumber === null ? {} : { defaultGrams: defaultNumber }),
        });
        setCreating(false);
        setSelected(created);
        setGrams(String(created.defaultGrams ?? 100));
      }
    } catch {
      setFormError(t('customFood.error'));
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (selected === null) return;
    setSaving(true);
    try {
      await onDeleteCustomFood(selected.id);
    } catch {
      setError(t('customFood.error'));
      setSaving(false);
      setConfirmDelete(false);
    }
  };

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

  const trimmedQuery = query.trim();
  const showCreateRow = trimmedQuery.length > 0 && results.length === 0;
  const showForm = creating || editing;

  return (
    <view className="Sheet-overlay Food-overlay" bindtap={onClose}>
      <view className="FoodSheet" catchtap={() => {}}>
        <text className="Sheet-title">
          {showForm
            ? editing
              ? t('customFood.editTitle')
              : t('customFood.title')
            : t('foodSheet.title')}
        </text>

        {showForm ? (
          <view className="Food-detail">
            <view className="Food-form">
              <view className="Sheet-field">
                <input
                  id="cf-name"
                  className="Sheet-input"
                  bindinput={(event: InputEvent) =>
                    setCName(event.detail.value)
                  }
                  placeholder={t('customFood.name')}
                />
              </view>
              <view className="Sheet-field">
                <input
                  id="cf-kcal"
                  className="Sheet-input"
                  type="digit"
                  bindinput={(event: InputEvent) =>
                    setCKcal(event.detail.value)
                  }
                  placeholder={t('customFood.kcal')}
                />
                <text className="Sheet-unit">kcal/100g</text>
              </view>
              <view className="Food-form-row">
                <view className="Food-form-cell">
                  <input
                    id="cf-protein"
                    className="Sheet-input"
                    type="digit"
                    bindinput={(event: InputEvent) =>
                      setCProtein(event.detail.value)
                    }
                    placeholder={t('customFood.protein')}
                  />
                </view>
                <view className="Food-form-cell">
                  <input
                    id="cf-carbs"
                    className="Sheet-input"
                    type="digit"
                    bindinput={(event: InputEvent) =>
                      setCCarbs(event.detail.value)
                    }
                    placeholder={t('customFood.carbs')}
                  />
                </view>
                <view className="Food-form-cell">
                  <input
                    id="cf-fat"
                    className="Sheet-input"
                    type="digit"
                    bindinput={(event: InputEvent) =>
                      setCFat(event.detail.value)
                    }
                    placeholder={t('customFood.fat')}
                  />
                </view>
              </view>
              <view className="Sheet-field">
                <input
                  id="cf-default"
                  className="Sheet-input"
                  type="digit"
                  bindinput={(event: InputEvent) =>
                    setCDefault(event.detail.value)
                  }
                  placeholder={t('customFood.defaultGrams')}
                />
                <text className="Sheet-unit">g</text>
              </view>
            </view>
            {formError !== null && (
              <text className="Sheet-error">{formError}</text>
            )}
            <view className="Sheet-actions">
              <view className="Sheet-btn" bindtap={closeForm}>
                <text className="Sheet-btn-label">
                  {t('customFood.cancel')}
                </text>
              </view>
              <view
                className={`Sheet-btn primary${saving ? ' disabled' : ''}`}
                bindtap={saving ? undefined : submitForm}
              >
                <text className="Sheet-btn-label primary">
                  {editing
                    ? t('customFood.saveChanges')
                    : t('customFood.save')}
                </text>
              </view>
            </view>
          </view>
        ) : selected === null ? (
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
              {showCreateRow && (
                <view className="Food-row Food-create-row" bindtap={openCreate}>
                  <text className="Food-create-label">
                    {t('customFood.create')} “{trimmedQuery}”
                  </text>
                </view>
              )}
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

            {isUserOwned(selected) && (
              <view className="Food-manage">
                <view className="Food-manage-btn" bindtap={openEdit}>
                  <text className="Food-manage-label">
                    {t('customFood.edit')}
                  </text>
                </view>
                {confirmDelete ? (
                  <view className="Food-manage-row">
                    <view
                      className="Food-manage-btn"
                      bindtap={() => setConfirmDelete(false)}
                    >
                      <text className="Food-manage-label">
                        {t('customFood.cancel')}
                      </text>
                    </view>
                    <view
                      className="Food-manage-btn danger"
                      bindtap={saving ? undefined : handleDelete}
                    >
                      <text className="Food-manage-label danger">
                        {t('customFood.deleteNow')}
                      </text>
                    </view>
                  </view>
                ) : (
                  <view
                    className="Food-manage-btn danger"
                    bindtap={() => setConfirmDelete(true)}
                  >
                    <text className="Food-manage-label danger">
                      {t('customFood.delete')}
                    </text>
                  </view>
                )}
              </view>
            )}

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
