import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { fetchWithTimeout } from './http.js';

const INFO_URL='https://sg-public-api-static.hoyolab.com/common/map_user/ys_obc/v1/map/info?map_id=2&app_sn=ys_obc&lang=zh-cn';
export function pointToMapPixel(point, meta) {
  // 官方 detail_v2 的 origin 位于原始地图画布；切片画布四周还包含 padding，
  // 必须把点位平移到带边距的 total_size 坐标系，否则标记会整体偏离底图。
  const padding = meta.padding || [0, 0];
  return {
    x: Number(point.x) + Number(meta.origin[0]) + Number(padding[0]),
    y: Number(meta.origin[1]) + Number(point.y) + Number(padding[1]),
  };
}

export async function getMapMeta(dataDir, fetchImpl=fetch, { maxAgeMs=12*60*60*1000, force=false }={}) {
  const path=join(dataDir,'map-meta.json');
  let stale=null;
  try { const info=await stat(path); stale=JSON.parse(await readFile(path,'utf8')); if(!force && stale.tileSize === 2048 && Array.isArray(stale.slices) && Date.now()-info.mtimeMs<maxAgeMs) return stale; } catch {}
  try {
    const response=await fetchWithTimeout(fetchImpl,INFO_URL,{timeoutMs:15000}); if(!response.ok) throw new Error(`地图元数据 HTTP ${response.status}`);
    const body=await response.json(); if(body.retcode!==0) throw new Error(`地图元数据 retcode ${body.retcode}`);
    const info=body.data.info; const detail=JSON.parse(info.detail || '{}');
    // detail.slices 是官方地图实际底图（2048 像素大图块）；detail_v2 的
    // 坐标系对应另一套切片，混用会造成标记落在海面或白底区域。
    const meta={mapId:2,name:info.name,origin:detail.origin,totalSize:detail.total_size,padding:detail.padding,tileSize:2048,version:info.detail_v2?.map_version || 'current',slices:detail.slices};
    await mkdir(dataDir,{recursive:true}); const tmp=`${path}.tmp`; await writeFile(tmp,JSON.stringify(meta,null,2)); await rename(tmp,path); return meta;
  } catch (error) {
    if(stale) return stale;
    throw error;
  }
}

export async function ensureTile(meta,row,col,cacheDir,fetchImpl=fetch) {
  const dir=join(cacheDir,'tiles-v2',meta.version||'current'); await mkdir(dir,{recursive:true}); const target=join(dir,`${row}-${col}.webp`);
  try { await readFile(target); return target; } catch {}
  const url=meta.slices?.[row]?.[col]?.url || `${meta.tileBase || ''}/${meta.mapId || 2}/${meta.version || 'current'}/${col}_${row}_P0.webp`;
  if (!url) throw new Error(`官方底图切片不存在：${row},${col}`);
  let response, lastError;
  for (let attempt=0;attempt<3;attempt++) {
    try { response=await fetchWithTimeout(fetchImpl,url,{timeoutMs:6000}); if(response.ok) break; lastError=new Error(`地图切片 HTTP ${response.status}`); }
    catch(error){ lastError=error; }
    await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
  }
  if(!response?.ok) throw lastError || new Error('地图切片下载失败');
  const buffer=Buffer.from(await response.arrayBuffer()); const tmp=`${target}.tmp`;
  await sharp(buffer).webp({quality:88}).toFile(tmp); await rename(tmp,target); return target;
}


