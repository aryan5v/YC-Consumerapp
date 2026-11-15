import * as THREE from 'three';
import { Terrain, heightAt, pathX, WATER } from './terrain';
import { Controls } from './controls';
import { Sky } from './sky';
import { bridge, post, seedNumber } from './bridge';
import './style.css';

const canvas=document.querySelector<HTMLCanvasElement>('#world')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.15;
let ratio=Math.min(devicePixelRatio,1.75);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,300);
camera.rotation.order='YXZ';
let seed=8741;
let terrain=new Terrain(seed);scene.add(terrain.group);
const player=new THREE.Vector3(pathX(12,seed),0,12);
const sky=new Sky(scene);
const controls=new Controls(canvas,()=>{});
const clock=document.querySelector<HTMLElement>('#clock')!;
let paused=false,last=performance.now(),frames=0,frameSum=0,lastClock=-1;

bridge(message=>{
  if(message.type==='pause'){paused=true;controls.enabled=false;controls.reset();document.body.classList.add('paused');}
  if(message.type==='resume'){paused=false;controls.enabled=true;last=performance.now();document.body.classList.remove('paused');}
  if(message.type==='setTime'){sky.hours=((message.timeOfDay%24)+24)%24;if(message.day!==undefined)sky.day=Math.floor(message.day);}
  if(message.type==='setSeed'){scene.remove(terrain.group);terrain.dispose();seed=seedNumber(message.seed);terrain=new Terrain(seed);scene.add(terrain.group);player.set(pathX(12,seed),0,12);controls.yaw=0;}
},()=>({position:player.toArray(),timeOfDay:sky.hours,day:sky.day,seed,paused,chunks:terrain.chunks.size,pixelRatio:ratio,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles}));

function resize(){renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();

function render(now:number){
  requestAnimationFrame(render);
  const raw=(now-last)/1000;last=now;
  if(paused||document.hidden)return;
  const dt=Math.min(raw,.05);
  const movement=controls.direction();
  const speed=controls.keys.has('shift')?8:4.5;
  const next=player.clone().addScaledVector(movement,dt*speed);
  if(heightAt(next.x,next.z,seed)>WATER-.2){player.x=next.x;player.z=next.z;}
  player.y=heightAt(player.x,player.z,seed)+1.7;
  camera.position.copy(player);camera.position.y+=Math.sin(now*.009)*.018*movement.length();
  camera.rotation.set(controls.pitch,controls.yaw,0);
  terrain.update(player.x,player.z);sky.update(dt,player,scene);
  if(Math.floor(now/1000)!==lastClock){lastClock=Math.floor(now/1000);const h=Math.floor(sky.hours),m=Math.floor(sky.hours%1*60);clock.textContent=`Day ${String(sky.day).padStart(2,'0')}  ·  ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;}
  renderer.render(scene,camera);
  if(raw<.2){frameSum+=raw;frames++;}
  if(frames>=90){const average=frameSum/frames;if(average>.022&&ratio>.65){ratio=Math.max(.65,ratio-.15);resize();}else if(average<.017&&ratio<Math.min(devicePixelRatio,1.75)){ratio=Math.min(devicePixelRatio,1.75,ratio+.05);resize();}frames=0;frameSum=0;}
}
requestAnimationFrame(render);
post({type:'ready',version:1,seed});
