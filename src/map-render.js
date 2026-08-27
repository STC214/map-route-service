import { createHash } from 'node:crypto';
import { mkdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { ensureTile, getMapMeta, pointToMapPixel } from './basemap.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
async function mapLimit(items,limit,worker){const out=new Array(items.length);let cursor=0;async function run(){while(cursor<items.length){const i=cursor++;out[i]=await worker(items[i]);}}await Promise.all(Array.from({length:Math.min(limit,items.length)},run));return out;}
function fitBounds(points,meta){let minX=Math.min(...points.map(p=>p.x))-500,maxX=Math.max(...points.map(p=>p.x))+500,minY=Math.min(...points.map(p=>p.y))-500,maxY=Math.max(...points.map(p=>p.y))+500; const ratio=1200/620; let w=maxX-minX,h=maxY-minY;if(w/h<ratio){const n=h*ratio,d=(n-w)/2;minX-=d;maxX+=d}else{const n=w/ratio,d=(n-h)/2;minY-=d;maxY+=d} minX=Math.max(0,minX);minY=Math.max(0,minY);maxX=Math.min(meta.totalSize[0],maxX);maxY=Math.min(meta.totalSize[1],maxY);return{minX,minY,maxX,maxY};}

export async function renderMapPage(page,{dataDir,cacheDir,title='地图路线',fetchImpl=fetch}={}){
  const meta=await getMapMeta(dataDir,fetchImpl); const mapPoints=page.points.map(p=>({...pointToMapPixel(p,meta),name:p.name})); const bounds=fitBounds(mapPoints,meta); const scale=1,tile=meta.tileSize;
  const firstCol=Math.floor(bounds.minX/meta.tileSize),lastCol=Math.floor(bounds.maxX/meta.tileSize),firstRow=Math.floor(bounds.minY/meta.tileSize),lastRow=Math.floor(bounds.maxY/meta.tileSize);
  const key=createHash('sha256').update(JSON.stringify({page,version:meta.version,bounds,title})).digest('hex').slice(0,24); await mkdir(cacheDir,{recursive:true}); const target=join(cacheDir,`map-${key}.png`);try{await readFile(target);return{path:target,cached:true};}catch{}
  const cropX=bounds.minX*scale,cropY=bounds.minY*scale,cropW=Math.max(1,Math.ceil((bounds.maxX-bounds.minX)*scale)),cropH=Math.max(1,Math.ceil((bounds.maxY-bounds.minY)*scale));
  const tileJobs=[];
  for(let r=firstRow;r<=lastRow;r++)for(let c=firstCol;c<=lastCol;c++) tileJobs.push({r,c});
  const composites=(await mapLimit(tileJobs,8,async ({r,c})=>{try{const path=await ensureTile(meta,r,c,cacheDir,fetchImpl);return path?{input:path,left:Math.round(c*tile-cropX),top:Math.round(r*tile-cropY)}:null;}catch{return null;}})).filter(Boolean);
  if (!composites.length || composites.length / tileJobs.length < 0.85) { const error=new Error(`地图切片不完整：${composites.length}/${tileJobs.length}`); error.code='BASEMAP_TILES_INCOMPLETE'; throw error; }
  const bg=await sharp({create:{width:cropW,height:cropH,channels:3,background:'#dce7dd'}}).composite(composites).resize(1200,620).png().toBuffer();
  const xy=mapPoints.map(p=>({x:(p.x-bounds.minX)/(bounds.maxX-bounds.minX)*1200,y:(p.y-bounds.minY)/(bounds.maxY-bounds.minY)*620,name:p.name})); const poly=xy.map(p=>`${p.x},${p.y+100}`).join(' '); const dots=xy.map((p,i)=>`<g><circle cx="${p.x}" cy="${p.y+100}" r="15" fill="#1677ff" stroke="white" stroke-width="3"/><text x="${p.x}" y="${p.y+105}" text-anchor="middle" fill="white" font-size="13" font-weight="700">${i+1}</text></g>`).join('');
  const raw=await sharp(bg).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const dark=xy.filter(p=>{const x=Math.max(0,Math.min(raw.info.width-1,Math.round(p.x))),y=Math.max(0,Math.min(raw.info.height-1,Math.round(p.y)));const i=(y*raw.info.width+x)*raw.info.channels;return raw.data[i]+raw.data[i+1]+raw.data[i+2]<105;}).length;
  if(xy.length && dark/xy.length>0.6){const error=new Error('当前区域需要额外地图图层');error.code='BASEMAP_COVERAGE_LOW';throw error;}
  const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720"><rect width="1200" height="100" fill="#fffffff2"/><text x="36" y="48" font-size="30" font-weight="700" fill="#17324d">${esc(title)}</text><text x="36" y="78" font-size="16" fill="#607d8b">${esc(page.group)} · ${page.points.length} 个点位 · 官方地图底图</text><polyline points="${poly}" fill="none" stroke="#1677ff" stroke-opacity=".8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`);
  const tmp=`${target}.tmp`; await sharp({create:{width:1200,height:720,channels:4,background:'#fff'}}).composite([{input:bg,left:0,top:100},{input:overlay,left:0,top:0}]).png({compressionLevel:9}).toFile(tmp); await rename(tmp,target); return{path:target,cached:false};
}

