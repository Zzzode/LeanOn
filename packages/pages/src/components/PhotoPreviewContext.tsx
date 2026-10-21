import {createContext,type Context} from '@lynx-js/react';
import {initialPhotoPreviewLifecycle,type PhotoPreviewLifecycle} from '../state/photo-preview.js';
export const PhotoPreviewContext:Context<PhotoPreviewLifecycle>=createContext<PhotoPreviewLifecycle>(initialPhotoPreviewLifecycle);
