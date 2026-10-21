import {test} from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {combineCarts} from "../../src/modules/operations/cart-reconciliation";
import {validateWorkbookZip} from "../../src/modules/operations/spreadsheets";
import {publicUrl} from "../../src/modules/operations/contracts";
test("cart ownership transition preserves saved account and guest selections without doubling",()=>{assert.deepEqual(combineCarts([{variantId:"a",quantity:2}],[{variantId:"b",quantity:1},{variantId:"a",quantity:3}]),[{variantId:"a",quantity:3},{variantId:"b",quantity:1}]);assert.deepEqual(combineCarts([{variantId:"a",quantity:2}],[]),[{variantId:"a",quantity:2}]);});
test("ZIP validator rejects central directory entries hidden by a forged EOCD count",async()=>{const book=new ExcelJS.Workbook();book.addWorksheet("prices").addRow(["a","b"]);const buffer=Buffer.from(await book.xlsx.writeBuffer());validateWorkbookZip(buffer);const end=buffer.length-22,count=buffer.readUInt16LE(end+10);assert.ok(count>1);buffer.writeUInt16LE(count-1,end+8);buffer.writeUInt16LE(count-1,end+10);assert.throws(()=>validateWorkbookZip(buffer),{code:"INVALID_FILE"});});
test("content links reject executable, credentialed and malformed network paths",()=>{for(const href of ["javascript:alert(1)","//outside.test","/\\outside.test","https://name:pass@example.test","https://example.test/\npath"]){assert.equal(publicUrl.safeParse(href).success,false,href);}for(const href of ["/products","https://example.test/image.webp",""]){assert.equal(publicUrl.safeParse(href).success,true,href);}});
