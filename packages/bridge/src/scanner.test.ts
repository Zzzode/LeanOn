import { expect, test } from '@rstest/core';
import { isScannerStatus } from './contracts.js';

test('read-only camera status preserves permission uncertainty and rejects malformed host values',()=>{
  for(const permission of ['not-determined','authorized','denied','restricted'])expect(isScannerStatus({cameraAvailable:false,hostAvailable:true,permission})).toBe(true);
  for(const value of [null,{},[],{cameraAvailable:1,hostAvailable:true,permission:'authorized'},{cameraAvailable:true,hostAvailable:'true',permission:'denied'},{cameraAvailable:true,hostAvailable:true,permission:['authorized']},{cameraAvailable:true,hostAvailable:true,permission:'granted'}])expect(isScannerStatus(value)).toBe(false);
});
