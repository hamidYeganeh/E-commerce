import {verify,createPublicKey,type KeyLike} from "node:crypto";
import {z} from "zod";
import {Prisma,type PrismaClient} from "../../generated/prisma/client";
import {getLookups,visibleCategoryIds,productInclude,publicProduct} from "../catalog/repository";
import {purchasePolicy} from "../catalog/purchase-policy";
import {DomainError} from "../../shared/domain-error";
const key=createPublicKey("-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAt6Mu4T0pBORY11W+QeM35UsmLO3vsf+6yKpFDEImFk0=\n-----END PUBLIC KEY-----");
export function verifyTorobToken(token:string,version:string|null,audience:string,now=Date.now(),publicKey:KeyLike=key){
 try{if(token.length>8192||version!=="1")throw new Error();const parts=token.split(".");if(parts.length!==3||parts.some(p=>!/^[A-Za-z0-9_-]+$/.test(p)))throw new Error();const [h,p,s]=parts,header=z.object({alg:z.literal("EdDSA"),typ:z.literal("JWT"),v:z.literal(1)}).parse(JSON.parse(Buffer.from(h,"base64url").toString())),claims=z.object({aud:z.string(),exp:z.number().int(),nbf:z.number().int()}).parse(JSON.parse(Buffer.from(p,"base64url").toString()));void header;if(claims.aud!==audience||claims.exp<=now/1000||claims.nbf>now/1000||claims.exp<=claims.nbf||!verify(null,Buffer.from(`${h}.${p}`),publicKey,Buffer.from(s,"base64url")))throw new Error();return true;}catch{throw new DomainError("FORBIDDEN","Invalid Torob authentication");}
}
const inputSchema=z.union([
 z.object({page_urls:z.array(z.url()).min(1).max(100)}).strict(),
 z.object({page_uniques:z.array(z.string().min(1).max(200)).min(1).max(100)}).strict(),
 z.object({page:z.number().int().min(1).max(100000),sort:z.enum(["date_added_desc","date_updated_desc"])}).strict(),
 z.object({cursor:z.string().max(200).optional(),sort:z.literal("product_id_desc")}).strict(),
]);
export async function torobProducts(db:PrismaClient,input:unknown,origin:string){const d=inputSchema.parse(input);return db.$transaction(async tx=>{
 const lookups=await getLookups(tx),policy=purchasePolicy(visibleCategoryIds(lookups.categories));
 const where:Prisma.ProductVariantWhereInput={isActive:true,priceRial:{gt:0n},product:policy.productWhere};
 if("page_uniques" in d)where.id={in:d.page_uniques};
 if("page_urls" in d){const matches=d.page_urls.flatMap(v=>{const u=new URL(v);if(u.origin!==new URL(origin).origin)return[];const match=/^\/products\/([^/]+)\/?$/.exec(u.pathname);return match?[{product:{slug:decodeURIComponent(match[1])},...(u.searchParams.get("variant")?{id:u.searchParams.get("variant")!}:{})}]:[];});where.AND={OR:matches};if(!matches.length)where.id="__none__";}
 if("cursor" in d&&d.cursor)where.id={lt:d.cursor};
 const cursorMode="sort" in d&&d.sort==="product_id_desc",page="page" in d?d.page:1,sort="sort" in d?d.sort:"date_added_desc";
 const [total,rows]=await Promise.all([tx.productVariant.count({where}),tx.productVariant.findMany({where,orderBy:sort==="product_id_desc"?{id:"desc"}:sort==="date_updated_desc"?[{updatedAt:"desc"},{id:"desc"}]:[{createdAt:"desc"},{id:"desc"}],skip:cursorMode?0:(page-1)*100,take:cursorMode?101:100,include:{stock:true,product:{include:productInclude}}})]);
 const products=rows.slice(0,100).map(v=>{const p=publicProduct(v.product,lookups),variant=p.variants.find(x=>x.id===v.id)!;return{page_unique:v.id,page_url:new URL(`/products/${p.slug}?variant=${v.id}`,origin).href,product_group_id:p.id,title:`${p.name} - ${v.name}`.slice(0,500),current_price:Number(v.priceRial/10n),availability:variant.available,image_links:p.media.map(m=>new URL(m.url,origin).href),category_name:p.categories.find(c=>c.isPrimary)?.name,spec:Object.fromEntries([...p.attributes,...variant.attributes].map(a=>[a.name,`${a.value}${a.unit?` ${a.unit}`:""}`])),short_desc:p.description.slice(0,500),date_added:v.createdAt.toISOString(),date_updated:v.updatedAt.toISOString()};});
 return{api_version:"torob_api_v3",...(cursorMode?{total:null,max_pages:null,next_cursor:rows.length>100?products.at(-1)!.page_unique:null}:{current_page:page,total,max_pages:Math.max(1,Math.ceil(total/100))}),products};
 },{isolationLevel:"RepeatableRead"});}
