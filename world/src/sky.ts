import * as THREE from 'three';
import { hash, WATER } from './terrain';

const palettes = [
  {t:0,top:'#050b1d',horizon:'#1d2c4c',fog:'#13203a',light:'#9fb0de',ground:'#121828',power:.45},
  {t:5,top:'#141c3a',horizon:'#6a6f8e',fog:'#3e4a66',light:'#c6cde4',ground:'#2a3046',power:.6},
  {t:7,top:'#5d7fa3',horizon:'#d9d6d0',fog:'#9aa8b8',light:'#f3eee4',ground:'#5a6474',power:2},
  {t:12,top:'#4f7fa8',horizon:'#d6e2ea',fog:'#a3b8c6',light:'#ffffff',ground:'#5f6c78',power:2.4},
  {t:17,top:'#46628a',horizon:'#d8cbbd',fog:'#9aa3b2',light:'#f6e6d2',ground:'#55607a',power:1.8},
  {t:18.5,top:'#1f2b4e',horizon:'#a48a8c',fog:'#5d6580',light:'#e0c4b0',ground:'#3c4360',power:1.1},
  {t:20,top:'#08122c',horizon:'#3a4462',fog:'#1f2a46',light:'#a9b8e0',ground:'#161c30',power:.55},
  {t:24,top:'#050b1d',horizon:'#1d2c4c',fog:'#13203a',light:'#9fb0de',ground:'#121828',power:.45},
];

export class Sky {
  hours=19.4;
  day=1;
  elapsed=0;
  night=0;
  group=new THREE.Group();
  sunLight=new THREE.DirectionalLight('#ffcf99',1.8);
  ambient=new THREE.HemisphereLight('#adc3dc','#30374c',1.6);
  private skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color()},horizon:{value:new THREE.Color()},time:{value:0}},vertexShader:'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 vPosition;uniform vec3 top;uniform vec3 horizon;uniform float time;void main(){vec3 d=normalize(vPosition);float h=pow(max(d.y,0.),.55);vec3 c=mix(horizon,top,h);float bands=sin(d.x*18.+d.z*13.+sin(d.z*28.)*.4+time*.006);float cloud=smoothstep(.65,1.,bands)*smoothstep(.05,.2,d.y)*(1.-smoothstep(.25,.55,d.y));c=mix(c,horizon*.92,cloud*.25);gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
  private dome=new THREE.Mesh(new THREE.SphereGeometry(250,24,16),this.skyMaterial);
  private sun=new THREE.Mesh(new THREE.SphereGeometry(3,16,12),new THREE.MeshBasicMaterial({color:'#ffddac',fog:false}));
  private moon=new THREE.Mesh(new THREE.SphereGeometry(2,16,12),new THREE.MeshBasicMaterial({color:'#d9e8fa',fog:false}));
  private stars:THREE.Points;
  private seaMaterial=new THREE.ShaderMaterial({uniforms:{time:{value:0},color:{value:new THREE.Color('#364d63')},horizon:{value:new THREE.Color('#a8a7ab')},sun:{value:new THREE.Vector3()},night:{value:0}},vertexShader:`varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`varying vec3 vWorld;uniform float time;uniform vec3 color;uniform vec3 horizon;uniform vec3 sun;uniform float night;float wave(vec2 p){return sin(p.x*.22+time*.55)*sin(p.y*.17-time*.31)+sin((p.x+p.y)*.09+time*.2)*.6;}void main(){vec2 p=vWorld.xz;float h=wave(p);float hx=wave(p+vec2(.8,0.));float hz=wave(p+vec2(0.,.8));vec3 n=normalize(vec3(h-hx,.35,h-hz));vec3 eye=normalize(cameraPosition-vWorld);vec3 light=normalize(sun);float fresnel=pow(1.-max(dot(eye,vec3(0.,1.,0.)),0.),3.);float glint=pow(max(dot(reflect(-light,n),eye),0.),48.);float distance=length(cameraPosition.xz-p);vec3 c=mix(color*.55,horizon,fresnel*.75+glint*.35);c+=vec3(1.,.72,.42)*glint*(.25+night*.45);c=mix(c,horizon,1.-exp(-distance*.006));gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
  sea=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000,1,1),this.seaMaterial);

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
    (scene.fog as THREE.FogExp2).density=.008+(1-THREE.MathUtils.smoothstep(Math.sin((this.hours-6)/24*Math.PI*2),-.1,.5))*.008;
    this.sunLight.color.copy(blend('light'));this.sunLight.intensity=THREE.MathUtils.lerp(a.power,b.power,f);
    this.ambient.color.copy(blend('light'));this.ambient.groundColor.copy(blend('ground'));
    this.ambient.intensity=1.2;
    const angle=(this.hours-6)/24*Math.PI*2;
    this.sun.position.set(Math.cos(angle)*145,Math.sin(angle)*155,-90);
    this.moon.position.copy(this.sun.position).multiplyScalar(-1);
    this.sunLight.position.copy(this.sun.position.y>0?this.sun.position:this.moon.position);
    this.group.position.copy(player);this.sea.position.x=player.x;this.sea.position.z=player.z;
    const night=1-THREE.MathUtils.smoothstep(Math.sin(angle),-.15,.2);
    (this.stars.material as THREE.PointsMaterial).opacity=night*.9;this.night=night;
    this.seaMaterial.uniforms.time.value=this.elapsed;this.seaMaterial.uniforms.color.value.copy(blend('top')).multiplyScalar(.6);this.seaMaterial.uniforms.horizon.value.copy(blend('fog'));this.seaMaterial.uniforms.sun.value.copy(this.sun.position.y>0?this.sun.position:this.moon.position);this.seaMaterial.uniforms.night.value=night;
  }
}
