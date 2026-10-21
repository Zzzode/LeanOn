import { filterExcludedFoods } from '../state/dietary-foods.js';
import { WorkflowChoice } from './WorkflowSheet.js';
import type { LayoutChangeEvent } from '@lynx-js/types';
import type { RegisterInnerDismiss } from '../state/modal-dismiss.js';
import { resolveFoodSelection, type FoodSelectionToken } from '../state/food-selection.js';
import { foodUpdateRequest } from '../state/food-edit.js';
import type { LeanOnRpcContract, ScannerStatus } from '@zzzode/bridge';
import type { ScanFoodPhase, ScanFoodResult } from '../state/scan-food.js';
import { BarcodeLookupSheet } from './BarcodeLookupSheet.js';
import { isRecordConflict } from '../state/record-mutation.js';
import { foodCapabilities } from '../state/capabilities.js';
import { useEffect, useMemo, useRef, useState } from '@lynx-js/react';
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

type UpdateFoodRequest = LeanOnRpcContract['health.updateCustomFood']['request'];

interface CreateFoodRequest extends FoodFields {
  defaultGrams?: number;
}

/** A food the user owns (not shipped in the catalogue) can be edited/deleted. */
function isUserOwned(item: FoodItem): boolean {
  return item.source !== 'usda-fdc' && item.source !== 'curated';
}

interface FoodSheetProps {
  t: Translator;
  date?: string;
  canSave?: boolean;
  supportedMethods?: readonly string[];
  preview?: boolean;
  locale: FoodLocale;
  /** User-created foods the host persisted (RFC 0013). */
  customFoods: readonly FoodItem[];
  /** Pinned food ids (RFC 0015). */
  favoriteFoodIds: readonly string[];
  /** Most recently logged food ids first (RFC 0015). */
  recentFoodIds: readonly string[];
  excludedFoodIds?:readonly string[];
  onClose: () => void;
  onSave: (meal: {
    foodId: string;
    name: string;
    grams: number;
    meal: 'breakfast'|'lunch'|'dinner'|'snack';
    kcal: number;
    macros: FoodItem['macros'];
    micros: FoodItem['micros'];
  }) => Promise<void>;
  /** Persist a new custom food and return the created entry. */
  onCreateCustomFood: (request: CreateFoodRequest) => Promise<FoodItem>;
  /** Replace a custom food and return the updated entry. */
  onUpdateCustomFood: (request: UpdateFoodRequest) => Promise<FoodItem>;
  /** Remove a custom food. */
  onDeleteCustomFood: (id: string) => Promise<void>;
  /** Pin (favorite true) or unpin a food id. */
  onSetFavorite: (id: string, favorite: boolean) => Promise<void>;
  /** When set after a barcode scan (RFC 0016), open this food's detail. */
  initialSelectedId?: string;
  initialSelectedGrams?: number;
  initialSelectionVersion?: number;
  registerInnerDismiss?: RegisterInnerDismiss;
  onGetScannerStatus: () => Promise<ScannerStatus>;
  onScanBarcode: (allowPermission: boolean, onPhase: (phase: ScanFoodPhase) => void, isCancelled: () => boolean) => Promise<ScanFoodResult>;
  onLookupBarcode: (barcode: string, onPhase: (phase: ScanFoodPhase) => void, isCancelled: () => boolean) => Promise<ScanFoodResult>;
}

/**
 * Bottom sheet for logging a meal (RFC 0012), creating custom foods (RFC 0013)
 * and managing them (RFC 0014). Search runs fully offline over the bundled foods
 * plus the host-persisted custom foods. The same form serves create and edit;
 * deleting uses a two-step confirmation.
 */
