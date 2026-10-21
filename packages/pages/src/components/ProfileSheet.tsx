import { SheetFeedback } from './SheetFeedback.js';
import { useEffect, useRef, useState } from '@lynx-js/react';
import type { ActivityLevel, Profile } from '@zzzode/core';
import type { MessageKey, Translator } from '@zzzode/i18n';
import { isRecordConflict } from '../state/record-mutation.js';
import {
  validateProfileDraft,
  type GuidanceMode,
  type ProfileDraft,
  type ProfileSafetyFlags,
  type ProfileSavePayload,
  type ProfileValidationError,
} from '../state/profile.js';

export interface ProfileSheetProps {
  profile: Profile | null;
  goalWeightKg: number | null;
  weeklyLossKg: number | null;
  guidanceMode: GuidanceMode;
  safetyFlags: ProfileSafetyFlags;
  today: string;
  editing: boolean;
  currentWeightKg?: number;
  t: Translator;
  canSave?: boolean;
  onClose: () => void;
  onSave: (payload: ProfileSavePayload) => Promise<void>;
}

const ACTIVITY_OPTIONS: ReadonlyArray<{ value: ActivityLevel; key: MessageKey }> = [
  { value: 'sedentary', key: 'profile.sedentary' },
  { value: 'lightly_active', key: 'profile.lightlyActive' },
  { value: 'moderately_active', key: 'profile.moderatelyActive' },
  { value: 'very_active', key: 'profile.veryActive' },
  { value: 'extremely_active', key: 'profile.extremelyActive' },
];

const ERROR_KEYS: Record<ProfileValidationError, MessageKey> = {
  'invalid-profile': 'profile.invalidProfile', 'invalid-goal': 'profile.invalidGoal',
  'safety-required': 'profile.safetyRequired', 'tracking-required': 'profile.trackingRequired',
  'age-safety': 'profile.ageSafety', 'bmi-safety': 'profile.bmiSafety',
  'initial-weight-required': 'profile.initialWeightRequired',
};

type InputField = 'birthDate' | 'heightCm' | 'bodyFatPercent' | 'goalWeightKg' | 'weeklyLossKg' | 'initialWeightKg';

