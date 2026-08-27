import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { fetchWithTimeout } from './http.js';

const INFO_URL='https://sg-public-api-static.hoyolab.com/common/map_user/ys_obc/v1/map/info?map_id=2&app_sn=ys_obc&lang=zh-cn';
export function pointToMapPixel(point, meta) {
  return { x: Number(point.x) + Number(meta.origin[0]), y: Number(meta.origin[1]) + Number(point.y) };
}

export async function getMapMeta(dataDir, fetchImpl=fetch, { maxAgeMs=12*60*60*1000, force=false }={}) {
  const path=join(dataDir,'map-meta.json');
  let stale=null;
  try { const info=await stat(path); stale=JSON.parse(await readFile(path,'utf8')); if(!force && Date.now()-info.mtimeMs<maxAgeMs) return stale; } catch {}
  try {
    const response=await fetchWithTimeout(fetchImpl,INFO_URL,{timeoutMs:15000}); if(!response.ok) throw new Error(`地图元数据 HTTP ${response.status}`);
    const body=await response.json(); if(body.retcode!==0) throw new Error(`地图元数据 retcode ${body.retcode}`);
    const info=body.data.info; const v2=info.detail_v2;
    const meta={mapId:2,name:info.name,origin:v2.origin,totalSize:v2.total_size,padding:v2.padding,tileSize:256,version:v2.map_version,tileBase:'https://act-webstatic.hoyoverse.com/map_manage/map'};
    await mkdir(dataDir,{recursive:true}); const tmp=`${path}.tmp`; await writeFile(tmp,JSON.stringify(meta,null,2)); await rename(tmp,path); return meta;
  } catch (error) {
    if(stale) return stale;
    throw error;
  }
}

export async function ensureTile(meta,row,col,cacheDir,fetchImpl=fetch) {
  const dir=join(cacheDir,'tiles-v2',meta.version||'current'); await mkdir(dir,{recursive:true}); const target=join(dir,`${row}-${col}.webp`);
  try { await readFile(target); return target; } catch {}
  const url=`${meta.tileBase}/${meta.mapId}/${meta.version}/${col}_${row}_P0.webp`;
  let response, lastError;
  for (let attempt=0;attempt<3;attempt++) {
    try { response=await fetchWithTimeout(fetchImpl,url,{timeoutMs:15000}); if(response.ok) break; lastError=new Error(`地图切片 HTTP ${response.status}`); }
    catch(error){ lastError=error; }
    await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
  }
  if(!response?.ok) throw lastError || new Error('地图切片下载失败');
  const buffer=Buffer.from(await response.arrayBuffer()); const tmp=`${target}.tmp`;
  await sharp(buffer).webp({quality:88}).toFile(tmp); await rename(tmp,target); return target;
}