export function FoodSheet({
  t,
  date,
  canSave = true,
  supportedMethods,
  preview = false,
  locale,
  customFoods,
  favoriteFoodIds,
  recentFoodIds,
  excludedFoodIds=[],
  onClose,
  onSave,
  onCreateCustomFood,
  onUpdateCustomFood,
  onDeleteCustomFood,
  onSetFavorite,
  initialSelectedId,
  initialSelectedGrams,
  initialSelectionVersion,
  registerInnerDismiss,
  onGetScannerStatus,
  onScanBarcode,
  onLookupBarcode,
}: FoodSheetProps) {
  const pending = useRef(false);
  const consumedSelection = useRef<FoodSelectionToken | null>(null);
  const handleClose = () => { if (!pending.current) onClose(); };
  const capabilities = foodCapabilities(supportedMethods, preview);
  const { create: canCreate, edit: canEdit, delete: canDelete, favorite: canFavorite, camera: canCamera, lookup: canLookup } = capabilities;
  const [showExcluded,setShowExcluded]=useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [query, setQuery] = useState<string>('');
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [mealType, setMealType] = useState<'breakfast'|'lunch'|'dinner'|'snack'>('snack');
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
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const portionFocused = useRef(false);
  const portionViewportHeight = useRef<number | null>(null);
  const revealPortion = () => {
    lynx.createSelectorQuery().select('#food-grams-field').invoke({
      method: 'scrollIntoView',
      params: {scrollIntoViewOptions:{block:'center',inline:'start',behavior:'none'}},
    }).exec();
  };
  const handlePortionLayout = (event: LayoutChangeEvent) => {
    const height=event.detail.height;
    if(portionViewportHeight.current===height)return;
    portionViewportHeight.current=height;
    if(portionFocused.current)revealPortion();
  };
  const [invalidFields, setInvalidFields] = useState<readonly string[]>([]);
  const fieldClass = (base: string, id: string): string =>
    `${base}${focusedField === id ? ' focused' : ''}${invalidFields.includes(id) ? ' invalid' : ''}`;
  const clearFieldError = (id: string) => {
    setInvalidFields((current) => current.filter((field) => field !== id));
    if (invalidFields.length === 0 || (invalidFields.length === 1 && invalidFields[0] === id)) {
      setFormError(null);
    }
  };

  const database = useMemo<FoodDatabase>(
    () => [...foods, ...customFoods],
    [customFoods],
  );
  const results = useMemo(
    () => filterExcludedFoods(searchFoods(database, query, locale),excludedFoodIds,showExcluded),
    [database, query, locale,excludedFoodIds,showExcluded],
  );

  // Resolve the favorite/recent id indexes to foods for the empty-query shortcuts.
  const foodById = useMemo(() => {
    const map = new Map<string, FoodItem>();
    for (const item of database) map.set(item.id, item);
    return map;
  }, [database]);
  const resolveIds = (ids: readonly string[]): FoodItem[] =>
    ids
      .map((id) => foodById.get(id))
      .filter((item): item is FoodItem => item !== undefined);
  const favoriteItems = useMemo(
    () => filterExcludedFoods(resolveIds(favoriteFoodIds),excludedFoodIds,showExcluded),
    [foodById, favoriteFoodIds,excludedFoodIds,showExcluded],
  );
  const recentItems = useMemo(
    () => filterExcludedFoods(resolveIds(recentFoodIds),excludedFoodIds,showExcluded),
    [foodById, recentFoodIds,excludedFoodIds,showExcluded],
  );
  // Empty-query fallback: common staples not already shown as favorite/recent.
  const suggestedItems = useMemo(() => {
    if (query.trim() !== '') return [];
    const shown = new Set([...favoriteFoodIds, ...recentFoodIds]);
    return results.filter((item) => !shown.has(item.id));
  }, [query, results, favoriteFoodIds, recentFoodIds]);

  // Consume each initial selection once; refreshed catalogs must preserve edited portions.
  useEffect(() => {
    const selection = resolveFoodSelection(consumedSelection.current,initialSelectedId,initialSelectionVersion ?? 0,foodById);
    if (selection === null) return;
    consumedSelection.current = selection.token;
    setSelected(selection.food);
    setGrams(String(initialSelectedGrams ?? selection.food.defaultGrams ?? 100));
    setQuery('');
    setCreating(false);
    setEditing(false);
  }, [initialSelectedId, initialSelectedGrams, initialSelectionVersion, foodById]);

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
    setField('#food-grams', grams);
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
    if (pending.current) return;
    setSelected(item);
    setGrams(String(item.defaultGrams ?? 100));
    setError(null);
    setConfirmDelete(false);
  };

  const openCreate = () => {
    if (pending.current || !canCreate) return;
    setCName(query);
    setCKcal('');
    setCProtein('');
    setCCarbs('');
    setCFat('');
    setCDefault('');
    setFormError(null);
    setInvalidFields([]);
    setCreating(true);
  };

  const openEdit = () => {
    if (selected === null || pending.current || !canEdit) return;
    setCName(selected.name[locale]);
    setCKcal(String(selected.kcal));
    setCProtein(String(selected.macros.proteinG));
    setCCarbs(String(selected.macros.carbsG));
    setCFat(String(selected.macros.fatG));
    setCDefault(selected.defaultGrams === undefined ? '' : String(selected.defaultGrams));
    setFormError(null);
    setInvalidFields([]);
    setConfirmDelete(false);
    setEditing(true);
  };

  const closeForm = () => {
    if (pending.current) return;
    setCreating(false);
    setEditing(false);
    setFormError(null);
    setInvalidFields([]);
  };

  const submitForm = async () => {
    if (pending.current || (editing ? !canEdit : !canCreate)) return;
    const name = cName.trim();
    const kcal = Number(cKcal);
    if (name.length === 0) {
      setInvalidFields(['cf-name']);
      setFormError(t('customFood.nameRequired'));
      return;
    }
    if (!Number.isFinite(kcal) || kcal <= 0) {
      setInvalidFields(['cf-kcal']);
      setFormError(t('customFood.kcalRequired'));
      return;
    }
    const optional = (text: string): number =>
      text.trim() === '' ? 0 : Number(text);
    const proteinG = optional(cProtein);
    const carbsG = optional(cCarbs);
    const fatG = optional(cFat);
    if (![proteinG, carbsG, fatG].every((v) => Number.isFinite(v) && v >= 0)) {
      setInvalidFields([
        ...(!Number.isFinite(proteinG) || proteinG < 0 ? ['cf-protein'] : []),
        ...(!Number.isFinite(carbsG) || carbsG < 0 ? ['cf-carbs'] : []),
        ...(!Number.isFinite(fatG) || fatG < 0 ? ['cf-fat'] : []),
      ]);
      setFormError(t('customFood.invalidMacros'));
      return;
    }
    let defaultNumber: number | null = null;
    if (cDefault.trim() !== '') {
      const value = Number(cDefault);
      if (!Number.isFinite(value) || value <= 0) {
        setInvalidFields(['cf-default']);
        setFormError(t('customFood.invalidDefault'));
        return;
      }
      defaultNumber = value;
    }

    pending.current = true;
    setSaving(true);
    setFormError(null);
    setInvalidFields([]);
    try {
      if (editing && selected !== null) {
        const updated = await onUpdateCustomFood(foodUpdateRequest(selected,{
          name, kcal, proteinG, carbsG, fatG, defaultGrams: defaultNumber,
        }));
        setEditing(false);
        setSelected(updated);
        setGrams(String(updated.defaultGrams ?? 100));
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
    pending.current = false;
    setSaving(false);
  };

  const isFavorite =
    selected !== null && favoriteFoodIds.includes(selected.id);
  const toggleFavorite = async () => {
    if (selected === null || pending.current || !canFavorite) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSetFavorite(selected.id, !isFavorite);
    } catch (error) {
      setError(t(isRecordConflict(error) ? 'closure.conflict' : 'customFood.error'));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (selected === null || pending.current || !canDelete) return;
    pending.current = true;
    setError(null);
    setSaving(true);
    try {
      await onDeleteCustomFood(selected.id);
      setSelected(null);
      setConfirmDelete(false);
    } catch (error) {
      setError(t(isRecordConflict(error) ? 'closure.conflict' : 'customFood.error'));
      setConfirmDelete(false);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  /** RFC 0024: show the micronutrient block only when at least one value is set. */
  const hasAnyMicros = (micros: FoodItem['micros']): boolean =>
    micros.fiberG > 0 ||
    micros.sugarG > 0 ||
    micros.saturatedFatG > 0 ||
    micros.sodiumMg > 0;

  const handleSave = async () => {
    if (pending.current || !canSave) return;
    if (meal === null || selected === null) {
      setError(t('foodSheet.invalid'));
      return;
    }
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        foodId: selected.id,
        name: selected.name[locale],
        grams: Number(grams),
        meal: mealType,
        kcal: meal.kcal,
        macros: meal.macros,
        micros: meal.micros,
      });
    } catch (error) {
      setError(t(isRecordConflict(error) ? 'closure.conflict' : 'foodSheet.error'));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  const trimmedQuery = query.trim();
  const showCreateRow = trimmedQuery.length > 0 && results.length === 0;
  const showForm = creating || editing;

  return (
    <>
    <view
      accessibility-elements-hidden={barcodeOpen}
      className="Sheet-overlay Food-overlay"
      hover-class="tap-feedback-hover"
      bindtap={saving ? undefined : handleClose}
    >
      <view className="FoodSheet Theme-food" catchtap={() => {}}>
        <view className="Sheet-header">
        <text className="Sheet-title">
          {showForm
            ? editing
              ? t('customFood.editTitle')
              : t('customFood.title')
            : selected !== null ? t('review.portionTitle') : t('foodSheet.title')}
        </text>

        {!showForm && selected === null && <view className="Sheet-close-button" accessibility-element={true} accessibility-traits={saving ? 'disabled' : 'button'} accessibility-label={t('foodSheet.cancel')} bindtap={saving ? undefined : handleClose}>
          <text className="Food-back-label">{t('foodSheet.cancel')}</text>
        </view>}
        </view>
        {date !== undefined && <text className="Section-note">{t('daily.date')} · {date}</text>}
        {showForm ? (
          <>
        <scroll-view scroll-orientation="vertical" className="Food-form-scroll">
          <view className="Food-detail">
            <text className="Section-kicker">{t('review.per100g')}</text>
            <view className="Food-form">
              <text className="Form-label">{t('customFood.name')}</text>
              <view className={fieldClass('Sheet-field', 'cf-name')}>
                <input
            accessibility-element={true}
                  disabled={saving}
                  confirm-type="done"
                  accessibility-label={t('customFood.name')}
                  bindconfirm={() => lynx.createSelectorQuery().select('#cf-name').invoke({ method: 'blur' }).exec()}
                  id="cf-name"
                  bindfocus={() => setFocusedField('cf-name')}
                  bindblur={() => setFocusedField(null)}
                  className="Sheet-input"
                  bindinput={(event: InputEvent) =>
                    { setCName(event.detail.value); clearFieldError('cf-name'); }
                  }
                  placeholder={t('customFood.name')}
                />
              </view>
              <text className="Form-label">{t('customFood.kcal')}</text>
              <view className={fieldClass('Sheet-field', 'cf-kcal')}>
                <input
            accessibility-element={true}
                  disabled={saving}
                  confirm-type="done"
                  accessibility-label={t('customFood.kcal')}
                  bindconfirm={() => lynx.createSelectorQuery().select('#cf-kcal').invoke({ method: 'blur' }).exec()}
                  id="cf-kcal"
                  bindfocus={() => setFocusedField('cf-kcal')}
                  bindblur={() => setFocusedField(null)}
                  className="Sheet-input"
                  type="digit"
                  bindinput={(event: InputEvent) =>
                    { setCKcal(event.detail.value); clearFieldError('cf-kcal'); }
                  }
                  placeholder={t('customFood.kcal')}
                />
                <text className="Sheet-unit">kcal/100g</text>
              </view>
              <view className="Food-form-row">
                <view className={fieldClass('Food-form-cell', 'cf-protein')}>
                  <text className="Form-label">{t('customFood.protein')}</text>
                <input
            accessibility-element={true}
                    disabled={saving}
                  confirm-type="done"
                  accessibility-label={t('customFood.protein')}
                  bindconfirm={() => lynx.createSelectorQuery().select('#cf-protein').invoke({ method: 'blur' }).exec()}
                  id="cf-protein"
                  bindfocus={() => setFocusedField('cf-protein')}
                  bindblur={() => setFocusedField(null)}
                    className="Sheet-input"
                    type="digit"
                    bindinput={(event: InputEvent) =>
                      { setCProtein(event.detail.value); clearFieldError('cf-protein'); }
                    }
                    placeholder={t('customFood.protein')}
                  />
                </view>
                <view className={fieldClass('Food-form-cell', 'cf-carbs')}>
                  <text className="Form-label">{t('customFood.carbs')}</text>
                <input
            accessibility-element={true}
                    disabled={saving}
                  confirm-type="done"
                  accessibility-label={t('customFood.carbs')}
                  bindconfirm={() => lynx.createSelectorQuery().select('#cf-carbs').invoke({ method: 'blur' }).exec()}
                  id="cf-carbs"
                  bindfocus={() => setFocusedField('cf-carbs')}
                  bindblur={() => setFocusedField(null)}
                    className="Sheet-input"
                    type="digit"
                    bindinput={(event: InputEvent) =>
                      { setCCarbs(event.detail.value); clearFieldError('cf-carbs'); }
                    }
                    placeholder={t('customFood.carbs')}
                  />
                </view>
                <view className={fieldClass('Food-form-cell', 'cf-fat')}>
                  <text className="Form-label">{t('customFood.fat')}</text>
                <input
            accessibility-element={true}
                    disabled={saving}
                  confirm-type="done"
                  accessibility-label={t('customFood.fat')}
                  bindconfirm={() => lynx.createSelectorQuery().select('#cf-fat').invoke({ method: 'blur' }).exec()}
                  id="cf-fat"
                  bindfocus={() => setFocusedField('cf-fat')}
                  bindblur={() => setFocusedField(null)}
                    className="Sheet-input"
                    type="digit"
                    bindinput={(event: InputEvent) =>
                      { setCFat(event.detail.value); clearFieldError('cf-fat'); }
                    }
                    placeholder={t('customFood.fat')}
                  />
                </view>
              </view>
              <text className="Form-label">{t('customFood.defaultGrams')}</text>
              <view className={fieldClass('Sheet-field', 'cf-default')}>
                <input
            accessibility-element={true}
                  disabled={saving}
                  confirm-type="done"
                  accessibility-label={t('customFood.defaultGrams')}
                  bindconfirm={() => lynx.createSelectorQuery().select('#cf-default').invoke({ method: 'blur' }).exec()}
                  id="cf-default"
                  bindfocus={() => setFocusedField('cf-default')}
                  bindblur={() => setFocusedField(null)}
                  className="Sheet-input"
                  type="digit"
                  bindinput={(event: InputEvent) =>
                    { setCDefault(event.detail.value); clearFieldError('cf-default'); }
                  }
                  placeholder={t('customFood.defaultGrams')}
                />
                <text className="Sheet-unit">g</text>
              </view>
            </view>
            {formError !== null && (
              <text className="Sheet-error" accessibility-element={true}>{formError}</text>
            )}
          </view>
          </scroll-view>
            <view className="Sheet-actions">
              <view
                className="Sheet-btn"
                accessibility-element={true}
                accessibility-traits={saving ? 'disabled' : 'button'}
                accessibility-label={t('foodSheet.cancel')}
                hover-class="tap-feedback-hover"
                bindtap={saving ? undefined : closeForm}
              >
                <text className="Sheet-btn-label">
                  {t('customFood.cancel')}
                </text>
              </view>
              <view
                className={`Sheet-btn primary${saving ? ' disabled' : ''}`}
                accessibility-element={true}
                accessibility-traits={saving ? 'disabled' : 'button'}
                accessibility-label={saving ? t('review.saving') : editing ? t('customFood.saveChanges') : t('customFood.save')}
                hover-class="tap-feedback-hover"
                bindtap={saving ? undefined : submitForm}
              >
                <text className="Sheet-btn-label primary">
                  {saving ? t('review.saving') : editing
                    ? t('customFood.saveChanges')
                    : t('customFood.save')}
                </text>
              </view>
            </view>
          </>
        ) : selected === null ? (
          <view className="Food-search">
            {excludedFoodIds.length>0&&<view><text className="Section-note">{t('personal.hiddenFoods')}</text><WorkflowChoice t={t} label={t('personal.showExcluded')} selected={showExcluded} disabled={saving} onTap={()=>setShowExcluded(value=>!value)}/></view>}
            <text className="Form-label">{t('foodSheet.searchPlaceholder')}</text>
            <view className="Food-search-row">
              <view className={fieldClass('Food-search-field', 'food-search-input')}>
                <input
            accessibility-element={true}
                  accessibility-label={t('foodSheet.searchPlaceholder')}
                  bindconfirm={() => lynx.createSelectorQuery().select('#food-search-input').invoke({ method: 'blur' }).exec()}
                  id="food-search-input"
                  bindfocus={() => setFocusedField('food-search-input')}
                  bindblur={() => setFocusedField(null)}
                  className="Food-search-input"
                  confirm-type="search"
                  disabled={saving}
                  bindinput={(event: InputEvent) => setQuery(event.detail.value)}
                  placeholder={t('foodSheet.searchPlaceholder')}
                />
              </view>
              {<view
                className="Food-scan-btn"
                accessibility-element={true}
                accessibility-traits={saving ? 'disabled' : 'button'}
                accessibility-label={t('barcode.open')}
                hover-class="tap-feedback-hover"
                bindtap={saving ? undefined : () => setBarcodeOpen(true)}
              >
                <text className="Food-scan-label">
                  {t('barcode.open')}
                </text>
              </view>}
            </view>
            <scroll-view scroll-orientation="vertical" className="Food-results">
              {trimmedQuery === '' && favoriteItems.length > 0 && (
                <view className="Food-quick-section">
                  <text className="Food-quick-title">
                    {t('foodSheet.favorites')}
                  </text>
                  {favoriteItems.map((item) => (
                    <view
                      key={`fav-${item.id}`}
                      className="Food-row"
                      accessibility-element={true}
                      accessibility-traits={saving ? 'disabled' : 'button'}
                      accessibility-label={item.name[locale]}
                      hover-class="tap-feedback-hover"
                      bindtap={() => choose(item)}
                    >
                      <text className="Food-row-name">
                        ★ {item.name[locale]}
                      </text>
                      <text className="Food-row-meta">
                        {item.kcal} kcal / 100g
                      </text>
                    </view>
                  ))}
                </view>
              )}
              {trimmedQuery === '' && recentItems.length > 0 && (
                <view className="Food-quick-section">
                  <text className="Food-quick-title">
                    {t('foodSheet.recent')}
                  </text>
                  {recentItems.map((item) => (
                    <view
                      key={`recent-${item.id}`}
                      className="Food-row"
                      accessibility-element={true}
                      accessibility-traits={saving ? 'disabled' : 'button'}
                      accessibility-label={item.name[locale]}
                      hover-class="tap-feedback-hover"
                      bindtap={() => choose(item)}
                    >
                      <text className="Food-row-name">
                        {item.name[locale]}
                      </text>
                      <text className="Food-row-meta">
                        {item.kcal} kcal / 100g
                      </text>
                    </view>
                  ))}
                </view>
              )}
              {trimmedQuery !== '' &&
                results.map((item) => (
                  <view
                    key={item.id}
                    className="Food-row"
                      accessibility-element={true}
                      accessibility-traits={saving ? 'disabled' : 'button'}
                      accessibility-label={item.name[locale]}
                    hover-class="tap-feedback-hover"
                    bindtap={() => choose(item)}
                  >
                    <text className="Food-row-name">
                      {item.name[locale]}
                    </text>
                    <text className="Food-row-meta">
                      {item.kcal} kcal / 100g
                    </text>
                  </view>
                ))}
              {showCreateRow && !canCreate && <text className="Section-note">{t('review.unavailableBody')}</text>}
              {trimmedQuery !== '' && showCreateRow && canCreate && (
                <view
                  className="Food-row Food-create-row"
                  accessibility-element={true}
                  accessibility-traits={saving ? 'disabled' : 'button'}
                  accessibility-label={t('customFood.title')}
                  hover-class="tap-feedback-hover"
                  bindtap={openCreate}
                >
                  <text className="Food-create-label">
                    {t('customFood.create')} “{trimmedQuery}”
                  </text>
                </view>
              )}
              {trimmedQuery === '' && suggestedItems.length > 0 && (
                <view className="Food-quick-section">
                  <text className="Food-quick-title">
                    {t('foodSheet.suggested')}
                  </text>
                  {suggestedItems.map((item) => (
                    <view
                      key={`sug-${item.id}`}
                      className="Food-row"
                      accessibility-element={true}
                      accessibility-traits={saving ? 'disabled' : 'button'}
                      accessibility-label={item.name[locale]}
                      hover-class="tap-feedback-hover"
                      bindtap={() => choose(item)}
                    >
                      <text className="Food-row-name">
                        {item.name[locale]}
                      </text>
                      <text className="Food-row-meta">
                        {item.kcal} kcal / 100g
                      </text>
                    </view>
                  ))}
                </view>
              )}
            </scroll-view>
          </view>
        ) : (
          <>
          <scroll-view scroll-orientation="vertical" className="Food-detail-scroll" bindlayoutchange={handlePortionLayout}>
          <view className="Food-detail">
            <view
              className="Food-back"
              accessibility-element={true}
              accessibility-traits={saving ? 'disabled' : 'button'}
              accessibility-label={t('foodSheet.back')}
              hover-class="tap-feedback-hover"
              bindtap={saving ? undefined : () => { if (!pending.current) { setSelected(null); setError(null); } }}
            >
              <text className="Food-back-label">{t('foodSheet.back')}</text>
            </view>
            <view className="Food-detail-head">
              <text className="Food-selected-name">
                {selected.name[locale]}
              </text>
              {canFavorite && <view
                className="Food-star"
                accessibility-element={true}
                accessibility-traits={isFavorite ? 'selected' : 'button'}
                accessibility-label={t('foodSheet.favorites')}
                hover-class="tap-feedback-hover"
                bindtap={saving ? undefined : toggleFavorite}
              >
                <text
                  className={`Food-star-label${isFavorite ? ' on' : ''}`}
                >
                  {isFavorite ? '★' : '☆'}
                </text>
              </view>}
            </view>
            <text className="Form-label">{t('review.portionLabel')}</text>
            <view id="food-grams-field" flatten={false} className={`Sheet-field${focusedField === 'food-grams' ? ' focused' : ''}${meal === null ? ' invalid' : ''}`}>
              <input
            accessibility-element={true}
                disabled={saving}
                confirm-type="done"
                accessibility-label={t('review.portionLabel')}
                  bindconfirm={() => lynx.createSelectorQuery().select('#food-grams').invoke({ method: 'blur' }).exec()}
                  id="food-grams"
                  bindfocus={() => {portionFocused.current=true;setFocusedField('food-grams');revealPortion();}}
                  bindblur={() => {portionFocused.current=false;setFocusedField(null);}}
                className="Sheet-input"
                type="digit"
                bindinput={(event: InputEvent) =>
                  { setGrams(event.detail.value); setError(null); }
                }
              />
              <text className="Sheet-unit">g</text>
            </view>

            <text className="Form-label">{t('daily.meal')}</text>
            <view className="LangSwitch Food-meal-options">{(['breakfast','lunch','dinner','snack'] as const).map(value=><view key={value} className={`LangSwitch-item${mealType===value?' active':''}`} accessibility-element={true} accessibility-traits="button" accessibility-value={mealType===value?'✓':''} accessibility-label={t(`daily.${value}`)} bindtap={saving?undefined:()=>setMealType(value)}><text className={`LangSwitch-label${mealType===value?' active':''}`}>{t(`daily.${value}`)}</text></view>)}</view>

            {meal !== null ? (
            <view className="Food-result">
                <text className="Estimate-label">{t('review.estimatedEnergy')}</text>
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
                {hasAnyMicros(meal.micros) && (
                  <view className="Food-macros">
                    <text className="Food-macro">
                      {t('micros.fiber')} {meal.micros.fiberG}g
                    </text>
                    <text className="Food-macro">
                      {t('micros.sugar')} {meal.micros.sugarG}g
                    </text>
                    <text className="Food-macro">
                      {t('micros.saturatedFat')} {meal.micros.saturatedFatG}g
                    </text>
                    <text className="Food-macro">
                      {t('micros.sodium')} {meal.micros.sodiumMg}mg
                    </text>
                  </view>
                )}
              </view>
            ) : (
              <text className="Sheet-error" accessibility-element={true}>{t('foodSheet.invalid')}</text>
            )}
            {error !== null && meal !== null && <text className="Sheet-error" accessibility-element={true}>{error}</text>}
            {!canSave && <text className="Section-note">{t('review.unavailableBody')}</text>}

            {isUserOwned(selected) && (canEdit || canDelete) && (
              <view className="Food-manage">
                {canEdit && <view
                  className="Food-manage-btn"
                  accessibility-element={true}
                  accessibility-traits={saving ? 'disabled' : 'button'}
                  accessibility-label={t('customFood.edit')}
                  hover-class="tap-feedback-hover"
                  bindtap={saving ? undefined : openEdit}
                >
                  <text className="Food-manage-label">
                    {t('customFood.edit')}
                  </text>
                </view>}
                {canDelete && (confirmDelete ? (
                  <view className="Food-manage-row">
                    <view
                      className="Food-manage-btn"
                      accessibility-element={true}
                      accessibility-traits={saving ? 'disabled' : 'button'}
                      accessibility-label={t('customFood.cancel')}
                      hover-class="tap-feedback-hover"
                      bindtap={saving ? undefined : () => setConfirmDelete(false)}
                    >
                      <text className="Food-manage-label">
                        {t('customFood.cancel')}
                      </text>
                    </view>
                    <view
                      className="Food-manage-btn danger"
                      accessibility-element={true}
                      accessibility-traits={saving ? 'disabled' : 'button'}
                      accessibility-label={t('customFood.deleteNow')}
                      hover-class="tap-feedback-hover"
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
                    accessibility-element={true}
                    accessibility-traits={saving ? 'disabled' : 'button'}
                    accessibility-label={t('customFood.delete')}
                    hover-class="tap-feedback-hover"
                    bindtap={saving ? undefined : () => setConfirmDelete(true)}
                  >
                    <text className="Food-manage-label danger">
                      {t('customFood.delete')}
                    </text>
                  </view>
                ))}
              </view>
            )}

          </view>
          </scroll-view>
            <view className="Sheet-actions">
              <view
                className="Sheet-btn"
                accessibility-element={true}
                accessibility-traits={saving ? 'disabled' : 'button'}
                accessibility-label={t('foodSheet.cancel')}
                hover-class="tap-feedback-hover"
                bindtap={saving ? undefined : handleClose}
              >
                <text className="Sheet-btn-label">
                  {t('foodSheet.cancel')}
                </text>
              </view>
              <view
                className={`Sheet-btn primary${saving || !canSave ? ' disabled' : ''}`}
                accessibility-element={true}
                accessibility-traits={saving || !canSave ? 'disabled' : 'button'}
                accessibility-label={saving ? t('review.saving') : t('foodSheet.save')}
                hover-class="tap-feedback-hover"
                bindtap={saving || !canSave ? undefined : handleSave}
              >
                <text className="Sheet-btn-label primary">
                  {saving ? t('review.saving') : t('foodSheet.save')}
                </text>
              </view>
            </view>
          </>
        )}
      </view>
    </view>
    {barcodeOpen && <BarcodeLookupSheet
      t={t} date={date} canCamera={canCamera} canLookup={canLookup} canCreate={canCreate}
      registerInnerDismiss={registerInnerDismiss}
      onGetStatus={onGetScannerStatus} onScan={onScanBarcode} onLookup={onLookupBarcode}
      onClose={() => setBarcodeOpen(false)}
      onCreate={() => {setBarcodeOpen(false);openCreate();setCName('');}}
    />}
    </>
  );
}
