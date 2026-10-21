import {expect,test} from '@rstest/core';
import {createTranslator} from '@zzzode/i18n';
import {workflowChoiceLabel} from './workflow-accessibility.js';
test('choice labels retain category plus selected and unavailable states even when native accessibility-value is ignored',()=>{
  const en=createTranslator('en');const zh=createTranslator('zh-CN');
  expect(workflowChoiceLabel(en,'Photos',true,false)).toBe('Photos · Selected');
  expect(workflowChoiceLabel(en,'Photos',false,true)).toBe('Photos · Not selected · Unavailable');
  expect(workflowChoiceLabel(zh,'照片',true,false)).toBe(`照片 · ${zh('workflow.selected')}`);
  expect(workflowChoiceLabel(zh,'照片',false,true)).toBe(`照片 · ${zh('workflow.notSelected')} · ${zh('workflow.disabled')}`);
});
