import"../src/config/load-env";
import{getDatabase,disconnectDatabase}from"../src/infrastructure/database/client";
import{cleanupMedia}from"../src/modules/operations/media-cleanup";
import{applyRetention}from"../src/modules/operations/retention";
try{const db=getDatabase();const result=process.argv.includes("--retention")?await applyRetention(db):await cleanupMedia(db,{apply:process.argv.includes("--apply")});console.log(JSON.stringify(result));}finally{await disconnectDatabase();}
