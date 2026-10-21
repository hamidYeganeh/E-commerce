"use client";
import {useEffect} from "react";
export function Visit({kind,targetId}:{kind:"product"|"article"|"cart"|"login"|"checkout"|"payment"|"purchase";targetId:string}){useEffect(()=>{void fetch("/api/store/visit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind,targetId}),keepalive:true}).catch(()=>{});},[kind,targetId]);return null;}
