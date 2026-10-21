import {accountDeletionNewDataMustBeKept} from '../state/account-deletion.js';
import {useState} from '@lynx-js/react';
import {usePhotoPageAnchor} from '../state/photo-page-anchor.js';
import {photoPage} from '../state/photo-page.js';
import {PhotoPager} from '../components/PhotoPager.js';
import { MEASUREMENT_FIELDS } from '@zzzode/data';
import { LocalPhoto } from '../components/PhotosSheet.js';
import type { Translator } from '@zzzode/i18n';
import { BrandHeader } from '../components/BrandHeader.js';
import { WorkflowButton } from '../components/WorkflowSheet.js';
import { useTheme } from '../components/ThemeContext.js';
import { companionSessionActive, canSendEncouragement, canConfirmInvitation, type CompanionView } from '../state/companion-ui.js';
import type { CompanionWorkflow } from '../state/companion-actions.js';

export function PartnerScreen({t,view,loading,error,available,onRefresh,onSync,onOpen,onReadPhoto}:{t:Translator;view:CompanionView|null;loading:boolean;error:boolean;available:boolean;onRefresh:()=>void;onSync:()=>void;onOpen:(workflow:CompanionWorkflow,invitationId?:string)=>void;onReadPhoto:(id:string)=>Promise<string>}) {
  const [gallery,setGallery]=useState<{binding:string|null;page:number}>({binding:null,page:0});
  const binding=view?.companion.binding?.id??null;
  const deletion=view?.runtime.accountDeletion??null;
  const photos=photoPage(view?.companion.peerSnapshot?.photos??[],gallery.binding===binding?gallery.page:0);
  const photoAnchor=usePhotoPageAnchor(photos.index);
  const [tools,setTools]=useState<{account:string|null;expanded:boolean}>({account:null,expanded:false});
  const account=view?.companion.account?.id??null;
  const showTools=account!==null&&tools.account===account&&tools.expanded;
  const palette=useTheme();const companion=view?.companion;const signedIn=view!==null&&companionSessionActive(view);
  const motif=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 144"><circle cx="64" cy="30" r="10" fill="${palette.weight}"/><circle cx="88" cy="27" r="10" fill="${palette.partner}"/><rect x="36" y="46" width="48" height="86" rx="24" fill="${palette.weightTint}"/><rect x="76" y="42" width="48" height="90" rx="24" fill="${palette.partnerTint}"/></svg>`;
  return <view className="Tab-pane Partner-page">
    <BrandHeader/><view className="ScreenTitle"><text className="ScreenTitle-text">{t('partner.title')}</text></view>
    <view className="Partner-motif" accessibility-hidden={true}><svg className="Partner-motif-svg" content={motif}/></view>
    <text className="Partner-heading">{t('review.partnerWelcome')}</text><text className="Partner-body">{t('review.partnerBody')}</text>
    <view className="Open-section">
      {loading&&<text className="Section-note">{t('companion.loading')}</text>}
      {error&&<text className="Sheet-error">{t('companion.error')}</text>}
      {!available&&<text className="Section-note">{t('review.hostUnsupported')}</text>}
      {deletion!==null&&<view>
        <text className="Section-heading">{t('companion.deletionRecovery')} · {deletion.displayName}</text>
        <text className="Section-note">{deletion.accountId}</text>
        <text className="Section-note">{t(deletion.phase==='prepared'?'companion.deletionPrepared':deletion.phase==='local-complete'?'companion.deletionLocalComplete':view!==null&&accountDeletionNewDataMustBeKept(view)?'companion.deletionNewDataKept':deletion.localDataChanged?'companion.deletionDataChanged':'companion.deletionConfirmed')}</text>
        <WorkflowButton t={t} label={t('companion.deletionRecovery')} disabled={loading} onTap={()=>onOpen('deletion-recovery')}/>
      </view>}
      {deletion===null&&!signedIn&&<view>
        <text className="Section-heading">{t('companion.local')}</text><text className="Section-note Partner-local-note">{t('companion.localNote')}</text>
        {companion?.account!==null&&companion?.account!==undefined&&<text className="Section-note">{t('companion.reauth')}</text>}
        {view?.runtime.endpoint!==null&&view?.runtime.endpoint!==undefined&&<text className="Section-note">{view.runtime.endpoint}</text>}
        <view className="Workflow-actions"><WorkflowButton t={t} label={t('companion.server')} disabled={!available||loading} onTap={()=>onOpen('server')}/><WorkflowButton t={t} label={t('companion.signIn')} primary disabled={!available||loading||view?.runtime.endpoint===null||view===null} onTap={()=>onOpen('login')}/><WorkflowButton t={t} label={t('companion.register')} disabled={!available||loading||view?.runtime.endpoint===null||view===null} onTap={()=>onOpen('register')}/></view>
      </view>}
      {deletion===null&&signedIn&&companion!==undefined&&view!==null&&<view>

        {companion.binding===null?<view>
          <text className="Section-heading">{t('companion.noPartner')}</text>
          <view className="Workflow-actions"><WorkflowButton t={t} label={t('companion.invite')} disabled={!view.runtime.deviceAuthorized||loading} onTap={()=>onOpen('family-invite')}/><WorkflowButton t={t} label={t('companion.accept')} disabled={loading} onTap={()=>onOpen('accept')}/></view>
        </view>:<view>
          <text className="Section-heading">{t('companion.bound')} · {companion.binding.peer.displayName}</text>
<text className="Section-note">{t('companion.privateDefault')}</text>
          <view className="Workflow-actions"><WorkflowButton t={t} label={t('companion.sharing')} disabled={loading} onTap={()=>onOpen('sharing')}/><WorkflowButton t={t} label={t('companion.encourage')} disabled={loading||!canSendEncouragement(view)} onTap={()=>onOpen('message')}/></view>
          {!canSendEncouragement(view)&&<text className="Section-note">{t('companion.waitingConsent')}</text>}
        </view>}
        <text className="Section-heading">{t('companion.incoming')}</text>
        {companion.peerSnapshot===null&&<text className="Section-note">{t('companion.incomingEmpty')}</text>}
        {companion.peerSnapshot!==null&&!error&&<view>
          <text className="Section-note">{t('companion.updateTime',{time:companion.peerSnapshot.updatedAt})}</text>
          {companion.peerSnapshot.goal!==undefined&&<text className="List-label">{t('companion.category.goal')} · {t(companion.peerSnapshot.goal.guidanceMode==='tracking-only'?'profile.trackingOnly':'profile.weightLoss')}</text>}
          {companion.peerSnapshot.progressBand!==undefined&&<text className="List-label">{t('companion.category.progress_band')} · {t(`companion.progress.${companion.peerSnapshot.progressBand}`)}</text>}
          {companion.peerSnapshot.checkinStreak!==undefined&&<text className="List-label">{t('companion.category.checkin_streak')} · {companion.peerSnapshot.checkinStreak}</text>}
          {companion.peerSnapshot.exactWeightKg!==undefined&&<text className="List-label">{t('companion.category.exact_weight')} · {companion.peerSnapshot.exactWeightKg} kg</text>}
          {companion.peerSnapshot.meals?.map((meal,index)=><text key={`${meal.date}-${index}`} className="List-label">{meal.date} · {meal.name} · {meal.kcal} kcal</text>)}
          {companion.peerSnapshot.measurements?.map(row=><view key={row.id}><text className="List-label">{row.date} · {t('companion.category.body_measurements')}</text>{MEASUREMENT_FIELDS.filter(key=>row[key]!==undefined).map(key=><text key={key} className="Section-note">{t(`personal.${key}`)} · {row[key]} cm</text>)}</view>)}
          <view id={photoAnchor} flatten={false}>
          {photos.items.map(photo=><view key={photo.id}><LocalPhoto scope="partner" photo={photo} t={t} onRead={onReadPhoto}/></view>)}
          </view>
          <PhotoPager t={t} index={photos.index} totalPages={photos.totalPages} onPage={page=>setGallery({binding,page})}/>
          {companion.peerSnapshot.menstrual?.map((row,index)=><text key={`${row.startDate}-${index}`} className="List-label">{t('companion.category.menstrual')} · {row.startDate}</text>)}
        </view>}
        {companion.messages.map(message=><view key={message.id} className="Workflow-list-item"><text className="List-label">{message.text}</text><text className="Section-note">{message.createdAt} · {t(message.status==='delivered'?'companion.delivered':'companion.queued')}</text></view>)}
        {!view.runtime.deviceAuthorized&&<text className="Section-note">{t('companion.unauthorizedDevice')}</text>}
        <view className="Partner-tools">
          <WorkflowButton t={t} label={t(showTools?'companion.hideConnectionDetails':'companion.connectionDetails')} onTap={()=>setTools({account,expanded:!showTools})}/>
          {showTools&&<view>
        <text className="Section-heading">{companion.account?.displayName}</text><text className="Section-note">{companion.account?.id}</text>
        <text className="Section-note">{t(view.runtime.deviceAuthorized?'companion.paired':'companion.unauthorizedDevice')}</text>
        <text className="Section-note">{t(view.runtime.localDataAccountId===companion.account?.id?'companion.localAttached':'companion.localUnattached')}</text>
        {view.runtime.localDataAccountId!==companion.account?.id&&<WorkflowButton t={t} label={t('companion.attach')} disabled={loading||!view.runtime.deviceAuthorized} onTap={()=>onOpen('attach')}/>}

        <text className="Section-heading">{t('companion.sync')}</text>
        <text className="Section-note">{t(view.runtime.syncState==='offline'?'companion.offline':view.runtime.syncState==='syncing'?'companion.syncing':view.runtime.syncState==='error'?'companion.error':view.runtime.pendingChanges>0?'companion.pendingSync':view.runtime.lastSyncAt===null?'companion.notSynced':'companion.synced',{count:view.runtime.pendingChanges})}</text>
        {view.runtime.syncState==='error'&&<text className="Sheet-error">{t('companion.error')}</text>}
        {view.runtime.lastSyncAt!==null&&<text className="Section-note">{t('companion.updateTime',{time:view.runtime.lastSyncAt})}</text>}
        <WorkflowButton t={t} label={t('companion.sync')} primary disabled={loading||!view.runtime.deviceAuthorized||view.runtime.syncState==='syncing'} onTap={onSync}/>
        {companion.invitations.map(invitation=><view key={invitation.id} className="Workflow-list-item">
          <text className="List-label">{t(invitation.kind==='device'?'companion.deviceInvitation':'companion.partnerInvitation')}</text>
          <text className="Section-note">{t(invitation.status==='awaiting-confirmation'?'companion.confirmInvite':'companion.pending')}</text>
          <text className="Section-note">{t('companion.expires',{time:invitation.expiresAt})}</text>
          {canConfirmInvitation(invitation,view.runtime.nativeNow)&&<WorkflowButton t={t} label={t('companion.confirmInvite')} disabled={loading} onTap={()=>onOpen('confirm-invite',invitation.id)}/>}
          <WorkflowButton t={t} label={t('companion.cancelInvite')} disabled={loading} onTap={()=>onOpen('confirm-invite',invitation.id)}/>
        </view>)}
            {companion.binding!==null&&<view><text className="Section-note">{companion.binding.peer.id}</text><WorkflowButton t={t} label={t('companion.unlink')} danger disabled={loading} onTap={()=>onOpen('unlink')}/></view>}
        <view className="Workflow-actions"><WorkflowButton t={t} label={t('companion.pairDevice')} disabled={loading||!view.runtime.deviceAuthorized} onTap={()=>onOpen('device-invite')}/><WorkflowButton t={t} label={t('companion.accept')} disabled={loading} onTap={()=>onOpen('accept')}/><WorkflowButton t={t} label={t('companion.signOut')} disabled={loading} onTap={()=>onOpen('logout')}/><WorkflowButton t={t} label={t('companion.deleteAccount')} danger disabled={loading||!view.runtime.deviceAuthorized} onTap={()=>onOpen('delete')}/></view>
          </view>}
        </view>
      </view>}
      <WorkflowButton t={t} label={t('companion.refresh')} disabled={!available||loading} onTap={onRefresh}/>
    </view>
  </view>;
}
