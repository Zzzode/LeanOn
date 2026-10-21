import {expect,test} from '@rstest/core';
import {filterExcludedFoods} from './dietary-foods.js';
test('explicit exclusions filter search/favorites only without inferring ingredients or altering the stored food',()=>{
  const a={id:'a',name:'Rice',kcal:100};const b={id:'b',name:'Rice alternative',kcal:200};const foods=[a,b];
  expect(filterExcludedFoods(foods,['a'],false)).toEqual([b]);expect(filterExcludedFoods(foods,['a'],true)).toEqual(foods);
  expect(filterExcludedFoods(foods,['unknown'],false)[0]).toBe(a);expect(foods).toEqual([a,b]);
});
