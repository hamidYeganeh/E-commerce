import {authenticatedApi} from "@/modules/identity/api";
import {catalogOperation} from "@/modules/catalog/http";
import {readBytes} from "@/shared/http-input";
import {uploadImage} from "@/infrastructure/media/store";
export function POST(request:Request){return authenticatedApi(request,()=>catalogOperation(async()=>uploadImage(await readBytes(request,5*1024*1024)),201),{staff:true,permission:"settings.write"});}
