import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Terrain, heightAt, pathX, shore, surfaceAt, WATER } from './terrain';
import { Soundscape } from './audio';
import { createAsciiPass } from './ascii';
import { shared } from './shading';
import { theme } from './theme';
import { Controls } from './controls';
import { Sky } from './sky';
import { Landmarks } from './landmarks';
import { bridge, post, seedNumber } from './bridge';
import type { Thing } from './things';
import './style.css';

const canvas=document.querySelector<HTMLCanvasElement>('#world')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NeutralToneMapping;
renderer.toneMappingExposure=1;
let ratio=Math.min(devicePixelRatio,1.75);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,300);
camera.rotation.order='YXZ';
let seed=8741;
let terrain=new Terrain(seed);scene.add(terrain.group);
let landmarks=new Landmarks(seed);scene.add(landmarks.group);
const player=new THREE.Vector3(pathX(12,seed),0,12);
const sky=new Sky(scene);
const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
const outline=new OutlinePass(new THREE.Vector2(innerWidth,innerHeight),scene,camera);
outline.visibleEdgeColor.set(theme.moonstone);outline.hiddenEdgeColor.set('#000000');outline.edgeStrength=3;outline.edgeGlow=.55;outline.edgeThickness=1;outline.pulsePeriod=3;
composer.addPass(outline);composer.addPass(new OutputPass());
const ascii=createAsciiPass();composer.addPass(ascii);
const audio=new Soundscape();

let asciiFrom=0,asciiTo=0,asciiStart=0,asciiDuration=0;
const velocity=new THREE.Vector3();
let viewYaw=0,viewPitch=-.04,stepPhase=0;
const unlock=()=>audio.unlock();
window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);window.addEventListener('touchend',unlock);
const controls=new Controls(canvas,tap);
const clock=document.querySelector<HTMLElement>('#clock')!;
const label=document.querySelector<HTMLElement>('#label')!;
const raycaster=new THREE.Raycaster();
const screenPosition=new THREE.Vector3();
renderer.info.autoReset=false;
let frameCalls=0,frameTriangles=0;
let paused=false,last=performance.now(),frames=0,frameSum=0,lastClock=-1,ready=false;
let interaction:{thing:Thing;end:number;frames:number;materials:Map<THREE.Mesh,THREE.Material|THREE.Material[]>;fill:THREE.ShaderMaterial}|null=null;

function clearInteraction(){
  if(!interaction)return;
  for(const [mesh,material] of interaction.materials)mesh.material=material;
  interaction.fill.dispose();interaction=null;
}

function tap(x:number,y:number){
  if(paused||interaction)return;
  raycaster.setFromCamera(new THREE.Vector2(x/innerWidth*2-1,1-y/innerHeight*2),camera);
  const hits=raycaster.intersectObjects([...landmarks.group.children,...terrain.group.children],true);
  const hit=hits.find(h=>!h.object.userData.effect);
  if(!hit)return;
  let root:THREE.Object3D|null=hit.object;
  while(root&&!root.userData.thingId)root=root.parent;
  if(!root)return;
  const thing=landmarks.things.get(root.userData.thingId);
  if(!thing||!landmarks.reachable(player).includes(thing))return;
  const materials=new Map<THREE.Mesh,THREE.Material|THREE.Material[]>();
  const fill=new THREE.ShaderMaterial({uniforms:{base:{value:thing.root.position.y}},vertexShader:'varying float h;uniform float base;void main(){vec4 w=modelMatrix*vec4(position,1.);h=w.y-base;gl_Position=projectionMatrix*viewMatrix*w;}',fragmentShader:'varying float h;void main(){vec3 c=mix(vec3(1.,.42,.52),vec3(.91,.933,.945),smoothstep(0.,4.,h));gl_FragColor=vec4(c,1.);}',side:THREE.DoubleSide});
  thing.root.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.effect){materials.set(o,o.material);o.material=fill;}});
  interaction={thing,end:performance.now()+300,frames:0,materials,fill};controls.enabled=false;controls.reset();
}

