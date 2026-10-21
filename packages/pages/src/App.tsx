import {ModalInvokerContext} from './components/ModalFocusContext.js';
import {createModalFocusReturnController,focusVisibleModalInvoker} from './state/modal-focus.js';
import {AccountDeletionSheet} from './components/AccountDeletionSheet.js';
import {accountDeletionActionAllowed} from './state/account-deletion.js';
import { PhotoPreviewContext } from './components/PhotoPreviewContext.js';
import { initialPhotoPreviewLifecycle,invalidatePhotoPreviews,updatePhotoLifecycle } from './state/photo-preview.js';
import { PersonalConflictSheet } from './components/PersonalConflictSheet.js';
import { reviewPersonalRequest } from './state/personal-ui.js';
import { localAttachmentPreview,type LocalAttachmentPreview } from './state/local-attachment.js';
import { type PersonalStateDto, type PersonalMutationRequestDto } from '@zzzode/data';
import { DietaryPreferencesSheet } from './components/DietaryPreferencesSheet.js';
import { MeasurementsSheet } from './components/MeasurementsSheet.js';
import { PhotosSheet, type PhotoPickRequest } from './components/PhotosSheet.js';
import { BackupSheet } from './components/BackupSheet.js';
import { MigrationSheet } from './components/MigrationSheet.js';
import { CompanionSheet } from './components/CompanionSheet.js';
import { WorkflowSheet, WorkflowButton, WorkflowDismissContext } from './components/WorkflowSheet.js';
import { readPersonal, newestPersonal, savePersonal } from './state/personal-client.js';
import { inspectBackup, restoreBackup } from './state/backup-client.js';
import { type BackupInspection } from './state/backup-ui.js';
import { readCompanionView, type CompanionView } from './state/companion-ui.js';
import { invokeCompanionAction } from './state/companion-client.js';
import type { CompanionAction, CompanionWorkflow } from './state/companion-actions.js';
import { createModalDismissController } from './state/modal-dismiss.js';
import './App.css';
import './theme.generated.css';
import { useEffect, useInitData, useMemo, useRef, useState } from '@lynx-js/react';
import {
  createTranslator,
  resolveLocale,
  type Locale,
} from '@zzzode/i18n';
import { type LeanOnRpcContract, type RecordMutation, type RecordKind, type IntakeEntry, type WeightRecord, type WaterRecord, type LegacyIntakeRecord, hasLynxHost, isAppearanceState, type AppearancePreference, type AppearanceState } from '@zzzode/bridge';
import { ConflictReviewSheet, type ConflictReview } from './components/ConflictReviewSheet.js';
import { ProfileSheet } from './components/ProfileSheet.js';
import { IntakeEditSheet } from './components/IntakeEditSheet.js';
import { RecordEditSheet } from './components/RecordEditSheet.js';
import { InsightsScreen } from './components/InsightsScreen.js';
import { openRecordDraft, saveRecordDraft, saveRecordDraftWithRecovery, newRecordId, isRecordConflict, advanceDraftAfterAuxiliary, newestRecordSnapshot, reviewConflictedDraft, type RecordDraft } from './state/record-mutation.js';
import { weightForRecordDate, exerciseEstimateForDate } from './state/exercise-estimate.js';
import { scanFood, lookupBarcodeFood, fetchScannerStatus, createBarcodeOperationGate, type ScanFoodPhase, type ScanFoodResult } from './state/scan-food.js';
import type { ExerciseSample, ReminderSettings } from '@zzzode/core';
import { BottomTabBar } from './components/BottomTabBar.js';
import { ExerciseSheet } from './components/ExerciseSheet.js';
import { FoodSheet } from './components/FoodSheet.js';
import { HealthConnectSheet } from './components/HealthConnectSheet.js';
import { healthProvider, readHealthConnection, type HealthConnection } from './state/health-connection.js';
import { ReminderSheet } from './components/ReminderSheet.js';
import { ScaleSheet } from './components/ScaleSheet.js';
import { SettingsScreen } from './components/SettingsScreen.js';
import { supportsMethod, toolCapabilities } from './state/capabilities.js';
import { fetchReminderSettings, persistReminders } from './state/reminders.js';
import { WeightSheet } from './components/WeightSheet.js';
import { ThemeContext } from './components/ThemeContext.js';
import { palettes } from './state/theme.js';
import { createAppBridge } from './state/app-bridge.js';
import { bootstrapHostData, readHostDataEnvelope } from './state/host-data.js';
import { selectToday } from './state/select.js';
import type { HostData } from './state/types.js';
import {
  isAppRoute,
  type AppRoute,
  type PrimaryRoute,
  type PushedRoute,
} from './state/routes.js';
import { DiaryScreen } from './screens/DiaryScreen.js';
import { MeScreen } from './screens/MeScreen.js';
import { PartnerScreen } from './screens/PartnerScreen.js';
import { ProgressScreen } from './screens/ProgressScreen.js';
import { TrackingTodayScreen } from './screens/TrackingTodayScreen.js';
import { TodayScreen } from './screens/TodayScreen.js';
import type { ScreenActions, ScreenProps } from './screens/types.js';

type ActiveSheet = 'none' | 'weight' | 'scale' | 'food' | 'exercise' | 'profile' | 'intake-edit' | 'record-edit' | 'dietary' | 'measurements' | 'photos' | 'backup' | 'companion' | 'migration';

interface BootstrapData {
  hostData?: unknown;
  locale?: string;
  supportedMethods?: string[];
  /** Route requested by the native shell (RFC 0028). Absent => dev shell. */
  route?: string;
  appearancePreference?: AppearancePreference;
  appearance?: 'light' | 'dark';
  platform?: 'ios' | 'android';
}

