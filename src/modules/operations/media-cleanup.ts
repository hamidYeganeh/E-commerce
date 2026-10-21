import{readdir,stat,unlink}from"node:fs/promises";
import{resolve,join}from"node:path";
import{ListObjectsV2Command,DeleteObjectCommand,S3Client}from"@aws-sdk/client-s3";
import type{PrismaClient}from"../../generated/prisma/client";
const mediaKey=/^[a-f0-9-]{36}\.(webp|png|jpg)$/;
export async function mediaReferences(db:PrismaClient){
 const used=new Set<string>();const scan=(value:unknown)=>{if(typeof value==="string"){for(const match of value.matchAll(/[a-f0-9-]{36}\.(?:webp|png|jpg)/g))used.add(match[0]);}else if(Array.isArray(value))value.forEach(scan);else if(value&&typeof value==="object")Object.values(value).forEach(scan);};
 // Include drafts and private lab evidence as well as public media.
 let cursor:string|undefined;for(;;){const rows=await db.storeRecord.findMany({take:500,...(cursor?{cursor:{id:cursor},skip:1}:{}),orderBy:{id:"asc"},select:{id:true,data:true}});rows.forEach(r=>scan(r.data));if(rows.length<500)break;cursor=rows.at(-1)!.id;}
 for(const r of await db.productMedia.findMany({select:{objectKey:true}}))scan(r.objectKey);
 for(const r of await db.batch.findMany({select:{labReportKey:true}}))scan(r.labReportKey);
 return used;
}
export async function cleanupMedia(db:PrismaClient,options:{apply?:boolean;now?:Date}={}){
 const now=options.now??new Date(),cutoff=now.getTime()-7*86400000,used=await mediaReferences(db),candidates:{key:string;modifiedAt:Date}[]=[];
 let client:S3Client|undefined,bucket:string|undefined;
 if(process.env.MEDIA_DRIVER==="s3"){
  bucket=process.env.MEDIA_S3_BUCKET;if(!bucket||!process.env.MEDIA_S3_REGION)throw new Error("MEDIA_NOT_CONFIGURED");client=new S3Client({region:process.env.MEDIA_S3_REGION,endpoint:process.env.MEDIA_S3_ENDPOINT,forcePathStyle:process.env.MEDIA_S3_FORCE_PATH_STYLE==="true",credentials:{accessKeyId:process.env.MEDIA_S3_ACCESS_KEY_ID!,secretAccessKey:process.env.MEDIA_S3_SECRET_ACCESS_KEY!}});
  let continuation:string|undefined;do{const page=await client.send(new ListObjectsV2Command({Bucket:bucket,ContinuationToken:continuation}));for(const o of page.Contents??[])if(o.Key&&o.LastModified&&mediaKey.test(o.Key)&&o.LastModified.getTime()<cutoff&&!used.has(o.Key))candidates.push({key:o.Key,modifiedAt:o.LastModified});continuation=page.IsTruncated?page.NextContinuationToken:undefined;}while(continuation);
 }else{const directory=resolve(process.env.MEDIA_DIRECTORY??".data/media");let files:string[];try{files=await readdir(directory);}catch{return{candidates:[],deleted:0};}for(const key of files){if(!mediaKey.test(key)||used.has(key))continue;const info=await stat(join(directory,key));if(info.isFile()&&info.mtimeMs<cutoff)candidates.push({key,modifiedAt:info.mtime});}}
 let deleted=0;
 // Require an offline maintenance window for deletion so new references cannot race GC.
 if(options.apply){if(process.env.MEDIA_MAINTENANCE!=="true")throw new Error("MEDIA_MAINTENANCE_REQUIRED");const fresh=await mediaReferences(db);for(const c of candidates){if(fresh.has(c.key))continue;if(client)await client.send(new DeleteObjectCommand({Bucket:bucket,Key:c.key}));else await unlink(join(resolve(process.env.MEDIA_DIRECTORY??".data/media"),c.key));deleted++;}}
 return{candidates:candidates.map(c=>c.key),deleted};
}
