import { expect, test } from '@rstest/core';
import { updateBarcodeFeedback } from './barcode-feedback.js';

test('not-found feedback survives the same-value native input event emitted by lookup-result prefill',()=>{
  const input=updateBarcodeFeedback({value:'',error:null},{type:'input',value:'96385074'});
  const failed=updateBarcodeFeedback(input,{type:'lookup-error',error:'notFound',barcode:'96385074'});
  const nativePrefill=updateBarcodeFeedback(failed,{type:'input',value:'96385074'});
  expect(nativePrefill).toEqual({value:'96385074',error:'notFound'});
  expect(updateBarcodeFeedback(nativePrefill,{type:'clear-error'})).toEqual({value:'96385074',error:null});
});

test('normalized UPC prefill retains the query error; a genuine barcode edit clears it',()=>{
  const input=updateBarcodeFeedback({value:'',error:null},{type:'input',value:'036000291452'});
  const failed=updateBarcodeFeedback(input,{type:'lookup-error',error:'lookupTimeout',barcode:'0036000291452'});
  const nativePrefill=updateBarcodeFeedback(failed,{type:'input',value:'0036000291452'});
  expect(nativePrefill).toEqual({value:'0036000291452',error:'lookupTimeout'});
  expect(updateBarcodeFeedback(nativePrefill,{type:'input',value:'4006381333931'})).toEqual({value:'4006381333931',error:null});
});
