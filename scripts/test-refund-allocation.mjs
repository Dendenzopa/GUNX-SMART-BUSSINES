import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const require=createRequire(import.meta.url);
const source=readFileSync(new URL("../src/domain/refundAllocation.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const module={exports:{}};
vm.runInNewContext(compiled,{module,exports:module.exports,require});
const {allocateDiscountedLineAmounts,calculateCumulativeLineRefund}=module.exports;
const cents=v=>Math.round(v*100);
{
 const x=allocateDiscountedLineAmounts(100,100,[{saleItemId:"a",grossAmount:40},{saleItemId:"b",grossAmount:60}]);
 assert.deepEqual(JSON.parse(JSON.stringify(x.map(v=>v.netAmount))),[40,60]);
}
{
 const x=allocateDiscountedLineAmounts(100,87.65,[{saleItemId:"a",grossAmount:12.34},{saleItemId:"b",grossAmount:56.78},{saleItemId:"c",grossAmount:30.88}]);
 assert.equal(x.reduce((s,v)=>s+v.netAmountCents,0),8765);
}
{
 const lines=[{saleItemId:"c",grossAmount:33.34},{saleItemId:"b",grossAmount:33.33},{saleItemId:"a",grossAmount:33.33}];
 const x=allocateDiscountedLineAmounts(100,99.99,lines),y=allocateDiscountedLineAmounts(100,99.99,[...lines].reverse());
 const map=z=>Object.fromEntries(z.map(v=>[v.saleItemId,v.netAmountCents]));
 assert.deepEqual(JSON.parse(JSON.stringify(map(x))),JSON.parse(JSON.stringify(map(y))));
 assert.equal(x.reduce((s,v)=>s+v.netAmountCents,0),9999);
}
{
 const x=allocateDiscountedLineAmounts(.04,.02,[..."abcd"].map(s=>({saleItemId:s,grossAmount:.01})));
 assert.equal(x.reduce((s,v)=>s+v.netAmountCents,0),2);
}
{
 const a=calculateCumulativeLineRefund({allocatedNetAmount:10,originalQuantity:3,cumulativeReturnedQuantity:1,previouslyRefundedAmount:0});
 const b=calculateCumulativeLineRefund({allocatedNetAmount:10,originalQuantity:3,cumulativeReturnedQuantity:2,previouslyRefundedAmount:a.targetAmount});
 const c=calculateCumulativeLineRefund({allocatedNetAmount:10,originalQuantity:3,cumulativeReturnedQuantity:3,previouslyRefundedAmount:a.targetAmount+b.refundAmount});
 assert.deepEqual([cents(a.refundAmount),cents(b.refundAmount),cents(c.refundAmount)],[333,334,333]);
 assert.equal(cents(a.refundAmount+b.refundAmount+c.refundAmount),1000);
}
{
 assert.throws(()=>allocateDiscountedLineAmounts(100,101,[{saleItemId:"a",grossAmount:100}]),/cannot exceed/);
 assert.throws(()=>allocateDiscountedLineAmounts(100,90,[{saleItemId:"a",grossAmount:99}]),/equal the sale subtotal/);
 assert.throws(()=>allocateDiscountedLineAmounts(100,90,[{saleItemId:"a",grossAmount:50},{saleItemId:"a",grossAmount:50}]),/unique/);
 assert.throws(()=>allocateDiscountedLineAmounts(100,90,[]),/at least one/);
}
{
 assert.throws(()=>calculateCumulativeLineRefund({allocatedNetAmount:10,originalQuantity:3,cumulativeReturnedQuantity:1,previouslyRefundedAmount:4}),/Historical refunds exceed/);
 assert.throws(()=>calculateCumulativeLineRefund({allocatedNetAmount:10,originalQuantity:3,cumulativeReturnedQuantity:4,previouslyRefundedAmount:0}),/cannot exceed/);
 assert.throws(()=>calculateCumulativeLineRefund({allocatedNetAmount:10,originalQuantity:3,cumulativeReturnedQuantity:.1234,previouslyRefundedAmount:0}),/three decimal places/);
}
console.log("Refund allocation tests passed: 7 groups.");
