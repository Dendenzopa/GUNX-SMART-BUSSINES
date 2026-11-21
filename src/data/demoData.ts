import type { Customer, Expense, Product, Sale } from "../domain/types";
export const demoProducts: Product[] = [
 { id:"p1", name:"Maji 1.5L", sku:"DRK-001", unit:"chupa", costPrice:700, sellingPrice:1000, stockQuantity:36, reorderLevel:10, active:true },
 { id:"p2", name:"Mchele 1kg", sku:"FD-001", unit:"kg", costPrice:2200, sellingPrice:2800, stockQuantity:18, reorderLevel:8, active:true },
 { id:"p3", name:"Sukari 1kg", sku:"FD-002", unit:"kg", costPrice:2500, sellingPrice:3000, stockQuantity:5, reorderLevel:10, active:true },
 { id:"p4", name:"Sabuni", sku:"HM-001", unit:"kipande", costPrice:1200, sellingPrice:1500, stockQuantity:22, reorderLevel:6, active:true }
];
export const demoCustomers: Customer[] = [{id:"c1",name:"Asha M.",phone:"07XXXXXXXX"},{id:"c2",name:"Juma K.",phone:"07XXXXXXXX"}];
export const demoSales: Sale[] = [{
 id:"s1", receiptNumber:"DEMO-0001", createdAt:new Date().toISOString(),
 lines:[{productId:"p1",productName:"Maji 1.5L",quantity:2,unitPrice:1000,unitCost:700,lineTotal:2000}],
 subtotal:2000,discount:0,total:2000,amountPaid:2000,balance:0,paymentMethod:"cash",status:"completed"
}];
export const demoExpenses: Expense[] = [{id:"e1",description:"Usafiri",category:"Transport",amount:5000,createdAt:new Date().toISOString()}];
