import * as THREE from 'three';
import { hash, WATER } from './terrain';

const palettes = [
  {t:0,top:'#071025',horizon:'#2c405a',fog:'#172a3e',light:'#96b9f7',ground:'#253047',power:.35},
  {t:5,top:'#1a2145',horizon:'#996b79',fog:'#5d6276',light:'#d5b8bd',ground:'#4b4359',power:.55},
  {t:7,top:'#6e8eac',horizon:'#f4c79a',fog:'#b2aaa1',light:'#ffe1b3',ground:'#6d6976',power:2.1},
  {t:12,top:'#598aa7',horizon:'#d9dfcf',fog:'#93b1b4',light:'#fff3d6',ground:'#63746d',power:2.5},
  {t:17,top:'#526a8a',horizon:'#f2c08c',fog:'#afa29b',light:'#ffc996',ground:'#5d6375',power:1.8},
  {t:18.5,top:'#283454',horizon:'#dc997d',fog:'#7b7b8a',light:'#ffb16a',ground:'#4c4d6d',power:1.1},
  {t:20,top:'#0a1730',horizon:'#626580',fog:'#35465e',light:'#aec8ff',ground:'#26364e',power:.45},
  {t:24,top:'#071025',horizon:'#2c405a',fog:'#172a3e',light:'#96b9f7',ground:'#253047',power:.35},
];

export class Sky {
  hours=18.3;
  day=1;
  elapsed=0;
  group=new THREE.Group();
  sunLight=new THREE.DirectionalLight('#ffcf99',1.8);
  ambient=new THREE.HemisphereLight('#adc3dc','#30374c',1.6);
  private skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color()},horizon:{value:new THREE.Color()},time:{value:0}},vertexShader:'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 vPosition;uniform vec3 top;uniform vec3 horizon;uniform float time;void main(){vec3 d=normalize(vPosition);float h=pow(max(d.y,0.),.55);vec3 c=mix(horizon,top,h);float bands=sin(d.x*18.+d.z*13.+sin(d.z*28.)*.4+time*.006);float cloud=smoothstep(.65,1.,bands)*smoothstep(.05,.2,d.y)*(1.-smoothstep(.25,.55,d.y));c=mix(c,horizon*.92,cloud*.25);gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
  private dome=new THREE.Mesh(new THREE.SphereGeometry(250,24,16),this.skyMaterial);
  private sun=new THREE.Mesh(new THREE.SphereGeometry(3,16,12),new THREE.MeshBasicMaterial({color:'#ffddac',fog:false}));
  private moon=new THREE.Mesh(new THREE.SphereGeometry(2,16,12),new THREE.MeshBasicMaterial({color:'#d9e8fa',fog:false}));
  private stars:THREE.Points;
  private seaMaterial=new THREE.ShaderMaterial({uniforms:{time:{value:0},color:{value:new THREE.Color('#364d63')},horizon:{value:new THREE.Color('#a8a7ab')},sun:{value:new THREE.Vector3()},night:{value:0}},vertexShader:`varying vec3 vWorld;uniform float time;void main(){vec3 p=position;p.z+=sin(p.x*.18+time*.7)*.08+sin(p.y*.3+time*.5)*.05;vec4 w=modelMatrix*vec4(p,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`varying vec3 vWorld;uniform float time;uniform vec3 color;uniform vec3 horizon;uniform vec3 sun;uniform float night;void main(){vec3 eye=normalize(cameraPosition-vWorld);float distance=length(cameraPosition.xz-vWorld.xz);float waves=sin(vWorld.x*.9+vWorld.z*1.9+time*.8+sin(vWorld.z*.32-time*.3)*2.);float glint=pow(max(0.,waves),22.);float streak=pow(max(0.,dot(normalize(vec2(sun.x,sun.z)),normalize(vWorld.xz-cameraPosition.xz))),24.);vec3 c=mix(color,horizon,pow(1.-max(eye.y,0.),3.)*.6);c+=vec3(.95,.65,.3)*glint*streak*.55;c+=vec3(.2,.28,.35)*smoothstep(.97,1.,waves)*.1;c=mix(c,horizon,1.-exp(-distance*.008));gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
  sea=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000,48,48),this.seaMaterial);

  constructor(scene:THREE.Scene){
    this.dome.renderOrder=-10;this.group.add(this.dome,this.sun,this.moon);
    const points=[];
    for(let i=0;i<750;i++){
      const az=hash(i,1,731)*Math.PI*2,alt=.04+hash(i,2,731)*1.5;
      points.push(Math.cos(az)*Math.cos(alt)*220,Math.sin(alt)*220,Math.sin(az)*Math.cos(alt)*220);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    this.stars=new THREE.Points(geometry,new THREE.PointsMaterial({color:'#d0dcf3',size:.45,transparent:true,opacity:0,depthWrite:false,fog:false}));
    this.group.add(this.stars);scene.add(this.group,this.sunLight,this.ambient,this.sea);
    this.sea.rotation.x=-Math.PI/2;this.sea.position.y=WATER;
    scene.fog=new THREE.FogExp2('#7b7b8a',.018);
  }

  update(dt:number,player:THREE.Vector3,scene:THREE.Scene){
    this.elapsed+=dt;this.hours+=dt*.1;
    if(this.hours>=24){this.hours-=24;this.day++;}
    const index=Math.max(0,palettes.findIndex(p=>p.t>this.hours)-1),a=palettes[index],b=palettes[index+1];
    const f=THREE.MathUtils.smoothstep(this.hours,a.t,b.t);
    const blend=(key:'top'|'horizon'|'fog'|'light'|'ground')=>new THREE.Color(a[key]).lerp(new THREE.Color(b[key]),f);
    this.skyMaterial.uniforms.top.value.copy(blend('top'));this.skyMaterial.uniforms.horizon.value.copy(blend('horizon'));this.skyMaterial.uniforms.time.value=this.elapsed;
    (scene.fog as THREE.FogExp2).color.copy(blend('fog'));
    this.sunLight.color.copy(blend('light'));this.sunLight.intensity=THREE.MathUtils.lerp(a.power,b.power,f);
    this.ambient.color.copy(blend('light'));this.ambient.groundColor.copy(blend('ground'));
    this.ambient.intensity=1.2;
    const angle=(this.hours-6)/24*Math.PI*2;
    this.sun.position.set(Math.cos(angle)*145,Math.sin(angle)*155,-90);
    this.moon.position.copy(this.sun.position).multiplyScalar(-1);
    this.sunLight.position.copy(this.sun.position.y>0?this.sun.position:this.moon.position);
    this.group.position.copy(player);this.sea.position.x=player.x;this.sea.position.z=player.z;
    const night=1-THREE.MathUtils.smoothstep(Math.sin(angle),-.15,.2);
    (this.stars.material as THREE.PointsMaterial).opacity=night*.9;
    this.seaMaterial.uniforms.time.value=this.elapsed;this.seaMaterial.uniforms.color.value.copy(blend('top')).multiplyScalar(.6);this.seaMaterial.uniforms.horizon.value.copy(blend('fog'));this.seaMaterial.uniforms.sun.value.copy(this.sun.position.y>0?this.sun.position:this.moon.position);this.seaMaterial.uniforms.night.value=night;
  }
}
