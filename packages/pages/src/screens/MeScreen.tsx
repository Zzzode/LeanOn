import { toolCapabilities } from '../state/capabilities.js';
import {useContext,useRef,type ReactNode} from '@lynx-js/react';
import {ModalInvokerContext} from '../components/ModalFocusContext.js';
import {newRecordId} from '../state/record-mutation.js';
import { IconBell, IconDiet, IconExport, IconHealth, IconInfo, IconScale, IconSettings } from '../components/MeIcons.js';
import type { ScreenProps } from './types.js';

interface MeRowProps { icon: ReactNode; label: string; val?: string; onTap?: () => void }
function MeRow({ icon, label, val, onTap }: MeRowProps) {
  const id=useRef(newRecordId('me-row')).current;const remember=useContext(ModalInvokerContext);
  return <view id={id} className="MeRow" flatten={onTap === undefined ? undefined : false}
    accessibility-element={true} accessibility-label={val === undefined ? label : `${label} · ${val}`}
    accessibility-traits={onTap === undefined ? 'text' : 'button'}
    hover-class={onTap === undefined ? undefined : 'tap-feedback-hover'} bindtap={onTap===undefined?undefined:()=>{remember(id,false);onTap();}}>
    {icon}<text className="MeRow-label">{label}</text>{val !== undefined && <text className="MeRow-val">{val}</text>}{onTap !== undefined && <text className="MeRow-chev" accessibility-hidden={true}>›</text>}
  </view>;
}

/** Local read-only identity and available tools precede unavailable connections. */
export function MeScreen({ hostData, locale, t, actions, supports, onEditProfile, personalAvailable, backupAvailable, onOpenPersonal }: Omit<ScreenProps, 'state' | 'supports'> & { state: ScreenProps['state'] | null; supports: (method: string) => boolean; onEditProfile: () => void;personalAvailable:boolean;backupAvailable:boolean;onOpenPersonal:(section:'dietary'|'measurements'|'photos'|'backup')=>void }) {
  const available = toolCapabilities(supports);
  return <view className="Tab-pane">
    <view className="ScreenTitle"><text className="ScreenTitle-text">{t('me.title')}</text></view>
    <view className="Card MeProfile">
      <view className="Summary-heading"><text className="Section-heading">{t('design.localProfile')}</text><text className="Summary-status">{t(hostData.setupCompleted ? 'design.localProfile' : 'profile.setupTitle')}</text></view>
      <view className="MeProfile-stats"><view><text className="Metric-label">{t('me.profile')}</text><text className="MeProfile-value">{hostData.profile === null ? '—' : `${hostData.profile.heightCm} cm`}</text></view><view><text className="Metric-label">{t('me.goals')}</text><text className="MeProfile-value">{hostData.goalWeightKg === null ? '—' : `${hostData.goalWeightKg} kg`}</text></view></view>
      <view className="Action-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t(hostData.setupCompleted?'closure.editProfile':'closure.setupAction')} bindtap={onEditProfile}><text className="Action-label">{t(hostData.setupCompleted?'closure.editProfile':'closure.setupAction')}</text></view>
      {hostData.guidanceMode === 'tracking-only' && <text className="Section-note">{t('closure.trackingNote')}</text>}
    </view>
    <view className="Open-section MeList"><text className="Section-heading">{t('design.appSection')}</text>
      <MeRow icon={<IconSettings />} label={t('me.settings')} val={locale === 'zh-CN' ? '中文' : 'English'} onTap={actions.openSettings} />
      <MeRow icon={<IconInfo />} label={t('me.about')} onTap={actions.openAbout} />
    </view>
    <view className="Open-section MeList"><text className="Section-heading">{t('design.connectionsSection')}</text>
      <MeRow icon={<IconHealth />} label={t('me.healthApp')} val={(supports('healthConnect.getStatus') || supports('healthKit.getStatus')) ? undefined : t('review.notAvailable')} onTap={(supports('healthConnect.getStatus') || supports('healthKit.getStatus')) ? actions.openHealthConnections : undefined} />
      <MeRow icon={<IconScale />} label={t('me.connectedScale')} val={available.scale ? undefined : t('review.hostUnsupported')} onTap={available.scale ? actions.openScale : undefined} />
      <MeRow icon={<IconBell />} label={t('me.reminders')} val={available.reminders ? undefined : t('review.hostUnsupported')} onTap={available.reminders ? actions.openReminders : undefined} />
      <MeRow icon={<IconDiet />} label={t('me.dietPrefs')} val={personalAvailable?undefined:t('review.hostUnsupported')} onTap={personalAvailable?()=>onOpenPersonal('dietary'):undefined} />
      <MeRow icon={<IconScale />} label={t('personal.measurements')} val={personalAvailable?undefined:t('review.hostUnsupported')} onTap={personalAvailable?()=>onOpenPersonal('measurements'):undefined} />
      <MeRow icon={<IconExport />} label={t('personal.photos')} val={personalAvailable?undefined:t('review.hostUnsupported')} onTap={personalAvailable?()=>onOpenPersonal('photos'):undefined} />
      <MeRow icon={<IconExport />} label={t('backup.title')} val={backupAvailable?undefined:t('review.hostUnsupported')} onTap={backupAvailable?()=>onOpenPersonal('backup'):undefined} />
    </view>
    <text className="Section-note">{t('review.localModeBody')}</text>
    <text className="MeVersion">LeanOn v0.1.0 · Apache-2.0</text>
  </view>;
}
