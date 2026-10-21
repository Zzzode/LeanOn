import {createContext,type Context} from '@lynx-js/react';
import type {RememberModalInvoker} from '../state/modal-focus.js';
export const ModalInvokerContext:Context<RememberModalInvoker>=createContext<RememberModalInvoker>(()=>{});
export const WorkflowInsideContext:Context<boolean>=createContext(false);
