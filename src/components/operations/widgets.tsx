import Script from "next/script";
import {connection} from "next/server";
import {getDatabase} from "@/infrastructure/database/server";
import {publicRecords} from "@/modules/operations/records";
import {recordSchemas} from "@/modules/operations/contracts";
export async function StoreWidgets(){await connection();const records=(await publicRecords(getDatabase(),"integration")).map(r=>recordSchemas.integration.parse(r.data));const chat=records.find(r=>r.provider==="goftino"&&r.enabled&&r.publicId);return chat?<Script id="store-goftino" strategy="lazyOnload" src={`https://www.goftino.com/widget/${encodeURIComponent(chat.publicId)}`}/>:null;}
