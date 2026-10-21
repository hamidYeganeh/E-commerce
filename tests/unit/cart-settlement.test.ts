import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subtractPurchasedLines,rebaseCartChanges} from '../../src/modules/operations/cart-reconciliation';
import {randomUUID} from 'node:crypto';
import {activateCartOwner,addCartLine,applyCartSettlement,localCartLines,pendingCartCheckout,rememberCartBaseline,rememberCartCheckout,cartBaseline,rememberCartWrite,acknowledgeCartWrite,pendingCartWrite} from '../../src/components/commerce/cart-store';

const line=(quantity:number,variantId='honey')=>({variantId,quantity});
test('quantity reconciliation preserves additions while accepting server settlement and sibling edits',()=>{
 const base=[line(2),line(1,'tea')],local=[line(3),line(1,'tea'),line(1,'gift')],server=[line(1),line(2,'tea')];
 assert.deepEqual(rebaseCartChanges(base,local,server),[line(2),line(2,'tea'),line(1,'gift')]);
 assert.deepEqual(subtractPurchasedLines(local,[line(2)]),[line(1),line(1,'tea'),line(1,'gift')]);
 assert.deepEqual(rebaseCartChanges(base,base,[]),[]);
});

test('paid receipt atomically consumes a matching owned pending checkout once and clears retry key',()=>{
 const target=new EventTarget();
 class MemoryStorage {private values=new Map<string,string>();getItem(key:string){return this.values.get(key)??null;}setItem(key:string,value:string){this.values.set(key,value);}removeItem(key:string){this.values.delete(key);}}
 Object.defineProperty(globalThis,'localStorage',{value:new MemoryStorage(),configurable:true});
 Object.defineProperty(globalThis,'sessionStorage',{value:new MemoryStorage(),configurable:true});
 Object.defineProperty(globalThis,'dispatchEvent',{value:target.dispatchEvent.bind(target),configurable:true});
 const key=randomUUID();
 activateCartOwner('customer-a',[line(2),line(1,'tea')]);
 rememberCartBaseline('customer-a',{lines:[line(2),line(1,'tea')],activityVersion:1});
 rememberCartCheckout(key,[line(2)]);
 sessionStorage.setItem('honey-checkout-attempt',JSON.stringify({id:key}));
 addCartLine('honey',1);
 assert.equal(applyCartSettlement(randomUUID(),[line(2)]),false);
 assert.equal(applyCartSettlement(key,[line(2)]),true);
 assert.deepEqual(localCartLines(),[line(1),line(1,'tea')]);
 assert.deepEqual(cartBaseline()?.lines,[line(1,'tea')]);
 assert.equal(pendingCartCheckout(),null);
 assert.equal(sessionStorage.getItem('honey-checkout-attempt'),null);
 assert.equal(applyCartSettlement(key,[line(2)]),false);
 addCartLine('honey',1);
 assert.equal(applyCartSettlement(key,[line(2)]),false);
 assert.deepEqual(localCartLines(),[line(2),line(1,'tea')]);
 activateCartOwner('customer-b',[line(5)]);
 assert.equal(applyCartSettlement(key,[line(2)]),false);
 assert.deepEqual(localCartLines(),[line(5)]);
 // Recover a lost response even after a later remote edit: acknowledge the
 // submitted snapshot first, then rebase only edits made after that snapshot.
 activateCartOwner('write-recovery',[line(2)]);
 rememberCartBaseline('write-recovery',{lines:[line(1)],activityVersion:1});
 const mutation=randomUUID();
 rememberCartWrite({key:mutation,lines:[line(2)],expectedActivityVersion:1});
 acknowledgeCartWrite('another-owner',mutation,2);
 assert.ok(pendingCartWrite());
 acknowledgeCartWrite('write-recovery',mutation,2);
 assert.equal(pendingCartWrite(),null);
 assert.deepEqual(rebaseCartChanges(cartBaseline()!.lines,localCartLines(),[line(4)]),[line(4)]);
 addCartLine('honey',1);
 assert.deepEqual(rebaseCartChanges(cartBaseline()!.lines,localCartLines(),[line(4)]),[line(5)]);
});