function screenshot(){
  const width=1280,height=Math.round(width/camera.aspect);
  try{
    renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.setRenderTarget(null);renderer.render(scene,camera);
    return canvas.toDataURL('image/jpeg',.88);
  }finally{resize();}
}

bridge(message=>{
  if(message.type==='pause'){paused=true;controls.enabled=false;controls.reset();audio.setRunning(false);document.body.classList.add('paused');}
  if(message.type==='setSound')audio.setSound(message.on);
  if(message.type==='setMusic')audio.setMusic(message.on);
  if(message.type==='mute'){audio.setSound(!message.muted);audio.setMusic(!message.muted);}
  if(message.type==='setAscii'){asciiFrom=ascii.uniforms.amount.value;asciiTo=THREE.MathUtils.clamp(message.amount,0,1);asciiStart=performance.now();asciiDuration=Math.max(0,message.durationMs??600);}
  if(message.type==='resume'){paused=false;controls.enabled=true;last=performance.now();document.body.classList.remove('paused');}
  if(message.type==='setTime'){sky.hours=((message.timeOfDay%24)+24)%24;if(message.day!==undefined)sky.day=Math.floor(message.day);lastClock=-1;}
  if(message.type==='setSeed'){
    clearInteraction();scene.remove(terrain.group,landmarks.group);terrain.dispose();landmarks.dispose();seed=seedNumber(message.seed);
    terrain=new Terrain(seed);landmarks=new Landmarks(seed);scene.add(terrain.group,landmarks.group);player.set(pathX(12,seed),0,12);controls.yaw=0;viewYaw=0;velocity.set(0,0,0);controls.reset();controls.enabled=!paused;
  }
  if(message.type==='applyOutcome')landmarks.apply(message.thingId,message.change);
},()=>({position:player.toArray(),yaw:controls.yaw,timeOfDay:sky.hours,day:sky.day,seed,paused,ascii:ascii.uniforms.amount.value,audio:audio.state(),chunks:terrain.chunks.size,pixelRatio:ratio,drawCalls:frameCalls,triangles:frameTriangles,things:[...landmarks.things.values()].map(t=>{const v=t.root.position.clone().add(new THREE.Vector3(0,1,0)).project(camera);const onScreen=v.z>-1&&v.z<1&&Math.abs(v.x)<1&&Math.abs(v.y)<1;return {id:t.id,kind:t.kind,name:t.name,position:t.root.position.toArray(),visible:t.root.visible,reachable:landmarks.reachable(player).includes(t),screen:onScreen?[(v.x*.5+.5)*innerWidth,(-v.y*.5+.5)*innerHeight]:null};})}));

function resize(){renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight,false);composer.setPixelRatio(ratio);composer.setSize(innerWidth,innerHeight);renderer.getDrawingBufferSize(ascii.uniforms.resolution.value);ascii.uniforms.cellScale.value=Math.max(1,Math.round(ratio*1.2));camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();sky.setPixelRatio(ratio);}
window.addEventListener('resize',resize);resize();

