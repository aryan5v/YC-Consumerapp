import * as THREE from 'three';
import { WATER } from './terrain';
import { skyKeys, theme, type SkyKey } from './theme';

const NOISE = 'float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n2(p);p=p*2.03+vec2(17.1,9.3);a*=.5;}return v;}';
const OUT = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

type ColorKey = Exclude<keyof SkyKey, 't' | 'power'>;

export interface SkyStyle {
  sky: THREE.Color | null;
  fog: THREE.Color | null;
  water: THREE.Color | null;
  accent: THREE.Color | null;
  coverage: number;
  fogScale: number;
  snow: number;
}

export const defaultSkyStyle = (): SkyStyle => ({ sky: null, fog: null, water: null, accent: null, coverage: 0, fogScale: 1, snow: 0 });

export class Sky {
  style: SkyStyle = defaultSkyStyle();
  hours = theme.startHour;
  day = 1;
  elapsed = 0;
  night = 0;
  group = new THREE.Group();
  sunLight = new THREE.DirectionalLight('#ffffff', 2);
  ambient = new THREE.HemisphereLight('#c4e2ee', '#627a62', 1.4);
  rim = { value: new THREE.Color(theme.moonstone) };
  colors: Record<ColorKey, THREE.Color> = Object.fromEntries((['zenith', 'horizon', 'haze', 'light', 'sky', 'ground', 'cloudLit', 'cloudShade', 'mountain'] as ColorKey[]).map(k => [k, new THREE.Color()])) as Record<ColorKey, THREE.Color>;
  sunDir = new THREE.Vector3();
  moonDir = new THREE.Vector3();
  private skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, cloudLit: { value: new THREE.Color() }, cloudShade: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, moonDir: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() }, moon: { value: new THREE.Color(theme.moonstone) }, time: { value: 0 }, night: { value: 0 }, moonVis: { value: 0 }, coverage: { value: 0 } },
    vertexShader: 'varying vec3 vDir;void main(){vDir=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
    fragmentShader: 'varying vec3 vDir;uniform vec3 zenith,horizon,cloudLit,cloudShade,sunDir,moonDir,sunColor,moon;uniform float time,night,moonVis,coverage;' + NOISE + `
      void main(){
        vec3 d=normalize(vDir);
        float up=max(d.y,0.);
        vec3 c=mix(horizon,zenith,pow(up,.5));
        c=mix(c,horizon*1.04,smoothstep(.12,-.02,d.y));
        c+=mix(horizon,vec3(1.),.5)*exp(-abs(d.y-.005)*70.)*(.22-night*.12);
        float sd=max(dot(d,sunDir),0.);
        c+=sunColor*(pow(sd,8.)*.35+pow(sd,90.)*.6)*(1.-night);
        c=mix(c,vec3(1.,.98,.95),smoothstep(.9994,.9997,sd)*(1.-night));
        float md=dot(d,moonDir);
        c+=moon*(pow(max(md,0.),24.)*.22+pow(max(md,0.),300.)*.35)*moonVis*(.3+night*.7);
        float disc=smoothstep(.9955,.9962,md)*moonVis;
        float craters=fbm(d.xy*70.+d.z*30.)*.3;
        c=mix(c,moon*(1.06-craters*.5),disc*(.45+night*.55));
        vec3 sp=d*160.;vec3 cell=floor(sp);float sh=h2(cell.xy+cell.z*7.13);
        float tw=.55+.45*sin(time*2.3+sh*60.);
        float star=step(.993,sh)*smoothstep(.6,.0,length(fract(sp)-.5))*tw*(.6+sh*40.-39.6);
        c+=moon*star*1.4*night*smoothstep(.0,.2,d.y)*(1.-disc);
        vec2 uv=d.xz/(d.y+.22);
        vec2 drift=vec2(time*.006,time*.002);
        float base=fbm(uv*.9+drift);
        float shape=smoothstep(.56,.68,base+fbm(uv*3.1-drift)*.16-.1-smoothstep(.3,.8,d.y)*.12+coverage*.14);
        float lit=fbm(uv*.9+drift-sunDir.xz*.06);
        vec3 cloud=mix(cloudShade,cloudLit,clamp(.4+(base-lit)*6.,0.,1.));
        cloud+=sunColor*pow(sd,6.)*.25*(1.-night);
        float mask=shape*smoothstep(.0,.18,d.y)*(1.-smoothstep(.55,.9,d.y)*.6);
        c=mix(c,cloud,mask*(.92-night*.45));
        gl_FragColor=vec4(c,1.);` + OUT + '}',
  });
  private dome = new THREE.Mesh(new THREE.SphereGeometry(260, 32, 20), this.skyMaterial);
  private mountainMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    uniforms: { haze: { value: new THREE.Color() }, far: { value: new THREE.Color() }, near: { value: new THREE.Color() }, center: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3() }, lit: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vWorld;varying vec2 vUv;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: 'varying vec3 vWorld;varying vec2 vUv;uniform vec3 haze,far,near,center,sunDir,lit;' + NOISE + `
      float ridge(float a,float s,float k){return fbm(vec2(a*k+s,s*3.1))*.9+n2(vec2(a*k*4.+s,1.))*.12;}
      void main(){
        vec2 dir=normalize(vWorld.xz-center.xz);
        float a=atan(dir.y,dir.x);
        float land=smoothstep(.35,-.45,dir.x);
        float y=vUv.y;
        vec3 col=vec3(0.);float alpha=0.;
        for(int i=0;i<3;i++){
          float fi=float(i);
          float h=(ridge(a,fi*11.7+3.,1.6+fi*1.1)*(.95-fi*.2)+.08)*land+.06;
          if(y<h){
            float depth=fi/2.;
            vec3 tone=mix(far,near,depth);
            float side=max(dot(normalize(vec3(dir.x,.4,dir.y)),sunDir),0.);
            tone=mix(tone,lit,side*.18*(1.-depth));
            tone=mix(tone,haze,(1.-depth)*.55+smoothstep(h,0.,y)*.25);
            col=tone;alpha=1.;
          }
        }
        if(alpha<.5)discard;
        gl_FragColor=vec4(col,1.);` + OUT + '}',
  });
  private mountains = new THREE.Mesh(new THREE.CylinderGeometry(235, 235, 90, 96, 1, true), this.mountainMaterial);
  private seaMaterial = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { time: { value: 0 }, deep: { value: new THREE.Color(theme.lagoon) }, horizon: { value: new THREE.Color() }, sky: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() }, night: { value: 0 }, moon: { value: new THREE.Color(theme.moonstone) } },
    vertexShader: 'varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: 'varying vec3 vWorld;uniform float time,night;uniform vec3 deep,horizon,sky,sunDir,sunColor,moon;' + NOISE + `
      void main(){
        vec2 p=vWorld.xz;
        float w1=n2(p*.18+vec2(time*.12,time*.05));
        float w2=n2(p*.45-vec2(time*.08,-time*.11));
        vec3 n=normalize(vec3((w1-.5)*.5+(w2-.5)*.3,1.,(n2(p*.18+vec2(5.,time*.09))-.5)*.5+(w2-.5)*.3));
        vec3 eye=normalize(cameraPosition-vWorld);
        float dist=length(cameraPosition.xz-p);
        float fres=pow(1.-max(dot(eye,vec3(0.,1.,0.)),0.),4.);
        vec3 c=mix(deep,mix(deep*1.6,sky,.35),.4+w1*.25);
        c=mix(c,horizon,fres*.85);
        vec3 r=reflect(-eye,n);
        float spec=pow(max(dot(r,sunDir),0.),220.);
        float sparkle=step(.82,n2(p*2.2+time*.7))*step(.8,n2(p*3.7-time*.5))*pow(max(dot(r,sunDir),0.),18.);
        c+=mix(sunColor,moon,night)*(spec*1.4+sparkle*1.2);
        c=mix(c,horizon,smoothstep(40.,220.,dist));
        gl_FragColor=vec4(c,1.);` + OUT + '}',
  });
  sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 1, 1), this.seaMaterial);
  private cumulusMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { lit: { value: new THREE.Color() }, shade: { value: new THREE.Color() }, haze: { value: new THREE.Color() }, sun: { value: new THREE.Color() }, sunSide: { value: 0 }, night: { value: 0 } },
    vertexShader: 'attribute float seed;varying vec2 vUv;varying float vSeed;void main(){vUv=uv;vSeed=seed;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;varying float vSeed;uniform vec3 lit,shade,haze,sun;uniform float sunSide,night;' + NOISE + `
      void main(){
        vec2 p=vUv*vec2(2.,1.)-vec2(1.,0.);
        float d=1e3;
        for(int i=0;i<7;i++){
          float fi=float(i);
          vec2 c=vec2((fi-3.)*.2+sin(vSeed*9.+fi*2.1)*.05,.22+sin(fi*1.9+vSeed*5.)*.06+(1.-abs(fi-3.)/3.)*.22);
          float r=.15+.13*(1.-abs(fi-3.)/3.)+h2(vec2(fi,vSeed))*.05;
          d=min(d,length((p-c)*vec2(1.,1.15))-r);
        }
        d+= (fbm(p*5.+vSeed*10.)-.5)*.05;
        float a=smoothstep(.035,-.03,d)*smoothstep(.0,.1,p.y)*(1.-smoothstep(.8,.98,abs(p.x)));
        if(a<.01)discard;
        float top=smoothstep(.05,.65,p.y);
        vec3 col=mix(shade,lit,top*.8+.15);
        float edge=smoothstep(-.09,.0,d);
        col+=sun*edge*(.12+max(sunSide*p.x,0.)*.3)*(1.-night*.7);
        col=mix(col,haze,.18+(1.-top)*.2);
        gl_FragColor=vec4(col,a*(.95-night*.35));` + OUT + '}',
  });
  private cumulus = new THREE.Group();
  private spire = new THREE.Group();
  private spireMaterial = new THREE.MeshBasicMaterial({ color: '#7f97a3', fog: false });
  private spireGlow: THREE.Mesh;
  private motes: THREE.Points;
  private moteMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { time: { value: 0 }, center: { value: new THREE.Vector3() }, color: { value: new THREE.Color(theme.moonstone) }, strength: { value: 0 }, scale: { value: 300 }, snow: { value: 0 }, petal: { value: new THREE.Color(theme.blossom) }, day: { value: 1 } },
    vertexShader: `uniform float time,scale,snow;uniform vec3 center;attribute float seed;varying float vFade;varying float vSeed;
      void main(){
        vSeed=seed;vec3 p=position;
        p.y+=mix(mod(time*(.15+seed*.2)+seed*10.,8.)-4.,4.-mod(time*(.9+seed*.6)+seed*10.,8.),snow);
        p.x+=sin(time*.4+seed*20.)*.8;p.z+=cos(time*.33+seed*13.)*.8;
        vec3 rel=mod(p-center+20.,40.)-20.;
        vec3 w=center+rel;w.y=center.y+p.y-1.;
        vFade=(1.-smoothstep(10.,20.,length(rel.xz)))*mix(.5+.5*sin(time*1.7+seed*30.),1.,snow);
        vec4 mv=viewMatrix*vec4(w,1.);
        gl_PointSize=scale*(.05+seed*.05)*(1.+snow*.6)/-mv.z;
        gl_Position=projectionMatrix*mv;}`,
    fragmentShader: 'uniform vec3 color,petal;uniform float strength,day;varying float vFade;varying float vSeed;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d);vec3 c=mix(color,petal,step(.55,vSeed)*day);gl_FragColor=vec4(c*a*a*vFade*strength,1.);}',
  });

  constructor(scene: THREE.Scene) {
    this.dome.renderOrder = -10;
    this.mountains.renderOrder = -9;
    this.mountains.position.y = 20;
    this.group.add(this.dome);
    const count = 260, pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) { pos[i * 3] = Math.random() * 40; pos[i * 3 + 1] = Math.random() * 4; pos[i * 3 + 2] = Math.random() * 40; seed[i] = Math.random(); }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.motes = new THREE.Points(geometry, this.moteMaterial);
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.translate(0, .5, 0);
    for (let i = 0; i < 6; i++) {
      const g = plane.clone();
      g.setAttribute('seed', new THREE.Float32BufferAttribute(new Array(4).fill(i * .17 + .1), 1));
      const cloud = new THREE.Mesh(g, this.cumulusMaterial);
      const a = -Math.PI * .5 + (i - 2.5) * .55 + (i % 2) * .2;
      const r = 225;
      const w = 110 + (i % 3) * 40;
      cloud.position.set(Math.cos(a) * r, 18 + (i % 3) * 14, Math.sin(a) * r);
      cloud.scale.set(w, w * .5, 1);
      cloud.lookAt(0, cloud.position.y, 0);
      cloud.renderOrder = -9.5;
      cloud.frustumCulled = false;
      this.cumulus.add(cloud);
    }
    const rock = new THREE.ConeGeometry(14, 26, 7);
    rock.rotateX(Math.PI);
    const top = new THREE.CylinderGeometry(9, 14, 4, 7);
    top.translate(0, 15, 0);
    rock.translate(0, 0, 0);
    const tower = new THREE.CylinderGeometry(1.6, 2.6, 34, 6);
    tower.translate(0, 34, 0);
    const cap = new THREE.ConeGeometry(3, 10, 6);
    cap.translate(0, 56, 0);
    for (const g of [rock, top, tower, cap]) this.spire.add(new THREE.Mesh(g, this.spireMaterial));
    this.spireGlow = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), new THREE.MeshBasicMaterial({ color: theme.blossom, fog: false, transparent: true, opacity: .9 }));
    this.spireGlow.position.y = 50;
    this.spire.add(this.spireGlow);
    this.spire.position.set(-70, 70, -250);
    this.spire.scale.setScalar(.9);
    this.spire.renderOrder = -8.5;
    this.spire.traverse(o => { o.frustumCulled = false; });
    this.motes.frustumCulled = false;
    scene.add(this.group, this.cumulus, this.spire, this.mountains, this.sunLight, this.sunLight.target, this.ambient, this.sea, this.motes);
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = WATER;
    scene.fog = new THREE.FogExp2('#c4e1ea', .011);
  }

  private dayNight() {
    const angle = (this.hours - 6) / 24 * Math.PI * 2;
    return 1 - THREE.MathUtils.smoothstep(Math.sin(angle), -.12, .12);
  }

  setPixelRatio(ratio: number) { this.moteMaterial.uniforms.scale.value = 300 * ratio * (innerHeight / 844); }

  update(dt: number, player: THREE.Vector3, scene: THREE.Scene) {
    this.elapsed += dt;
    this.hours += dt * .1;
    if (this.hours >= 24) { this.hours -= 24; this.day++; }
    const i = Math.max(0, skyKeys.findIndex(k => k.t > this.hours) - 1), a = skyKeys[i], b = skyKeys[i + 1];
    const f = THREE.MathUtils.smoothstep(this.hours, a.t, b.t);
    for (const key of Object.keys(this.colors) as ColorKey[]) this.colors[key].set(a[key]).lerp(new THREE.Color(b[key]), f);
    const power = THREE.MathUtils.lerp(a.power, b.power, f);
    const st = this.style, keep = 1 - this.dayNight() * .55;
    if (st.sky) { this.colors.zenith.lerp(st.sky, .65 * keep); this.colors.horizon.lerp(st.sky, .22 * keep); this.colors.sky.lerp(st.sky, .4 * keep); this.colors.mountain.lerp(st.sky, .3 * keep); }
    if (st.fog) { this.colors.haze.lerp(st.fog, .75 * keep); this.colors.horizon.lerp(st.fog, .4 * keep); this.colors.cloudLit.lerp(st.fog, .2 * keep); this.colors.cloudShade.lerp(st.fog, .3 * keep); }
    if (st.accent) this.colors.light.lerp(st.accent, .35);
    const angle = (this.hours - 6) / 24 * Math.PI * 2;
    this.sunDir.set(Math.cos(angle) * .9, Math.sin(angle), -.45).normalize();
    const phase = ((this.hours - 16 + 24) % 24) / 15;
    const az = Math.PI * (.36 + Math.min(phase, 1) * .28);
    this.moonDir.set(Math.cos(az) * .9, Math.sin(Math.min(phase, 1) * Math.PI) * .36 + (phase > 1 ? -.3 : .1), -.85).normalize();
    this.skyMaterial.uniforms.moonVis.value = THREE.MathUtils.smoothstep(this.moonDir.y, -.01, .08);
    this.night = 1 - THREE.MathUtils.smoothstep(this.sunDir.y, -.12, .12);
    const c = this.colors;
    const u = this.skyMaterial.uniforms;
    u.zenith.value.copy(c.zenith); u.horizon.value.copy(c.horizon); u.cloudLit.value.copy(c.cloudLit); u.cloudShade.value.copy(c.cloudShade);
    u.sunDir.value.copy(this.sunDir); u.moonDir.value.copy(this.moonDir); u.sunColor.value.copy(c.light); u.time.value = this.elapsed; u.night.value = this.night; u.coverage.value = st.coverage;
    const fog = scene.fog as THREE.FogExp2;
    fog.color.copy(c.haze);
    fog.density = (.0105 + this.night * .003) * st.fogScale;
    const lightDir = this.night > .5 ? this.moonDir : this.sunDir;
    this.sunLight.position.copy(player).addScaledVector(lightDir, 80);
    this.sunLight.target.position.copy(player);
    this.sunLight.color.copy(c.light);
    this.sunLight.intensity = power;
    this.ambient.color.copy(c.sky); this.ambient.groundColor.copy(c.ground);
    this.ambient.intensity = 1.25 - this.night * .45 + st.snow * .5;
    this.rim.value.copy(c.horizon).lerp(new THREE.Color(theme.moonstone), .4 + this.night * .4);
    this.group.position.copy(player);
    this.cumulus.position.set(player.x, 0, player.z);
    const cu = this.cumulusMaterial.uniforms;
    cu.lit.value.copy(c.cloudLit); cu.shade.value.copy(c.cloudShade).lerp(c.zenith, .25); cu.haze.value.copy(c.haze); cu.sun.value.copy(c.light); cu.night.value = this.night; cu.sunSide.value = -this.sunDir.x;
    this.spire.position.set(player.x - 70, 64 + Math.sin(this.elapsed * .2) * 2, player.z - 250);
    this.spire.rotation.y = this.elapsed * .02;
    this.spireMaterial.color.copy(c.mountain).lerp(c.haze, .45);
    (this.spireGlow.material as THREE.MeshBasicMaterial).opacity = .5 + this.night * .5;
    this.mountains.position.set(player.x, 35, player.z);
    const m = this.mountainMaterial.uniforms;
    m.haze.value.copy(c.haze); m.far.value.copy(c.mountain).lerp(c.haze, .45); m.near.value.copy(c.mountain); m.center.value.copy(player); m.sunDir.value.copy(this.sunDir); m.lit.value.copy(c.light);
    this.sea.position.x = player.x; this.sea.position.z = player.z;
    const s = this.seaMaterial.uniforms;
    s.time.value = this.elapsed; s.horizon.value.copy(c.horizon).lerp(c.haze, .3); s.sky.value.copy(c.zenith); s.sunDir.value.copy(lightDir); s.sunColor.value.copy(c.light); s.night.value = this.night;
    s.deep.value.set(theme.lagoon).lerp(c.zenith, .25 * (1 - this.night));
    if (st.water) s.deep.value.copy(st.water).lerp(c.zenith, .15 * (1 - this.night));
    const dusk = Math.max(this.night, 1 - Math.min(1, Math.abs(this.sunDir.y) / .25));
    this.moteMaterial.uniforms.time.value = this.elapsed;
    this.moteMaterial.uniforms.center.value.copy(player);
    this.moteMaterial.uniforms.strength.value = Math.max(.55 + dusk * .7, st.snow * 1.3);
    this.moteMaterial.uniforms.snow.value = st.snow;
    this.moteMaterial.uniforms.day.value = (1 - this.night) * (1 - st.snow);
  }
}