/** Drafts stay local until the parent commits one validated, atomic mutation. */
export function ProfileSheet({
  profile, goalWeightKg, weeklyLossKg, guidanceMode, safetyFlags, today, editing,
  currentWeightKg, t, canSave = true, onClose, onSave,
}: ProfileSheetProps) {
  const initial: ProfileDraft = {
    sex: profile?.sex ?? null,
    birthDate: profile?.birthDate ?? '',
    heightCm: profile === null ? '' : String(profile.heightCm),
    activityLevel: profile?.activityLevel ?? null,
    bodyFatPercent: profile?.bodyFatPercent === undefined ? '' : String(profile.bodyFatPercent * 100),
    goalWeightKg: goalWeightKg === null ? '' : String(goalWeightKg),
    weeklyLossKg: weeklyLossKg === null ? '' : String(weeklyLossKg),
    initialWeightKg: '', guidanceMode, safetyFlags: { ...safetyFlags },
  };
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const [focused, setFocused] = useState<InputField | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<ProfileValidationError | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    const fields: ReadonlyArray<InputField> = ['birthDate', 'heightCm', 'bodyFatPercent', 'goalWeightKg',
      ...(editing ? [] : ['initialWeightKg' as const])];
    for (const field of fields) {
      lynx.createSelectorQuery().select(`#profile-${field}`)
        .invoke({ method: 'setValue', params: { value: initial[field] } }).exec();
    }
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (draft.guidanceMode === 'weight-loss') {
      lynx.createSelectorQuery().select('#profile-weeklyLossKg')
        .invoke({ method: 'setValue', params: { value: draft.weeklyLossKg } }).exec();
    }
  }, [draft.guidanceMode]);

  const update = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => {
    if (pending.current) return;
    setDraft(previous => ({ ...previous, [key]: value }));
    setError(null);
    setValidationError(null);
  };

  const handleClose = () => { if (!pending.current) onClose(); };
  const handleSave = async () => {
    if (pending.current || !canSave) return;
    const result = validateProfileDraft(draft, { today, editing,
      ...(currentWeightKg === undefined ? {} : { currentWeightKg }),
    });
    if (!result.valid) {
      setValidationError(result.error);
      setError(t(ERROR_KEYS[result.error]));
      return;
    }
    pending.current = true;
    setSaving(true);
    setError(null);
    setValidationError(null);
    try {
      await onSave(result.payload);
    } catch (failure) {
      if (mounted.current) setError(t(isRecordConflict(failure) ? 'closure.conflict' : 'profile.error'));
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const option = (label: string, selected: boolean, onSelect: () => void, key?: string) => (
    <view key={key} className={`Sheet-btn${selected ? ' primary' : ''}${saving ? ' disabled' : ''}`}
      accessibility-element={true} accessibility-traits={saving ? 'disabled' : selected ? 'selected' : 'button'}
      accessibility-label={label} hover-class="tap-feedback-hover" bindtap={saving ? undefined : onSelect}>
      <text className={`Sheet-btn-label${selected ? ' primary' : ''}`}>{label}</text>
    </view>
  );

  const input = (field: InputField, label: string, unit?: string, hint?: string) => (
    <view>
      <text className="Form-label">{label}</text>
      <view className={`Sheet-field${focused === field ? ' focused' : ''}${(validationError === 'invalid-profile' && field !== 'goalWeightKg' && field !== 'weeklyLossKg') || (validationError === 'invalid-goal' && (field === 'goalWeightKg' || field === 'weeklyLossKg')) ? ' invalid' : ''}`}>
        <input id={`profile-${field}`} className="Sheet-input" style={{fontSize: field === 'birthDate' ? '18px' : '22px'}} type={field === 'birthDate' ? 'text' : 'digit'}
          accessibility-element={true} accessibility-label={label} disabled={saving} confirm-type="done"
          placeholder={hint ?? t('profile.optional')}
          bindinput={(event: { detail: { value: string } }) => update(field, event.detail.value)}
          bindfocus={() => setFocused(field)} bindblur={() => setFocused(null)}
          bindconfirm={() => lynx.createSelectorQuery().select(`#profile-${field}`).invoke({ method: 'blur' }).exec()} />
        {unit !== undefined && <text className="Sheet-unit">{unit}</text>}
      </view>
    </view>
  );

  const safetyQuestion = (field: keyof ProfileSafetyFlags, label: string) => (
    <view>
      <text className="Form-label">{label}</text>
      <view className="Sheet-actions" style={{ marginTop: '8px' }}>
        {option(t('profile.yes'), draft.safetyFlags[field] === true,
          () => update('safetyFlags', { ...draft.safetyFlags, [field]: true }))}
        {option(t('profile.no'), draft.safetyFlags[field] === false,
          () => update('safetyFlags', { ...draft.safetyFlags, [field]: false }))}
        {option(t('profile.notSure'), draft.safetyFlags[field] === null,
          () => update('safetyFlags', { ...draft.safetyFlags, [field]: null }))}
      </view>
    </view>
  );

  return (
    <view className="Sheet-overlay" bindtap={saving ? undefined : handleClose}>
      <view className="Sheet Theme-brand" catchtap={() => {}}>
        <text className="Sheet-title">{t(editing ? 'profile.editTitle' : 'profile.setupTitle')}</text>
        <scroll-view scroll-orientation="vertical" className="Sheet-body-scroll">
          <text className="Section-note">{t('profile.intro')}</text>
          <text className="Form-label">{t('profile.sex')}</text>
          <view className="Sheet-actions" style={{ marginTop: '8px' }}>
            {option(t('profile.female'), draft.sex === 'female', () => update('sex', 'female'))}
            {option(t('profile.male'), draft.sex === 'male', () => update('sex', 'male'))}
          </view>
          {input('birthDate', t('profile.birthDate'), undefined, t('profile.birthDateHint'))}
          {input('heightCm', t('profile.height'), 'cm', '80–250')}
          <text className="Form-label">{t('profile.activity')}</text>
          {ACTIVITY_OPTIONS.map(({ value, key }) => (
            <view className="Sheet-actions" style={{ marginTop: '8px' }} key={value}>
              {option(t(key), draft.activityLevel === value, () => update('activityLevel', value))}
            </view>
          ))}
          {input('bodyFatPercent', t('profile.bodyFat'), '%', t('profile.bodyFatHint'))}
          {!editing && input('initialWeightKg', t('profile.initialWeight'), 'kg')}
          <text className="Form-label">{t('profile.mode')}</text>
          <view className="Sheet-actions" style={{ marginTop: '8px' }}>
            {option(t('profile.weightLoss'), draft.guidanceMode === 'weight-loss', () => update('guidanceMode', 'weight-loss'))}
            {option(t('profile.trackingOnly'), draft.guidanceMode === 'tracking-only', () => update('guidanceMode', 'tracking-only'))}
          </view>
          {draft.guidanceMode === 'tracking-only' && <text className="Section-note">{t('profile.trackingBody')}</text>}
          {input('goalWeightKg', t('profile.goalWeight'), 'kg', draft.guidanceMode === 'weight-loss' ? '20–300' : t('profile.optional'))}
          {draft.guidanceMode === 'weight-loss' && input('weeklyLossKg', t('profile.weeklyLoss'), t('weight.kgPerWeek'), '0.5–1')}
          <text className="Form-label">{t('profile.safetyTitle')}</text>
          <text className="Section-note">{t('profile.safetyBody')}</text>
          {safetyQuestion('pregnant', t('profile.pregnant'))}
          {safetyQuestion('breastfeeding', t('profile.breastfeeding'))}
          {safetyQuestion('eatingDisorderRisk', t('profile.eatingDisorderRisk'))}
          {!canSave && <text className="Section-note">{t('review.unavailableBody')}</text>}
        </scroll-view>
        <SheetFeedback message={error} />
        <view className="Sheet-actions">
          {option(t('weightSheet.cancel'), false, handleClose)}
          <view className={`Sheet-btn primary${saving || !canSave ? ' disabled' : ''}`}
            accessibility-element={true} accessibility-traits={saving || !canSave ? 'disabled' : 'button'}
            accessibility-label={saving ? t('review.saving') : t(editing ? 'profile.save' : 'profile.finish')}
            hover-class="tap-feedback-hover" bindtap={saving || !canSave ? undefined : handleSave}>
            <text className="Sheet-btn-label primary">{saving ? t('review.saving') : t(editing ? 'profile.save' : 'profile.finish')}</text>
          </view>
        </view>
      </view>
    </view>
  );
}