function render(now:number){
  requestAnimationFrame(render);
  const raw=(now-last)/1000;last=now;
  audio.setRunning(!paused&&!document.hidden);
  if(paused||document.hidden)return;
  const dt=Math.min(raw,.05);
  const movement=interaction?new THREE.Vector3():controls.direction();
  const speed=controls.keys.has('shift')?8:4.5;
  velocity.lerp(movement.multiplyScalar(speed),1-Math.exp(-dt*7));
  const next=player.clone().addScaledVector(velocity,dt);
  if(heightAt(next.x,next.z,seed)>WATER-.2&&landmarks.canWalk(next.x,next.z)){player.x=next.x;player.z=next.z;}else velocity.multiplyScalar(.5);
  const ground=heightAt(player.x,player.z,seed)+1.7;
  player.y+=(ground-player.y)*(1-Math.exp(-dt*12));
  const pace=velocity.length()/4.5;
  stepPhase+=dt*pace*9.5;
  viewYaw+=Math.atan2(Math.sin(controls.yaw-viewYaw),Math.cos(controls.yaw-viewYaw))*(1-Math.exp(-dt*14));
  viewPitch+=(controls.pitch-viewPitch)*(1-Math.exp(-dt*14));
  camera.position.copy(player);camera.position.y+=Math.abs(Math.sin(stepPhase))*.05*Math.min(pace,1.4)-.02*Math.min(pace,1);
  camera.rotation.set(viewPitch+Math.sin(stepPhase*2)*.004*pace,viewYaw,Math.sin(stepPhase)*.006*pace);
  shared.time.value=sky.elapsed;shared.rim.value.copy(sky.rim.value);
  if(asciiDuration>=0){const t=asciiDuration===0?1:Math.min(1,(now-asciiStart)/asciiDuration);const e=t*t*(3-2*t);ascii.uniforms.amount.value=asciiFrom+(asciiTo-asciiFrom)*e;ascii.enabled=ascii.uniforms.amount.value>.001;}
  audio.update(dt,{moving:Math.min(pace,1.6),surface:surfaceAt(player.x,player.z,seed),shore:Math.max(0,shore(player.z,seed)-player.x),hours:sky.hours,elapsed:sky.elapsed});
  terrain.update(player.x,player.z);sky.update(Math.min(raw,.5),player,scene);landmarks.update(player,sky.elapsed);
  const reachable=landmarks.reachable(player);
  outline.selectedObjects=[];
  for(const thing of reachable)thing.root.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.effect)outline.selectedObjects.push(o);});
  const dissolved=ascii.uniforms.amount.value>.02;
  outline.enabled=outline.selectedObjects.length>0&&!interaction&&!dissolved;
  label.style.display='none';
  if(reachable.length&&!interaction&&!dissolved){
    const thing=reachable.sort((a,b)=>a.root.position.distanceToSquared(player)-b.root.position.distanceToSquared(player))[0];
    screenPosition.copy(thing.root.position).add(new THREE.Vector3(0,thing.kind==='lantern'?3.6:2.5,0)).project(camera);
    if(screenPosition.z<1&&screenPosition.z>-1&&Math.abs(screenPosition.x)<.9&&Math.abs(screenPosition.y)<.9){label.textContent=thing.name;label.style.display='block';label.style.left=`${(screenPosition.x*.5+.5)*innerWidth}px`;label.style.top=`${(-screenPosition.y*.5+.5)*innerHeight}px`;}
  }
  if(Math.floor(now/1000)!==lastClock){
    lastClock=Math.floor(now/1000);const h=Math.floor(sky.hours),m=Math.floor(sky.hours%1*60);clock.textContent=`Day ${String(sky.day).padStart(2,'0')}  ·  ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    post({type:'clock',timeOfDay:sky.hours,day:sky.day});
  }
  if(interaction&&now>=interaction.end&&interaction.frames>=3){
    const thing=interaction.thing;clearInteraction();
    try{post({type:'interact',thingId:thing.id,name:thing.name,description:thing.description,screenshot:screenshot(),timeOfDay:sky.hours,day:sky.day,position:{x:player.x,y:player.y,z:player.z},seed});}
    catch{post({type:'error',code:'capture_failed',message:'Unable to capture this view.'});}
    controls.enabled=!paused;
  }
  renderer.info.reset();
  composer.render();
  if(interaction)interaction.frames++;
  frameCalls=renderer.info.render.calls;frameTriangles=renderer.info.render.triangles;
  if(!ready){ready=true;post({type:'ready',version:1,seed});}
  if(raw<.2){frameSum+=raw;frames++;}
  if(frames>=90){const average=frameSum/frames;if(average>.022&&ratio>.65){ratio=Math.max(.65,ratio-.15);resize();}else if(average<.017&&ratio<Math.min(devicePixelRatio,1.75)){ratio=Math.min(devicePixelRatio,1.75,ratio+.05);resize();}frames=0;frameSum=0;}
}
requestAnimationFrame(render);
