import {expect,test} from '@rstest/core';
import {workflowNeedsWholeScroll,workflowFocusOffset} from './workflow-layout.js';
test('normal readable sheet keeps fixed actions; compact keyboard plus large header/footer uses whole-sheet scrolling',()=>{
  expect(workflowNeedsWholeScroll({viewport:560,header:80,footer:68})).toBe(false);
  expect(workflowNeedsWholeScroll({viewport:237,header:200,footer:190})).toBe(true);
  expect(workflowNeedsWholeScroll({viewport:520,header:200,footer:190})).toBe(false);
  expect(workflowNeedsWholeScroll({viewport:0,header:0,footer:0})).toBe(false);
});
test('focused field scroll uses content coordinates and current viewport, without negative offsets or centering oversized inputs offscreen',()=>{
  expect(workflowFocusOffset(300,80,240)).toBe(220);
  expect(workflowFocusOffset(0,80,240)).toBe(0);
  expect(workflowFocusOffset(300,300,240)).toBe(300);
  expect(workflowFocusOffset(300,80,0)).toBeNull();expect(workflowFocusOffset(NaN,80,240)).toBeNull();
});