export function App() {
  const initData = useInitData() as BootstrapData | undefined;
  const isPreview = initData?.route === undefined && !hasLynxHost();
  const [hostData, setHostData] = useState<HostData | null>(
    bootstrapHostData(initData?.hostData, isPreview),
  );
  const hostDataRef = useRef(hostData);
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(
    initData?.platform === 'ios' || initData?.platform === 'android' ? initData.platform : null,
  );
  const [locale, setLocale] = useState<Locale>(resolveLocale(initData?.locale));
  const bootstrapAppearance = { preference: initData?.appearancePreference, resolved: initData?.appearance };
  const [appearance, setAppearance] = useState<AppearanceState>(isAppearanceState(bootstrapAppearance)
    ? bootstrapAppearance : { preference: 'system', resolved: 'light' });
  const appearanceRevision = useRef(0);
  const palette = palettes[appearance.resolved];
  const [weightNeededDate,setWeightNeededDate]=useState<string|null>(null);
  const [info, setInfo] = useState<'about' | 'unavailable' | 'hostUnsupported' | 'weightNeeded' | null>(null);
  const supports = (method: string) => supportsMethod(method, initData?.supportedMethods, isPreview);
  const toolsAvailable = toolCapabilities(supports);
  const [selectedDate, setSelectedDate] = useState<string>(bootstrapHostData(initData?.hostData, isPreview)?.today ?? '');
  const draft = useRef<RecordDraft | null>(null);
  const mutationPending = useRef(false);
  const immediateDrafts = useRef(new Map<string, RecordDraft>());
  const restorePending = useRef(new Set<string>());
  const [editingWeight, setEditingWeight] = useState<number | undefined>(undefined);
  const [editingIntake, setEditingIntake] = useState<IntakeEntry | null>(null);
  const [recordCreating,setRecordCreating]=useState(false);
  const [editingRecord, setEditingRecord] = useState<{ kind: 'weight'; value: WeightRecord } | { kind: 'water'; value: WaterRecord } | { kind: 'exercise'; value: ExerciseSample } | {kind:'legacy-intake';value:LegacyIntakeRecord} | null>(null);
  const [conflictReview, setConflictReview] = useState<ConflictReview|null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordLoadError, setRecordLoadError] = useState(false);
  const snapshotRevision = useRef(0);
  const presentationSequence = useRef(0);
  const conflictReviewRevision=useRef(0);
  const [deleteTarget, setDeleteTarget] = useState<{kind: RecordKind; id: string; label: string; draft: RecordDraft} | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const deleteLock = useRef(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [undoToken, setUndoToken] = useState<string | null>(null);
  const [undoError, setUndoError] = useState(false);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>('none');
  // A native shell passes a route and renders its own tab bar. Without one the
  // bundle runs the in-Lynx developer shell (tab bar + pushed-page stack).
  const nativeRoute: AppRoute | undefined = isAppRoute(initData?.route ?? '')
    ? (initData?.route as AppRoute)
    : undefined;
  const isNativeShell = nativeRoute !== undefined;
  const [devTab, setDevTab] = useState<PrimaryRoute>('today');
  const [devStack, setDevStack] = useState<PushedRoute[]>([]);
  const [initialFoodId, setInitialFoodId] = useState<string | undefined>(
    undefined,
  );
  const [initialFoodGrams,setInitialFoodGrams]=useState<number|undefined>(undefined);
  const barcodeGate = useRef(createBarcodeOperationGate());
  const modalDismiss = useRef(createModalDismissController());
  const modalFocus=useRef(createModalFocusReturnController());
  const [foodSelectionVersion,setFoodSelectionVersion]=useState(0);
  const foodSession = useRef(0);
  const [reminderSettings, setReminderSettings] =
    useState<ReminderSettings | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderLoadError, setReminderLoadError] = useState(false);
  const reminderRevision = useRef(0);
  const [reminderOpen, setReminderOpen] = useState<boolean>(false);
  const provider = healthProvider(initData?.supportedMethods, isPreview);
  const [healthConnection, setHealthConnection] = useState<HealthConnection | null>(null);
  const [healthLoading, setHealthLoading] = useState(provider !== null);
  const [healthLoadError, setHealthLoadError] = useState(false);
  const healthRevision = useRef(0);
  const [hcOpen, setHcOpen] = useState<boolean>(false);

  const [photoPreviews,setPhotoPreviews]=useState(initialPhotoPreviewLifecycle);
  const [personal,setPersonal]=useState<PersonalStateDto|null>(null);
  const personalRef=useRef<PersonalStateDto|null>(null);
  const [personalLoading,setPersonalLoading]=useState(false);
  const [personalError,setPersonalError]=useState(false);
  const personalErrorRef=useRef(false);const personalSequence=useRef(0);
  const [personalConflict,setPersonalConflict]=useState<{request:PersonalMutationRequestDto|PhotoPickRequest;latest:PersonalStateDto|null;error:boolean}|null>(null);
  const [companion,setCompanion]=useState<CompanionView|null>(null);
  const companionRef=useRef<CompanionView|null>(null);
  const acceptCompanion=(next:CompanionView)=>{companionRef.current=next;setCompanion(next);};
  const [companionLoading,setCompanionLoading]=useState(false);
  const [companionError,setCompanionError]=useState(false);
  const companionSequence=useRef(0);
  const [companionWorkflow,setCompanionWorkflow]=useState<CompanionWorkflow>('server');
  const [attachmentPreview,setAttachmentPreview]=useState<LocalAttachmentPreview|undefined>(undefined);
  const [invitationId,setInvitationId]=useState<string|undefined>(undefined);
  const required=(methods:string[])=>!isPreview&&methods.every(supports);
  const personalAvailable=required(['personal.getState','personal.mutate','personal.pickPhoto','personal.getPhoto']);
  const backupAvailable=required(['backup.export','backup.inspectImport','backup.restore']);
  const companionAvailable=required(['companion.attachLocalData','companion.getState','companion.configure','companion.register','companion.login','companion.logout','companion.deleteAccount','companion.confirmAccountDeletionLocalData','companion.createInvitation','companion.acceptInvitation','companion.confirmInvitation','companion.cancelInvitation','companion.setSharing','companion.sync','companion.sendEncouragement','companion.unlink']);
  const bridge = useMemo(() => createAppBridge(isNativeShell), [isNativeShell]);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const state = useMemo(() => hostData === null ? null : selectToday(hostData), [hostData]);
  const modalActive = activeSheet !== 'none' || reminderOpen || hcOpen || info !== null || deleteTarget !== null || conflictReview !== null || personalConflict !== null;

  useEffect(()=>{
    if(modalActive){modalFocus.current.opened();return;}
    return modalFocus.current.closed((id,isCurrent)=>{
      focusVisibleModalInvoker(id,isCurrent,(target,onRevealed)=>{
        lynx.createSelectorQuery().select(`#${target}`).invoke({method:'scrollIntoView',params:{scrollIntoViewOptions:{block:'center',inline:'start',behavior:'none'}},success:onRevealed,fail:onRevealed}).exec();
      },target=>lynx.createSelectorQuery().select(`#${target}`).invoke({method:'requestAccessibilityFocus'}).exec());
    },callback=>{const timer=setTimeout(callback,100);return()=>clearTimeout(timer);});
  },[modalActive]);

  useEffect(() => {
    if (!isNativeShell) return;
    void bridge.invoke('app.setModalActive', { active: modalActive }).catch(() => {});
    return () => {
      void bridge.invoke('app.setModalActive', { active: false }).catch(() => {});
    };
  }, [bridge, isNativeShell, modalActive]);

  useEffect(() => bridge.subscribe('app.dismissModal', () => {
    modalDismiss.current.dismiss(mutationPending.current || deleteLock.current || barcodeGate.current.importing, () => {
    setActiveSheet('none');setPersonalConflict(null);
    setEditingExercise(null);
    setReminderOpen(false);
    setHcOpen(false);
    setInfo(null);
    setInitialFoodId(undefined);
    setInitialFoodGrams(undefined);
    foodSession.current += 1;
    setDeleteTarget(null);
    conflictReviewRevision.current+=1; setConflictReview(null);
    draft.current = null;
    });
  }), [bridge]);

  useEffect(() => bridge.subscribe('app.localeChanged', ({ locale: nextLocale }) => setLocale(nextLocale)), [bridge]);
  useEffect(() => bridge.subscribe('app.appearanceChanged', payload => {
    if (isAppearanceState(payload)) { appearanceRevision.current += 1; setAppearance(payload); }
  }), [bridge]);

  useEffect(() => {
    let active = true;
    const revision = appearanceRevision.current;
    void bridge.invoke('app.getAppearance').then(response => {
      if (active && revision === appearanceRevision.current && isAppearanceState(response)) setAppearance(response);
    }).catch(() => {});
    return () => { active = false; };
  }, [bridge]);

  const handleLocaleChange = async (nextLocale: Locale): Promise<void> => {
    if (!isNativeShell) { setLocale(nextLocale); return; }
    const response = await bridge.invoke('app.setLocale', { locale: nextLocale });
    setLocale(response.locale);
  };

  const handleAppearanceChange = async (preference: AppearancePreference): Promise<void> => {
    const revision = ++appearanceRevision.current;
    const response = await bridge.invoke('app.setAppearance', { preference });
    if (response.success !== true || !isAppearanceState(response)) throw new Error('Invalid appearance response');
    if (revision === appearanceRevision.current) setAppearance(response);
  };

  // External writes (BLE scale, later sync) push a fresh snapshot through
  // records.changed; Home refreshes without knowing the source (RFC 0011).
  useEffect(() => {
    const unsubscribe = bridge.subscribe('records.changed', (payload) => {
      snapshotRevision.current += 1;
      const next = readHostDataEnvelope(payload);
      if(next !== null) {const previous=hostDataRef.current;hostDataRef.current = newestRecordSnapshot(previous,next);if(hostDataRef.current!==previous)presentationSequence.current+=1;setHostData(hostDataRef.current);}
      setRecordLoading(false);
      setRecordLoadError(next === null);
      if (next !== null) setSelectedDate(previous => previous === '' ? next.today : previous);
    });
    return unsubscribe;
  }, [bridge]);

  useEffect(() => {
    if (platform !== null || !supports('app.getInfo')) return;
    let active = true;
    void bridge.invoke('app.getInfo').then(info => {
      if (active && (info.platform === 'ios' || info.platform === 'android')) setPlatform(info.platform);
    }).catch(() => {});
    return () => { active = false; };
  }, [bridge, platform]);

  const refreshReminders = async (): Promise<void> => {
    const revision = ++reminderRevision.current;
    setReminderLoading(true);
    setReminderLoadError(false);
    try {
      const settings = await fetchReminderSettings(bridge);
      if (revision === reminderRevision.current) setReminderSettings(settings);
    } catch {
      if (revision === reminderRevision.current) {
        setReminderSettings(null);
        setReminderLoadError(true);
      }
    } finally {
      if (revision === reminderRevision.current) setReminderLoading(false);
    }
  };
  useEffect(() => {
    if (!supports('notification.getSettings')) return;
    void refreshReminders();
    return () => { reminderRevision.current += 1; };
  }, [bridge]);

  const fetchHealthConnection = async (): Promise<HealthConnection> => {
    if (provider === null) throw new Error('Health connection unavailable');
    const response = provider === 'health-kit'
      ? await bridge.invoke('healthKit.getStatus') : await bridge.invoke('healthConnect.getStatus');
    const connection = readHealthConnection(provider, response);
    if (connection === null) throw new Error('Invalid health connection status');
    return connection;
  };
  const refreshHealthConnection = async (): Promise<void> => {
    const revision = ++healthRevision.current;
    setHealthLoading(true);
    setHealthLoadError(false);
    try {
      const connection = await fetchHealthConnection();
      if (revision === healthRevision.current) setHealthConnection(connection);
    } catch {
      if (revision === healthRevision.current) setHealthLoadError(true);
    } finally {
      if (revision === healthRevision.current) setHealthLoading(false);
    }
  };
  useEffect(() => {
    if (provider === null) return;
    void refreshHealthConnection();
    return () => { healthRevision.current += 1; };
  }, [bridge, provider]);

  const requireHostData = (): HostData => {
    if (hostDataRef.current === null) throw new Error('Host records unavailable');
    return hostDataRef.current;
  };
  const acceptHostData = (value: unknown, auxiliaryBase?:number, requestStartedAt?:number): HostData => {
    const next = readHostDataEnvelope(value);
    if (next === null) {setRecordLoadError(true);throw new Error('Invalid host records');}
    const previous=hostDataRef.current;
    hostDataRef.current = newestRecordSnapshot(previous,next,requestStartedAt===undefined?undefined:{requestStartedAt,currentSequence:presentationSequence.current});
    if(hostDataRef.current!==previous)presentationSequence.current+=1;
    setHostData(hostDataRef.current);
    if(auxiliaryBase !== undefined) advanceDraftAfterAuxiliary(draft.current,auxiliaryBase,next,hostDataRef.current);
    return next;
  };

  const refreshRecords = async (): Promise<void> => {
    const revision = ++snapshotRevision.current;
    const requestStartedAt=presentationSequence.current;
    setRecordLoading(true);
    try {
      const response = await bridge.invoke('records.getSnapshot');
      const next = readHostDataEnvelope(response);
      if (next === null) throw new Error('Invalid records snapshot');
      if (revision === snapshotRevision.current) {
        const previous=hostDataRef.current;hostDataRef.current = newestRecordSnapshot(previous,next,{requestStartedAt,currentSequence:presentationSequence.current});if(hostDataRef.current!==previous)presentationSequence.current+=1;setHostData(hostDataRef.current); setRecordLoadError(false);
        setSelectedDate(previous => previous === '' ? next.today : previous);
      }
    } catch {
      if (revision === snapshotRevision.current) setRecordLoadError(true);
    } finally { if (revision === snapshotRevision.current) setRecordLoading(false); }
  };
  useEffect(() => {
    if (!supports('records.getSnapshot')) return;
    void refreshRecords();
    const timer = setInterval(() => { void refreshRecords(); }, 60_000);
    return () => { clearInterval(timer); snapshotRevision.current += 1; };
  }, [bridge]);

  const acceptPersonal=(next:PersonalStateDto)=>{personalRef.current=newestPersonal(personalRef.current,next);setPersonal(personalRef.current);};
  const refreshPersonal=async():Promise<PersonalStateDto>=>{
    const sequence=++personalSequence.current;setPersonalLoading(true);
    try{const next=readPersonal(await bridge.invoke('personal.getState'));if(next===null)throw new Error('Invalid personal state');
      if(sequence===personalSequence.current){acceptPersonal(next);personalErrorRef.current=false;setPersonalError(false);}return next;
    }catch(error){if(sequence===personalSequence.current){personalErrorRef.current=true;setPersonalError(true);}throw error;}
    finally{if(sequence===personalSequence.current)setPersonalLoading(false);}
  };
  const refreshCompanion=async():Promise<void>=>{
    const sequence=++companionSequence.current;setCompanionLoading(true);
    try{const next=readCompanionView(await bridge.invoke('companion.getState'));if(next===null)throw new Error('Invalid companion state');
      if(sequence===companionSequence.current){
        const previous=companionRef.current?.runtime.accountDeletion;
        acceptCompanion(next);setCompanionError(false);
        if(previous!==undefined&&previous!==null&&previous.phase!=='local-complete'&&(next.runtime.accountDeletion===null||next.runtime.accountDeletion.phase==='local-complete')){
          await refreshRecords();await refreshPersonal().catch(()=>{});
        }
      }}
    catch(error){if(sequence===companionSequence.current)setCompanionError(true);throw error;}
    finally{if(sequence===companionSequence.current)setCompanionLoading(false);}
  };
  useEffect(()=>{
    if(!personalAvailable)return;void refreshPersonal().catch(()=>{});
    const timer=setInterval(()=>{if(!mutationPending.current)void refreshPersonal().catch(()=>{});},60_000);
    return()=>{clearInterval(timer);personalSequence.current+=1;};
  },[bridge,personalAvailable]);
  useEffect(()=>{
    if(!companionAvailable)return;void refreshCompanion().catch(()=>{});
    const timer=setInterval(()=>{if(!mutationPending.current)void refreshCompanion().catch(()=>{});},30_000);
    return()=>{clearInterval(timer);companionSequence.current+=1;};
  },[bridge,companionAvailable]);
  useEffect(()=>bridge.subscribe('app.photoPreviewsInvalidated',payload=>setPhotoPreviews(current=>invalidatePhotoPreviews(current,payload))),[bridge]);
  useEffect(()=>bridge.subscribe('app.lifecycle',payload=>setPhotoPreviews(current=>updatePhotoLifecycle(current,payload))),[bridge]);
  useEffect(()=>bridge.subscribe('personal.changed',payload=>{
    personalSequence.current+=1;const next=readPersonal(payload);setPersonalLoading(false);
    if(next===null){personalErrorRef.current=true;setPersonalError(true);return;}
    acceptPersonal(next);personalErrorRef.current=false;setPersonalError(false);
  }),[bridge]);
  useEffect(()=>bridge.subscribe('companion.changed',payload=>{
    companionSequence.current+=1;const next=readCompanionView(payload);setCompanionLoading(false);
    if(next===null){setCompanionError(true);return;}acceptCompanion(next);setCompanionError(false);
  }),[bridge]);
  const openPersonal=(section:'dietary'|'measurements'|'photos'|'backup')=>{
    if(!(section==='backup'?backupAvailable:personalAvailable)){setInfo('hostUnsupported');return;}
    setActiveSheet(section);
    if(section!=='backup'&&(personalRef.current===null||personalErrorRef.current))void refreshPersonal().catch(()=>{});
  };
  const handlePersonalSave=async(request:PersonalMutationRequestDto)=>{
    if(mutationPending.current)throw new Error('Write pending');mutationPending.current=true;personalSequence.current+=1;
    try{const next=await savePersonal(bridge,request,personalErrorRef.current,value=>{acceptPersonal(value);personalErrorRef.current=false;setPersonalError(false);});
      acceptPersonal(next);personalErrorRef.current=false;setPersonalError(false);
    }catch(error){if(isRecordConflict(error)){setPersonalConflict({request,latest:null,error:false});try{const latest=await refreshPersonal();setPersonalConflict({request,latest,error:false});}catch{setPersonalConflict({request,latest:null,error:true});}}throw error;}
    finally{mutationPending.current=false;setPersonalLoading(false);}
  };
  const handlePhotoPick=async(request:PhotoPickRequest):Promise<boolean>=>{
    if(mutationPending.current)throw new Error('Write pending');mutationPending.current=true;personalSequence.current+=1;
    try{if(personalErrorRef.current)await refreshPersonal();const response=await bridge.invoke('personal.pickPhoto',request);if(response.cancelled===true)return false;
      const next=readPersonal(response);if(next===null||!next.photos.some(photo=>photo.id===response.photoId))throw new Error('Invalid photo import');acceptPersonal(next);personalErrorRef.current=false;setPersonalError(false);return true;
    }catch(error){if(isRecordConflict(error)){setPersonalConflict({request,latest:null,error:false});try{const latest=await refreshPersonal();setPersonalConflict({request,latest,error:false});}catch{setPersonalConflict({request,latest:null,error:true});}}throw error;}finally{mutationPending.current=false;}
  };
  const readPhoto=async(id:string,scope:'own'|'partner'='own'):Promise<string>=>{
    const value=await bridge.invoke('personal.getPhoto',{id,scope});
    if(typeof value.uri!=='string'||value.uri===''||!Number.isFinite(value.width)||value.width<=0||!Number.isFinite(value.height)||value.height<=0)throw new Error('Invalid photo preview');
    return value.uri;
  };
  const handleBackupExport=async(password:string):Promise<boolean>=>{
    if(mutationPending.current)throw new Error('Operation pending');mutationPending.current=true;
    try{const result=await bridge.invoke('backup.export',{password});if(typeof result.cancelled!=='boolean')throw new Error('Invalid export result');return !result.cancelled;}
    finally{mutationPending.current=false;}
  };
  const handleBackupInspect=async(password:string):Promise<BackupInspection|null>=>{
    if(mutationPending.current)throw new Error('Operation pending');mutationPending.current=true;
    try{return await inspectBackup(bridge,password);}
    finally{mutationPending.current=false;}
  };
  const handleBackupRestore=async(preview:BackupInspection):Promise<void>=>{
    if(mutationPending.current)throw new Error('Operation pending');mutationPending.current=true;
    const requestStartedAt=presentationSequence.current;snapshotRevision.current+=1;personalSequence.current+=1;
    try{const result=await restoreBackup(bridge,preview,true);
      acceptHostData(result,undefined,requestStartedAt);acceptPersonal(result.personal);setRecordLoadError(false);personalErrorRef.current=false;setPersonalError(false);immediateDrafts.current.clear();setUndoToken(null);setUndoError(false);
    }finally{mutationPending.current=false;}
  };
  const handleCompanionAction=async(action:CompanionAction)=>{
    if(!accountDeletionActionAllowed(companionRef.current,action))throw new Error('Account deletion recovery required');
    if(mutationPending.current)throw new Error('Operation pending');mutationPending.current=true;
    const sequence=++companionSequence.current;const requestStartedAt=presentationSequence.current;setCompanionLoading(true);
    try{const result=await invokeCompanionAction(bridge,action,companionRef.current);
      if(sequence===companionSequence.current){acceptCompanion(result.view);setCompanionError(false);}
      if(result.hostData!==undefined){snapshotRevision.current+=1;acceptHostData({hostData:result.hostData},undefined,requestStartedAt);setRecordLoadError(false);}
      if(result.personal!==undefined){personalSequence.current+=1;acceptPersonal(result.personal);personalErrorRef.current=false;setPersonalError(false);}
      if((action.type==='deleteAccount'||action.type==='confirmAccountDeletionLocalData')&&action.deleteLocalData&&(result.view.runtime.accountDeletion===null||result.view.runtime.accountDeletion.phase==='local-complete')){
        snapshotRevision.current+=1;personalSequence.current+=1;hostDataRef.current=null;setHostData(null);personalRef.current=null;setPersonal(null);setUndoToken(null);immediateDrafts.current.clear();
        await refreshRecords();await refreshPersonal().catch(()=>{});
      }
      return result;
    }catch(error){
      // Failed replies can follow durable native preparation or local revocation. Read status without repeating the write.
      try{const latest=readCompanionView(await bridge.invoke('companion.getState'));if(latest!==null&&sequence===companionSequence.current){
        acceptCompanion(latest);
        if((action.type==='deleteAccount'||action.type==='confirmAccountDeletionLocalData')&&(latest.runtime.accountDeletion===null||latest.runtime.accountDeletion.phase==='local-complete')){await refreshRecords();await refreshPersonal().catch(()=>{});}
      }}catch{}
      if(sequence===companionSequence.current)setCompanionError(true);throw error;
    }
    finally{mutationPending.current=false;if(sequence===companionSequence.current)setCompanionLoading(false);}
  };
  const refreshLocalAttachment=async():Promise<LocalAttachmentPreview>=>{
    const requestStartedAt=presentationSequence.current;
    const response=await bridge.invoke('records.getSnapshot');const records=readHostDataEnvelope(response);
    if(records===null)throw new Error('Local records unavailable');snapshotRevision.current+=1;acceptHostData(response,undefined,requestStartedAt);setRecordLoadError(false);
    const value=await refreshPersonal();return localAttachmentPreview(records,value);
  };
  const openCompanion=(workflow:CompanionWorkflow,id?:string)=>{setAttachmentPreview((workflow==='attach'||workflow==='deletion-recovery')&&hostDataRef.current!==null&&personalRef.current!==null&&!recordLoadError&&!personalErrorRef.current?localAttachmentPreview(hostDataRef.current,personalRef.current):undefined);setCompanionWorkflow(companionRef.current?.runtime.accountDeletion!==null&&companionRef.current?.runtime.accountDeletion!==undefined?'deletion-recovery':workflow);setInvitationId(id);setActiveSheet('companion');};

  const beginDraft = (date?: string, id?: string): boolean => {
    if (hostData === null || recordLoadError || !supports('records.mutate')) return false;
    draft.current = openRecordDraft(hostData, date ?? hostData.today, id);
    return true;
  };
  const mutateDraft = async (mutation: RecordMutation, current = draft.current) => {
    if (current === null) throw new Error('Record draft unavailable');
    if (mutationPending.current) throw new Error('Record write pending');
    mutationPending.current = true;
    const requestStartedAt=presentationSequence.current;
    let result: Awaited<ReturnType<typeof saveRecordDraft>>;
    try {
      result = await saveRecordDraftWithRecovery(bridge, current, mutation, recordLoadError, snapshot => {
        snapshotRevision.current += 1;
        acceptHostData({hostData:snapshot},undefined,requestStartedAt);
        setRecordLoadError(false);setRecordLoading(false);
      });
    }
    catch(error) {if(isRecordConflict(error)){conflictReviewRevision.current+=1;setConflictReview({draft:current,latest:null,loading:false,error:false});}throw error;}
    finally { mutationPending.current = false; }
    snapshotRevision.current += 1;
    const previous=hostDataRef.current;hostDataRef.current = newestRecordSnapshot(previous,result.hostData,{requestStartedAt,currentSequence:presentationSequence.current});if(hostDataRef.current!==previous)presentationSequence.current+=1;setHostData(hostDataRef.current); setRecordLoadError(false); setRecordLoading(false);
    return result;
  };
  const handleSaveWeight = async (weightKg: number) => {
    if (draft.current === null) throw new Error('Weight draft unavailable');
    await mutateDraft({ type: 'set-weight', date: draft.current.date, weightKg });
    setActiveSheet('none'); draft.current = null;
  };
  const handleSaveIntake = async (meal: {foodId:string; name:string; grams:number; kcal:number; macros:HostData['intake'][number]['macros']; micros:HostData['intake'][number]['micros']; meal:'breakfast'|'lunch'|'dinner'|'snack'}) => {
    const current = draft.current;
    if (current === null) throw new Error('Intake draft unavailable');
    await mutateDraft({ type:'save-intake', entry: { ...meal, id: current.id, date: current.date } });
    setActiveSheet('none'); draft.current = null;
  };
  const handleSetWaterTotal = async (amountMl: number) => {
    const data = requireHostData();
    if (recordLoadError || !supports('records.mutate')) throw new Error('Water recording unavailable');
    const key = `water-${data.today}-${amountMl}`;
    const pendingDraft = immediateDrafts.current.get(key) ?? openRecordDraft(data);
    immediateDrafts.current.set(key,pendingDraft);
    await mutateDraft({ type:'set-water', date: data.today, amountMl }, pendingDraft);
    immediateDrafts.current.delete(key);
  };
  const [editingExercise, setEditingExercise] = useState<{id:string;typeId:string;durationMin:number} | null>(null);
  const handleEditExercise = (session: {id:string;typeId:string;durationMin:number}) => {
    const record = hostData?.exercises.find(item => item.id === session.id);
    if (record === undefined || !beginDraft(record.date, record.id)) return;
    setRecordCreating(false); setEditingRecord({ kind:'exercise', value:record }); setActiveSheet('record-edit');
  };
  const handleSaveExercise = async (session: {typeId:string;durationMin:number;kcal:number}) => {
    const current = draft.current;
    if (current === null) throw new Error('Exercise draft unavailable');
    const kcal=exerciseEstimateForDate(requireHostData(),current.date,session.typeId,session.durationMin);
    if(kcal===null)throw new Error('Historical weight required');
    await mutateDraft({ type:'save-exercise', exercise:{...session,kcal,id:current.id,date:current.date,source:'leanon'} });
    setEditingExercise(null); setActiveSheet('none'); draft.current = null;
  };
  const requestDelete = (kind:RecordKind,id:string,label:string) => {
    if (hostData === null || recordLoadError || !supports('records.mutate')) return;
    setDeleteError(null);
    setDeleteTarget({kind,id,label,draft:openRecordDraft(hostData)});
  };
  const handleDeleteExercise = async (id:string): Promise<void> => { requestDelete('exercise',id,t('daily.exercise')); };
  const confirmDelete = async () => {
    if (deleteTarget === null || deleteLock.current) return;
    deleteLock.current = true; setDeletePending(true); setDeleteError(null);
    try {
      const result = await mutateDraft({type:'delete-record',kind:deleteTarget.kind,id:deleteTarget.id},deleteTarget.draft);
      setUndoToken(result.undoToken ?? null); setUndoError(false); setDeleteTarget(null);
    } catch(error) { setDeleteError(t(isRecordConflict(error) ? 'closure.conflict' : 'closure.deleteError')); }
    finally {deleteLock.current=false;setDeletePending(false);}
  };
  const loadConflictReview = async () => {
    if(conflictReview === null || conflictReview.loading) return;
    const currentReview = conflictReview;
    const revision=++conflictReviewRevision.current;
    const requestStartedAt=presentationSequence.current;
    setConflictReview({...currentReview,loading:true,error:false});
    try {
      const response=await bridge.invoke('records.getSnapshot');
      acceptHostData(response,undefined,requestStartedAt);
      setRecordLoadError(false);
      if(revision===conflictReviewRevision.current)setConflictReview({...currentReview,latest:hostDataRef.current,loading:false,error:false});
    } catch {if(revision===conflictReviewRevision.current)setConflictReview({...currentReview,loading:false,error:true});}
  };
  const restoreRecord = async (token:string) => {
    const data = requireHostData();
    if (restorePending.current.has(token)) return;
    restorePending.current.add(token);
    const key = `restore-${token}`;
    const pendingDraft = immediateDrafts.current.get(key) ?? openRecordDraft(data);
    immediateDrafts.current.set(key,pendingDraft);
    try { await mutateDraft({type:'restore-record',token},pendingDraft); immediateDrafts.current.delete(key); if (undoToken === token) setUndoToken(null); }
    finally {restorePending.current.delete(token);}
  };
  const handleCreateCustomFood = async (request: {
    name: string;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    defaultGrams?: number;
  }) => {
    if(recordLoadError)throw new Error('Journal refresh required');
    const auxiliaryBase = requireHostData().revision;
    const requestStartedAt=presentationSequence.current;
    const response = await bridge.invoke(
      'health.writeCustomFood',
      request,
    );
    const next = acceptHostData(response,auxiliaryBase,requestStartedAt);
    return next.customFoods[next.customFoods.length - 1]!;
  };

  const handleUpdateCustomFood = async (request: LeanOnRpcContract['health.updateCustomFood']['request']) => {
    if(recordLoadError)throw new Error('Journal refresh required');
    const auxiliaryBase = requireHostData().revision;
    const requestStartedAt=presentationSequence.current;
    const response = await bridge.invoke(
      'health.updateCustomFood',
      request,
    );
    const next = acceptHostData(response,auxiliaryBase,requestStartedAt);
    return next.customFoods.find(
      (food) => food.id === request.id,
    )!;
  };

  const handleDeleteCustomFood = async (id: string) => {
    if(recordLoadError)throw new Error('Journal refresh required');
    const requestStartedAt=presentationSequence.current;
    const response = await bridge.invoke('health.deleteCustomFood', { id });
    acceptHostData(response,undefined,requestStartedAt);
    setActiveSheet('none');
  };

  const handleSetFavorite = async (id: string, favorite: boolean) => {
    if(recordLoadError)throw new Error('Journal refresh required');
    const auxiliaryBase = requireHostData().revision;
    const requestStartedAt=presentationSequence.current;
    const response = await bridge.invoke('health.setFoodFavorite', {
      id,
      favorite,
    });
    acceptHostData(response,auxiliaryBase,requestStartedAt);
  };

  // A read-only lookup can be cancelled; persistent import must finish before closing.
  const handleBarcodeFood = async (
    input: string | null,
    allowPermission: boolean,
    onPhase: (phase: ScanFoodPhase) => void,
    isCancelled: () => boolean,
  ): Promise<ScanFoodResult> => {
    const session = foodSession.current;
    const cancelled = () => session !== foodSession.current || isCancelled();
    const operation = barcodeGate.current.begin(cancelled);
    if(operation === null)return {kind:'cancelled'};
    try {
      if (recordLoadError) return {kind:'error',error:'persistFailed',...(input===null?{}:{barcode:input})};
      const snapshot = requireHostData();
      const auxiliaryBase = snapshot.revision;
      const requestStartedAt = presentationSequence.current;
      const options = {
        allowPermissionRequest: allowPermission,
        isCancelled: cancelled,
        onPhase: (phase: ScanFoodPhase) => {
          operation.onPhase(phase);
          onPhase(phase);
        },
      };
      const ids = snapshot.customFoods.map(food => food.id);
      const result = input === null
        ? await scanFood(bridge, ids, options)
        : await lookupBarcodeFood(bridge, input, ids, options);
      if (cancelled()) return {kind:'cancelled'};
      if (result.kind === 'saved') acceptHostData({success:true,hostData:result.hostData},auxiliaryBase,requestStartedAt);
      if (result.kind === 'saved' || result.kind === 'existing') {
        setFoodSelectionVersion(version => version + 1);
        setInitialFoodGrams(100);
        setInitialFoodId(result.foodId);
      }
      return result;
    } catch {
      return {kind:'error',error:'persistFailed',...(input===null?{}:{barcode:input})};
    } finally {
      operation.finish();
    }
  };

  const handleOpenReminders = () => {
    if (!toolsAvailable.reminders) { setInfo('hostUnsupported'); return; }
    setReminderOpen(true);
    void refreshReminders();
  };

  const handleSaveReminders = async (settings: ReminderSettings) => {
    if (reminderLoading || reminderLoadError || reminderSettings === null) throw new Error('Reminder settings unavailable');
    const saved = await persistReminders(bridge, settings);
    setReminderSettings(saved);
    setReminderOpen(false);
  };

  const handleOpenHealthConnect = () => {
    if (provider === null) { setInfo('unavailable'); return; }
    setHcOpen(true);
    void refreshHealthConnection();
  };

  const handleSyncHealthConnect = async (): Promise<boolean> => {
    if (provider === null) return false;
    try {
      const requestStartedAt=presentationSequence.current;
      const response = provider === 'health-kit'
        ? await bridge.invoke('healthKit.sync') : await bridge.invoke('healthConnect.sync');
      if (response.success !== true) throw new Error('Health sync failed');
      acceptHostData(response,undefined,requestStartedAt);
      await refreshHealthConnection();
      return true;
    } catch { return false; }
  };

  const handleRequestHealthConnectPermission = async (): Promise<void> => {
    if (provider === null) throw new Error('Health connection unavailable');
    if (provider === 'health-kit') {
      const response = await bridge.invoke('healthKit.requestPermission');
      if (response.completed !== true || response.readAccess !== 'unknown') throw new Error('Health access request incomplete');
    } else {
      const response = await bridge.invoke('healthConnect.requestPermission');
      if (response.granted !== true) throw new Error('Health access not granted');
    }
    await refreshHealthConnection();
  };

  const handleSetHealthConnectEnabled = async (enabled: boolean): Promise<void> => {
    if (provider === null) throw new Error('Health connection unavailable');
    const response = provider === 'health-kit'
      ? await bridge.invoke('healthKit.setEnabled', { enabled }) : await bridge.invoke('healthConnect.setEnabled', { enabled });
    if (response.success !== true) throw new Error('Health preference not saved');
    await refreshHealthConnection();
  };

  const handleOpenRoute = (route: PushedRoute) => {
    if (isNativeShell) {
      void bridge.invoke('app.openRoute', { route }).then(({ success }) => { if (!success) setInfo('unavailable'); }).catch(() => setInfo('unavailable'));
      return;
    }
    setDevStack((stack) => [...stack, route]);
  };

  const handleDevBack = () => {
    setDevStack((stack) => stack.slice(0, -1));
  };

  const currentRoute: AppRoute = isNativeShell ? (nativeRoute as AppRoute) : (devStack[devStack.length - 1] ?? devTab);
  useEffect(()=>{modalFocus.current.clear();},[currentRoute]);
  const loggingDate = () => currentRoute === 'diary' && selectedDate !== '' ? selectedDate : requireHostData().today;
  const screenActions: ScreenActions = {
    logFood: (foodId?: string) => {
      if (!beginDraft(loggingDate())) return;
      setInitialFoodId(foodId);
      setInitialFoodGrams(undefined);
      foodSession.current += 1;
      setActiveSheet('food');
    },
    logWeight: () => { if (beginDraft(loggingDate())) { setEditingWeight(hostData?.weights.find(item=>item.date===loggingDate())?.weightKg); setActiveSheet('weight'); } },
    logExercise: () => {
      const date=loggingDate();
      if(weightForRecordDate(requireHostData(),date)===undefined){setWeightNeededDate(date);setInfo('weightNeeded');return;}
      if (!beginDraft(date, newRecordId('exercise'))) return;
      setEditingExercise(null);
      setActiveSheet('exercise');
    },
    openReminders: handleOpenReminders,
    openScale: () => toolsAvailable.scale ? setActiveSheet('scale') : setInfo('hostUnsupported'),
    openAbout: () => setInfo('about'),
    openHealthConnections: handleOpenHealthConnect,
    openRoute: handleOpenRoute,
    openSettings: () => handleOpenRoute('settings'),
    setWaterTotal: handleSetWaterTotal,
    editExercise: handleEditExercise,
    deleteExercise: handleDeleteExercise,
  };


  const renderRoute = (route: AppRoute) => {
    if (hostData === null && route !== 'settings' && route !== 'partner') return (
      <view className="Card Load-error">
        <text className="Empty-title">{t('design.loadError')}</text>
        <text className="Empty-body">{t('design.loadErrorBody')}</text><view className="Sheet-btn primary" accessibility-element={true} accessibility-traits="button" accessibility-label={t('closure.retry')} bindtap={()=>void refreshRecords()}><text className="Sheet-btn-label primary">{t(recordLoading?'closure.loading':'closure.retry')}</text></view>
      </view>
    );
    if (route === 'partner') return <PartnerScreen t={t} view={companion} loading={companionLoading} error={companionError} available={companionAvailable} onRefresh={()=>void refreshCompanion().catch(()=>{})} onSync={()=>void handleCompanionAction({type:'sync'}).catch(()=>{})} onOpen={openCompanion} onReadPhoto={id=>readPhoto(id,'partner')} />;
    if (route === 'settings') return (
      <SettingsScreen t={t} locale={locale} appearance={appearance} onAppearanceChange={handleAppearanceChange} onLocaleChange={handleLocaleChange} onOpenReminders={handleOpenReminders} onOpenHealthConnect={handleOpenHealthConnect} remindersAvailable={toolsAvailable.reminders} healthAvailable={provider !== null} migrationAvailable={isNativeShell && supports('companion.getMigrationState')} onOpenMigration={()=>setActiveSheet('migration')} />
    );
    if (hostData === null) return null;
    if (route === 'me') return <MeScreen personalAvailable={personalAvailable} backupAvailable={backupAvailable} onOpenPersonal={openPersonal} onEditProfile={() => { if(beginDraft())setActiveSheet('profile'); }} state={state} hostData={hostData} locale={locale} t={t} actions={screenActions} supports={supports} />;
    if (route === 'diary') return <DiaryScreen selectedDate={selectedDate || hostData.today} onSelectDate={setSelectedDate} onEditIntake={entry=>{if(beginDraft(entry.date,entry.id)){setEditingIntake(entry);setActiveSheet('intake-edit');}}} onEditWeight={record=>{if(beginDraft(record.date,record.id)){setRecordCreating(false);setEditingRecord({kind:'weight',value:record});setActiveSheet('record-edit');}}} onEditWater={record=>{if(beginDraft(record.date,record.id)){setRecordCreating(false);setEditingRecord({kind:'water',value:record});setActiveSheet('record-edit');}}} onEditExerciseRecord={record=>{if(beginDraft(record.date,record.id)){setRecordCreating(false);setEditingRecord({kind:'exercise',value:record});setActiveSheet('record-edit');}}} onLogWater={()=>{if(beginDraft(loggingDate())){setRecordCreating(true);setEditingRecord({kind:'water',value:{id:newRecordId('water-draft'),date:draft.current!.date,amountMl:0}});setActiveSheet('record-edit');}}} onEditLegacyIntake={record=>{if(beginDraft(record.date,record.id)){setRecordCreating(false);setEditingRecord({kind:'legacy-intake',value:record});setActiveSheet('record-edit');}}} onDelete={requestDelete} onRestore={restoreRecord} state={state} hostData={hostData} locale={locale} t={t} actions={screenActions} />;
    if (state === null) return <view className="Tab-pane">
      <view className="ScreenTitle"><text className="ScreenTitle-text">{t(route === 'progress' ? 'progress.title' : 'design.todayTitle')}</text></view>
      {!hostData.setupCompleted && <view className="Card"><text className="Empty-title">{t('profile.setupTitle')}</text><text className="Empty-body">{t('closure.setupBody')}</text><view className="Action-btn primary" accessibility-element={true} accessibility-traits="button" accessibility-label={t('closure.setupAction')} bindtap={()=>{if(beginDraft())setActiveSheet('profile');}}><text className="Action-label primary">{t('closure.setupAction')}</text></view></view>}
      {hostData.setupCompleted && <text className="Section-note">{t('closure.trackingNote')}</text>}
      {route === 'progress' ? <InsightsScreen hostData={hostData} budgetKcal={0} t={t} /> : <>
        <TrackingTodayScreen hostData={hostData} locale={locale} t={t} actions={screenActions} waterAvailable={supports('records.mutate')&&!recordLoadError}/>

      </>}
    </view>;
  const screenProps: ScreenProps | null = state === null ? null : {
    hostData,
    state,
    locale,
    t,
    actions: screenActions,
    supports,
  };

    if (screenProps === null) return null;
    switch (route) {
      case 'today':
        return <TodayScreen {...screenProps} />;
      case 'progress':
        return <ProgressScreen {...screenProps} />;
      default:
        return null;
    }
  };

  return (
    <ThemeContext.Provider value={palette}>
    <PhotoPreviewContext.Provider value={photoPreviews}>
    <WorkflowDismissContext.Provider value={modalDismiss.current.register}>
    <ModalInvokerContext.Provider value={modalFocus.current.remember}>
    <page className={`Page Theme-${appearance.resolved}`} style={{ backgroundColor: palette.canvas }}>
      <view className={`PageRoot Theme-${appearance.resolved}`} style={{ backgroundColor: palette.canvas }}>
      <scroll-view scroll-orientation="vertical" className="Scroll" accessibility-elements-hidden={modalActive}>
        <view className="Content">
          {!isNativeShell && devStack.length > 0 && (
            <view
              className="DevBack"
              hover-class="tap-feedback-hover"
              bindtap={handleDevBack}
            >
              <text className="DevBack-text">‹ {t('settings.done')}</text>
            </view>
          )}
          {isPreview && <text className="Section-note">{t('closure.preview')}</text>}
          {recordLoadError && hostData !== null && <view className="Notice"><text className="Notice-text">{t('closure.refreshError')}</text><view className="Action-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('closure.retry')} bindtap={()=>void refreshRecords()}><text className="Action-label">{t('closure.retry')}</text></view></view>}
          {undoToken !== null && <view className="Notice"><text className="Notice-text">{t('closure.deleted')}</text><view className="Action-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('closure.undo')} bindtap={()=>void restoreRecord(undoToken).catch(()=>setUndoError(true))}><text className="Action-label">{t('closure.undo')}</text></view>{undoError&&<text className="Sheet-error">{t('closure.restoreError')}</text>}</view>}
          {renderRoute(currentRoute)}
        </view>
      </scroll-view>
      {!isNativeShell && devStack.length === 0 && (
        <BottomTabBar current={devTab} t={t} onSelect={setDevTab} />
      )}
      {info !== null && (
        <view className="Sheet-overlay" bindtap={() => setInfo(null)}>
          <view className="Sheet" catchtap={() => {}}>
            <text className="Sheet-title">{t(info === 'about' ? 'me.about' : info === 'weightNeeded' ? 'review.weightFirst' : 'review.notAvailable')}</text>
            <text className="Empty-body">{t(info === 'about' ? 'review.aboutBody' : info === 'weightNeeded' ? 'closure.exerciseNoEstimate' : info === 'hostUnsupported' ? 'review.hostUnsupportedBody' : 'review.unavailableBody')}</text>
            {info==='weightNeeded'&&<view><text className="Section-note">{weightNeededDate}</text><view className="Action-btn primary" accessibility-element={true} accessibility-traits="button" accessibility-label={t('action.logWeight')} bindtap={()=>{const date=weightNeededDate??hostData?.today;if(date!==undefined&&beginDraft(date)){setEditingWeight(hostData===null?undefined:weightForRecordDate(hostData,date));setInfo(null);setActiveSheet('weight');}}}><text className="Action-label primary">{t('action.logWeight')}</text></view></view>}
            <view className="Sheet-btn primary" bindtap={() => setInfo(null)}><text className="Sheet-btn-label primary">{t('settings.done')}</text></view>
          </view>
        </view>
      )}
      {(activeSheet==='dietary'||activeSheet==='measurements'||activeSheet==='photos')&&personal===null&&<WorkflowSheet t={t} title={t(activeSheet==='dietary'?'personal.dietary':activeSheet==='measurements'?'personal.measurements':'personal.photos')} busy={personalLoading} feedback={personalError?t('personal.loadError'):null} onClose={()=>setActiveSheet('none')}><text className="Section-note">{t(personalLoading?'closure.loading':'personal.loadError')}</text><WorkflowButton t={t} label={t('closure.retry')} disabled={personalLoading} onTap={()=>void refreshPersonal().catch(()=>{})}/></WorkflowSheet>}
      {activeSheet==='migration'&&<MigrationSheet bridge={bridge} t={t} onClose={()=>setActiveSheet('none')}/>}
      {activeSheet==='dietary'&&personal!==null&&<DietaryPreferencesSheet preferences={personal.dietaryPreferences} revision={personal.revision} customFoods={hostData?.customFoods??[]} locale={locale} t={t} onClose={()=>setActiveSheet('none')} onSave={handlePersonalSave}/>}
      {activeSheet==='measurements'&&personal!==null&&hostData!==null&&<MeasurementsSheet personal={personal} today={hostData.today} t={t} onClose={()=>setActiveSheet('none')} onSave={handlePersonalSave}/>}
      {activeSheet==='photos'&&personal!==null&&hostData!==null&&<PhotosSheet personal={personal} today={hostData.today} t={t} onClose={()=>setActiveSheet('none')} onSave={handlePersonalSave} onPick={handlePhotoPick} onRead={id=>readPhoto(id)}/>}
      {activeSheet==='backup'&&<BackupSheet t={t} onClose={()=>setActiveSheet('none')} onExport={handleBackupExport} onInspect={handleBackupInspect} onRestore={handleBackupRestore}/>}
      {activeSheet==='companion'&&companion===null&&<WorkflowSheet t={t} title={t('partner.title')} busy={companionLoading} feedback={companionError?t('companion.error'):null} onClose={()=>setActiveSheet('none')}><WorkflowButton t={t} label={t('companion.refresh')} disabled={companionLoading} onTap={()=>void refreshCompanion().catch(()=>{})}/></WorkflowSheet>}
      {activeSheet==='companion'&&companion!==null&&(companionWorkflow==='deletion-recovery'||companion.runtime.accountDeletion!==null)&&<AccountDeletionSheet view={companion} t={t} onClose={()=>setActiveSheet('none')} onAction={handleCompanionAction} onRefresh={refreshCompanion} onRefreshLocalData={refreshLocalAttachment}/>}
      {activeSheet==='companion'&&companion!==null&&companionWorkflow!=='deletion-recovery'&&companion.runtime.accountDeletion===null&&<CompanionSheet key={`${companionWorkflow}-${invitationId??'none'}`} localDataPreview={attachmentPreview} onRefreshLocalData={refreshLocalAttachment} workflow={companionWorkflow} invitationId={invitationId} view={companion} t={t} onClose={()=>setActiveSheet('none')} onAction={handleCompanionAction}/>}
      {personalConflict!==null&&<PersonalConflictSheet review={personalConflict} t={t} onClose={()=>setPersonalConflict(null)} onContinue={()=>{if(personalConflict.latest!==null){reviewPersonalRequest(personalConflict.request,personalConflict.latest);setPersonalConflict(null);}}} onRefresh={()=>{const request=personalConflict.request;void refreshPersonal().then(latest=>setPersonalConflict({request,latest,error:false})).catch(()=>setPersonalConflict({request,latest:null,error:true}));}}/>}
      {activeSheet === 'weight' && (
        <WeightSheet
          date={draft.current?.date}
          currentWeightKg={editingWeight ?? state?.currentWeightKg}
          t={t}
          onClose={() => setActiveSheet('none')}
          onPairScale={screenActions.openScale}
          canSave={supports('records.mutate')}
          canPairScale={toolsAvailable.scale}
          onSave={handleSaveWeight}
        />
      )}
      {activeSheet === 'scale' && (
        <ScaleSheet
          bridge={bridge}
          t={t}
          onClose={() => setActiveSheet('none')}
        />
      )}
      {activeSheet === 'food' && hostData !== null && (
        <FoodSheet
          date={draft.current?.date}
          t={t}
          locale={locale}
          customFoods={hostData.customFoods}
          favoriteFoodIds={hostData.favoriteFoodIds}
          recentFoodIds={hostData.recentFoodIds}
          excludedFoodIds={personal?.dietaryPreferences.excludedFoodIds}
          onClose={() => {
            setInitialFoodId(undefined);
            setInitialFoodGrams(undefined);
            foodSession.current += 1;
            setActiveSheet('none');
          }}
          canSave={supports('records.mutate')}
          supportedMethods={initData?.supportedMethods}
          preview={isPreview}
          onSave={handleSaveIntake}
          onCreateCustomFood={handleCreateCustomFood}
          onUpdateCustomFood={handleUpdateCustomFood}
          onDeleteCustomFood={handleDeleteCustomFood}
          onSetFavorite={handleSetFavorite}
          initialSelectedId={initialFoodId}
          initialSelectedGrams={initialFoodGrams}
          initialSelectionVersion={foodSelectionVersion}
          registerInnerDismiss={modalDismiss.current.register}
          onGetScannerStatus={() => fetchScannerStatus(bridge)}
          onScanBarcode={(allowPermission,onPhase,isCancelled) => handleBarcodeFood(null,allowPermission,onPhase,isCancelled)}
          onLookupBarcode={(barcode,onPhase,isCancelled) => handleBarcodeFood(barcode,false,onPhase,isCancelled)}
        />
      )}
      {activeSheet === 'exercise' && hostData !== null && (
        <ExerciseSheet
          date={draft.current?.date}
          currentWeightKg={weightForRecordDate(hostData,draft.current?.date ?? hostData.today)}
          locale={locale}
          t={t}
          initialSession={editingExercise ?? undefined}
          onLogWeight={()=>{const date=draft.current?.date??hostData.today;if(beginDraft(date)){setEditingWeight(weightForRecordDate(hostData,date));setActiveSheet('weight');}}}
          onClose={() => {
            setEditingExercise(null);
            setActiveSheet('none');
          }}
          canSave={supports('records.mutate')}
          onSave={handleSaveExercise}
        />
      )}
      {activeSheet === 'profile' && hostData !== null && <ProfileSheet profile={hostData.profile} goalWeightKg={hostData.goalWeightKg} weeklyLossKg={hostData.weeklyLossKg} guidanceMode={hostData.guidanceMode} safetyFlags={hostData.safetyFlags} today={hostData.today} editing={hostData.setupCompleted} currentWeightKg={hostData.weights.filter(item=>item.date<=hostData.today).slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(-1)[0]?.weightKg} t={t} canSave={supports('records.mutate')} onClose={()=>{setActiveSheet('none');draft.current=null;}} onSave={async payload=>{await mutateDraft({type:'save-profile',...payload});setActiveSheet('none');draft.current=null;}} />}
      {activeSheet === 'intake-edit' && editingIntake !== null && hostData !== null && <IntakeEditSheet entry={editingIntake} today={hostData.today} t={t} onClose={()=>{setActiveSheet('none');draft.current=null;}} onSave={async entry=>{await mutateDraft({type:'save-intake',entry});setActiveSheet('none');draft.current=null;}} />}
      {activeSheet === 'record-edit' && editingRecord !== null && hostData !== null && <RecordEditSheet creating={recordCreating} record={editingRecord} today={hostData.today} locale={locale} t={t} onClose={()=>{setActiveSheet('none');draft.current=null;}} onSave={async mutation=>{await mutateDraft(mutation);setActiveSheet('none');draft.current=null;}} />}
      {deleteTarget !== null && <view className="Sheet-overlay" bindtap={deletePending?undefined:()=>setDeleteTarget(null)}><view className="Sheet" catchtap={()=>{}}><text className="Sheet-title">{t('closure.deleteTitle')}</text><text className="Empty-body">{deleteTarget.label}</text><text className="Section-note">{t('closure.deleteBody')}</text>{deleteError!==null&&<text className="Sheet-error">{deleteError}</text>}<view className="Sheet-actions"><view className="Sheet-btn secondary" accessibility-element={true} accessibility-traits="button" accessibility-label={t('daily.cancel')} bindtap={deletePending?undefined:()=>setDeleteTarget(null)}><text className="Sheet-btn-label secondary">{t('daily.cancel')}</text></view><view className={`Sheet-btn primary${deletePending?' disabled':''}`} accessibility-element={true} accessibility-traits="button" accessibility-label={t('closure.delete')} bindtap={deletePending?undefined:()=>void confirmDelete()}><text className="Sheet-btn-label primary">{t(deletePending?'review.saving':'closure.delete')}</text></view></view></view></view>}
      {reminderOpen && (
        <ReminderSheet
          t={t}
          settings={reminderSettings}
          platform={platform}
          loading={reminderLoading}
          loadError={reminderLoadError}
          onRetry={refreshReminders}
          onClose={() => setReminderOpen(false)}
          onSave={handleSaveReminders}
        />
      )}
      {hcOpen && (
        <HealthConnectSheet
          t={t}
          connection={healthConnection}
          provider={provider ?? 'health-connect'}
          loading={healthLoading}
          loadError={healthLoadError}
          onRetry={refreshHealthConnection}
          capabilities={{
            request: supports(provider === 'health-kit' ? 'healthKit.requestPermission' : 'healthConnect.requestPermission'),
            toggle: supports(provider === 'health-kit' ? 'healthKit.setEnabled' : 'healthConnect.setEnabled'),
            sync: supports(provider === 'health-kit' ? 'healthKit.sync' : 'healthConnect.sync'),
          }}
          onClose={() => setHcOpen(false)}
          onRequestPermission={handleRequestHealthConnectPermission}
          onSetEnabled={handleSetHealthConnectEnabled}
          onSync={handleSyncHealthConnect}
        />
      )}
      {conflictReview !== null && <ConflictReviewSheet review={conflictReview} t={t} onClose={()=>{conflictReviewRevision.current+=1;setConflictReview(null);}} onRefresh={()=>void loadConflictReview()} onContinue={()=>{if(conflictReview.latest!==null){reviewConflictedDraft(conflictReview.draft,conflictReview.latest.revision);conflictReviewRevision.current+=1;setConflictReview(null);}}}/>}
      </view>
    </page>
    </ModalInvokerContext.Provider>
    </WorkflowDismissContext.Provider>
    </PhotoPreviewContext.Provider>
    </ThemeContext.Provider>
  );
}
