/**
 * Deterministic, cent-accurate refund allocation helpers.
 * Executable reference for the refund RPC correction; not a replacement for server-side authorization or locks.
 */
const toCents = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 100) throw new Error(`${label} must be a finite, non-negative money amount`);
  return Math.round((value + Number.EPSILON) * 100);
};
const toMilliUnits = (value: number, label: string): bigint => {
  if (!Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER / 1000) throw new Error(`${label} must be a finite, positive quantity`);
  const scaled = value * 1000, rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-7) throw new Error(`${label} supports at most three decimal places`);
  return BigInt(rounded);
};
export interface RefundAllocationLine { saleItemId: string; grossAmount: number; }
export interface RefundAllocation { saleItemId: string; grossAmount: number; netAmount: number; netAmountCents: number; }
export function allocateDiscountedLineAmounts(saleSubtotal: number, saleTotal: number, lines: RefundAllocationLine[]): RefundAllocation[] {
  const subtotalCents = toCents(saleSubtotal, "Sale subtotal"), totalCents = toCents(saleTotal, "Sale total");
  if (subtotalCents <= 0) throw new Error("Sale subtotal must be greater than zero");
  if (totalCents > subtotalCents) throw new Error("Sale total cannot exceed sale subtotal");
  if (!Array.isArray(lines) || lines.length === 0) throw new Error("At least one sale line is required");
  const seen = new Set<string>();
  const normalized = lines.map(line => {
    if (!line.saleItemId || seen.has(line.saleItemId)) throw new Error("Sale item IDs must be present and unique");
    seen.add(line.saleItemId);
    return { saleItemId: line.saleItemId, grossCents: toCents(line.grossAmount, "Line gross amount") };
  });
  const lineGrossTotal = normalized.reduce((sum,line)=>sum+line.grossCents,0);
  if (!Number.isSafeInteger(lineGrossTotal) || lineGrossTotal !== subtotalCents) throw new Error("Sale line gross amounts must equal the sale subtotal exactly");
  const allocations = normalized.map(line => {
    const numerator=BigInt(totalCents)*BigInt(line.grossCents), denominator=BigInt(subtotalCents);
    return {...line,netCents:Number(numerator/denominator),remainder:numerator%denominator};
  });
  let centsLeft=totalCents-allocations.reduce((sum,line)=>sum+line.netCents,0);
  const priority=[...allocations].sort((a,b)=>a.remainder!==b.remainder?(a.remainder>b.remainder?-1:1):(a.saleItemId<b.saleItemId?-1:a.saleItemId>b.saleItemId?1:0));
  for(let i=0;centsLeft>0;i++){if(!priority[i])throw new Error("Unable to distribute sale rounding remainder");priority[i].netCents++;centsLeft--;}
  return allocations.map(line=>({saleItemId:line.saleItemId,grossAmount:line.grossCents/100,netAmount:line.netCents/100,netAmountCents:line.netCents}));
}
export function calculateCumulativeLineRefund(input: {allocatedNetAmount:number;originalQuantity:number;cumulativeReturnedQuantity:number;previouslyRefundedAmount:number;}): {targetAmount:number;refundAmount:number} {
  const allocatedCents=toCents(input.allocatedNetAmount,"Allocated line amount"),previousCents=toCents(input.previouslyRefundedAmount,"Previously refunded amount");
  const originalMilli=toMilliUnits(input.originalQuantity,"Original quantity"),returnedMilli=toMilliUnits(input.cumulativeReturnedQuantity,"Cumulative returned quantity");
  if(returnedMilli>originalMilli)throw new Error("Returned quantity cannot exceed original quantity");
  const numerator=BigInt(allocatedCents)*returnedMilli,targetCents=Number((numerator*2n+originalMilli)/(2n*originalMilli));
  const nextRefundCents=targetCents-previousCents;
  if(nextRefundCents<0)throw new Error("Historical refunds exceed the corrected line allocation; manual reconciliation required");
  return {targetAmount:targetCents/100,refundAmount:nextRefundCents/100};
}
